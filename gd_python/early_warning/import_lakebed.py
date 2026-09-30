"""Importador de LakeBeD-US al contrato de OAPAT.

Dataset
-------
**LakeBeD-US: Computer Science Edition**, Hugging Face
``eco-kgml/LakeBeD-US-CSE`` (DOI 10.57967/hf/3771), licencia **CC-BY-4.0**.
Artículo: *LakeBeD-US: a benchmark dataset for lake water quality time series
and vertical profiles*, Earth System Science Data 17, 3141 (2025),
DOI 10.5194/essd-17-3141-2025.

21 lagos de EE. UU. monitorizados por NTL-LTER, NEON, NWT-LTER y el Carey Lab,
armonizados en Parquet. Incluye clorofila-a, ficocianina, nutrientes,
temperatura y oxígeno.

Por qué sirve donde otros no
----------------------------
El requisito duro del motor es una serie de **clorofila-a medida** con cadencia
compatible con un horizonte de 7–14 días. Lake Mendota (``ME``) aporta 343
fechas entre 1999 y 2023 con **mediana de 14 días** entre muestras: encaja con
el horizonte de 14 días del plan sin forzar nada.

Estructura de los ficheros
--------------------------
Los ``*_2D.parquet`` son formato ancho con ``datetime``, ``depth``, ``flag`` y
una columna por variable. Este importador toma la **capa superficial**
(``depth <= profundidad_max``), promedia por día y renombra al contrato de
``datasets.py``.

Uso::

    python -m early_warning.import_lakebed <carpeta_parquet> -o mendota_oapat.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

#: Columna de LakeBeD → columna canónica de OAPAT
MAPA = {
    "chla_ugl": "chlorophyll_a",      # µg/L
    "temp": "temp_surface",           # °C
    "do": "dissolved_oxygen",         # mg/L
    "tp": "total_phosphorus",         # µg/L en LakeBeD → se convierte a mg/L
    "tn": "total_nitrogen",           # µg/L en LakeBeD → se convierte a mg/L
    "par": "solar_par",
    "phyco_rfu": "phycocyanin",
    "phyco_ugl": "phycocyanin",
    "chla_rfu": "chlorophyll_rfu",
}

#: Variables que LakeBeD publica en µg/L y el catálogo de OAPAT espera en mg/L
A_MGL = {"total_phosphorus", "total_nitrogen"}

#: Banderas de calidad de LakeBeD que invalidan el valor.
#: LakeBeD usa 0 = sin problema; el resto son avisos de distinto tipo. Se
#: conservan los avisos leves y se descarta solo lo marcado como no fiable,
#: porque el control de calidad de la Fase 2 volverá a evaluarlo después.
FLAGS_DESCARTE: set[int] = set()


def cargar(carpeta: Path, profundidad_max: float = 2.0) -> pd.DataFrame:
    """Funde los Parquet de una carpeta en una serie diaria de superficie."""
    piezas: list[pd.DataFrame] = []

    for p in sorted(carpeta.rglob("*.parquet")):
        df = pd.read_parquet(p)
        if "datetime" not in df.columns:
            continue

        df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
        if "depth" in df.columns:
            df = df[df["depth"].isna() | (df["depth"] <= profundidad_max)]
        if FLAGS_DESCARTE and "flag" in df.columns:
            df = df[~df["flag"].isin(FLAGS_DESCARTE)]

        cols = {c: MAPA[c] for c in df.columns if c in MAPA}
        if not cols:
            continue

        sub = df[["datetime"] + list(cols)].rename(columns=cols)
        # Varias medidas por día y profundidad → media diaria de superficie
        diario = sub.set_index("datetime").resample("1D").mean(numeric_only=True)
        piezas.append(diario)
        print(f"  · {p.name}: {', '.join(sorted(set(cols.values())))} "
              f"({len(sub)} filas → {diario.notna().any(axis=1).sum()} días)")

    if not piezas:
        raise SystemExit("Ningún Parquet con columnas reconocibles.")

    fundido = piezas[0]
    for q in piezas[1:]:
        fundido = fundido.combine_first(q)

    # Unidades: LakeBeD da nutrientes en µg/L; el catálogo de OAPAT usa mg/L
    for col in A_MGL:
        if col in fundido.columns:
            fundido[col] = fundido[col] / 1000.0

    fundido = fundido.dropna(subset=["chlorophyll_a"]).sort_index()
    fundido.index.name = "timestamp"
    return fundido


def informe(df: pd.DataFrame) -> None:
    f = pd.Series(df.index)
    d = f.diff().dt.days.dropna()
    print(f"\n  filas (con clorofila-a): {len(df)}")
    print(f"  periodo: {df.index.min().date()} → {df.index.max().date()}")
    print(f"  separación entre muestras: mediana {d.median():.0f} d "
          f"(p25 {d.quantile(.25):.0f}, p75 {d.quantile(.75):.0f})")
    chl = df["chlorophyll_a"]
    print(f"  clorofila-a: {chl.min():.1f}–{chl.max():.1f} µg/L (mediana {chl.median():.1f})")
    print(f"  eventos ≥25 µg/L: {(chl >= 25).sum()} · ≥50 µg/L: {(chl >= 50).sum()}")
    print("  cobertura por variable:")
    for c in df.columns:
        cob = df[c].notna().mean() * 100
        if cob > 0:
            print(f"    {c:20s} {cob:5.1f} %")


def main() -> None:
    ap = argparse.ArgumentParser(description="Convierte LakeBeD-US al CSV de OAPAT.")
    ap.add_argument("carpeta", type=Path, help="Carpeta con los .parquet de un lago")
    ap.add_argument("-o", "--salida", type=Path, default=Path("lakebed_oapat.csv"))
    ap.add_argument("--profundidad-max", type=float, default=2.0,
                    help="Profundidad máxima considerada superficie (m)")
    args = ap.parse_args()

    if not args.carpeta.exists():
        raise SystemExit(f"No existe: {args.carpeta}")

    print(f"Leyendo {args.carpeta} …")
    df = cargar(args.carpeta, args.profundidad_max)
    df.reset_index().to_csv(args.salida, index=False)
    informe(df)
    print(f"\nCSV escrito: {args.salida.resolve()}")
    print(f'Actívalo con:  $env:OAPAT_DATASET_CSV = "{args.salida.resolve()}"')


if __name__ == "__main__":
    main()
