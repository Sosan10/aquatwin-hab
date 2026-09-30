# AquaTwin HAB — 3D Digital Twin & Scientific Framework for Harmful Algal Bloom Forecasting

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg?logo=react&logoColor=black)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r128-black.svg?logo=three.js)](https://threejs.org/)
[![Python](https://img.shields.io/badge/Python-3.12-3776ab.svg?logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Dataset](https://img.shields.io/badge/Dataset-fcr__oapat.csv_(1%2C960_obs)-059669.svg)](./)

Plataforma de **Gemelo Digital 3D (Digital Twin)** para el monitoreo, simulación hidrodinámica y pronóstico temprano de **Floraciones Algales Nocivas (HAB / FAN)** y cianobacterias (*Microcystis aeruginosa*). Desarrollada para la investigación limnológica, gestión de cuencas y publicación científica con reproducibilidad total.

---

## 📋 Tabla de Contenidos
1. [Descripción General](#-descripción-general)
2. [Arquitectura del Sistema](#-arquitectura-del-sistema)
3. [Dataset Real y Fuente de Datos](#-dataset-real-y-fuente-de-datos)
4. [Instalación y Reproducibilidad Local](#-instalación-y-reproducibilidad-local)
   - [Requisitos Previos](#requisitos-previos)
   - [Paso 1: Clonar el Repositorio](#paso-1-clonar-el-repositorio)
   - [Paso 2: Frontend y Gemelo Digital 3D](#paso-2-frontend-y-gemelo-digital-3d)
   - [Paso 3: Backend Limnológico en Python (Opcional)](#paso-3-backend-limnológico-en-python-opcional)
5. [Estructura del Repositorio](#-estructura-del-repositorio)
6. [Gestión y Trazabilidad del Proyecto (Jira)](#-gestión-y-trazabilidad-del-proyecto-jira)
7. [Documento del Código Completo (GD.docx)](#-documento-del-código-completo-gddocx)
8. [Cómo Citar este Trabajo (BibTeX)](#-cómo-citar-este-trabajo-bibtex)
9. [Licencia](#-licencia)

---

## 🌊 Descripción General

Las floraciones de cianobacterias representan un riesgo crítico para los ecosistemas acuáticos y el suministro de agua potable debido a la liberación de hepatotoxinas como la microcistina. 

**AquaTwin HAB** integra:
- **Gemelo Digital 3D en Tiempo Real**: Simulación WebGL (Three.js) de la columna de agua, batimetría del reservorio, oleaje capilar multiharmónico y dispersión de fitoplancton.
- **Modelado Bio-óptico y Físico**: Representación visual y analítica de bandas espectrales (Clorofila-a, NDCI, Ficocianina) y un enjambre de 2,400 partículas coloniales de *Microcystis aeruginosa* con deriva advectiva y difusión browniana.
- **Motor Limnológico Determinista**: Cálculo en tiempo real del Índice de Estado Trófico de Carlson (TSI), estratificación térmica ($\Delta T$), estabilidad de columna y relación N:P.
- **Predicción con IA y Alerta Temprana**: Modelos temporales multivariados (CNN-LSTM / Ensambles) con horizontes de +24h, +48h y +72h, integrando explicabilidad exacta de factores determinantes (XAI).
- **Copiloto Limnológico**: Módulo visual interactivo con Langflow Studio para orquestación de agentes limnológicos.

---

## 🏗 Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FUENTES DE TELEMETRÍA                           │
│  Dataset Real: Falling Creek Reservoir (fcr_oapat.csv - 1,960 obs)     │
│  Sensores: Sonda YSI EXO2, Radiación Solar, Anemómetros, Termistores   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     MOTOR DEL GEMELO DIGITAL (GD)                      │
│  - Control de Calidad e Imputación Continua (src/gd/serie.ts)          │
│  - Diagnóstico Físico: Salto Térmico ΔT y TSI Carlson (src/gd/indices) │
│  - Reglas Expertas Deterministas Limnológicas (src/gd/reglas.ts)        │
│  - Motor de Predicción a +72h y Explicabilidad (src/gd/prediccion.ts)  │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       RENDERIZADOR 3D WEBGL          │  │     MÓDULO DE IA & ALERTAS   │
│  - Batimetría y Malla de Agua Físico │  │  - Sistema de Alerta Temprana│
│  - Texturas Fractales de Nata Algal  │  │  - Sandbox "What-If"         │
│  - 2,400 Partículas Microcystis      │  │  - Langflow Studio Copilot   │
│  - Boyas Oceanográficas Interactivas │  │  - Reportes y Auditoría PDF  │
│  (src/components/DigitalTwin3DCanvas)│  │  (src/components/AIEarly...) │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## 📊 Dataset Real y Fuente de Datos

El sistema está configurado y validado de manera predeterminada con el dataset oceanográfico y limnológico del **Embalse Falling Creek (FCR, Virginia, EE. UU.)** mediante el conjunto de datos `fcr_oapat.csv`:

- **Observaciones registradas:** 1,960 registros temporales continuos de alta resolución.
- **Variables monitoreadas:**
  - Clorofila-a ($\mu\text{g/L}$) y concentración estimada de fitoplancton.
  - Oxígeno Disuelto ($\text{mg/L}$) y porcentaje de saturación.
  - Temperatura del agua en epilimnio y gradiente de profundidad ($^\circ\text{C}$).
  - Radiación fotosintéticamente activa (PAR) y radiación solar global ($\text{W/m}^2$).
  - Velocidad y dirección de vientos superficiales ($\text{km/h}$).
  - Conductividad eléctrica y pH.

---

## 🚀 Instalación y Reproducibilidad Local

### Requisitos Previos
- **Node.js**: v18.0.0 o superior (recomendado v20 LTS).
- **npm**: v9.0.0 o superior.
- **Python**: v3.10 a v3.12 (opcional, para el backend analítico complementario).
- **Navegador web moderno** con soporte de WebGL 2.0 (Google Chrome, Firefox, Microsoft Edge, Brave).

### Paso 1: Clonar el Repositorio
```bash
git clone https://github.com/Sosan10/aquatwin-hab.git
cd aquatwin-hab
```

### Paso 2: Frontend y Gemelo Digital 3D
1. Instalar dependencias del proyecto:
   ```bash
   npm install
   ```

2. Configurar variables de entorno (opcional para IA / OpenAI):
   ```bash
   cp .env.example .env.local
   ```
   *(Edita `.env.local` si deseas conectar una clave `OPENAI_API_KEY` para el chat conversacional con el copilot).*

3. Iniciar el servidor de desarrollo local:
   ```bash
   npm run dev
   ```

4. Abrir en el navegador:
   ```
   http://localhost:3000/
   ```

5. Para compilar la versión de producción optimizada:
   ```bash
   npm run build
   ```

### Paso 3: Motor Limnológico en Python con Streamlit (CRISP-DM)
El proyecto incluye un motor interactivo en **Streamlit** que implementa las 7 fases de la metodología **CRISP-DM** sobre el dataset real del embalse Falling Creek (`fcr_oapat.csv`):
1. **EDA**: Series temporales, distribuciones de frecuencia, detección de outliers y matrices de correlación de Spearman.
2. **Entrenamiento**: Modelos Ridge, Random Forest, Gradient Boosting y Extra Trees.
3. **Selección del Mejor Modelo**: Algoritmo de selección multicriterio ($R^2$, RMSE, MAE, KGE, NSE).
4. **Validación Cruzada**: Evaluación temporal de 5 folds (`TimeSeriesSplit`) sin data leakage.
5. **Hiperparámetros**: Búsqueda en grilla (`GridSearchCV`) y ranking de configuraciones.
6. **Pruebas Estadísticas Inferenciales Robustas**: Normalidad (Shapiro-Wilk), t-Student pareado, Wilcoxon signed-rank y Bootstrap IC 95%.
7. **Generador de Reportes**: Exportación técnica en Markdown y CSV.
*Toda figura y tabla incluye al pie su correspondiente análisis de **Interpretabilidad y explicabilidad**.*

Para ejecutar la aplicación de Streamlit:
```bash
# Opción directa en Windows:
run_streamlit.bat

# O mediante consola:
streamlit run streamlit_app.py --server.port 8501
```
Abrir en el navegador: `http://localhost:8501`

### Paso 4: Backend Limnológico en Python (FastAPI / OAPAT)
Si deseas ejecutar la API de Python y los scripts de asimilación de datos ubicados en `gd_python/`:

```bash
cd gd_python
python -m venv .venv

# En Windows:
.venv\Scripts\activate
# En Linux / macOS:
# source .venv/bin/activate

pip install -r requirements.txt
python app.py
```

---

## 📁 Estructura del Repositorio

```
aquatwin-hab/
├── docs/
│   └── JIRA_DOCUMENTATION.md      # Estructura ágil de gestión (Epics, Stories, RTM)
├── GD.docx                         # Compilación íntegra de 11,812 líneas de código del GD
├── generate_gd_docx.py            # Generador automatizado del informe técnico GD.docx
├── gd_python/                     # Motor backend limnológico y asimilación en Python
│   ├── app.py                     # API FastAPI / Flask del Gemelo Digital
│   ├── aquatwin/                  # Dominio, ingesta fcr_oapat.csv, XAI y modelos
│   ├── early_warning/             # Modelos de ensamble y pipelines CRISP-DM
│   └── requirements.txt           # Dependencias científicas de Python
├── src/
│   ├── components/
│   │   ├── DigitalTwin3DCanvas.tsx # 🌟 Núcleo del Gemelo Digital 3D (Three.js)
│   │   ├── GDMotorModule.tsx       # Panel de control del Motor del Gemelo Digital
│   │   ├── LangflowStudioModule.tsx# Orquestador visual de agentes limnológicos
│   │   ├── AIEarlyWarningModule.tsx# Módulo de alerta temprana y simulación What-If
│   │   ├── ReportingModule.tsx     # Generación de informes técnicos y auditoría
│   │   └── gd/                     # Componentes CRISP-DM, Ficha y Gráficas
│   ├── gd/                        # Algoritmos limnológicos en TypeScript
│   │   ├── dominio.ts             # Definición de tipos, estados y boyas
│   │   ├── indices.ts             # TSI Carlson, gradiente Delta-T y estabilidad
│   │   ├── anomalias.ts           # Detección multivariada de anomalías
│   │   ├── prediccion.ts          # Pronóstico a +72h y factores explicables
│   │   └── reglas.ts              # Reglas expertas de clasificación de toxicidad
│   ├── data/
│   │   └── mockData.ts            # Datos de telemetría y paletas espectrales
│   ├── App.tsx                    # Enrutador y contenedor maestro
│   └── main.tsx                   # Punto de entrada de la aplicación
├── package.json                   # Dependencias y scripts de Node
├── vite.config.ts                 # Configuración del empaquetador Vite
└── README.md                      # Documentación principal de reproducibilidad
```

---

## 📌 Gestión y Trazabilidad del Proyecto (Jira)

El ciclo de desarrollo y la trazabilidad de requerimientos se encuentran formalizados en:
👉 [docs/JIRA_DOCUMENTATION.md](docs/JIRA_DOCUMENTATION.md)

Incluye:
- **Epics**: Renderizado 3D, Motor Analítico, Asimilación OAPAT, Alertas Tempranas IA, Langflow Studio y Auditoría.
- **Historias de Usuario (User Stories)** con criterios de aceptación (`GIVEN-WHEN-THEN`).
- **Matriz de Trazabilidad de Requisitos (RTM)** para auditoría de software y cumplimiento metodológico.

---

## 📄 Documento del Código Completo (GD.docx)

Para facilitar la revisión por pares, redacción de artículos científicos y registro de propiedad intelectual, el repositorio incluye el archivo:
- **[GD.docx](./GD.docx)**: Documento oficial generado en Microsoft Word que compila **23 archivos** y **11,812 líneas de código fuente** del Gemelo Digital (tanto el canvas 3D como el motor limnológico en TypeScript y Python), estructurado con tipografía técnica monoespaciada (`Consolas`) y numeración de líneas.

---

## 📝 Cómo Citar este Trabajo (BibTeX)

Si utilizas este gemelo digital o su código en tu investigación, por favor cita el proyecto de la siguiente manera:

```bibtex
@software{solorzano2026aquatwin,
  author       = {Yoel Armando Solorzano Sanchez},
  title        = {AquaTwin HAB: 3D Digital Twin & Scientific Framework for Harmful Algal Bloom Forecasting},
  year         = {2026},
  publisher    = {GitHub},
  journal      = {GitHub repository},
  howpublished = {\url{https://github.com/Sosan10/aquatwin-hab}},
  note         = {Universidad Nacional de Trujillo. Falling Creek Reservoir Dataset Integration}
}
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT** — consulta el archivo [LICENSE](LICENSE) para más detalles.
