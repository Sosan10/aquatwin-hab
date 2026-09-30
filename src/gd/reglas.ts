/**
 * Motor del Gemelo Digital — Diagnóstico limnológico determinista.
 *
 * Por qué reglas y no un modelo de caja negra para emitir el nivel de alerta:
 *
 * - **Reproducible** — la misma entrada da siempre la misma salida, y eso se
 *   puede auditar.
 * - **Explicable sin post-proceso** — la explicación *es* la regla disparada,
 *   no una aproximación calculada a posteriori.
 * - **Defendible ante un tercero** — cada umbral cita su norma (OMS, EPA, OCDE).
 * - **No alucina** — a diferencia de un modelo generativo.
 *
 * El modelo de aprendizaje (`prediccion.ts`) tiene otro papel: proyectar el
 * valor futuro de la biomasa. La *alerta* la emite este motor.
 */

import {
  NivelRiesgo,
  OMS_MICROCISTINA_POTABLE,
  OMS_MICROCISTINA_RECREATIVA,
  ORDEN_RIESGO,
  Observacion,
} from './dominio';
import { relacionNP } from './indices';

export interface Evaluacion {
  reglaId: string;
  nombre: string;
  disparada: boolean;
  valorObservado: number;
  umbral: number;
  unidad: string;
  nivel: NivelRiesgo;
  peso: number;
  explicacion: string;
  referencia: string;
  /** Peso × severidad; 0 si la regla no se disparó. */
  contribucion: number;
}

interface DefinicionRegla {
  id: string;
  nombre: string;
  unidad: string;
  peso: number;
  referencia: string;
  evaluar: (o: Observacion) => {
    disparada: boolean;
    valor: number;
    umbral: number;
    nivel: NivelRiesgo;
    explicacion: string;
  };
}

const nf = (x: number) => x.toLocaleString('es-ES', { maximumFractionDigits: 0 });

export const REGLAS: DefinicionRegla[] = [
  {
    id: 'R1',
    nombre: 'Biomasa fitoplanctónica (clorofila-a)',
    unidad: 'µg/L',
    peso: 1.0,
    referencia: 'OMS (2003), guías para aguas recreativas — alertas 1 y 2',
    evaluar: (o) => {
      const v = o.chlorophyllA;
      if (v >= 50) return { disparada: true, valor: v, umbral: 50, nivel: 'CRITICO',
        explicacion: `La clorofila-a es de ${v.toFixed(1)} µg/L, por encima del umbral de alerta 2 de la OMS (50 µg/L). Indica biomasa muy elevada, compatible con floración establecida.` };
      if (v >= 25) return { disparada: true, valor: v, umbral: 25, nivel: 'MODERADO',
        explicacion: `La clorofila-a es de ${v.toFixed(1)} µg/L, por encima del umbral de alerta 1 de la OMS (25 µg/L). Biomasa elevada que exige vigilancia.` };
      return { disparada: false, valor: v, umbral: 25, nivel: 'BAJO',
        explicacion: `Clorofila-a de ${v.toFixed(1)} µg/L, por debajo del umbral de atención de 25 µg/L.` };
    },
  },
  {
    id: 'R2',
    nombre: 'Densidad de cianobacterias (ficocianina)',
    unidad: 'células/mL',
    peso: 1.4,
    referencia: 'OMS (2003), umbrales de densidad celular',
    evaluar: (o) => {
      const v = o.phycocyanin;
      if (v >= 100000) return { disparada: true, valor: v, umbral: 100000, nivel: 'CRITICO',
        explicacion: `La densidad estimada por ficocianina es de ${nf(v)} células/mL, sobre el umbral de 100.000 que la OMS asocia a riesgo sanitario alto en aguas recreativas.` };
      if (v >= 20000) return { disparada: true, valor: v, umbral: 20000, nivel: 'ALTO',
        explicacion: `Ficocianina de ${nf(v)} células/mL, sobre el umbral de vigilancia de 20.000. A diferencia de la clorofila-a, esta señal es específica de cianobacterias, así que implica riesgo de toxinas.` };
      return { disparada: false, valor: v, umbral: 20000, nivel: 'BAJO',
        explicacion: `Ficocianina de ${nf(v)} células/mL, por debajo del umbral de vigilancia.` };
    },
  },
  {
    id: 'R3',
    nombre: 'Ventana térmica de proliferación',
    unidad: '°C',
    peso: 0.9,
    referencia: 'Paerl & Huisman (2008)',
    evaluar: (o) => {
      const v = o.tempSurface;
      if (v >= 28) return { disparada: true, valor: v, umbral: 28, nivel: 'ALTO',
        explicacion: `Temperatura superficial de ${v.toFixed(1)} °C, dentro del óptimo térmico de Microcystis (25–32 °C). Maximiza su tasa de división celular.` };
      if (v >= 24) return { disparada: true, valor: v, umbral: 24, nivel: 'MODERADO',
        explicacion: `Temperatura de ${v.toFixed(1)} °C, por encima de los 24 °C a partir de los cuales las cianobacterias desplazan competitivamente a diatomeas y clorofitas.` };
      return { disparada: false, valor: v, umbral: 24, nivel: 'BAJO',
        explicacion: `Temperatura de ${v.toFixed(1)} °C, por debajo del umbral de ventaja competitiva.` };
    },
  },
  {
    id: 'R4',
    nombre: 'Déficit de oxígeno disuelto',
    unidad: 'mg/L',
    peso: 1.2,
    referencia: 'EPA (1986), criterio para vida acuática',
    evaluar: (o) => {
      const v = o.dissolvedOxygen;
      if (v <= 3) return { disparada: true, valor: v, umbral: 3, nivel: 'CRITICO',
        explicacion: `Oxígeno disuelto de ${v.toFixed(1)} mg/L, bajo el criterio EPA de 3 mg/L. Riesgo inmediato de mortandad de peces y de liberación de fósforo desde el sedimento, que realimenta la floración.` };
      if (v <= 5) return { disparada: true, valor: v, umbral: 5, nivel: 'ALTO',
        explicacion: `Oxígeno disuelto de ${v.toFixed(1)} mg/L, bajo el criterio de 5 mg/L para vida acuática. Compatible con respiración nocturna de biomasa densa.` };
      return { disparada: false, valor: v, umbral: 5, nivel: 'BAJO',
        explicacion: `Oxígeno disuelto de ${v.toFixed(1)} mg/L, dentro del rango adecuado.` };
    },
  },
  {
    id: 'R5',
    nombre: 'Desequilibrio de nutrientes (N:P)',
    unidad: 'adimensional',
    peso: 0.9,
    referencia: 'Redfield (1958); Smith (1983)',
    evaluar: (o) => {
      const v = relacionNP(o.totalNitrogen, o.totalPhosphorus).valor;
      if (v < 10) return { disparada: true, valor: v, umbral: 10, nivel: 'ALTO',
        explicacion: `La relación N:P es ${v.toFixed(1)}, muy por debajo de Redfield (16). El nitrógeno limita, lo que da ventaja competitiva a las cianobacterias fijadoras de N₂ atmosférico.` };
      if (v < 16) return { disparada: true, valor: v, umbral: 16, nivel: 'MODERADO',
        explicacion: `La relación N:P es ${v.toFixed(1)}, por debajo de Redfield (16), lo que favorece a las cianobacterias frente a otras algas.` };
      return { disparada: false, valor: v, umbral: 16, nivel: 'BAJO',
        explicacion: `Relación N:P de ${v.toFixed(1)}, igual o superior a Redfield: sin ventaja competitiva para cianobacterias.` };
    },
  },
  {
    id: 'R6',
    nombre: 'Estancamiento por calma de viento',
    unidad: 'km/h',
    peso: 0.8,
    referencia: 'Criterio de formación de nata por flotación',
    evaluar: (o) => {
      const v = o.windSpeed;
      if (v <= 2) return { disparada: true, valor: v, umbral: 2, nivel: 'ALTO',
        explicacion: `Viento de ${v.toFixed(1)} km/h: calma casi total. Sin energía de mezcla, las cianobacterias con vesículas de gas flotan y forman nata superficial, que concentra la toxina donde hay contacto humano.` };
      if (v <= 3) return { disparada: true, valor: v, umbral: 3, nivel: 'MODERADO',
        explicacion: `Viento de ${v.toFixed(1)} km/h, bajo el umbral de 3 km/h a partir del cual la mezcla vertical impide la acumulación superficial.` };
      return { disparada: false, valor: v, umbral: 3, nivel: 'BAJO',
        explicacion: `Viento de ${v.toFixed(1)} km/h: hay mezcla suficiente para dispersar la biomasa en la columna.` };
    },
  },
  {
    id: 'R7',
    nombre: 'pH elevado por fotosíntesis',
    unidad: 'unidades de pH',
    peso: 0.5,
    referencia: 'Indicador secundario de actividad fotosintética',
    evaluar: (o) => {
      const v = o.ph;
      if (v >= 9) return { disparada: true, valor: v, umbral: 9, nivel: 'MODERADO',
        explicacion: `pH de ${v.toFixed(2)}. Un pH tan alto indica consumo intenso de CO₂ por fotosíntesis, señal indirecta de floración activa.` };
      return { disparada: false, valor: v, umbral: 9, nivel: 'BAJO',
        explicacion: `pH de ${v.toFixed(2)}, dentro del rango habitual.` };
    },
  },
  {
    id: 'R8',
    nombre: 'Cianotoxina estimada sobre guía OMS',
    unidad: 'µg/L',
    peso: 1.5,
    referencia: 'OMS, guías de microcistina-LR (1,0 y 10 µg/L)',
    evaluar: (o) => {
      const v = o.microcystin;
      if (v >= OMS_MICROCISTINA_RECREATIVA) return { disparada: true, valor: v, umbral: OMS_MICROCISTINA_RECREATIVA, nivel: 'CRITICO',
        explicacion: `Microcistina-LR estimada en ${v.toFixed(1)} µg/L, sobre la guía de la OMS para uso recreativo (10 µg/L) y muy por encima de la de agua de consumo (1,0 µg/L). Requiere confirmación analítica por HPLC o ELISA antes de cualquier decisión.` };
      if (v >= OMS_MICROCISTINA_POTABLE) return { disparada: true, valor: v, umbral: OMS_MICROCISTINA_POTABLE, nivel: 'ALTO',
        explicacion: `Microcistina-LR estimada en ${v.toFixed(1)} µg/L, sobre la guía de la OMS para agua de consumo (1,0 µg/L). Requiere confirmación analítica.` };
      return { disparada: false, valor: v, umbral: OMS_MICROCISTINA_POTABLE, nivel: 'BAJO',
        explicacion: `Microcistina-LR estimada en ${v.toFixed(1)} µg/L, por debajo de la guía de agua de consumo.` };
    },
  },
];

export interface Diagnostico {
  nivel: NivelRiesgo;
  puntuacion: number;
  puntuacionMaxima: number;
  indiceRiesgo: number;
  evaluaciones: Evaluacion[];
  disparadas: Evaluacion[];
  taxonProbable: string;
  microcistinaEstimada: number;
  recomendaciones: string[];
  justificacion: string;
}

/**
 * Infiere el taxón dominante a partir de temperatura y relación N:P.
 * Es una inferencia de cribado basada en la ecología conocida de cada especie,
 * no una identificación taxonómica: eso exige microscopía o análisis genético.
 */
function taxonProbable(o: Observacion): string {
  const temp = o.tempSurface;
  const np = o.totalNitrogen / Math.max(o.totalPhosphorus, 1e-6);
  if (temp >= 25 && np >= 10) return 'Microcystis aeruginosa';
  if (temp >= 25 && np < 10) return 'Cylindrospermopsis raciborskii';
  if (temp >= 20 && temp < 25 && np < 12) return 'Dolichospermum flos-aquae';
  return 'Planktothrix agardhii';
}

/**
 * Recomendaciones ligadas a las reglas disparadas.
 * Cada una indica entre corchetes qué regla la motiva, para que la acción sea
 * rastreable hasta la evidencia que la justifica.
 */
function recomendaciones(nivel: NivelRiesgo, disparadas: Evaluacion[]): string[] {
  const ids = new Set(disparadas.map((e) => e.reglaId));
  const recs: string[] = [];

  if (nivel === 'ALTO' || nivel === 'CRITICO') {
    recs.push('**Confirmación analítica prioritaria** — tomar muestra y cuantificar microcistinas por HPLC o ELISA. El valor del gemelo es una estimación de cribado y no sustituye al laboratorio. [R8]');
  }
  if (ids.has('R4')) {
    recs.push('**Aireación hipolimnética** al máximo de potencia para revertir el déficit de oxígeno y evitar la liberación de fósforo del sedimento, que realimentaría la floración. [R4]');
  }
  if (ids.has('R6') && ids.has('R2')) {
    recs.push('**Desestratificación mecánica** o emisores ultrasónicos en la zona de mayor biomasa: con viento en calma la nata se forma en superficie, que es justo donde hay contacto humano. [R2, R6]');
  }
  if (ids.has('R5')) {
    recs.push('**Control de la carga de fósforo** en los afluentes. Es la medida con mayor efecto a medio plazo, aunque no dé resultado inmediato. [R5]');
  }
  if (ids.has('R8')) {
    recs.push('**Reubicar la toma de agua potable** a un estrato profundo (−12 a −18 m), por debajo de la capa de acumulación de cianobacterias flotantes. [R8]');
  }
  if (nivel === 'CRITICO') {
    recs.push('**Comunicación a la autoridad sanitaria** y señalización de restricción de uso recreativo, mientras se espera la confirmación de laboratorio.');
  }
  if (!recs.length) {
    recs.push('**Mantener el programa de vigilancia habitual.** No hay reglas disparadas que justifiquen una intervención.');
  }
  return recs;
}

/**
 * Aplica el conjunto completo de reglas y agrega el resultado.
 *
 * Agregación en dos pasos, deliberadamente conservadora:
 *
 * 1. **Puntuación ponderada** — suma de peso × severidad de cada regla
 *    disparada, normalizada sobre el máximo posible.
 * 2. **Corrección por regla crítica** — el nivel final nunca queda por debajo
 *    del máximo alcanzado por una regla de peso alto (≥ 1,2). Una sola
 *    cianotoxina sobre la guía de la OMS basta para declarar riesgo crítico
 *    aunque el resto de indicadores esté tranquilo.
 *
 * Promediar aquí sería peligroso: diluiría precisamente la señal que más
 * importa. En alerta sanitaria, el coste de un falso negativo no es comparable
 * al de un falso positivo.
 */
export function diagnosticar(o: Observacion): Diagnostico {
  const evaluaciones: Evaluacion[] = REGLAS.map((r) => {
    const res = r.evaluar(o);
    const nivel = res.disparada ? res.nivel : 'BAJO';
    return {
      reglaId: r.id,
      nombre: r.nombre,
      disparada: res.disparada,
      valorObservado: res.valor,
      umbral: res.umbral,
      unidad: r.unidad,
      nivel,
      peso: r.peso,
      explicacion: res.explicacion,
      referencia: r.referencia,
      contribucion: res.disparada ? r.peso * ORDEN_RIESGO[nivel] : 0,
    };
  });

  const disparadas = evaluaciones.filter((e) => e.disparada);
  const puntuacion = evaluaciones.reduce((s, e) => s + e.contribucion, 0);
  const puntuacionMaxima = REGLAS.reduce((s, r) => s + r.peso * ORDEN_RIESGO.CRITICO, 0);
  const fraccion = puntuacionMaxima ? puntuacion / puntuacionMaxima : 0;

  let nivel: NivelRiesgo =
    fraccion >= 0.45 ? 'CRITICO' : fraccion >= 0.28 ? 'ALTO' : fraccion >= 0.12 ? 'MODERADO' : 'BAJO';

  // Corrección por regla crítica de peso alto
  disparadas.forEach((e) => {
    if (e.peso >= 1.2 && ORDEN_RIESGO[e.nivel] > ORDEN_RIESGO[nivel]) nivel = e.nivel;
  });

  const indiceRiesgo = puntuacionMaxima ? Math.round((puntuacion / puntuacionMaxima) * 1000) / 10 : 0;

  const ordenadas = [...disparadas].sort((a, b) => b.contribucion - a.contribucion);
  const justificacion = ordenadas.length
    ? `Se han disparado ${ordenadas.length} de ${evaluaciones.length} reglas. El nivel resultante es ${nivel} (índice de riesgo ${indiceRiesgo.toFixed(0)}/100).`
    : 'Ninguna regla de diagnóstico se ha disparado. Todos los parámetros evaluados están por debajo de sus umbrales de atención, por lo que el nivel es BAJO.';

  return {
    nivel,
    puntuacion: Math.round(puntuacion * 100) / 100,
    puntuacionMaxima: Math.round(puntuacionMaxima * 100) / 100,
    indiceRiesgo,
    evaluaciones,
    disparadas: ordenadas,
    taxonProbable: taxonProbable(o),
    microcistinaEstimada: o.microcystin,
    recomendaciones: recomendaciones(nivel, disparadas),
    justificacion,
  };
}
