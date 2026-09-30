# Informe de validación OAPAT — lake-mendota · horizonte 14 días

Generado: 2026-09-23T13:58:28.240440+00:00

## Dataset
- Origen: **csv** (C:\Users\crema\AppData\Local\Temp\claude\c--Users-crema-Downloads-aquatwin-hab---3d-digital-twin\31a148aa-4730-484c-9802-816eac4e7606\scratchpad\lakebed\mendota_oapat.csv)
- Periodo: 1999-08-02 00:00:00+00:00 → 2023-11-15 00:00:00+00:00 (343 días) · huella `382c9529fe3d4621`
- Dataset real cargado desde CSV. Las métricas describen desempeño sobre datos observados.

## Protocolo
- Origen rodante: entrenamiento mínimo 60 días, paso 3 días, 58 orígenes evaluados.
- Violaciones de fuga temporal detectadas: **0**
- Horizonte real medio: 14.09 días (objetivo 14, tolerancia ±2) · orígenes descartados por falta de objetivo: 32
- Evento: chlorophyll_a >= 50.0 µg/L en t+H (OMS alerta 2) · tasa base 0.000

## Resultados
| Modelo | F1 | Precisión | Recall | RMSE | MAE | Brier |
|---|---|---|---|---|---|---|
| persistence | 0.000 | 0.000 | 0.000 | 7.50 | 5.06 | — |
| physics_baseline | 0.000 | 0.000 | 0.000 | 8.97 | 6.56 | 0.0001 |
| ml_baseline | 0.000 | 0.000 | 0.000 | 8.20 | 5.93 | 0.0 |
| hybrid_ensemble | 0.000 | 0.000 | 0.000 | 8.25 | 5.90 | 0.0 |
| climatología | — | — | — | — | — | 0.0 |

Cobertura del intervalo del ensemble: **0.6207**

## Hipótesis
- F1 del híbrido: **0.000** (objetivo > 0.8)
- Supera baseline físico: True · supera baseline ML: True · supera persistencia (MAE): False
- ⚠ Tasa de evento 0.00: clases muy desbalanceadas. El F1 no discrimina entre modelos (la persistencia obtiene 0.000); juzgar por MAE, Brier y cobertura.
- **Veredicto:** Hipótesis NO respaldada sobre este dataset con la configuración actual. Se reporta tal cual.
