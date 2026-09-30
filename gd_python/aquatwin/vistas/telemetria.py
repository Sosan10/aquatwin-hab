"""
Vista 2 — Telemetría y calidad del dato.

Series temporales por estación, perfil vertical y control de calidad.

Criterio transversal de esta vista: **la calidad del dato se representa, no se
esconde**. Los registros sospechosos se dibujan con marca propia y los huecos
se dejan como huecos. Una línea continua trazada sobre datos ausentes es una
afirmación falsa dibujada con confianza.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

from ..datos import resumen_calidad
from ..dominio import CalidadDato, variable
from ..explicabilidad import (
    ColumnaDoc,
    Ficha,
    anotar_umbrales,
    figura,
    tabla,
    tema_oscuro,
)


def _serie_por_calidad(fig: go.Figure, g: pd.DataFrame, clave: str, nombre: str) -> None:
    """Dibuja la serie separando visualmente los datos buenos de los sospechosos."""
    buenos = g[g["calidad"] == CalidadDato.BUENO.value]
    dudosos = g[g["calidad"] == CalidadDato.SOSPECHOSO.value]

    fig.add_trace(
        go.Scatter(
            x=buenos["tiempo"], y=buenos[clave],
            mode="lines", name=nombre,
            line=dict(width=1.8),
            connectgaps=False,  # los huecos se ven como huecos
            hovertemplate="%{y:.2f}<extra>" + nombre + "</extra>",
        )
    )
    if not dudosos.empty:
        fig.add_trace(
            go.Scatter(
                x=dudosos["tiempo"], y=dudosos[clave],
                mode="markers", name=f"{nombre} (sospechoso)",
                marker=dict(size=7, color="#a78bfa", symbol="x-thin",
                            line=dict(width=2, color="#a78bfa")),
                hovertemplate="%{y:.2f} — marcado como sospechoso<extra></extra>",
            )
        )


def render(df: pd.DataFrame, clave_var: str) -> None:
    """Dibuja la vista completa de telemetría."""
    var = variable(clave_var)

    # ------------------------------------------------------------------
    # 1. Serie temporal por estación
    # ------------------------------------------------------------------
    fig = go.Figure()
    for _, g in df.sort_values("tiempo").groupby("estacion", sort=False):
        _serie_por_calidad(fig, g, clave_var, str(g["estacion"].iloc[0]))

    anotar_umbrales(fig, var)
    tema_oscuro(fig, alto=430)
    fig.update_yaxes(title_text=var.etiqueta())
    fig.update_xaxes(title_text="Fecha y hora")

    validos = df[df["calidad"] == CalidadDato.BUENO.value]
    n_sup_atencion = int((validos[clave_var] >= (var.umbral_atencion or np.inf)).sum()) \
        if var.mayor_es_peor else int((validos[clave_var] <= (var.umbral_atencion or -np.inf)).sum())
    pct_sup = n_sup_atencion / max(len(validos), 1) * 100
    n_sospechosos = int((df["calidad"] == CalidadDato.SOSPECHOSO.value).sum())

    ultimos = validos.sort_values("tiempo").groupby("estacion").tail(24)
    tendencia = (
        ultimos.groupby("estacion")[clave_var].apply(
            lambda s: s.iloc[-1] - s.iloc[0] if len(s) > 1 else 0.0
        )
    )
    subiendo = int((tendencia > 0).sum())

    figura(
        fig,
        Ficha(
            titulo=f"Evolución temporal de {var.nombre.lower()} por estación",
            que_muestra=(
                f"Serie temporal de {var.nombre.lower()} en {var.unidad} para "
                f"cada una de las {df['estacion'].nunique()} estaciones del "
                f"embalse, durante el periodo cargado "
                f"({df['tiempo'].min():%d/%m/%Y} – {df['tiempo'].max():%d/%m/%Y}). "
                f"Resolución horaria."
            ),
            como_leer=(
                "Cada color es una estación. Las **líneas discontinuas "
                "horizontales** marcan los umbrales de atención (ámbar) y "
                "crítico (rojo), con su valor rotulado. Las **aspas moradas** "
                "son registros que el control de calidad marcó como "
                "sospechosos: se muestran para que se vean, pero no deberían "
                "usarse para decidir. Las **interrupciones de la línea** son "
                "huecos de datos reales, no se rellenan artificialmente."
            ),
            hallazgo=(
                f"El {pct_sup:.1f} % de los registros válidos "
                f"({n_sup_atencion} de {len(validos)}) supera el umbral de "
                f"atención. En las últimas 24 h, {subiendo} de "
                f"{len(tendencia)} estaciones muestran tendencia creciente. "
                f"El control de calidad marcó {n_sospechosos} registros como "
                f"sospechosos."
            ),
            criterio=(
                f"Umbral de atención {var.umbral_atencion:g} {var.unidad}; "
                f"crítico {var.umbral_critico:g} {var.unidad}. "
                f"Fuente: {var.referencia}."
                if var.umbral_atencion is not None else "Sin umbral normativo."
            ),
            procedencia=(
                "Serie simulada por el generador fenomenológico del gemelo "
                "(semilla fija, reproducible). Las banderas de calidad proceden "
                "del control QARTOD aplicado en la ingesta."
            ),
            limitaciones=(
                "Los datos son simulados: reproducen la fenomenología conocida "
                "del sistema, no mediciones reales de estos embalses. La "
                "comparación entre estaciones es válida; los valores absolutos "
                "no deben citarse como observaciones de campo."
            ),
        ),
        key="serie_temporal",
    )

    # ------------------------------------------------------------------
    # 2. Ciclo diario — la firma de la floración
    # ------------------------------------------------------------------
    ciclo = (
        validos.assign(hora=validos["tiempo"].dt.hour)
        .groupby("hora")[["dissolved_oxygen", "temp_surface", "solar_par", "ph"]]
        .agg(["mean", "std"])
    )

    fig2 = make_subplots(specs=[[{"secondary_y": True}]])
    od_m = ciclo[("dissolved_oxygen", "mean")]
    od_s = ciclo[("dissolved_oxygen", "std")]

    fig2.add_trace(
        go.Scatter(
            x=list(ciclo.index) + list(ciclo.index)[::-1],
            y=list(od_m + od_s) + list(od_m - od_s)[::-1],
            fill="toself", fillcolor="rgba(34,211,238,0.15)",
            line=dict(width=0), name="±1 desviación típica", hoverinfo="skip",
        )
    )
    fig2.add_trace(
        go.Scatter(x=ciclo.index, y=od_m, mode="lines+markers",
                   name="Oxígeno disuelto", line=dict(color="#22d3ee", width=2.5)),
    )
    fig2.add_trace(
        go.Scatter(x=ciclo.index, y=ciclo[("solar_par", "mean")], mode="lines",
                   name="Radiación PAR", line=dict(color="#fbbf24", width=2, dash="dot")),
        secondary_y=True,
    )
    fig2.add_hline(y=3.0, line_dash="dash", line_color="#ef4444",
                   annotation_text="Hipoxia crítica: 3 mg/L (EPA)",
                   annotation_position="bottom left", annotation_font_color="#ef4444")
    fig2.add_vrect(x0=0, x1=7, fillcolor="rgba(30,41,59,0.45)", line_width=0,
                   annotation_text="Franja nocturna", annotation_position="top left")

    tema_oscuro(fig2, alto=400)
    fig2.update_xaxes(title_text="Hora del día", dtick=3)
    fig2.update_yaxes(title_text="Oxígeno disuelto [mg/L]", secondary_y=False)
    fig2.update_yaxes(title_text="Radiación PAR [µmol/m²·s]", secondary_y=True, showgrid=False)

    hora_min = int(od_m.idxmin())
    hora_max = int(od_m.idxmax())
    amplitud = float(od_m.max() - od_m.min())

    figura(
        fig2,
        Ficha(
            titulo="Ciclo diario de oxígeno: la firma metabólica del embalse",
            que_muestra=(
                "Promedio horario de oxígeno disuelto (eje izquierdo) y "
                "radiación PAR (eje derecho) sobre todo el periodo y todas las "
                "estaciones. La banda sombreada es ±1 desviación típica del "
                "oxígeno."
            ),
            como_leer=(
                "Se lee de izquierda a derecha como un día tipo. La **zona gris** "
                "es la franja nocturna. La curva de oxígeno debe subir mientras "
                "hay radiación (fotosíntesis) y bajar de noche (respiración). "
                "**Cuanto mayor sea la amplitud entre máximo y mínimo, mayor es "
                "la biomasa**: es la magnitud que delata una floración incluso "
                "antes de que la clorofila alcance los umbrales."
            ),
            hallazgo=(
                f"El oxígeno alcanza su mínimo a las **{hora_min}:00** "
                f"({od_m.min():.2f} mg/L) y su máximo a las **{hora_max}:00** "
                f"({od_m.max():.2f} mg/L), con una amplitud diaria de "
                f"**{amplitud:.2f} mg/L**. "
                + (
                    "El mínimo cae por debajo del criterio EPA de 3 mg/L: hay "
                    "hipoxia nocturna recurrente."
                    if od_m.min() < 3.0
                    else "El mínimo se mantiene sobre el criterio EPA de 3 mg/L."
                )
                + (
                    " Una amplitud tan alta indica producción primaria intensa."
                    if amplitud > 4
                    else ""
                )
            ),
            criterio=(
                "Criterio EPA (1986) de 3 mg/L para vida acuática. La amplitud "
                "diaria no tiene umbral normativo: es un indicador comparativo "
                "entre periodos y entre embalses."
            ),
            procedencia=(
                "Agregación horaria de la serie simulada, solo registros con "
                "bandera de calidad *bueno*."
            ),
            limitaciones=(
                "Promediar todas las estaciones y todo el periodo mezcla "
                "situaciones distintas: una estación somera y eutrófica y otra "
                "profunda quedan sumadas en la misma curva. Es una vista de "
                "diagnóstico general del sistema, no de una zona concreta."
            ),
        ),
        key="ciclo_diario",
    )

    # ------------------------------------------------------------------
    # 3. Control de calidad
    # ------------------------------------------------------------------
    qc = resumen_calidad(df)
    qc_tabla = qc.rename(
        columns={
            "calidad": "Bandera",
            "registros": "Registros",
            "porcentaje": "% del total",
            "significado": "Significado",
        }
    )

    pct_bueno = float(qc.loc[qc["calidad"] == CalidadDato.BUENO.value, "porcentaje"].sum())

    tabla(
        qc_tabla,
        Ficha(
            titulo="Control de calidad del dato (esquema QARTOD)",
            que_muestra=(
                f"Reparto de los {len(df):,} registros del periodo según la "
                f"bandera asignada por el control de calidad automático."
            ),
            como_leer=(
                "Cada fila es una bandera. Solo los registros marcados como "
                "*bueno* entran en el modelo predictivo y en la detección de "
                "anomalías. Los *sospechosos* se conservan y se muestran, pero "
                "no alimentan ninguna decisión automática."
            ),
            hallazgo=(
                f"El **{pct_bueno:.1f} %** de los registros supera todas las "
                f"pruebas de calidad. "
                + (
                    "Es una disponibilidad adecuada para modelar."
                    if pct_bueno > 90
                    else "La disponibilidad es baja: conviene revisar el estado "
                         "de los sensores antes de confiar en el pronóstico."
                )
            ),
            criterio=(
                "Pruebas QARTOD aplicadas: rango físicamente válido, prueba de "
                "pico (4·MAD frente a la mediana móvil de 7 registros) y "
                "detección de valor estancado (6 lecturas idénticas seguidas)."
            ),
            procedencia=(
                "Control aplicado en la ingesta, sobre la serie simulada a la "
                "que se inyectaron deliberadamente huecos de comunicación y "
                "picos de sensor para poner a prueba el motor."
            ),
            limitaciones=(
                "El control detecta fallos de sensor evidentes. **No detecta "
                "deriva lenta de calibración**, que es el fallo más insidioso: "
                "una sonda de clorofila con biofouling se desvía poco a poco y "
                "supera todas estas pruebas. Para eso hace falta comparación "
                "entre sensores vecinos o calibración periódica."
            ),
        ),
        diccionario=[
            ColumnaDoc("Bandera", "Código de calidad asignado al registro.", "—", "Control QARTOD"),
            ColumnaDoc("Registros", "Número de observaciones con esa bandera.", "recuento", "Cálculo"),
            ColumnaDoc("% del total", "Proporción sobre el total del periodo.", "%", "Cálculo"),
            ColumnaDoc("Significado", "Qué implica la bandera para el uso del dato.", "—", "Documentación"),
        ],
    )

    # ------------------------------------------------------------------
    # 4. Estadística descriptiva
    # ------------------------------------------------------------------
    from ..dominio import VARIABLES

    filas = []
    for clave, v in VARIABLES.items():
        if clave not in validos.columns:
            continue
        s = validos[clave]
        filas.append(
            {
                "Variable": v.nombre,
                "Unidad": v.unidad,
                "Media": round(float(s.mean()), 3),
                "Mediana": round(float(s.median()), 3),
                "Desv. típica": round(float(s.std()), 3),
                "Mínimo": round(float(s.min()), 3),
                "Máximo": round(float(s.max()), 3),
                "P90": round(float(s.quantile(0.90)), 3),
                "% sobre umbral": round(
                    float(
                        (s >= v.umbral_atencion).mean() * 100
                        if v.mayor_es_peor and v.umbral_atencion is not None
                        else (s <= v.umbral_atencion).mean() * 100
                        if v.umbral_atencion is not None
                        else 0.0
                    ),
                    1,
                ),
            }
        )
    desc = pd.DataFrame(filas)

    criticas = desc[desc["% sobre umbral"] > 25]["Variable"].tolist()

    tabla(
        desc,
        Ficha(
            titulo="Estadística descriptiva del periodo",
            que_muestra=(
                f"Resumen estadístico de todas las variables sobre los "
                f"{len(validos):,} registros con calidad *bueno* del periodo."
            ),
            como_leer=(
                "La columna **«% sobre umbral»** es la más informativa: indica "
                "qué proporción del tiempo la variable estuvo en zona de "
                "atención. La comparación entre **media y mediana** revela "
                "asimetría: si la media supera claramente a la mediana, hay "
                "episodios extremos que tiran del promedio. El **P90** es el "
                "valor que solo se supera el 10 % del tiempo, más robusto que el "
                "máximo para caracterizar condiciones adversas."
            ),
            hallazgo=(
                (
                    "Variables que superan su umbral de atención más de una "
                    f"cuarta parte del tiempo: **{', '.join(criticas)}**."
                )
                if criticas
                else "Ninguna variable supera su umbral de atención más del 25 % del tiempo."
            ),
            criterio="Umbrales del catálogo de variables (OMS, EPA, OCDE según la variable).",
            procedencia="Agregación de la serie simulada, excluidos los registros sospechosos y malos.",
            limitaciones=(
                "Los estadísticos agregan todas las estaciones, que tienen "
                "comportamientos muy distintos entre sí: una bahía somera y "
                "eutrófica y una zona profunda no son comparables. Para el "
                "análisis por zona hay que filtrar por estación."
            ),
        ),
        diccionario=[
            ColumnaDoc("Variable", "Magnitud limnológica medida.", "—", "Catálogo de variables"),
            ColumnaDoc("Unidad", "Unidad de medida.", "—", "Catálogo de variables"),
            ColumnaDoc("Media", "Promedio aritmético del periodo.", "según variable", "Cálculo"),
            ColumnaDoc("Mediana", "Valor central; robusto frente a valores extremos.", "según variable", "Cálculo"),
            ColumnaDoc("Desv. típica", "Dispersión respecto a la media.", "según variable", "Cálculo"),
            ColumnaDoc("Mínimo", "Valor más bajo registrado.", "según variable", "Cálculo"),
            ColumnaDoc("Máximo", "Valor más alto registrado.", "según variable", "Cálculo"),
            ColumnaDoc("P90", "Percentil 90: solo se supera el 10 % del tiempo.", "según variable", "Cálculo"),
            ColumnaDoc("% sobre umbral", "Porcentaje del tiempo en zona de atención.", "%", "Motor de reglas"),
        ],
    )
