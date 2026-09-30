"""Adaptadores de fuentes. El MVP genera observaciones reproducibles."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .schemas import DataSource, Observation


def synthetic_observations(basin_id: str) -> list[Observation]:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    return [
        Observation(source=DataSource.BUOY, basin_id=basin_id, timestamp=now,
          measurements={"chlorophyll_a": 78.3, "temp_surface": 27.8,
                        "dissolved_oxygen": 3.4, "total_phosphorus": 0.45,
                        "turbidity": 54.0},
          units={"chlorophyll_a": "ug/L", "temp_surface": "C",
                 "dissolved_oxygen": "mg/L", "total_phosphorus": "mg/L",
                 "turbidity": "NTU"}),
        Observation(source=DataSource.METEOROLOGY, basin_id=basin_id,
          timestamp=now - timedelta(minutes=20),
          measurements={"wind_speed": 2.5, "solar_radiation": 1550.0},
          units={"wind_speed": "km/h", "solar_radiation": "umol/m2/s"}),
        Observation(source=DataSource.SENTINEL3, basin_id=basin_id,
          timestamp=now - timedelta(hours=18),
          measurements={"ndci": 0.42, "satellite_chlorophyll_a": 82.0},
          units={"ndci": "index", "satellite_chlorophyll_a": "ug/L"}),
    ]


def synthetic_observations_degraded(basin_id: str) -> list[Observation]:
    """Genera observaciones con problemas intencionados para testear validación.

    Incluye: fuera de rango, antigüedad excesiva, duplicados, faltantes.
    """
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    return [
        # Boya con clorofila fuera de rango físico (> 500)
        Observation(source=DataSource.BUOY, basin_id=basin_id, timestamp=now,
          measurements={"chlorophyll_a": 999.0, "temp_surface": 27.8,
                        "dissolved_oxygen": 3.4, "total_phosphorus": 0.45},
          units={"chlorophyll_a": "ug/L", "temp_surface": "C",
                 "dissolved_oxygen": "mg/L", "total_phosphorus": "mg/L"}),
        # Meteorología muy antigua (> 30h)
        Observation(source=DataSource.METEOROLOGY, basin_id=basin_id,
          timestamp=now - timedelta(hours=48),
          measurements={"wind_speed": 5.0, "solar_radiation": 1200.0},
          units={"wind_speed": "km/h", "solar_radiation": "umol/m2/s"}),
        # Sentinel duplicado (se repite dos veces)
        Observation(source=DataSource.SENTINEL3, basin_id=basin_id,
          timestamp=now - timedelta(hours=6),
          measurements={"ndci": 0.35, "satellite_chlorophyll_a": 70.0},
          units={"ndci": "index", "satellite_chlorophyll_a": "ug/L"}),
        Observation(source=DataSource.SENTINEL3, basin_id=basin_id,
          timestamp=now - timedelta(hours=6),
          measurements={"ndci": 0.35, "satellite_chlorophyll_a": 70.0},
          units={"ndci": "index", "satellite_chlorophyll_a": "ug/L"}),
        # Boya sin mediciones requeridas (falta chlorophyll_a y temp_surface)
        Observation(source=DataSource.BUOY, basin_id=basin_id,
          timestamp=now - timedelta(hours=1),
          measurements={"turbidity": 30.0},
          units={"turbidity": "NTU"}),
    ]
