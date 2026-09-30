"""Importador de Falling Creek Reservoir (LakeBeD-US) al contrato de OAPAT.

Por qué este embalse y no Lake Mendota
--------------------------------------
Mendota aporta clorofila **de laboratorio** en µg/L, pero con cadencia
quincenal: a 7 días solo quedan 6 pares válidos frente a 221 a 14 días. La
mitad del horizonte prometido por el plan no era evaluable, y ninguna
metodología CRISP-DM seria (validación cruzada, búsqueda de hiperparámetros,
contraste estadístico) tiene potencia con 43 orígenes y 5 eventos.

La boya de Mendota sí es diaria, pero publica clorofila en **RFU**, y
calibrarla a µg/L no se sostiene: R² global 0,20, cambio de sensor en 2019
(la escala pasa de millares a unidades) y, calibrando por año, 10–16 puntos
con R² entre 0,02 y 0,81. Usar esa calibración como variable objetivo sería
reportar el error de la calibración disfrazado de capacidad predictiva.

**Falling Creek Reservoir (FCR)** resuelve ambas cosas sin inventar nada:

- Clorofila de alta frecuencia **ya publicada en µg/L** (272 401 medidas,
  2018–2023) → 1 913 pares válidos a 7 días y 1 899 a 14 días.
- **Ficocianina** en la misma sonda, 1 926 días: el pigmento específico de
  cianobacterias que el plan lista y Mendota no tenía.
- Es un **embalse** de agua potable gestionado con oxigenación hipolimnética
  y mezcla epilimnética pulsada; es decir, un sistema con **actuadores
  reales**, el mismo objeto que San Roque y no un lago natural.
- Caudal de entrada, nutrientes de laboratorio y disco de Secchi.

Salvedad que viaja con el dato
------------------------------
La sonda está fija a **1,6 m** y lee **7,9 µg/L por debajo** de la clorofila
extraída en laboratorio, con correlación baja (r = 0,15 emparejando a ±3 h y
±0,5 m; n = 130). Es el desacoplamiento conocido entre fluorescencia in situ y
clorofila extraída (apagado no fotoquímico, migración vertical de
cianobacterias). Consecuencia operativa: aplicar el umbral de 25 µg/L sobre la
sonda **sub-alerta**. Esto queda en la ficha del dataset y en el informe, no
escondido, y las muestras de laboratorio se conservan aparte como comprobación
independiente.

Fuentes
-------
- **LakeBeD-US: Computer Science Edition**, Hugging Face ``eco-kgml/LakeBeD-US-CSE``
  (DOI 10.57967/hf/3771), licencia **CC-BY-4.0**. Artículo: *LakeBeD-US*,
  Earth System Science Data 17, 3141 (2025), DOI 10.5194/essd-17-3141-2025.
  Datos originales del Carey Lab / Virginia Reservoirs LTREB y la Western
  Virginia Water Authority.
- **Viento y radiación**: Open-Meteo Historical Weather API (reanálisis ERA5),
  licencia CC-BY-4.0, sin credenciales. Es **reanálisis**, no un anemómetro en
  el embalse: se declara como tal en la ficha, porque un reanálisis suaviza los
  extremos locales que importan para la mezcla del agua.

Uso::

    python -m early_warning.import_fcr <carpeta_parquet> -o fcr_oapat.csv
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

import pandas as pd

#: Coordenadas de FCR (Lake_Info.csv de LakeBeD) — para la meteorología.
FCR_LAT, FCR_LON = 37.30333, -79.8375

#: Profundidad máxima considerada "superficie". La sonda de FCR está a 1,6 m.
PROFUNDIDAD_SUPERFICIE = 2.0

#: Columna de LakeBeD → columna canónica de OAPAT.
MAPA = {
    "chla_ugl": "chlorophyll_a",      # µg/L — alta frecuencia Y laboratorio
    "phyco": "phycocyanin",           # µg/L (sonda EXO)
    "temp": "temp_surface",           # °C
    "do": "dissolved_oxygen",         # mg/L
    "fdom": "fdom",                   # QSU — materia orgánica disuelta fluorescente
    "par": "solar_par",               # µmol/m²/s
    "tp": "total_phosphorus",         # µg/L en LakeBeD → mg/L
    "tn": "total_nitrogen",           # µg/L en LakeBeD → mg/L
    "drp": "soluble_phosphorus",      # µg/L → mg/L
    "nh4": "ammonium",                # µg/L → mg/L
    "no3no2": "nitrate",              # µg/L → mg/L
    "doc": "doc",                     # mg/L
    "inflow": "inflow",               # m³/s
    "secchi": "secchi",               # m
}

#: Variables que LakeBeD publica en µg/L y el catálogo de OAPAT espera en mg/L.
A_MGL = {"total_phosphorus", "total_nitrogen", "soluble_phosphorus", "ammonium", "nitrate"}

#: Variables de laboratorio: se muestrean cada ~2 semanas y varían despacio.
#: Se interpolan linealmente **dentro de huecos acotados** (ver LIMITE_INTERP).
#: Es práctica limnológica estándar para nutrientes, pero crea valores que nadie
#: midió: la fracción interpolada se publica por variable en el informe de EDA
#: para que quien lea las métricas sepa cuánto del dato es observación.
LENTAS = ("total_phosphorus", "total_nitrogen", "soluble_phosphorus",
          "ammonium", "nitrate", "doc", "secchi")

#: Hueco máximo, en días, que se rellena por interpolación. Por encima queda NaN.
#: 21 días ≈ 1,5 veces la cadencia nominal de muestreo del laboratorio.
LIMITE_INTERP = 21


def _leer_parquet(p: Path) -> pd.DataFrame | None:
    df = pd.read_parquet(p)
    if "datetime" not in df.columns:
        return None
    df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
    if "depth" in df.columns:
        df = df[df["depth"].isna() | (df["depth"] <= PROFUNDIDAD_SUPERFICIE)]
    cols = {c: MAPA[c] for c in df.columns if c in MAPA}
    if not cols:
        return None
    sub = df[["datetime"] + list(cols)].rename(columns=cols)
    return sub.set_index("datetime").resample("1D").mean(numeric_only=True)


#: Prefijo de los archivos del embalse. LakeBeD nombra cada archivo con el
#: ``lake_id`` delante, y una carpeta puede contener varios embalses: sin este
#: filtro se promediarían Falling Creek y Beaverdam en una sola serie, que es
#: un error de integridad silencioso —los números salen, pero describen un
#: cuerpo de agua que no existe—.
PREFIJO = "FCR_"


def cargar_lakebed(carpeta: Path, prefijo: str = PREFIJO) -> pd.DataFrame:
    """Funde los Parquet de FCR en una serie diaria de superficie."""
    piezas: list[pd.DataFrame] = []
    descartados: list[str] = []
    for p in sorted(carpeta.rglob("*.parquet")):
        if not p.name.startswith(prefijo):
            descartados.append(p.name)
            continue
        diario = _leer_parquet(p)
        if diario is None:
            continue
        piezas.append(diario)
        print(f"  · {p.name}: {', '.join(sorted(diario.columns))} "
              f"({diario.notna().any(axis=1).sum()} días)")
    if descartados:
        print(f"  (descartados por no ser de {prefijo.rstrip('_')}: {', '.join(descartados)})")
    if not piezas:
        raise SystemExit(f"No se encontró ningún Parquet de {prefijo} en {carpeta}")

    # Varios archivos aportan la misma variable (sonda y laboratorio dan
    # chlorophyll_a). Se promedian por día; el laboratorio es tan escaso frente
    # a la sonda que en la práctica manda la sonda, y así se declara.
    fundido = pd.concat(piezas).groupby(level=0).mean()
    for c in fundido.columns:
        if c in A_MGL:
            fundido[c] = fundido[c] / 1000.0
    return fundido


def cargar_meteorologia(inicio: str, fin: str, cache: Path | None = None) -> pd.DataFrame:
    """Viento, radiación, temperatura del aire y lluvia (Open-Meteo / ERA5)."""
    if cache and cache.exists():
        print(f"  · meteorología desde caché {cache.name}")
        m = pd.read_csv(cache)
        m["datetime"] = pd.to_datetime(m["datetime"], utc=True)
        return m.set_index("datetime")

    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={FCR_LAT}&longitude={FCR_LON}"
        f"&start_date={inicio}&end_date={fin}"
        "&daily=wind_speed_10m_mean,wind_speed_10m_max,shortwave_radiation_sum,"
        "temperature_2m_mean,precipitation_sum"
        "&timezone=UTC&wind_speed_unit=ms"
    )
    with urllib.request.urlopen(url, timeout=180) as r:
        d = json.load(r)["daily"]
    m = pd.DataFrame({
        "datetime": pd.to_datetime(d["time"], utc=True),
        "wind_speed": d["wind_speed_10m_mean"],
        "wind_max": d["wind_speed_10m_max"],
        "solar_radiation": d["shortwave_radiation_sum"],
        "air_temp": d["temperature_2m_mean"],
        "precipitation": d["precipitation_sum"],
    }).set_index("datetime")
    print(f"  · meteorología Open-Meteo/ERA5: {len(m)} días {inicio}..{fin}")
    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        m.reset_index().to_csv(cache, index=False)
    return m


def interpolar_lentas(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, float]]:
    """Rellena huecos acotados de las variables de laboratorio.

    Devuelve el marco y la **fracción interpolada** de cada variable, que es
    información obligatoria: una métrica calculada sobre una variable 80 %
    interpolada no significa lo mismo que sobre una medida.
    """
    fracciones: dict[str, float] = {}
    for c in LENTAS:
        if c not in df.columns:
            continue
        antes = df[c].notna()
        df[c] = df[c].interpolate(method="time", limit=LIMITE_INTERP, limit_area="inside")
        despues = df[c].notna()
        nuevos = int((despues & ~antes).sum())
        fracciones[c] = round(nuevos / max(int(despues.sum()), 1), 4)
    return df, fracciones


def construir(carpeta: Path, cache_meteo: Path | None = None,
              prefijo: str = PREFIJO) -> tuple[pd.DataFrame, dict]:
    print("Leyendo LakeBeD (Falling Creek Reservoir)…")
    lb = cargar_lakebed(carpeta, prefijo)
    lb = lb.dropna(subset=["chlorophyll_a"])
    if lb.empty:
        raise SystemExit("No hay clorofila-a tras filtrar por superficie.")

    inicio, fin = lb.index.min().date().isoformat(), lb.index.max().date().isoformat()
    print("Descargando meteorología…")
    meteo = cargar_meteorologia(inicio, fin, cache_meteo)

    df = lb.join(meteo, how="left")
    df.index.name = "timestamp"
    df, fracciones = interpolar_lentas(df)

    procedencia = {
        "embalse": "Falling Creek Reservoir (FCR), Vinton, Virginia, EE. UU.",
        "coordenadas": [FCR_LAT, FCR_LON],
        "fuente_agua": "LakeBeD-US CSE (eco-kgml/LakeBeD-US-CSE), CC-BY-4.0, "
                       "DOI 10.5194/essd-17-3141-2025 — Carey Lab / Virginia Reservoirs LTREB",
        "fuente_meteo": "Open-Meteo Historical Weather API (reanálisis ERA5), CC-BY-4.0",
        "profundidad_superficie_m": PROFUNDIDAD_SUPERFICIE,
        "interpolacion": {"limite_dias": LIMITE_INTERP, "fraccion_interpolada": fracciones},
        "sesgo_sonda_vs_laboratorio_ugl": -7.9,
        "correlacion_sonda_laboratorio_r": 0.15,
        "advertencia": (
            "La clorofila-a procede mayoritariamente de una sonda de fluorescencia fija a 1,6 m. "
            "Lee ~7,9 µg/L por debajo de la clorofila extraída en laboratorio y correlaciona poco "
            "con ella (r=0,15, n=130). Aplicar los umbrales de la OMS sobre este valor SUB-ALERTA. "
            "El viento es reanálisis ERA5, no un anemómetro en el embalse."
        ),
        "rango": [inicio, fin],
        "dias": int(len(df)),
    }
    return df.reset_index(), procedencia


def main() -> None:
    ap = argparse.ArgumentParser(description="Convierte los Parquet de FCR al CSV de OAPAT.")
    ap.add_argument("carpeta", type=Path, help="Carpeta con los .parquet de FCR")
    ap.add_argument("-o", "--salida", type=Path, default=Path("fcr_oapat.csv"))
    ap.add_argument("--cache-meteo", type=Path, default=None)
    ap.add_argument("--prefijo", default=PREFIJO,
                    help="Prefijo de archivo del embalse (evita mezclar lagos)")
    args = ap.parse_args()

    df, proc = construir(args.carpeta, args.cache_meteo, args.prefijo)
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.salida, index=False)
    (args.salida.with_suffix(".procedencia.json")).write_text(
        json.dumps(proc, indent=2, ensure_ascii=False), encoding="utf8")

    print(f"\nEscrito {args.salida} — {len(df)} días, {df.shape[1] - 1} variables")
    print(f"Procedencia en {args.salida.with_suffix('.procedencia.json')}")
    print("\nCobertura por variable:")
    for c in df.columns:
        if c == "timestamp":
            continue
        n = int(df[c].notna().sum())
        marca = "  (interp. %.0f%%)" % (100 * proc["interpolacion"]["fraccion_interpolada"][c]) \
            if c in proc["interpolacion"]["fraccion_interpolada"] else ""
        print(f"  {c:22s} {n:5d} días ({100*n/len(df):5.1f} %){marca}")


if __name__ == "__main__":
    main()
