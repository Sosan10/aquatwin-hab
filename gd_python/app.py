"""
AquaTwin HAB — Motor del Gemelo Digital (Streamlit)

Aplicación principal. Alerta temprana de floraciones de algas nocivas
(HAB/FAN) en embalses, con interpretabilidad y explicabilidad en todas las
figuras y tablas.

Ejecución:
    streamlit run app.py
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st

from aquatwin.datos import (
    EMBALSES,
    datos_validos,
    embalse_por_id,
    estaciones_de,
    generar_serie,
)
from aquatwin.dominio import VARIABLES, CalidadDato, variable
from aquatwin.explicabilidad import badge_riesgo, inyectar_estilos
from aquatwin.motor.prediccion import calcular_shap, entrenar
from aquatwin.motor.reglas import diagnosticar
from aquatwin.vistas import anomalias as v_anomalias
from aquatwin.vistas import datos as v_datos
from aquatwin.vistas import diagnostico as v_diagnostico
from aquatwin.vistas import gemelo as v_gemelo
from aquatwin.vistas import prediccion as v_prediccion
from aquatwin.vistas import telemetria as v_telemetria

st.set_page_config(
    page_title="AquaTwin HAB — Gemelo Digital",
    page_icon="💧",
    layout="wide",
    initial_sidebar_state="expanded",
)

inyectar_estilos()

st.markdown(
    """
<style>
  .stApp { background: #05080f; }
  h1, h2, h3 { letter-spacing: -0.02em; }
  [data-testid="stMetricValue"] { font-variant-numeric: tabular-nums; }
  [data-testid="stSidebar"] { background: #0a1120; }
</style>
""",
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Datos y modelo, en caché
# ---------------------------------------------------------------------------

@st.cache_data(show_spinner="Generando la serie del gemelo…")
def cargar_serie(embalse_id: str, dias: int, semilla: int) -> pd.DataFrame:
    return generar_serie(embalse_id, dias=dias, semilla=semilla)


@st.cache_resource(show_spinner="Entrenando el modelo y calculando SHAP…")
def cargar_modelo(embalse_id: str, dias: int, semilla: int, horizonte: int):
    df = generar_serie(embalse_id, dias=dias, semilla=semilla)
    res = entrenar(datos_validos(df), horizonte_horas=horizonte, semilla=semilla)
    return calcular_shap(res)


# ---------------------------------------------------------------------------
# Barra lateral
# ---------------------------------------------------------------------------

st.sidebar.title("💧 AquaTwin HAB")
st.sidebar.caption("Gemelo digital para alerta temprana de floraciones de algas nocivas")

emb_sel = st.sidebar.selectbox(
    "Cuerpo de agua",
    options=[e.id for e in EMBALSES],
    format_func=lambda i: embalse_por_id(i).nombre,
)
embalse = embalse_por_id(emb_sel)

st.sidebar.markdown("---")
st.sidebar.markdown("**Periodo de simulación**")
dias = st.sidebar.slider("Días de histórico", 30, 180, 90, 15)
semilla = st.sidebar.number_input(
    "Semilla aleatoria", 1, 9999, 42,
    help="El generador es determinista: la misma semilla reproduce "
         "exactamente la misma serie, y por tanto las mismas figuras.",
)

df = cargar_serie(emb_sel, dias, int(semilla))

st.sidebar.markdown("---")
clave_var = st.sidebar.selectbox(
    "Variable a representar",
    options=[k for k in VARIABLES if k in df.columns],
    format_func=lambda k: VARIABLES[k].nombre,
    index=0,
)

momentos = sorted(df["tiempo"].unique())
idx_momento = st.sidebar.slider(
    "Instante del gemelo", 0, len(momentos) - 1, len(momentos) - 1,
    help="Recorre el histórico simulado. Todas las vistas se sincronizan.",
)
momento = pd.Timestamp(momentos[idx_momento])
st.sidebar.caption(f"Instante seleccionado: **{momento:%d/%m/%Y %H:%M}**")

st.sidebar.markdown("---")
st.sidebar.markdown("**Ficha del embalse**")
st.sidebar.markdown(
    f"""
- **Ubicación:** {embalse.ubicacion}, {embalse.pais}
- **Superficie:** {embalse.area_km2:.0f} km²
- **Profundidad máxima:** {embalse.prof_max_m:.1f} m
- **Volumen:** {embalse.volumen_hm3:.0f} hm³
- **Estado trófico:** {embalse.estado_trofico.value}
- **Uso principal:** {embalse.uso_principal}
- **Estaciones:** {len(estaciones_de(emb_sel))}
"""
)

st.sidebar.markdown("---")
st.sidebar.info(
    "**Datos simulados.** La serie se genera con un modelo fenomenológico "
    "determinista. Los embalses son reales; su telemetría, no.",
    icon="⚠️",
)


# ---------------------------------------------------------------------------
# Instantánea del momento seleccionado
# ---------------------------------------------------------------------------

df_instante = df[df["tiempo"] == momento].copy()
if df_instante.empty:
    st.error("No hay datos para el instante seleccionado.")
    st.stop()

df_instante = df_instante.sort_values("estacion")

# Estación con el peor diagnóstico: la que gobierna la alerta del embalse
diagnosticos = {}
for _, fila in df_instante.iterrows():
    if fila[["chlorophyll_a", "dissolved_oxygen", "temp_surface"]].isna().any():
        continue
    diagnosticos[fila["estacion"]] = (diagnosticar(fila), fila)

if diagnosticos:
    peor_est = max(diagnosticos, key=lambda k: diagnosticos[k][0].indice_riesgo)
    peor_diag, peor_fila = diagnosticos[peor_est]
else:
    peor_est, peor_diag, peor_fila = None, None, None


# ---------------------------------------------------------------------------
# Encabezado
# ---------------------------------------------------------------------------

st.title("Gemelo Digital AquaTwin HAB")
st.markdown(
    f"#### {embalse.nombre} · {momento:%d de %B de %Y, %H:%M}".replace(
        "January", "enero").replace("February", "febrero").replace("March", "marzo")
    .replace("April", "abril").replace("May", "mayo").replace("June", "junio")
    .replace("July", "julio").replace("August", "agosto").replace("September", "septiembre")
    .replace("October", "octubre").replace("November", "noviembre").replace("December", "diciembre")
)

if peor_diag is not None:
    k1, k2, k3, k4, k5 = st.columns(5)

    with k1:
        st.markdown("**Alerta del embalse**")
        st.markdown(badge_riesgo(peor_diag.nivel), unsafe_allow_html=True)
        st.caption(f"Peor estación: {peor_est}")

    chl = float(df_instante["chlorophyll_a"].max())
    var_chl = variable("chlorophyll_a")
    k2.metric(
        "Clorofila-a máxima", f"{chl:.1f} µg/L",
        delta=f"{chl - var_chl.umbral_atencion:+.1f} vs. umbral OMS",
        delta_color="inverse",
    )

    od = float(df_instante["dissolved_oxygen"].min())
    k3.metric(
        "Oxígeno disuelto mínimo", f"{od:.1f} mg/L",
        delta=f"{od - 5.0:+.1f} vs. criterio EPA",
    )

    mc = float(df_instante["microcystin"].max())
    k4.metric(
        "Microcistina estimada", f"{mc:.1f} µg/L",
        delta=f"{mc - 1.0:+.1f} vs. guía potable OMS",
        delta_color="inverse",
    )

    pct_bueno = (df["calidad"] == CalidadDato.BUENO.value).mean() * 100
    k5.metric("Calidad del dato", f"{pct_bueno:.1f} %", help="Registros que superan el control QARTOD.")

    st.caption(
        "Los indicadores muestran el **valor más desfavorable** entre estaciones, "
        "no el promedio: en alerta temprana, promediar diluye precisamente la "
        "señal que hay que detectar."
    )

st.markdown("---")


# ---------------------------------------------------------------------------
# Pestañas
# ---------------------------------------------------------------------------

t1, t2, t3, t4, t5, t6 = st.tabs(
    [
        "🌊 Gemelo 3D",
        "📈 Telemetría y calidad",
        "🔬 Diagnóstico",
        "🤖 Pronóstico y explicabilidad",
        "⚠️ Anomalías",
        "📚 Procedencia y método",
    ]
)

with t1:
    v_gemelo.render(df_instante, emb_sel, clave_var, momento)

with t2:
    v_telemetria.render(df, clave_var)

with t3:
    if peor_diag is None:
        st.warning("No hay datos válidos en este instante para diagnosticar.")
    else:
        est_sel = st.selectbox(
            "Estación a diagnosticar",
            options=list(diagnosticos),
            index=list(diagnosticos).index(peor_est),
            help="Se preselecciona la estación con mayor índice de riesgo.",
        )
        d, fila = diagnosticos[est_sel]
        v_diagnostico.render(fila, est_sel)

with t4:
    horizonte = st.select_slider(
        "Horizonte de pronóstico",
        options=[6, 12, 24, 48],
        value=24,
        format_func=lambda h: f"{h} horas",
    )
    try:
        res = cargar_modelo(emb_sel, dias, int(semilla), horizonte)
        v_prediccion.render(res)
    except Exception as exc:  # noqa: BLE001
        st.error(
            f"No se pudo entrenar el modelo: {exc}\n\n"
            "Prueba a ampliar el periodo de histórico en la barra lateral: "
            "con pocos días no hay observaciones suficientes tras construir "
            "los rezagos de 24 h."
        )

with t5:
    v_anomalias.render(df)

with t6:
    v_datos.render(df, emb_sel)


st.markdown("---")
st.caption(
    "AquaTwin HAB · Motor del gemelo digital en Python. "
    "Todas las figuras y tablas incluyen ficha de interpretación; el modelo "
    "predictivo incluye explicabilidad global, local y contrafactual. "
    "**Datos simulados: esta herramienta no describe el estado actual de "
    "ningún cuerpo de agua real.**"
)
