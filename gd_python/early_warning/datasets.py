"""Fase 6 — Dataset histórico para entrenamiento y backtesting.

Dos orígenes, con prioridad explícita:

1. **CSV real** (`OAPAT_DATASET_CSV`): un archivo con columnas ``timestamp`` y
   las variables del catálogo. Es la vía para conectar datos reales sin tocar
   el resto del módulo (plan, sección 4: "se habilitarán mediante interfaces").
2. **Histórico simulado** de ``aquatwin.datos.generar_serie``: el generador
   fenomenológico determinista del gemelo. Se usa cuando no hay CSV, y el
   informe de validación lo declara.

En ambos casos la serie se agrega a paso **diario** (media por día de todas las
estaciones), porque el pronóstico OAPAT es a 7–14 días y el ruido horario no
aporta a ese horizonte.

La etiqueta de **evento de floración** es ``chlorophyll_a >= BLOOM_THRESHOLD``
(50 µg/L, nivel de alerta 2 de la OMS), la misma que usa el motor de reglas.
"""

from __future__ import annotations

import hashlib
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

#: Umbral de evento de floración, en µg/L de clorofila-a.
#:
#: La OMS define **dos niveles de alerta** para aguas recreativas: 25 µg/L
#: (nivel 1, vigilancia) y 50 µg/L (nivel 2, riesgo alto). Cuál corresponde
#: depende del cuerpo de agua: en un embalse hipereutrófico como San Roque el
#: nivel 2 es frecuente, mientras que en un lago mesotrófico-eutrófico como
#: Mendota apenas se alcanza —3 de 343 fechas—, y evaluar con él deja la clase
#: positiva vacía y el F1 sin significado.
#:
#: Se configura con ``OAPAT_BLOOM_THRESHOLD`` y el umbral usado queda registrado
#: en el informe de validación, porque cambiarlo cambia lo que significan las
#: métricas de clasificación.
BLOOM_THRESHOLD = float(os.environ.get("OAPAT_BLOOM_THRESHOLD", "50.0"))
OMS_ALERTA_1 = 25.0
OMS_ALERTA_2 = 50.0

# Columnas que el resto de la fase espera en el histórico diario
COLUMNS = [
    "chlorophyll_a", "temp_surface", "total_phosphorus", "total_nitrogen",
    "wind_speed", "dissolved_oxygen", "microcystin", "solar_par", "ph", "turbidity",
]

# Alias admitidos en un CSV real → nombre canónico
CSV_ALIASES = {
    "chl_a": "chlorophyll_a", "chla": "chlorophyll_a", "chlorophyll": "chlorophyll_a",
    "temperature": "temp_surface", "temp": "temp_surface", "sst": "temp_surface",
    "tp": "total_phosphorus", "phosphorus": "total_phosphorus",
    "tn": "total_nitrogen", "nitrogen": "total_nitrogen",
    "wind": "wind_speed", "do": "dissolved_oxygen", "oxygen": "dissolved_oxygen",
    "mc": "microcystin", "microcystin_lr": "microcystin",
    "par": "solar_par", "time": "timestamp", "date": "timestamp", "fecha": "timestamp",
}


@dataclass(frozen=True)
class DatasetInfo:
    source: str            # "csv" | "synthetic"
    path: str | None
    rows: int
    start: str
    end: str
    fingerprint: str       # hash del contenido: identifica el dataset en el informe
    note: str


def _fingerprint(df: pd.DataFrame) -> str:
    return hashlib.sha256(pd.util.hash_pandas_object(df, index=True).values.tobytes()).hexdigest()[:16]


def _to_daily(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    presentes = [c for c in COLUMNS if c in df.columns]
    daily = (
        df.set_index("timestamp")[presentes]
        .apply(pd.to_numeric, errors="coerce")
        .resample("1D").mean()
        .dropna(subset=["chlorophyll_a"])
    )
    for c in COLUMNS:
        if c not in daily.columns:
            daily[c] = float("nan")
    daily["bloom_event"] = (daily["chlorophyll_a"] >= BLOOM_THRESHOLD).astype(int)
    return daily[COLUMNS + ["bloom_event"]].reset_index()


def _load_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = [CSV_ALIASES.get(c.strip().lower(), c.strip().lower()) for c in df.columns]
    if "timestamp" not in df.columns:
        raise ValueError(f"El CSV {path} no tiene columna 'timestamp' (ni alias time/date/fecha)")
    if "chlorophyll_a" not in df.columns:
        raise ValueError(f"El CSV {path} no tiene columna 'chlorophyll_a' (ni alias chl_a/chla)")
    return _to_daily(df)


def _load_synthetic(basin_id: str, days: int, seed: int) -> pd.DataFrame:
    # aquatwin/ vive junto a early_warning/ dentro de gd_python/
    raiz = str(Path(__file__).resolve().parents[1])
    if raiz not in sys.path:
        sys.path.insert(0, raiz)
    from aquatwin.datos import generar_serie  # noqa: WPS433 — import diferido a propósito

    serie = generar_serie(basin_id if basin_id in ("basin-san-roque", "basin-titicaca-puno", "basin-paso-piedras")
                          else "basin-san-roque", dias=days, semilla=seed)
    serie = serie[serie["calidad"] == "bueno"]
    serie = serie.rename(columns={"tiempo": "timestamp"})
    return _to_daily(serie)


def load_history(basin_id: str, days: int = 365, seed: int = 42) -> tuple[pd.DataFrame, DatasetInfo]:
    """Histórico diario + ficha de procedencia. Usa el dataset real (fcr_oapat.csv) por defecto."""
    csv_env = os.environ.get("OAPAT_DATASET_CSV")
    default_real_csv = Path(__file__).resolve().parent / "data" / "datasets" / "fcr_oapat.csv"

    # Si se fuerza modo sintético explícito mediante OAPAT_DATASET=synthetic
    if os.environ.get("OAPAT_DATASET") == "synthetic":
        daily = _load_synthetic(basin_id, days, seed)
        info = DatasetInfo(
            source="synthetic", path=None, rows=len(daily),
            start=str(daily["timestamp"].min()), end=str(daily["timestamp"].max()),
            fingerprint=_fingerprint(daily),
            note="Histórico SIMULADO por el generador fenomenológico del gemelo.",
        )
        return daily, info

    target_path = Path(csv_env) if csv_env else default_real_csv

    # Resolver rutas relativas si no existen en el CWD actual
    if not target_path.exists():
        candidates = [
            Path(__file__).resolve().parent / "data" / "datasets" / target_path.name,
            Path(__file__).resolve().parents[1] / target_path,
            Path(os.getcwd()) / target_path
        ]
        for candidate in candidates:
            if candidate.exists():
                target_path = candidate
                break

    if target_path.exists():
        daily = _load_csv(target_path)
        info = DatasetInfo(
            source="csv", path=str(target_path), rows=len(daily),
            start=str(daily["timestamp"].min()), end=str(daily["timestamp"].max()),
            fingerprint=_fingerprint(daily),
            note=f"Dataset REAL cargado desde CSV ({target_path.name}). Mediciones observadas in-situ de Falling Creek Reservoir (Virginia Reservoirs LTREB / ERA5).",
        )
        return daily, info

    daily = _load_synthetic(basin_id, days, seed)
    info = DatasetInfo(
        source="synthetic", path=None, rows=len(daily),
        start=str(daily["timestamp"].min()), end=str(daily["timestamp"].max()),
        fingerprint=_fingerprint(daily),
        note="Histórico SIMULADO por el generador fenomenológico del gemelo (semilla fija).",
    )
    return daily, info
