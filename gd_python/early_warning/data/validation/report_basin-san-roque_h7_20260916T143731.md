# Informe de validación OAPAT — basin-san-roque · horizonte 7 días

Generado: 2026-09-16T14:37:31.462956+00:00

## Dataset
- Origen: **synthetic** (generador fenomenológico)
- Periodo: 2026-04-20 00:00:00+00:00 → 2026-09-16 00:00:00+00:00 (150 días) · huella `d8bc5883858a2975`
- Histórico SIMULADO por el generador fenomenológico del gemelo (semilla fija). Las métricas describen la capacidad de aprender la dinámica del simulador, no la naturaleza. Para validar la hipótesis con datos reales, defina OAPAT_DATASET_CSV.

## Protocolo
- Origen rodante: entrenamiento mínimo 45 días, paso 10 días, 10 orígenes evaluados.
- Violaciones de fuga temporal detectadas: **0**
- Evento: chlorophyll_a >= 50.0 µg/L en t+H (OMS alerta 2) · tasa base 1.000

## Resultados
| Modelo | F1 | Precisión | Recall | RMSE | MAE | Brier |
|---|---|---|---|---|---|---|
| persistence | 1.000 | 1.000 | 1.000 | 2.49 | 2.11 | — |
| physics_baseline | 1.000 | 1.000 | 1.000 | 2.98 | 2.45 | 0.0079 |
| ml_baseline | 1.000 | 1.000 | 1.000 | 2.66 | 2.31 | 0.0 |
| hybrid_ensemble | 1.000 | 1.000 | 1.000 | 2.65 | 2.21 | 0.0013 |
| climatología | — | — | — | — | — | 0.0 |

Cobertura del intervalo del ensemble: **0.8**

## Hipótesis
- F1 del híbrido: **1.000** (objetivo > 0.8)
- Supera baseline físico: True · supera baseline ML: True · supera persistencia (MAE): False
- ⚠ Tasa de evento 1.00: clases muy desbalanceadas. El F1 no discrimina entre modelos (la persistencia obtiene 1.000); juzgar por MAE, Brier y cobertura.
- **Veredicto:** Hipótesis respaldada sobre este dataset: el ensemble híbrido supera el F1 objetivo y a ambos baselines. AVISO: el dataset es SIMULADO; esto valida el pipeline, no la hipótesis científica.
