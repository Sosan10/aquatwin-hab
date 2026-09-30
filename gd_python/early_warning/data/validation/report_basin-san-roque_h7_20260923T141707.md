# Informe de validación OAPAT — basin-san-roque · horizonte 7 días

Generado: 2026-09-23T14:17:07.113752+00:00

## Dataset
- Origen: **synthetic** (generador fenomenológico)
- Periodo: 2026-04-27 00:00:00+00:00 → 2026-09-23 00:00:00+00:00 (150 días) · huella `b4054d2525f83310`
- Histórico SIMULADO por el generador fenomenológico del gemelo (semilla fija). Las métricas describen la capacidad de aprender la dinámica del simulador, no la naturaleza. Para validar la hipótesis con datos reales, defina OAPAT_DATASET_CSV.

## Protocolo
- Origen rodante: entrenamiento mínimo 45 días, paso 10 días, 10 orígenes evaluados.
- Violaciones de fuga temporal detectadas: **0**
- Horizonte real medio: 7.0 días (objetivo 7, tolerancia ±2) · orígenes descartados por falta de objetivo: 0
- Evento: chlorophyll_a >= 50 µg/L en t+H (OMS alerta 2) · tasa base 1.000

## Resultados
| Modelo | F1 | Precisión | Recall | RMSE | MAE | Brier |
|---|---|---|---|---|---|---|
| persistence | 1.000 | 1.000 | 1.000 | 2.49 | 2.11 | — |
| physics_baseline | 1.000 | 1.000 | 1.000 | 3.10 | 2.69 | 0.0084 |
| ml_baseline | 1.000 | 1.000 | 1.000 | 2.69 | 2.34 | 0.0 |
| hybrid_ensemble | 1.000 | 1.000 | 1.000 | 2.75 | 2.37 | 0.0014 |
| climatología | — | — | — | — | — | 0.0 |

Cobertura del intervalo del ensemble: **0.8**

## Hipótesis
- F1 del híbrido: **1.000** (objetivo > 0.8)
- Supera baseline físico: True · supera baseline ML: False · supera persistencia (MAE): False
- ⚠ Tasa de evento 1.00: clases muy desbalanceadas. El F1 no discrimina entre modelos (la persistencia obtiene 1.000); juzgar por MAE, Brier y cobertura.
- **Veredicto:** Hipótesis NO respaldada sobre este dataset con la configuración actual. Se reporta tal cual. AVISO: el dataset es SIMULADO; esto valida el pipeline, no la hipótesis científica.
