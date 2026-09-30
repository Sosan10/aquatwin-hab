"""
Vista 3 — Diagnóstico limnológico trazable.

Muestra el resultado del motor de reglas determinista y, sobre todo, **cómo se
llegó a él**. La tabla de trazabilidad incluye las reglas que *no* se
dispararon, porque una explicación que solo enseña la evidencia a favor no es
una explicación: es un alegato.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ..dominio import TAXONES, NivelRiesgo
from ..explicabilidad import (
    ColumnaDoc,
    Ficha,
    badge_riesgo,
    figura,
    nota_metodologica,
    tabla,
    tema_oscuro,
)
from ..motor.indices import calcular_todos, tabla_indices
from ..motor.reglas import REGLAS, diagnosticar


def render(obs: pd.Series, estacion: str) -> None:
    """Dibuja el diagnóstico completo de una observación."""
    diag = diagnosticar(obs)

    # ------------------------------------------------------------------
    # Encabezado con el veredicto
    # ------------------------------------------------------------------
    c1, c2, c3, c4 = st.columns(4)
    c1.markdown("**Nivel de alerta**")
    c1.markdown(badge_riesgo(diag.nivel), unsafe_allow_html=True)
    c2.metric("Índice de riesgo", f"{diag.indice_riesgo:.0f}/100")
    c3.metric("Reglas disparadas", f"{len(diag.disparadas)} de {len(diag.evaluaciones)}")
    c4.metric("Microcistina estimada", f"{diag.microcistina_estimada:.1f} µg/L")

    st.markdown("#### Por qué el motor emite este nivel")
    st.markdown(diag.justificacion())

    # ------------------------------------------------------------------
    # 1. Contribución de cada regla
    # ------------------------------------------------------------------
    ev = sorted(diag.evaluaciones, key=lambda e: e.contribucion, reverse=True)
    fig = go.Figure(
        go.Bar(
            x=[e.contribucion for e in ev],
            y=[e.nombre for e in ev],
            orientation="h",
            marker=dict(
                color=[e.nivel.color if e.disparada else "#334155" for e in ev],
                line=dict(color="rgba(148,163,184,0.35)", width=1),
            ),
            customdata=np.stack(
                [
                    [e.valor_observado for e in ev],
                    [e.umbral for e in ev],
                    [e.unidad for e in ev],
                    [("DISPARADA" if e.disparada else "no disparada") for e in ev],
                ],
                axis=-1,
            ),
            hovertemplate=(
                "<b>%{y}</b><br>Estado: %{customdata[3]}<br>"
                "Observado: %{customdata[0]:.2f} %{customdata[2]}<br>"
                "Umbral: %{customdata[1]:.2f} %{customdata[2]}<br>"
                "Contribución: %{x:.2f}<extra></extra>"
            ),
            text=[f"{e.contribucion:.1f}" if e.disparada else "" for e in ev],
            textposition="outside",
        )
    )
    tema_oscuro(fig, alto=430)
    fig.update_layout(hovermode="closest")
    fig.update_xaxes(title_text="Contribución al índice de riesgo (peso × severidad)")
    fig.update_yaxes(title_text="", autorange="reversed")

    top = ev[0] if ev and ev[0].disparada else None
    figura(
        fig,
        Ficha(
            titulo=f"Descomposición del diagnóstico en {estacion}",
            que_muestra=(
                f"Aportación de cada una de las {len(REGLAS)} reglas del motor "
                f"al índice de riesgo final. Las barras grises corresponden a "
                f"reglas evaluadas que **no** se dispararon."
            ),
            como_leer=(
                "La longitud de la barra es la contribución de esa regla al "
                "índice, calculada como *peso × severidad*. El **color indica el "
                "nivel** alcanzado (verde bajo, ámbar moderado, naranja alto, "
                "rojo crítico) y el **gris** que la regla no se activó. Al pasar "
                "el cursor se ve el valor observado frente al umbral. "
                "Se muestran también las reglas no disparadas a propósito: sin "
                "ellas no se sabría qué se comprobó y salió bien."
            ),
            hallazgo=(
                (
                    f"La regla con mayor contribución es **{top.nombre}** "
                    f"({top.contribucion:.2f} puntos): {top.explicacion}"
                )
                if top
                else "Ninguna regla se ha disparado: todos los parámetros están "
                     "dentro de sus umbrales de atención."
            ),
            criterio=(
                "Cada regla lleva su referencia normativa propia (OMS, EPA, "
                "Redfield…), detallada en la tabla de trazabilidad."
            ),
            procedencia=(
                "Motor de reglas determinista aplicado a la observación "
                "seleccionada. Sin componente aleatoria: la misma entrada "
                "produce siempre esta misma salida."
            ),
            limitaciones=(
                "Los pesos de las reglas son un juicio experto calibrado sobre "
                "literatura, no un ajuste estadístico sobre datos de este "
                "embalse. Un cambio en los pesos cambiaría el índice; el "
                "*nivel* final es más robusto porque una regla crítica de peso "
                "alto lo determina por sí sola."
            ),
        ),
        key="contribucion_reglas",
    )

    # ------------------------------------------------------------------
    # 2. Tabla de trazabilidad completa
    # ------------------------------------------------------------------
    tabla(
        diag.a_tabla(),
        Ficha(
            titulo="Traza completa de la evaluación",
            que_muestra=(
                "Registro de auditoría del diagnóstico: las ocho reglas con su "
                "valor observado, su umbral, si se dispararon, su contribución "
                "y la norma que las respalda."
            ),
            como_leer=(
                "Se lee fila a fila como un acta. Comparando **«Valor "
                "observado»** con **«Umbral»** se comprueba por qué cada regla "
                "se disparó o no. La columna **«Referencia normativa»** permite "
                "verificar el criterio en la fuente original."
            ),
            hallazgo=(
                f"Se dispararon {len(diag.disparadas)} reglas de "
                f"{len(diag.evaluaciones)}, con una puntuación agregada de "
                f"{diag.puntuacion:.2f} sobre un máximo posible de "
                f"{diag.puntuacion_maxima:.2f}, es decir un índice de "
                f"{diag.indice_riesgo:.0f}/100."
            ),
            criterio="Ver la columna «Referencia normativa» de cada fila.",
            procedencia="Salida directa del motor `motor/reglas.py`, sin post-proceso.",
            limitaciones=(
                "El diagnóstico se refiere a un **instante y una estación**. No "
                "extrapola al conjunto del embalse ni describe la tendencia."
            ),
        ),
        diccionario=[
            ColumnaDoc("Regla", "Nombre de la regla de diagnóstico.", "—", "Motor de reglas"),
            ColumnaDoc("Estado", "Si la regla se activó con esta observación.", "—", "Motor de reglas"),
            ColumnaDoc("Valor observado", "Magnitud medida que evalúa la regla.", "ver Unidad", "Serie simulada"),
            ColumnaDoc("Umbral", "Valor a partir del cual la regla se dispara.", "ver Unidad", "Norma de referencia"),
            ColumnaDoc("Nivel", "Severidad alcanzada por la regla.", "—", "Motor de reglas"),
            ColumnaDoc("Peso", "Importancia relativa de la regla en la agregación.", "adimensional", "Calibración experta"),
            ColumnaDoc("Contribución", "Peso × severidad; aporte al índice final.", "adimensional", "Cálculo"),
            ColumnaDoc("Explicación", "Lectura del resultado con los números del caso.", "—", "Motor de reglas"),
            ColumnaDoc("Referencia normativa", "Norma o publicación que fija el umbral.", "—", "Bibliografía"),
        ],
    )

    nota_metodologica(
        "Cómo se agregan las reglas en un solo nivel",
        """
La agregación es deliberadamente **conservadora**, en dos pasos:

1. **Puntuación ponderada.** Se suma `peso × severidad` de cada regla disparada
   y se normaliza sobre el máximo teórico. Los cortes son 12 % (moderado),
   28 % (alto) y 45 % (crítico).

2. **Corrección por regla crítica.** El nivel final nunca queda por debajo del
   máximo alcanzado por una regla de peso alto (≥ 1,2), que son las de
   cianotoxina, oxígeno disuelto y densidad de cianobacterias.

El segundo paso es el importante y merece justificarse. Si solo se promediara,
una microcistina estimada por encima de la guía de la OMS quedaría diluida entre
siete indicadores tranquilos y el sistema declararía riesgo moderado. En un
sistema de alerta sanitaria, **el coste de un falso negativo no es comparable al
de un falso positivo**: un aviso de más cuesta una muestra de laboratorio; un
aviso de menos puede costar una intoxicación. La agregación tenía que reflejar
esa asimetría, y por eso se hace así.
""",
    )

    # ------------------------------------------------------------------
    # 3. Panel de índices derivados
    # ------------------------------------------------------------------
    t_idx = tabla_indices(obs)
    tabla(
        t_idx,
        Ficha(
            titulo="Panel de índices limnológicos derivados",
            que_muestra=(
                "Cinco índices calculados a partir de las variables medidas: "
                "estado trófico (TSI), relación N:P, saturación de oxígeno, "
                "estabilidad de la columna e índice satelital NDCI."
            ),
            como_leer=(
                "Cada fila incluye la **fórmula aplicada**, de modo que el "
                "cálculo se puede reproducir a mano, y una **interpretación** "
                "redactada con los números de este caso concreto. La columna "
                "«Categoría» traduce el número a la clase cualitativa que usa la "
                "literatura."
            ),
            hallazgo=" ".join(
                f"**{r.nombre}**: {r.valor} {r.unidad} → {r.categoria}."
                for r in calcular_todos(obs)
            ),
            criterio="Cada índice cita su publicación de origen en la columna «Referencia».",
            procedencia="Calculados por `motor/indices.py` sobre la observación seleccionada.",
            limitaciones=(
                "El TSI se calculó desde clorofila-a; las variantes basadas en "
                "disco de Secchi o en fósforo pueden dar clases distintas para "
                "el mismo cuerpo de agua. El NDCI está **estimado por inversión** "
                "desde la clorofila simulada, no calculado de bandas satelitales "
                "reales, así que solo sirve como capa ilustrativa."
            ),
        ),
        diccionario=[
            ColumnaDoc("Índice", "Nombre del índice limnológico.", "—", "Literatura científica"),
            ColumnaDoc("Valor", "Resultado del cálculo.", "ver Unidad", "Cálculo"),
            ColumnaDoc("Unidad", "Unidad del índice.", "—", "Definición del índice"),
            ColumnaDoc("Categoría", "Clase cualitativa asociada al valor.", "—", "Umbrales de la literatura"),
            ColumnaDoc("Nivel", "Nivel de riesgo asociado a esa categoría.", "—", "Motor"),
            ColumnaDoc("Fórmula", "Expresión matemática aplicada.", "—", "Publicación de origen"),
            ColumnaDoc("Interpretación", "Lectura del valor en el contexto del caso.", "—", "Motor"),
            ColumnaDoc("Referencia", "Publicación que define el índice.", "—", "Bibliografía"),
        ],
    )

    # ------------------------------------------------------------------
    # 4. Taxón probable y recomendaciones
    # ------------------------------------------------------------------
    col_a, col_b = st.columns([1, 1])

    with col_a:
        st.markdown("#### Taxón dominante probable")
        tx = TAXONES.get(diag.taxon_probable)
        if tx:
            st.markdown(
                f"**{tx.nombre}**\n\n"
                f"- **Toxina asociada:** {tx.toxina}\n"
                f"- **Óptimo térmico:** {tx.rango_temp_optimo[0]:.0f}–"
                f"{tx.rango_temp_optimo[1]:.0f} °C\n"
                f"- **Ecología:** {tx.nota}\n\n"
                f"*Inferido de la temperatura ({obs['temp_surface']:.1f} °C) y "
                f"la relación N:P. Es una hipótesis de cribado: la "
                f"identificación taxonómica real exige microscopía o análisis "
                f"genético.*"
            )

    with col_b:
        st.markdown("#### Recomendaciones de gestión")
        for r in diag.recomendaciones:
            st.markdown(f"- {r}")
        st.caption(
            "Cada recomendación indica entre corchetes las reglas que la "
            "motivan, para que la acción sea rastreable hasta la evidencia. "
            "El sistema **aconseja**; la decisión es de la persona responsable."
        )
