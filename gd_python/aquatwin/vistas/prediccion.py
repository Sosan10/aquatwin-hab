"""
Vista 4 — Pronóstico y explicabilidad del modelo.

Cuatro bloques, en orden de lo general a lo accionable:

1. **Validación** — el modelo frente al referente de persistencia.
2. **Explicabilidad global** — qué variables mueven al modelo en conjunto.
3. **Explicabilidad local** — por qué esta predicción concreta.
4. **Contrafactual** — qué habría que cambiar para bajar del umbral.

El orden importa: sin el bloque 1, los tres siguientes explicarían las
decisiones de un modelo del que no sabemos si funciona.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ..dominio import variable
from ..explicabilidad import (
    ColumnaDoc,
    Ficha,
    anotar_umbrales,
    figura,
    nota_metodologica,
    tabla,
    tema_oscuro,
)
from ..motor.prediccion import (
    ACCIONABLES,
    PREDICTORAS,
    ResultadoModelo,
    contrafactual,
    explicar_prediccion,
    importancia_global,
)


def render(res: ResultadoModelo) -> None:
    """Dibuja la vista completa de pronóstico y explicabilidad."""
    var = variable("chlorophyll_a")

    # ==================================================================
    # 1. Validación
    # ==================================================================
    st.markdown("### 1. ¿Funciona el modelo?")
    st.caption(
        "Antes de explicar por qué el modelo decide lo que decide, hay que "
        "comprobar que decide algo útil. Este bloque va primero por eso."
    )

    n = min(len(res.y_test), 400)
    eje = res.meta["tiempo"].iloc[:n] if len(res.meta) else np.arange(n)

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(x=eje, y=res.y_test.iloc[:n], mode="lines", name="Valor real observado",
                   line=dict(color="#22d3ee", width=2.2))
    )
    fig.add_trace(
        go.Scatter(x=eje, y=res.y_pred[:n], mode="lines", name="Pronóstico del modelo",
                   line=dict(color="#f97316", width=2, dash="dash"))
    )
    if len(res.meta):
        fig.add_trace(
            go.Scatter(x=eje, y=res.meta["persistencia"].iloc[:n], mode="lines",
                       name="Referente ingenuo (persistencia)",
                       line=dict(color="#64748b", width=1.2, dash="dot"))
        )
    anotar_umbrales(fig, var)
    tema_oscuro(fig, alto=430)
    fig.update_yaxes(title_text=var.etiqueta())
    fig.update_xaxes(title_text="Fecha y hora (periodo de prueba, posterior al corte)")

    veredicto = (
        f"El modelo **mejora un {res.mejora_sobre_persistencia:.1f} %** sobre la "
        f"persistencia, así que aporta información real."
        if res.mejora_sobre_persistencia > 0
        else f"El modelo **no supera** al referente ingenuo "
             f"({res.mejora_sobre_persistencia:.1f} %). Tal como está, no debería "
             f"usarse para decidir: la persistencia sería más simple e igual de buena."
    )

    figura(
        fig,
        Ficha(
            titulo=f"Validación del pronóstico a {res.horizonte_horas} h",
            que_muestra=(
                f"Comparación entre el valor real de clorofila-a, el pronóstico "
                f"del modelo y el referente de persistencia, sobre el periodo "
                f"de prueba (posterior al {res.corte:%d/%m/%Y %H:%M}), que el "
                f"modelo **nunca vio durante el entrenamiento**."
            ),
            como_leer=(
                "La línea **cian** es lo que ocurrió de verdad; la **naranja "
                "discontinua**, lo que el modelo predijo 24 h antes; la **gris "
                "punteada**, lo que habría predicho suponer que nada cambia. "
                "El modelo es útil solo si la naranja se pega a la cian mejor "
                "que la gris. Las líneas horizontales son los umbrales de la OMS."
            ),
            hallazgo=(
                f"MAE del modelo **{res.mae:.2f} µg/L** frente a "
                f"**{res.mae_persistencia:.2f} µg/L** de la persistencia; "
                f"R² = {res.r2:.3f} sobre el conjunto de prueba. {veredicto}"
            ),
            criterio=(
                "El listón no es un R² alto sino **superar a la persistencia**. "
                "En series temporales autocorreladas es fácil obtener un R² "
                "elevado sin aportar nada, simplemente copiando el último valor."
            ),
            procedencia=(
                f"Gradient Boosting entrenado con {len(res.X_train):,} "
                f"observaciones anteriores al corte y evaluado con "
                f"{len(res.X_test):,} posteriores. Partición **temporal**, "
                f"nunca aleatoria."
            ),
            limitaciones=(
                "Entrenado sobre datos simulados: las métricas describen la "
                "capacidad de aprender la dinámica del simulador, no de "
                "predecir un embalse real. Con datos reales el error sería "
                "mayor, porque la naturaleza tiene procesos que el generador no "
                "reproduce."
            ),
        ),
        key="validacion",
    )

    tabla(
        res.tabla_metricas(),
        Ficha(
            titulo="Métricas de validación",
            que_muestra="Indicadores de rendimiento del modelo sobre el conjunto de prueba.",
            como_leer=(
                "Cada fila trae su propia interpretación en la última columna. "
                "La métrica decisiva es **«Mejora sobre persistencia»**: si "
                "fuese negativa o cercana a cero, el modelo sobraría."
            ),
            hallazgo=(
                f"MAE de {res.mae:.2f} µg/L, es decir "
                f"{res.mejora_sobre_persistencia:+.1f} % respecto al referente "
                f"ingenuo, con R² de {res.r2:.3f}."
            ),
            criterio="Comparación obligatoria contra persistencia en series temporales.",
            procedencia="Calculadas sobre el conjunto de prueba posterior al corte temporal.",
            limitaciones=(
                "Un único corte temporal da una sola estimación. Una validación "
                "más robusta usaría varios cortes deslizantes y reportaría la "
                "dispersión del error entre ellos."
            ),
        ),
        diccionario=[
            ColumnaDoc("Métrica", "Nombre del indicador de rendimiento.", "—", "Evaluación"),
            ColumnaDoc("Valor", "Resultado del indicador.", "ver Unidad", "Cálculo"),
            ColumnaDoc("Unidad", "Unidad de la métrica.", "—", "Definición"),
            ColumnaDoc("Interpretación", "Qué significa este valor en la práctica.", "—", "Documentación"),
        ],
    )

    nota_metodologica(
        "Por qué el modelo predice el incremento y no el nivel",
        f"""
El modelo no predice cuánta clorofila habrá dentro de {res.horizonte_horas} h,
sino **cuánto va a cambiar**. El nivel se reconstruye después sumando ese cambio
al valor actual medido.

La razón es técnica y tiene consecuencias medibles. Un modelo de árboles que
predice el nivel debe reconstruir la relación «el valor futuro se parece al
actual» mediante una escalera de cortes, algo que los árboles aproximan mal
—no extrapolan ni representan bien una identidad lineal—. El resultado es que
pierde frente a la persistencia **pese a disponer de más información**.

Al fijar como objetivo la diferencia, la persistencia pasa a ser equivalente a
predecir cero, y el modelo solo tiene que aprender la desviación respecto a
ella, que es exactamente lo que aporta valor sobre suponer que nada cambia.

Las métricas siguen calculándose **sobre el nivel reconstruido**, para que la
comparación con la persistencia sea justa y directa.

Hay además una ventaja de interpretabilidad: las contribuciones SHAP pasan a
responder «¿por qué va a crecer la biomasa?», que es la pregunta útil, en lugar
de «¿por qué está donde está?», que ya se sabe porque se mide.
""",
    )

    # ==================================================================
    # 2. Explicabilidad global
    # ==================================================================
    st.markdown("---")
    st.markdown("### 2. ¿Qué mira el modelo? — Explicabilidad global")

    imp = importancia_global(res)

    fig2 = go.Figure(
        go.Bar(
            x=imp["Importancia media |SHAP|"],
            y=imp["Variable"],
            orientation="h",
            marker=dict(
                color=imp["Efecto medio (con signo)"],
                colorscale=[[0, "#22c55e"], [0.5, "#94a3b8"], [1, "#ef4444"]],
                cmid=0,
                colorbar=dict(title=dict(text="Efecto medio<br>[µg/L]", side="right"), len=0.7),
                line=dict(color="rgba(148,163,184,0.3)", width=1),
            ),
            customdata=np.stack(
                [imp["Efecto medio (con signo)"], imp["Correlación con el valor"]], axis=-1
            ),
            hovertemplate=(
                "<b>%{y}</b><br>Importancia |SHAP|: %{x:.3f} µg/L<br>"
                "Efecto medio: %{customdata[0]:+.3f} µg/L<br>"
                "Correlación valor–contribución: %{customdata[1]:+.2f}<extra></extra>"
            ),
        )
    )
    tema_oscuro(fig2, alto=430)
    fig2.update_layout(hovermode="closest")
    fig2.update_xaxes(title_text="Importancia media |SHAP| [µg/L de cambio previsto]")
    fig2.update_yaxes(title_text="", autorange="reversed")

    top3 = imp.head(3)["Variable"].tolist()
    figura(
        fig2,
        Ficha(
            titulo="Importancia global de las variables (SHAP)",
            que_muestra=(
                "Cuánto desplaza cada variable el **cambio previsto** de "
                "biomasa, en promedio, sobre todo el conjunto de prueba. La "
                "barra es la media del valor absoluto de la contribución SHAP."
            ),
            como_leer=(
                "La **longitud** mide cuánto importa la variable, sin decir en "
                "qué dirección. El **color** aporta esa dirección: rojo si de "
                "media empuja el pronóstico al alza, verde si lo empuja a la "
                "baja, gris si su efecto se compensa. Una barra larga y gris "
                "señala una variable influyente pero **no monótona**: sube el "
                "pronóstico en unos casos y lo baja en otros según el contexto."
            ),
            hallazgo=(
                f"Las tres variables más influyentes son **{', '.join(top3)}**. "
                f"La primera, {imp.iloc[0]['Variable']}, desplaza el pronóstico "
                f"{imp.iloc[0]['Importancia media |SHAP|']:.2f} µg/L en promedio."
            ),
            criterio=(
                "SHAP (SHapley Additive exPlanations) reparte la diferencia "
                "entre predicción y valor base entre las variables, con la "
                "garantía de que las contribuciones suman exactamente esa "
                "diferencia."
            ),
            procedencia=(
                f"TreeExplainer aplicado al modelo entrenado sobre "
                f"{res.shap_values.shape[0] if res.shap_values is not None else 0} "
                f"observaciones del conjunto de prueba."
            ),
            limitaciones=(
                "SHAP explica **el modelo, no la naturaleza**. Que el modelo se "
                "apoye mucho en una variable no demuestra causalidad: puede "
                "estar usándola como sustituto de otra correlacionada. Aquí, "
                "además, el modelo aprendió de un simulador, así que reproduce "
                "las relaciones que el simulador contiene por diseño."
            ),
        ),
        key="shap_global",
    )

    tabla(
        imp.drop(columns=["variable"]),
        Ficha(
            titulo="Importancia de variables en detalle",
            que_muestra="Valores numéricos de la figura anterior, variable a variable.",
            como_leer=(
                "**Importancia media |SHAP|** mide cuánto pesa. **Efecto medio "
                "(con signo)** indica hacia dónde empuja de media. "
                "**Correlación valor–contribución** revela la monotonía: cerca "
                "de +1, valores altos de la variable siempre suben el "
                "pronóstico; cerca de 0, el efecto depende del contexto."
            ),
            hallazgo=(
                f"{imp.iloc[0]['Variable']} encabeza la lista. "
                f"{imp.iloc[0]['Interpretación']}"
            ),
            criterio="Valores SHAP calculados con TreeExplainer sobre el conjunto de prueba.",
            procedencia="Salida de `motor/prediccion.py::importancia_global`.",
            limitaciones=(
                "Las variables muy correlacionadas entre sí (por ejemplo "
                "temperatura instantánea y media de 24 h) se reparten el "
                "crédito, lo que puede hacer que ambas parezcan menos "
                "importantes de lo que su información conjunta merece."
            ),
        ),
        diccionario=[
            ColumnaDoc("Variable", "Predictor usado por el modelo.", "—", "Definición del modelo"),
            ColumnaDoc("Importancia media |SHAP|", "Desplazamiento medio absoluto del pronóstico.", "µg/L", "SHAP"),
            ColumnaDoc("Efecto medio (con signo)", "Dirección predominante del empuje.", "µg/L", "SHAP"),
            ColumnaDoc("Correlación con el valor", "Monotonía entre valor y contribución.", "adimensional", "Cálculo"),
            ColumnaDoc("Interpretación", "Lectura combinada de las tres métricas.", "—", "Motor"),
        ],
    )

    # ==================================================================
    # 3. Explicabilidad local
    # ==================================================================
    st.markdown("---")
    st.markdown("### 3. ¿Por qué *esta* predicción? — Explicabilidad local")

    n_shap = res.shap_values.shape[0] if res.shap_values is not None else 0
    if n_shap == 0:
        st.warning("No hay valores SHAP calculados.")
        return

    # Por defecto, la predicción más alta: el caso que más importa explicar
    idx_defecto = int(np.argmax(res.y_pred[:n_shap]))
    idx = st.slider(
        "Observación del conjunto de prueba a explicar",
        0, n_shap - 1, idx_defecto,
        help="Se preselecciona la predicción más alta, que es el caso que más "
             "interesa auditar. Desplaza el control para examinar cualquier otra.",
    )

    exp = explicar_prediccion(res, idx)
    contrib = exp.contribuciones

    # Cascada: base → contribuciones → predicción
    fig3 = go.Figure(
        go.Waterfall(
            orientation="v",
            measure=["absolute"] + ["relative"] * len(contrib) + ["total"],
            x=["Cambio base"] + contrib["Variable"].tolist() + ["Cambio previsto"],
            y=[exp.valor_base] + contrib["Contribución SHAP"].tolist() + [0],
            text=[f"{exp.valor_base:.1f}"]
                 + [f"{v:+.1f}" for v in contrib["Contribución SHAP"]]
                 + [f"{exp.prediccion:.1f}"],
            textposition="outside",
            connector=dict(line=dict(color="rgba(148,163,184,0.4)")),
            increasing=dict(marker=dict(color="#ef4444")),
            decreasing=dict(marker=dict(color="#22c55e")),
            totals=dict(marker=dict(color="#06b6d4")),
            hovertemplate="<b>%{x}</b><br>Contribución: %{y:+.2f} µg/L<extra></extra>",
        )
    )
    tema_oscuro(fig3, alto=470)
    fig3.update_layout(hovermode="closest")
    fig3.update_yaxes(title_text="Incremento de clorofila-a [µg/L]")
    fig3.update_xaxes(title_text="", tickangle=-40)
    fig3.add_hline(y=0, line_color="rgba(148,163,184,0.5)", line_width=1)

    real = float(res.y_test.iloc[idx])
    figura(
        fig3,
        Ficha(
            titulo=(
                f"Descomposición de la predicción — {exp.estacion}, "
                f"{exp.tiempo:%d/%m/%Y %H:%M}"
            ),
            que_muestra=(
                "Cómo se construye esta predicción concreta. El modelo predice "
                "el **incremento** de clorofila-a en el horizonte, no el nivel: "
                "la figura parte del cambio medio del entrenamiento y suma la "
                "contribución de cada variable hasta el cambio previsto."
            ),
            como_leer=(
                "Se lee de izquierda a derecha, como una cuenta. La primera "
                "barra es el **cambio base** (el incremento medio del "
                "entrenamiento: lo que el modelo diría sin saber nada del "
                "caso). Cada barra intermedia suma o resta: **roja** empuja "
                "al alza, **verde** a la baja. La barra **cian** final es el "
                "cambio previsto. Para obtener el nivel pronosticado se suma "
                "ese cambio al valor actual medido."
            ),
            hallazgo=exp.narrativa()
            + f" El valor real observado {res.horizonte_horas} h después fue de "
              f"**{real:.1f} µg/L**, así que el error del pronóstico fue de "
              f"{abs(real - exp.nivel_previsto):.1f} µg/L.",
            criterio=(
                "Los valores SHAP satisfacen la propiedad de eficiencia: la "
                "suma de contribuciones iguala exactamente la diferencia entre "
                "el cambio previsto y el cambio base, sin residuo."
            ),
            procedencia="TreeExplainer sobre el modelo entrenado; observación del conjunto de prueba.",
            limitaciones=(
                "La descomposición explica **la decisión del modelo**, no el "
                "fenómeno físico. Si el modelo aprendió una relación espuria, "
                "SHAP la mostrará con la misma claridad que una correcta: es "
                "una herramienta de auditoría del modelo, no de validación "
                "científica."
            ),
        ),
        key="shap_local",
    )

    tabla(
        contrib[["Variable", "Valor observado", "Contribución SHAP", "Sentido"]].round(3),
        Ficha(
            titulo="Contribuciones de esta predicción, ordenadas por magnitud",
            que_muestra=(
                f"Valor de cada predictor en el caso seleccionado y su "
                f"contribución, en µg/L, al cambio previsto de "
                f"{exp.prediccion:+.1f} µg/L (nivel actual {exp.nivel_actual:.1f} "
                f"y pronóstico {exp.nivel_previsto:.1f} µg/L)."
            ),
            como_leer=(
                "Ordenada de mayor a menor influencia absoluta. «Aumenta el "
                "riesgo» significa que el valor observado de esa variable "
                "empujó el cambio previsto **por encima** del cambio base, es "
                "decir, hacia más biomasa."
            ),
            hallazgo=(
                f"El factor dominante es **{contrib.iloc[0]['Variable']}** "
                f"(valor {contrib.iloc[0]['Valor observado']:.2f}), con una "
                f"contribución de {contrib.iloc[0]['Contribución SHAP']:+.2f} µg/L."
            ),
            criterio="Contribuciones SHAP; suman la diferencia entre valor base y predicción.",
            procedencia="Salida de `motor/prediccion.py::explicar_prediccion`.",
            limitaciones=(
                "Contribución alta no equivale a causa manipulable: la "
                "temperatura del agua puede dominar la explicación y ser "
                "inaccionable para el gestor. Ese salto lo da el bloque 4."
            ),
        ),
        diccionario=[
            ColumnaDoc("Variable", "Predictor del modelo.", "—", "Definición del modelo"),
            ColumnaDoc("Valor observado", "Valor de la variable en este caso.", "según variable", "Serie simulada"),
            ColumnaDoc("Contribución SHAP", "Desplazamiento que aporta al cambio previsto.", "µg/L", "SHAP"),
            ColumnaDoc("Sentido", "Si empuja el cambio previsto al alza o a la baja.", "—", "Cálculo"),
        ],
    )

    # ==================================================================
    # 4. Contrafactual
    # ==================================================================
    st.markdown("---")
    st.markdown("### 4. ¿Qué habría que cambiar? — Análisis contrafactual")
    st.caption(
        "SHAP explica el pasado de la decisión. El contrafactual responde a la "
        "pregunta del gestor: qué tendría que haber sido distinto. Solo se "
        "ofrecen variables sobre las que se puede actuar — un contrafactual "
        "sobre la temperatura del agua sería cierto e inútil."
    )

    variable_cf = st.selectbox(
        "Variable accionable",
        options=list(ACCIONABLES),
        format_func=lambda k: f"{PREDICTORAS[k]} — {ACCIONABLES[k]}",
    )
    objetivo = st.slider(
        "Umbral objetivo de clorofila-a [µg/L]", 10.0, 60.0, 25.0, 1.0,
        help="Por defecto, el umbral de atención de la OMS (25 µg/L).",
    )

    cf = contrafactual(res, idx, variable_cf, objetivo=objetivo)

    fig4 = go.Figure()
    fig4.add_trace(
        go.Scatter(x=cf["barrido"], y=cf["predicciones"], mode="lines",
                   name="Pronóstico simulado", line=dict(color="#22d3ee", width=2.5))
    )
    fig4.add_hline(y=objetivo, line_dash="dash", line_color="#f59e0b",
                   annotation_text=f"Objetivo: {objetivo:.0f} µg/L",
                   annotation_position="top right", annotation_font_color="#f59e0b")
    fig4.add_vline(x=cf["valor_original"], line_dash="dot", line_color="#94a3b8",
                   annotation_text=f"Valor actual: {cf['valor_original']:.3f}",
                   annotation_position="top left")
    if cf["alcanzable"]:
        fig4.add_vline(x=cf["valor_necesario"], line_dash="dash", line_color="#22c55e",
                       annotation_text=f"Necesario: {cf['valor_necesario']:.3f}",
                       annotation_position="bottom right", annotation_font_color="#22c55e")
    tema_oscuro(fig4, alto=400)
    fig4.update_layout(hovermode="x")
    fig4.update_xaxes(title_text=f"{cf['nombre']} (valor hipotético)")
    fig4.update_yaxes(title_text=f"Pronóstico de {var.etiqueta()}")

    figura(
        fig4,
        Ficha(
            titulo=f"Contrafactual: efecto de {cf['nombre']} sobre el pronóstico",
            que_muestra=(
                f"Cómo cambiaría el pronóstico de este caso concreto si "
                f"{cf['nombre'].lower()} hubiera tomado otro valor, manteniendo "
                f"todo lo demás igual. El recorrido cubre el rango histórico "
                f"observado (percentiles 1 a 99)."
            ),
            como_leer=(
                "La curva cian es el pronóstico simulado para cada valor "
                "hipotético. La línea **gris punteada** marca el valor real del "
                "caso; la **ámbar**, el umbral objetivo; la **verde**, el valor "
                "que haría falta para bajar de ese umbral. Si la curva nunca "
                "cruza la línea ámbar, actuar solo sobre esta variable no basta."
            ),
            hallazgo=cf["mensaje"],
            criterio=(
                f"Umbral objetivo de {objetivo:.0f} µg/L "
                + ("(umbral de atención de la OMS)." if abs(objetivo - 25) < 0.5 else "(fijado por el usuario).")
            ),
            procedencia=(
                "Barrido de 40 valores sobre el modelo entrenado, con el resto "
                "de predictores fijados en los del caso seleccionado."
            ),
            limitaciones=(
                "**Es la respuesta del modelo, no del embalse.** Supone que las "
                "demás variables permanecen constantes, lo cual es físicamente "
                "irreal: reducir el fósforo cambiaría también la biomasa, el pH "
                "y el oxígeno. Sirve para ordenar prioridades de gestión, no "
                "para predecir el resultado de una intervención."
            ),
        ),
        key="contrafactual",
    )

    nota_metodologica(
        "Por qué el contrafactual se limita a variables accionables",
        """
El modelo usa once predictores, pero solo tres se ofrecen aquí: fósforo total,
nitrógeno total y velocidad del viento (esta última como sustituto de la mezcla
artificial por desestratificación mecánica).

La razón es que una explicación debe terminar en una decisión posible. La
temperatura superficial suele ser el predictor más influyente, y decirle a un
gestor que «con 4 °C menos no habría floración» es exacto e inservible.

Los tres seleccionados corresponden a palancas reales de gestión:

| Variable | Intervención asociada | Horizonte |
|---|---|---|
| Fósforo total | Control de vertidos y escorrentía; coagulación con sales de aluminio | Semanas a años |
| Nitrógeno total | Control de la carga difusa agrícola | Meses a años |
| Velocidad del viento | Desestratificación mecánica, aireación, cortinas de burbujas | Horas a días |

Conviene leer la columna del horizonte: la única palanca de efecto inmediato es
la mezcla física. Las de nutrientes son más eficaces a largo plazo pero no
resuelven una floración en curso.
""",
    )
