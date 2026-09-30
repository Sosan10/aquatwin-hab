"""
Motor de diagnóstico limnológico determinista.

Por qué reglas y no un modelo de caja negra para emitir el nivel de alerta:

* **Reproducible** — la misma entrada da siempre la misma salida, y eso se
  puede auditar.
* **Explicable sin post-proceso** — la explicación *es* la regla disparada, no
  una aproximación calculada a posteriori.
* **Defendible ante un tercero** — cada umbral cita su norma (OMS, EPA, OCDE).
* **No alucina** — a diferencia de un modelo generativo.

El modelo de aprendizaje automático (`prediccion.py`) tiene otro papel:
proyectar el valor futuro de la biomasa. La *alerta* la emite este motor.

Cada regla devuelve una `Evaluacion` con el valor observado, el umbral, si se
disparó y una frase de explicación construida con los números concretos del
caso. El diagnóstico final es la agregación trazable de esas evaluaciones.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import pandas as pd

from ..dominio import (
    OMS_MICROCISTINA_POTABLE,
    OMS_MICROCISTINA_RECREATIVA,
    NivelRiesgo,
    TAXONES,
)
from .indices import relacion_np, saturacion_oxigeno, tsi_carlson


# ---------------------------------------------------------------------------
# Estructuras
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Evaluacion:
    """Resultado de aplicar una regla a una observación concreta."""
    regla_id: str
    nombre: str
    disparada: bool
    valor_observado: float
    umbral: float
    unidad: str
    nivel: NivelRiesgo
    peso: float
    explicacion: str
    referencia: str

    @property
    def contribucion(self) -> float:
        """Aporte de la regla al índice de riesgo agregado (0 si no se disparó)."""
        return self.peso * self.nivel.orden if self.disparada else 0.0


@dataclass(frozen=True)
class Regla:
    """
    Regla de diagnóstico.

    `evaluador` recibe la observación y devuelve (disparada, valor, umbral, nivel,
    explicación). Se mantiene como función para que la lógica y su explicación se
    escriban juntas y no puedan divergir.
    """
    id: str
    nombre: str
    unidad: str
    peso: float
    referencia: str
    evaluador: Callable[[pd.Series], tuple[bool, float, float, NivelRiesgo, str]]

    def evaluar(self, obs: pd.Series) -> Evaluacion:
        disparada, valor, umbral, nivel, explicacion = self.evaluador(obs)
        return Evaluacion(
            regla_id=self.id,
            nombre=self.nombre,
            disparada=disparada,
            valor_observado=valor,
            umbral=umbral,
            unidad=self.unidad,
            nivel=nivel if disparada else NivelRiesgo.BAJO,
            peso=self.peso,
            explicacion=explicacion,
            referencia=self.referencia,
        )


@dataclass
class Diagnostico:
    """Diagnóstico completo y trazable de una observación."""
    nivel: NivelRiesgo
    puntuacion: float
    puntuacion_maxima: float
    evaluaciones: list[Evaluacion]
    taxon_probable: str
    microcistina_estimada: float
    recomendaciones: list[str] = field(default_factory=list)

    @property
    def disparadas(self) -> list[Evaluacion]:
        return [e for e in self.evaluaciones if e.disparada]

    @property
    def indice_riesgo(self) -> float:
        """Riesgo normalizado 0–100, para poder graficarlo."""
        if self.puntuacion_maxima <= 0:
            return 0.0
        return round(self.puntuacion / self.puntuacion_maxima * 100, 1)

    def justificacion(self) -> str:
        """Explicación en prosa del nivel emitido: la salida explicable del motor."""
        if not self.disparadas:
            return (
                "Ninguna regla de diagnóstico se ha disparado. Todos los "
                "parámetros evaluados están por debajo de sus umbrales de "
                "atención, por lo que el nivel es BAJO."
            )
        ordenadas = sorted(self.disparadas, key=lambda e: e.contribucion, reverse=True)
        lineas = [
            f"Se han disparado **{len(ordenadas)} de {len(self.evaluaciones)} reglas**. "
            f"El nivel resultante es **{self.nivel.value}** "
            f"(índice de riesgo {self.indice_riesgo:.0f}/100). "
            f"Reglas activas, ordenadas por contribución:"
        ]
        for e in ordenadas:
            lineas.append(f"- **{e.nombre}** — {e.explicacion}")
        return "\n".join(lineas)

    def a_tabla(self) -> pd.DataFrame:
        """Traza completa de la evaluación, incluidas las reglas que NO se dispararon."""
        return pd.DataFrame(
            [
                {
                    "Regla": e.nombre,
                    "Estado": "DISPARADA" if e.disparada else "no disparada",
                    "Valor observado": round(e.valor_observado, 3),
                    "Umbral": round(e.umbral, 3),
                    "Unidad": e.unidad,
                    "Nivel": e.nivel.value,
                    "Peso": e.peso,
                    "Contribución": round(e.contribucion, 2),
                    "Explicación": e.explicacion,
                    "Referencia normativa": e.referencia,
                }
                for e in self.evaluaciones
            ]
        )


# ---------------------------------------------------------------------------
# Definición de las reglas
# ---------------------------------------------------------------------------

def _r_biomasa(obs: pd.Series):
    v = float(obs["chlorophyll_a"])
    if v >= 50:
        return True, v, 50.0, NivelRiesgo.CRITICO, (
            f"La clorofila-a es de {v:.1f} µg/L, por encima del umbral de "
            f"alerta 2 de la OMS (50 µg/L). Indica biomasa fitoplanctónica "
            f"muy elevada, compatible con floración establecida."
        )
    if v >= 25:
        return True, v, 25.0, NivelRiesgo.MODERADO, (
            f"La clorofila-a es de {v:.1f} µg/L, por encima del umbral de "
            f"alerta 1 de la OMS (25 µg/L). Biomasa elevada que exige vigilancia."
        )
    return False, v, 25.0, NivelRiesgo.BAJO, (
        f"Clorofila-a de {v:.1f} µg/L, por debajo del umbral de atención de 25 µg/L."
    )


def _r_cianobacterias(obs: pd.Series):
    v = float(obs["phycocyanin"])
    if v >= 100_000:
        return True, v, 100_000.0, NivelRiesgo.CRITICO, (
            f"La densidad de cianobacterias estimada por ficocianina es de "
            f"{v:,.0f} células/mL, sobre el umbral de 100.000 que la OMS asocia "
            f"a riesgo sanitario alto en aguas recreativas."
        )
    if v >= 20_000:
        return True, v, 20_000.0, NivelRiesgo.ALTO, (
            f"Ficocianina de {v:,.0f} células/mL, sobre el umbral de vigilancia "
            f"de 20.000. A diferencia de la clorofila-a, esta señal es "
            f"específica de cianobacterias, por lo que implica riesgo de toxinas."
        )
    return False, v, 20_000.0, NivelRiesgo.BAJO, (
        f"Ficocianina de {v:,.0f} células/mL, por debajo del umbral de vigilancia."
    )


def _r_temperatura(obs: pd.Series):
    v = float(obs["temp_surface"])
    if v >= 28:
        return True, v, 28.0, NivelRiesgo.ALTO, (
            f"Temperatura superficial de {v:.1f} °C, dentro del óptimo térmico "
            f"de Microcystis (25–32 °C). Maximiza su tasa de división celular."
        )
    if v >= 24:
        return True, v, 24.0, NivelRiesgo.MODERADO, (
            f"Temperatura superficial de {v:.1f} °C, por encima de los 24 °C a "
            f"partir de los cuales las cianobacterias desplazan competitivamente "
            f"a diatomeas y clorofitas."
        )
    return False, v, 24.0, NivelRiesgo.BAJO, (
        f"Temperatura de {v:.1f} °C, por debajo del umbral de ventaja competitiva."
    )


def _r_hipoxia(obs: pd.Series):
    v = float(obs["dissolved_oxygen"])
    if v <= 3.0:
        return True, v, 3.0, NivelRiesgo.CRITICO, (
            f"Oxígeno disuelto de {v:.1f} mg/L, por debajo del criterio EPA de "
            f"3 mg/L. Riesgo inmediato de mortandad de peces y de liberación de "
            f"fósforo desde el sedimento, que realimenta la floración."
        )
    if v <= 5.0:
        return True, v, 5.0, NivelRiesgo.ALTO, (
            f"Oxígeno disuelto de {v:.1f} mg/L, por debajo del criterio de "
            f"5 mg/L para vida acuática. Compatible con respiración nocturna "
            f"de una biomasa densa."
        )
    return False, v, 5.0, NivelRiesgo.BAJO, (
        f"Oxígeno disuelto de {v:.1f} mg/L, dentro del rango adecuado."
    )


def _r_np(obs: pd.Series):
    idx = relacion_np(obs["total_nitrogen"], obs["total_phosphorus"])
    v = idx.valor
    if v < 10:
        return True, v, 10.0, NivelRiesgo.ALTO, (
            f"La relación N:P es {v:.1f}, muy por debajo de Redfield (16). El "
            f"nitrógeno limita, lo que da ventaja competitiva a las "
            f"cianobacterias fijadoras de N₂ atmosférico."
        )
    if v < 16:
        return True, v, 16.0, NivelRiesgo.MODERADO, (
            f"La relación N:P es {v:.1f}, por debajo de Redfield (16), lo que "
            f"favorece a las cianobacterias frente a otras algas."
        )
    return False, v, 16.0, NivelRiesgo.BAJO, (
        f"Relación N:P de {v:.1f}, igual o superior a Redfield: sin ventaja "
        f"competitiva para cianobacterias."
    )


def _r_calma(obs: pd.Series):
    v = float(obs["wind_speed"])
    if v <= 2.0:
        return True, v, 2.0, NivelRiesgo.ALTO, (
            f"Viento de {v:.1f} km/h: calma casi total. Sin energía de mezcla, "
            f"las cianobacterias con vesículas de gas flotan y forman nata "
            f"superficial, que concentra la toxina donde hay contacto humano."
        )
    if v <= 3.0:
        return True, v, 3.0, NivelRiesgo.MODERADO, (
            f"Viento de {v:.1f} km/h, por debajo del umbral de 3 km/h a partir "
            f"del cual la mezcla vertical impide la acumulación superficial."
        )
    return False, v, 3.0, NivelRiesgo.BAJO, (
        f"Viento de {v:.1f} km/h: hay mezcla vertical suficiente para dispersar "
        f"la biomasa en la columna."
    )


def _r_ph(obs: pd.Series):
    v = float(obs["ph"])
    if v >= 9.0:
        return True, v, 9.0, NivelRiesgo.MODERADO, (
            f"pH de {v:.2f}. Un pH tan alto indica consumo intenso de CO₂ por "
            f"fotosíntesis, señal indirecta de floración activa."
        )
    return False, v, 9.0, NivelRiesgo.BAJO, (
        f"pH de {v:.2f}, dentro del rango habitual."
    )


def _r_microcistina(obs: pd.Series):
    v = float(obs.get("microcystin", 0.0))
    if v >= OMS_MICROCISTINA_RECREATIVA:
        return True, v, OMS_MICROCISTINA_RECREATIVA, NivelRiesgo.CRITICO, (
            f"Microcistina-LR estimada en {v:.1f} µg/L, sobre la guía de la OMS "
            f"para uso recreativo ({OMS_MICROCISTINA_RECREATIVA:.0f} µg/L) y "
            f"muy por encima de la de agua de consumo "
            f"({OMS_MICROCISTINA_POTABLE:.1f} µg/L). Requiere confirmación "
            f"analítica por HPLC o ELISA antes de cualquier decisión."
        )
    if v >= OMS_MICROCISTINA_POTABLE:
        return True, v, OMS_MICROCISTINA_POTABLE, NivelRiesgo.ALTO, (
            f"Microcistina-LR estimada en {v:.1f} µg/L, sobre la guía de la OMS "
            f"para agua de consumo ({OMS_MICROCISTINA_POTABLE:.1f} µg/L). "
            f"Requiere confirmación analítica."
        )
    return False, v, OMS_MICROCISTINA_POTABLE, NivelRiesgo.BAJO, (
        f"Microcistina-LR estimada en {v:.1f} µg/L, por debajo de la guía de "
        f"agua de consumo."
    )


REGLAS: list[Regla] = [
    Regla("R1", "Biomasa fitoplanctónica (clorofila-a)", "µg/L", 1.0,
          "OMS (2003), guías para aguas recreativas — alertas 1 y 2", _r_biomasa),
    Regla("R2", "Densidad de cianobacterias (ficocianina)", "células/mL", 1.4,
          "OMS (2003), umbrales de densidad celular", _r_cianobacterias),
    Regla("R3", "Ventana térmica de proliferación", "°C", 0.9,
          "Paerl & Huisman (2008)", _r_temperatura),
    Regla("R4", "Déficit de oxígeno disuelto", "mg/L", 1.2,
          "EPA (1986), criterio para vida acuática", _r_hipoxia),
    Regla("R5", "Desequilibrio de nutrientes (N:P)", "adimensional", 0.9,
          "Redfield (1958); Smith (1983)", _r_np),
    Regla("R6", "Estancamiento por calma de viento", "km/h", 0.8,
          "Criterio de formación de nata por flotación", _r_calma),
    Regla("R7", "pH elevado por fotosíntesis", "unidades de pH", 0.5,
          "Indicador secundario de actividad fotosintética", _r_ph),
    Regla("R8", "Cianotoxina estimada sobre guía OMS", "µg/L", 1.5,
          "OMS, guías de microcistina-LR (1,0 y 10 µg/L)", _r_microcistina),
]


# ---------------------------------------------------------------------------
# Diagnóstico
# ---------------------------------------------------------------------------

def _taxon_probable(obs: pd.Series) -> str:
    """
    Infiere el taxón dominante a partir de temperatura y relación N:P.

    Es una inferencia de cribado basada en la ecología conocida de cada
    especie, no una identificación taxonómica. La identificación real exige
    microscopía o análisis genético.
    """
    temp = float(obs["temp_surface"])
    np_r = float(obs["total_nitrogen"]) / max(float(obs["total_phosphorus"]), 1e-6)

    if temp >= 25 and np_r >= 10:
        return "Microcystis aeruginosa"
    if temp >= 25 and np_r < 10:
        return "Cylindrospermopsis raciborskii"
    if 20 <= temp < 25 and np_r < 12:
        return "Dolichospermum flos-aquae"
    return "Planktothrix agardhii"


def _recomendaciones(nivel: NivelRiesgo, disparadas: list[Evaluacion], obs: pd.Series) -> list[str]:
    """
    Recomendaciones de gestión ligadas a las reglas que se dispararon.

    Cada recomendación indica qué regla la motiva, para que la acción propuesta
    sea rastreable hasta la evidencia que la justifica.
    """
    recs: list[str] = []
    ids = {e.regla_id for e in disparadas}

    if nivel in (NivelRiesgo.ALTO, NivelRiesgo.CRITICO):
        recs.append(
            "**Confirmación analítica prioritaria** — tomar muestra y cuantificar "
            "microcistinas por HPLC o ELISA. El valor del gemelo es una "
            "estimación de cribado y no sustituye al laboratorio. [R8]"
        )
    if "R4" in ids:
        recs.append(
            "**Aireación hipolimnética** al máximo de potencia para revertir el "
            "déficit de oxígeno y evitar la liberación de fósforo del "
            "sedimento, que realimentaría la floración. [R4]"
        )
    if "R6" in ids and "R2" in ids:
        recs.append(
            "**Desestratificación mecánica** o emisores ultrasónicos en la zona "
            "de mayor biomasa: con viento en calma la nata se forma en "
            "superficie, que es justo donde hay contacto humano. [R2, R6]"
        )
    if "R5" in ids:
        recs.append(
            "**Control de la carga de fósforo** en los afluentes. Es la medida "
            "con mayor efecto a medio plazo, aunque no dé resultado inmediato. [R5]"
        )
    if "R8" in ids:
        recs.append(
            "**Reubicar la toma de agua potable** a un estrato profundo "
            "(−12 a −18 m), por debajo de la capa de acumulación de "
            "cianobacterias flotantes. [R8]"
        )
    if nivel == NivelRiesgo.CRITICO:
        recs.append(
            "**Comunicación a la autoridad sanitaria** y señalización de "
            "restricción de uso recreativo, mientras se espera la confirmación "
            "de laboratorio."
        )
    if not recs:
        recs.append(
            "**Mantener el programa de vigilancia habitual.** No hay reglas "
            "disparadas que justifiquen una intervención."
        )
    return recs


def diagnosticar(obs: pd.Series) -> Diagnostico:
    """
    Aplica el conjunto completo de reglas y agrega el resultado.

    Agregación en dos pasos, deliberadamente conservadora:

    1. **Puntuación ponderada** — suma de peso × severidad de cada regla
       disparada, normalizada sobre el máximo posible.
    2. **Regla del máximo con corrección** — el nivel final nunca es inferior
       al máximo nivel individual alcanzado por una regla de peso alto (≥ 1,2).
       Es decir: una sola cianotoxina sobre la guía de la OMS basta para
       declarar riesgo crítico, aunque el resto de indicadores estén tranquilos.
       Promediar aquí sería peligroso: diluiría precisamente la señal que más
       importa.
    """
    evaluaciones = [r.evaluar(obs) for r in REGLAS]
    disparadas = [e for e in evaluaciones if e.disparada]

    puntuacion = sum(e.contribucion for e in evaluaciones)
    maximo = sum(r.peso * NivelRiesgo.CRITICO.orden for r in REGLAS)
    fraccion = puntuacion / maximo if maximo else 0.0

    if fraccion >= 0.45:
        nivel = NivelRiesgo.CRITICO
    elif fraccion >= 0.28:
        nivel = NivelRiesgo.ALTO
    elif fraccion >= 0.12:
        nivel = NivelRiesgo.MODERADO
    else:
        nivel = NivelRiesgo.BAJO

    # Corrección por regla crítica de peso alto
    for e in disparadas:
        if e.peso >= 1.2 and e.nivel.orden > nivel.orden:
            nivel = e.nivel

    return Diagnostico(
        nivel=nivel,
        puntuacion=round(puntuacion, 2),
        puntuacion_maxima=round(maximo, 2),
        evaluaciones=evaluaciones,
        taxon_probable=_taxon_probable(obs),
        microcistina_estimada=float(obs.get("microcystin", 0.0)),
        recomendaciones=_recomendaciones(nivel, disparadas, obs),
    )


def diagnosticar_serie(df: pd.DataFrame) -> pd.DataFrame:
    """Aplica el diagnóstico a cada fila y devuelve nivel e índice de riesgo."""
    filas = []
    for _, obs in df.iterrows():
        d = diagnosticar(obs)
        filas.append(
            {
                "tiempo": obs["tiempo"],
                "estacion_id": obs["estacion_id"],
                "estacion": obs["estacion"],
                "nivel": d.nivel.value,
                "indice_riesgo": d.indice_riesgo,
                "reglas_disparadas": len(d.disparadas),
                "taxon_probable": d.taxon_probable,
            }
        )
    return pd.DataFrame(filas)
