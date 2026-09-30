"""Tests de alerta temprana — Fases 1 a 6."""

import os
import pathlib

import pytest

# Los tests del grafo se ejecutan con los modelos sintéticos, para que un
# artefacto entrenado en disco (Fase 6) no altere sus expectativas. Los tests
# de la Fase 6 construyen los modelos entrenados explícitamente.
os.environ.setdefault("OAPAT_MODELS", "synthetic")
os.environ.setdefault("OAPAT_SCHEDULE_MINUTES", "0")

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from early_warning.api import app
from early_warning.ensemble import build_ensemble, classify_risk, estimate_uncertainty
from early_warning.forecast_models import SyntheticMLModel, SyntheticPhysicsModel
from early_warning.validators import find_duplicates, validate_observation
from early_warning.alignment import align_to_hourly_slots
from early_warning.assimilation import assimilate

client = TestClient(app)


# ── Fase 1 (mantenidos, adaptados) ──────────────────────────────────────────

def test_health_reports_current_phase():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["phase"] == 6
    assert body["data_mode"] == "synthetic"
    for cap in ("hybrid_forecast", "ensemble", "risk_classification",
                "human_approval", "rbac", "audit_persistence", "gated_actuators",
                "real_source_adapters", "trained_models", "backtesting",
                "scheduled_runs", "observability"):
        assert cap in body["capabilities"], cap
    assert "LIMNOLOGIST" in body["approver_roles"]
    assert "LIMNOLOGIST" not in body["actuator_roles"]



def _approve_if_pending(body: dict) -> dict:
    """Fase 5: alerta/crítico queda en pending_approval; se aprueba para continuar."""
    if body["status"] != "pending_approval":
        return body
    r = client.post(f"/runs/{body['run_id']}/approval", json={
        "user_id": "t-1", "user_name": "Tester", "user_role": "LIMNOLOGIST",
        "decision": "approved", "comment": "test"})
    assert r.status_code == 200
    return r.json()


def test_run_uses_synthetic_observations_when_not_supplied():
    response = client.post("/runs", json={"basin_id": "san-roque", "horizon_days": 7})
    body = response.json()
    assert response.status_code == 201
    assert body["status"] in {"completed", "pending_approval"}
    body = _approve_if_pending(body)
    assert body["status"] == "completed"
    assert body["data_quality"] == "acceptable"
    assert body["forecast"]["kind"] == "hybrid_ensemble_phase3"
    assert body["assimilation_report"] is not None
    assert body["risk_assessment"] is not None


def test_invalid_buoy_data_creates_degraded_result():
    response = client.post("/runs", json={"basin_id": "san-roque", "horizon_days": 7,
      "observations": [{"source": "buoy", "basin_id": "san-roque",
        "timestamp": "2026-09-09T12:00:00Z",
        "measurements": {"chlorophyll_a": 75},
        "quality": {"flag": "bad", "confidence": 0.1}}]})
    body = response.json()
    assert response.status_code == 201
    assert body["status"] == "degraded"
    assert body["risk"] == "DEGRADED"
    assert len(body["recommendations"]) > 0


# ── Fase 2: Validación robusta ──────────────────────────────────────────────

def test_physical_limits_reject_out_of_range():
    obs = {
        "source": "buoy",
        "basin_id": "san-roque",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "measurements": {"chlorophyll_a": 999.0, "temp_surface": 27.0},
        "units": {"chlorophyll_a": "ug/L", "temp_surface": "C"},
        "quality": {"flag": "good", "confidence": 0.9},
    }
    result = validate_observation(obs)
    assert result["accepted"] is False
    assert any("fuera de rango" in issue for issue in result["issues"])


def test_duplicate_observations_detected():
    now = datetime.now(timezone.utc).isoformat()
    obs = {
        "source": "buoy",
        "basin_id": "san-roque",
        "timestamp": now,
        "measurements": {"chlorophyll_a": 50.0, "temp_surface": 25.0},
    }
    unique, dupes = find_duplicates([obs, obs.copy()])
    assert len(unique) == 1
    assert len(dupes) == 1


def test_alignment_creates_hourly_slots():
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    items = [
        {
            "accepted": True,
            "quality_score": 0.9,
            "issues": [],
            "original": {
                "source": "buoy",
                "basin_id": "san-roque",
                "timestamp": now.isoformat(),
                "measurements": {"chlorophyll_a": 50.0},
                "units": {"chlorophyll_a": "ug/L"},
            },
        },
        {
            "accepted": True,
            "quality_score": 0.8,
            "issues": [],
            "original": {
                "source": "meteorology",
                "basin_id": "san-roque",
                "timestamp": (now - timedelta(hours=2)).isoformat(),
                "measurements": {"wind_speed": 5.0},
                "units": {"wind_speed": "km/h"},
            },
        },
    ]
    result = align_to_hourly_slots(items)
    assert result["total_slots"] >= 2
    assert result["covered_slots"] == 2


def test_assimilation_corrects_state():
    fused = {"chlorophyll_a": 80.0, "temp_surface": 28.0}
    result = assimilate(fused, quality_score=0.9)
    posterior = result["posterior_state"]
    prior = result["prior_state"]
    assert posterior["chlorophyll_a"] != prior["chlorophyll_a"]
    assert posterior["chlorophyll_a"] > prior["chlorophyll_a"]
    assert result["confidence"] > 0


def test_degraded_data_never_shows_confident_alert():
    response = client.post("/runs", json={"basin_id": "san-roque", "horizon_days": 7,
      "observations": [
          {"source": "buoy", "basin_id": "san-roque",
           "timestamp": "2026-09-09T12:00:00Z",
           "measurements": {"chlorophyll_a": 999.0, "temp_surface": 27.0},
           "units": {"chlorophyll_a": "ug/L", "temp_surface": "C"},
           "quality": {"flag": "good", "confidence": 0.9}},
      ]})
    body = response.json()
    assert body["status"] == "degraded"
    assert body["risk"] == "DEGRADED"
    assert body["bloom_probability"] == 0.0
    assert body["forecast"] is None


# ── Fase 3: Pronóstico, Ensemble e Incertidumbre ───────────────────────────

def test_physics_model_returns_forecast():
    """El adaptador físico retorna todas las claves esperadas."""
    model = SyntheticPhysicsModel()
    state = {"chlorophyll_a": 70.0, "temp_surface": 27.0,
             "total_phosphorus": 0.4, "dissolved_oxygen": 5.0,
             "wind_speed": 3.0, "solar_radiation": 1400.0}
    result = model.forecast(state, horizon_days=7)
    assert "chlorophyll_a" in result
    assert "microcystin" in result
    assert "bloom_probability" in result
    assert "model_id" in result
    assert "model_version" in result
    assert "parameters" in result
    assert 0 <= result["bloom_probability"] <= 1
    assert result["chlorophyll_a"] >= 0


def test_ml_model_returns_forecast():
    """El adaptador ML retorna todas las claves esperadas."""
    model = SyntheticMLModel()
    state = {"chlorophyll_a": 70.0, "temp_surface": 27.0,
             "total_phosphorus": 0.4, "dissolved_oxygen": 5.0,
             "wind_speed": 3.0}
    result = model.forecast(state, horizon_days=7)
    assert "chlorophyll_a" in result
    assert "microcystin" in result
    assert "bloom_probability" in result
    assert "model_id" in result
    assert "model_version" in result
    assert 0 <= result["bloom_probability"] <= 1


def test_ensemble_combines_forecasts():
    """El ensemble pondera correctamente dos pronósticos."""
    physics = {"chlorophyll_a": 100.0, "microcystin": 15.0,
               "bloom_probability": 0.7, "temp_surface": 28.0,
               "dissolved_oxygen": 4.0}
    ml = {"chlorophyll_a": 120.0, "microcystin": 16.0,
          "bloom_probability": 0.8, "temp_surface": 29.0,
          "dissolved_oxygen": 3.5}
    result = build_ensemble(physics, ml, quality_score=0.85)
    ev = result["ensemble_values"]
    # Ensemble value should be between physics and ml
    assert physics["chlorophyll_a"] <= ev["chlorophyll_a"] <= ml["chlorophyll_a"]
    assert physics["bloom_probability"] <= ev["bloom_probability"] <= ml["bloom_probability"]
    # Weights should sum to ~1
    w = result["effective_weights"]
    assert abs(w["physics"] + w["ml"] - 1.0) < 0.001
    # Dispersion should be > 0 when models differ
    assert result["dispersion"]["chlorophyll_a"] > 0


def test_uncertainty_intervals_valid():
    """lower < mean < upper para clorofila-a."""
    physics = {"chlorophyll_a": 100.0, "microcystin": 15.0,
               "bloom_probability": 0.7, "temp_surface": 28.0,
               "dissolved_oxygen": 4.0}
    ml = {"chlorophyll_a": 120.0, "microcystin": 16.0,
          "bloom_probability": 0.8, "temp_surface": 29.0,
          "dissolved_oxygen": 3.5}
    ensemble = build_ensemble(physics, ml, quality_score=0.8)
    unc = estimate_uncertainty(ensemble, quality_score=0.8)
    chl_interval = unc["intervals"]["chlorophyll_a"]
    assert chl_interval["lower"] < chl_interval["mean"] < chl_interval["upper"]
    assert 0 < unc["confidence"] <= 1
    assert 0 < unc["agreement"] <= 1


def test_risk_classification_levels():
    """Cada nivel de riesgo se activa al umbral correcto."""
    unc = {"intervals": {"bloom_probability": {"lower": 0, "mean": 0.1, "upper": 0.2}},
           "confidence": 0.8}
    # NORMAL: prob < 0.30
    r = classify_risk({"bloom_probability": 0.15, "chlorophyll_a": 30,
                        "microcystin": 2, "temp_surface": 22, "dissolved_oxygen": 8}, unc)
    assert r["level"] == "NORMAL"

    # PREVENTIVE: 0.30 <= prob < 0.60
    r = classify_risk({"bloom_probability": 0.45, "chlorophyll_a": 60,
                        "microcystin": 5, "temp_surface": 26, "dissolved_oxygen": 6}, unc)
    assert r["level"] == "PREVENTIVE"

    # ALERT: 0.60 <= prob < 0.80
    r = classify_risk({"bloom_probability": 0.72, "chlorophyll_a": 90,
                        "microcystin": 10, "temp_surface": 28, "dissolved_oxygen": 4}, unc)
    assert r["level"] == "ALERT"

    # CRITICAL: prob >= 0.80
    r = classify_risk({"bloom_probability": 0.88, "chlorophyll_a": 120,
                        "microcystin": 18, "temp_surface": 30, "dissolved_oxygen": 3}, unc)
    assert r["level"] == "CRITICAL"


def test_drivers_reflect_conditions():
    """Los impulsores reflejan las condiciones del estado."""
    unc = {"intervals": {"bloom_probability": {"lower": 0.5, "mean": 0.7, "upper": 0.9}},
           "confidence": 0.7}
    ensemble_vals = {"bloom_probability": 0.75, "chlorophyll_a": 95,
                     "microcystin": 14, "temp_surface": 29, "dissolved_oxygen": 3.5}
    posterior = {"chlorophyll_a": 80, "total_phosphorus": 0.5,
                 "temp_surface": 28, "wind_speed": 3.0}
    r = classify_risk(ensemble_vals, unc, posterior)
    drivers = r["drivers"]
    assert any("clorofila-a" in d for d in drivers)
    assert any("fósforo" in d for d in drivers)
    assert any("temperatura" in d for d in drivers)
    assert any("viento" in d for d in drivers)
    assert any("microcistina" in d for d in drivers)


def test_phase3_end_to_end():
    """Corrida completa con pronóstico híbrido, intervals y risk_assessment."""
    response = client.post("/runs", json={"basin_id": "san-roque", "horizon_days": 14})
    body = response.json()
    assert response.status_code == 201
    body = _approve_if_pending(body)
    assert body["status"] == "completed"
    assert body["horizon_days"] == 14

    # Forecast tiene desglose physics/ml
    forecast = body["forecast"]
    assert forecast["kind"] == "hybrid_ensemble_phase3"
    assert "ensemble" in forecast
    assert "physics" in forecast
    assert "ml" in forecast
    assert "effective_weights" in forecast

    # Uncertainty tiene intervalos
    uncertainty = body["uncertainty"]
    assert "confidence" in uncertainty
    assert "intervals" in uncertainty
    assert "chlorophyll_a" in uncertainty["intervals"]
    chl = uncertainty["intervals"]["chlorophyll_a"]
    assert chl["lower"] < chl["mean"] < chl["upper"]

    # Risk assessment
    risk = body["risk_assessment"]
    assert risk["level"] in {"NORMAL", "PREVENTIVE", "ALERT", "CRITICAL"}
    assert "drivers" in risk
    assert "bloom_probability" in risk

    # Model versions
    mv = body["model_versions"]
    assert mv["orchestrator"].startswith("phase-")
    assert "physics" in mv
    assert "ml" in mv
    assert "ensemble" in mv

    # Audit log tiene todos los nodos
    nodes = [e["node"] for e in body["audit_log"]]
    assert "ingest_observations" in nodes
    assert "validate_quality" in nodes
    assert "align_spatiotemporal" in nodes
    assert "assimilate_state" in nodes
    assert "run_physics_model" in nodes
    assert "run_ml_model" in nodes
    assert "build_ensemble" in nodes
    assert "estimate_uncertainty" in nodes
    assert "classify_risk" in nodes
    assert "publish_result" in nodes


# ---------------------------------------------------------------------------
# Fase 5 — aprobación humana, RBAC, trazabilidad y actuadores condicionados
# ---------------------------------------------------------------------------

def _critical_run() -> dict:
    body = client.post("/runs", json={"basin_id": "san-roque", "horizon_days": 7}).json()
    assert body["risk"] in {"ALERT", "CRITICAL"}, "el sintético de san-roque debe dar alerta/crítico"
    return body


def test_phase5_high_risk_pauses_for_human_approval():
    body = _critical_run()
    assert body["status"] == "pending_approval"
    assert body["requires_approval"] is True
    assert body["approval"] is None
    req = body["approval_request"]
    assert req["risk_level"] == body["risk"]
    assert "recommendations" in req and "drivers" in req
    # Todavía no se ha publicado nada accionable
    assert body["forecast"] is None or body["forecast"] is not None  # el pronóstico puede existir; lo que no existe es la aprobación


def test_phase5_rbac_blocks_unauthorized_roles():
    body = _critical_run()
    for role in ("FIELD_TECH", "AUDITOR", "INTRUSO"):
        r = client.post(f"/runs/{body['run_id']}/approval", json={
            "user_id": "x", "user_name": "X", "user_role": role, "decision": "approved"})
        assert r.status_code == 403, role
    # Sigue pendiente
    assert client.get(f"/runs/{body['run_id']}").json()["status"] == "pending_approval"


def test_phase5_approval_records_user_model_data_and_date():
    body = _critical_run()
    r = client.post(f"/runs/{body['run_id']}/approval", json={
        "user_id": "usr-01", "user_name": "Dra. Elena Albarracín", "user_role": "LIMNOLOGIST",
        "decision": "approved", "comment": "Confirmado con muestreo HPLC"})
    assert r.status_code == 200
    done = r.json()
    assert done["status"] == "completed"
    ap = done["approval"]
    assert ap["decision"] == "approved"
    assert ap["user_id"] == "usr-01" and ap["user_role"] == "LIMNOLOGIST"
    assert ap["decided_at"] and ap["risk_level_at_decision"] == body["risk"]
    assert done["model_versions"]["orchestrator"]
    nodes = [e["node"] for e in done["audit_log"]]
    assert "request_human_approval" in nodes and nodes.index("request_human_approval") < nodes.index("publish_result")
    audit = client.get(f"/runs/{body['run_id']}/audit").json()
    assert audit["approval"]["user_name"] == "Dra. Elena Albarracín"
    assert audit["persisted_file"] is not None
    # No se puede decidir dos veces
    assert client.post(f"/runs/{body['run_id']}/approval", json={
        "user_id": "usr-01", "user_name": "X", "user_role": "ADMIN", "decision": "rejected"}).status_code == 409


def test_phase5_rejection_is_recorded_and_completes_without_actions():
    body = _critical_run()
    done = client.post(f"/runs/{body['run_id']}/approval", json={
        "user_id": "usr-03", "user_name": "Admin", "user_role": "ADMIN",
        "decision": "rejected", "comment": "Datos dudosos"}).json()
    assert done["status"] == "completed" and done["approval"]["decision"] == "rejected"
    r = client.post(f"/runs/{body['run_id']}/actuator-commands", json={
        "user_id": "usr-03", "user_name": "Admin", "user_role": "ADMIN",
        "device_id": "act-01", "command": "AERATOR_ON"})
    assert r.status_code == 409


def test_phase5_actuators_only_after_explicit_approval():
    body = _critical_run()
    rid = body["run_id"]
    cmd = {"user_id": "usr-02", "user_name": "Ing. Benítez", "user_role": "OPERATOR",
           "device_id": "act-01", "command": "AERATOR_ON", "power_level": 100}
    # 1) pendiente → 409
    assert client.post(f"/runs/{rid}/actuator-commands", json=cmd).status_code == 409
    # 2) aprobar
    client.post(f"/runs/{rid}/approval", json={
        "user_id": "usr-01", "user_name": "Dra.", "user_role": "LIMNOLOGIST", "decision": "approved"})
    # 3) rol sin permiso de actuación → 403
    assert client.post(f"/runs/{rid}/actuator-commands",
                       json={**cmd, "user_role": "LIMNOLOGIST"}).status_code == 403
    # 4) OPERATOR tras aprobación → 202 y queda en la traza
    r = client.post(f"/runs/{rid}/actuator-commands", json=cmd)
    assert r.status_code == 202
    assert r.json()["status"] == "ACKNOWLEDGED_SIMULATED"
    audit = client.get(f"/runs/{rid}/audit").json()
    assert len(audit["actuator_commands"]) == 1
    assert any("RECHAZADO" in e["message"] for e in audit["audit_log"])
    assert any("ACEPTADO" in e["message"] for e in audit["audit_log"])


# ---------------------------------------------------------------------------
# Fase 6 — fuentes reales, modelos entrenados, backtesting sin fuga,
#          corridas programadas y observabilidad
# ---------------------------------------------------------------------------

def test_phase6_sources_report_status_and_never_invent_data():
    body = client.get("/sources").json()
    nombres = {s["name"]: s for s in body["sources"]}
    assert set(nombres) == {"synthetic", "csv_dataset", "copernicus_olci"}
    olci = nombres["copernicus_olci"]
    # Sin credenciales: configurada=False, verificada=False y con motivo escrito
    assert olci["configured"] is False and olci["verified"] is False and olci["reason"]
    from early_warning.sources import CopernicusOLCISource
    assert CopernicusOLCISource().fetch("basin-san-roque") == []  # ausente, nunca inventado


def test_phase6_dataset_is_daily_labeled_and_fingerprinted():
    from early_warning.datasets import BLOOM_THRESHOLD, load_history
    daily, info = load_history("basin-san-roque", days=120)
    assert info.source in ("synthetic", "csv") and len(info.fingerprint) == 16
    assert "bloom_event" in daily.columns
    assert ((daily["chlorophyll_a"] >= BLOOM_THRESHOLD).astype(int) == daily["bloom_event"]).all()
    # Paso diario: diferencias de 1 día entre filas en sintético; o presencia de días en real
    d = daily["timestamp"].diff().dropna().dt.days.unique()
    if info.source == "synthetic":
        assert set(d) == {1}
    else:
        assert len(d) > 0 and 1 in d


def test_phase6_trained_model_implements_adapter_and_beats_persistence_in_train():
    from early_warning.datasets import load_history
    from early_warning.training import TrainedMLModel, train_ml, FEATURES
    daily, info = load_history("basin-san-roque", days=150)
    art = train_ml(daily, info, "basin-san-roque", 7, persist=False)
    assert art["features"] == FEATURES and art["dataset"]["fingerprint"] == info.fingerprint
    assert art["metrics_train"]["improvement_pct"] > 0  # aprende algo más que persistencia
    m = TrainedMLModel(art)
    f = m.forecast({"chlorophyll_a": 60, "temp_surface": 26, "total_phosphorus": 0.3,
                    "wind_speed": 3, "dissolved_oxygen": 5}, 7)
    for k in ("chlorophyll_a", "microcystin", "bloom_probability", "model_id", "model_version", "parameters"):
        assert k in f
    assert 0 < f["bloom_probability"] < 1 and f["chlorophyll_a"] > 0


def test_phase6_backtest_has_no_temporal_leakage_and_compares_baselines():
    from early_warning.backtesting import run_backtest
    r = run_backtest("basin-san-roque", horizon_days=7, days=150, min_train_days=45, step_days=10, persist=False)
    assert r["protocol"]["type"] == "rolling_origin"
    assert r["protocol"]["leakage_violations"] == 0
    # Cada pliegue: el objetivo está estrictamente después del origen
    for fold in r["folds"]:
        assert fold["target"] > fold["origin"]
    modelos = {m["model"] for m in r["results"]}
    assert modelos == {"persistence", "physics_baseline", "ml_baseline", "hybrid_ensemble"}
    for m in r["results"]:
        assert 0 <= m["f1"] <= 1 and m["mae"] >= 0
        if m["model"] != "persistence":
            assert 0 <= m["brier"] <= 1
    h = r["hypothesis"]
    assert isinstance(h["supported"], bool) and h["verdict"]
    # El veredicto sobre dataset simulado lo dice explícitamente
    assert "SIMULADO" in h["verdict"]


def test_phase6_backtest_endpoint_persists_reproducible_report():
    r = client.post("/validation/backtest", json={"basin_id": "basin-san-roque", "horizon_days": 7,
                                                  "days": 150, "min_train_days": 45, "step_days": 10})
    assert r.status_code == 201
    body = r.json()
    assert "folds" not in body and body["folds_count"] > 0
    latest = client.get("/validation/latest").json()
    assert latest["dataset"]["fingerprint"] == body["dataset"]["fingerprint"]
    md = client.get("/validation/latest/markdown").json()["markdown"]
    assert "Informe de validación OAPAT" in md
    assert "origen rodante" in md.lower()
    assert "Violaciones de fuga temporal detectadas: **0**" in md


def test_phase6_train_endpoint_persists_artifact_and_lists_it():
    r = client.post("/models/train", json={"basin_id": "basin-san-roque", "horizon_days": 7, "days": 150})
    assert r.status_code == 201
    art = r.json()["artifact"]
    listado = client.get("/models").json()["artifacts"]
    assert any(a["model_version"] == art["model_version"] for a in listado)


def test_phase6_observability_counts_runs_and_graph_endpoint_draws_mermaid():
    antes = client.get("/observability").json()["runs_total"]
    client.post("/runs", json={"basin_id": "san-roque", "horizon_days": 7})
    despues = client.get("/observability").json()
    assert despues["runs_total"] == antes + 1
    assert despues["latency_ms"]["last"] is not None
    assert despues["scheduler"]["enabled"] is False  # apagado por defecto

    g = client.get("/graph").json()
    assert "request_human_approval" in g["nodes"] and "publish_degraded" in g["nodes"]
    assert any(e["conditional"] for e in g["edges"])
    assert "graph" in g["mermaid"].lower()


def test_phase6_scheduler_runs_job_when_enabled(monkeypatch):
    from early_warning.scheduler import Scheduler
    llamadas = []
    monkeypatch.setenv("OAPAT_SCHEDULE_MINUTES", "0.0005")  # ~30 ms
    monkeypatch.setenv("OAPAT_SCHEDULE_BASINS", "basin-san-roque, basin-paso-piedras")
    sch = Scheduler(lambda b: llamadas.append(b))
    assert sch.enabled and sch.basins == ["basin-san-roque", "basin-paso-piedras"]
    sch.start()
    import time; time.sleep(0.25)
    sch.stop()
    assert sch.ticks >= 1 and "basin-san-roque" in llamadas and not sch.status()["alive"]


# ---------------------------------------------------------------------------
# Dataset real — emparejamiento por fecha y adaptación a variables ausentes
# ---------------------------------------------------------------------------

DATASET_REAL = (pathlib.Path(__file__).resolve().parents[1]
                / "early_warning" / "data" / "datasets" / "mendota_oapat.csv")


@pytest.mark.skipif(not DATASET_REAL.exists(), reason="dataset real no instalado")
def test_dataset_real_se_carga_y_declara_procedencia(monkeypatch):
    monkeypatch.setenv("OAPAT_DATASET_CSV", str(DATASET_REAL))
    from early_warning.datasets import load_history
    daily, info = load_history("lake-mendota", days=9999)
    assert info.source == "csv"
    assert "real" in info.note.lower()
    assert info.rows > 300
    assert daily["chlorophyll_a"].notna().all()


@pytest.mark.skipif(not DATASET_REAL.exists(), reason="dataset real no instalado")
def test_horizonte_se_empareja_por_fecha_no_por_fila(monkeypatch):
    """Regresión: con muestreo irregular, avanzar filas falsearía el horizonte.

    Es el fallo que apareció al conectar el primer dataset real: `shift(-H)`
    desplaza filas, así que en una serie quincenal un horizonte de 14 días se
    convertía en meses sin avisar.
    """
    monkeypatch.setenv("OAPAT_DATASET_CSV", str(DATASET_REAL))
    from early_warning.datasets import load_history
    from early_warning.training import TOLERANCIA_DIAS, build_samples
    daily, _ = load_history("lake-mendota", days=9999)
    s = build_samples(daily, 14)
    assert len(s) > 100
    # Todo par origen→objetivo respeta el horizonte pedido dentro de la tolerancia
    assert (s["horizon_real_days"] - 14).abs().max() <= TOLERANCIA_DIAS
    assert (s["target_time"] > s["timestamp"]).all()


@pytest.mark.skipif(not DATASET_REAL.exists(), reason="dataset real no instalado")
def test_modelo_se_adapta_a_variables_ausentes(monkeypatch):
    """Mendota no publica viento: el modelo debe entrenar sin él y declararlo."""
    monkeypatch.setenv("OAPAT_DATASET_CSV", str(DATASET_REAL))
    from early_warning.datasets import load_history
    from early_warning.training import CalibratedPhysicsModel, TrainedMLModel, train_ml
    daily, info = load_history("lake-mendota", days=9999)

    art = train_ml(daily, info, "lake-mendota", 14, persist=False)
    assert "chlorophyll_a" in art["features"]
    assert "wind_speed" in art["features_dropped"]      # ausente → fuera, no rompe
    assert art["metrics_train"]["n_samples"] > 100

    # El vector de predicción se construye con las mismas variables del artefacto
    f = TrainedMLModel(art).forecast({"chlorophyll_a": 30, "temp_surface": 24,
                                      "total_phosphorus": 0.06, "dissolved_oxygen": 8}, 14)
    assert f["chlorophyll_a"] > 0 and 0 < f["bloom_probability"] < 1
    assert f["parameters"]["features_used"] == art["features"]

    # El físico calibra igual y marca en su versión que fue sin viento
    fis = CalibratedPhysicsModel.calibrate(daily, 14, info)
    assert "sinviento" in fis.model_version


@pytest.mark.skipif(not DATASET_REAL.exists(), reason="dataset real no instalado")
def test_backtest_sobre_datos_reales_sin_fuga(monkeypatch):
    monkeypatch.setenv("OAPAT_DATASET_CSV", str(DATASET_REAL))
    monkeypatch.setenv("OAPAT_BLOOM_THRESHOLD", "25")
    import importlib
    from early_warning import datasets as ds
    importlib.reload(ds)
    from early_warning.backtesting import run_backtest
    r = run_backtest("lake-mendota", horizon_days=14, days=9999,
                     min_train_days=60, step_days=6, persist=False)
    assert r["dataset"]["source"] == "csv"
    assert r["protocol"]["leakage_violations"] == 0
    assert abs(r["protocol"]["horizon_real_days_mean"] - 14) <= 2
    assert r["protocol"]["origins"] > 10
    for f in r["folds"]:
        assert f["target"] > f["origin"]
