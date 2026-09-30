"""Importador del dataset THQBCA de Lago Taihu al contrato de OAPAT.

Dataset
-------
«A comprehensive natural-human time-series dataset linked to cyanobacterial
blooms in Lake Taihu» (THQBCA v1), Zenodo, DOI 10.5281/zenodo.11044483,
licencia **CC-BY-4.0** (uso comercial permitido citando la fuente).
Publicado en *Scientific Data* 11, 1365 (2024), DOI 10.1038/s41597-024-04224-w.

Por qué Taihu
-------------
Es el lago con floraciones de *Microcystis* mejor documentado del mundo y el
caso de estudio canónico de la literatura HAB. Sus variables —clorofila-a,
fósforo total, nitrógeno total, temperatura, viento— son justo las que consume
el motor del gemelo, así que el pronóstico se valida contra el mismo fenómeno
que el sistema dice vigilar.

Qué hace este módulo
--------------------
Recorre el dataset extraído, localiza las tablas de calidad de agua y clima,
las normaliza al contrato de ``datasets.py`` (``timestamp`` + las columnas
canónicas en las unidades del catálogo) y escribe un único CSV listo para
``OAPAT_DATASET_CSV``.

Uso::

    python -m early_warning.import_taihu <carpeta_extraida> [-o taihu_oapat.csv]

No se inventa ninguna variable: lo que el dataset no trae se deja vacío y el
control de calidad de la Fase 2 lo tratará como ausente.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

# Columna canónica ← posibles nombres en el dataset (minúsculas, sin espacios).
# Taihu publica en inglés con abreviaturas habituales de limnología.
MAPA: dict[str, tuple[str, ...]] = {
    "chlorophyll_a": ("chla", "chl_a", "chl-a", "chlorophylla", "chlorophyll_a", "chlorophyll"),
    "temp_surface": ("wt", "watertemperature", "water_temp", "temperature", "temp", "sst", "tw"),
    "total_phosphorus": ("tp", "total_phosphorus", "totalphosphorus", "totalp"),
    "total_nitrogen": ("tn", "total_nitrogen", "totalnitrogen", "totaln"),
    "wind_speed": ("ws", "wind", "wind_speed", "windspeed"),
    "dissolved_oxygen": ("do", "dissolved_oxygen", "dissolvedoxygen"),
    "turbidity": ("turb", "turbidity", "ntu"),
    "ph": ("ph",),
    "solar_par": ("par", "solar_radiation", "radiation", "srad", "ssd", "sunshine"),
    "microcystin": ("mc", "microcystin", "microcystins", "mc_lr", "mclr"),
}
TIEMPO = ("date", "time", "timestamp", "datetime", "day", "sampling_date", "fecha")


def _norm(c: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(c).strip().lower())


def _renombrar(df: pd.DataFrame) -> pd.DataFrame:
    """Traduce las columnas del dataset a los nombres canónicos del proyecto."""
    ren: dict[str, str] = {}
    for col in df.columns:
        n = _norm(col)
        if n in {_norm(t) for t in TIEMPO}:
            ren[col] = "timestamp"
            continue
        for canon, alias in MAPA.items():
            if n in {_norm(a) for a in alias}:
                ren[col] = canon
                break
    return df.rename(columns=ren)


def _leer(path: Path) -> pd.DataFrame | None:
    try:
        if path.suffix.lower() in (".csv", ".txt"):
            return pd.read_csv(path, low_memory=False)
        if path.suffix.lower() in (".xlsx", ".xls"):
            return pd.read_excel(path)
    except Exception:
        return None
    return None


def explorar(raiz: Path) -> list[tuple[Path, list[str]]]:
    """Lista las tablas del dataset y qué variables canónicas aporta cada una."""
    hallazgos = []
    for p in sorted(raiz.rglob("*")):
        if p.suffix.lower() not in (".csv", ".txt", ".xlsx", ".xls") or p.stat().st_size > 200_000_000:
            continue
        df = _leer(p)
        if df is None or df.empty:
            continue
        canon = [c for c in _renombrar(df).columns if c in MAPA or c == "timestamp"]
        if "timestamp" in canon and any(c in MAPA for c in canon):
            hallazgos.append((p, canon))
    return hallazgos


def construir(raiz: Path, salida: Path) -> pd.DataFrame:
    """Funde todas las tablas útiles en una serie diaria con el contrato de OAPAT."""
    piezas: list[pd.DataFrame] = []
    for path, canon in explorar(raiz):
        df = _renombrar(_leer(path))
        cols = ["timestamp"] + [c for c in MAPA if c in df.columns]
        if len(cols) < 2:
            continue
        sub = df[cols].copy()
        sub["timestamp"] = pd.to_datetime(sub["timestamp"], errors="coerce", utc=True)
        sub = sub.dropna(subset=["timestamp"])
        for c in cols[1:]:
            sub[c] = pd.to_numeric(sub[c], errors="coerce")
        # Media diaria: el dataset trae varias estaciones por fecha
        piezas.append(sub.set_index("timestamp").resample("1D").mean())
        print(f"  · {path.name}: {', '.join(cols[1:])} ({len(sub)} filas)")

    if not piezas:
        raise SystemExit("No se encontró ninguna tabla con timestamp + variables reconocidas.")

    fundido = piezas[0]
    for p in piezas[1:]:
        fundido = fundido.combine_first(p)

    fundido = fundido.dropna(subset=["chlorophyll_a"]).sort_index()
    fundido.index.name = "timestamp"
    fundido.reset_index().to_csv(salida, index=False)
    return fundido


def main() -> None:
    ap = argparse.ArgumentParser(description="Convierte THQBCA (Lago Taihu) al CSV de OAPAT.")
    ap.add_argument("carpeta", type=Path, help="Carpeta con el dataset extraído")
    ap.add_argument("-o", "--salida", type=Path, default=Path("taihu_oapat.csv"))
    ap.add_argument("--solo-explorar", action="store_true", help="Lista las tablas y sale")
    args = ap.parse_args()

    if not args.carpeta.exists():
        raise SystemExit(f"No existe: {args.carpeta}")

    if args.solo_explorar:
        for path, canon in explorar(args.carpeta):
            print(f"{path.relative_to(args.carpeta)} → {', '.join(canon)}")
        return

    print(f"Explorando {args.carpeta} …")
    df = construir(args.carpeta, args.salida)
    print(f"\nCSV escrito: {args.salida}")
    print(f"  filas: {len(df)}  ·  periodo: {df.index.min().date()} → {df.index.max().date()}")
    print(f"  columnas con datos: {[c for c in df.columns if df[c].notna().any()]}")
    print(f"  cobertura de clorofila-a: {df['chlorophyll_a'].notna().mean() * 100:.1f} %")
    print(f"\nActívalo con:  $env:OAPAT_DATASET_CSV = '{args.salida.resolve()}'")


if __name__ == "__main__":
    main()
