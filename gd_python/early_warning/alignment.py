"""Fase 2 — Alineación espacio-temporal y fusión de fuentes.

Agrupa observaciones válidas en slots horarios y fusiona mediciones
de la misma variable desde distintas fuentes ponderando por quality_score.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

# Prioridad de fuentes (mayor número = mayor prioridad en caso de empate)
SOURCE_PRIORITY: dict[str, int] = {
    "simulation":  1,
    "sentinel3":   2,
    "meteorology": 3,
    "buoy":        4,
}

# Mapeo de variables satelitales a variable canónica
VARIABLE_ALIASES: dict[str, str] = {
    "satellite_chlorophyll_a": "chlorophyll_a",
}


def _slot_key(ts: datetime) -> str:
    """Redondea un timestamp al inicio del slot horario (trunca minutos)."""
    truncated = ts.replace(minute=0, second=0, microsecond=0)
    return truncated.isoformat()


def _parse_timestamp(raw: Any) -> datetime:
    """Parsea un timestamp ISO-8601 a datetime UTC."""
    return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))


def align_to_hourly_slots(
    validated_observations: list[dict],
) -> dict:
    """Alinea observaciones validadas a una grilla horaria.

    Parameters
    ----------
    validated_observations
        Lista de dicts con la estructura de salida de ``validate_observation``,
        donde ``accepted=True`` y cada una tiene ``quality_score`` y ``original``.

    Returns
    -------
    dict con claves:
        slots: dict[str, list[dict]]
            Mapping de slot_key → lista de observaciones asignadas.
        time_range: dict con ``start`` y ``end`` (ISO-8601).
        total_slots: int
        covered_slots: int
        gap_slots: int
    """
    if not validated_observations:
        return {
            "slots": {},
            "time_range": {"start": None, "end": None},
            "total_slots": 0,
            "covered_slots": 0,
            "gap_slots": 0,
        }

    # Asignar cada observación a su slot
    slots: dict[str, list[dict]] = {}
    timestamps: list[datetime] = []

    for item in validated_observations:
        obs = item["original"]
        ts = _parse_timestamp(obs["timestamp"])
        timestamps.append(ts)
        key = _slot_key(ts)
        slots.setdefault(key, []).append(item)

    # Calcular rango y gaps
    ts_min = min(timestamps).replace(minute=0, second=0, microsecond=0)
    ts_max = max(timestamps).replace(minute=0, second=0, microsecond=0)
    total_slots = max(1, int((ts_max - ts_min).total_seconds() / 3600) + 1)
    covered_slots = len(slots)

    return {
        "slots": slots,
        "time_range": {
            "start": ts_min.isoformat(),
            "end": ts_max.isoformat(),
        },
        "total_slots": total_slots,
        "covered_slots": covered_slots,
        "gap_slots": total_slots - covered_slots,
    }


def fuse_measurements(
    validated_observations: list[dict],
) -> dict:
    """Fusiona mediciones de múltiples fuentes ponderando por quality_score.

    Cuando la misma variable (canónica) aparece en varias observaciones,
    se calcula la media ponderada por ``quality_score``.  Las variables
    satelitales se mapean a su alias canónico (ej. ``satellite_chlorophyll_a``
    → ``chlorophyll_a``).

    Parameters
    ----------
    validated_observations
        Lista de dicts validados (``accepted=True``).

    Returns
    -------
    dict con claves:
        fused_measurements: dict[str, float]
            Variable → valor fusionado.
        fused_units: dict[str, str]
            Variable → unidad (de la fuente con mayor prioridad).
        sources_used: dict[str, list[str]]
            Variable → lista de fuentes que contribuyeron.
        quality_score: float
            Score global ponderado (media de los scores individuales).
    """
    # Acumular (valor * peso, peso) por variable canónica
    accum: dict[str, list[tuple[float, float, str, str]]] = {}
    # (value, quality_score, source, unit)

    total_score = 0.0
    count = 0

    for item in validated_observations:
        obs = item["original"]
        qs = item["quality_score"]
        source = obs.get("source", "")
        measurements = obs.get("measurements", {})
        units = obs.get("units", {})

        total_score += qs
        count += 1

        for var, value in measurements.items():
            if not isinstance(value, (int, float)):
                continue
            canonical = VARIABLE_ALIASES.get(var, var)
            unit = units.get(var, "")
            accum.setdefault(canonical, []).append((value, qs, source, unit))

    # Calcular media ponderada
    fused: dict[str, float] = {}
    fused_units: dict[str, str] = {}
    sources_used: dict[str, list[str]] = {}

    for var, entries in accum.items():
        total_weight = sum(qs for _, qs, _, _ in entries)
        if total_weight == 0:
            # Fallback: media simple
            fused[var] = round(
                sum(v for v, _, _, _ in entries) / len(entries), 4
            )
        else:
            fused[var] = round(
                sum(v * qs for v, qs, _, _ in entries) / total_weight, 4
            )

        # Unidad: tomar la de la fuente con mayor prioridad
        best_entry = max(entries, key=lambda e: SOURCE_PRIORITY.get(e[2], 0))
        fused_units[var] = best_entry[3]
        sources_used[var] = sorted(set(src for _, _, src, _ in entries))

    global_score = round(total_score / count, 4) if count else 0.0

    return {
        "fused_measurements": fused,
        "fused_units": fused_units,
        "sources_used": sources_used,
        "quality_score": global_score,
    }
