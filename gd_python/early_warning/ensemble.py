"""Fase 3 — Ensemble ponderado, incertidumbre y clasificación de riesgo.

Combina pronósticos de modelos físico y ML, estima intervalos de confianza
y clasifica el nivel de riesgo con umbrales explícitos.
"""

from __future__ import annotations

import math
from typing import Any

from .forecast_models import FORECAST_KEYS

# ---------------------------------------------------------------------------
# Pesos por defecto del ensemble
# ---------------------------------------------------------------------------

DEFAULT_WEIGHTS = {"physics": 0.4, "ml": 0.6}

# ---------------------------------------------------------------------------
# Umbrales de riesgo
# ---------------------------------------------------------------------------

RISK_THRESHOLDS = {
    "NORMAL":     (0.00, 0.30),
    "PREVENTIVE": (0.30, 0.60),
    "ALERT":      (0.60, 0.80),
    "CRITICAL":   (0.80, 1.01),
}

# Umbrales absolutos de clorofila-a para drivers
CHL_DRIVER_THRESHOLD = 50.0      # µg/L
PHOS_DRIVER_THRESHOLD = 0.30     # mg/L
TEMP_DRIVER_THRESHOLD = 25.0     # °C
DO_DRIVER_THRESHOLD = 4.0        # mg/L
WIND_CALM_THRESHOLD = 5.0        # km/h
MC_DRIVER_THRESHOLD = 1.0        # µg/L (guía OMS agua potable)

# Factor de expansión para intervalos de confianza
INTERVAL_EXPANSION = 1.5


# ---------------------------------------------------------------------------
# Ensemble ponderado
# ---------------------------------------------------------------------------

def build_ensemble(
    physics_forecast: dict[str, Any],
    ml_forecast: dict[str, Any],
    quality_score: float = 0.8,
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Combina pronósticos de modelos físico y ML con pesos dinámicos.

    Los pesos se ajustan según calidad de datos: con quality_score bajo,
    se favorece el modelo físico (menos dependiente de datos recientes).

    Parameters
    ----------
    physics_forecast, ml_forecast
        Salida de PhysicsModelAdapter.forecast() y MLModelAdapter.forecast().
    quality_score
        Score global de calidad (0–1) del aligned_dataset.
    weights
        Pesos base {physics, ml}. Default: {physics: 0.4, ml: 0.6}.

    Returns
    -------
    dict con:
        ensemble_values: dict[str, float] — variables fusionadas
        physics_values: dict[str, float] — valores del modelo físico
        ml_values: dict[str, float] — valores del modelo ML
        effective_weights: dict[str, float] — pesos efectivos usados
        dispersion: dict[str, float] — |physics − ml| por variable
    """
    if weights is None:
        weights = dict(DEFAULT_WEIGHTS)

    # Ajuste dinámico: con baja calidad de datos, favorecer physics
    if quality_score < 0.6:
        adjustment = 0.15 * (0.6 - quality_score) / 0.6
        effective = {
            "physics": min(0.8, weights["physics"] + adjustment),
            "ml": max(0.2, weights["ml"] - adjustment),
        }
    else:
        effective = dict(weights)

    # Normalizar pesos
    total = effective["physics"] + effective["ml"]
    effective = {k: v / total for k, v in effective.items()}

    # Variables numéricas del pronóstico
    numeric_keys = FORECAST_KEYS

    ensemble_values: dict[str, float] = {}
    physics_values: dict[str, float] = {}
    ml_values: dict[str, float] = {}
    dispersion: dict[str, float] = {}

    for key in numeric_keys:
        pv = physics_forecast.get(key, 0.0)
        mv = ml_forecast.get(key, 0.0)

        if not isinstance(pv, (int, float)):
            pv = 0.0
        if not isinstance(mv, (int, float)):
            mv = 0.0

        physics_values[key] = pv
        ml_values[key] = mv

        # Media ponderada
        ensemble_values[key] = round(
            effective["physics"] * pv + effective["ml"] * mv, 4
        )

        # Dispersión inter-modelo
        mean_val = (pv + mv) / 2
        if mean_val > 0:
            dispersion[key] = round(abs(pv - mv) / mean_val, 4)
        else:
            dispersion[key] = 0.0

    return {
        "ensemble_values": ensemble_values,
        "physics_values": physics_values,
        "ml_values": ml_values,
        "effective_weights": {k: round(v, 4) for k, v in effective.items()},
        "dispersion": dispersion,
    }


# ---------------------------------------------------------------------------
# Estimación de incertidumbre
# ---------------------------------------------------------------------------

def estimate_uncertainty(
    ensemble_result: dict[str, Any],
    quality_score: float = 0.8,
    gap_slots: int = 0,
    total_slots: int = 1,
    missing_sources: list[str] | None = None,
) -> dict[str, Any]:
    """Estima intervalos de confianza y confianza global.

    Parameters
    ----------
    ensemble_result
        Salida de ``build_ensemble()``.
    quality_score
        Score global de calidad de datos.
    gap_slots
        Slots temporales sin cobertura.
    total_slots
        Total de slots en el rango temporal.
    missing_sources
        Fuentes de datos faltantes.

    Returns
    -------
    dict con:
        confidence: float — confianza global (0–1)
        intervals: dict[str, dict] — {variable: {lower, mean, upper}}
        penalties: dict[str, float] — penalizaciones aplicadas
        agreement: float — acuerdo inter-modelo (0–1)
    """
    if missing_sources is None:
        missing_sources = []

    dispersion = ensemble_result.get("dispersion", {})
    ensemble_values = ensemble_result.get("ensemble_values", {})

    # 1. Acuerdo inter-modelo (1 − dispersión media)
    disp_values = [v for v in dispersion.values() if isinstance(v, (int, float))]
    mean_dispersion = sum(disp_values) / len(disp_values) if disp_values else 0
    agreement = max(0.0, 1.0 - mean_dispersion)

    # 2. Penalizaciones
    penalties: dict[str, float] = {}

    # Penalización por datos faltantes
    source_penalty = len(missing_sources) * 0.1
    penalties["missing_sources"] = round(source_penalty, 4)

    # Penalización por baja calidad
    quality_penalty = max(0, (0.8 - quality_score) * 0.5)
    penalties["low_quality"] = round(quality_penalty, 4)

    # Penalización por gaps temporales
    gap_ratio = gap_slots / max(1, total_slots)
    gap_penalty = gap_ratio * 0.2
    penalties["temporal_gaps"] = round(gap_penalty, 4)

    total_penalty = min(0.6, sum(penalties.values()))

    # 3. Confianza global
    confidence = max(0.1, agreement * (1.0 - total_penalty) * quality_score)
    confidence = round(min(1.0, confidence), 4)

    # 4. Intervalos por variable
    intervals: dict[str, dict[str, float]] = {}
    for key in ensemble_values:
        mean_val = ensemble_values[key]
        disp = dispersion.get(key, 0.0)

        # Ancho del intervalo: dispersión × factor de expansión × (1 + penalización)
        half_width = abs(mean_val) * disp * INTERVAL_EXPANSION * (1.0 + total_penalty)
        # Mínimo ancho para no dar falsa certeza
        half_width = max(half_width, abs(mean_val) * 0.05)

        lower = round(mean_val - half_width, 4)
        upper = round(mean_val + half_width, 4)

        # Clamp probabilidades a [0, 1]
        if key == "bloom_probability":
            lower = max(0.0, lower)
            upper = min(1.0, upper)

        intervals[key] = {
            "lower": lower,
            "mean": round(mean_val, 4),
            "upper": upper,
        }

    return {
        "confidence": confidence,
        "intervals": intervals,
        "penalties": penalties,
        "agreement": round(agreement, 4),
    }


# ---------------------------------------------------------------------------
# Clasificación de riesgo
# ---------------------------------------------------------------------------

def classify_risk(
    ensemble_values: dict[str, float],
    uncertainty: dict[str, Any],
    posterior_state: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Clasifica el nivel de riesgo y genera lista de impulsores.

    Parameters
    ----------
    ensemble_values
        Variables del ensemble (salida de build_ensemble).
    uncertainty
        Salida de estimate_uncertainty.
    posterior_state
        Estado asimilado actual (para calcular drivers).

    Returns
    -------
    dict con:
        level: str — NORMAL, PREVENTIVE, ALERT o CRITICAL
        bloom_probability: float
        bloom_probability_upper: float
        drivers: list[str]
        thresholds: dict
        confidence: float
    """
    if posterior_state is None:
        posterior_state = {}

    bloom_prob = ensemble_values.get("bloom_probability", 0.0)
    intervals = uncertainty.get("intervals", {})
    bloom_upper = intervals.get("bloom_probability", {}).get("upper", bloom_prob)
    confidence = uncertainty.get("confidence", 0.5)

    # Clasificación por umbral
    level = "NORMAL"
    for risk_name, (low, high) in RISK_THRESHOLDS.items():
        if low <= bloom_prob < high:
            level = risk_name
            break

    # Drivers (impulsores del riesgo)
    drivers: list[str] = []

    chl_forecast = ensemble_values.get("chlorophyll_a", 0)
    mc_forecast = ensemble_values.get("microcystin", 0)
    temp_forecast = ensemble_values.get("temp_surface", 0)
    do_forecast = ensemble_values.get("dissolved_oxygen", 10)

    # Condiciones actuales del estado asimilado
    chl_current = posterior_state.get("chlorophyll_a", 0)
    phos_current = posterior_state.get("total_phosphorus", 0)
    temp_current = posterior_state.get("temp_surface", 0)
    wind_current = posterior_state.get("wind_speed", 10)

    if chl_forecast > CHL_DRIVER_THRESHOLD:
        drivers.append(
            f"clorofila-a proyectada elevada ({chl_forecast:.1f} µg/L)"
        )
    if chl_current > CHL_DRIVER_THRESHOLD:
        drivers.append(
            f"clorofila-a actual elevada ({chl_current:.1f} µg/L)"
        )
    if phos_current > PHOS_DRIVER_THRESHOLD:
        drivers.append(
            f"fósforo total elevado ({phos_current:.2f} mg/L)"
        )
    if temp_current > TEMP_DRIVER_THRESHOLD or temp_forecast > TEMP_DRIVER_THRESHOLD:
        drivers.append(
            f"temperatura favorable para cianobacterias ({max(temp_current, temp_forecast):.1f} °C)"
        )
    if wind_current < WIND_CALM_THRESHOLD:
        drivers.append(
            f"viento débil ({wind_current:.1f} km/h) — baja mezcla vertical"
        )
    if do_forecast < DO_DRIVER_THRESHOLD:
        drivers.append(
            f"oxígeno disuelto proyectado bajo ({do_forecast:.1f} mg/L)"
        )
    if mc_forecast > MC_DRIVER_THRESHOLD:
        drivers.append(
            f"microcistina proyectada supera guía OMS ({mc_forecast:.1f} µg/L)"
        )

    # Deduplicar drivers manteniendo orden
    seen: set[str] = set()
    unique_drivers: list[str] = []
    for d in drivers:
        if d not in seen:
            seen.add(d)
            unique_drivers.append(d)

    return {
        "level": level,
        "bloom_probability": round(bloom_prob, 4),
        "bloom_probability_upper": round(bloom_upper, 4),
        "drivers": unique_drivers,
        "thresholds": RISK_THRESHOLDS,
        "confidence": confidence,
    }
