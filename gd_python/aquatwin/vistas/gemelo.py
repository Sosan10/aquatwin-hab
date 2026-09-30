"""
Vista 1 — Gemelo digital 3D.

Representación tridimensional del vaso del embalse con la capa de la variable
seleccionada interpolada sobre la superficie del agua.

Decisión de diseño que afecta directamente a la interpretabilidad: la
superficie **no se pinta con gradientes decorativos**, sino que se interpola por
IDW (distancia inversa ponderada) desde las posiciones reales de las
estaciones. Además se calcula y se muestra un **mapa de incertidumbre**: lejos
de toda estación, el gemelo declara que no sabe, en lugar de inventar un color.

Esa distinción —entre lo medido, lo interpolado y lo desconocido— es la
diferencia entre una herramienta de análisis y una animación bonita.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ..datos import actuadores_de, embalse_por_id
from ..dominio import Embalse, variable
from ..explicabilidad import Ficha, ColumnaDoc, figura, tabla, nota_metodologica

RESOLUCION = 60  # celdas por lado de la malla


def _malla_batimetrica(emb: Embalse, n: int = RESOLUCION) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Genera la malla batimétrica del vaso.

    Es un modelo **procedural**, no una batimetría medida: un cuenco parabólico
    con un canal central y una bahía lateral, escalado a las dimensiones reales
    del embalse (profundidad máxima y media del catálogo).

    Se declara como esquemático en la ficha de la figura. Con una batimetría
    real (GeoTIFF o levantamiento por ecosonda) esta función se sustituiría sin
    tocar nada más.
    """
    lado = np.sqrt(emb.area_km2) * 1000 / 2  # semilado en metros
    x = np.linspace(-lado, lado, n)
    z = np.linspace(-lado, lado, n)
    X, Z = np.meshgrid(x, z)

    r = np.sqrt((X / lado) ** 2 + (Z / lado) ** 2)
    cuenco = -emb.prof_max_m * np.clip(1 - r**2, 0, 1)
    canal = -0.18 * emb.prof_max_m * np.exp(-((X / (lado * 0.28)) ** 2))
    bahia = 0.30 * emb.prof_max_m * np.exp(
        -(((X + lado * 0.45) / (lado * 0.30)) ** 2 + ((Z - lado * 0.35) / (lado * 0.30)) ** 2)
    )
    fondo = cuenco + canal + bahia
    return X, Z, np.clip(fondo, -emb.prof_max_m, 0.0)


def _interpolar_idw(
    estaciones: pd.DataFrame,
    X: np.ndarray,
    Z: np.ndarray,
    columna: str,
    *,
    potencia: float = 2.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Interpolación por distancia inversa ponderada.

    Devuelve (valores, distancia_a_la_estacion_mas_cercana). La segunda salida
    es la que permite representar la incertidumbre: cuanto más lejos de
    cualquier estación, menos fiable es el valor interpolado.

    IDW es la elección adecuada aquí frente a kriging por dos razones: con 2–4
    estaciones no hay datos suficientes para ajustar un variograma fiable, y su
    resultado es directamente explicable ("es el promedio de las estaciones,
    ponderado por la inversa del cuadrado de la distancia").
    """
    escala = float(np.abs(X).max())
    px = estaciones["x"].to_numpy() * escala / 5.0
    pz = estaciones["z"].to_numpy() * escala / 5.0
    valores = estaciones[columna].to_numpy(dtype=float)

    puntos = np.stack([X.ravel(), Z.ravel()], axis=1)
    d = np.sqrt(
        (puntos[:, 0:1] - px[None, :]) ** 2 + (puntos[:, 1:2] - pz[None, :]) ** 2
    )
    d = np.maximum(d, 1.0)

    pesos = 1.0 / d**potencia
    interpolado = (pesos * valores[None, :]).sum(axis=1) / pesos.sum(axis=1)

    return interpolado.reshape(X.shape), d.min(axis=1).reshape(X.shape)


def _escala_color(clave: str) -> list[list]:
    """Rampa de color por variable, coherente con la del gemelo web."""
    rampas = {
        "chlorophyll_a": ["#2b83ba", "#abdda4", "#ffffbf", "#fdae61", "#d7191c", "#7f0000"],
        "phycocyanin": ["#1a9850", "#91cf60", "#d9ef8b", "#fee08b", "#fc8d59", "#d73027"],
        "temp_surface": ["#313695", "#4575b4", "#74add1", "#fee090", "#f46d43", "#a50026"],
        "dissolved_oxygen": ["#67001f", "#b2182b", "#d6604d", "#92c5de", "#4393c3", "#2166ac"],
        "turbidity": ["#f7fcf0", "#ccebc5", "#7bccc4", "#2b8cbe", "#084081"],
        "microcystin": ["#ffffcc", "#fed976", "#fd8d3c", "#e31a1c", "#800026"],
    }
    colores = rampas.get(clave, rampas["chlorophyll_a"])
    return [[i / (len(colores) - 1), c] for i, c in enumerate(colores)]


def render(df_instante: pd.DataFrame, embalse_id: str, clave_var: str, momento: pd.Timestamp) -> None:
    """Dibuja la escena 3D del gemelo para un instante concreto."""
    emb = embalse_por_id(embalse_id)
    var = variable(clave_var)

    X, Z, fondo = _malla_batimetrica(emb)
    valores, dist_min = _interpolar_idw(df_instante, X, Z, clave_var)

    # Umbral de incertidumbre: más allá de este radio, el dato es extrapolación
    radio_confianza = float(np.sqrt(emb.area_km2) * 1000 / 4)
    fiable = dist_min <= radio_confianza
    valores_mostrados = np.where(fiable, valores, np.nan)

    superficie_agua = np.zeros_like(fondo)

    fig = go.Figure()

    # 1. Batimetría
    fig.add_trace(
        go.Surface(
            x=X, y=Z, z=fondo,
            colorscale=[[0, "#0b1d3a"], [0.5, "#12386b"], [1, "#2f6ba8"]],
            showscale=False,
            opacity=1.0,
            name="Batimetría",
            hovertemplate="Profundidad: %{z:.1f} m<extra>Fondo del vaso</extra>",
            contours=dict(
                z=dict(show=True, usecolormap=False, color="#7dd3fc",
                       project_z=False, width=1, start=-emb.prof_max_m, end=0, size=5)
            ),
        )
    )

    # 2. Superficie del agua, coloreada por la variable interpolada
    fig.add_trace(
        go.Surface(
            x=X, y=Z, z=superficie_agua,
            surfacecolor=valores_mostrados,
            colorscale=_escala_color(clave_var),
            cmin=float(np.nanmin(valores)), cmax=float(np.nanmax(valores)),
            opacity=0.90,
            name=var.nombre,
            colorbar=dict(title=dict(text=f"{var.nombre}<br>[{var.unidad}]", side="right"), len=0.7),
            hovertemplate=f"{var.nombre}: %{{surfacecolor:.2f}} {var.unidad}<extra></extra>",
        )
    )

    # 3. Estaciones — las mediciones reales que sostienen la interpolación
    escala = float(np.abs(X).max())
    fig.add_trace(
        go.Scatter3d(
            x=df_instante["x"] * escala / 5.0,
            y=df_instante["z"] * escala / 5.0,
            z=np.full(len(df_instante), 2.0),
            mode="markers+text",
            marker=dict(size=9, color="#f8fafc", symbol="diamond",
                        line=dict(color="#22d3ee", width=2)),
            text=df_instante["codigo"],
            textposition="top center",
            textfont=dict(size=10, color="#e2e8f0"),
            name="Estaciones (dato medido)",
            customdata=np.stack([df_instante[clave_var], df_instante["profundidad_m"]], axis=-1),
            hovertemplate=(
                "<b>%{text}</b><br>"
                f"{var.nombre}: %{{customdata[0]:.2f}} {var.unidad}<br>"
                "Profundidad: %{customdata[1]:.1f} m<extra></extra>"
            ),
        )
    )

    # 4. Actuadores
    acts = actuadores_de(embalse_id)
    if acts:
        fig.add_trace(
            go.Scatter3d(
                x=[a.x * escala / 5.0 for a in acts],
                y=[a.z * escala / 5.0 for a in acts],
                z=[-emb.prof_max_m * 0.35] * len(acts),
                mode="markers",
                marker=dict(size=7, color="#fbbf24", symbol="square",
                            line=dict(color="#f59e0b", width=1)),
                text=[f"{a.nombre} — {a.potencia_pct:.0f} %" for a in acts],
                name="Actuadores (simulados)",
                hovertemplate="<b>%{text}</b><extra>Dispositivo de mitigación</extra>",
            )
        )

    fig.update_layout(
        template="plotly_dark",
        height=620,
        margin=dict(l=0, r=0, t=10, b=0),
        paper_bgcolor="rgba(0,0,0,0)",
        scene=dict(
            xaxis=dict(title="Este–Oeste [m]", backgroundcolor="#050810",
                       gridcolor="rgba(148,163,184,0.15)"),
            yaxis=dict(title="Norte–Sur [m]", backgroundcolor="#050810",
                       gridcolor="rgba(148,163,184,0.15)"),
            zaxis=dict(title="Profundidad [m]", backgroundcolor="#050810",
                       gridcolor="rgba(148,163,184,0.15)"),
            camera=dict(eye=dict(x=1.5, y=-1.5, z=0.85)),
            aspectratio=dict(x=1, y=1, z=0.42),
        ),
        legend=dict(orientation="h", yanchor="bottom", y=0.0, xanchor="left", x=0),
    )

    # --- Hallazgo dinámico, calculado sobre este instante concreto --------
    vmax = float(df_instante[clave_var].max())
    vmin = float(df_instante[clave_var].min())
    est_max = df_instante.loc[df_instante[clave_var].idxmax(), "estacion"]
    heterogeneidad = (vmax - vmin) / max(abs(vmax), 1e-6) * 100
    pct_fiable = float(fiable.mean() * 100)

    if var.umbral_critico is not None and vmax >= var.umbral_critico:
        veredicto = (
            f"El máximo supera el umbral crítico de {var.umbral_critico:g} {var.unidad}"
        )
    elif var.umbral_atencion is not None and vmax >= var.umbral_atencion:
        veredicto = (
            f"El máximo supera el umbral de atención de {var.umbral_atencion:g} {var.unidad}"
        )
    else:
        veredicto = "Todos los valores están por debajo de los umbrales de atención"

    figura(
        fig,
        Ficha(
            titulo=(
                f"Gemelo 3D — {var.nombre} en {emb.nombre}, "
                f"{momento:%d/%m/%Y %H:%M}"
            ),
            que_muestra=(
                f"Vaso del embalse {emb.nombre} ({emb.area_km2:.0f} km², "
                f"{emb.prof_max_m:.0f} m de profundidad máxima) con la "
                f"distribución espacial de {var.nombre.lower()} en "
                f"{var.unidad} sobre la lámina de agua, para el instante "
                f"seleccionado. Los rombos blancos son las "
                f"{len(df_instante)} estaciones de medición; los cuadrados "
                f"ámbar, los actuadores de mitigación."
            ),
            como_leer=(
                "La **superficie inferior** es la batimetría, con isobatas cada "
                "5 m. La **superficie superior** es la lámina de agua, coloreada "
                "según la escala de la derecha: los tonos cálidos indican "
                "valores altos. Las **zonas sin color** son áreas alejadas de "
                "toda estación, donde el gemelo no tiene información suficiente "
                "y por eso no muestra ningún valor. Gire con el ratón y acerque "
                "con la rueda; al pasar el cursor sobre cualquier punto se lee "
                "su valor exacto."
            ),
            hallazgo=(
                f"{veredicto}. El valor máximo es de **{vmax:.2f} {var.unidad}** "
                f"en «{est_max}» y el mínimo de {vmin:.2f} {var.unidad}, lo que "
                f"supone una heterogeneidad espacial del {heterogeneidad:.0f} %. "
                f"El {pct_fiable:.0f} % de la superficie está dentro del radio de "
                f"confianza de alguna estación."
            ),
            criterio=(
                f"Umbral de atención {var.umbral_atencion:g} {var.unidad} y "
                f"crítico {var.umbral_critico:g} {var.unidad}. "
                f"Fuente: {var.referencia}."
                if var.umbral_atencion is not None
                else "Variable sin umbral normativo asociado."
            ),
            procedencia=(
                "**Batimetría: modelo procedural esquemático**, escalado a las "
                "dimensiones reales del catálogo, no un levantamiento medido. "
                "**Superficie de la variable: interpolación IDW** (potencia 2) "
                "desde los valores simulados de las estaciones. "
                "**Valores de estación: serie simulada** por el generador "
                "fenomenológico del gemelo, no telemetría real."
            ),
            limitaciones=(
                f"Con solo {len(df_instante)} estaciones, la interpolación es "
                f"orientativa: describe bien el entorno de cada punto de medida "
                f"y mal las zonas intermedias. Las áreas en blanco están a más "
                f"de {radio_confianza:.0f} m de cualquier estación y **no deben "
                f"interpretarse**. La batimetría es esquemática, así que no "
                f"sirve para calcular volúmenes ni para navegación. Una "
                f"floración real puede formar parches de pocos metros que ninguna "
                f"red de esta densidad puede resolver."
            ),
        ),
        key="gemelo3d",
    )

    nota_metodologica(
        "Interpolación IDW y radio de confianza",
        f"""
El valor en cada celda de la malla se calcula como

$$\\hat{{v}}(x,z) = \\frac{{\\sum_i w_i \\, v_i}}{{\\sum_i w_i}}, \\qquad w_i = \\frac{{1}}{{d_i^{{2}}}}$$

donde $d_i$ es la distancia de la celda a la estación $i$ y $v_i$ su valor medido.

Consecuencias que conviene tener presentes al leer el mapa:

- El valor interpolado **nunca supera el máximo ni baja del mínimo** de las
  estaciones. Si la floración real tiene un núcleo más intenso que cualquier
  punto de medida, este mapa lo subestima por construcción.
- La influencia de cada estación decae con el cuadrado de la distancia, así que
  el mapa es esencialmente fiable en el entorno inmediato de cada una.
- El **radio de confianza** se ha fijado en {radio_confianza:.0f} m
  ($\\sqrt{{\\text{{área}}}}/4$). Las celdas más alejadas se dejan sin color de
  forma deliberada: preferimos declarar la ignorancia a rellenarla con un color
  plausible.

Con una red de estaciones más densa, o con un ráster satelital que aportara
cobertura continua, se podría sustituir IDW por kriging ordinario y estimar la
varianza de predicción en cada celda.
""",
    )

    # --- Tabla de apoyo: las mediciones que sostienen el mapa -------------
    cols = ["codigo", "estacion", "profundidad_m", clave_var, "calidad"]
    t = df_instante[cols].copy()
    t.columns = ["Código", "Estación", "Profundidad [m]", f"{var.nombre} [{var.unidad}]", "Calidad"]
    t[f"{var.nombre} [{var.unidad}]"] = t[f"{var.nombre} [{var.unidad}]"].round(2)
    t["Clasificación"] = [
        var.clasificar(v).value for v in df_instante[clave_var]
    ]

    tabla(
        t,
        Ficha(
            titulo="Mediciones que sostienen el mapa",
            que_muestra=(
                f"Valor de {var.nombre.lower()} en cada estación para el "
                f"instante representado, con su clasificación según los "
                f"umbrales normativos y su bandera de calidad."
            ),
            como_leer=(
                "Cada fila es una estación. La columna «Clasificación» aplica "
                "los umbrales de la variable al valor medido. La columna "
                "«Calidad» indica si el dato superó el control de calidad: solo "
                "los marcados como *bueno* deberían usarse para tomar decisiones."
            ),
            hallazgo=(
                f"De las {len(t)} estaciones, "
                f"{sum(1 for v in df_instante[clave_var] if var.clasificar(v).orden >= 2)} "
                f"están en nivel alto o crítico. El máximo corresponde a "
                f"«{est_max}» con {vmax:.2f} {var.unidad}."
            ),
            criterio=f"{var.referencia}." if var.referencia else "—",
            procedencia=(
                "Serie simulada por el generador fenomenológico, filtrada al "
                "instante seleccionado. Las banderas de calidad proceden del "
                "control QARTOD aplicado en la ingesta."
            ),
            limitaciones=(
                "Son valores puntuales de un instante: no reflejan la tendencia. "
                "Para juzgar si la situación mejora o empeora hay que mirar la "
                "vista de telemetría."
            ),
        ),
        diccionario=[
            ColumnaDoc("Código", "Identificador corto de la estación de medición.", "—", "Catálogo"),
            ColumnaDoc("Estación", "Nombre descriptivo y ubicación dentro del embalse.", "—", "Catálogo"),
            ColumnaDoc("Profundidad [m]", "Profundidad de la columna de agua en el punto.", "m", "Catálogo"),
            ColumnaDoc.desde_variable(f"{var.nombre} [{var.unidad}]", var, "Serie simulada"),
            ColumnaDoc("Calidad", "Bandera QARTOD del registro.", "—", "Control de calidad"),
            ColumnaDoc("Clasificación", "Nivel de riesgo según los umbrales de la variable.", "—", "Motor de reglas"),
        ],
    )
