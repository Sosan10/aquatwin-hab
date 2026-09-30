"""
Catálogo de entidades y generador de la serie histórica del gemelo.

Dos fuentes distintas, y la diferencia importa para la interpretabilidad:

1. **Catálogo** (`EMBALSES`, `ESTACIONES`, `ACTUADORES`) — portado desde
   `src/data/mockData.ts` del gemelo web. Son datos de configuración
   descriptivos de cuerpos de agua reales (San Roque, Bahía de Puno,
   Paso de las Piedras).

2. **Serie histórica** (`generar_serie`) — **simulada**, no medida. Se genera
   con un modelo determinista y sembrado que reproduce la fenomenología
   limnológica conocida: ciclo diario de temperatura y radiación, producción
   fotosintética y respiración nocturna del oxígeno, mezcla por viento y
   crecimiento logístico de la biomasa.

   Se declara como simulada en toda la interfaz. Un gemelo digital sin
   telemetría real conectada es un simulador, y presentarlo de otro modo
   invalidaría cualquier conclusión.

El generador es determinista: con la misma semilla produce exactamente la misma
serie, de modo que las figuras del informe son reproducibles.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .dominio import (
    Actuador,
    CalidadDato,
    Embalse,
    Estacion,
    EstadoTrofico,
    VARIABLES,
)

# ---------------------------------------------------------------------------
# 1. Catálogo (portado de mockData.ts)
# ---------------------------------------------------------------------------

EMBALSES: list[Embalse] = [
    Embalse(
        id="basin-san-roque",
        nombre="Embalse San Roque",
        ubicacion="Valle de Punilla, Córdoba",
        pais="Argentina",
        lat=-31.3789,
        lng=-64.4623,
        area_km2=35.0,
        prof_max_m=35.3,
        prof_media_m=13.5,
        volumen_hm3=201.0,
        estado_trofico=EstadoTrofico.HIPEREUTROFICO,
        uso_principal="Agua potable",
        sensor_satelital="Sentinel-2 MSI",
    ),
    Embalse(
        id="basin-titicaca-puno",
        nombre="Bahía Interior de Puno (Lago Titicaca)",
        ubicacion="Puno",
        pais="Perú",
        lat=-15.8291,
        lng=-70.0154,
        area_km2=17.5,
        prof_max_m=9.2,
        prof_media_m=4.8,
        volumen_hm3=84.0,
        estado_trofico=EstadoTrofico.EUTROFICO,
        uso_principal="Acuicultura / Ecología",
        sensor_satelital="Landsat-9 OLI-2",
    ),
    Embalse(
        id="basin-paso-piedras",
        nombre="Embalse Paso de las Piedras",
        ubicacion="Bahía Blanca, Buenos Aires",
        pais="Argentina",
        lat=-38.3750,
        lng=-61.8083,
        area_km2=40.0,
        prof_max_m=28.0,
        prof_media_m=11.2,
        volumen_hm3=320.0,
        estado_trofico=EstadoTrofico.MESOTROFICO,
        uso_principal="Agua potable",
        sensor_satelital="Sentinel-3 OLCI",
    ),
]

ESTACIONES: list[Estacion] = [
    Estacion("est-01", "Garganta y Vertedero", "SRQ-IOT-01", "basin-san-roque",
             -31.3782, -64.4618, 2.2, -1.8, 32.5, 94.0),
    Estacion("est-02", "Bahía de San Antonio", "SRQ-IOT-02", "basin-san-roque",
             -31.3912, -64.4754, -3.5, 2.4, 8.4, 88.0),
    Estacion("est-03", "Desembocadura Río Cosquín", "SRQ-IOT-03", "basin-san-roque",
             -31.3620, -64.4680, 0.8, -4.5, 14.0, 98.0),
    Estacion("est-04", "Toma de Agua Potable", "SRQ-IOT-04", "basin-san-roque",
             -31.3850, -64.4530, 4.1, 0.5, 22.0, 91.0),
    Estacion("est-05", "Bahía Interior — Muelle", "PUN-IOT-01", "basin-titicaca-puno",
             -15.8305, -70.0180, -2.0, 1.5, 6.0, 76.0),
    Estacion("est-06", "Bahía Interior — Isla Espinar", "PUN-IOT-02", "basin-titicaca-puno",
             -15.8250, -70.0090, 3.0, -2.0, 9.0, 82.0),
    Estacion("est-07", "Dique Principal", "PDP-IOT-01", "basin-paso-piedras",
             -38.3760, -61.8100, 1.0, 1.0, 26.0, 95.0),
    Estacion("est-08", "Cola del Embalse", "PDP-IOT-02", "basin-paso-piedras",
             -38.3700, -61.7900, -4.0, -3.0, 7.5, 89.0),
]

ACTUADORES: list[Actuador] = [
    Actuador("act-01", "Aireación hipolimnética A-1", "AIREADOR",
             "basin-san-roque", 2.2, -1.2, 85.0, "ACTIVO"),
    Actuador("act-02", "Emisor ultrasónico U-2", "ULTRASONICO",
             "basin-san-roque", -3.0, 2.0, 100.0, "ACTIVO", frecuencia_khz=28.5),
    Actuador("act-03", "Compuerta de desfogue de fondo", "COMPUERTA",
             "basin-san-roque", 3.8, -2.8, 30.0, "REPOSO", caudal_m3s=14.5),
    Actuador("act-04", "Aireador de bahía B-1", "AIREADOR",
             "basin-titicaca-puno", -2.0, 1.0, 60.0, "ACTIVO"),
    Actuador("act-05", "Aireador de dique D-1", "AIREADOR",
             "basin-paso-piedras", 1.0, 0.5, 40.0, "REPOSO"),
]


def embalse_por_id(bid: str) -> Embalse:
    for e in EMBALSES:
        if e.id == bid:
            return e
    raise KeyError(f"Embalse desconocido: {bid}")


def estaciones_de(bid: str) -> list[Estacion]:
    return [e for e in ESTACIONES if e.embalse_id == bid]


def actuadores_de(bid: str) -> list[Actuador]:
    return [a for a in ACTUADORES if a.embalse_id == bid]


# ---------------------------------------------------------------------------
# 2. Perfil limnológico por embalse — condiciones de contorno del simulador
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PerfilEmbalse:
    """
    Condiciones de contorno que diferencian el comportamiento de cada embalse.

    Sin esto, los tres embalses producirían la misma serie y el gemelo no
    distinguiría un cuerpo hipereutrófico de uno mesotrófico.
    """
    temp_media: float          # °C, media anual de superficie
    amplitud_diaria: float     # °C, oscilación día/noche
    fosforo_base: float        # mg/L
    nitrogeno_base: float      # mg/L
    biomasa_inicial: float     # µg/L de clorofila-a
    capacidad_carga: float     # µg/L, techo logístico de biomasa
    viento_medio: float        # km/h
    turbidez_base: float       # NTU


PERFILES: dict[str, PerfilEmbalse] = {
    # Hipereutrófico, cálido, con fuerte carga de nutrientes del Río San Antonio
    "basin-san-roque": PerfilEmbalse(24.8, 3.2, 0.32, 3.8, 45.0, 130.0, 5.0, 40.0),
    # Eutrófico somero de altura: frío pero muy somero y con alta carga urbana
    "basin-titicaca-puno": PerfilEmbalse(16.2, 4.5, 0.28, 3.2, 60.0, 110.0, 7.5, 30.0),
    # Mesotrófico, más profundo y ventoso: la mezcla limita la floración
    "basin-paso-piedras": PerfilEmbalse(21.4, 2.8, 0.09, 1.6, 12.0, 45.0, 14.0, 18.0),
}


# ---------------------------------------------------------------------------
# 3. Generador de serie histórica
# ---------------------------------------------------------------------------

def generar_serie(
    embalse_id: str,
    *,
    dias: int = 90,
    paso_horas: int = 1,
    semilla: int = 42,
    fraccion_huecos: float = 0.02,
    fraccion_sospechosos: float = 0.015,
) -> pd.DataFrame:
    """
    Genera la serie histórica simulada de todas las estaciones de un embalse.

    Modelo fenomenológico, no estadístico. Cada variable se construye a partir
    de procesos físicos y biológicos documentados, de modo que las relaciones
    que después descubra el modelo predictivo sean *causalmente coherentes* y
    no correlaciones espurias. Esto es lo que hace que las explicaciones SHAP
    del pronóstico signifiquen algo.

    Procesos representados
    ----------------------
    * **Temperatura** — estacionalidad + ciclo diario sinusoidal + ruido.
    * **Radiación PAR** — ciclo solar diurno, nulo de noche, atenuado por nubes.
    * **Viento** — proceso autorregresivo con episodios de calma persistente.
    * **Nutrientes** — nivel base del embalse + pulsos de escorrentía episódicos
      con decaimiento exponencial.
    * **Biomasa (clorofila-a)** — crecimiento logístico cuya tasa depende de
      temperatura (Q10), luz, fósforo disponible (Monod) y estabilidad de la
      columna de agua; con pérdida por mezcla cuando el viento es fuerte.
      Se distingue el **estado real** (evolución suave, ruido de proceso
      pequeño) de la **lectura del sensor** (estado + ruido de observación).
      Las demás variables se derivan del estado real, no de la lectura.
    * **Ficocianina** — fracción cianobacteriana de la biomasa, creciente con
      la temperatura y con la escasez relativa de nitrógeno (N:P bajo).
    * **Oxígeno disuelto** — saturación por temperatura, más producción
      fotosintética diurna proporcional a biomasa y luz, menos respiración
      nocturna proporcional a biomasa. Reproduce la hipoxia de madrugada.
    * **pH** — sube con la fotosíntesis por consumo de CO₂.
    * **Turbidez** — base del embalse más aporte de la propia biomasa.

    Calidad del dato
    ----------------
    Se inyectan deliberadamente huecos y valores sospechosos, porque un motor
    que solo funciona con datos perfectos no sirve para datos reales. Cada fila
    lleva su bandera `calidad` (esquema QARTOD).

    Returns
    -------
    DataFrame en formato largo por estación y marca de tiempo, con una columna
    por variable del catálogo más `calidad`.
    """
    if embalse_id not in PERFILES:
        raise KeyError(f"No hay perfil limnológico para el embalse '{embalse_id}'")

    perfil = PERFILES[embalse_id]
    estaciones = estaciones_de(embalse_id)
    rng = np.random.default_rng(semilla)

    n = int(dias * 24 / paso_horas)
    fin = pd.Timestamp.now().normalize() + pd.Timedelta(hours=23)
    tiempo = pd.date_range(end=fin, periods=n, freq=f"{paso_horas}h")

    hora = tiempo.hour.to_numpy().astype(float)
    dia_del_periodo = np.arange(n) * paso_horas / 24.0

    filas: list[pd.DataFrame] = []

    for idx, est in enumerate(estaciones):
        # Cada estación tiene su propio sesgo: las someras y abrigadas se
        # calientan más y acumulan más biomasa. Es lo que después explica la
        # heterogeneidad espacial del mapa.
        someridad = float(np.clip(1.0 - est.profundidad_m / 35.0, 0.05, 0.95))
        sesgo_termico = 1.2 * someridad - 0.3
        sesgo_nutriente = 0.55 + 1.1 * someridad
        abrigo = 0.45 + 0.5 * someridad      # abrigo del viento

        # --- Forzantes físicos -------------------------------------------
        estacional = 3.0 * np.sin(2 * np.pi * dia_del_periodo / 365.0)
        ciclo_diario = perfil.amplitud_diaria * np.sin(2 * np.pi * (hora - 9) / 24.0)
        temp = (
            perfil.temp_media
            + sesgo_termico
            + estacional
            + ciclo_diario
            + rng.normal(0, 0.35, n)
        )

        nubosidad = np.clip(rng.beta(2.0, 5.0, n), 0, 1)
        par_potencial = np.maximum(0.0, np.sin(np.pi * (hora - 6) / 12.0))
        par = 1850.0 * par_potencial * (1.0 - 0.65 * nubosidad)

        # Viento: AR(1) con episodios de calma que persisten varias horas
        viento = np.zeros(n)
        viento[0] = perfil.viento_medio
        for t in range(1, n):
            viento[t] = (
                0.88 * viento[t - 1]
                + 0.12 * perfil.viento_medio
                + rng.normal(0, 1.6)
            )
        viento = np.clip(viento * abrigo, 0.2, 60.0)

        # --- Nutrientes: base + pulsos de escorrentía ---------------------
        fosforo = np.full(n, perfil.fosforo_base * sesgo_nutriente)
        nitrogeno = np.full(n, perfil.nitrogeno_base * sesgo_nutriente)
        n_pulsos = max(1, int(dias / 22))
        for _ in range(n_pulsos):
            inicio = int(rng.integers(0, max(1, n - 48)))
            magnitud = float(rng.uniform(0.10, 0.30)) * sesgo_nutriente
            decaimiento = np.exp(-np.arange(n - inicio) / 60.0)
            fosforo[inicio:] += magnitud * decaimiento
            nitrogeno[inicio:] += magnitud * 7.0 * decaimiento
        fosforo = np.clip(fosforo + rng.normal(0, 0.008, n), 0.005, 3.0)
        nitrogeno = np.clip(nitrogeno + rng.normal(0, 0.06, n), 0.05, 30.0)

        # --- Biomasa: crecimiento logístico multifactorial -----------------
        # r = r_max · f(T) · f(luz) · f(P) · f(estabilidad)
        clorofila = np.zeros(n)
        clorofila[0] = perfil.biomasa_inicial * (0.7 + 0.6 * someridad)
        dt = paso_horas / 24.0

        for t in range(1, n):
            f_temp = 1.9 ** ((temp[t] - 20.0) / 10.0)                 # Q10 ≈ 1.9
            f_luz = par[t] / (par[t] + 350.0)                          # saturación lumínica
            f_p = fosforo[t] / (fosforo[t] + 0.03)                     # Monod, Ks = 0.03 mg/L
            f_estab = np.clip(1.25 - viento[t] / 16.0, 0.12, 1.0)      # mezcla vertical

            r = 0.62 * f_temp * f_luz * f_p * f_estab
            perdida = 0.10 + 0.016 * viento[t]                         # sedimentación y dilución

            crecimiento = r * clorofila[t - 1] * (1 - clorofila[t - 1] / perfil.capacidad_carga)
            # Ruido de PROCESO, pequeño: la biomasa evoluciona según la ecuación,
            # con perturbaciones menores. No debe acumularse como paseo aleatorio.
            clorofila[t] = max(
                0.6,
                clorofila[t - 1] + (crecimiento - perdida * clorofila[t - 1]) * dt
                + rng.normal(0, 0.12),
            )

        # Ruido de OBSERVACIÓN, aplicado al final sobre el estado ya calculado.
        #
        # La distinción entre ruido de proceso y de observación no es un detalle
        # técnico: si el ruido se inyecta dentro del bucle, se integra y la
        # biomasa deriva sin causa física, haciendo el sistema intrínsecamente
        # impredecible. El estado real evoluciona de forma suave; lo que es
        # imperfecto es la lectura del sensor.
        clorofila_real = clorofila.copy()
        clorofila = np.maximum(0.3, clorofila_real + rng.normal(0, 0.85, n))

        # --- Ficocianina: fracción cianobacteriana de la biomasa ----------
        # Aumenta con temperatura y cuando N:P es bajo (ventaja competitiva).
        np_ratio = np.clip(nitrogeno / np.maximum(fosforo, 1e-6), 1.0, 100.0)
        frac_ciano = np.clip(
            0.16
            + 0.030 * (temp - 20.0)
            + 0.32 * np.clip((16.0 - np_ratio) / 16.0, 0, 1),
            0.03,
            0.92,
        )
        ficocianina = clorofila_real * frac_ciano * 1150.0 + rng.normal(0, 400.0, n)
        ficocianina = np.maximum(0.0, ficocianina)

        # --- Oxígeno disuelto: saturación + fotosíntesis − respiración ----
        od_sat = 14.6 - 0.41 * temp + 0.0045 * temp**2          # aproximación de Weiss
        produccion = 0.055 * clorofila_real * (par / 1850.0)
        respiracion = 0.030 * clorofila_real
        od = np.clip(od_sat + produccion - respiracion + rng.normal(0, 0.22, n), 0.05, 22.0)
        od_sat_pct = np.clip(od / np.maximum(od_sat, 0.1) * 100.0, 1.0, 260.0)

        # --- pH y turbidez -------------------------------------------------
        ph = np.clip(7.5 + 0.019 * clorofila_real * (par / 1850.0) + rng.normal(0, 0.06, n), 6.0, 11.0)
        turbidez = np.clip(
            perfil.turbidez_base * (0.55 + 0.45 * someridad) + 0.34 * clorofila_real
            + rng.normal(0, 1.6, n),
            0.5,
            400.0,
        )

        # --- Microcistina estimada a partir de cianobacterias -------------
        # Relación empírica: no es una medición, es una estimación de cribado.
        microcistina = np.clip(ficocianina / 3400.0 + rng.normal(0, 0.30, n), 0.0, 160.0)

        df_est = pd.DataFrame(
            {
                "tiempo": tiempo,
                "estacion_id": est.id,
                "estacion": est.nombre,
                "codigo": est.codigo,
                "x": est.x,
                "z": est.z,
                "profundidad_m": est.profundidad_m,
                "temp_surface": temp,
                "solar_par": par,
                "wind_speed": viento,
                "total_phosphorus": fosforo,
                "total_nitrogen": nitrogeno,
                "chlorophyll_a": clorofila,
                "phycocyanin": ficocianina,
                "dissolved_oxygen": od,
                "od_saturacion_pct": od_sat_pct,
                "ph": ph,
                "turbidity": turbidez,
                "microcystin": microcistina,
                "np_ratio": np_ratio,
            }
        )
        filas.append(df_est)

    df = pd.concat(filas, ignore_index=True)
    df = _inyectar_calidad(df, rng, fraccion_huecos, fraccion_sospechosos)
    return df


def _inyectar_calidad(
    df: pd.DataFrame,
    rng: np.random.Generator,
    fraccion_huecos: float,
    fraccion_sospechosos: float,
) -> pd.DataFrame:
    """
    Introduce huecos y valores anómalos de sensor, y aplica control de calidad.

    Los datos reales no son perfectos: hay sondas sucias, pérdidas de
    comunicación y picos espurios. Un motor que no los contempla produce
    falsas alarmas en cuanto se conecta a un sensor de verdad.
    """
    df = df.copy()
    df["calidad"] = CalidadDato.BUENO.value
    n = len(df)

    # 1. Picos espurios de sensor (biofouling, burbuja en la celda óptica)
    n_pico = int(n * fraccion_sospechosos)
    if n_pico:
        idx = rng.choice(n, size=n_pico, replace=False)
        factor = rng.uniform(2.5, 5.0, n_pico)
        df.loc[idx, "chlorophyll_a"] = df.loc[idx, "chlorophyll_a"].to_numpy() * factor

    # 2. Huecos por pérdida de comunicación
    n_hueco = int(n * fraccion_huecos)
    if n_hueco:
        idx = rng.choice(n, size=n_hueco, replace=False)
        columnas = [c for c in VARIABLES if c in df.columns]
        df.loc[idx, columnas] = np.nan
        df.loc[idx, "calidad"] = CalidadDato.MALO.value

    return aplicar_control_calidad(df)


def aplicar_control_calidad(df: pd.DataFrame) -> pd.DataFrame:
    """
    Control de calidad QARTOD simplificado, aplicado por estación.

    Tres pruebas, en orden de severidad:

    1. **Rango físicamente válido** — un valor fuera del rango posible del
       instrumento es `MALO`. No se interpola: se descarta.
    2. **Prueba de pico (spike test)** — un valor que se aparta de sus vecinos
       tanto en desviaciones robustas (6·MAD) como en magnitud relativa
       (15 % de la mediana) es `SOSPECHOSO`. Exigir ambos criterios evita
       que una serie suave con tendencia se marque entera.
       Es el patrón de una sonda sucia, no de una floración: una floración real
       crece durante horas, no en un solo registro.
    3. **Valor estancado** — la misma lectura repetida indica sensor congelado.

    Los valores marcados como sospechosos **no se eliminan**: se conservan y se
    señalan, para que quien lea la figura decida. Eliminar silenciosamente un
    dato es una decisión que le corresponde al analista, no al motor.
    """
    df = df.sort_values(["estacion_id", "tiempo"]).copy()
    if "calidad" not in df.columns:
        df["calidad"] = CalidadDato.BUENO.value

    for clave, var in VARIABLES.items():
        if clave not in df.columns:
            continue

        # 1. Rango físico
        lo, hi = var.rango_valido
        fuera = df[clave].notna() & ((df[clave] < lo) | (df[clave] > hi))
        df.loc[fuera, "calidad"] = CalidadDato.MALO.value
        df.loc[fuera, clave] = np.nan

        # 2. Prueba de pico contra la mediana móvil, por estación.
        #
        # El umbral combina dos criterios y exige que se cumplan LOS DOS:
        #   a) desviación estadística: residuo > 6·MAD escalada
        #   b) desviación relativa:    residuo > 15 % de la mediana de la serie
        #
        # El criterio (b) es imprescindible. En una serie suave y con
        # tendencia —como la biomasa durante una floración— el residuo frente
        # a la mediana móvil es diminuto, la MAD tiende a cero y un umbral
        # puramente estadístico acabaría marcando como sospechosa la mitad de
        # la serie. Un pico de sensor real se aparta del entorno en magnitud
        # absoluta, no solo en unidades de dispersión.
        for est_id, grupo in df.groupby("estacion_id", sort=False):
            serie = grupo[clave]
            if serie.notna().sum() < 10:
                continue
            mediana_movil = serie.rolling(7, center=True, min_periods=3).median()
            residuo = (serie - mediana_movil).abs()
            mad = residuo.median()
            escala = abs(serie.median())
            if not np.isfinite(mad) or mad <= 0 or not np.isfinite(escala):
                continue

            umbral_estadistico = 6.0 * mad * 1.4826
            umbral_relativo = 0.15 * escala
            pico = (residuo > umbral_estadistico) & (residuo > umbral_relativo)

            marcar = grupo.index[pico.fillna(False)]
            ya_malo = df.loc[marcar, "calidad"] == CalidadDato.MALO.value
            df.loc[marcar[~ya_malo], "calidad"] = CalidadDato.SOSPECHOSO.value

    # 3. Valor estancado: 6 lecturas idénticas consecutivas de clorofila
    for est_id, grupo in df.groupby("estacion_id", sort=False):
        repetido = grupo["chlorophyll_a"].diff().abs() < 1e-9
        racha = repetido.rolling(6).sum()
        marcar = grupo.index[(racha >= 6).fillna(False)]
        df.loc[marcar, "calidad"] = CalidadDato.SOSPECHOSO.value

    return df.reset_index(drop=True)


def resumen_calidad(df: pd.DataFrame) -> pd.DataFrame:
    """Recuento y porcentaje de registros por bandera de calidad."""
    conteo = df["calidad"].value_counts().rename_axis("calidad").reset_index(name="registros")
    conteo["porcentaje"] = (conteo["registros"] / len(df) * 100).round(2)
    descripciones = {
        CalidadDato.BUENO.value: "Supera todas las pruebas de control de calidad.",
        CalidadDato.SOSPECHOSO.value: "Pico o estancamiento; se conserva pero se señala.",
        CalidadDato.MALO.value: "Fuera de rango físico o hueco de comunicación; se descarta.",
        CalidadDato.INTERPOLADO.value: "Reconstruido por interpolación entre vecinos.",
        CalidadDato.NO_EVALUADO.value: "Sin prueba de calidad aplicable.",
    }
    conteo["significado"] = conteo["calidad"].map(descripciones).fillna("—")
    return conteo


def datos_validos(df: pd.DataFrame) -> pd.DataFrame:
    """Subconjunto apto para modelado: excluye registros MALOS y SOSPECHOSOS."""
    return df[df["calidad"] == CalidadDato.BUENO.value].dropna(
        subset=[c for c in VARIABLES if c in df.columns]
    )
