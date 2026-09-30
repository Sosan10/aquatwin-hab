"""
Detección de anomalías explicable.

Se usa una batería de detectores **estadísticos con significado limnológico**
en lugar de un detector genérico tipo Isolation Forest. La razón es de
explicabilidad: un bosque de aislamiento devuelve una puntuación de rareza,
pero no puede decir *qué* es raro ni *por qué importa*. Aquí, cada detección
nombra el fenómeno, aporta la magnitud medida y explica su consecuencia
ecológica.

Cada detector se aplica sobre datos que ya han superado el control de calidad,
para no confundir una sonda sucia con una floración. Esa distinción es
justamente lo que separa un sistema utilizable de uno que grita en falso.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..dominio import CalidadDato, NivelRiesgo


@dataclass(frozen=True)
class Anomalia:
    """Evento anómalo detectado, con su explicación completa."""
    id: str
    tiempo: pd.Timestamp
    estacion_id: str
    estacion: str
    tipo: str
    severidad: NivelRiesgo
    puntuacion: float          # 0–1, cuán excepcional es
    variable: str
    valor: float
    referencia: float          # valor esperado o umbral
    unidad: str
    descripcion: str
    consecuencia: str
    accion_sugerida: str
    metodo: str                # cómo se detectó — parte de la explicabilidad

    def a_dict(self) -> dict:
        return {
            "ID": self.id,
            "Fecha y hora": self.tiempo,
            "Estación": self.estacion,
            "Tipo": self.tipo,
            "Severidad": self.severidad.value,
            "Puntuación": round(self.puntuacion, 3),
            "Variable": self.variable,
            "Valor": round(self.valor, 2),
            "Referencia": round(self.referencia, 2),
            "Unidad": self.unidad,
            "Qué ocurrió": self.descripcion,
            "Consecuencia ecológica": self.consecuencia,
            "Acción sugerida": self.accion_sugerida,
            "Método de detección": self.metodo,
        }


def _z_robusto(serie: pd.Series) -> pd.Series:
    """
    Puntuación z robusta basada en mediana y MAD.

    Se prefiere a la z clásica porque la media y la desviación típica se
    contaminan con los propios valores extremos que se quiere detectar: un pico
    grande infla la desviación y acaba escondiéndose a sí mismo.
    """
    mediana = serie.median()
    mad = (serie - mediana).abs().median()
    if not np.isfinite(mad) or mad == 0:
        return pd.Series(np.zeros(len(serie)), index=serie.index)
    return (serie - mediana) / (1.4826 * mad)


def detectar(df: pd.DataFrame, *, solo_datos_buenos: bool = True) -> list[Anomalia]:
    """
    Aplica los cuatro detectores sobre la serie y devuelve los eventos hallados.

    Parameters
    ----------
    solo_datos_buenos
        Si es True (recomendado), ignora los registros marcados como
        sospechosos o malos por el control de calidad. Desactivarlo sirve para
        mostrar en la interfaz qué pasaría sin control de calidad —una
        comparación didáctica útil— pero no debe usarse en operación.
    """
    datos = df.copy()
    if solo_datos_buenos:
        datos = datos[datos["calidad"] == CalidadDato.BUENO.value]
    datos = datos.dropna(subset=["chlorophyll_a", "dissolved_oxygen", "temp_surface"])

    anomalias: list[Anomalia] = []
    contador = 0

    for est_id, g in datos.sort_values("tiempo").groupby("estacion_id", sort=False):
        if len(g) < 48:
            continue
        nombre = str(g["estacion"].iloc[0])

        # --- 1. Duplicación rápida de biomasa ----------------------------
        # Una floración se reconoce por su tasa de crecimiento, no por su nivel.
        crecimiento = g["chlorophyll_a"].pct_change(periods=12) * 100
        for idx in g.index[(crecimiento > 60).fillna(False)]:
            contador += 1
            pct = float(crecimiento.loc[idx])
            anomalias.append(
                Anomalia(
                    id=f"ANM-{contador:03d}",
                    tiempo=g.loc[idx, "tiempo"],
                    estacion_id=est_id,
                    estacion=nombre,
                    tipo="DUPLICACION_BIOMASA",
                    severidad=NivelRiesgo.CRITICO if pct > 100 else NivelRiesgo.ALTO,
                    puntuacion=float(np.clip(pct / 200, 0, 1)),
                    variable="Clorofila-a",
                    valor=float(g.loc[idx, "chlorophyll_a"]),
                    referencia=float(g["chlorophyll_a"].shift(12).loc[idx]),
                    unidad="µg/L",
                    descripcion=(
                        f"La clorofila-a creció un {pct:.0f} % en 12 horas, hasta "
                        f"{g.loc[idx, 'chlorophyll_a']:.1f} µg/L."
                    ),
                    consecuencia=(
                        "Una tasa de crecimiento así indica una floración en fase "
                        "exponencial. Es el momento en que la intervención todavía "
                        "es eficaz: una vez alcanzada la capacidad de carga, "
                        "mitigar cuesta mucho más."
                    ),
                    accion_sugerida=(
                        "Confirmar con muestreo, activar mitigación física en el "
                        "sector afectado y aumentar la frecuencia de vigilancia."
                    ),
                    metodo="Variación porcentual a 12 h con umbral del 60 %",
                )
            )

        # --- 2. Hipoxia nocturna ------------------------------------------
        # Se busca solo entre las 00:00 y las 07:00: es el fenómeno de la
        # respiración sin fotosíntesis compensatoria.
        noche = g[g["tiempo"].dt.hour.between(0, 7)]
        for idx in noche.index[(noche["dissolved_oxygen"] < 3.0)]:
            contador += 1
            od = float(g.loc[idx, "dissolved_oxygen"])
            anomalias.append(
                Anomalia(
                    id=f"ANM-{contador:03d}",
                    tiempo=g.loc[idx, "tiempo"],
                    estacion_id=est_id,
                    estacion=nombre,
                    tipo="HIPOXIA_NOCTURNA",
                    severidad=NivelRiesgo.CRITICO if od < 2.0 else NivelRiesgo.ALTO,
                    puntuacion=float(np.clip((3.0 - od) / 3.0, 0, 1)),
                    variable="Oxígeno disuelto",
                    valor=od,
                    referencia=3.0,
                    unidad="mg/L",
                    descripcion=(
                        f"El oxígeno disuelto cayó a {od:.2f} mg/L a las "
                        f"{g.loc[idx, 'tiempo']:%H:%M}, por debajo del criterio "
                        f"EPA de 3 mg/L para vida acuática."
                    ),
                    consecuencia=(
                        "De noche cesa la fotosíntesis y solo queda la respiración "
                        "de la propia biomasa. Además de la mortandad de peces, la "
                        "anoxia en el sedimento libera el fósforo acumulado, que "
                        "realimenta la floración: es un bucle que se refuerza solo."
                    ),
                    accion_sugerida=(
                        "Aireación hipolimnética al máximo durante la franja "
                        "nocturna, hasta romper el ciclo."
                    ),
                    metodo="Umbral fijo EPA restringido a la franja 00:00–07:00",
                )
            )

        # --- 3. Pulso de nutrientes ---------------------------------------
        # Se detecta el EVENTO (la subida brusca), no el nivel elevado.
        # Un pulso de escorrentía deja el fósforo alto durante días; si se
        # buscara el nivel, cada hora de ese periodo generaría una alerta y el
        # operador recibiría cientos de avisos del mismo suceso. Lo que hay que
        # detectar es el instante en que entra el nutriente.
        subida_p = g["total_phosphorus"].diff(6)
        z_p = _z_robusto(subida_p)
        for idx in g.index[((z_p > 4.0) & (subida_p > 0)).fillna(False)]:
            contador += 1
            valor = float(g.loc[idx, "total_phosphorus"])
            anomalias.append(
                Anomalia(
                    id=f"ANM-{contador:03d}",
                    tiempo=g.loc[idx, "tiempo"],
                    estacion_id=est_id,
                    estacion=nombre,
                    tipo="PULSO_NUTRIENTES",
                    severidad=NivelRiesgo.ALTO if z_p.loc[idx] > 5 else NivelRiesgo.MODERADO,
                    puntuacion=float(np.clip(z_p.loc[idx] / 8, 0, 1)),
                    variable="Fósforo total",
                    valor=valor,
                    referencia=float(g["total_phosphorus"].median()),
                    unidad="mg/L",
                    descripcion=(
                        f"El fósforo total subió {subida_p.loc[idx]:.3f} mg/L en 6 h, "
                        f"hasta {valor:.3f} mg/L: una variación {z_p.loc[idx]:.1f} "
                        f"desviaciones robustas por encima de lo habitual."
                    ),
                    consecuencia=(
                        "Un pulso de fósforo suele proceder de escorrentía tras "
                        "lluvia o de un vertido. Actúa como combustible: precede "
                        "típicamente en días a un aumento de biomasa."
                    ),
                    accion_sugerida=(
                        "Rastrear el origen en los afluentes y valorar dosificación "
                        "de coagulante para precipitar el fósforo disponible."
                    ),
                    metodo="Puntuación z robusta sobre la variación a 6 h, umbral 4,0",
                )
            )

        # --- 4. Pico térmico ----------------------------------------------
        subida_t = g["temp_surface"].diff(6)
        z_t = _z_robusto(subida_t)
        for idx in g.index[((z_t > 4.0) & (g["temp_surface"] > 24)).fillna(False)]:
            contador += 1
            valor = float(g.loc[idx, "temp_surface"])
            anomalias.append(
                Anomalia(
                    id=f"ANM-{contador:03d}",
                    tiempo=g.loc[idx, "tiempo"],
                    estacion_id=est_id,
                    estacion=nombre,
                    tipo="PICO_TERMICO",
                    severidad=NivelRiesgo.MODERADO,
                    puntuacion=float(np.clip(z_t.loc[idx] / 6, 0, 1)),
                    variable="Temperatura superficial",
                    valor=valor,
                    referencia=float(g["temp_surface"].median()),
                    unidad="°C",
                    descripcion=(
                        f"La temperatura superficial subió {subida_t.loc[idx]:.1f} °C en 6 h, "
                        f"hasta {valor:.1f} °C: una variación {z_t.loc[idx]:.1f} "
                        f"desviaciones sobre lo habitual."
                    ),
                    consecuencia=(
                        "Por encima de 24 °C las cianobacterias superan "
                        "competitivamente a diatomeas y clorofitas. Un pico "
                        "térmico sostenido inclina la comunidad hacia el grupo "
                        "potencialmente tóxico."
                    ),
                    accion_sugerida=(
                        "Reforzar la vigilancia de ficocianina en las 48–72 h "
                        "siguientes."
                    ),
                    metodo="Puntuación z robusta sobre la variación a 6 h, umbral 4,0, con filtro de 24 °C",
                )
            )

    return _agrupar_episodios(anomalias)


def _agrupar_episodios(anomalias: list[Anomalia], *, horas: int = 12) -> list[Anomalia]:
    """
    Colapsa detecciones consecutivas del mismo tipo y estación en un solo evento.

    Un fenómeno real dura horas y dispara el detector en cada registro de ese
    intervalo. Reportarlos por separado inundaría al operador con decenas de
    avisos del mismo suceso, que es la forma más rápida de que deje de leerlos.
    Se conserva la detección de mayor puntuación de cada episodio.
    """
    if not anomalias:
        return []

    por_grupo: dict[tuple[str, str], list[Anomalia]] = {}
    for a in anomalias:
        por_grupo.setdefault((a.estacion_id, a.tipo), []).append(a)

    resultado: list[Anomalia] = []
    for (_, _), grupo in por_grupo.items():
        grupo.sort(key=lambda a: a.tiempo)
        episodio = [grupo[0]]
        for a in grupo[1:]:
            if (a.tiempo - episodio[-1].tiempo) <= pd.Timedelta(hours=horas):
                episodio.append(a)
            else:
                resultado.append(max(episodio, key=lambda e: e.puntuacion))
                episodio = [a]
        resultado.append(max(episodio, key=lambda e: e.puntuacion))

    return sorted(resultado, key=lambda a: a.tiempo, reverse=True)


def a_dataframe(anomalias: list[Anomalia]) -> pd.DataFrame:
    """Convierte la lista de anomalías en tabla."""
    if not anomalias:
        return pd.DataFrame(
            columns=[
                "ID", "Fecha y hora", "Estación", "Tipo", "Severidad", "Puntuación",
                "Variable", "Valor", "Referencia", "Unidad", "Qué ocurrió",
                "Consecuencia ecológica", "Acción sugerida", "Método de detección",
            ]
        )
    return pd.DataFrame([a.a_dict() for a in anomalias])


DESCRIPCION_TIPOS: dict[str, str] = {
    "DUPLICACION_BIOMASA": (
        "Crecimiento explosivo de biomasa. Se detecta por la *tasa* de cambio, "
        "no por el nivel absoluto: identifica la floración mientras aún está "
        "creciendo, que es cuando la intervención sirve de algo."
    ),
    "HIPOXIA_NOCTURNA": (
        "Caída de oxígeno de madrugada por respiración sin fotosíntesis. Su "
        "gravedad no está solo en la mortandad de peces, sino en que la anoxia "
        "libera fósforo del sedimento y realimenta la floración."
    ),
    "PULSO_NUTRIENTES": (
        "Entrada brusca de fósforo, normalmente por escorrentía o vertido. Es "
        "un precursor: aparece días antes del aumento de biomasa."
    ),
    "PICO_TERMICO": (
        "Episodio de temperatura anómalamente alta que desplaza la ventaja "
        "competitiva hacia las cianobacterias."
    ),
}
