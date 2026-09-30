# AquaTwin HAB — Motor del Gemelo Digital en Python

Motor de análisis del gemelo digital para **alerta temprana de floraciones de
algas nocivas (HAB/FAN)** en embalses, construido con Python y Streamlit.

Es la contraparte analítica del gemelo web en React/Three.js que vive en el
directorio padre: comparte el modelo de dominio y el catálogo de embalses, y
añade el motor de diagnóstico, la detección de anomalías y el modelo predictivo
con explicabilidad.

---

## Requisito de diseño: interpretabilidad y explicabilidad en todo

El requisito del proyecto es que **todas las figuras y tablas generadas
contengan interpretabilidad y explicabilidad**. Aquí se resuelve de forma
estructural, no decorativa.

### La distinción que se aplica

| | Qué significa | Dónde vive |
|---|---|---|
| **Interpretabilidad** | El resultado se entiende por construcción: unidades en los ejes, umbrales normativos dibujados, reglas legibles, fórmulas visibles | `dominio.py`, `motor/reglas.py`, `motor/indices.py` |
| **Explicabilidad** | Se puede responder *por qué* el modelo dio **este** resultado para **este** caso: contribuciones SHAP, reglas disparadas, contrafactuales | `motor/prediccion.py`, `vistas/prediccion.py` |

### Cómo se garantiza

Las figuras y las tablas **no se renderizan directamente**. No hay una sola
llamada a `st.plotly_chart` ni a `st.dataframe` fuera de `explicabilidad.py`.
Se publican a través de dos funciones que **exigen una `Ficha`**:

```python
figura(fig, ficha)                      # figura + interpretación
tabla(df, ficha, diccionario_columnas)  # tabla + interpretación + diccionario
```

La `Ficha` tiene seis campos obligatorios, que responden a las seis preguntas
que cualquiera se hace ante un gráfico:

| Campo | Responde a |
|---|---|
| `titulo` | Enunciado del hallazgo (no una etiqueta genérica) |
| `que_muestra` | Variable, unidad, cobertura espacial y temporal |
| `como_leer` | Ejes, colores, líneas de referencia, marcas |
| `hallazgo` | **Lectura del dato concreto de ahora** — se calcula en cada render |
| `criterio` | Norma o umbral con el que se juzga, citando la fuente |
| `procedencia` | De dónde salen los números y qué transformaciones sufrieron |
| `limitaciones` | Qué **no** se puede concluir |

Las tablas exigen además un **diccionario de datos**: definición, unidad y
origen de cada columna. Una tabla sin eso no es interpretable, por muy claros
que le parezcan los encabezados a quien la escribió.

No es posible publicar una figura sin explicación: no existe una ruta en el
código que lo permita.

---

## Instalación y ejecución

```bash
cd gd_python
pip install -r requirements.txt
streamlit run app.py
```

Se abre en `http://localhost:8501`. Requiere Python 3.10 o superior.

---

## Estructura

```
gd_python/
├── app.py                      Punto de entrada de Streamlit
├── requirements.txt
└── aquatwin/
    ├── dominio.py              Tipos, enumeraciones y catálogo de variables
    │                           con umbrales normativos y sus referencias
    ├── datos.py                Catálogo de embalses + generador de la serie
    │                           histórica simulada + control de calidad QARTOD
    ├── explicabilidad.py       ◄ Framework de fichas. El núcleo del requisito
    ├── motor/
    │   ├── indices.py          TSI de Carlson, N:P, saturación de O₂,
    │   │                       estabilidad de la columna, NDCI
    │   ├── reglas.py           Motor de diagnóstico determinista y trazable
    │   ├── anomalias.py        Detección de anomalías explicable
    │   └── prediccion.py       Modelo predictivo + SHAP + contrafactuales
    └── vistas/
        ├── gemelo.py           Vista 1 — Gemelo 3D con interpolación IDW
        ├── telemetria.py       Vista 2 — Series, ciclo diario y calidad
        ├── diagnostico.py      Vista 3 — Diagnóstico trazable
        ├── prediccion.py       Vista 4 — Pronóstico y explicabilidad
        ├── anomalias.py        Vista 5 — Anomalías
        └── datos.py            Vista 6 — Procedencia, método y limitaciones
```

---

## Las seis vistas

**1. Gemelo 3D.** Vaso del embalse en Plotly 3D con la variable seleccionada
interpolada sobre la lámina de agua por **distancia inversa ponderada** desde
las posiciones reales de las estaciones. Se calcula un radio de confianza: las
zonas alejadas de toda estación **se dejan sin color**, porque el gemelo declara
lo que no sabe en lugar de rellenarlo con un valor plausible.

**2. Telemetría y calidad.** Series por estación con umbrales dibujados, los
registros sospechosos marcados con aspas y **los huecos representados como
huecos** (`connectgaps=False`). Incluye el ciclo diario de oxígeno, que es la
firma metabólica del embalse: la amplitud entre el máximo diurno y el mínimo
nocturno delata la biomasa antes de que la clorofila alcance los umbrales.

**3. Diagnóstico.** Motor de ocho reglas deterministas. Se muestra la
contribución de cada una **incluidas las que no se dispararon**: una explicación
que solo enseña la evidencia a favor no es una explicación, es un alegato. Cada
regla cita su norma (OMS, EPA, Redfield).

**4. Pronóstico y explicabilidad.** En cuatro bloques, de lo general a lo
accionable:
1. **Validación** contra el referente de persistencia — va primero porque sin
   él los tres siguientes explicarían las decisiones de un modelo del que no
   sabemos si funciona.
2. **Explicabilidad global** — importancia media |SHAP|.
3. **Explicabilidad local** — cascada SHAP de una predicción concreta.
4. **Contrafactual** — qué cambio mínimo en una variable **accionable** habría
   bajado la predicción del umbral.

**5. Anomalías.** Cuatro detectores con significado limnológico. Cada evento
nombra el fenómeno, aporta la magnitud, explica su consecuencia ecológica y
declara **con qué método se detectó**, que es lo que permite auditar un falso
positivo. Incluye una comparación de cuántas falsas alarmas evita el control de
calidad.

**6. Procedencia y método.** Catálogo de variables, parámetros del simulador,
metodología del generador, limitaciones y bibliografía.

---

## Decisiones técnicas que conviene conocer

**El nivel de alerta lo emite un motor de reglas, no el modelo de aprendizaje.**
Las reglas son reproducibles, auditables y citan normas; un modelo estadístico
es más preciso para extrapolar pero no puede defenderse ante un tercero. El
modelo proyecta el valor futuro; la alerta la decide el motor determinista.

**El modelo predice el incremento, no el nivel.** Un modelo de árboles que
predice el nivel debe reconstruir la identidad «el futuro se parece al presente»
mediante una escalera de cortes, cosa que aproxima mal, y acaba perdiendo contra
la persistencia pese a tener más información. Con el incremento como objetivo,
la persistencia equivale a predecir cero y el modelo solo aprende la desviación.
Las métricas se calculan sobre el nivel reconstruido para que la comparación
siga siendo justa.

**Validación con corte temporal, nunca aleatoria.** Barajar una serie temporal
mete el futuro en el entrenamiento y produce métricas optimistas y falsas.

**El listón es la persistencia, no el R².** En series autocorreladas es fácil
obtener un R² alto sin aportar nada. La métrica que decide es la mejora sobre el
modelo ingenuo, y la aplicación la muestra siempre — incluso cuando es negativa.

**Se distingue ruido de proceso de ruido de observación.** El estado de la
biomasa evoluciona de forma suave según la ecuación de crecimiento; lo que es
imperfecto es la lectura del sensor. Inyectar el ruido dentro del bucle lo
integraría en un paseo aleatorio y haría el sistema intrínsecamente impredecible.

**La agregación de reglas es conservadora.** El nivel final nunca queda por
debajo del máximo alcanzado por una regla de peso alto. Promediar diluiría
precisamente la señal que más importa: en alerta sanitaria, el coste de un
falso negativo no es comparable al de un falso positivo.

---

## Aviso de procedencia

**La serie temporal de este gemelo es simulada, no medida.** Se genera con un
modelo fenomenológico determinista y sembrado que reproduce la dinámica
limnológica conocida: ciclo diario de temperatura y radiación, producción
fotosintética y respiración nocturna del oxígeno, mezcla por viento y
crecimiento logístico de la biomasa.

Los embalses (San Roque, Bahía Interior de Puno, Paso de las Piedras) y sus
características morfométricas son reales. **Su telemetría no lo es.** Ninguna
conclusión de esta aplicación describe el estado actual de ningún cuerpo de agua
real.

El generador es reproducible: la misma semilla produce exactamente la misma
serie, y por tanto las mismas figuras.

La lista completa de limitaciones está en la vista 6 de la aplicación.

---

## Referencias

- Carlson, R.E. (1977). *A trophic state index for lakes*. Limnology and Oceanography, 22(2), 361–369.
- Redfield, A.C. (1958). *The biological control of chemical factors in the environment*. American Scientist, 46(3).
- Smith, V.H. (1983). *Low nitrogen to phosphorus ratios favor dominance by blue-green algae*. Science, 221(4611).
- Paerl, H.W. & Huisman, J. (2008). *Blooms like it hot*. Science, 320(5872), 57–58.
- Mishra, S. & Mishra, D.R. (2012). *Normalized difference chlorophyll index*. Remote Sensing of Environment, 117.
- Weiss, R.F. (1970). *The solubility of nitrogen, oxygen and argon in water and seawater*. Deep-Sea Research, 17.
- OMS (2003). *Guidelines for safe recreational water environments, Vol. 1*.
- EPA (1986). *Quality criteria for water* ("Gold Book"). EPA 440/5-86-001.
- OCDE (1982). *Eutrophication of waters: monitoring, assessment and control*.
- IOOS (2020). *QARTOD — Quality Assurance/Quality Control of Real-Time Oceanographic Data*.
- Lundberg, S.M. & Lee, S.I. (2017). *A unified approach to interpreting model predictions*. NeurIPS 30.
