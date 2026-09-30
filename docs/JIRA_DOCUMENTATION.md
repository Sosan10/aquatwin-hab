# AquaTwin HAB — Estructura de Documentación y Gestión de Proyecto (Jira / Confluence)

Este documento contiene la especificación formal del proyecto organizada bajo el estándar de gestión ágil de **Jira** (Epics, Historias de Usuario, Criterios de Aceptación y Tareas de Ingeniería), diseñada para garantizar la trazabilidad y reproducibilidad científica de la plataforma.

---

## 1. Mapa de Epics del Proyecto

| Epic ID | Título del Epic | Área / Subsistema | Responsable | Estado |
|---|---|---|---|---|
| **AQUA-EPIC-01** | Gemelo Digital 3D y Simulación de Floraciones Algales | WebGL / Three.js / Limnología | Frontend & Graphics | `DONE` |
| **AQUA-EPIC-02** | Motor Analítico del Gemelo Digital y Diagnóstico Determinista | Motor GD / TypeScript / Python | Limnology & Analytics | `DONE` |
| **AQUA-EPIC-03** | Ingesta, Calidad y Asimilación de Datos Reales (OAPAT) | Pipeline de Datos / Telemetría | Data Engineering | `DONE` |
| **AQUA-EPIC-04** | Alerta Temprana con IA y Modelos Predictivos de Microcistina | Machine Learning (CNN-LSTM / XGB) | AI Research | `DONE` |
| **AQUA-EPIC-05** | Orquestación LLM y Copiloto Limnológico (Langflow Studio) | Agentes Inteligentes / Langflow | AI Integration | `DONE` |
| **AQUA-EPIC-06** | Reportes Técnicos, Auditoría Científica y Reproducibilidad | Exportación / Documentación | Quality Assurance | `DONE` |

---

## 2. Desglose de Historias de Usuario (User Stories & Tasks)

### Epic: AQUA-EPIC-01 — Gemelo Digital 3D y Simulación de Floraciones Algales

#### Historia: AQUA-101
- **Como:** Investigador o gestor de recursos hídricos.
- **Quiero:** Visualizar en un entorno 3D interactivo la masa de agua del embalse Falling Creek (FCR) con su batimetría y boyas oceanográficas.
- **Para:** Inspeccionar espacialmente las zonas de riesgo de floración y la estratificación térmica.
- **Criterios de Aceptación (Acceptance Criteria):**
  1. Renderizado en Three.js con soporte de rotación orbital, paneo y zoom suave.
  2. Batimetría precisa basada en el perfil morfológico del embalse.
  3. Malla de agua con oleaje superficial reactivo impulsado por brisa local.
  4. 4 modos de cámara preconfigurados: *3D Orbit*, *Cenital*, *Station 20 (Deep Hole)* y *Subacuático*.

#### Historia: AQUA-102
- **Como:** Limnólogo especialista en cianobacterias.
- **Quiero:** Que las manchas de floración algal (*Microcystis aeruginosa*) se rendericen con textura biológica realista, filamentos de nata verde (*scum*) y un enjambre de partículas coloniales.
- **Para:** Evitar representaciones de círculos concéntricos artificiales y poder usar las capturas del gemelo en publicaciones científicas.
- **Criterios de Aceptación:**
  1. Textura procedimental fractal multiharmónica con perturbación que replica manchas biológicas irregulares.
  2. Paleta física limnológica: desde azul petróleo de aguas oligotróficas (`#02384d`) hasta esmeralda, lima y chartreuse de nata hipertrófica (`#eab308`).
  3. Sistema de 2,400 partículas coloniales que flotan en la zona fótica superficial (0 a 0.60 m) con dispersión browniana.
  4. Vectores de corriente hidrodinámica sutiles y translúcidos que no obstruyen la visualización del fitoplancton.

---

### Epic: AQUA-EPIC-02 — Motor Analítico del Gemelo Digital y Diagnóstico Determinista

#### Historia: AQUA-201
- **Como:** Operador de planta de potabilización.
- **Quiero:** Monitorear los índices limnológicos derivados (Índice Carlson TSI, $\Delta T$ de estratificación térmica, relación N:P).
- **Para:** Predecir si el lago se encuentra en mezcla o si la columna de agua está químicamente aislada favoreciendo cianobacterias.
- **Criterios de Aceptación:**
  1. Cálculo de estabilidad térmica según el salto térmico epilimnio-hipolimnio ($\Delta T \ge 1.0^\circ\text{C}$).
  2. Clasificación automática del estado trófico (Oligotrófico, Mesotrófico, Eutrófico, Hipereutrófico).
  3. Panel de explicabilidad paso a paso sin "caja negra".

---

### Epic: AQUA-EPIC-03 — Ingesta, Calidad y Asimilación de Datos Reales (OAPAT)

#### Historia: AQUA-301
- **Como:** Ingeniero de datos.
- **Quiero:** Alimentar el gemelo digital con las series temporales reales del reservorio Falling Creek (`fcr_oapat.csv`).
- **Para:** Asegurar que toda telemetría, gráficos y predicciones provengan de mediciones reales de campo (1,960 observaciones).
- **Criterios de Aceptación:**
  1. Ingesta validada con detección de nulos y control de calidad (QC).
  2. Mapeo de parámetros: Temperatura en superficie y profundidad, Clorofila-a ($\mu\text{g/L}$), Oxígeno Disuelto ($\text{mg/L}$), pH, PAR y Radiación Solar.
  3. Muestra explícita del nombre del dataset activo en los encabezados del sistema.

---

### Epic: AQUA-EPIC-04 — Alerta Temprana con IA y Modelos Predictivos

#### Historia: AQUA-401
- **Como:** Autoridad ambiental.
- **Quiero:** Recibir alertas tempranas con horizontes predictivos a +24h, +48h y +72h sobre la probabilidad de superación del umbral crítico de floración.
- **Para:** Emitir recomendaciones preventivas de restricción recreativa o dosificación de oxidantes en captación.
- **Criterios de Aceptación:**
  1. Ensamble predictivo híbrido (Reglas físicas limnológicas + Modelo estadístico / redes neuronales).
  2. Indicación clara del nivel de riesgo (Bajo / Normal, Vigilancia, Alerta, Emergencia).
  3. Factores causales explicables con su peso relativo de contribución.

---

### Epic: AQUA-EPIC-05 — Orquestación LLM y Copiloto Limnológico

#### Historia: AQUA-501
- **Como:** Investigador o estudiante universitario.
- **Quiero:** Interactuar con un agente inteligente especializado en limnología mediante un lienzo visual Langflow.
- **Para:** Consultar correlaciones complejas y obtener explicaciones fundamentadas en la literatura limnológica sobre el comportamiento del embalse.
- **Criterios de Aceptación:**
  1. Canvas interactivo de nodos de Langflow Studio integrado en la aplicación.
  2. Agente con memoria conversacional y herramientas de consulta al dataset real del embalse.
  3. Capacidad de responder en lenguaje natural fundamentando las conclusiones con datos de las boyas.

---

## 3. Matriz de Trazabilidad de Requerimientos (RTM)

| ID Requerimiento | Archivo Principal | Prueba / Verificación |
|---|---|---|
| REQ-3D-01 (Renderizado Gemelo 3D) | `src/components/DigitalTwin3DCanvas.tsx` | Compilación WebGL en Chrome / Firefox / Edge |
| REQ-3D-02 (Simulación Floración Algal) | `src/components/DigitalTwin3DCanvas.tsx` | Inspección visual de manchas orgánicas y partículas |
| REQ-LIMNO-01 (Motor Gemelo Digital) | `src/components/GDMotorModule.tsx`, `src/gd/` | Tests de reglas deterministas y cálculo TSI |
| REQ-DATA-01 (Dataset Falling Creek) | `src/data/mockData.ts`, `fcr_oapat.csv` | Validación de 1,960 observaciones reales |
| REQ-AI-01 (Alerta Temprana) | `src/components/AIEarlyWarningModule.tsx` | Simulación What-If y curvas ROC en CRISP-DM |
| REQ-DOC-01 (Exportación GD.docx) | `generate_gd_docx.py`, `GD.docx` | Documento Word con 11,812 líneas compiladas |

---

## 4. Instrucciones para Importación en Jira

Para importar este esquema a una instancia de Jira Cloud / Jira Server:
1. Ir a **Jira Settings** > **System** > **External System Import**.
2. Seleccionar formato **CSV / Markdown**.
3. Mapear las columnas: `Epic ID` $\to$ *Epic Link / Parent Link*, `Historia` $\to$ *Summary*, `Criterios de Aceptación` $\to$ *Description / Acceptance Criteria*.
4. Asignar los componentes correspondientes: `3D-Engine`, `Limnology-Core`, `AI-Engine`, `Data-Pipeline`.
