/**
 * Motor del Gemelo Digital — Índices limnológicos derivados.
 *
 * Cada índice devuelve no solo el valor, sino la fórmula aplicada, la
 * interpretación de ese valor concreto y la referencia bibliográfica.
 * Es interpretabilidad por construcción: el número nunca viaja solo.
 */

import { NivelRiesgo, Observacion, REDFIELD_NP } from './dominio';

export interface ResultadoIndice {
  clave: string;
  nombre: string;
  valor: number;
  unidad: string;
  formula: string;
  categoria: string;
  interpretacion: string;
  referencia: string;
  nivel: NivelRiesgo;
}

/**
 * Índice de Estado Trófico de Carlson a partir de clorofila-a.
 *
 * TSI(Chl) = 9,81 · ln(Chl) + 30,6
 *
 * Se usa la variante de clorofila (y no la de disco de Secchi o fósforo)
 * porque es la que mejor refleja la biomasa realmente presente.
 */
export function tsiCarlson(clorofila: number): ResultadoIndice {
  const chl = Math.max(clorofila, 0.01);
  const valor = 9.81 * Math.log(chl) + 30.6;

  let categoria: string, nivel: NivelRiesgo, extra: string;
  if (valor < 40) {
    categoria = 'Oligotrófico'; nivel = 'BAJO';
    extra = 'Aguas claras, baja productividad. Sin riesgo de floración.';
  } else if (valor < 50) {
    categoria = 'Mesotrófico'; nivel = 'BAJO';
    extra = 'Productividad moderada. Floraciones ocasionales en verano.';
  } else if (valor < 70) {
    categoria = 'Eutrófico'; nivel = 'MODERADO';
    extra = 'Alta productividad. Floraciones probables en condiciones cálidas y estables; conviene vigilancia activa.';
  } else {
    categoria = 'Hipereutrófico'; nivel = 'ALTO';
    extra = 'Productividad extrema. Floraciones frecuentes y persistentes, con riesgo sostenido de cianotoxinas y de anoxia nocturna.';
  }

  return {
    clave: 'tsi',
    nombre: 'Índice de Estado Trófico (TSI de Carlson)',
    valor: Math.round(valor * 10) / 10,
    unidad: 'adimensional (0–100)',
    formula: 'TSI(Chl) = 9,81 · ln(Chl-a) + 30,6',
    categoria,
    interpretacion: `Con ${chl.toFixed(1)} µg/L de clorofila-a el TSI es ${valor.toFixed(1)}, que corresponde a un cuerpo ${categoria.toLowerCase()}. ${extra}`,
    referencia: 'Carlson, R.E. (1977), Limnology and Oceanography 22(2)',
    nivel,
  };
}

/**
 * Relación N:P frente a la proporción de Redfield (16:1).
 *
 * No mide cantidad sino proporción, y esa proporción determina qué grupo algal
 * gana la competencia: por debajo de 16 el nitrógeno limita y las
 * cianobacterias —en especial las fijadoras de N₂— toman ventaja.
 */
export function relacionNP(nitrogeno: number, fosforo: number): ResultadoIndice {
  const p = Math.max(fosforo, 1e-6);
  const ratio = nitrogeno / p;

  let categoria: string, nivel: NivelRiesgo, extra: string;
  if (ratio < 10) {
    categoria = 'Fuerte limitación por nitrógeno'; nivel = 'ALTO';
    extra = 'Proporción muy por debajo de Redfield: ventaja competitiva marcada para cianobacterias fijadoras de nitrógeno. Es una de las condiciones clásicas que preceden a una floración.';
  } else if (ratio < REDFIELD_NP) {
    categoria = 'Limitación por nitrógeno'; nivel = 'MODERADO';
    extra = 'Por debajo de Redfield: las cianobacterias tienen ventaja sobre algas verdes y diatomeas.';
  } else if (ratio < 30) {
    categoria = 'Equilibrada'; nivel = 'BAJO';
    extra = 'Proporción próxima a Redfield; sin ventaja competitiva clara.';
  } else {
    categoria = 'Limitación por fósforo'; nivel = 'BAJO';
    extra = 'El fósforo limita el crecimiento. Es la situación deseable desde la gestión: actuar sobre el fósforo tiene efecto directo.';
  }

  return {
    clave: 'np',
    nombre: 'Relación N:P',
    valor: Math.round(ratio * 10) / 10,
    unidad: 'adimensional',
    formula: 'N:P = Nitrógeno total / Fósforo total (en masa)',
    categoria,
    interpretacion: `Con ${nitrogeno.toFixed(2)} mg/L de N y ${fosforo.toFixed(3)} mg/L de P, la relación es ${ratio.toFixed(1)} frente al valor de Redfield de ${REDFIELD_NP}. ${extra}`,
    referencia: 'Redfield, A.C. (1958); Smith, V.H. (1983) sobre dominancia de cianobacterias',
    nivel,
  };
}

/**
 * Porcentaje de saturación de oxígeno respecto al equilibrio.
 *
 * El dato crudo no basta: 8 mg/L es normal a 25 °C pero indica déficit a 5 °C.
 * Interpretación bidireccional, y esto es clave: tanto el defecto como el
 * exceso son señales de alarma. La sobresaturación diurna delata fotosíntesis
 * desbocada, que es la cara diurna de la misma floración que de madrugada
 * provoca la hipoxia.
 */
export function saturacionOxigeno(od: number, temp: number): ResultadoIndice {
  const odSat = 14.6 - 0.41 * temp + 0.0045 * temp * temp;
  const pct = (od / Math.max(odSat, 0.1)) * 100;

  let categoria: string, nivel: NivelRiesgo, extra: string;
  if (pct < 30) {
    categoria = 'Hipoxia severa'; nivel = 'CRITICO';
    extra = 'Riesgo inmediato de mortandad de peces y liberación de fósforo del sedimento.';
  } else if (pct < 60) {
    categoria = 'Hipoxia'; nivel = 'ALTO';
    extra = 'Déficit marcado. Compatible con respiración nocturna de biomasa densa.';
  } else if (pct <= 110) {
    categoria = 'Normal'; nivel = 'BAJO';
    extra = 'Intercambio atmosférico y actividad biológica en equilibrio.';
  } else if (pct <= 150) {
    categoria = 'Sobresaturación'; nivel = 'MODERADO';
    extra = 'Producción fotosintética por encima del intercambio atmosférico: señal indirecta de floración activa.';
  } else {
    categoria = 'Sobresaturación extrema'; nivel = 'ALTO';
    extra = 'Fotosíntesis muy intensa. Anticipa un déficit acusado durante la noche, cuando cese la producción y solo quede la respiración.';
  }

  return {
    clave: 'odSat',
    nombre: 'Saturación de oxígeno disuelto',
    valor: Math.round(pct * 10) / 10,
    unidad: '% de saturación',
    formula: 'OD% = OD / OD_sat(T) × 100, con OD_sat = 14,6 − 0,41·T + 0,0045·T²',
    categoria,
    interpretacion: `A ${temp.toFixed(1)} °C el equilibrio son ${odSat.toFixed(1)} mg/L. Con ${od.toFixed(1)} mg/L medidos, la saturación es del ${pct.toFixed(0)} %: ${categoria.toLowerCase()}. ${extra}`,
    referencia: 'Aproximación de Weiss (1970); criterio EPA (1986) para vida acuática',
    nivel,
  };
}

/**
 * Índice operativo de estabilidad de la columna de agua.
 *
 * Combina el gradiente térmico (que estratifica) con el viento (que mezcla).
 * Una columna estable permite que las cianobacterias con vesículas de gas
 * floten hasta la superficie y formen nata.
 *
 * No es un número de la literatura: es un indicador compuesto propio de este
 * gemelo, y se declara como tal.
 */
export function estabilidadColumna(viento: number, tempSup: number, tempFondo: number): ResultadoIndice {
  const gradiente = Math.max(0, tempSup - tempFondo);
  const energiaMezcla = (viento * viento) / 100;
  const indice = gradiente / (1 + energiaMezcla);

  let categoria: string, nivel: NivelRiesgo, extra: string;
  if (indice > 3) {
    categoria = 'Muy estable (estratificada)'; nivel = 'ALTO';
    extra = 'Estratificación marcada sin energía de mezcla. Condición idónea para acumulación superficial de cianobacterias.';
  } else if (indice > 1.2) {
    categoria = 'Estable'; nivel = 'MODERADO';
    extra = 'Estratificación moderada; la mezcla no llega a romperla.';
  } else if (indice > 0.4) {
    categoria = 'Débilmente mezclada'; nivel = 'BAJO';
    extra = 'El viento mezcla parcialmente la capa superficial.';
  } else {
    categoria = 'Bien mezclada'; nivel = 'BAJO';
    extra = 'Mezcla vertical activa: la biomasa se dispersa en la columna y no se acumula en superficie.';
  }

  return {
    clave: 'estabilidad',
    nombre: 'Estabilidad de la columna de agua',
    valor: Math.round(indice * 100) / 100,
    unidad: 'adimensional',
    formula: 'E = ΔT / (1 + viento²/100), con ΔT = T_superficie − T_fondo',
    categoria,
    interpretacion: `Gradiente térmico de ${gradiente.toFixed(1)} °C frente a un viento de ${viento.toFixed(1)} km/h → índice ${indice.toFixed(2)}: ${categoria.toLowerCase()}. ${extra}`,
    referencia: 'Indicador compuesto propio, inspirado en el número de Wedderburn',
    nivel,
  };
}

/**
 * NDCI estimado por inversión de la relación empírica con la clorofila-a.
 *
 * Con imágenes reales el NDCI se calcularía de las bandas Sentinel-2 como
 * (B5 − B4)/(B5 + B4). Aquí se recorre el camino inverso para poder mostrar la
 * capa satelital del gemelo. Es una estimación, no una medición.
 */
export function ndciDesdeClorofila(clorofila: number): ResultadoIndice {
  const chl = Math.max(clorofila, 0.01);
  const valor = Math.min(0.85, Math.max(-0.2, (Math.log(chl) - 1.35) / 4.2));

  let categoria: string, nivel: NivelRiesgo;
  if (valor < 0.15) { categoria = 'Sin floración detectable'; nivel = 'BAJO'; }
  else if (valor < 0.35) { categoria = 'Biomasa elevada'; nivel = 'MODERADO'; }
  else { categoria = 'Floración intensa'; nivel = 'ALTO'; }

  return {
    clave: 'ndci',
    nombre: 'NDCI (Normalized Difference Chlorophyll Index)',
    valor: Math.round(valor * 1000) / 1000,
    unidad: 'adimensional (−1 a 1)',
    formula: 'NDCI = (B5 − B4) / (B5 + B4); aquí estimado por inversión desde Chl-a',
    categoria,
    interpretacion: `El NDCI estimado es ${valor.toFixed(3)}, correspondiente a «${categoria.toLowerCase()}». Usa la banda de borde rojo (B5, 705 nm), lo que lo hace apto para aguas continentales turbias donde los índices oceánicos clásicos fallan.`,
    referencia: 'Mishra & Mishra (2012), Remote Sensing of Environment 117',
    nivel,
  };
}

/** Panel completo de índices para una observación. */
export function calcularIndices(o: Observacion): ResultadoIndice[] {
  const tempFondo = o.tempSurface - 4.5 - 0.12 * o.profundidadM;
  return [
    tsiCarlson(o.chlorophyllA),
    relacionNP(o.totalNitrogen, o.totalPhosphorus),
    saturacionOxigeno(o.dissolvedOxygen, o.tempSurface),
    estabilidadColumna(o.windSpeed, o.tempSurface, tempFondo),
    ndciDesdeClorofila(o.chlorophyllA),
  ];
}
