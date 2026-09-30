# OAPAT — Orquestador de Asimilación, Pronóstico y Alerta Temprana

Servicio LangGraph + FastAPI. Estado: **Fases 1–5 completadas** (ver `plan.md` en la raíz del proyecto, sección 10).

Flujo del grafo (`graph.py`):

    START → ingest → validate_quality
      ├─ insuficiente → publish_degraded → END
      └─ aceptable → align → assimilate → [física ∥ ML] → ensemble
                     → uncertainty → classify_risk
                         ├─ normal/preventivo → publish_result → END
                         └─ alerta/crítico → request_human_approval (interrupt)
                                             → publish_result → END

## Aprobación humana y trazabilidad (Fase 5)

- Riesgo ALERT/CRITICAL deja la corrida en `pending_approval` (grafo pausado con `interrupt()` + `MemorySaver`).
- `POST /runs/{id}/approval` — `{user_id, user_name, user_role, decision: approved|rejected, comment}`. Roles autorizados: ADMIN, LIMNOLOGIST, OPERATOR (403 en otro caso; 409 si no está pendiente).
- `GET /runs/{id}/audit` — decisión, usuario, modelos, calidad de datos, comandos y `audit_log`.
- `POST /runs/{id}/actuator-commands` — solo tras aprobación (409) y con rol ADMIN u OPERATOR (403). Simulado; cada intento queda en la auditoría.
- Evidencia persistida en `early_warning/data/audit/<run_id>.json`.

Usa datos y modelos **sintéticos**. No hay satélite real, modelos entrenados ni validación científica (Fase 6).

## Ejecución

    cd gd_python
    .venv\Scripts\python.exe -m pip install -r requirements.txt
    .venv\Scripts\python.exe -m uvicorn early_warning.api:app --reload --port 8001

- Estado: `GET http://localhost:8001/health`
- Crear corrida: `POST http://localhost:8001/runs` con `{"basin_id": "...", "horizon_days": 7}`
- Consultar corrida: `GET http://localhost:8001/runs/{run_id}`

Tests: `.venv\Scripts\python.exe -m pytest tests -q`

## Integración con la interfaz (Fase 4)

La app React (`npm run dev`, puerto 3000) llama al servicio por la ruta relativa `/api/oapat/*`; `server.ts` la reenvía a `OAPAT_URL` (por defecto `http://127.0.0.1:8001`). Así todo va por el mismo origen y no hace falta CORS.

- Panel: pestañas **IA & Alerta Temprana** y **Motor GD & Explicabilidad** (sección 5).
- Informes: la última corrida se añade a PDF/Word (sección 4), Excel (hoja `Alerta_OAPAT`) y JSON (`oapatEarlyWarning`).
- Estado compartido: `src/services/oaaptStore.ts`.

Si el servicio no está en marcha, el proxy responde `503` con el comando para arrancarlo.

## Dataset real (Fase 6)

**Lago Taihu — THQBCA v1**, Zenodo DOI [10.5281/zenodo.11044483](https://doi.org/10.5281/zenodo.11044483),
licencia **CC-BY-4.0**. Artículo: *A comprehensive time-series dataset linked to cyanobacterial
blooms in Lake Taihu*, Scientific Data 11, 1365 (2024), DOI 10.1038/s41597-024-04224-w.

Cítalo si publicas resultados obtenidos con él.

### Importar y activar

```powershell
# 1. Descargar THQBCA-V1.rar desde Zenodo y extraerlo
# 2. Convertirlo al contrato del proyecto
.venv\Scripts\python.exe -m early_warning.import_taihu <carpeta_extraida> -o taihu_oapat.csv

# 3. Activarlo (misma terminal donde arrancas el servicio)
$env:OAPAT_DATASET_CSV = "<ruta absoluta>\taihu_oapat.csv"
.venv\Scripts\python.exe -m uvicorn early_warning.api:app --port 8001
```

Con la variable definida, `datasets.load_history` deja de generar la serie simulada y lee el CSV;
`/models/train` y `/validation/backtest` pasan a trabajar con datos reales, y el informe de
validación lo declara (`dataset.source = "csv"`) con la huella del archivo.

### Contrato del CSV

Obligatorias: `timestamp` (con zona horaria) y `chlorophyll_a` (µg/L).
Opcionales, en las unidades del catálogo: `temp_surface` (°C), `total_phosphorus` (mg/L),
`total_nitrogen` (mg/L), `wind_speed` (km/h), `dissolved_oxygen` (mg/L), `microcystin` (µg/L),
`solar_par`, `ph`, `turbidity`. Se admiten alias frecuentes (`chl_a`, `TP`, `TN`, `WT`, `DO`…).
Lo que falte se deja vacío y el control de calidad lo trata como ausente: no se rellena.

### Emparejamiento por fecha

El objetivo de entrenamiento y de backtesting se busca **por calendario** (`origen + horizonte`,
tolerancia ±2 días), no avanzando filas. Con datos irregulares, avanzar filas convertiría un
horizonte de 7 días en semanas sin avisar. Los orígenes sin objetivo dentro de la tolerancia se
descartan y se reportan en `protocol.origins_discarded_no_target`.
