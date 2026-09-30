"""
Vista 6 — Procedencia, metodología y limitaciones.

Documenta de dónde sale cada número del gemelo y qué se puede y no se puede
concluir con él. Es la vista que hace auditable al resto: sin ella, las fichas
de interpretación de las demás figuras se apoyarían en afirmaciones que nadie
puede comprobar.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from ..datos import EMBALSES, ESTACIONES, PERFILES
from ..dominio import VARIABLES
from ..explicabilidad import ColumnaDoc, Ficha, tabla


def render(df: pd.DataFrame, embalse_id: str) -> None:
    """Dibuja la vista de procedencia y metodología."""

    st.warning(
        "**Aviso de procedencia.** La serie temporal de este gemelo es "
        "**simulada**, no medida. Se genera con un modelo fenomenológico "
        "determinista que reproduce la dinámica limnológica conocida. Los "
        "embalses y sus características físicas son reales; sus datos de "
        "telemetría, no. Ninguna conclusión de esta aplicación describe el "
        "estado actual de ningún cuerpo de agua real.",
        icon="⚠️",
    )

    # ------------------------------------------------------------------
    # 1. Catálogo de variables
    # ------------------------------------------------------------------
    filas = []
    for clave, v in VARIABLES.items():
        filas.append(
            {
                "Clave": clave,
                "Variable": v.nombre,
                "Unidad": v.unidad,
                "Rango válido": f"{v.rango_valido[0]:g} – {v.rango_valido[1]:g}",
                "Umbral atención": v.umbral_atencion if v.umbral_atencion is not None else "—",
                "Umbral crítico": v.umbral_critico if v.umbral_critico is not None else "—",
                "Dirección del riesgo": "Mayor es peor" if v.mayor_es_peor else "Menor es peor",
                "Descripción": v.descripcion,
                "Referencia del umbral": v.referencia,
            }
        )

    tabla(
        pd.DataFrame(filas),
        Ficha(
            titulo="Catálogo de variables del gemelo",
            que_muestra=(
                f"Las {len(VARIABLES)} variables limnológicas que maneja el "
                f"motor, con su unidad, su rango físicamente válido, sus "
                f"umbrales normativos y la fuente de cada umbral."
            ),
            como_leer=(
                "Este catálogo es la **fuente única de verdad** de toda la "
                "aplicación: las etiquetas de los ejes, las líneas de umbral de "
                "las figuras y las clasificaciones de riesgo salen de aquí. "
                "La columna **«Dirección del riesgo»** importa: en el oxígeno "
                "disuelto y en el viento, el peligro está en los valores bajos, "
                "no en los altos."
            ),
            hallazgo=(
                f"De las {len(VARIABLES)} variables, "
                f"{sum(1 for v in VARIABLES.values() if not v.mayor_es_peor)} "
                f"tienen dirección de riesgo invertida. Los umbrales proceden "
                f"de OMS, EPA, OCDE y publicaciones revisadas por pares."
            ),
            criterio="Ver la columna «Referencia del umbral» de cada fila.",
            procedencia="Definido en `aquatwin/dominio.py`, portado de `src/types.ts` del gemelo web.",
            limitaciones=(
                "Los umbrales son valores guía generales. Un embalse concreto "
                "puede justificar umbrales propios: un cuerpo oligotrófico de "
                "montaña y uno hipereutrófico de llanura no deberían juzgarse "
                "con el mismo listón."
            ),
        ),
        diccionario=[
            ColumnaDoc("Clave", "Identificador interno de la variable en el código.", "—", "Código"),
            ColumnaDoc("Variable", "Nombre legible de la magnitud.", "—", "Catálogo"),
            ColumnaDoc("Unidad", "Unidad de medida empleada en toda la aplicación.", "—", "Catálogo"),
            ColumnaDoc("Rango válido", "Intervalo físicamente posible; fuera de él el dato se descarta.", "según variable", "Control de calidad"),
            ColumnaDoc("Umbral atención", "Valor que activa vigilancia.", "según variable", "Norma"),
            ColumnaDoc("Umbral crítico", "Valor que activa alerta.", "según variable", "Norma"),
            ColumnaDoc("Dirección del riesgo", "Si el peligro está en valores altos o bajos.", "—", "Catálogo"),
            ColumnaDoc("Descripción", "Significado limnológico de la variable.", "—", "Conocimiento de dominio"),
            ColumnaDoc("Referencia del umbral", "Norma o publicación de origen.", "—", "Bibliografía"),
        ],
    )

    # ------------------------------------------------------------------
    # 2. Catálogo de embalses
    # ------------------------------------------------------------------
    emb_df = pd.DataFrame(
        [
            {
                "Embalse": e.nombre,
                "Ubicación": f"{e.ubicacion}, {e.pais}",
                "Latitud": e.lat,
                "Longitud": e.lng,
                "Área [km²]": e.area_km2,
                "Prof. máxima [m]": e.prof_max_m,
                "Prof. media [m]": e.prof_media_m,
                "Volumen [hm³]": e.volumen_hm3,
                "Estado trófico": e.estado_trofico.value,
                "Uso principal": e.uso_principal,
                "Sensor satelital": e.sensor_satelital,
                "Estaciones": sum(1 for s in ESTACIONES if s.embalse_id == e.id),
            }
            for e in EMBALSES
        ]
    )

    tabla(
        emb_df,
        Ficha(
            titulo="Cuerpos de agua monitorizados",
            que_muestra=(
                f"Los {len(EMBALSES)} embalses del gemelo con sus "
                f"características morfométricas y su red de estaciones."
            ),
            como_leer=(
                "La **relación entre profundidad media y área** anticipa el "
                "comportamiento: un cuerpo somero y extenso se calienta y se "
                "mezcla con facilidad, y es más propenso a floraciones. El "
                "**estado trófico** resume la carga de nutrientes acumulada."
            ),
            hallazgo=(
                "Los tres embalses cubren un gradiente trófico completo, de "
                "mesotrófico a hipereutrófico, lo que permite comparar el "
                "comportamiento del motor en condiciones distintas. La Bahía "
                "de Puno es el caso más somero (4,8 m de media), y por eso el "
                "más reactivo térmicamente."
            ),
            criterio="Clasificación trófica según los límites de la OCDE (1982).",
            procedencia=(
                "Datos morfométricos portados de `src/data/mockData.ts` del "
                "gemelo web. Corresponden a cuerpos de agua reales."
            ),
            limitaciones=(
                "Las características físicas son aproximadas y de carácter "
                "descriptivo. Para un uso operativo habría que verificarlas con "
                "el organismo de cuenca correspondiente."
            ),
        ),
        diccionario=[
            ColumnaDoc("Embalse", "Nombre del cuerpo de agua.", "—", "Catálogo"),
            ColumnaDoc("Ubicación", "Localidad y país.", "—", "Catálogo"),
            ColumnaDoc("Latitud", "Coordenada geográfica norte-sur.", "grados", "Catálogo"),
            ColumnaDoc("Longitud", "Coordenada geográfica este-oeste.", "grados", "Catálogo"),
            ColumnaDoc("Área [km²]", "Superficie de la lámina de agua.", "km²", "Catálogo"),
            ColumnaDoc("Prof. máxima [m]", "Profundidad en el punto más hondo.", "m", "Catálogo"),
            ColumnaDoc("Prof. media [m]", "Volumen dividido por superficie.", "m", "Catálogo"),
            ColumnaDoc("Volumen [hm³]", "Capacidad de almacenamiento.", "hm³", "Catálogo"),
            ColumnaDoc("Estado trófico", "Clase de productividad del cuerpo de agua.", "—", "OCDE (1982)"),
            ColumnaDoc("Uso principal", "Destino del recurso.", "—", "Catálogo"),
            ColumnaDoc("Sensor satelital", "Plataforma de teledetección asociada.", "—", "Catálogo"),
            ColumnaDoc("Estaciones", "Número de puntos de medición.", "recuento", "Catálogo"),
        ],
    )

    # ------------------------------------------------------------------
    # 3. Parámetros del simulador
    # ------------------------------------------------------------------
    p = PERFILES[embalse_id]
    perfil_df = pd.DataFrame(
        [
            {"Parámetro": "Temperatura media", "Valor": p.temp_media, "Unidad": "°C",
             "Papel en el modelo": "Nivel base de la serie térmica; controla la tasa de crecimiento vía Q10."},
            {"Parámetro": "Amplitud diaria", "Valor": p.amplitud_diaria, "Unidad": "°C",
             "Papel en el modelo": "Oscilación día/noche; genera el ciclo diario de oxígeno."},
            {"Parámetro": "Fósforo base", "Valor": p.fosforo_base, "Unidad": "mg/L",
             "Papel en el modelo": "Nutriente limitante en la cinética de Monod del crecimiento."},
            {"Parámetro": "Nitrógeno base", "Valor": p.nitrogeno_base, "Unidad": "mg/L",
             "Papel en el modelo": "Determina la relación N:P y la fracción cianobacteriana."},
            {"Parámetro": "Biomasa inicial", "Valor": p.biomasa_inicial, "Unidad": "µg/L",
             "Papel en el modelo": "Condición inicial del crecimiento logístico."},
            {"Parámetro": "Capacidad de carga", "Valor": p.capacidad_carga, "Unidad": "µg/L",
             "Papel en el modelo": "Techo asintótico de la biomasa."},
            {"Parámetro": "Viento medio", "Valor": p.viento_medio, "Unidad": "km/h",
             "Papel en el modelo": "Energía de mezcla; limita la acumulación superficial."},
            {"Parámetro": "Turbidez base", "Valor": p.turbidez_base, "Unidad": "NTU",
             "Papel en el modelo": "Nivel de fondo de material en suspensión."},
        ]
    )

    tabla(
        perfil_df,
        Ficha(
            titulo="Parámetros del simulador para este embalse",
            que_muestra=(
                "Condiciones de contorno que el generador usa para producir la "
                "serie de este embalse concreto."
            ),
            como_leer=(
                "Cada parámetro indica **qué papel juega** en las ecuaciones del "
                "generador. Son estos valores, y no un ajuste estadístico, los "
                "que diferencian el comportamiento de un embalse hipereutrófico "
                "del de uno mesotrófico."
            ),
            hallazgo=(
                f"Este embalse parte de una biomasa de {p.biomasa_inicial:.0f} "
                f"µg/L con un techo de {p.capacidad_carga:.0f} µg/L y una "
                f"temperatura media de {p.temp_media:.1f} °C. "
                + (
                    "Con esa combinación, el simulador produce floraciones "
                    "recurrentes."
                    if p.capacidad_carga > 80
                    else "Con esa combinación, las floraciones son limitadas."
                )
            ),
            criterio=(
                "Valores elegidos para reproducir el estado trófico documentado "
                "de cada cuerpo de agua, no ajustados a mediciones."
            ),
            procedencia="Definidos en `aquatwin/datos.py::PERFILES`.",
            limitaciones=(
                "**Son parámetros de un simulador, no constantes medidas.** "
                "Cambiarlos cambia toda la serie y, con ella, todas las "
                "conclusiones de la aplicación. Es la limitación de fondo del "
                "trabajo: el gemelo modela un embalse plausible, no uno concreto."
            ),
        ),
        diccionario=[
            ColumnaDoc("Parámetro", "Constante del generador de series.", "—", "Configuración"),
            ColumnaDoc("Valor", "Valor asignado para este embalse.", "ver Unidad", "Configuración"),
            ColumnaDoc("Unidad", "Unidad del parámetro.", "—", "Configuración"),
            ColumnaDoc("Papel en el modelo", "Función que cumple en las ecuaciones.", "—", "Documentación"),
        ],
    )

    # ------------------------------------------------------------------
    # 4. Metodología y limitaciones
    # ------------------------------------------------------------------
    st.markdown("### Metodología del generador de series")
    st.markdown(
        """
La serie no es ruido aleatorio ajustado para parecer verosímil: cada variable se
construye desde un proceso físico o biológico documentado. Esto importa porque
el modelo predictivo aprende de ella, y las explicaciones SHAP solo significan
algo si las relaciones subyacentes son causalmente coherentes.

| Variable | Proceso representado |
|---|---|
| Temperatura | Estacionalidad anual + ciclo diario sinusoidal + ruido gaussiano |
| Radiación PAR | Ciclo solar diurno, nulo de noche, atenuado por nubosidad estocástica |
| Viento | Proceso autorregresivo AR(1) con episodios de calma persistente |
| Nutrientes | Nivel base del embalse + pulsos de escorrentía con decaimiento exponencial |
| Clorofila-a | Crecimiento logístico con tasa dependiente de temperatura (Q10 ≈ 1,9), luz (saturación), fósforo (Monod, Ks = 0,03 mg/L) y estabilidad de la columna |
| Ficocianina | Fracción cianobacteriana de la biomasa, creciente con temperatura y con N:P bajo |
| Oxígeno disuelto | Saturación por temperatura (Weiss) + producción fotosintética − respiración |
| pH | Sube con la fotosíntesis por consumo de CO₂ |
| Turbidez | Nivel de fondo del embalse + aporte de la propia biomasa |

**Reproducibilidad.** El generador es determinista y sembrado: con la misma
semilla produce exactamente la misma serie. Todas las figuras de esta
aplicación son, por tanto, reproducibles.
"""
    )

    st.markdown("### Limitaciones del trabajo")
    st.markdown(
        """
Se enumeran aquí de forma explícita, porque un gemelo digital que no declara
sus límites induce a confiar más de lo que merece.

1. **Los datos son simulados.** Es la limitación principal y condiciona a todas
   las demás. El motor está validado contra la dinámica del simulador, no
   contra la naturaleza.

2. **La batimetría es procedural.** La geometría del vaso es un modelo
   esquemático escalado a las dimensiones reales, no un levantamiento por
   ecosonda. No sirve para calcular volúmenes ni para navegación.

3. **La interpolación espacial se apoya en pocas estaciones.** Con dos a cuatro
   puntos por embalse, el mapa describe bien su entorno inmediato y mal las
   zonas intermedias. Por eso se representa explícitamente la incertidumbre.

4. **La microcistina es una estimación de cribado**, derivada de la densidad de
   cianobacterias mediante una relación empírica. La cuantificación real exige
   HPLC o ELISA en laboratorio. Ninguna decisión sanitaria debería apoyarse en
   el valor estimado sin confirmación analítica.

5. **El NDCI está estimado por inversión**, no calculado de bandas satelitales
   reales. Es una capa ilustrativa.

6. **Los pesos de las reglas son juicio experto**, calibrado sobre literatura
   pero no ajustado a datos de estos embalses.

7. **Sin histórico etiquetado no hay validación del diagnóstico.** Se puede
   medir el error del modelo predictivo contra el valor observado, pero no la
   tasa de falsos positivos del sistema de alerta, que requeriría floraciones
   confirmadas por laboratorio.

8. **El módulo de actuadores es simulación.** No existe conexión con hardware
   alguno; los comandos no accionan nada.
"""
    )

    st.markdown("### Referencias")
    st.markdown(
        """
- Carlson, R.E. (1977). *A trophic state index for lakes*. Limnology and Oceanography, 22(2), 361–369.
- Redfield, A.C. (1958). *The biological control of chemical factors in the environment*. American Scientist, 46(3).
- Smith, V.H. (1983). *Low nitrogen to phosphorus ratios favor dominance by blue-green algae*. Science, 221(4611).
- Paerl, H.W. & Huisman, J. (2008). *Blooms like it hot*. Science, 320(5872), 57–58.
- Mishra, S. & Mishra, D.R. (2012). *Normalized difference chlorophyll index*. Remote Sensing of Environment, 117.
- Weiss, R.F. (1970). *The solubility of nitrogen, oxygen and argon in water and seawater*. Deep-Sea Research, 17.
- OMS (2003). *Guidelines for safe recreational water environments, Vol. 1: Coastal and fresh waters*.
- OMS (2020). *Cyanobacterial toxins: microcystins*. Background document for WHO guidelines.
- EPA (1986). *Quality criteria for water* ("Gold Book"). EPA 440/5-86-001.
- OCDE (1982). *Eutrophication of waters: monitoring, assessment and control*.
- IOOS (2020). *QARTOD — Quality Assurance/Quality Control of Real-Time Oceanographic Data*.
- Lundberg, S.M. & Lee, S.I. (2017). *A unified approach to interpreting model predictions*. NeurIPS 30.
"""
    )
