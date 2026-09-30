"""
Vista 5 — Detección de anomalías explicable.

Cada evento detectado nombra el fenómeno, aporta la magnitud, explica su
consecuencia ecológica y dice **con qué método se detectó**. Ese último punto
es el que permite auditar un falso positivo: sin conocer el detector, una
alerta errónea es indistinguible de una correcta.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from ..dominio import NivelRiesgo, variable
from ..explicabilidad import ColumnaDoc, Ficha, figura, tabla, tema_oscuro
from ..motor.anomalias import DESCRIPCION_TIPOS, a_dataframe, detectar


def render(df: pd.DataFrame) -> None:
    """Dibuja la vista de anomalías."""
    anomalias = detectar(df, solo_datos_buenos=True)
    sin_qc = detectar(df, solo_datos_buenos=False)
    tabla_anom = a_dataframe(anomalias)

    if not anomalias:
        st.success(
            "No se detectaron anomalías en el periodo con los detectores "
            "configurados. Esto no garantiza ausencia de eventos: significa que "
            "ninguno superó los umbrales de detección."
        )
        return

    # ------------------------------------------------------------------
    # 1. Cronología
    # ------------------------------------------------------------------
    colores = {n.value: n.color for n in NivelRiesgo}
    fig = go.Figure()
    for sev in ["CRITICO", "ALTO", "MODERADO", "BAJO"]:
        sub = tabla_anom[tabla_anom["Severidad"] == sev]
        if sub.empty:
            continue
        fig.add_trace(
            go.Scatter(
                x=sub["Fecha y hora"],
                y=sub["Tipo"],
                mode="markers",
                name=sev,
                marker=dict(
                    size=sub["Puntuación"] * 22 + 8,
                    color=colores.get(sev, "#64748b"),
                    line=dict(color="rgba(255,255,255,0.35)", width=1),
                    opacity=0.85,
                ),
                customdata=np.stack(
                    [sub["Estación"], sub["Valor"], sub["Unidad"], sub["Qué ocurrió"]], axis=-1
                ),
                hovertemplate=(
                    "<b>%{customdata[0]}</b><br>%{x|%d/%m/%Y %H:%M}<br>"
                    "Valor: %{customdata[1]:.2f} %{customdata[2]}<br>"
                    "%{customdata[3]}<extra></extra>"
                ),
            )
        )
    tema_oscuro(fig, alto=400)
    fig.update_layout(hovermode="closest")
    fig.update_xaxes(title_text="Fecha y hora")
    fig.update_yaxes(title_text="")

    por_tipo = tabla_anom["Tipo"].value_counts()
    criticas = int((tabla_anom["Severidad"] == "CRITICO").sum())

    figura(
        fig,
        Ficha(
            titulo="Cronología de anomalías detectadas",
            que_muestra=(
                f"Los {len(anomalias)} eventos anómalos detectados en el "
                f"periodo, situados en el tiempo y clasificados por tipo de "
                f"fenómeno."
            ),
            como_leer=(
                "El eje vertical agrupa por **tipo de fenómeno**; el "
                "horizontal, por momento. El **tamaño** del círculo es "
                "proporcional a la puntuación de anomalía (cuán excepcional es "
                "el valor) y el **color**, a la severidad. Al pasar el cursor se "
                "obtiene la estación y la magnitud concreta. Los agrupamientos "
                "verticales indican episodios en los que varios fenómenos "
                "coincidieron: suelen ser los eventos que importan."
            ),
            hallazgo=(
                f"Se detectaron **{len(anomalias)} eventos**, de los cuales "
                f"**{criticas} son de severidad crítica**. El tipo más frecuente "
                f"es «{por_tipo.index[0]}» con {por_tipo.iloc[0]} episodios."
            ),
            criterio=(
                "Cada detector tiene su propio criterio: umbral normativo fijo "
                "para la hipoxia, tasa de cambio para la biomasa y puntuación z "
                "robusta para nutrientes y temperatura. Se detallan en la tabla."
            ),
            procedencia=(
                "Detectores aplicados **solo sobre registros con calidad "
                "*bueno***, para no confundir un fallo de sensor con un "
                "fenómeno real."
            ),
            limitaciones=(
                "Los umbrales de detección se fijaron por criterio experto, no "
                "calibrados sobre eventos confirmados en laboratorio. Sin un "
                "histórico etiquetado no se puede estimar la tasa de falsos "
                "positivos, que es la métrica que de verdad importa en "
                "operación."
            ),
        ),
        key="cronologia_anomalias",
    )

    # ------------------------------------------------------------------
    # 2. El efecto del control de calidad
    # ------------------------------------------------------------------
    dif = len(sin_qc) - len(anomalias)
    comparacion = pd.DataFrame(
        [
            {
                "Configuración": "Con control de calidad (operativa)",
                "Anomalías detectadas": len(anomalias),
                "Interpretación": (
                    "Solo se analizan registros que superaron las pruebas "
                    "QARTOD. Es el modo correcto de operación."
                ),
            },
            {
                "Configuración": "Sin control de calidad",
                "Anomalías detectadas": len(sin_qc),
                "Interpretación": (
                    f"Se analizan todos los registros, incluidos los "
                    f"sospechosos. Genera {dif} alertas más, que son "
                    f"mayoritariamente fallos de sensor, no fenómenos reales."
                ),
            },
        ]
    )

    tabla(
        comparacion,
        Ficha(
            titulo="Cuánto aporta el control de calidad",
            que_muestra=(
                "Comparación del número de anomalías detectadas con y sin "
                "filtrado previo por calidad del dato."
            ),
            como_leer=(
                "La diferencia entre ambas filas son las **falsas alarmas que "
                "el control de calidad evita**. Cada una de ellas sería, en "
                "operación real, una llamada telefónica de madrugada por un "
                "sensor sucio."
            ),
            hallazgo=(
                f"El control de calidad evita **{dif} falsas alarmas** "
                f"({dif / max(len(sin_qc), 1) * 100:.0f} % del total que se "
                f"habría emitido sin él)."
                if dif > 0
                else "En este periodo el control de calidad no cambió el número "
                     "de anomalías detectadas."
            ),
            criterio=(
                "Un dato marcado como sospechoso no debe disparar alertas "
                "automáticas: se conserva y se muestra, pero no decide."
            ),
            procedencia="Ejecución del detector con `solo_datos_buenos` en True y en False.",
            limitaciones=(
                "La comparación es didáctica. En operación, el modo sin control "
                "de calidad no debe usarse nunca."
            ),
        ),
        diccionario=[
            ColumnaDoc("Configuración", "Modo de ejecución del detector.", "—", "Motor"),
            ColumnaDoc("Anomalías detectadas", "Número de eventos hallados.", "recuento", "Cálculo"),
            ColumnaDoc("Interpretación", "Qué implica el resultado.", "—", "Documentación"),
        ],
    )

    # ------------------------------------------------------------------
    # 3. Registro detallado
    # ------------------------------------------------------------------
    tabla(
        tabla_anom,
        Ficha(
            titulo="Registro detallado de anomalías",
            que_muestra=(
                "Ficha completa de cada evento: cuándo, dónde, qué variable, "
                "qué magnitud, qué consecuencia ecológica tiene y con qué "
                "método se detectó."
            ),
            como_leer=(
                "Cada fila es un evento. **«Qué ocurrió»** describe el hecho con "
                "sus números; **«Consecuencia ecológica»** explica por qué "
                "importa; **«Método de detección»** permite auditar la alerta y "
                "decidir si es un falso positivo."
            ),
            hallazgo=(
                f"El evento más severo es {tabla_anom.iloc[0]['ID']} en "
                f"«{tabla_anom.iloc[0]['Estación']}»: "
                f"{tabla_anom.iloc[0]['Qué ocurrió']}"
            ),
            criterio="Umbrales de cada detector, indicados en la columna «Método de detección».",
            procedencia="Salida de `motor/anomalias.py::detectar` sobre registros de calidad *bueno*.",
            limitaciones=(
                "La «Acción sugerida» es orientativa y de carácter general. Una "
                "intervención real exige confirmación analítica y valoración de "
                "las condiciones concretas del embalse."
            ),
        ),
        altura=420,
        diccionario=[
            ColumnaDoc("ID", "Identificador correlativo del evento.", "—", "Motor"),
            ColumnaDoc("Fecha y hora", "Momento de la observación anómala.", "—", "Serie simulada"),
            ColumnaDoc("Estación", "Punto de medición donde se detectó.", "—", "Catálogo"),
            ColumnaDoc("Tipo", "Fenómeno limnológico identificado.", "—", "Motor"),
            ColumnaDoc("Severidad", "Nivel de gravedad asignado.", "—", "Motor"),
            ColumnaDoc("Puntuación", "Cuán excepcional es el valor, de 0 a 1.", "adimensional", "Cálculo"),
            ColumnaDoc("Variable", "Magnitud que disparó la detección.", "—", "Catálogo"),
            ColumnaDoc("Valor", "Valor observado.", "ver Unidad", "Serie simulada"),
            ColumnaDoc("Referencia", "Valor esperado o umbral de comparación.", "ver Unidad", "Motor"),
            ColumnaDoc("Qué ocurrió", "Descripción del hecho con sus magnitudes.", "—", "Motor"),
            ColumnaDoc("Consecuencia ecológica", "Por qué el evento importa.", "—", "Conocimiento de dominio"),
            ColumnaDoc("Acción sugerida", "Respuesta de gestión recomendada.", "—", "Conocimiento de dominio"),
            ColumnaDoc("Método de detección", "Algoritmo y umbral que dispararon la alerta.", "—", "Motor"),
        ],
    )

    # ------------------------------------------------------------------
    # 4. Glosario de tipos
    # ------------------------------------------------------------------
    st.markdown("#### Qué significa cada tipo de anomalía")
    for tipo, desc in DESCRIPCION_TIPOS.items():
        n = int((tabla_anom["Tipo"] == tipo).sum())
        with st.expander(f"{tipo.replace('_', ' ').title()} — {n} episodio(s)"):
            st.markdown(desc)
