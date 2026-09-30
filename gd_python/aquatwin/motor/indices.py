"""
Índices limnológicos derivados.

Cada índice devuelve un `ResultadoIndice` que incluye no solo el valor, sino la
fórmula aplicada, la interpretación de ese valor concreto y la referencia
bibliográfica. Es interpretabilidad por construcción: el número nunca viaja
solo.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..dominio import REDFIELD_NP, EstadoTrofico, NivelRiesgo


@dataclass(frozen=True)
class ResultadoIndice:
    """Valor de un índice acompañado de todo lo necesario para interpretarlo."""
    clave: str
    nombre: str
    valor: float
    unidad: str
    formula: str
    interpretacion: str
    referencia: str
    categoria: str = ""
    nivel: NivelRiesgo = NivelRiesgo.BAJO

    def __str__(self) -> str:
        return f"{self.nombre} = {self.valor:.2f} {self.unidad} → {self.categoria}"


# ---------------------------------------------------------------------------
# TSI de Carlson
# ---------------------------------------------------------------------------

def tsi_carlson(clorofila_ugl: float) -> ResultadoIndice:
    """
    Índice de Estado Trófico de Carlson calculado a partir de clorofila-a.

    TSI(Chl) = 9,81 · ln(Chl) + 30,6

    Es la métrica estándar para clasificar el grado de eutrofización. Se usa la
    variante de clorofila (y no la de disco de Secchi o fósforo) porque es la
    que mejor refleja la biomasa realmente presente.
    """
    chl = max(float(clorofila_ugl), 0.01)
    valor = 9.81 * math.log(chl) + 30.6

    if valor < 40:
        categoria, estado, nivel = "Oligotrófico", EstadoTrofico.OLIGOTROFICO, NivelRiesgo.BAJO
        interp = "Aguas claras, baja productividad. Sin riesgo de floración."
    elif valor < 50:
        categoria, estado, nivel = "Mesotrófico", EstadoTrofico.MESOTROFICO, NivelRiesgo.BAJO
        interp = "Productividad moderada. Floraciones ocasionales en verano."
    elif valor < 70:
        categoria, estado, nivel = "Eutrófico", EstadoTrofico.EUTROFICO, NivelRiesgo.MODERADO
        interp = (
            "Alta productividad. Floraciones probables en condiciones cálidas "
            "y estables; conviene vigilancia activa."
        )
    else:
        categoria, estado, nivel = "Hipereutrófico", EstadoTrofico.HIPEREUTROFICO, NivelRiesgo.ALTO
        interp = (
            "Productividad extrema. Floraciones frecuentes y persistentes, con "
            "riesgo sostenido de cianotoxinas y de anoxia nocturna."
        )

    return ResultadoIndice(
        clave="tsi",
        nombre="Índice de Estado Trófico (TSI de Carlson)",
        valor=round(valor, 1),
        unidad="adimensional (0–100)",
        formula="TSI(Chl) = 9,81 · ln(Chl-a) + 30,6",
        interpretacion=(
            f"Con {chl:.1f} µg/L de clorofila-a el TSI es {valor:.1f}, que "
            f"corresponde a un cuerpo **{categoria.lower()}**. {interp}"
        ),
        referencia="Carlson, R.E. (1977), Limnology and Oceanography 22(2)",
        categoria=categoria,
        nivel=nivel,
    )


# ---------------------------------------------------------------------------
# Relación N:P
# ---------------------------------------------------------------------------

def relacion_np(nitrogeno_mgl: float, fosforo_mgl: float) -> ResultadoIndice:
    """
    Relación nitrógeno:fósforo frente a la proporción de Redfield (16:1).

    No mide cantidad sino *proporción*, y esa proporción determina qué grupo
    algal gana la competencia:

    * N:P < 16 → el nitrógeno limita. Ventaja para las cianobacterias, y en
      especial para las fijadoras de N₂ atmosférico, que se saltan la
      limitación. Es la condición que favorece la floración tóxica.
    * N:P > 16 → el fósforo limita. Situación preferible para la gestión, y la
      razón por la que la reducción de fósforo es la palanca clásica.
    """
    p = max(float(fosforo_mgl), 1e-6)
    ratio = float(nitrogeno_mgl) / p

    if ratio < 10:
        categoria, nivel = "Fuerte limitación por nitrógeno", NivelRiesgo.ALTO
        interp = (
            "Proporción muy por debajo de Redfield: ventaja competitiva marcada "
            "para cianobacterias fijadoras de nitrógeno. Es una de las "
            "condiciones clásicas que preceden a una floración."
        )
    elif ratio < REDFIELD_NP:
        categoria, nivel = "Limitación por nitrógeno", NivelRiesgo.MODERADO
        interp = (
            "Por debajo de Redfield: las cianobacterias tienen ventaja sobre "
            "algas verdes y diatomeas."
        )
    elif ratio < 30:
        categoria, nivel = "Equilibrada", NivelRiesgo.BAJO
        interp = "Proporción próxima a Redfield; sin ventaja competitiva clara."
    else:
        categoria, nivel = "Limitación por fósforo", NivelRiesgo.BAJO
        interp = (
            "El fósforo limita el crecimiento. Es la situación deseable desde "
            "la gestión: actuar sobre el fósforo tiene efecto directo."
        )

    return ResultadoIndice(
        clave="np_ratio",
        nombre="Relación N:P",
        valor=round(ratio, 1),
        unidad="adimensional",
        formula="N:P = Nitrógeno total / Fósforo total (en masa)",
        interpretacion=(
            f"Con {nitrogeno_mgl:.2f} mg/L de N y {fosforo_mgl:.3f} mg/L de P, "
            f"la relación es {ratio:.1f} frente al valor de Redfield de "
            f"{REDFIELD_NP:.0f}. {interp}"
        ),
        referencia="Redfield, A.C. (1958); Smith, V.H. (1983) sobre dominancia de cianobacterias",
        categoria=categoria,
        nivel=nivel,
    )


# ---------------------------------------------------------------------------
# Saturación de oxígeno
# ---------------------------------------------------------------------------

def saturacion_oxigeno(od_mgl: float, temp_c: float) -> ResultadoIndice:
    """
    Porcentaje de saturación de oxígeno disuelto respecto al equilibrio.

    El dato crudo de OD no basta: 8 mg/L es normal a 25 °C pero indica déficit
    a 5 °C, porque el agua fría disuelve más oxígeno. El porcentaje de
    saturación es la magnitud que realmente informa.

    Interpretación bidireccional, y esto es clave: **tanto el defecto como el
    exceso son señales de alarma**. La sobresaturación diurna delata
    fotosíntesis desbocada, que es la cara diurna de la misma floración que de
    madrugada provoca la hipoxia.
    """
    od_sat = 14.6 - 0.41 * temp_c + 0.0045 * temp_c**2
    pct = float(od_mgl) / max(od_sat, 0.1) * 100.0

    if pct < 30:
        categoria, nivel = "Hipoxia severa", NivelRiesgo.CRITICO
        interp = "Riesgo inmediato de mortandad de peces y liberación de fósforo del sedimento."
    elif pct < 60:
        categoria, nivel = "Hipoxia", NivelRiesgo.ALTO
        interp = "Déficit marcado. Compatible con respiración nocturna de biomasa densa."
    elif pct <= 110:
        categoria, nivel = "Normal", NivelRiesgo.BAJO
        interp = "Intercambio atmosférico y actividad biológica en equilibrio."
    elif pct <= 150:
        categoria, nivel = "Sobresaturación", NivelRiesgo.MODERADO
        interp = (
            "Producción fotosintética por encima del intercambio atmosférico: "
            "señal indirecta de floración activa."
        )
    else:
        categoria, nivel = "Sobresaturación extrema", NivelRiesgo.ALTO
        interp = (
            "Fotosíntesis muy intensa. Anticipa un déficit acusado durante la "
            "noche, cuando cese la producción y solo quede la respiración."
        )

    return ResultadoIndice(
        clave="od_saturacion",
        nombre="Saturación de oxígeno disuelto",
        valor=round(pct, 1),
        unidad="% de saturación",
        formula="OD% = OD_medido / OD_saturación(T) × 100, con OD_sat = 14,6 − 0,41·T + 0,0045·T²",
        interpretacion=(
            f"A {temp_c:.1f} °C el equilibrio son {od_sat:.1f} mg/L. Con "
            f"{od_mgl:.1f} mg/L medidos, la saturación es del {pct:.0f} %: "
            f"{categoria.lower()}. {interp}"
        ),
        referencia="Aproximación de Weiss (1970); criterio EPA (1986) para vida acuática",
        categoria=categoria,
        nivel=nivel,
    )


# ---------------------------------------------------------------------------
# Estabilidad de la columna de agua
# ---------------------------------------------------------------------------

def estabilidad_columna(viento_kmh: float, temp_sup: float, temp_fondo: float) -> ResultadoIndice:
    """
    Índice operativo de estabilidad térmica de la columna de agua.

    Combina el gradiente térmico (que estratifica) con el viento (que mezcla).
    Una columna estable permite que las cianobacterias con vesículas de gas
    floten hasta la superficie y formen nata; una columna mezclada las mantiene
    dispersas en profundidad, donde reciben menos luz.

    No es un número de la literatura: es un indicador compuesto propio de este
    gemelo, y se declara como tal.
    """
    gradiente = max(0.0, float(temp_sup) - float(temp_fondo))
    energia_mezcla = float(viento_kmh) ** 2 / 100.0
    indice = gradiente / (1.0 + energia_mezcla)

    if indice > 3.0:
        categoria, nivel = "Muy estable (estratificada)", NivelRiesgo.ALTO
        interp = (
            "Estratificación marcada sin energía de mezcla. Condición idónea "
            "para acumulación superficial de cianobacterias (nata)."
        )
    elif indice > 1.2:
        categoria, nivel = "Estable", NivelRiesgo.MODERADO
        interp = "Estratificación moderada; la mezcla no llega a romperla."
    elif indice > 0.4:
        categoria, nivel = "Débilmente mezclada", NivelRiesgo.BAJO
        interp = "El viento mezcla parcialmente la capa superficial."
    else:
        categoria, nivel = "Bien mezclada", NivelRiesgo.BAJO
        interp = (
            "Mezcla vertical activa: la biomasa se dispersa en la columna y no "
            "se acumula en superficie."
        )

    return ResultadoIndice(
        clave="estabilidad",
        nombre="Estabilidad de la columna de agua",
        valor=round(indice, 2),
        unidad="adimensional",
        formula="E = ΔT / (1 + viento²/100), con ΔT = T_superficie − T_fondo",
        interpretacion=(
            f"Gradiente térmico de {gradiente:.1f} °C frente a un viento de "
            f"{viento_kmh:.1f} km/h → índice {indice:.2f}: {categoria.lower()}. {interp}"
        ),
        referencia="Indicador compuesto propio, inspirado en el número de Wedderburn",
        categoria=categoria,
        nivel=nivel,
    )


# ---------------------------------------------------------------------------
# Índice satelital NDCI
# ---------------------------------------------------------------------------

def ndci_desde_clorofila(clorofila_ugl: float) -> ResultadoIndice:
    """
    NDCI estimado por inversión de la relación empírica con la clorofila-a.

    En un sistema con imágenes reales, el NDCI se calcularía de las bandas
    Sentinel-2 como (B5 − B4)/(B5 + B4) y la clorofila se derivaría de él.
    Aquí se recorre el camino inverso: se estima el NDCI que correspondería a
    la clorofila simulada, para poder mostrar la capa satelital del gemelo.

    Es una estimación, no una medición, y así se declara en toda la interfaz.
    """
    chl = max(float(clorofila_ugl), 0.01)
    valor = float(np.clip((math.log(chl) - 1.35) / 4.2, -0.2, 0.85))

    if valor < 0.15:
        categoria, nivel = "Sin floración detectable", NivelRiesgo.BAJO
    elif valor < 0.35:
        categoria, nivel = "Biomasa elevada", NivelRiesgo.MODERADO
    else:
        categoria, nivel = "Floración intensa", NivelRiesgo.ALTO

    return ResultadoIndice(
        clave="ndci",
        nombre="NDCI (Normalized Difference Chlorophyll Index)",
        valor=round(valor, 3),
        unidad="adimensional (−1 a 1)",
        formula="NDCI = (B5 − B4) / (B5 + B4); aquí estimado por inversión desde Chl-a",
        interpretacion=(
            f"El NDCI estimado es {valor:.3f}, correspondiente a "
            f"«{categoria.lower()}». Este índice usa la banda de borde rojo "
            f"(B5, 705 nm), lo que lo hace apto para aguas continentales "
            f"turbias donde los índices oceánicos clásicos fallan."
        ),
        referencia="Mishra & Mishra (2012), Remote Sensing of Environment 117",
        categoria=categoria,
        nivel=nivel,
    )


# ---------------------------------------------------------------------------
# Cálculo conjunto
# ---------------------------------------------------------------------------

def calcular_todos(fila: pd.Series) -> list[ResultadoIndice]:
    """Calcula el panel completo de índices para una observación."""
    temp_fondo = float(fila["temp_surface"]) - 4.5 - 0.12 * float(fila.get("profundidad_m", 10.0))
    return [
        tsi_carlson(fila["chlorophyll_a"]),
        relacion_np(fila["total_nitrogen"], fila["total_phosphorus"]),
        saturacion_oxigeno(fila["dissolved_oxygen"], fila["temp_surface"]),
        estabilidad_columna(fila["wind_speed"], fila["temp_surface"], temp_fondo),
        ndci_desde_clorofila(fila["chlorophyll_a"]),
    ]


def tabla_indices(fila: pd.Series) -> pd.DataFrame:
    """Panel de índices en formato tabla, con fórmula e interpretación."""
    return pd.DataFrame(
        [
            {
                "Índice": r.nombre,
                "Valor": r.valor,
                "Unidad": r.unidad,
                "Categoría": r.categoria,
                "Nivel": r.nivel.value,
                "Fórmula": r.formula,
                "Interpretación": r.interpretacion,
                "Referencia": r.referencia,
            }
            for r in calcular_todos(fila)
        ]
    )
