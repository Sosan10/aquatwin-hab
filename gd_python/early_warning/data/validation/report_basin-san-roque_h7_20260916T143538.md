# Informe de validación OAPAT — basin-san-roque · horizonte 7 días

Generado: 2026-09-16T14:35:38.480963+00:00

## Dataset
- Origen: **synthetic** (generador fenomenológico)
- Periodo: 2026-01-20 00:00:00+00:00 → 2026-09-16 00:00:00+00:00 (240 días) · huella `8120c976b029fbf9`
- Histórico SIMULADO por el generador fenomenológico del gemelo (semilla fija). Las métricas describen la capacidad de aprender la dinámica del simulador, no la naturaleza. Para validar la hipótesis con datos reales, defina OAPAT_DATASET_CSV.

## Protocolo
- Origen rodante: entrenamiento mínimo 60 días, paso 6 días, 29 orígenes evaluados.
- Violaciones de fuga temporal detectadas: **0**
- Evento: chlorophyll_a >= 50.0 µg/L en t+H (OMS alerta 2) · tasa base 0.931

## Resultados
| Modelo | F1 | Precisión | Recall | RMSE | MAE | Brier |
|---|---|---|---|---|---|---|
| persistence | 0.982 | 0.964 | 1.000 | 3.02 | 2.10 | — |
| physics_baseline | 0.964 | 0.931 | 1.000 | 3.16 | 2.55 | 0.0537 |
| ml_baseline | 0.981 | 1.000 | 0.963 | 2.98 | 2.40 | 0.0511 |
| hybrid_ensemble | 0.981 | 1.000 | 0.963 | 2.55 | 1.97 | 0.0428 |
| climatología | — | — | — | — | — | 0.0642 |

Cobertura del intervalo del ensemble: **0.8621**

## Hipótesis
- F1 del híbrido: **0.981** (objetivo > 0.8)
- Supera baseline físico: True · supera baseline ML: True · supera persistencia (MAE): True
- ⚠ Tasa de evento 0.93: clases muy desbalanceadas. El F1 no discrimina entre modelos (la persistencia obtiene 0.982); juzgar por MAE, Brier y cobertura.
- **Veredicto:** Hipótesis respaldada sobre este dataset: el ensemble híbrido supera el F1 objetivo y a ambos baselines. AVISO: el dataset es SIMULADO; esto valida el pipeline, no la hipótesis científica.
