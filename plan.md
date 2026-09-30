# Plan de implementación — Orquestador de Asimilación y Alerta Temprana

## 1. Propósito

Incorporar a AquaTwin un módulo de **Orquestación de Asimilación, Pronóstico y Alerta Temprana** para anticipar floraciones de cianobacterias entre 7 y 14 días.

Es una ampliación incremental: **no se reescribe** el frontend, el gemelo 3D ni los módulos actuales. Se añade un servicio analítico y se conectan sus resultados a Dashboard, IA/Alerta temprana, Motor GD, IoT y Reportes.

## 2. Problema científico

**Pregunta:** ¿Se puede anticipar la aparición de floraciones de cianobacterias con 7–14 días de antelación integrando sensores in situ, productos satelitales de color del agua y modelos numéricos?

**Hipótesis:** un gemelo digital híbrido —procesos físicos/ecológicos, observaciones in situ y teledetección— superará modelos sólo físicos o sólo basados en datos, con F1-score objetivo superior a 0.80 para eventos bloom.

**Variables:** clorofila-a, ficocianina, temperatura superficial, pH, oxígeno disuelto, nitrógeno, fósforo, turbidez, viento, radiación solar y precipitación.

**Escala:** lago o embalse de 1–100 km²; resolución horaria/diaria; horizonte de 7 y 14 días.

**Fuentes objetivo:** boyas limnológicas, estaciones meteorológicas, Sentinel-3/OLCI, Copernicus Climate Data Store y modelos hidrodinámico-ecológicos.

## 3. Módulo propuesto

**Nombre:** Orquestador de Asimilación, Pronóstico y Alerta Temprana (OAPAT).

**Responsabilidad:** recibir observaciones, evaluar su calidad, alinearlas en tiempo y espacio, actualizar el estado digital del embalse, solicitar pronósticos especializados, fusionar resultados, estimar incertidumbre, clasificar el riesgo, emitir recomendaciones y dejar una evidencia auditable.

> LangGraph no sustituye el modelo hidrodinámico-ecológico, LSTM ni Transformer. Es la capa de control que coordina datos, modelos, rutas de decisión, persistencia y aprobaciones humanas.

## 4. Alcance

### Incluido

- Grafo LangGraph con estado tipado y rutas condicionales.
- Datos sintéticos compatibles con la UI para el MVP.
- Adaptadores para boya, meteorología, satélite y modelo científico.
- Control de calidad, valores faltantes y desfases temporales.
- Asimilación básica, ensemble e incertidumbre.
- API REST de ejecución, consulta y auditoría.
- Visualización de alerta, incertidumbre, horizonte y explicabilidad.
- Inclusión del resultado en reportes.

### Fuera del MVP

- Entrenamiento de LSTM o Transformer con datos reales.
- Ejecución local de un modelo hidrodinámico de alta fidelidad.
- Ingesta operacional de Sentinel/Copernicus o MQTT real.
- Base de datos productiva, autenticación real y despliegue cloud.
- Accionamiento físico automático sin aprobación humana.

Estas capacidades se habilitarán posteriormente mediante interfaces, sin modificar la estructura del módulo.

## 5. Arquitectura objetivo

```text
Boyas / Meteorología / Sentinel-3 / Modelo numérico
                  │
                  ▼
       Adaptadores de fuentes de datos
                  │
                  ▼
   OAPAT — grafo LangGraph con estado tipado
   ├─ Ingesta y control de calidad
   ├─ Alineación y fusión espaciotemporal
   ├─ Asimilación en estado del gemelo
   ├─ Pronóstico físico/ecológico
   ├─ Pronóstico LSTM/Transformer
   ├─ Ensemble e incertidumbre
   ├─ Clasificación de riesgo
   ├─ Recomendación y aprobación humana
   └─ Persistencia, auditoría y API
                  │
                  ▼
 React: Dashboard / IA / Motor GD / IoT / Reportes
```

### Decisión tecnológica

OAPAT se implementará inicialmente como un servicio **Python + FastAPI + LangGraph** dentro de `gd_python/`. Python permite integrar luego pandas, xarray, PyTorch, herramientas de asimilación y modelos científicos.

React/TypeScript y Express se mantienen como están. La primera integración será HTTP; en fases posteriores podrá utilizar WebSockets, MQTT o colas.

LangGraph encaja porque permite definir el flujo mediante estado, nodos, rutas condicionales y checkpoints. Esto resulta útil para trazabilidad, recuperación de fallos y aprobación humana. La [documentación oficial](https://docs.langchain.com/oss/python/langgraph/use-graph-api) describe `StateGraph`, las ramas condicionales y la ejecución paralela; su [capa de persistencia](https://docs.langchain.com/oss/javascript/langgraph/persistence) permite guardar checkpoints por corrida.

## 6. Estado global del grafo

Cada corrida tendrá `run_id` y `basin_id`. Datos pesados se guardarán fuera del estado y se referenciarán mediante URI o identificador.

```python
class EarlyWarningState(TypedDict):
    run_id: str
    basin_id: str
    requested_at: str
    horizon_days: int
    observations: dict
    quality_report: dict
    assimilation_state: dict
    physics_forecast: dict | None
    ml_forecast: dict | None
    ensemble_forecast: dict | None
    uncertainty: dict
    risk_assessment: dict
    recommendations: list[dict]
    audit_log: list[dict]
    errors: list[dict]
    next_action: str
```

## 7. Nodos y flujo

| Nodo | Responsabilidad | Salida |
|---|---|---|
| `ingest_observations` | Consulta adaptadores de boya, meteorología y satélite. | Observaciones y metadatos. |
| `validate_quality` | Revisa rangos, unidades, faltantes, duplicados y antigüedad. | Informe de calidad. |
| `align_spatiotemporal` | Lleva las fuentes a grilla horaria/diaria común. | Dataset fusionado. |
| `assimilate_state` | Corrige el estado del gemelo con observaciones válidas. | Estado asimilado. |
| `run_physics_model` | Ejecuta o consulta el modelo hidrodinámico-ecológico. | Pronóstico físico. |
| `run_ml_model` | Ejecuta el adaptador LSTM/Transformer. | Pronóstico ML. |
| `build_ensemble` | Fusiona ambos pronósticos. | Pronóstico híbrido. |
| `estimate_uncertainty` | Calcula bandas y confianza. | Intervalos y calidad. |
| `classify_risk` | Determina nivel normal, preventivo, alerta o crítico. | Riesgo y probabilidad. |
| `create_recommendations` | Genera acciones y explicación de factores. | Recomendaciones. |
| `request_human_approval` | Pausa decisiones de alto impacto. | Aprobación/rechazo. |
| `persist_run` | Guarda evidencia, parámetros y versiones. | Corrida auditable. |
| `publish_result` | Entrega payload a API y frontend. | Resultado final. |

```text
START → ingesta → calidad
  ├─ calidad insuficiente → publicar resultado degradado
  └─ calidad aceptable → alinear → asimilar
      ├─ sin modelo físico → pronóstico ML
      └─ con modelo físico → físico + ML en paralelo → ensemble
          → incertidumbre → clasificación de riesgo
              ├─ normal/preventivo → recomendaciones → persistir → publicar
              └─ alerta/crítico → recomendaciones → aprobación humana
                                                 → persistir → publicar
```

## 8. Contratos de datos

### Observación normalizada

```json
{
  "source": "buoy|meteorology|sentinel3|simulation",
  "basinId": "san-roque",
  "timestamp": "2026-09-09T12:00:00Z",
  "location": { "lat": -31.37, "lon": -64.46, "depthM": 0.5 },
  "measurements": { "chlorophyllA": 78.3, "tempSurface": 27.8 },
  "units": { "chlorophyllA": "ug/L", "tempSurface": "C" },
  "quality": { "flag": "good", "confidence": 0.92 }
}
```

### Resultado de alerta

```json
{
  "runId": "uuid",
  "basinId": "san-roque",
  "generatedAt": "ISO-8601",
  "horizonDays": 7,
  "risk": { "level": "ALERT", "bloomProbability": 0.76 },
  "forecast": { "chlorophyllA": 96.2, "microcystin": 12.1 },
  "uncertainty": { "confidence": 0.81, "lower": 76.4, "upper": 116.8 },
  "drivers": ["temperatura", "fósforo", "viento débil"],
  "recommendations": [],
  "dataQuality": "acceptable",
  "modelVersions": { "physics": "mock-v1", "ml": "mock-v1" }
}
```

## 9. Estrategia científica del MVP

### Asimilación

El MVP hará validación, alineación temporal, ponderación por calidad y una corrección explícita del estado simulado con observaciones. No se presentará como un filtro de Kalman completo.

La fase científica posterior evaluará Ensemble Kalman Filter, Particle Filter o técnicas variacionales según el modelo físico disponible y el volumen de datos.

### Ensemble e incertidumbre

Se construirá un ensemble ponderado entre un adaptador físico y uno ML simulados. Los pesos dependerán de calidad de datos y desempeño histórico configurado. La incertidumbre incluirá:

- Dispersión entre miembros del ensemble.
- Penalización por nubes, datos faltantes o sensores desactualizados.
- Intervalos para clorofila-a y probabilidad de bloom.
- Nivel de confianza visible en la interfaz.

En fases posteriores podrán incorporarse ensembles reales, MC Dropout, regresión cuantílica o modelos bayesianos.

## 10. Fases de implementación

### Fase 0 — Decisiones y contratos

- Definir cuenca piloto, frecuencia y horizonte inicial.
- Acordar umbrales de bloom y clasificación de riesgo.
- Normalizar unidades, zona horaria y profundidad.
- Aprobar contratos de observación y alerta.
- Elegir persistencia: archivos locales MVP; PostgreSQL producción.

**Salida:** contratos versionados con JSON de ejemplo validado.

### Fase 1 — Servicio OAPAT y datos simulados

**Estado: completada (MVP local).**

- Crear `gd_python/early_warning/`.
- Añadir FastAPI, Pydantic y LangGraph.
- Crear adaptadores sintéticos de boya, meteorología y satélite.
- Implementar `GET /health`, `POST /runs` y `GET /runs/{run_id}`.
- Definir `EarlyWarningState` y grafo de ingesta, calidad y publicación.
- Añadir pruebas de contrato y datos inválidos.

**Salida:** corrida reproducible a 7 días que devuelve una alerta JSON con datos sintéticos.

### Fase 2 — Calidad, alineación y asimilación básica

**Estado: completada** (`validators.py`, `alignment.py`, `assimilation.py`; ruta condicional a `publish_degraded`).

- Validar límites físicos, unidades, antigüedad, faltantes y duplicados.
- Alinear series a frecuencia horaria/diaria.
- Fusionar fuentes mediante prioridad y calidad.
- Corregir el estado simulado.
- Reportar calidad y degradación de forma explícita.

**Salida:** datos deficientes nunca se presentan como alerta confiable.

### Fase 3 — Pronóstico híbrido, ensemble e incertidumbre

**Estado: completada** (`forecast_models.py`, `ensemble.py`; ramas física y ML en paralelo en `graph.py`).

- Crear interfaces `PhysicsModelAdapter` y `MLModelAdapter`.
- Implementar versiones simuladas deterministas.
- Ejecutar ramas física y ML en paralelo.
- Calcular ensemble ponderado, intervalos y riesgo.
- Registrar parámetros y versiones de modelos.

**Salida:** alerta con probabilidad, horizonte, intervalos, confianza e impulsores.

### Fase 4 — Integración con AquaTwin

**Estado: completada (16/09/2026).** Cliente `src/services/oaaptClient.ts` + proxy `/api/oapat/*` en `server.ts` (mismo origen, sin CORS); panel `OAPATAlertPanel` montado en **IA & Alerta Temprana** y en **Motor GD** (sección 5, con tabla explicada); resultado incluido en PDF, Word, Excel (hoja `Alerta_OAPAT`) y JSON (`oapatEarlyWarning`) vía el almacén `src/services/oaaptStore.ts`. Pendiente opcional: capa en el gemelo 3D.

- Crear cliente HTTP de OAPAT en React.
- Agregar sección “Alerta 7–14 días” a `AIEarlyWarningModule`.
- Mostrar riesgo, calidad, incertidumbre, impulsores y procedencia.
- Añadir panel o capa al Motor GD y gemelo 3D.
- Incluir resultado en Reportes.
- Mantener GPT como explicador conversacional, nunca como fuente numérica del pronóstico.

**Salida:** el usuario ejecuta una corrida y consulta su resultado en interfaz y reporte.

### Fase 5 — Aprobación y trazabilidad

**Estado: completada (16/09/2026).** Nodo `request_human_approval` con `interrupt()` y checkpointer `MemorySaver` en `graph.py`; ruta condicional `route_after_risk` (ALERT/CRITICAL → pausa, `status = pending_approval`). API: `POST /runs/{id}/approval` (RBAC: ADMIN, LIMNOLOGIST, OPERATOR), `GET /runs/{id}/audit`, `POST /runs/{id}/actuator-commands` (solo tras aprobación y con rol ADMIN/OPERATOR; 409/403 en caso contrario). Evidencia persistida en `early_warning/data/audit/<run_id>.json` con usuario, decisión, modelos, calidad de datos y fecha. UI: caja de aprobación, traza de la decisión y comando de actuador condicionado en `OAPATAlertPanel`; decisión incluida en Motor GD e informes. 20 tests (5 nuevos de esta fase).

- Pausar recomendaciones de nivel alto/crítico para aprobación humana.
- Integrar RBAC: sólo perfiles autorizados pueden aprobar acciones.
- Registrar usuario, decisión, modelo, datos y fecha.
- Enviar comandos de actuadores únicamente tras aprobación explícita.

**Salida:** decisiones críticas auditables de punta a punta.

### Fase 6 — Datos reales y validación científica

**Estado: en curso (23/09/2026).** Implementado: adaptadores de fuentes con estado explícito (`sources.py`), modelos entrenados y persistidos (`training.py`), backtesting de origen rodante sin fuga con comparación de baselines (`backtesting.py`), corridas programadas y observabilidad (`scheduler.py`), y los endpoints `/sources`, `/models`, `/models/train`, `/validation/backtest`, `/validation/latest`, `/observability`, `/graph`. En la interfaz: diagrama del grafo LangGraph, tabla de fuentes y tabla de validación, cada una con su ficha.

**Dataset real: LakeBeD-US (Lake Mendota).** Hugging Face `eco-kgml/LakeBeD-US-CSE` (DOI [10.57967/hf/3771](https://doi.org/10.57967/hf/3771)), licencia **CC-BY-4.0**; artículo en *Earth System Science Data* 17, 3141 (2025), DOI [10.5194/essd-17-3141-2025](https://doi.org/10.5194/essd-17-3141-2025). Serie de **343 fechas con clorofila-a medida, 1999–2023**, con fósforo, oxígeno y temperatura; cadencia mediana de **14 días**, que es justo el horizonte que promete el plan. Se importa con `python -m early_warning.import_lakebed <carpeta> -o mendota_oapat.csv`; el CSV vive en `early_warning/data/datasets/` y se activa con `OAPAT_DATASET_CSV`.

> **Dataset descartado, y por qué.** Se evaluó primero el THQBCA de Lago Taihu (Zenodo, CC-BY-4.0, 882 MB). Su artículo anuncia frecuencia «diaria a trimestral», pero al inspeccionarlo: la calidad de agua es **trimestral** (64 observaciones en 16 años), la clorofila-a satelital es **anual** (un ráster por año) y **no hay clorofila-a medida**. Lo diario es el clima. No admite un horizonte de 7–14 días, y forzarlo interpolando habría producido métricas que miden la interpolación, no la capacidad de predecir. Queda como ejemplo de que la cadencia declarada en un resumen debe verificarse contra los archivos.

> **Corrección importante detectada al conectar datos reales:** el emparejamiento origen→objetivo se hacía con `shift(-horizon_days)`, que desplaza **filas, no días**. Con una serie diaria contigua coincide, pero con huecos —que todo dataset real tiene— un horizonte de 7 días se convertía en semanas sin avisar. Ahora se empareja **por fecha** (`merge_asof`, tolerancia ±2 días) y el informe publica el horizonte real medio y los orígenes descartados por falta de objetivo.

**Pendiente:** Sentinel-3/OLCI en vivo (requiere credenciales CDSE; el conector existe y se declara *no verificado*, nunca inventa observaciones).

- Integrar Sentinel-3/OLCI, Copernicus, boyas y meteorología reales.
- Conectar modelos físicos y ML entrenados.
- Programar corridas y observabilidad de errores.
- Aplicar backtesting temporal sin fuga de información.
- Comparar baseline físico, baseline ML y ensemble híbrido.

**Salida:** informe reproducible de desempeño y validación de la hipótesis.

## 11. Métricas

| Dimensión | Métrica | Meta |
|---|---|---|
| Detección de bloom | F1-score | > 0.80 |
| Alertas | Precisión y recall | Matriz de confusión y balance reportados. |
| Variables continuas | RMSE y MAE de clorofila-a | Mejor que baseline elegido. |
| Probabilidad | Brier Score | Comparar contra climatología. |
| Incertidumbre | Cobertura de intervalos | Cercana al nivel nominal. |
| Operación | Latencia de corrida | Definir según fuente y frecuencia. |
| Datos | Porcentaje válido por fuente | Reportar siempre. |

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Nubes o baja frecuencia satelital | Bandera de calidad, ventana temporal y confianza degradada. |
| Sesgo o falla de sensores | Calibración, límites físicos y detección de drift. |
| Pocos datos para ML | Mantener baseline físico y validación temporal estricta. |
| Confundir GPT con evidencia científica | Separar interfaz y datos: GPT explica, los modelos calculan. |
| Recomendación operativa incorrecta | Aprobación humana, RBAC y auditoría. |
| Complejidad prematura | Empezar con simulación y adaptadores intercambiables. |
| Dependencia de fuentes externas | Encapsular cada fuente detrás de un adaptador. |

## 13. Criterios globales de aceptación

1. El grafo se ejecuta de punta a punta con datos sintéticos reproducibles.
2. Toda alerta muestra fuente, calidad, riesgo, horizonte, incertidumbre y versiones de modelo.
3. Datos de mala calidad generan estado degradado y explicación, no falsa certeza.
4. La interfaz distingue claramente pronóstico simulado y real.
5. Acciones críticas requieren aprobación humana.
6. Existen pruebas automáticas de contratos, calidad y rutas condicionales.
7. La ampliación no rompe los módulos existentes de AquaTwin.

## 14. Primer paso

La implementación comenzará por la **Fase 1**. Aún no se conectarán APIs satelitales ni modelos entrenados: primero se construirá el servicio, el grafo y los contratos con datos sintéticos. Así se valida la arquitectura y se muestra una alerta de 7–14 días dentro de AquaTwin antes de añadir dependencias científicas, credenciales o infraestructura externa.

---

## 15. Fase 7 — Dataset definitivo y ciclo CRISP-DM

> **Estado: completada.** Verificada por 61 pruebas en `gd_python/tests/`, `tsc --noEmit` limpio,
> `npm run build` correcto y comprobación en navegador con 0 errores de consola.

### 15.1. Por qué se cambió de cuerpo de agua

El dataset anterior (**Lake Mendota**, LakeBeD-US) cumplía lo esencial pero no todo:

| Requisito | Mendota | Motivo |
|---|---|---|
| Horizonte de 14 días | ✅ | 221 pares válidos |
| Horizonte de **7 días** | ❌ | solo **6 pares válidos**: cadencia quincenal |
| Ficocianina | ❌ | no está en el archivo de baja frecuencia |
| Viento | ❌ | ausente |

Se intentó la vía obvia —calibrar la clorofila de boya de Mendota, publicada en **RFU**, a µg/L
contra el laboratorio— y **no se sostiene**: R² global 0,20, cambio de sensor en 2019 (la escala
pasa de millares a unidades) y, calibrando por año, 10–16 puntos con R² entre 0,02 y 0,81. Usar esa
calibración como variable objetivo habría sido reportar el error de la calibración disfrazado de
capacidad predictiva. **Se descartó.**

### 15.2. Dataset definitivo: Falling Creek Reservoir

`gd_python/early_warning/import_fcr.py` → `data/datasets/fcr_oapat.csv` (**1 960 días, 19 variables**).

- **LakeBeD-US CSE** (`eco-kgml/LakeBeD-US-CSE`), CC-BY-4.0, DOI 10.5194/essd-17-3141-2025.
  Datos del Carey Lab / Virginia Reservoirs LTREB.
- **Open-Meteo Historical** (reanálisis ERA5), CC-BY-4.0, sin credenciales — aporta el viento.

| Requisito | Estado | Evidencia |
|---|---|---|
| Horizonte de 7 días | ✅ | **1 913 pares válidos** (antes 6) |
| Horizonte de 14 días | ✅ | 1 899 pares válidos |
| Ficocianina | ✅ | 1 926 días (98,3 %) |
| Viento | ✅ | 1 960 días (100 %), ERA5 |
| Clorofila en µg/L sin calibrar | ✅ | la sonda ya publica µg/L |
| Es un **embalse** gestionado | ✅ | agua potable, con oxigenación e mezcla — tiene actuadores |
| **Microcistina** | ❌ | no existe serie pública para este embalse |
| **Es San Roque / Titicaca** | ❌ | no se arregla con datos; se declara |

Salvedades que viajan con el dato y se publican en la interfaz:
- La sonda está fija a **1,6 m** y lee **≈7,9 µg/L por debajo** del laboratorio, con r = 0,15
  (n = 130, emparejando a ±3 h y ±0,5 m). Aplicar el umbral de la OMS sobre ella **sub-alerta**.
- El viento es **reanálisis**, no un anemómetro en el embalse.
- Los nutrientes son de laboratorio quincenal interpolado dentro de huecos de 21 días; la fracción
  interpolada (≈86 %) se publica **por variable** en la tabla T1.

### 15.3. Motor CRISP-DM

`gd_python/early_warning/crispdm.py` · API `POST /crispdm/run`, `GET /crispdm/latest` ·
Interfaz: sección 7 del Motor GD (`src/components/gd/CRISPDM.tsx`).

| Fase CRISP-DM | Entregable |
|---|---|
| 1 · Comprensión del negocio | Objetivo, umbral, coste asimétrico del error, tasa de evento |
| 2 · Comprensión de los datos (**EDA**) | **T1** univariante · **T2** correlaciones · **G1** serie · **G2** estacionalidad |
| 3 · Preparación | Ingeniería de rasgos, emparejado por fecha, purga temporal |
| 4 · Modelado (**entrenamiento**, **hiperparámetros**) | **T3** candidatos · **T4** rejilla · **G3** curva de validación |
| 5 · Evaluación (**validación cruzada**, **pruebas estadísticas**) | **T5** pliegues · **T6** contrastes · **G4** error por pliegue · **G5** predicho-observado · **G6** Shapley |
| 6 · Despliegue (**selección del mejor modelo**) | Veredicto, resumen por horizonte y condiciones de uso |

**Decisiones metodológicas que condicionan la lectura:**

1. **Se predice el incremento, no el nivel** (`Δ = chl[t+H] − chl[t]`). Así la persistencia equivale
   a predecir cero y toda mejora es capacidad predictiva, no inercia de una serie autocorrelada.
2. **Validación cruzada de origen móvil con purga** de H muestras: las particiones aleatorias
   mezclarían futuro en el entrenamiento, y sin purga la fuga es silenciosa.
3. **Búsqueda de hiperparámetros anidada**: la rejilla se resuelve *dentro* de cada pliegue externo.
4. **El umbral de decisión es un parámetro**, no la constante de la norma: se calibra maximizando F1
   sobre el entrenamiento de cada pliegue. Sin esto, un regresor encogido hacia la media casi nunca
   avisa (sensibilidad 0,13) y aun así gana en exactitud global.
5. **Contrastes no paramétricos**: Diebold-Mariano con corrección Harvey-Leybourne-Newbold, bootstrap
   estacionario de Politis-Romano, Wilcoxon de rangos con signo, McNemar exacto y permutación del
   objetivo. Los errores de pronóstico no son normales ni independientes.

### 15.4. Interpretabilidad y explicabilidad

Es **estructural, no decorativa**: las 6 tablas y las 6 figuras pasan obligatoriamente por
`<TablaExplicada>` o `<Figura>`, que exigen una `Ficha` con seis campos —qué muestra, cómo leerla,
hallazgo, criterio, procedencia y **limitaciones**—. Una figura sin ficha no compila. El campo
`hallazgo` se calcula en cada render a partir de los datos mostrados: una ficha escrita a mano deja
de ser cierta en cuanto cambia el dataset.

### 15.5. Resultado: hipótesis NO respaldada

| Horizonte | Mejor modelo | MAE | MAE persistencia | Skill | F1 | F1 persistencia |
|---|---|---|---|---|---|---|
| 7 días | Ridge | 4,508 | 4,601 | +2,0 % | 0,400 | **0,479** |
| 14 días | Ridge | 5,583 | 5,949 | +6,2 % | 0,289 | **0,338** |

Ridge reduce algo el error medio, la permutación confirma que **capta señal real** (p < 0,001), pero
ni Diebold-Mariano ni Wilcoxon rechazan, y **la persistencia y la climatología siguen ganando en F1**.
Es un resultado negativo honesto: la clorofila de Falling Creek a 7–14 días está dominada por
reversión a la media, y los episodios son demasiado breves para anticiparlos con estas variables.
**No se ajustó nada hasta que saliera otra cosa.**

### 15.6. Lo que queda fuera y por qué

- **Microcistina**: no hay serie pública para este embalse. No se sustituye por un proxy.
- **San Roque, Titicaca, Paso de las Piedras**: no existe dataset público de esta calidad para ellos.
  Transferir estos resultados exige recalibrar y volver a validar; **no se ha hecho**, y así se
  declara en las condiciones de uso.
- **Sentinel-3/OLCI**: el adaptador existe pero sigue **sin verificar** (requiere credenciales CDSE).
  Devuelve vacío en vez de fabricar índices.
