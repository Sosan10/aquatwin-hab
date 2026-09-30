"""API REST del OAPAT — Fase 5: aprobación humana, RBAC y trazabilidad.

Reglas de la fase (plan, sección 10):
- Las corridas con riesgo ALERT/CRITICAL quedan en `pending_approval` hasta que
  una persona con rol autorizado decida.
- Solo los roles de APPROVER_ROLES pueden aprobar o rechazar; solo los de
  ACTUATOR_ROLES pueden enviar comandos a actuadores, y únicamente sobre una
  corrida aprobada.
- Cada decisión y cada comando quedan en el audit_log de la corrida y se
  persisten en disco (`data/audit/<run_id>.json`), con usuario, decisión,
  versiones de modelo, calidad de datos y fecha.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status

from .graph import GRAPH, is_pending_approval, reload_models, resume_early_warning, run_early_warning
from .scheduler import OBS, Scheduler, timed
from .schemas import (ActuatorCommandRequest, ApprovalRequest, BacktestRequest, CrispDmRequest,
                      RunRequest, RunResult, TrainRequest)

RUNS: dict[str, RunResult] = {}


def _scheduled_job(basin_id: str) -> None:
    """Corrida programada (Fase 6): igual que POST /runs pero disparada por el reloj."""
    state = run_early_warning(basin_id, int(__import__("os").environ.get("OAPAT_SCHEDULE_HORIZON", "7")))
    result = _to_result(state)
    RUNS[result.run_id] = result
    if result.status == "pending_approval":
        OBS.pending_approvals += 1


SCHEDULER = Scheduler(_scheduled_job)


@asynccontextmanager
async def lifespan(_: FastAPI):
    SCHEDULER.start()
    yield
    SCHEDULER.stop()


app = FastAPI(title="AquaTwin OAPAT", version="0.6.0", lifespan=lifespan,
              description="Alerta temprana con pronóstico híbrido, aprobación humana, trazabilidad, "
                          "modelos entrenados, backtesting y observabilidad.")

# RBAC — roles del gemelo (src/types.ts: ADMIN | LIMNOLOGIST | OPERATOR | FIELD_TECH | AUDITOR).
# AUDITOR es de solo lectura; FIELD_TECH no aprueba ni acciona.
APPROVER_ROLES = {"ADMIN", "LIMNOLOGIST", "OPERATOR"}
ACTUATOR_ROLES = {"ADMIN", "OPERATOR"}

AUDIT_DIR = Path(__file__).resolve().parent / "data" / "audit"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_result(state: dict) -> RunResult:
    return RunResult(
        run_id=state["run_id"], basin_id=state["basin_id"],
        generated_at=state["requested_at"], horizon_days=state["horizon_days"],
        status=state["status"], data_quality=state["data_quality"], risk=state["risk"],
        bloom_probability=state["bloom_probability"], quality_report=state["quality_report"],
        source_summary=state["source_summary"], audit_log=state["audit_log"],
        forecast=state.get("forecast"), uncertainty=state.get("uncertainty"),
        drivers=state.get("drivers", []),
        model_versions=state.get("model_versions", {}),
        recommendations=state.get("recommendations", []),
        assimilation_report=state.get("assimilation_report"),
        risk_assessment=state.get("risk_assessment"),
        requires_approval=state.get("requires_approval", False),
        approval=state.get("approval"),
        approval_request=state.get("approval_request"),
        actuator_commands=state.get("actuator_commands", []),
        source_status=state.get("source_status", []),
    )


def _persist_audit(result: RunResult) -> Path:
    """Evidencia auditable en disco: quién decidió, sobre qué datos, con qué modelos y cuándo."""
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    path = AUDIT_DIR / f"{result.run_id}.json"
    evidence = {
        "run_id": result.run_id,
        "basin_id": result.basin_id,
        "generated_at": result.generated_at.isoformat(),
        "status": result.status,
        "risk": result.risk,
        "bloom_probability": result.bloom_probability,
        "data_quality": result.data_quality,
        "quality_report": result.quality_report,
        "model_versions": result.model_versions,
        "approval": result.approval,
        "actuator_commands": result.actuator_commands,
        "audit_log": result.audit_log,
        "persisted_at": _now(),
    }
    path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return path


def _require(run_id: str) -> RunResult:
    if run_id not in RUNS:
        raise HTTPException(status_code=404, detail="Corrida no encontrada")
    return RUNS[run_id]


@app.get("/health")
def health() -> dict:
    from .sources import REGISTRY
    from .graph import _ml_model, _physics_model
    return {"status": "ok", "service": "AquaTwin OAPAT", "phase": 6,
            "data_mode": REGISTRY.mode,
            "models": {"physics": f"{_physics_model.model_id}@{_physics_model.model_version}",
                       "ml": f"{_ml_model.model_id}@{_ml_model.model_version}"},
            "capabilities": ["quality_validation", "spatiotemporal_alignment",
                             "basic_assimilation", "hybrid_forecast",
                             "ensemble", "uncertainty_estimation",
                             "risk_classification", "human_approval",
                             "rbac", "audit_persistence", "gated_actuators",
                             "real_source_adapters", "trained_models", "backtesting",
                             "scheduled_runs", "observability"],
            "approver_roles": sorted(APPROVER_ROLES),
            "actuator_roles": sorted(ACTUATOR_ROLES),
            "scheduler": SCHEDULER.status()}


@app.post("/runs", response_model=RunResult, status_code=status.HTTP_201_CREATED)
def create_run(request: RunRequest) -> RunResult:
    state = timed(run_early_warning, request.basin_id, request.horizon_days, request.observations,
                  context={"basin_id": request.basin_id, "trigger": "api"})
    result = _to_result(state)
    RUNS[result.run_id] = result
    return result


# ---------------------------------------------------------------------------
# Fase 6 — fuentes, modelos, validación, observabilidad, grafo
# ---------------------------------------------------------------------------

@app.get("/sources")
def get_sources() -> dict:
    """Estado de cada fuente: configurada, verificada, activa y por qué."""
    from .sources import REGISTRY
    return {"mode": REGISTRY.mode, "sources": REGISTRY.statuses(),
            "note": "Una fuente no verificada nunca inventa observaciones: se declara ausente."}


@app.get("/models")
def get_models() -> dict:
    from .training import list_artifacts
    from .graph import _ml_model, _physics_model
    return {"active": {"physics": f"{_physics_model.model_id}@{_physics_model.model_version}",
                       "ml": f"{_ml_model.model_id}@{_ml_model.model_version}"},
            "artifacts": list_artifacts()}


@app.post("/models/train", status_code=status.HTTP_201_CREATED)
def train_models(request: TrainRequest) -> dict:
    """Entrena y persiste el modelo ML (ridge + logística) y lo activa en el grafo."""
    from .datasets import load_history
    from .training import train_ml
    daily, info = load_history(request.basin_id, days=request.days)
    try:
        art = train_ml(daily, info, request.basin_id, request.horizon_days, persist=True)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    activos = reload_models()
    return {"artifact": {k: art[k] for k in ("model_id", "model_version", "horizon_days", "metrics_train", "trained_at")},
            "dataset": art["dataset"], "active_models": activos}


@app.post("/validation/backtest", status_code=status.HTTP_201_CREATED)
def run_validation(request: BacktestRequest) -> dict:
    """Backtesting de origen rodante sin fuga; compara persistencia, físico, ML e híbrido."""
    from .backtesting import run_backtest
    try:
        informe = timed(run_backtest, request.basin_id, request.horizon_days, request.days,
                        request.min_train_days, request.step_days,
                        context={"basin_id": request.basin_id, "trigger": "backtest"})
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    informe_sin_folds = {k: v for k, v in informe.items() if k != "folds"}
    return informe_sin_folds | {"folds_count": len(informe["folds"])}


@app.get("/validation/latest")
def get_validation() -> dict:
    from .backtesting import latest_report
    r = latest_report()
    if not r:
        raise HTTPException(status_code=404, detail="No hay informe de validación. Ejecuta POST /validation/backtest.")
    return {k: v for k, v in r.items() if k != "folds"} | {"folds_count": len(r.get("folds", []))}


@app.get("/validation/latest/markdown")
def get_validation_markdown() -> dict:
    from .backtesting import latest_report, to_markdown
    r = latest_report()
    if not r:
        raise HTTPException(status_code=404, detail="No hay informe de validación.")
    return {"markdown": to_markdown(r)}


@app.post("/crispdm/run", status_code=status.HTTP_201_CREATED)
def run_crispdm(request: CrispDmRequest) -> dict:
    """Ejecuta el ciclo CRISP-DM completo sobre el dataset configurado.

    Es una operacion cara —validacion cruzada anidada, bootstrap estacionario y
    permutacion—, del orden de minutos. La interfaz lee normalmente el informe
    cacheado con GET /crispdm/latest y solo lanza este cuando hay que
    regenerarlo (dataset nuevo, umbral distinto, otro horizonte).
    """
    from .crispdm import ejecutar
    try:
        return timed(ejecutar, request.basin_id, tuple(request.horizontes), True,
                     context={"basin_id": request.basin_id, "trigger": "crispdm"})
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/crispdm/latest")
def get_crispdm() -> dict:
    """Ultimo informe CRISP-DM generado, tal cual quedo en disco."""
    from .crispdm import ultimo_informe
    r = ultimo_informe()
    if not r:
        raise HTTPException(status_code=404,
                            detail="No hay informe CRISP-DM. Ejecuta POST /crispdm/run.")
    return r


@app.get("/observability")
def get_observability() -> dict:
    return OBS.snapshot(SCHEDULER)


@app.get("/graph")
def get_graph() -> dict:
    """Diagrama Mermaid del grafo LangGraph, generado por el propio grafo."""
    g = GRAPH.get_graph()
    return {"mermaid": g.draw_mermaid(),
            "nodes": list(g.nodes.keys()),
            "edges": [{"source": e.source, "target": e.target, "conditional": bool(e.conditional)} for e in g.edges]}


@app.get("/runs/{run_id}", response_model=RunResult)
def get_run(run_id: str) -> RunResult:
    return _require(run_id)


@app.post("/runs/{run_id}/approval", response_model=RunResult)
def decide_run(run_id: str, request: ApprovalRequest) -> RunResult:
    """Aprueba o rechaza una corrida pausada. Verifica RBAC antes de reanudar el grafo."""
    current = _require(run_id)
    if current.status != "pending_approval" or not is_pending_approval(run_id):
        raise HTTPException(status_code=409, detail="La corrida no está pendiente de aprobación")
    if request.user_role not in APPROVER_ROLES:
        raise HTTPException(
            status_code=403,
            detail=f"El rol {request.user_role} no puede aprobar. Roles autorizados: {sorted(APPROVER_ROLES)}",
        )

    state = resume_early_warning(run_id, request.model_dump())
    result = _to_result(state)
    RUNS[run_id] = result
    _persist_audit(result)
    return result


@app.get("/runs/{run_id}/audit")
def get_audit(run_id: str) -> dict:
    """Traza completa: decisión, usuario, modelos, calidad de datos, comandos y fechas."""
    result = _require(run_id)
    path = AUDIT_DIR / f"{run_id}.json"
    return {
        "run_id": run_id,
        "status": result.status,
        "approval": result.approval,
        "model_versions": result.model_versions,
        "data_quality": result.data_quality,
        "quality_report": result.quality_report,
        "actuator_commands": result.actuator_commands,
        "audit_log": result.audit_log,
        "persisted_file": str(path) if path.exists() else None,
    }


@app.post("/runs/{run_id}/actuator-commands", status_code=status.HTTP_202_ACCEPTED)
def dispatch_actuator(run_id: str, request: ActuatorCommandRequest) -> dict:
    """Comando a actuador **solo** tras aprobación explícita y con rol habilitado.

    Es una simulación (no hay hardware): lo que importa es la puerta. Sin
    aprobación → 409; rol sin permiso → 403. Todo intento, aceptado o no,
    queda en el audit_log.
    """
    result = _require(run_id)
    intento = {
        "at": _now(), "user_id": request.user_id, "user_name": request.user_name,
        "user_role": request.user_role, "device_id": request.device_id,
        "command": request.command, "power_level": request.power_level,
    }

    def _rechazar(code: int, motivo: str):
        result.audit_log.append({"node": "dispatch_actuator", "at": _now(),
                                 "message": f"RECHAZADO ({motivo}): {request.command} → {request.device_id} por {request.user_name} ({request.user_role})"})
        _persist_audit(result)
        raise HTTPException(status_code=code, detail=motivo)

    if result.status == "pending_approval":
        _rechazar(409, "La corrida está pendiente de aprobación humana")
    if not result.approval or result.approval.get("decision") != "approved":
        _rechazar(409, "La corrida no fue aprobada: no se pueden enviar comandos a actuadores")
    if request.user_role not in ACTUATOR_ROLES:
        _rechazar(403, f"El rol {request.user_role} no puede accionar actuadores. Roles autorizados: {sorted(ACTUATOR_ROLES)}")

    ack = {**intento, "status": "ACKNOWLEDGED_SIMULATED", "approved_by": result.approval.get("user_name"),
           "approval_decided_at": result.approval.get("decided_at")}
    result.actuator_commands.append(ack)
    result.audit_log.append({"node": "dispatch_actuator", "at": _now(),
                             "message": f"ACEPTADO: {request.command} → {request.device_id} por {request.user_name} ({request.user_role}), "
                                        f"amparado en la aprobación de {ack['approved_by']}"})
    _persist_audit(result)
    return ack
