# AquaTwin HAB — Especificación Formal del Proyecto y Gestión en Jira

**Proyecto Jira:** AquaTwin HAB — Limnological Digital Twin & Early Warning Engine  
**Clave del Proyecto (Project Key):** `AQUA`  
**Tipo de Proyecto:** Software Development (Scrum / Kanban Framework)  
**Herramientas Asociadas:** Jira Software, Confluence, Bitbucket/GitHub, Streamlit Engine  
**Dataset de Validación:** Falling Creek Reservoir (`fcr_oapat.csv` - 1,960 observaciones horarias)  
**Autores & Liderazgo Técnico:**  
- **Daily Ashley Córdova Urbina** (ORCID: [0009-0008-8433-779X](https://orcid.org/0009-0008-8433-779X) | Correo: `T1043300421@unitru.edu.pe`) — *Autor de correspondencia*  
- **Yoel Armando Solórzano Sánchez** (ORCID: [0009-0003-4245-7439](https://orcid.org/0009-0003-4245-7439) | Correo: `ysolorzano@unitru.edu.pe`)  
**Institución:** Escuela Académico Profesional de Ingeniería de Sistemas, Facultad de Ingeniería, Universidad Nacional de Trujillo (UNT), Trujillo, Perú.

---

## 1. Estructura Jerárquica del Proyecto en Jira

```
AQUA (Project)
├── AQUA-EPIC-01: Gemelo Digital 3D & Simulación Biológica (Three.js WebGL)
├── AQUA-EPIC-02: Motor de Machine Learning en Python con Streamlit (CRISP-DM)
│   ├── AQUA-STORY-201: Fase 1 & 2 - Comprensión del Negocio & EDA Limnológico
│   ├── AQUA-STORY-202: Fase 3 - Preparación de Datos & Lags Temporales
│   ├── AQUA-STORY-203: Fase 4 - Entrenamiento Multimodelo de Regresión & Clasificación
│   ├── AQUA-STORY-204: Fase 5 - Selección Multicriterio del Modelo Campeón
│   ├── AQUA-STORY-205: Fase 6 - Validación Cruzada Temporal (TimeSeriesSplit)
│   ├── AQUA-STORY-206: Fase 7 - Optimización de Hiperparámetros (GridSearchCV)
│   ├── AQUA-STORY-207: Fase 8 - Pruebas Estadísticas Robustas Inferenciales
│   └── AQUA-STORY-208: Fase 9 - Generación de Reportes Técnicos & Auditoría
├── AQUA-EPIC-03: Asimilación Ciberfísica Multiespectral & Telemetría OAPAT
├── AQUA-EPIC-04: Explicabilidad Causal (XAI) & Alertas Tempranas
├── AQUA-EPIC-05: Orquestación LLM y Copiloto Limnológico (Langflow Studio)
└── AQUA-EPIC-06: Reproducibilidad Científica & Publicación Q1
```

---

## 2. Mapa Detallado de Epics

| Epic Key | Título del Epic | Metodología / Subsistema | Criterio de Éxito / DoD | Estado |
|---|---|---|---|---|
| `AQUA-EPIC-01` | Gemelo Digital 3D WebGL (Falling Creek) | Three.js / WebGL / Limnología | 60 FPS sostenidos, oleaje multiharmónico y 2,400 partículas de Microcystis. | `DONE` |
| `AQUA-EPIC-02` | Motor ML en Python con Streamlit (CRISP-DM) | Python 3.12 / Streamlit / Scikit-Learn | Las 7 fases completadas con footer obligatorio de explicabilidad en toda figura y tabla. | `DONE` |
| `AQUA-EPIC-03` | Asimilación Ciberfísica de Datos Reales | EnKF / Sentinel-2 MSI / YSI EXO2 | Pipeline continuo sobre fcr_oapat.csv sin fuga de datos. | `DONE` |
| `AQUA-EPIC-04` | Alerta Temprana & Explicabilidad Causal | XAI (SHAP) / Directrices OMS | Detección a 48-72h de Chl-a > 25 μg/L con AUC > 0.95. | `DONE` |
| `AQUA-EPIC-05` | Copiloto Limnológico con Langflow | Langflow Studio / Agentes LLM | Interfaz visual interactiva integrada en el canvas. | `DONE` |
| `AQUA-EPIC-06` | Documentación Científica & Código en GitHub | Peer Review / GitHub / BibTeX | Manuscrito Q1 con 6 figuras, 6 tablas y 42 citas en APA 7. | `DONE` |

---

## 3. Historias de Usuario (User Stories) — EPIC-02: Motor Streamlit CRISP-DM

### AQUA-STORY-201: Módulo 1 — EDA (Análisis Exploratorio de Datos Limnológicos)
- **Como:** Investigador o analista limnológico.
- **Quiero:** Visualizar series temporales interactivas, histogramas de densidad, boxplots de outliers y matrices de correlación de Spearman sobre el dataset `fcr_oapat.csv`.
- **Para:** Comprender la estacionalidad de las floraciones y las relaciones biofísicas entre nutrientes, temperatura y biomasa.
- **Criterios de Aceptación (Gherkin):**
  - **GIVEN** que el usuario accede a la pestaña de EDA en la aplicación Streamlit.
  - **WHEN** selecciona una variable limnológica (e.g. Clorofila-a o Ficocianina).
  - **THEN** el sistema renderiza el gráfico correspondiente a 150 DPI y muestra **al pie de forma obligatoria** el bloque:  
    `🔍 Interpretabilidad y explicabilidad: [análisis biofísico del resultado]`.

---

### AQUA-STORY-202: Módulo 2 — Preparación e Ingeniería de Características
- **Como:** Ingeniero de Machine Learning.
- **Quiero:** Generar características rezagadas ($T-1$, $T-2$), medias móviles de 3 pasos, proxy de estratificación térmica ($\Delta T$) y alineación temporal estricta con el objetivo futuro ($T+24\text{h}$).
- **Para:** Evitar la fuga de información (data leakage) y modelar la inercia metabólica de las cianobacterias.
- **Criterios de Aceptación:**
  - Tratamiento de nulos mediante interpolación PCHIP sin descartar eventos de floración extrema.
  - Tabla de metadatos de variables procesadas con su pie de explicabilidad.

---

### AQUA-STORY-203: Módulo 3 — Entrenamiento de Múltiples Modelos
- **Como:** Científico de datos.
- **Quiero:** Entrenar simultáneamente modelos lineales regularizados (Ridge), ensambles bagging (Random Forest, Extra Trees) y boosting (Gradient Boosting) sobre la partición temporal de datos.
- **Para:** Contrastar qué familia algorítmica captura mejor las no linealidades de las floraciones algales.
- **Criterios de Aceptación:**
  - Partición temporal ajustable por slider (60% a 85%).
  - Cálculo en tiempo real de $R^2$, RMSE, MAE, KGE y NSE con tiempos de ejecución.
  - Tabla comparativa con pie de interpretabilidad.

---

### AQUA-STORY-204: Módulo 4 — Selección Multicriterio del Mejor Modelo
- **Como:** Operador de planta de tratamiento de agua.
- **Quiero:** Que el sistema identifique y seleccione automáticamente el modelo campeón según la combinación óptima de máximo $R^2$ y mínimo RMSE.
- **Para:** Desplegar en producción el modelo con menor tasa de falsos negativos ante picos críticos de microcistina.
- **Criterios de Aceptación:**
  - Gráfico comparativo de serie temporal entre el valor real observado y el pronóstico del modelo campeón con bandas de confianza del 95%.
  - Línea de referencia del umbral crítico de alerta OMS ($25\ \mu\text{g/L}$).

---

### AQUA-STORY-205: Módulo 5 — Validación Cruzada Temporal (TimeSeriesSplit)
- **Como:** Evaluador de riesgos y auditor técnico.
- **Quiero:** Evaluar el modelo campeón mediante validación cruzada temporal bloqueada (TimeSeriesSplit de 5 particiones).
- **Para:** Demostrar que el modelo no sufre sobreajuste y mantiene consistencia a lo largo de ciclos hidrológicos sucesivos.
- **Criterios de Aceptación:**
  - Tabla con métricas independientes por cada fold (Fold 1 a 5).
  - Gráfico de dispersión de $R^2$ por fold frente al promedio general con pie de explicabilidad biofísica.

---

### AQUA-STORY-206: Módulo 6 — Optimización de Hiperparámetros
- **Como:** Investigador de inteligencia artificial.
- **Quiero:** Ejecutar una búsqueda sistemática en grilla (`GridSearchCV`) sobre el número de estimadores, profundidad máxima y tasa de aprendizaje.
- **Para:** Obtener la configuración óptima de hiperparámetros que minimice el sobreajuste a ruidos ópticos.
- **Criterios de Aceptación:**
  - Tabla de ranking de configuraciones evaluadas con sus respectivas desviaciones estándar.
  - Despliegue de los mejores hiperparámetros en formato JSON con pie explicativo.

---

### AQUA-STORY-207: Módulo 7 — Pruebas Estadísticas Robustas Inferenciales
- **Como:** Revisor por pares de revista científica de nivel Q1.
- **Quiero:** Contar con contrastes de hipótesis estadísticos rigurosos (test de normalidad de Shapiro-Wilk, t-Student pareado, prueba no paramétrica de rangos de Wilcoxon e intervalos de confianza bootstrap al 95%).
- **Para:** Verificar si las diferencias de rendimiento entre modelos son estadísticamente significativas con $p < 0.05$.
- **Criterios de Aceptación:**
  - Tabla completa con hipótesis nulas ($H_0$), estadísticos de prueba, $p$-valores exactos y decisiones de rechazo/no rechazo.
  - Gráfico de densidad de probabilidad de residuos absolutos ($|y - \hat{y}|$) con pie de explicabilidad inferencial.

---

### AQUA-STORY-208: Módulo 8 — Generador de Reportes y Auditoría
- **Como:** Gestor ambiental o auditor de cuenca.
- **Quiero:** Exportar un reporte técnico consolidado en formatos Markdown (`.md`) y CSV con todas las métricas, parámetros y recomendaciones operativas.
- **Para:** Archivar la trazabilidad de las decisiones de alerta temprana según el estándar CRISP-DM.
- **Criterios de Aceptación:**
  - Botones interactivos de descarga directa en el navegador.
  - Inclusión de las advertencias sanitarias y acciones operacionales requeridas.

---

## 4. Matriz de Trazabilidad de Requerimientos (RTM)

| Ticket Jira | Archivo de Implementación | Tecnología / Librería | Evidencia de Validación |
|---|---|---|---|
| `AQUA-201` (EDA) | `streamlit_app.py` (Fase 2) | Streamlit / Seaborn / Matplotlib | Histogramas, boxplots y correlaciones de Spearman con pie explicativo. |
| `AQUA-202` (Prep) | `streamlit_app.py` (Fase 3) | Pandas / NumPy / Scipy | Lags temporales e imputación PCHIP sin fuga de datos. |
| `AQUA-203` (Train) | `streamlit_app.py` (Fase 4) | Scikit-Learn (Ridge, RF, GB, ET) | Tabla comparativa de métricas ($R^2$, RMSE, MAE, KGE, NSE). |
| `AQUA-204` (Select) | `streamlit_app.py` (Fase 5) | Scikit-Learn / Matplotlib | Selección del modelo campeón y gráfico con bandas de confianza al 95%. |
| `AQUA-205` (CV) | `streamlit_app.py` (Fase 6) | `TimeSeriesSplit` (Scikit-Learn) | Evaluación temporal de 5 folds sin solapamiento temporal. |
| `AQUA-206` (Tuning) | `streamlit_app.py` (Fase 7) | `GridSearchCV` | Espacio de búsqueda de hiperparámetros y curva de convergencia. |
| `AQUA-207` (Stats) | `streamlit_app.py` (Fase 8) | `scipy.stats` (Shapiro, t-test, Wilcoxon) | Tabla inferencial con $p$-valores y contrastes de hipótesis ($p < 0.001$). |
| `AQUA-208` (Report) | `streamlit_app.py` (Fase 9) | Python `io.StringIO` / Streamlit Download | Exportación en Markdown y CSV descargable en un clic. |

---

## 5. Planificación de Sprints (Scrum)

- **Sprint 1 (Semanas 1-2):** Comprensión del Dominio, Ingesta del Dataset Falling Creek (`fcr_oapat.csv`) y Módulo EDA con Explicabilidad.
- **Sprint 2 (Semanas 3-4):** Ingeniería de Lags Temporales, Entrenamiento Multimodelo y Algoritmo de Selección del Modelo Campeón.
- **Sprint 3 (Semanas 5-6):** Validación Cruzada Temporal (`TimeSeriesSplit`), Ajuste de Hiperparámetros y Pruebas Estadísticas Inferenciales Robustas.
- **Sprint 4 (Semanas 7-8):** Generación de Reportes Técnicos, Integración Ciberfísica con el Gemelo Digital 3D y Despliegue en Streamlit.

---

## 6. Plantilla para Importación Directa en Jira Cloud (CSV)

```csv
Issue Type,Issue key,Summary,Description,Component,Priority,Status
Epic,AQUA-EPIC-02,Motor ML en Python con Streamlit (CRISP-DM),Implementar motor limnológico interactivo en Streamlit con dataset real FCR y metodología CRISP-DM,Machine-Learning,High,Done
Story,AQUA-201,Fase 2: EDA Limnológico con Interpretabilidad,Desarrollar módulo de análisis exploratorio con series temporales y correlaciones con pie explicativo obligatorio,Machine-Learning,High,Done
Story,AQUA-202,Fase 3: Ingeniería de Características y Lags,Construir tensor de variables con rezagos temporales e imputación PCHIP,Data-Engineering,Medium,Done
Story,AQUA-203,Fase 4: Entrenamiento Multimodelo,Entrenar y comparar modelos Ridge Random Forest Gradient Boosting y Extra Trees,Machine-Learning,High,Done
Story,AQUA-204,Fase 5: Selección del Modelo Campeón,Algoritmo de selección automática multicriterio por R2 y RMSE,Machine-Learning,High,Done
Story,AQUA-205,Fase 6: Validación Cruzada TimeSeriesSplit,Validación temporal bloqueada de 5 particiones sin data leakage,Quality-Assurance,High,Done
Story,AQUA-206,Fase 7: Optimización de Hiperparámetros,GridSearchCV para ajuste fino de estimadores y profundidad máxima,Machine-Learning,Medium,Done
Story,AQUA-207,Fase 8: Pruebas Estadísticas Robustas Inferenciales,Pruebas de Shapiro-Wilk t-test pareado Wilcoxon y Bootstrap al 95%,Data-Science,High,Done
Story,AQUA-208,Fase 9: Generador de Reportes y Auditoría,Exportación automatizada de reportes limnológicos en Markdown y CSV,Reporting,Medium,Done
```
