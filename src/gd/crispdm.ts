/**
 * Contrato del informe CRISP-DM que produce `gd_python/early_warning/crispdm.py`.
 *
 * Los tipos reflejan el JSON del motor campo por campo. Si el motor cambia una
 * clave y aquí no, TypeScript lo señala al compilar en vez de dejar la interfaz
 * pintando `undefined` en una tabla, que es la forma más silenciosa de mentir
 * en un informe.
 *
 * Nomenclatura de las tablas y figuras: T1–T6 y G1–G6, la misma que usa el
 * motor, para que un número de la pantalla se pueda rastrear hasta la función
 * de Python que lo calculó.
 */

// ---------------------------------------------------------------------------
// Fase 2 — Comprensión de los datos
// ---------------------------------------------------------------------------

/** T1 — Una fila por variable del dataset. */
export interface FilaUnivariante {
  variable: string;
  unidad: string;
  n: number;
  cobertura_pct: number;
  /** Porcentaje del dato que NO se midió, sino que se rellenó por interpolación. */
  interpolado_pct: number;
  minimo: number;
  mediana: number;
  maximo: number;
  iqr: number;
  asimetria: number;
  atipicos: number;
  atipicos_pct: number;
  tendencia: string;
  mk_tau: number | null;
  mk_p: number | null;
}

/** T2 — Relación de cada rasgo con el incremento de clorofila a H días. */
export interface FilaCorrelacion {
  rasgo: string;
  n: number;
  pearson_r: number;
  pearson_p: number;
  spearman_rho: number;
  spearman_p: number;
  significativo: boolean;
  /** Spearman claramente mayor que Pearson ⇒ relación monótona pero no lineal. */
  no_lineal: boolean;
}

/** G1 — Serie de clorofila con los dos umbrales de la OMS. */
export interface GraficoSerie {
  puntos: { t: number; valor: number }[];
  umbral_1: number;
  umbral_2: number;
  /** Se dibuja 1 de cada `submuestreo` puntos, por legibilidad. */
  submuestreo: number;
  /** Recuentos sobre la serie COMPLETA, no sobre los puntos dibujados. */
  total_dias: number;
  dias_sobre_1: number;
  dias_sobre_2: number;
  maximo: number;
}

/** G2 — Distribución mensual + contraste de Kruskal-Wallis. */
export interface GraficoEstacionalidad {
  cajas: {
    mes: number;
    n: number;
    min: number;
    q1: number;
    mediana: number;
    q3: number;
    max: number;
    sobre_umbral_pct: number;
  }[];
  kruskal_wallis: { estadistico: number | null; p_valor: number | null; veredicto: string };
  umbral: number;
}

// ---------------------------------------------------------------------------
// Fase 3 — Preparación
// ---------------------------------------------------------------------------

export interface Preparacion {
  horizonte_dias: number;
  muestras: number;
  rasgos: number;
  lista_rasgos: string[];
  objetivo: string;
  por_que_incremento: string;
  emparejado: string;
  purga_dias: number;
  control_fuga: string;
  rango: [string, string];
}

// ---------------------------------------------------------------------------
// Fase 4 — Modelado
// ---------------------------------------------------------------------------

/** T3 — Un candidato por fila, con error y calidad de alerta a la vez. */
export interface FilaModelo {
  modelo: string;
  familia: string;
  interpretable: boolean;
  mae: number;
  rmse: number;
  r2: number | null;
  sesgo: number;
  /** Con el umbral de decisión calibrado en entrenamiento. */
  sensibilidad: number | null;
  especificidad: number | null;
  f1: number;
  falsos_negativos: number;
  falsas_alarmas: number;
  eventos_reales: number;
  /** Con el umbral físico de la OMS aplicado a la predicción puntual. */
  f1_umbral_fisico: number;
  sensibilidad_umbral_fisico: number | null;
  umbrales_calibrados: number[];
  skill_vs_persistencia_pct: number | null;
  nota: string;
  n_evaluacion: number;
}

/** T4 — Una combinación de hiperparámetros por fila. */
export interface FilaHiperparametro {
  modelo: string;
  /** JSON de los parámetros, tal como los evaluó el motor. */
  parametros: string;
  mae_cv_medio: number;
  mae_cv_desv: number;
  pliegues: number;
  /** En cuántos pliegues externos resultó elegida esta combinación. */
  elegido_en_pliegues: number;
  es_mejor: boolean;
}

/** G3 — Curva de validación del modelo ganador sobre su hiperparámetro clave. */
export interface GraficoCurvaValidacion {
  modelo: string;
  hiperparametro: string;
  puntos: { x: string; mae: number; desv: number }[];
}

// ---------------------------------------------------------------------------
// Fase 5 — Evaluación
// ---------------------------------------------------------------------------

/** T5 — Un pliegue de la validación cruzada de origen móvil por fila. */
export interface FilaPliegue {
  pliegue: number;
  train_desde: string;
  train_hasta: string;
  test_desde: string;
  test_hasta: string;
  n_train: number;
  n_test: number;
  modelos: Record<string, number>;
  ganador: string;
}

/** T6 — Una prueba estadística por fila. */
export interface FilaPrueba {
  prueba: string;
  compara: string;
  hipotesis_nula: string;
  estadistico: number | null;
  p_valor: number | null;
  ic95?: [number, number] | null;
  n: number | null;
  veredicto: string;
  por_que: string;
  /** Presente cuando la prueba se puede malinterpretar por sí sola. */
  cautela?: string;
}

export interface GraficoPliegues {
  pliegues: { pliegue: number; test_desde: string; n_test: number; valores: Record<string, number> }[];
  modelos: string[];
}

export interface GraficoDispersion {
  modelo: string;
  puntos: { obs: number; pred: number }[];
  umbral: number;
  mae: number;
  submuestreo: number;
}

export interface GraficoShapley {
  modelo_local: string;
  modelo_global: string;
  fecha_caso: string;
  base: number;
  contribuciones: { rasgo: string; contribucion: number; valor: number }[];
  prediccion: number;
  observado: number;
  chl_actual: number;
  nota_exactitud: string;
  importancia_global: { rasgo: string; aumento_mae: number; desv: number }[];
}

export interface EvaluacionFinal {
  desde: string;
  hasta: string;
  n: number;
  modelo: string;
  mae: number;
  rmse: number;
  sesgo: number;
  mae_persistencia: number;
  skill_pct: number | null;
  f1: number;
  f1_persistencia: number;
  sensibilidad: number | null;
  especificidad: number | null;
  umbral_calibrado: number;
}

// ---------------------------------------------------------------------------
// Informe completo
// ---------------------------------------------------------------------------

export interface CicloHorizonte {
  horizonte: number;
  preparacion: Preparacion;
  t2_correlaciones: FilaCorrelacion[];
  t3_modelos: FilaModelo[];
  t4_hiperparametros: FilaHiperparametro[];
  t5_validacion_cruzada: FilaPliegue[];
  t6_pruebas: FilaPrueba[];
  g3_curva_validacion: GraficoCurvaValidacion;
  g4_pliegues: GraficoPliegues;
  g5_dispersion: GraficoDispersion;
  g6_shapley: GraficoShapley;
  mejor_modelo: string;
  mae_mejor: number;
  mae_persistencia: number;
  skill_pct: number | null;
  evaluacion_final: EvaluacionFinal;
}

export interface FilaDespliegue {
  horizonte: number;
  modelo: string;
  mae: number;
  mae_persistencia: number;
  skill_pct: number | null;
  f1: number | null;
  f1_persistencia: number | null;
  sensibilidad: number | null;
  especificidad: number | null;
  p_diebold_mariano: number | null;
  p_mcnemar: number | null;
  p_permutacion: number | null;
  significativo_error: boolean;
  significativo_alerta: boolean;
  significativo: boolean;
}

export interface InformeCRISPDM {
  generado: string;
  metodologia: string;
  dataset: {
    origen: string;
    ruta: string | null;
    filas: number;
    inicio: string;
    fin: string;
    huella: string;
    nota: string;
    embalse?: string;
    coordenadas?: [number, number];
    fuente_agua?: string;
    fuente_meteo?: string;
    advertencia?: string;
    sesgo_sonda_vs_laboratorio_ugl?: number;
    correlacion_sonda_laboratorio_r?: number;
    interpolacion?: { limite_dias: number; fraccion_interpolada: Record<string, number> };
  };
  umbral_evento: number;
  fase_1_negocio: {
    objetivo: string;
    criterio_exito: string;
    umbral: number;
    norma: string;
    coste_asimetrico: string;
    eventos_historicos: number;
    tasa_evento_pct: number;
  };
  fase_2_datos: {
    t1_univariante: FilaUnivariante[];
    t2_correlaciones: FilaCorrelacion[];
    g1_serie: GraficoSerie;
    g2_estacionalidad: GraficoEstacionalidad;
  };
  fase_3_preparacion: Preparacion;
  fase_4_modelado: {
    t3_modelos: FilaModelo[];
    t4_hiperparametros: FilaHiperparametro[];
    g3_curva_validacion: GraficoCurvaValidacion;
  };
  fase_5_evaluacion: {
    t5_validacion_cruzada: FilaPliegue[];
    t6_pruebas: FilaPrueba[];
    g4_pliegues: GraficoPliegues;
    g5_dispersion: GraficoDispersion;
    g6_shapley: GraficoShapley;
  };
  fase_6_despliegue: {
    resumen: FilaDespliegue[];
    veredicto: string;
    lectura_doble: string;
    condiciones_de_uso: string[];
  };
  horizontes: Record<string, CicloHorizonte>;
  ruta_informe?: string;
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

const BASE = '/api/oapat';

/** Informe cacheado. `null` cuando aún no se ha generado ninguno (404). */
export async function getInformeCRISPDM(): Promise<InformeCRISPDM | null> {
  const r = await fetch(`${BASE}/crispdm/latest`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`CRISP-DM ${r.status}: ${await r.text()}`);
  return r.json();
}

/**
 * Regenera el informe. Tarda del orden de minutos: la validación cruzada es
 * anidada y el bootstrap hace 2000 réplicas. Quien llame debe dejarlo claro en
 * la interfaz en vez de dar la impresión de que se ha colgado.
 */
export async function ejecutarCRISPDM(
  basinId = 'fcr',
  horizontes: number[] = [7, 14],
): Promise<InformeCRISPDM> {
  const r = await fetch(`${BASE}/crispdm/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ basin_id: basinId, horizontes }),
  });
  if (!r.ok) throw new Error(`CRISP-DM ${r.status}: ${await r.text()}`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Utilidades de presentación
// ---------------------------------------------------------------------------

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Formato de p-valor legible: por debajo de 0,001 se marca como tal. */
export function fmtP(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—';
  if (p < 0.001) return '< 0,001';
  return p.toLocaleString('es-ES', { maximumFractionDigits: 3 });
}

/** Un p-valor solo es "significativo" respecto a un nivel declarado. */
export const ALFA = 0.05;
export const esSignificativo = (p: number | null | undefined): boolean =>
  p !== null && p !== undefined && p < ALFA;
