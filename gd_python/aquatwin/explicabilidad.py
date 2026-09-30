"""
Framework de interpretabilidad y explicabilidad.

Requisito del proyecto: *toda* figura y *toda* tabla generada debe contener
interpretabilidad y explicabilidad. Este módulo lo resuelve de forma
estructural en lugar de decorativa: las figuras y las tablas **no se renderizan
directamente**, sino a través de `figura()` y `tabla()`, que exigen una `Ficha`.

Si alguien intenta publicar una figura sin explicación, el código no compila la
intención: no hay una ruta que lo permita.

Distinción que se aplica en todo el motor:

* **Interpretabilidad**  — el resultado se entiende por construcción: unidades,
  umbrales de referencia dibujados, criterios normativos explícitos, reglas
  legibles. Es una propiedad del diseño.
* **Explicabilidad**     — se puede responder *por qué* el modelo dio ESTE
  resultado para ESTE caso: contribuciones SHAP, reglas disparadas,
  contrafactuales. Es una propiedad de la salida.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from .dominio import Variable


# ---------------------------------------------------------------------------
# La ficha
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Ficha:
    """
    Ficha de interpretabilidad. Acompaña obligatoriamente a cada figura y tabla.

    Los seis campos no son arbitrarios: responden a las seis preguntas que un
    evaluador (o un limnólogo) hace ante cualquier gráfico.

    Parameters
    ----------
    titulo
        Enunciado del hallazgo, no una etiqueta genérica. "La biomasa supera el
        umbral OMS en 2 de 4 estaciones" es un título; "Clorofila-a" no lo es.
    que_muestra
        Qué representa exactamente: variable, unidad, cobertura espacial y
        temporal, y cómo se agregó.
    como_leer
        Cómo se descodifica: ejes, colores, líneas de referencia, marcas.
    hallazgo
        Lectura del dato concreto que se está mostrando *ahora*. Es el único
        campo que se calcula dinámicamente en cada render.
    criterio
        Norma o umbral con el que se juzga, citando la fuente.
    procedencia
        De dónde salen los números y qué transformaciones sufrieron.
    limitaciones
        Qué NO se puede concluir. La honestidad sobre la incertidumbre es
        parte de la interpretabilidad, no un descargo de responsabilidad.
    """
    titulo: str
    que_muestra: str
    como_leer: str
    hallazgo: str
    criterio: str
    procedencia: str
    limitaciones: str

    def a_markdown(self) -> str:
        return (
            f"**Qué muestra.** {self.que_muestra}\n\n"
            f"**Cómo leerla.** {self.como_leer}\n\n"
            f"**Hallazgo.** {self.hallazgo}\n\n"
            f"**Criterio de referencia.** {self.criterio}\n\n"
            f"**Procedencia del dato.** {self.procedencia}\n\n"
            f"**Limitaciones.** {self.limitaciones}"
        )


@dataclass(frozen=True)
class ColumnaDoc:
    """Documentación de una columna de tabla: nombre, unidad, definición, origen."""
    columna: str
    definicion: str
    unidad: str = "—"
    origen: str = "Medición de estación"

    @classmethod
    def desde_variable(cls, col: str, var: Variable, origen: str = "Medición de estación") -> "ColumnaDoc":
        return cls(columna=col, definicion=var.descripcion, unidad=var.unidad, origen=origen)


# ---------------------------------------------------------------------------
# Renderizadores — la única vía para publicar una figura o una tabla
# ---------------------------------------------------------------------------

_CSS_FICHA = """
<style>
.ficha-interp {
  border-left: 3px solid #06b6d4;
  background: rgba(6, 182, 212, 0.045);
  padding: 0.85rem 1.1rem;
  margin: 0.35rem 0 1.6rem 0;
  border-radius: 0 8px 8px 0;
  font-size: 0.875rem;
  line-height: 1.55;
}
.ficha-interp p { margin: 0.3rem 0; }
.ficha-titulo {
  font-weight: 600;
  font-size: 1.02rem;
  margin: 1.1rem 0 0.15rem 0;
}
</style>
"""


def inyectar_estilos() -> None:
    """Inyecta el CSS de las fichas. Llamar una vez al inicio de la app."""
    st.markdown(_CSS_FICHA, unsafe_allow_html=True)


def figura(fig: go.Figure, ficha: Ficha, *, key: str | None = None) -> None:
    """
    Publica una figura junto a su ficha de interpretabilidad.

    Es el único camino para mostrar un gráfico en esta aplicación. No existe
    una llamada directa a `st.plotly_chart` fuera de este módulo.
    """
    st.markdown(f"<div class='ficha-titulo'>{ficha.titulo}</div>", unsafe_allow_html=True)
    st.plotly_chart(fig, width="stretch", key=key)
    with st.expander("Interpretación de la figura", expanded=True):
        st.markdown(ficha.a_markdown())


def tabla(
    df: pd.DataFrame,
    ficha: Ficha,
    diccionario: Iterable[ColumnaDoc],
    *,
    altura: int | None = None,
    formato: dict[str, Any] | None = None,
) -> None:
    """
    Publica una tabla junto a su ficha y su diccionario de datos.

    El diccionario de columnas es obligatorio: una tabla sin definición de
    columnas y unidades no es interpretable, por muy claros que parezcan los
    encabezados a quien la escribió.
    """
    st.markdown(f"<div class='ficha-titulo'>{ficha.titulo}</div>", unsafe_allow_html=True)

    estilo = df.style.format(formato) if formato else df
    # `height` solo se pasa si se especificó: Streamlit rechaza None.
    extra = {"height": altura} if altura is not None else {}
    st.dataframe(estilo, width="stretch", hide_index=True, **extra)

    with st.expander("Interpretación de la tabla", expanded=True):
        st.markdown(ficha.a_markdown())

    with st.expander("Diccionario de datos (definición, unidad y origen de cada columna)"):
        doc = pd.DataFrame(
            [
                {
                    "Columna": c.columna,
                    "Definición": c.definicion,
                    "Unidad": c.unidad,
                    "Origen": c.origen,
                }
                for c in diccionario
            ]
        )
        st.dataframe(doc, width="stretch", hide_index=True)


def nota_metodologica(titulo: str, cuerpo: str) -> None:
    """Bloque de método para cálculos que merecen explicarse aparte."""
    with st.expander(f"Nota metodológica — {titulo}"):
        st.markdown(cuerpo)


# ---------------------------------------------------------------------------
# Utilidades de anotación — interpretabilidad dentro del propio gráfico
# ---------------------------------------------------------------------------

def anotar_umbrales(
    fig: go.Figure,
    var: Variable,
    *,
    eje: str = "y",
    x0: Any = None,
    x1: Any = None,
) -> go.Figure:
    """
    Dibuja las líneas de umbral de una variable sobre la figura, etiquetadas
    con su valor y su norma.

    Un gráfico con el umbral dibujado se interpreta solo; uno sin él obliga al
    lector a recordar la norma de memoria. Por eso se aplica en todas las
    figuras de series y perfiles.
    """
    for valor, etiqueta, color in (
        (var.umbral_atencion, "Atención", "#f59e0b"),
        (var.umbral_critico, "Crítico", "#ef4444"),
    ):
        if valor is None:
            continue
        kwargs: dict[str, Any] = dict(
            line_dash="dash",
            line_color=color,
            line_width=1.4,
            annotation_text=f"{etiqueta}: {valor:g} {var.unidad}",
            annotation_position="top left",
            annotation_font_size=11,
            annotation_font_color=color,
        )
        if eje == "y":
            fig.add_hline(y=valor, **kwargs)
        else:
            fig.add_vline(x=valor, **kwargs)
    return fig


def tema_oscuro(fig: go.Figure, *, alto: int = 420) -> go.Figure:
    """
    Aplica el tema visual del gemelo (coherente con la versión web) y fuerza
    buenas prácticas: márgenes legibles, leyenda horizontal, hover unificado.
    """
    fig.update_layout(
        template="plotly_dark",
        height=alto,
        margin=dict(l=60, r=30, t=30, b=50),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(15,23,42,0.55)",
        font=dict(family="Inter, system-ui, sans-serif", size=12),
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
    )
    fig.update_xaxes(gridcolor="rgba(148,163,184,0.15)", zeroline=False)
    fig.update_yaxes(gridcolor="rgba(148,163,184,0.15)", zeroline=False)
    return fig


def badge_riesgo(nivel: Any) -> str:
    """
    Devuelve HTML de una etiqueta de riesgo con **icono y texto**, no solo color.

    Codificar el riesgo únicamente por color excluye a las personas con
    deficiencia en la visión cromática; la redundancia es un requisito de
    accesibilidad, no un adorno.
    """
    iconos = {"BAJO": "●", "MODERADO": "◆", "ALTO": "▲", "CRITICO": "■"}
    valor = getattr(nivel, "value", str(nivel))
    color = getattr(nivel, "color", "#64748b")
    icono = iconos.get(valor, "●")
    return (
        f"<span style='background:{color}22;color:{color};border:1px solid {color}66;"
        f"padding:2px 10px;border-radius:999px;font-size:0.8rem;font-weight:600;'>"
        f"{icono} {valor}</span>"
    )
