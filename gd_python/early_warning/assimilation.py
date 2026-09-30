"""Fase 2 — Asimilación básica del estado del gemelo.

Corrección explícita del estado simulado con observaciones válidas,
ponderada por calidad.  NO es un filtro de Kalman; la Fase 6 evaluará
métodos más sofisticados.
"""

from __future__ import annotations

from typing import Any

# Estado prior sintético del embalse (valores base "simulados")
DEFAULT_PRIOR: dict[str, float] = {
    "chlorophyll_a":     40.0,   # µg/L — nivel moderado simulado
    "temp_surface":      22.0,   # °C
    "dissolved_oxygen":   7.5,   # mg/L
    "total_phosphorus":   0.15,  # mg/L
    "turbidity":         25.0,   # NTU
    "ph":                 7.8,
    "wind_speed":         8.0,   # km/h
    "solar_radiation": 1200.0,   # µmol/m²/s
    "ndci":               0.15,  # índice
}

# Ganancia de corrección (0–1).  1.0 = confiar totalmente en la observación
DEFAULT_GAIN = 0.7


def assimilate(
    fused_measurements: dict[str, float],
    quality_score: float,
    prior: dict[str, float] | None = None,
    gain: float = DEFAULT_GAIN,
) -> dict:
    """Corrige el estado simulado con observaciones fusionadas.

    Fórmula por variable::

        corrected = simulated + gain × quality_score × (observed − simulated)

    Parameters
    ----------
    fused_measurements
        Variables fusionadas (salida de ``fuse_measurements``).
    quality_score
        Score global de calidad (0–1).
    prior
        Estado previo simulado.  Si ``None`` se usa ``DEFAULT_PRIOR``.
    gain
        Ganancia de corrección, por defecto 0.7.

    Returns
    -------
    dict con claves:
        prior_state: dict[str, float]
        corrections: dict[str, dict]
            Por variable: ``prior``, ``observed``, ``delta``, ``corrected``.
        posterior_state: dict[str, float]
        confidence: float
            Confianza resultante (gain × quality_score).
        gain_used: float
        quality_score_used: float
    """
    if prior is None:
        prior = dict(DEFAULT_PRIOR)

    corrections: dict[str, dict[str, Any]] = {}
    posterior: dict[str, float] = dict(prior)

    for var, observed in fused_measurements.items():
        if not isinstance(observed, (int, float)):
            continue
        simulated = prior.get(var)
        if simulated is None:
            # Variable sin prior: tomar la observación tal cual
            posterior[var] = observed
            corrections[var] = {
                "prior": None,
                "observed": observed,
                "delta": None,
                "corrected": observed,
                "note": "sin prior, se adopta observación directamente",
            }
            continue

        delta = observed - simulated
        corrected = simulated + gain * quality_score * delta
        corrected = round(corrected, 4)

        posterior[var] = corrected
        corrections[var] = {
            "prior": simulated,
            "observed": observed,
            "delta": round(delta, 4),
            "corrected": corrected,
        }

    confidence = round(gain * quality_score, 4)

    return {
        "prior_state": prior,
        "corrections": corrections,
        "posterior_state": posterior,
        "confidence": confidence,
        "gain_used": gain,
        "quality_score_used": quality_score,
    }


def generate_recommendations(
    posterior_state: dict[str, float],
    quality_score: float,
    data_quality: str,
) -> list[str]:
    """Genera recomendaciones de calidad de datos basadas en el estado.

    Returns
    -------
    list[str] — recomendaciones textuales.
    """
    recs: list[str] = []

    if data_quality == "insufficient":
        recs.append(
            "La calidad de datos es insuficiente; el resultado no debe "
            "usarse para decisiones operativas."
        )
        return recs

    if quality_score < 0.5:
        recs.append(
            "Score de calidad global bajo ({:.2f}). Revisar sensores y "
            "frecuencia de muestreo.".format(quality_score)
        )

    chl = posterior_state.get("chlorophyll_a", 0)
    if chl > 100:
        recs.append(
            f"Clorofila-a posterior muy elevada ({chl:.1f} µg/L). "
            "Considerar muestreo manual de confirmación."
        )
    elif chl > 50:
        recs.append(
            f"Clorofila-a posterior elevada ({chl:.1f} µg/L). "
            "Monitorear evolución en las próximas 24 h."
        )

    do = posterior_state.get("dissolved_oxygen", 10)
    if do < 4.0:
        recs.append(
            f"Oxígeno disuelto bajo ({do:.1f} mg/L). "
            "Riesgo de mortandad de peces."
        )

    p = posterior_state.get("total_phosphorus", 0)
    if p > 0.5:
        recs.append(
            f"Fósforo total elevado ({p:.2f} mg/L). "
            "Puede favorecer la proliferación de cianobacterias."
        )

    return recs
