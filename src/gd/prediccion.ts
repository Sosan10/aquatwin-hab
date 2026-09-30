/**
 * Motor del Gemelo Digital — Pronóstico con explicabilidad exacta.
 *
 * División de responsabilidades, deliberada:
 *
 * - El **motor de reglas** (`reglas.ts`) emite el *nivel de alerta*. Es
 *   determinista, auditable y cita normas. Es lo que se defiende ante un tercero.
 * - Este módulo proyecta el *valor futuro* de la biomasa y **explica cada
 *   predicción**.
 *
 * ## Por qué regresión ridge y no un ensemble de árboles
 *
 * Para un modelo lineal los valores de Shapley tienen **forma cerrada exacta**:
 *
 *     φᵢ = βᵢ · (xᵢ − x̄ᵢ)
 *
 * y su suma es exactamente f(x) − E[f(x)], sin residuo. No hay muestreo ni
 * aproximación: la atribución es matemáticamente exacta, no estimada. Frente a
 * TreeSHAP —que aproxima— esto es una ventaja real, no una limitación.
 *
 * La regularización L2 (ridge) es necesaria porque los predictores están
 * correlacionados entre sí (temperatura instantánea y media de 24 h, por
 * ejemplo); sin ella los coeficientes se vuelven inestables y la explicación
 * deja de ser fiable.
 *
 * ## Por qué predice el incremento y no el nivel
 *
 * Si el objetivo fuese el nivel, el modelo tendría que reconstruir la relación
 * «el valor futuro se parece al actual» y competiría en desventaja con el
 * referente de persistencia, que consiste justamente en ese valor. Al fijar
 * como objetivo la diferencia, la persistencia equivale a predecir cero y el
 * modelo solo aprende la desviación respecto a ella, que es lo que aporta.
 *
 * Las métricas se calculan sobre el **nivel reconstruido** para que la
 * comparación con la persistencia sea justa y directa.
 */

import { Observacion } from './dominio';

export const PREDICTORAS: Record<string, string> = {
  chlorophyllA: 'Clorofila-a actual',
  tempSurface: 'Temperatura superficial',
  solarPAR: 'Radiación PAR',
  windSpeed: 'Velocidad del viento',
  totalPhosphorus: 'Fósforo total',
  totalNitrogen: 'Nitrógeno total',
  ph: 'pH',
  turbidity: 'Turbidez',
  chlLag24: 'Clorofila-a hace 24 h',
  chlTendencia24: 'Tendencia de clorofila (24 h)',
  tempMedia24: 'Temperatura media (24 h)',
  vientoMedio24: 'Viento medio (24 h)',
};

export const CLAVES_PREDICTORAS = Object.keys(PREDICTORAS);

/** Variables sobre las que un gestor puede actuar de verdad. Un contrafactual
 *  sobre la temperatura del agua sería cierto e inútil. */
export const ACCIONABLES: Record<string, string> = {
  totalPhosphorus: 'reducir la carga de fósforo en los afluentes',
  totalNitrogen: 'reducir la carga de nitrógeno',
  windSpeed: 'forzar mezcla artificial (desestratificación mecánica)',
};

interface Muestra {
  x: number[];
  objetivo: number;      // incremento real
  nivelFuturo: number;
  persistencia: number;
  t: number;
  estacion: string;
}

export interface ModeloEntrenado {
  coeficientes: number[];
  intercepto: number;
  mediasX: number[];
  /** Valor base = E[f(x)] sobre el entrenamiento, en µg/L de incremento. */
  valorBase: number;
  test: Muestra[];
  deltaPred: number[];
  nivelPred: number[];
  mae: number;
  maePersistencia: number;
  r2: number;
  mejoraSobrePersistencia: number;
  nEntrenamiento: number;
  nPrueba: number;
  corte: number;
  horizonteHoras: number;
}

/**
 * Construye rezagos y medias móviles. Todas las variables derivadas miran solo
 * hacia atrás: cualquier ventana centrada filtraría información del futuro.
 */
function construirMuestras(filas: Observacion[], horizonte: number): Muestra[] {
  const porEstacion = new Map<string, Observacion[]>();
  filas.forEach((f) => {
    const g = porEstacion.get(f.estacionId) ?? [];
    g.push(f);
    porEstacion.set(f.estacionId, g);
  });

  const muestras: Muestra[] = [];

  porEstacion.forEach((grupo) => {
    grupo.sort((a, b) => a.t - b.t);
    for (let i = 24; i < grupo.length - horizonte; i++) {
      const o = grupo[i];
      const futuro = grupo[i + horizonte];
      const lag = grupo[i - 24];

      let sumT = 0, sumV = 0;
      for (let k = i - 23; k <= i; k++) { sumT += grupo[k].tempSurface; sumV += grupo[k].windSpeed; }

      const derivadas: Record<string, number> = {
        chlLag24: lag.chlorophyllA,
        chlTendencia24: o.chlorophyllA - lag.chlorophyllA,
        tempMedia24: sumT / 24,
        vientoMedio24: sumV / 24,
      };

      const x = CLAVES_PREDICTORAS.map((k) =>
        k in derivadas ? derivadas[k] : (o as unknown as Record<string, number>)[k],
      );
      if (x.some((v) => !Number.isFinite(v)) || !Number.isFinite(futuro.chlorophyllA)) continue;

      muestras.push({
        x,
        objetivo: futuro.chlorophyllA - o.chlorophyllA,
        nivelFuturo: futuro.chlorophyllA,
        persistencia: o.chlorophyllA,
        t: o.t,
        estacion: o.estacion,
      });
    }
  });

  return muestras.sort((a, b) => a.t - b.t);
}

/** Resuelve (AᵀA + λI)β = Aᵀy por eliminación gaussiana con pivoteo parcial. */
function resolverRidge(X: number[][], y: number[], lambda: number): number[] {
  const p = X[0].length;
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p + 1).fill(0));

  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < X.length; k++) s += X[k][i] * X[k][j];
      A[i][j] = s + (i === j ? lambda : 0);
    }
    let s = 0;
    for (let k = 0; k < X.length; k++) s += X[k][i] * y[k];
    A[i][p] = s;
  }

  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-12) continue;
    for (let j = col; j <= p; j++) A[col][j] /= d;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (!f) continue;
      for (let j = col; j <= p; j++) A[r][j] -= f * A[col][j];
    }
  }

  return A.map((fila) => (Number.isFinite(fila[p]) ? fila[p] : 0));
}

/**
 * Entrena con **corte temporal**, nunca con partición aleatoria.
 *
 * Se entrena con el pasado y se evalúa con el futuro, que es la única forma de
 * estimar honestamente cómo se comportará en operación. Barajar una serie
 * temporal deja observaciones posteriores en el entrenamiento y produce
 * métricas optimistas y falsas.
 */
export function entrenar(
  filas: Observacion[],
  horizonteHoras = 24,
  fraccionTrain = 0.75,
  lambda = 1.0,
): ModeloEntrenado | null {
  const muestras = construirMuestras(filas, horizonteHoras);
  if (muestras.length < 80) return null;

  const corteIdx = Math.floor(muestras.length * fraccionTrain);
  const train = muestras.slice(0, corteIdx);
  const test = muestras.slice(corteIdx);
  if (!train.length || !test.length) return null;

  const p = CLAVES_PREDICTORAS.length;

  // Centrado: el intercepto pasa a ser la media del objetivo y los coeficientes
  // quedan en unidades interpretables.
  const mediasX = new Array<number>(p).fill(0);
  train.forEach((m) => m.x.forEach((v, j) => (mediasX[j] += v)));
  mediasX.forEach((_, j) => (mediasX[j] /= train.length));

  const mediaY = train.reduce((s, m) => s + m.objetivo, 0) / train.length;

  const Xc = train.map((m) => m.x.map((v, j) => v - mediasX[j]));
  const yc = train.map((m) => m.objetivo - mediaY);

  const coeficientes = resolverRidge(Xc, yc, lambda);
  const intercepto = mediaY;

  const predecirDelta = (x: number[]) =>
    intercepto + x.reduce((s, v, j) => s + coeficientes[j] * (v - mediasX[j]), 0);

  const deltaPred = test.map((m) => predecirDelta(m.x));
  const nivelPred = test.map((m, i) => m.persistencia + deltaPred[i]);

  const mae = test.reduce((s, m, i) => s + Math.abs(m.nivelFuturo - nivelPred[i]), 0) / test.length;
  const maePersistencia =
    test.reduce((s, m) => s + Math.abs(m.nivelFuturo - m.persistencia), 0) / test.length;

  const mediaReal = test.reduce((s, m) => s + m.nivelFuturo, 0) / test.length;
  const ssTot = test.reduce((s, m) => s + (m.nivelFuturo - mediaReal) ** 2, 0);
  const ssRes = test.reduce((s, m, i) => s + (m.nivelFuturo - nivelPred[i]) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    coeficientes,
    intercepto,
    mediasX,
    valorBase: intercepto, // E[f(x)] = intercepto, porque los predictores están centrados
    test,
    deltaPred,
    nivelPred,
    mae,
    maePersistencia,
    r2,
    mejoraSobrePersistencia:
      maePersistencia > 0 ? Math.round((1 - mae / maePersistencia) * 1000) / 10 : 0,
    nEntrenamiento: train.length,
    nPrueba: test.length,
    corte: test[0].t,
    horizonteHoras,
  };
}

export interface ImportanciaGlobal {
  clave: string;
  variable: string;
  importancia: number;   // media |SHAP|
  efectoMedio: number;   // media con signo
  interpretacion: string;
}

/**
 * Importancia global: media de |φᵢ| sobre el conjunto de prueba.
 * Responde a «¿qué mueve al modelo en general?».
 */
export function importanciaGlobal(m: ModeloEntrenado): ImportanciaGlobal[] {
  const p = CLAVES_PREDICTORAS.length;
  const acumAbs = new Array<number>(p).fill(0);
  const acum = new Array<number>(p).fill(0);

  m.test.forEach((muestra) => {
    for (let j = 0; j < p; j++) {
      const phi = m.coeficientes[j] * (muestra.x[j] - m.mediasX[j]);
      acumAbs[j] += Math.abs(phi);
      acum[j] += phi;
    }
  });

  return CLAVES_PREDICTORAS.map((clave, j) => {
    const importancia = acumAbs[j] / m.test.length;
    const efectoMedio = acum[j] / m.test.length;
    const direccion =
      m.coeficientes[j] > 0
        ? 'valores altos aumentan el crecimiento previsto'
        : 'valores altos reducen el crecimiento previsto';
    return {
      clave,
      variable: PREDICTORAS[clave],
      importancia: Math.round(importancia * 1000) / 1000,
      efectoMedio: Math.round(efectoMedio * 1000) / 1000,
      interpretacion: `Desplaza el pronóstico ${importancia.toFixed(2)} µg/L en promedio; ${direccion}.`,
    };
  }).sort((a, b) => b.importancia - a.importancia);
}

export interface Contribucion {
  clave: string;
  variable: string;
  valorObservado: number;
  shap: number;
  sentido: string;
}

export interface ExplicacionLocal {
  indice: number;
  t: number;
  estacion: string;
  valorBase: number;
  deltaPrevisto: number;
  nivelActual: number;
  nivelPrevisto: number;
  nivelReal: number;
  contribuciones: Contribucion[];
  sumaShap: number;
  narrativa: string;
}

/** Descompone una predicción concreta. La suma de contribuciones iguala
 *  exactamente la diferencia entre el cambio previsto y el cambio base. */
export function explicarPrediccion(m: ModeloEntrenado, indice: number): ExplicacionLocal {
  const i = Math.max(0, Math.min(indice, m.test.length - 1));
  const muestra = m.test[i];

  const contribuciones: Contribucion[] = CLAVES_PREDICTORAS.map((clave, j) => {
    const shap = m.coeficientes[j] * (muestra.x[j] - m.mediasX[j]);
    return {
      clave,
      variable: PREDICTORAS[clave],
      valorObservado: muestra.x[j],
      shap,
      sentido: shap > 0 ? 'Aumenta el riesgo' : 'Reduce el riesgo',
    };
  }).sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));

  const sumaShap = contribuciones.reduce((s, c) => s + c.shap, 0);
  const delta = m.deltaPred[i];
  const nivelPrevisto = m.nivelPred[i];

  const suben = contribuciones.filter((c) => c.shap > 0).slice(0, 3);
  const bajan = contribuciones.filter((c) => c.shap < 0).slice(0, 3);
  const partes: string[] = [
    `El modelo parte de un cambio base de ${m.valorBase >= 0 ? '+' : ''}${m.valorBase.toFixed(2)} µg/L (el incremento medio del entrenamiento) y llega a un cambio previsto de ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} µg/L. Sobre el nivel actual de ${muestra.persistencia.toFixed(1)} µg/L, eso sitúa el pronóstico en ${nivelPrevisto.toFixed(1)} µg/L.`,
  ];
  if (suben.length) {
    partes.push(`Empujan al alza: ${suben.map((c) => `${c.variable} (${c.shap >= 0 ? '+' : ''}${c.shap.toFixed(2)} µg/L)`).join('; ')}.`);
  }
  if (bajan.length) {
    partes.push(`Empujan a la baja: ${bajan.map((c) => `${c.variable} (${c.shap.toFixed(2)} µg/L)`).join('; ')}.`);
  }
  partes.push(`La suma de contribuciones es ${sumaShap >= 0 ? '+' : ''}${sumaShap.toFixed(3)} µg/L, exactamente la diferencia entre el cambio base y el previsto: la explicación no deja residuo sin justificar.`);

  return {
    indice: i,
    t: muestra.t,
    estacion: muestra.estacion,
    valorBase: m.valorBase,
    deltaPrevisto: delta,
    nivelActual: muestra.persistencia,
    nivelPrevisto,
    nivelReal: muestra.nivelFuturo,
    contribuciones,
    sumaShap,
    narrativa: partes.join(' '),
  };
}

export interface Contrafactual {
  clave: string;
  variable: string;
  valorOriginal: number;
  prediccionOriginal: number;
  valorNecesario: number;
  alcanzable: boolean;
  objetivo: number;
  barrido: { x: number; y: number }[];
  mensaje: string;
}

/**
 * Busca el cambio mínimo en una variable accionable que baja la predicción del
 * umbral. Es la forma más accionable de explicabilidad: en lugar de decir «el
 * fósforo influye mucho», responde «con el fósforo bajo 0,18 mg/L la predicción
 * habría quedado bajo el umbral».
 */
export function contrafactual(
  m: ModeloEntrenado,
  indice: number,
  clave: string,
  objetivo = 25,
  pasos = 40,
): Contrafactual {
  const i = Math.max(0, Math.min(indice, m.test.length - 1));
  const j = CLAVES_PREDICTORAS.indexOf(clave);
  const muestra = m.test[i];
  const nivelActual = muestra.persistencia;

  const predecirNivel = (x: number[]) =>
    nivelActual + m.intercepto + x.reduce((s, v, k) => s + m.coeficientes[k] * (v - m.mediasX[k]), 0);

  const valorOriginal = muestra.x[j];
  const prediccionOriginal = predecirNivel(muestra.x);

  const columna = m.test.map((s) => s.x[j]).sort((a, b) => a - b);
  const lo = columna[Math.floor(columna.length * 0.01)];
  const hi = columna[Math.floor(columna.length * 0.99)];

  const barrido: { x: number; y: number }[] = [];
  for (let k = 0; k < pasos; k++) {
    const v = lo + ((hi - lo) * k) / (pasos - 1);
    const x = [...muestra.x];
    x[j] = v;
    barrido.push({ x: v, y: predecirNivel(x) });
  }

  const bajo = barrido.filter((b) => b.y <= objetivo);
  const nombre = PREDICTORAS[clave];

  if (bajo.length) {
    const elegido = bajo.reduce((m2, b) =>
      Math.abs(b.x - valorOriginal) < Math.abs(m2.x - valorOriginal) ? b : m2,
    );
    return {
      clave, variable: nombre, valorOriginal, prediccionOriginal,
      valorNecesario: elegido.x, alcanzable: true, objetivo, barrido,
      mensaje: `Con ${nombre} = ${elegido.x.toFixed(3)} (un cambio de ${(elegido.x - valorOriginal >= 0 ? '+' : '')}${(elegido.x - valorOriginal).toFixed(3)} respecto al valor observado de ${valorOriginal.toFixed(3)}), la predicción bajaría a ${elegido.y.toFixed(1)} µg/L, por debajo del umbral de ${objetivo} µg/L. Acción asociada: ${ACCIONABLES[clave] ?? 'no accionable directamente'}.`,
    };
  }

  return {
    clave, variable: nombre, valorOriginal, prediccionOriginal,
    valorNecesario: NaN, alcanzable: false, objetivo, barrido,
    mensaje: `Ningún valor de ${nombre} dentro del rango histórico observado (${lo.toFixed(3)} – ${hi.toFixed(3)}) consigue por sí solo bajar la predicción de ${objetivo} µg/L. Actuar sobre esta única variable no basta: haría falta una intervención combinada.`,
  };
}
