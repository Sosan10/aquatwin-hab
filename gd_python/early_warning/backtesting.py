"""Fase 6 — Backtesting temporal sin fuga y comparación de baselines.

Validación de **origen rodante** (rolling origin): para cada origen t_k, los
modelos se entrenan/calibran **solo con datos anteriores a t_k** y se evalúan
sobre el valor observado en t_k + H. Nunca hay una observación posterior al
origen en el entrenamiento — es la única forma honesta de estimar cómo se
comportará el sistema en operación. Un test automático lo verifica.

Se comparan cuatro pronosticadores sobre los mismos orígenes:

- **Persistencia** — «dentro de H días habrá lo mismo que hoy». Referente mínimo.
- **Baseline físico** — ``CalibratedPhysicsModel`` calibrado con el pasado.
- **Baseline ML** — ``TrainedMLModel`` entrenado con el pasado.
- **Ensemble híbrido** — ``build_ensemble`` + ``estimate_uncertainty`` de la Fase 3,
  exactamente el mismo código que corre en producción.

Métricas (plan, sección 11): F1, precisión y recall del evento de floración;
RMSE y MAE de clorofila-a; Brier score de la probabilidad (frente a
climatología); cobertura de intervalos; y porcentaje de datos válidos.

El informe se guarda en ``data/validation/`` como JSON y Markdown, con la
huella del dataset: es reproducible.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .datasets import BLOOM_THRESHOLD, DatasetInfo, load_history
from .ensemble import build_ensemble, estimate_uncertainty
from .training import (TOLERANCIA_DIAS, CalibratedPhysicsModel, TrainedMLModel,
                       build_samples, train_ml)

VALIDATION_DIR = Path(__file__).resolve().parent / "data" / "validation"
F1_TARGET = 0.80  # plan, sección 11


# ---------------------------------------------------------------------------
# Métricas
# ---------------------------------------------------------------------------

def _classification(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    tp = int(((y_true == 1) & (y_pred == 1)).sum())
    fp = int(((y_true == 0) & (y_pred == 1)).sum())
    fn = int(((y_true == 1) & (y_pred == 0)).sum())
    tn = int(((y_true == 0) & (y_pred == 0)).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"f1": round(f1, 4), "precision": round(precision, 4), "recall": round(recall, 4),
            "tp": tp, "fp": fp, "fn": fn, "tn": tn}


def _regression(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    err = y_pred - y_true
    return {"rmse": round(float(np.sqrt(np.mean(err ** 2))), 4),
            "mae": round(float(np.mean(np.abs(err))), 4)}


def _brier(y_true: np.ndarray, prob: np.ndarray) -> float:
    return round(float(np.mean((prob - y_true) ** 2)), 4)


# ---------------------------------------------------------------------------
# Backtest
# ---------------------------------------------------------------------------

def run_backtest(basin_id: str, horizon_days: int = 7, days: int = 365,
                 min_train_days: int = 90, step_days: int = 5, seed: int = 42,
                 persist: bool = True) -> dict[str, Any]:
    daily, info = load_history(basin_id, days=days, seed=seed)
    daily = daily.reset_index(drop=True)
    n = len(daily)
    if n < min_train_days + horizon_days + 10:
        raise ValueError(f"Histórico insuficiente: {n} días; se necesitan ≥ {min_train_days + horizon_days + 10}")

    daily["timestamp"] = pd.to_datetime(daily["timestamp"], utc=True)
    daily = daily.sort_values("timestamp").reset_index(drop=True)

    origenes = list(range(min_train_days, n - horizon_days, step_days))
    filas: list[dict[str, Any]] = []
    fugas_detectadas = 0
    sin_objetivo = 0

    for k in origenes:
        pasado = daily.iloc[:k + 1]           # ≤ origen: lo único visible para entrenar
        origen = daily.iloc[k]

        # --- Objetivo por FECHA, no por posición de fila ---------------------
        # Con una serie diaria contigua da lo mismo; con huecos —y un dataset
        # real siempre los tiene— avanzar `horizon_days` filas convertiría el
        # horizonte de 7 días en semanas sin avisar. Se busca la observación
        # más cercana a origen + horizonte y, si no existe dentro de la
        # tolerancia, el origen se descarta en lugar de falsear el horizonte.
        buscado = origen["timestamp"] + pd.Timedelta(days=horizon_days)
        futuro = daily.iloc[k + 1:]
        if futuro.empty:
            sin_objetivo += 1
            continue
        pos = (futuro["timestamp"] - buscado).abs().idxmin()
        objetivo = daily.loc[pos]
        horizonte_real = (objetivo["timestamp"] - origen["timestamp"]).total_seconds() / 86400
        if abs(horizonte_real - horizon_days) > TOLERANCIA_DIAS:
            sin_objetivo += 1
            continue

        # --- Comprobación explícita de no-fuga -------------------------------
        if pasado["timestamp"].max() > origen["timestamp"]:
            fugas_detectadas += 1

        # --- Modelos entrenados/calibrados solo con el pasado ----------------
        try:
            art = train_ml(pasado, info, basin_id, horizon_days, persist=False)
            ml = TrainedMLModel(art)
        except ValueError:
            continue
        fis = CalibratedPhysicsModel.calibrate(pasado, horizon_days, info)

        estado = {"chlorophyll_a": float(origen["chlorophyll_a"]), "temp_surface": float(origen["temp_surface"]),
                  "total_phosphorus": float(origen["total_phosphorus"]), "total_nitrogen": float(origen["total_nitrogen"]),
                  "wind_speed": float(origen["wind_speed"]), "dissolved_oxygen": float(origen["dissolved_oxygen"])}

        f_fis = fis.forecast(estado, horizon_days)
        f_ml = ml.forecast(estado, horizon_days)
        ens = build_ensemble(f_fis, f_ml, quality_score=0.9)
        unc = estimate_uncertainty(ens, quality_score=0.9)
        ens_vals = ens.get("ensemble_values", {})
        intervalo = (unc.get("intervals") or {}).get("chlorophyll_a", {})

        real = float(objetivo["chlorophyll_a"])
        filas.append({
            "origin": str(origen["timestamp"]), "target": str(objetivo["timestamp"]),
            "horizon_real_days": round(horizonte_real, 2),
            "real_chl": real, "real_event": int(real >= BLOOM_THRESHOLD),
            "persist_chl": float(origen["chlorophyll_a"]),
            "physics_chl": float(f_fis["chlorophyll_a"]), "physics_prob": float(f_fis["bloom_probability"]),
            "ml_chl": float(f_ml["chlorophyll_a"]), "ml_prob": float(f_ml["bloom_probability"]),
            "hybrid_chl": float(ens_vals.get("chlorophyll_a", f_ml["chlorophyll_a"])),
            "hybrid_prob": float(ens_vals.get("bloom_probability", f_ml["bloom_probability"])),
            "hybrid_lower": float(intervalo.get("lower", float("nan"))),
            "hybrid_upper": float(intervalo.get("upper", float("nan"))),
            "hybrid_confidence": float(unc.get("confidence", float("nan"))),
        })

    if not filas:
        # Diagnóstico en vez de fallo mudo: casi siempre el horizonte pedido no
        # es compatible con la cadencia real del dataset. Con muestreo quincenal
        # no se puede pronosticar honestamente a 7 días: no hay observación que
        # caiga en esa ventana, y ensancharla hasta forzarlo convertiría el
        # "pronóstico a 7 días" en uno de horizonte indeterminado.
        cadencia = float(daily["timestamp"].diff().dt.days.median())
        raise ValueError(
            f"No se pudo evaluar ningún origen con horizonte {horizon_days} d. "
            f"La cadencia mediana del dataset es {cadencia:.0f} d y se descartaron "
            f"{sin_objetivo} orígenes por no tener observación a {horizon_days} ± "
            f"{TOLERANCIA_DIAS} d. Use un horizonte múltiplo de la cadencia "
            f"(p. ej. {max(1, round(cadencia)):.0f} o {max(2, round(cadencia * 2)):.0f} d) "
            f"o un dataset de mayor frecuencia."
        )
    df = pd.DataFrame(filas)
    y = df["real_event"].to_numpy()
    real = df["real_chl"].to_numpy()
    clim = float(y.mean())  # climatología: probabilidad base del evento

    def evaluar(nombre: str, chl: np.ndarray, prob: np.ndarray | None) -> dict[str, Any]:
        pred_ev = (chl >= BLOOM_THRESHOLD).astype(int)
        out = {"model": nombre, **_regression(real, chl), **_classification(y, pred_ev)}
        if prob is not None:
            out["brier"] = _brier(y, prob)
        return out

    resultados = [
        evaluar("persistence", df["persist_chl"].to_numpy(), None),
        evaluar("physics_baseline", df["physics_chl"].to_numpy(), df["physics_prob"].to_numpy()),
        evaluar("ml_baseline", df["ml_chl"].to_numpy(), df["ml_prob"].to_numpy()),
        evaluar("hybrid_ensemble", df["hybrid_chl"].to_numpy(), df["hybrid_prob"].to_numpy()),
    ]
    brier_clim = _brier(y, np.full_like(y, clim, dtype=float))

    dentro = ((real >= df["hybrid_lower"]) & (real <= df["hybrid_upper"])).mean()
    cobertura = round(float(dentro), 4) if df["hybrid_lower"].notna().any() else None

    por_modelo = {r["model"]: r for r in resultados}
    hib, fis_r, ml_r = por_modelo["hybrid_ensemble"], por_modelo["physics_baseline"], por_modelo["ml_baseline"]
    hipotesis = {
        "f1_target": F1_TARGET,
        "hybrid_f1": hib["f1"],
        "meets_f1_target": hib["f1"] > F1_TARGET,
        "beats_physics_baseline": hib["f1"] >= fis_r["f1"] and hib["mae"] <= fis_r["mae"],
        "beats_ml_baseline": hib["f1"] >= ml_r["f1"] and hib["mae"] <= ml_r["mae"],
        "beats_persistence_mae": hib["mae"] < por_modelo["persistence"]["mae"],
        "brier_vs_climatology": {"hybrid": hib.get("brier"), "climatology": brier_clim},
    }
    # Honestidad sobre el F1: con clases muy desbalanceadas (cuenca casi siempre en
    # floración, o casi nunca) cualquier pronosticador —incluida la persistencia—
    # obtiene F1 alto sin mérito. En ese caso mandan MAE, Brier y cobertura.
    desbalance = clim > 0.8 or clim < 0.2
    hipotesis["class_balance_warning"] = (
        f"Tasa de evento {clim:.2f}: clases muy desbalanceadas. El F1 no discrimina entre modelos "
        f"(la persistencia obtiene {por_modelo['persistence']['f1']:.3f}); juzgar por MAE, Brier y cobertura."
        if desbalance else None
    )
    hipotesis["supported"] = bool(hipotesis["meets_f1_target"] and hipotesis["beats_physics_baseline"]
                                  and hipotesis["beats_ml_baseline"])
    hipotesis["verdict"] = (
        "Hipótesis respaldada sobre este dataset: el ensemble híbrido supera el F1 objetivo y a ambos baselines."
        if hipotesis["supported"] else
        "Hipótesis NO respaldada sobre este dataset con la configuración actual. Se reporta tal cual."
    ) + ("" if info.source == "csv" else
         " AVISO: el dataset es SIMULADO; esto valida el pipeline, no la hipótesis científica.")

    informe = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "basin_id": basin_id, "horizon_days": horizon_days,
        "dataset": info.__dict__,
        "protocol": {"type": "rolling_origin", "min_train_days": min_train_days, "step_days": step_days,
                     "origins": len(df), "leakage_violations": fugas_detectadas,
                     "origins_discarded_no_target": sin_objetivo,
                     "horizon_tolerance_days": TOLERANCIA_DIAS,
                     "horizon_real_days_mean": round(float(df["horizon_real_days"].mean()), 2),
                     "event_definition": (
                         f"chlorophyll_a >= {BLOOM_THRESHOLD:g} µg/L en t+H "
                         f"(OMS alerta {'1' if BLOOM_THRESHOLD <= 25 else '2'})"),
                     "bloom_threshold_ugl": BLOOM_THRESHOLD,
                     "event_rate": round(clim, 4), "valid_data_pct": round(100.0 * n / max(days, n), 2)},
        "results": resultados,
        "brier_climatology": brier_clim,
        "interval_coverage_hybrid": cobertura,
        "hypothesis": hipotesis,
        "folds": filas,
    }
    if persist:
        _persist(informe)
    return informe


def _persist(informe: dict[str, Any]) -> None:
    VALIDATION_DIR.mkdir(parents=True, exist_ok=True)
    stamp = informe["generated_at"].replace(":", "").replace("-", "")[:15]
    base = VALIDATION_DIR / f"report_{informe['basin_id']}_h{informe['horizon_days']}_{stamp}"
    base.with_suffix(".json").write_text(json.dumps(informe, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    base.with_suffix(".md").write_text(to_markdown(informe), encoding="utf-8")
    (VALIDATION_DIR / "latest.json").write_text(json.dumps(informe, indent=2, ensure_ascii=False, default=str), encoding="utf-8")


def latest_report() -> dict[str, Any] | None:
    p = VALIDATION_DIR / "latest.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def to_markdown(r: dict[str, Any]) -> str:
    d, p, h = r["dataset"], r["protocol"], r["hypothesis"]
    lineas = [
        f"# Informe de validación OAPAT — {r['basin_id']} · horizonte {r['horizon_days']} días",
        "",
        f"Generado: {r['generated_at']}",
        "",
        "## Dataset",
        f"- Origen: **{d['source']}** ({d['path'] or 'generador fenomenológico'})",
        f"- Periodo: {d['start']} → {d['end']} ({d['rows']} días) · huella `{d['fingerprint']}`",
        f"- {d['note']}",
        "",
        "## Protocolo",
        f"- Origen rodante: entrenamiento mínimo {p['min_train_days']} días, paso {p['step_days']} días, {p['origins']} orígenes evaluados.",
        f"- Violaciones de fuga temporal detectadas: **{p['leakage_violations']}**",
        f"- Horizonte real medio: {p['horizon_real_days_mean']} días (objetivo {r['horizon_days']}, tolerancia ±{p['horizon_tolerance_days']}) · orígenes descartados por falta de objetivo: {p['origins_discarded_no_target']}",
        f"- Evento: {p['event_definition']} · tasa base {p['event_rate']:.3f}",
        "",
        "## Resultados",
        "| Modelo | F1 | Precisión | Recall | RMSE | MAE | Brier |",
        "|---|---|---|---|---|---|---|",
    ]
    for m in r["results"]:
        lineas.append(f"| {m['model']} | {m['f1']:.3f} | {m['precision']:.3f} | {m['recall']:.3f} | "
                      f"{m['rmse']:.2f} | {m['mae']:.2f} | {m.get('brier', '—')} |")
    lineas += [
        f"| climatología | — | — | — | — | — | {r['brier_climatology']} |",
        "",
        f"Cobertura del intervalo del ensemble: **{r['interval_coverage_hybrid']}**",
        "",
        "## Hipótesis",
        f"- F1 del híbrido: **{h['hybrid_f1']:.3f}** (objetivo > {h['f1_target']})",
        f"- Supera baseline físico: {h['beats_physics_baseline']} · supera baseline ML: {h['beats_ml_baseline']} · supera persistencia (MAE): {h['beats_persistence_mae']}",
    ]
    if h.get("class_balance_warning"):
        lineas.append(f"- ⚠ {h['class_balance_warning']}")
    lineas.append(f"- **Veredicto:** {h['verdict']}")
    return "\n".join(lineas) + "\n"
