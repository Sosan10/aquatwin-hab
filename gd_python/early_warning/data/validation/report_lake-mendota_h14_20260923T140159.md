# Informe de validación OAPAT — lake-mendota · horizonte 14 días

Generado: 2026-09-23T14:01:59.886194+00:00

## Dataset
- Origen: **csv** (C:\Users\crema\Downloads\aquatwin-hab---3d-digital-twin\gd_python\early_warning\data\datasets\mendota_oapat.csv)
- Periodo: 1999-08-02 00:00:00+00:00 → 2023-11-15 00:00:00+00:00 (343 días) · huella `c337d93b77235116`
- Dataset real cargado desde CSV. Las métricas describen desempeño sobre datos observados.

## Protocolo
- Origen rodante: entrenamiento mínimo 60 días, paso 4 días, 43 orígenes evaluados.
- Violaciones de fuga temporal detectadas: **0**
- Horizonte real medio: 14.0 días (objetivo 14, tolerancia ±2) · orígenes descartados por falta de objetivo: 25
- Evento: chlorophyll_a >= 25 µg/L en t+H (OMS alerta 1) · tasa base 0.023

## Resultados
| Modelo | F1 | Precisión | Recall | RMSE | MAE | Brier |
|---|---|---|---|---|---|---|
| persistence | 0.000 | 0.000 | 0.000 | 8.26 | 5.70 | — |
| physics_baseline | 0.000 | 0.000 | 0.000 | 7.51 | 5.18 | 0.0328 |
| ml_baseline | 0.000 | 0.000 | 0.000 | 6.57 | 4.76 | 0.0257 |
| hybrid_ensemble | 0.000 | 0.000 | 0.000 | 6.66 | 4.40 | 0.0268 |
| climatología | — | — | — | — | — | 0.0227 |

Cobertura del intervalo del ensemble: **0.6744**

## Hipótesis
- F1 del híbrido: **0.000** (objetivo > 0.8)
- Supera baseline físico: True · supera baseline ML: True · supera persistencia (MAE): True
- ⚠ Tasa de evento 0.02: clases muy desbalanceadas. El F1 no discrimina entre modelos (la persistencia obtiene 0.000); juzgar por MAE, Brier y cobertura.
- **Veredicto:** Hipótesis NO respaldada sobre este dataset con la configuración actual. Se reporta tal cual.
