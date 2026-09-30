"""Fase 6 — Fuentes de datos con estado explícito.

Cada fuente real vive detrás de un adaptador (plan, sección 12: "encapsular
cada fuente detrás de un adaptador"). El registro sabe, para cada una, si está
**configurada**, si está **verificada** y por qué no, y lo expone en
``GET /sources`` y en el ``source_status`` de cada corrida.

Regla de honestidad: una fuente sin credenciales o sin verificar **no
inventa observaciones**. Devuelve vacío y deja el motivo por escrito; el
grafo lo trata como fuente ausente y penaliza la confianza (Fase 2/3).

Modo de datos (``OAPAT_DATA_MODE``):
- ``synthetic`` (por defecto): observaciones sintéticas reproducibles.
- ``dataset``: última fila del CSV real (``OAPAT_DATASET_CSV``) como observación de boya.
- ``live``: intenta las fuentes reales (Copernicus/OLCI, boya, meteorología); las no
  configuradas se reportan como ausentes.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from .adapters import synthetic_observations
from .schemas import DataSource, Observation


class DataSourceAdapter(ABC):
    name: str
    kind: DataSource

    @abstractmethod
    def status(self) -> dict: ...

    @abstractmethod
    def fetch(self, basin_id: str) -> list[Observation]: ...


class SyntheticSource(DataSourceAdapter):
    name = "synthetic"
    kind = DataSource.SIMULATION

    def status(self) -> dict:
        return {"name": self.name, "configured": True, "verified": True, "mode": "synthetic",
                "reason": "Observaciones reproducibles generadas localmente."}

    def fetch(self, basin_id: str) -> list[Observation]:
        return synthetic_observations(basin_id)


class CSVDatasetSource(DataSourceAdapter):
    """Última observación disponible de un CSV real, como lectura de boya."""
    name = "csv_dataset"
    kind = DataSource.BUOY

    def __init__(self) -> None:
        self.path = os.environ.get("OAPAT_DATASET_CSV")

    def status(self) -> dict:
        ok = bool(self.path) and os.path.exists(self.path or "")
        return {"name": self.name, "configured": bool(self.path), "verified": ok, "mode": "dataset",
                "reason": "OAPAT_DATASET_CSV no definido." if not self.path
                else ("Archivo no encontrado." if not ok else f"Leyendo {self.path}")}

    def fetch(self, basin_id: str) -> list[Observation]:
        if not self.status()["verified"]:
            return []
        from .datasets import load_history  # import diferido: pandas solo si hace falta
        daily, _ = load_history(basin_id)
        if daily.empty:
            return []
        ultima = daily.iloc[-1]
        medidas = {k: float(ultima[k]) for k in ("chlorophyll_a", "temp_surface", "total_phosphorus",
                                                   "total_nitrogen", "dissolved_oxygen", "microcystin")
                   if k in daily.columns and ultima[k] == ultima[k]}
        obs = [Observation(source=DataSource.BUOY, basin_id=basin_id,
                           timestamp=datetime.now(timezone.utc), measurements=medidas)]
        if "wind_speed" in daily.columns and ultima["wind_speed"] == ultima["wind_speed"]:
            obs.append(Observation(source=DataSource.METEOROLOGY, basin_id=basin_id,
                                   timestamp=datetime.now(timezone.utc),
                                   measurements={"wind_speed": float(ultima["wind_speed"]),
                                                 "solar_radiation": float(ultima.get("solar_par", 1200.0) or 1200.0)}))
        return obs


class CopernicusOLCISource(DataSourceAdapter):
    """Sentinel-3 OLCI vía Copernicus Data Space Ecosystem.

    Punto de conexión preparado, **no verificado**: requiere credenciales
    (``CDSE_USERNAME`` / ``CDSE_PASSWORD`` o ``CDSE_TOKEN``), acceso a red y una
    escena sin nubes sobre la cuenca. Sin eso, la fuente se declara ausente y
    no se fabrica ningún índice satelital.
    """
    name = "copernicus_olci"
    kind = DataSource.SENTINEL3
    ENDPOINT = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"

    def status(self) -> dict:
        tiene_cred = bool(os.environ.get("CDSE_TOKEN") or
                          (os.environ.get("CDSE_USERNAME") and os.environ.get("CDSE_PASSWORD")))
        return {"name": self.name, "configured": tiene_cred, "verified": False, "mode": "live",
                "endpoint": self.ENDPOINT,
                "reason": ("Credenciales CDSE presentes; la descarga y el cálculo de NDCI/Chl-a OLCI "
                           "no están verificados en este entorno.") if tiene_cred
                else "Sin credenciales CDSE (CDSE_TOKEN o CDSE_USERNAME/CDSE_PASSWORD). Fuente ausente."}

    def fetch(self, basin_id: str) -> list[Observation]:
        # Deliberadamente vacío mientras no esté verificado: ausente > inventado.
        return []


class SourceRegistry:
    def __init__(self) -> None:
        # Si hay un dataset real configurado, ese es el modo por defecto: tener
        # OAPAT_DATASET_CSV definido y seguir sirviendo observaciones sintéticas
        # sería engañoso. OAPAT_DATA_MODE explícito siempre manda.
        por_defecto = "dataset" if os.environ.get("OAPAT_DATASET_CSV") else "synthetic"
        self.mode = os.environ.get("OAPAT_DATA_MODE", por_defecto).lower()
        self.sources: list[DataSourceAdapter] = [SyntheticSource(), CSVDatasetSource(), CopernicusOLCISource()]

    def statuses(self) -> list[dict]:
        return [{**s.status(), "active": self._active(s)} for s in self.sources]

    def _active(self, s: DataSourceAdapter) -> bool:
        if self.mode == "synthetic":
            return s.name == "synthetic"
        if self.mode == "dataset":
            return s.name == "csv_dataset"
        return s.name != "synthetic"  # live

    def collect(self, basin_id: str) -> tuple[list[Observation], list[dict]]:
        obs: list[Observation] = []
        for s in self.sources:
            if self._active(s):
                obs.extend(s.fetch(basin_id))
        return obs, self.statuses()


REGISTRY = SourceRegistry()
