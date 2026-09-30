# Informe de validación OAPAT — lake-mendota · horizonte 14 días

Generado: 2026-09-23T13:59:18.605824+00:00

## Dataset
- Origen: **csv** (C:\Users\crema\AppData\Local\Temp\claude\c--Users-crema-Downloads-aquatwin-hab---3d-digital-twin\31a148aa-4730-484c-9802-816eac4e7606\scratchpad\lakebed\mendota_oapat.csv)
- Periodo: 1999-08-02 00:00:00+00:00 → 2023-11-15 00:00:00+00:00 (343 días) · huella `c337d93b77235116`
- Dataset real cargado desde CSV. Las métricas describen desempeño sobre datos observados.

## Protocolo
- Origen rodante: entrenamiento mínimo 60 días, paso 2 días, 89 orígenes evaluados.
- Violaciones de fuga temporal detectadas: **0**
- Horizonte real medio: 14.07 días (objetivo 14, tolerancia ±2) · orígenes descartados por falta de objetivo: 46
- Evento: chlorophyll_a >= 25 µg/L en t+H (OMS alerta 1) · tasa base 0.056

## Resultados
| Modelo | F1 | Precisión | Recall | RMSE | MAE | Brier |
|---|---|---|---|---|---|---|
| persistence | 0.000 | 0.000 | 0.000 | 8.33 | 5.64 | — |
| physics_baseline | 0.000 | 0.000 | 0.000 | 7.93 | 5.73 | 0.0568 |
| ml_baseline | 0.000 | 0.000 | 0.000 | 6.92 | 5.13 | 0.0548 |
| hybrid_ensemble | 0.000 | 0.000 | 0.000 | 7.05 | 4.95 | 0.0533 |
| climatología | — | — | — | — | — | 0.053 |

Cobertura del intervalo del ensemble: **0.618**

## Hipótesis
- F1 del híbrido: **0.000** (objetivo > 0.8)
- Supera baseline físico: True · supera baseline ML: True · supera persistencia (MAE): True
- ⚠ Tasa de evento 0.06: clases muy desbalanceadas. El F1 no discrimina entre modelos (la persistencia obtiene 0.000); juzgar por MAE, Brier y cobertura.
- **Veredicto:** Hipótesis NO respaldada sobre este dataset con la configuración actual. Se reporta tal cual.
