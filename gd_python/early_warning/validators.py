"""Fase 2 — Validación robusta de observaciones.

Controla límites físicos, unidades esperadas, antigüedad, duplicados,
faltantes y calcula un score de calidad individual (0–1) por observación.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

# ---------------------------------------------------------------------------
# Límites físicos por variable  (min, max)
# ---------------------------------------------------------------------------

PHYSICAL_LIMITS: dict[str, tuple[float, float]] = {
    "chlorophyll_a":          (0.0,   500.0),
    "satellite_chlorophyll_a":(0.0,   500.0),
    "temp_surface":           (-2.0,   45.0),
    "dissolved_oxygen":       (0.0,    20.0),
    "ph":                     (0.0,    14.0),
    "total_phosphorus":       (0.0,    10.0),
    "total_nitrogen":         (0.0,    50.0),
    "turbidity":              (0.0,  1000.0),
    "wind_speed":             (0.0,   200.0),
    "solar_radiation":        (0.0,  2500.0),
    "ndci":                   (-1.0,    1.0),
    "microcystin":            (0.0,   500.0),
    "precipitation":          (0.0,   500.0),
}

# ---------------------------------------------------------------------------
# Unidades esperadas por variable
# ---------------------------------------------------------------------------

EXPECTED_UNITS: dict[str, set[str]] = {
    "chlorophyll_a":          {"ug/L", "µg/L"},
    "satellite_chlorophyll_a":{"ug/L", "µg/L"},
    "temp_surface":           {"C", "°C"},
    "dissolved_oxygen":       {"mg/L"},
    "ph":                     {"pH", ""},
    "total_phosphorus":       {"mg/L"},
    "total_nitrogen":         {"mg/L"},
    "turbidity":              {"NTU"},
    "wind_speed":             {"km/h", "m/s"},
    "solar_radiation":        {"umol/m2/s", "µmol/m²/s", "W/m2"},
    "ndci":                   {"index", ""},
    "microcystin":            {"ug/L", "µg/L"},
    "precipitation":          {"mm"},
}

# ---------------------------------------------------------------------------
# Mediciones requeridas según tipo de fuente
# ---------------------------------------------------------------------------

REQUIRED_BY_SOURCE: dict[str, set[str]] = {
    "buoy":        {"chlorophyll_a", "temp_surface"},
    "meteorology": {"wind_speed"},
    "sentinel3":   {"ndci"},
    "simulation":  set(),
}

DEFAULT_MAX_AGE_HOURS = 30


# ---------------------------------------------------------------------------
# Funciones de validación
# ---------------------------------------------------------------------------

def _check_physical_limits(measurements: dict[str, Any]) -> list[str]:
    """Devuelve issues para mediciones fuera de rango físico."""
    issues: list[str] = []
    for key, value in measurements.items():
        if not isinstance(value, (int, float)):
            continue
        limits = PHYSICAL_LIMITS.get(key)
        if limits and not (limits[0] <= value <= limits[1]):
            issues.append(
                f"{key}={value} fuera de rango físico [{limits[0]}, {limits[1]}]"
            )
    return issues


def _check_units(measurements: dict[str, Any],
                 units: dict[str, str]) -> list[str]:
    """Devuelve issues para unidades desconocidas."""
    issues: list[str] = []
    for key in measurements:
        expected = EXPECTED_UNITS.get(key)
        if expected is None:
            continue  # variable desconocida, no validamos unidad
        actual = units.get(key, "")
        if actual not in expected:
            issues.append(
                f"unidad de {key}='{actual}' no reconocida; esperadas: {expected}"
            )
    return issues


def _check_staleness(timestamp: datetime, now: datetime,
                     max_age_hours: float) -> list[str]:
    """Devuelve issue si la observación es demasiado antigua."""
    age_hours = (now - timestamp).total_seconds() / 3600
    if age_hours > max_age_hours:
        return [f"observación antigua ({age_hours:.1f} h, máximo {max_age_hours} h)"]
    return []


def _check_numeric(measurements: dict[str, Any]) -> list[str]:
    """Devuelve issue si hay mediciones no numéricas."""
    bad = [k for k, v in measurements.items() if not isinstance(v, (int, float))]
    if bad:
        return [f"mediciones no numéricas: {bad}"]
    return []


def _check_missing(source: str, measurements: dict[str, Any]) -> list[str]:
    """Devuelve issue si faltan mediciones requeridas para la fuente."""
    required = REQUIRED_BY_SOURCE.get(source, set())
    missing = required - set(measurements.keys())
    if missing:
        return [f"faltan mediciones requeridas de {source}: {sorted(missing)}"]
    return []


def _check_quality_flag(quality: dict) -> list[str]:
    """Devuelve issue si la bandera de calidad es inaceptable."""
    flag = quality.get("flag", "good")
    if flag in {"bad", "missing"}:
        return ["bandera de calidad no aceptable"]
    return []


def _compute_quality_score(quality: dict, age_hours: float,
                           max_age_hours: float,
                           measurements: dict[str, Any],
                           source: str) -> float:
    """Calcula un score 0–1 según flag, antigüedad y cobertura."""
    # Base: confianza reportada
    base_confidence = quality.get("confidence", 0.9)

    # Penalización por bandera sospechosa
    flag = quality.get("flag", "good")
    flag_penalty = 0.0 if flag == "good" else 0.3 if flag == "suspect" else 0.8

    # Penalización por antigüedad (lineal)
    age_penalty = min(1.0, age_hours / max_age_hours) * 0.2

    # Cobertura: fracción de mediciones requeridas presentes
    required = REQUIRED_BY_SOURCE.get(source, set())
    if required:
        coverage = len(required & set(measurements.keys())) / len(required)
    else:
        coverage = 1.0

    score = base_confidence * coverage * (1.0 - flag_penalty) * (1.0 - age_penalty)
    return round(max(0.0, min(1.0, score)), 4)


# ---------------------------------------------------------------------------
# Función principal
# ---------------------------------------------------------------------------

def validate_observation(obs: dict, now: datetime | None = None,
                         max_age_hours: float = DEFAULT_MAX_AGE_HOURS
                         ) -> dict:
    """Valida una observación y devuelve su detalle de validación.

    Returns
    -------
    dict con claves:
        accepted: bool
        issues: list[str]
        quality_score: float (0–1)
        original: dict  (la observación original, sin modificar)
    """
    if now is None:
        now = datetime.now(timezone.utc)

    source = obs.get("source", "")
    measurements = obs.get("measurements", {})
    units = obs.get("units", {})
    quality = obs.get("quality", {})

    # Parsear timestamp
    ts_raw = obs.get("timestamp", "")
    try:
        timestamp = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return {
            "accepted": False,
            "issues": ["timestamp inválido o ausente"],
            "quality_score": 0.0,
            "original": obs,
        }

    age_hours = (now - timestamp).total_seconds() / 3600

    # Recopilar todos los issues
    issues: list[str] = []
    issues.extend(_check_quality_flag(quality))
    issues.extend(_check_numeric(measurements))
    issues.extend(_check_physical_limits(measurements))
    issues.extend(_check_units(measurements, units))
    issues.extend(_check_staleness(timestamp, now, max_age_hours))
    issues.extend(_check_missing(source, measurements))

    accepted = len(issues) == 0
    quality_score = (
        _compute_quality_score(quality, age_hours, max_age_hours,
                               measurements, source)
        if accepted else 0.0
    )

    return {
        "accepted": accepted,
        "issues": issues,
        "quality_score": quality_score,
        "original": obs,
    }


def find_duplicates(observations: list[dict]) -> tuple[list[dict], list[dict]]:
    """Detecta observaciones duplicadas (mismo source + timestamp + basin_id).

    Returns
    -------
    (unique, duplicates) — listas de observaciones.
    """
    seen: set[str] = set()
    unique: list[dict] = []
    duplicates: list[dict] = []

    for obs in observations:
        key = f"{obs.get('source')}|{obs.get('timestamp')}|{obs.get('basin_id')}"
        if key in seen:
            duplicates.append(obs)
        else:
            seen.add(key)
            unique.append(obs)

    return unique, duplicates
