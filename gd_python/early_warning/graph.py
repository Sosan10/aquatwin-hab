"""Grafo LangGraph Fase 3: pronóstico híbrido, ensemble e incertidumbre.

Flujo:
    START → ingest → validate_quality
      ├─ insuficiente → publish_degraded → END
      └─ aceptable → align → assimilate
          ├─ run_physics_model ─┐
          └─ run_ml_model ──────┤
                                ▼
                        build_ensemble → estimate_uncertainty
                            → classify_risk → publish_result → END
"""

from __future__ import annotations

import operator
from datetime import datetime, timezone
from typing import Annotated, Literal, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from .adapters import synthetic_observations
from .alignment import align_to_hourly_slots, fuse_measurements
from .assimilation import assimilate, generate_recommendations
from .ensemble import (
    build_ensemble as _build_ensemble,
    classify_risk as _classify_risk,
    estimate_uncertainty as _estimate_uncertainty,
)
from .forecast_models import SyntheticMLModel, SyntheticPhysicsModel
from .schemas import Observation, RiskLevel, new_run_id
from .validators import (
    DEFAULT_MAX_AGE_HOURS,
    find_duplicates,
    validate_observation,
)

REQUIRED_SOURCES = {"buoy", "meteorology", "sentinel3"}

# Instancias de modelos (singleton para la vida del proceso)
def _load_models() -> tuple:
    """Fase 6: usa el modelo ML entrenado y el físico calibrado si existen
    artefactos; si no, los sintéticos de la Fase 3. `OAPAT_MODELS=synthetic`
    fuerza los sintéticos (útil en pruebas). Se decide al arrancar y queda en
    model_versions de cada corrida, así que siempre se sabe cuál actuó."""
    import os
    if os.environ.get("OAPAT_MODELS", "auto").lower() == "synthetic":
        return SyntheticPhysicsModel(), SyntheticMLModel()
    try:
        from .training import CalibratedPhysicsModel, TrainedMLModel, load_artifact
        basin = os.environ.get("OAPAT_MODEL_BASIN", "basin-san-roque")
        horizon = int(os.environ.get("OAPAT_MODEL_HORIZON", "7"))
        art = load_artifact(basin, horizon)
        if art:
            return CalibratedPhysicsModel(version=f"v1.default"), TrainedMLModel(art)
    except Exception:  # sin numpy/sklearn o artefacto corrupto → sintéticos
        pass
    return SyntheticPhysicsModel(), SyntheticMLModel()


_physics_model, _ml_model = _load_models()


def _model_versions() -> dict[str, str]:
    """Versiones que actuaron en la corrida. Disponible también en pending_approval:
    quien aprueba tiene que saber qué modelos produjeron el pronóstico."""
    return {
        "orchestrator": "phase-6",
        "physics": f"{_physics_model.model_id}@{_physics_model.model_version}",
        "ml": f"{_ml_model.model_id}@{_ml_model.model_version}",
        "ensemble": "weighted-dynamic-v1",
        "assimilation": "explicit-correction-v1",
    }


def reload_models() -> dict[str, str]:
    """Recarga los modelos tras un entrenamiento (POST /models/train)."""
    global _physics_model, _ml_model
    _physics_model, _ml_model = _load_models()
    return {"physics": f"{_physics_model.model_id}@{_physics_model.model_version}",
            "ml": f"{_ml_model.model_id}@{_ml_model.model_version}"}


# ---------------------------------------------------------------------------
# Estado tipado
# ---------------------------------------------------------------------------

class EarlyWarningState(TypedDict, total=False):
    run_id: str
    basin_id: str
    horizon_days: int
    requested_at: str
    input_observations: list[dict] | None
    observations: list[dict]
    quality_report: dict
    source_summary: dict[str, int]
    # Fase 2
    validation_details: list[dict]
    aligned_dataset: dict
    alignment_report: dict
    assimilation_state: dict
    assimilation_report: dict
    recommendations: list[str]
    # Fase 3
    physics_forecast: dict | None
    ml_forecast: dict | None
    ensemble_forecast: dict | None
    risk_assessment: dict | None
    # Fase 5 — aprobación humana
    requires_approval: bool
    approval: dict | None
    # Fase 6 — procedencia de fuentes
    source_status: list[dict]
    # Resultado
    status: str
    data_quality: str
    risk: str
    bloom_probability: float
    forecast: dict | None
    uncertainty: dict | None
    drivers: list[str]
    model_versions: dict[str, str]
    # Annotated con reducer para soportar escritura concurrente en fan-out
    audit_log: Annotated[list[dict], operator.add]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _audit(node: str, message: str) -> list[dict]:
    """Retorna una lista con una sola entrada de auditoría.

    Se usa operator.add como reducer, así que cada nodo solo emite su propia
    entrada y LangGraph las acumula automáticamente.
    """
    return [{"node": node, "message": message,
             "at": datetime.now(timezone.utc).isoformat()}]


# ---------------------------------------------------------------------------
# Nodo 1: Ingesta
# ---------------------------------------------------------------------------

def ingest_observations(state: EarlyWarningState) -> dict:
    raw = state.get("input_observations")
    if raw is not None:
        observations, fuentes = raw, [{"name": "request_body", "configured": True, "verified": True,
                                       "active": True, "mode": "explicit", "reason": "Observaciones enviadas en la petición."}]
    else:
        # Fase 6: registro de fuentes con estado explícito (sintético / dataset / live)
        from .sources import REGISTRY
        obs, fuentes = REGISTRY.collect(state["basin_id"])
        observations = [item.model_dump(mode="json") for item in obs]
    activas = [f["name"] for f in fuentes if f.get("active")]
    return {"observations": observations,
            "source_status": fuentes,
            "audit_log": _audit("ingest_observations",
                                f"Se recibieron {len(observations)} observaciones de {activas}.")}


# ---------------------------------------------------------------------------
# Nodo 2: Calidad robusta (Fase 2)
# ---------------------------------------------------------------------------

def validate_quality(state: EarlyWarningState) -> dict:
    now = datetime.now(timezone.utc)
    observations = state["observations"]

    unique_obs, duplicates = find_duplicates(observations)

    validation_details: list[dict] = []
    accepted_items: list[dict] = []
    rejected_items: list[dict] = []
    sources: dict[str, int] = {}

    for obs in unique_obs:
        detail = validate_observation(obs, now=now)
        validation_details.append(detail)
        if detail["accepted"]:
            accepted_items.append(detail)
            src = obs["source"]
            sources[src] = sources.get(src, 0) + 1
        else:
            rejected_items.append({
                "source": obs.get("source", "unknown"),
                "issues": detail["issues"],
            })

    missing_sources = sorted(REQUIRED_SOURCES - set(sources))
    acceptable = bool(accepted_items) and "buoy" in sources

    report = {
        "accepted": len(accepted_items),
        "rejected": rejected_items,
        "duplicates_removed": len(duplicates),
        "missing_sources": missing_sources,
        "maximum_age_hours": DEFAULT_MAX_AGE_HOURS,
        "acceptable": acceptable,
    }

    msg = (
        f"Calidad aceptable. {len(accepted_items)} aceptadas, "
        f"{len(rejected_items)} rechazadas, {len(duplicates)} duplicados."
        if acceptable else
        f"Calidad insuficiente. {len(accepted_items)} aceptadas, "
        f"{len(rejected_items)} rechazadas, {len(duplicates)} duplicados. "
        "Resultado degradado."
    )

    accepted_obs = [item["original"] for item in accepted_items]

    return {
        "observations": accepted_obs,
        "quality_report": report,
        "source_summary": sources,
        "validation_details": validation_details,
        "audit_log": _audit("validate_quality", msg),
    }


def route_after_quality(state: EarlyWarningState) -> Literal["publish_degraded", "align_spatiotemporal"]:
    return "align_spatiotemporal" if state["quality_report"]["acceptable"] else "publish_degraded"


# ---------------------------------------------------------------------------
# Nodo 3: Alineación espacio-temporal (Fase 2)
# ---------------------------------------------------------------------------

def align_spatiotemporal(state: EarlyWarningState) -> dict:
    accepted_items = [d for d in state.get("validation_details", []) if d.get("accepted")]

    slot_result = align_to_hourly_slots(accepted_items)
    fusion_result = fuse_measurements(accepted_items)

    aligned_dataset = {
        "fused_measurements": fusion_result["fused_measurements"],
        "fused_units": fusion_result["fused_units"],
        "sources_used": fusion_result["sources_used"],
        "global_quality_score": fusion_result["quality_score"],
    }

    alignment_report = {
        "time_range": slot_result["time_range"],
        "total_slots": slot_result["total_slots"],
        "covered_slots": slot_result["covered_slots"],
        "gap_slots": slot_result["gap_slots"],
        "variables_fused": list(fusion_result["fused_measurements"].keys()),
    }

    msg = (
        f"Alineación completada: {slot_result['covered_slots']}/{slot_result['total_slots']} "
        f"slots cubiertos, {len(fusion_result['fused_measurements'])} variables fusionadas."
    )

    return {
        "aligned_dataset": aligned_dataset,
        "alignment_report": alignment_report,
        "audit_log": _audit("align_spatiotemporal", msg),
    }


# ---------------------------------------------------------------------------
# Nodo 4: Asimilación básica (Fase 2)
# ---------------------------------------------------------------------------

def assimilate_state(state: EarlyWarningState) -> dict:
    aligned = state.get("aligned_dataset", {})
    fused = aligned.get("fused_measurements", {})
    quality_score = aligned.get("global_quality_score", 0.5)

    result = assimilate(fused, quality_score)

    msg = (
        f"Asimilación completada. Confianza: {result['confidence']:.2f}. "
        f"{len(result['corrections'])} variables corregidas."
    )

    return {
        "assimilation_state": result["posterior_state"],
        "assimilation_report": {
            "prior_state": result["prior_state"],
            "corrections": result["corrections"],
            "confidence": result["confidence"],
            "gain_used": result["gain_used"],
            "quality_score_used": result["quality_score_used"],
        },
        "audit_log": _audit("assimilate_state", msg),
    }


# ---------------------------------------------------------------------------
# Nodo 5: Pronóstico físico (Fase 3)
# ---------------------------------------------------------------------------

def run_physics_model(state: EarlyWarningState) -> dict:
    posterior = state.get("assimilation_state", {})
    horizon = state.get("horizon_days", 7)

    forecast = _physics_model.forecast(posterior, horizon)

    msg = (
        f"Modelo físico ejecutado: chl_a={forecast['chlorophyll_a']:.1f}, "
        f"bloom_prob={forecast['bloom_probability']:.3f}"
    )

    return {
        "physics_forecast": forecast,
        "audit_log": _audit("run_physics_model", msg),
    }


# ---------------------------------------------------------------------------
# Nodo 6: Pronóstico ML (Fase 3)
# ---------------------------------------------------------------------------

def run_ml_model(state: EarlyWarningState) -> dict:
    posterior = state.get("assimilation_state", {})
    horizon = state.get("horizon_days", 7)

    forecast = _ml_model.forecast(posterior, horizon)

    msg = (
        f"Modelo ML ejecutado: chl_a={forecast['chlorophyll_a']:.1f}, "
        f"bloom_prob={forecast['bloom_probability']:.3f}"
    )

    return {
        "ml_forecast": forecast,
        "audit_log": _audit("run_ml_model", msg),
    }


# ---------------------------------------------------------------------------
# Nodo 7: Ensemble (Fase 3)
# ---------------------------------------------------------------------------

def build_ensemble_node(state: EarlyWarningState) -> dict:
    physics = state.get("physics_forecast", {})
    ml = state.get("ml_forecast", {})
    quality_score = state.get("aligned_dataset", {}).get("global_quality_score", 0.8)

    result = _build_ensemble(physics, ml, quality_score)

    msg = (
        f"Ensemble construido (pesos: physics={result['effective_weights']['physics']:.2f}, "
        f"ml={result['effective_weights']['ml']:.2f}). "
        f"chl_a={result['ensemble_values'].get('chlorophyll_a', 0):.1f}"
    )

    return {
        "ensemble_forecast": result,
        "audit_log": _audit("build_ensemble", msg),
    }


# ---------------------------------------------------------------------------
# Nodo 8: Incertidumbre (Fase 3)
# ---------------------------------------------------------------------------

def estimate_uncertainty_node(state: EarlyWarningState) -> dict:
    ensemble = state.get("ensemble_forecast", {})
    quality_score = state.get("aligned_dataset", {}).get("global_quality_score", 0.8)
    alignment = state.get("alignment_report", {})
    quality_report = state.get("quality_report", {})

    result = _estimate_uncertainty(
        ensemble,
        quality_score=quality_score,
        gap_slots=alignment.get("gap_slots", 0),
        total_slots=alignment.get("total_slots", 1),
        missing_sources=quality_report.get("missing_sources", []),
    )

    msg = (
        f"Incertidumbre estimada. Confianza global: {result['confidence']:.3f}, "
        f"acuerdo inter-modelo: {result['agreement']:.3f}"
    )

    return {
        "uncertainty": result,
        "audit_log": _audit("estimate_uncertainty", msg),
    }


# ---------------------------------------------------------------------------
# Nodo 9: Clasificación de riesgo (Fase 3)
# ---------------------------------------------------------------------------

def classify_risk_node(state: EarlyWarningState) -> dict:
    ensemble = state.get("ensemble_forecast", {})
    ensemble_values = ensemble.get("ensemble_values", {})
    uncertainty = state.get("uncertainty", {})
    posterior = state.get("assimilation_state", {})

    result = _classify_risk(ensemble_values, uncertainty, posterior)

    # Generar recomendaciones enriquecidas con pronóstico
    recommendations = generate_recommendations(
        posterior,
        state.get("aligned_dataset", {}).get("global_quality_score", 0.5),
        "acceptable",
    )

    # Añadir recomendaciones basadas en el nivel de riesgo
    level = result["level"]
    if level == "CRITICAL":
        recommendations.insert(0,
            "⚠️ RIESGO CRÍTICO: probabilidad de bloom muy alta. "
            "Se recomienda activar protocolo de emergencia y notificar autoridades."
        )
    elif level == "ALERT":
        recommendations.insert(0,
            "⚠️ ALERTA: probabilidad de bloom elevada. "
            "Intensificar monitoreo y preparar medidas preventivas."
        )
    elif level == "PREVENTIVE":
        recommendations.insert(0,
            "Nivel preventivo: mantener vigilancia reforzada."
        )

    msg = (
        f"Riesgo clasificado: {level} "
        f"(bloom_prob={result['bloom_probability']:.3f}, "
        f"upper={result['bloom_probability_upper']:.3f}). "
        f"{len(result['drivers'])} impulsores identificados."
    )

    return {
        "risk_assessment": result,
        "recommendations": recommendations,
        "audit_log": _audit("classify_risk", msg),
    }


# ---------------------------------------------------------------------------
# Nodo 10: Publicación del resultado (Fase 3)
# ---------------------------------------------------------------------------

def publish_result(state: EarlyWarningState) -> dict:
    ensemble = state.get("ensemble_forecast", {})
    ensemble_values = ensemble.get("ensemble_values", {})
    risk = state.get("risk_assessment", {})
    uncertainty = state.get("uncertainty", {})

    level = risk.get("level", "NORMAL")
    bloom_prob = risk.get("bloom_probability", 0.0)

    # Mapear nivel a RiskLevel
    risk_level = getattr(RiskLevel, level, RiskLevel.NORMAL).value

    forecast = {
        "kind": "hybrid_ensemble_phase3",
        "horizon_days": state["horizon_days"],
        "ensemble": ensemble_values,
        "physics": ensemble.get("physics_values", {}),
        "ml": ensemble.get("ml_values", {}),
        "effective_weights": ensemble.get("effective_weights", {}),
    }

    msg = (
        f"Resultado Phase 3 publicado. Riesgo: {level}, "
        f"bloom_prob: {bloom_prob:.3f}, confianza: {uncertainty.get('confidence', 0):.3f}"
    )

    approval = state.get("approval")
    if approval:
        msg += (
            f". Decisión humana: {approval.get('decision')} por "
            f"{approval.get('user_name')} ({approval.get('user_role')})"
        )

    return {
        "status": "completed",
        "data_quality": "acceptable",
        "risk": risk_level,
        "bloom_probability": round(bloom_prob, 4),
        "forecast": forecast,
        "requires_approval": state.get("requires_approval", False),
        "approval": approval,
        "drivers": risk.get("drivers", []),
        "model_versions": _model_versions(),
        "audit_log": _audit("publish_result", msg),
    }


# ---------------------------------------------------------------------------
# Nodo: Publicación degradada
# ---------------------------------------------------------------------------

def publish_degraded(state: EarlyWarningState) -> dict:
    recs = [
        "La calidad de datos es insuficiente; el resultado no debe "
        "usarse para decisiones operativas."
    ]
    quality_report = state.get("quality_report", {})
    rejected = quality_report.get("rejected", [])
    if rejected:
        issues_summary = "; ".join(
            f"{r['source']}: {', '.join(r['issues'])}" for r in rejected[:3]
        )
        recs.append(f"Problemas detectados: {issues_summary}")

    missing = quality_report.get("missing_sources", [])
    if missing:
        recs.append(f"Fuentes faltantes: {', '.join(missing)}")

    return {
        "status": "degraded",
        "data_quality": "insufficient",
        "risk": RiskLevel.DEGRADED.value,
        "bloom_probability": 0.0,
        "forecast": None,
        "uncertainty": None,
        "drivers": [],
        "recommendations": recs,
        "risk_assessment": None,
        "model_versions": {"orchestrator": "phase-3"},
        "assimilation_report": None,
        "audit_log": _audit("publish_degraded",
                            "No se emitió pronóstico por calidad insuficiente."),
    }


# ---------------------------------------------------------------------------
# Construcción del grafo
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Fase 5 — Aprobación humana y trazabilidad
# ---------------------------------------------------------------------------

LEVELS_REQUIRING_APPROVAL = {"ALERT", "CRITICAL"}


def route_after_risk(state: EarlyWarningState) -> Literal["request_human_approval", "publish_result"]:
    """Alerta o crítico → pausa para aprobación humana. Normal/preventivo → publica."""
    level = (state.get("risk_assessment") or {}).get("level", "NORMAL")
    return "request_human_approval" if level in LEVELS_REQUIRING_APPROVAL else "publish_result"


def request_human_approval(state: EarlyWarningState) -> dict:
    """Pausa el grafo con `interrupt()` hasta que una persona autorizada decida.

    El payload de la interrupción es lo que la interfaz muestra al aprobador:
    riesgo, probabilidad, impulsores, recomendaciones, calidad de datos y
    versiones de modelo. Al reanudar con `Command(resume=decision)`, la
    decisión queda registrada en el estado y en el audit_log. La comprobación
    de RBAC se hace en la API antes de reanudar: el grafo solo registra.
    """
    risk = state.get("risk_assessment") or {}
    payload = {
        "run_id": state["run_id"],
        "basin_id": state["basin_id"],
        "risk_level": risk.get("level"),
        "bloom_probability": risk.get("bloom_probability"),
        "drivers": risk.get("drivers", []),
        "recommendations": state.get("recommendations", []),
        "data_quality": state.get("quality_report", {}).get("acceptable"),
        "confidence": (state.get("uncertainty") or {}).get("confidence"),
        "reason": "Nivel de riesgo alto/crítico: las recomendaciones requieren aprobación humana antes de publicarse como accionables.",
    }
    decision = interrupt(payload)

    record = {
        "decision": decision.get("decision"),
        "user_id": decision.get("user_id"),
        "user_name": decision.get("user_name"),
        "user_role": decision.get("user_role"),
        "comment": decision.get("comment", ""),
        "decided_at": datetime.now(timezone.utc).isoformat(),
        "risk_level_at_decision": risk.get("level"),
        "bloom_probability_at_decision": risk.get("bloom_probability"),
        "data_quality_at_decision": state.get("quality_report", {}).get("acceptable"),
    }
    msg = (
        f"Aprobación humana: {record['decision']} por {record['user_name']} "
        f"({record['user_role']}). Comentario: {record['comment'] or '—'}"
    )
    return {
        "requires_approval": True,
        "approval": record,
        "audit_log": _audit("request_human_approval", msg),
    }


def build_graph():
    builder = StateGraph(EarlyWarningState)

    # Nodos
    builder.add_node("ingest_observations", ingest_observations)
    builder.add_node("validate_quality", validate_quality)
    builder.add_node("align_spatiotemporal", align_spatiotemporal)
    builder.add_node("assimilate_state", assimilate_state)
    builder.add_node("run_physics_model", run_physics_model)
    builder.add_node("run_ml_model", run_ml_model)
    builder.add_node("build_ensemble", build_ensemble_node)
    builder.add_node("estimate_uncertainty", estimate_uncertainty_node)
    builder.add_node("classify_risk", classify_risk_node)
    builder.add_node("request_human_approval", request_human_approval)
    builder.add_node("publish_result", publish_result)
    builder.add_node("publish_degraded", publish_degraded)

    # Edges — flujo principal
    builder.add_edge(START, "ingest_observations")
    builder.add_edge("ingest_observations", "validate_quality")
    builder.add_conditional_edges("validate_quality", route_after_quality)

    # Rama aceptable: align → assimilate → fan-out a physics + ML
    builder.add_edge("align_spatiotemporal", "assimilate_state")

    # Fan-out: assimilate → ambos modelos en paralelo
    builder.add_edge("assimilate_state", "run_physics_model")
    builder.add_edge("assimilate_state", "run_ml_model")

    # Fan-in: ambos modelos convergen en ensemble
    builder.add_edge("run_physics_model", "build_ensemble")
    builder.add_edge("run_ml_model", "build_ensemble")

    # Pipeline de evaluación
    builder.add_edge("build_ensemble", "estimate_uncertainty")
    builder.add_edge("estimate_uncertainty", "classify_risk")

    # Fase 5: alerta/crítico pasa por aprobación humana antes de publicarse
    builder.add_conditional_edges("classify_risk", route_after_risk)
    builder.add_edge("request_human_approval", "publish_result")

    # Terminales
    builder.add_edge("publish_result", END)
    builder.add_edge("publish_degraded", END)

    # El checkpointer es lo que permite pausar en interrupt() y reanudar
    # después con Command(resume=...). MemorySaver es suficiente para el MVP
    # local (plan, Fase 0: "archivos locales MVP; PostgreSQL producción").
    return builder.compile(checkpointer=MemorySaver())


GRAPH = build_graph()


def _config_for(run_id: str) -> dict:
    """Cada corrida es un hilo del checkpointer: así se puede reanudar por run_id."""
    return {"configurable": {"thread_id": run_id}}


def _finalize(run_id: str, result: dict) -> dict:
    """Normaliza la salida del grafo, detectando si quedó pausada en interrupt()."""
    state = dict(result)
    state.setdefault("run_id", run_id)
    interrupts = state.pop("__interrupt__", None)
    if interrupts:
        # Pausado en request_human_approval: no hay resultado publicado todavía.
        payload = interrupts[0].value if hasattr(interrupts[0], "value") else interrupts[0]
        risk = state.get("risk_assessment") or {}
        state.update({
            "status": "pending_approval",
            "data_quality": "acceptable",
            "risk": risk.get("level", "NORMAL"),
            "bloom_probability": round(float(risk.get("bloom_probability", 0.0)), 4),
            "requires_approval": True,
            "approval": None,
            "approval_request": payload,
            "drivers": risk.get("drivers", []),
            "forecast": state.get("forecast"),
            "model_versions": state.get("model_versions") or _model_versions(),
            "audit_log": state.get("audit_log", []) + _audit(
                "request_human_approval",
                f"Corrida pausada: riesgo {risk.get('level')} requiere aprobación humana.",
            ),
        })
    return state


def run_early_warning(basin_id: str, horizon_days: int,
                      observations: list[Observation] | None = None) -> dict:
    run_id = new_run_id()
    result = GRAPH.invoke({
        "run_id": run_id,
        "basin_id": basin_id,
        "horizon_days": horizon_days,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "input_observations": (
            [item.model_dump(mode="json") for item in observations]
            if observations is not None else None
        ),
        "audit_log": [],
    }, config=_config_for(run_id))
    return _finalize(run_id, result)


def is_pending_approval(run_id: str) -> bool:
    """True si el hilo de la corrida está detenido en el nodo de aprobación."""
    snapshot = GRAPH.get_state(_config_for(run_id))
    return bool(snapshot and snapshot.next and "request_human_approval" in snapshot.next)


def resume_early_warning(run_id: str, decision: dict) -> dict:
    """Reanuda una corrida pausada con la decisión humana y devuelve el estado final."""
    if not is_pending_approval(run_id):
        raise ValueError(f"La corrida {run_id} no está pendiente de aprobación.")
    result = GRAPH.invoke(Command(resume=decision), config=_config_for(run_id))
    return _finalize(run_id, result)
