/**
 * Motor del Gemelo Digital — Detección de anomalías explicable.
 *
 * Se usan detectores **estadísticos con significado limnológico** en lugar de
 * un detector genérico tipo Isolation Forest. La razón es de explicabilidad: un
 * bosque de aislamiento devuelve una puntuación de rareza, pero no puede decir
 * *qué* es raro ni *por qué importa*. Aquí cada detección nombra el fenómeno,
 * aporta la magnitud y explica su consecuencia ecológica.
 *
 * Los detectores buscan **eventos** (variaciones bruscas), no niveles
 * elevados. Un pulso de escorrentía deja el fósforo alto durante días: buscar
 * el nivel generaría una alerta por hora del mismo suceso, que es la forma más
 * rápida de que el operador deje de leerlas.
 */

import { CalidadDato, NivelRiesgo, Observacion } from './dominio';

export type TipoAnomalia =
  | 'DUPLICACION_BIOMASA'
  | 'HIPOXIA_NOCTURNA'
  | 'PULSO_NUTRIENTES'
  | 'PICO_TERMICO';

export interface Anomalia {
  id: string;
  t: number;
  estacionId: string;
  estacion: string;
  tipo: TipoAnomalia;
  severidad: NivelRiesgo;
  puntuacion: number;
  variable: string;
  valor: number;
  referencia: number;
  unidad: string;
  descripcion: string;
  consecuencia: string;
  accionSugerida: string;
  metodo: string;
}

export const DESCRIPCION_TIPOS: Record<TipoAnomalia, string> = {
  DUPLICACION_BIOMASA:
    'Crecimiento explosivo de biomasa. Se detecta por la *tasa* de cambio, no por el nivel absoluto: identifica la floración mientras aún está creciendo, que es cuando la intervención sirve de algo.',
  HIPOXIA_NOCTURNA:
    'Caída de oxígeno de madrugada por respiración sin fotosíntesis. Su gravedad no está solo en la mortandad de peces, sino en que la anoxia libera fósforo del sedimento y realimenta la floración.',
  PULSO_NUTRIENTES:
    'Entrada brusca de fósforo, normalmente por escorrentía o vertido. Es un precursor: aparece días antes del aumento de biomasa.',
  PICO_TERMICO:
    'Episodio de temperatura anómalamente alta que desplaza la ventaja competitiva hacia las cianobacterias.',
};

const mediana = (xs: number[]): number => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Puntuación z robusta basada en mediana y MAD.
 *
 * Se prefiere a la z clásica porque la media y la desviación típica se
 * contaminan con los propios valores extremos que se quiere detectar: un pico
 * grande infla la desviación y acaba escondiéndose a sí mismo.
 */
function zRobusto(serie: number[]): number[] {
  const med = mediana(serie);
  const mad = mediana(serie.map((x) => Math.abs(x - med)));
  if (!Number.isFinite(mad) || mad === 0) return serie.map(() => 0);
  return serie.map((x) => (Number.isFinite(x) ? (x - med) / (1.4826 * mad) : 0));
}

export interface OpcionesDeteccion {
  /** Si es true (recomendado) ignora los registros sospechosos y malos, para no
   *  confundir una sonda sucia con un fenómeno real. */
  soloDatosBuenos?: boolean;
}

export function detectarAnomalias(
  filas: Observacion[],
  opciones: OpcionesDeteccion = {},
): Anomalia[] {
  const { soloDatosBuenos = true } = opciones;

  const datos = filas.filter((f) => {
    if (soloDatosBuenos && f.calidad !== 'bueno') return false;
    return Number.isFinite(f.chlorophyllA) && Number.isFinite(f.dissolvedOxygen);
  });

  const porEstacion = new Map<string, Observacion[]>();
  datos.forEach((f) => {
    const g = porEstacion.get(f.estacionId) ?? [];
    g.push(f);
    porEstacion.set(f.estacionId, g);
  });

  const salida: Anomalia[] = [];
  let contador = 0;

  porEstacion.forEach((grupo) => {
    if (grupo.length < 48) return;
    grupo.sort((a, b) => a.t - b.t);
    const nombre = grupo[0].estacion;
    const estId = grupo[0].estacionId;

    // --- 1. Duplicación rápida de biomasa --------------------------------
    // Una floración se reconoce por su tasa de crecimiento, no por su nivel.
    for (let i = 12; i < grupo.length; i++) {
      const previo = grupo[i - 12].chlorophyllA;
      const actual = grupo[i].chlorophyllA;
      if (!Number.isFinite(previo) || previo <= 0) continue;
      const pct = ((actual - previo) / previo) * 100;
      if (pct <= 60) continue;

      contador++;
      salida.push({
        id: `ANM-${String(contador).padStart(3, '0')}`,
        t: grupo[i].t, estacionId: estId, estacion: nombre,
        tipo: 'DUPLICACION_BIOMASA',
        severidad: pct > 100 ? 'CRITICO' : 'ALTO',
        puntuacion: Math.min(1, pct / 200),
        variable: 'Clorofila-a', valor: actual, referencia: previo, unidad: 'µg/L',
        descripcion: `La clorofila-a creció un ${pct.toFixed(0)} % en 12 horas, hasta ${actual.toFixed(1)} µg/L.`,
        consecuencia: 'Una tasa de crecimiento así indica una floración en fase exponencial. Es el momento en que la intervención todavía es eficaz: una vez alcanzada la capacidad de carga, mitigar cuesta mucho más.',
        accionSugerida: 'Confirmar con muestreo, activar mitigación física en el sector afectado y aumentar la frecuencia de vigilancia.',
        metodo: 'Variación porcentual a 12 h con umbral del 60 %',
      });
    }

    // --- 2. Hipoxia nocturna ----------------------------------------------
    // Solo entre 00:00 y 07:00: es respiración sin fotosíntesis compensatoria.
    grupo.forEach((o) => {
      const hora = new Date(o.t).getHours();
      if (hora > 7 || o.dissolvedOxygen >= 3) return;
      contador++;
      salida.push({
        id: `ANM-${String(contador).padStart(3, '0')}`,
        t: o.t, estacionId: estId, estacion: nombre,
        tipo: 'HIPOXIA_NOCTURNA',
        severidad: o.dissolvedOxygen < 2 ? 'CRITICO' : 'ALTO',
        puntuacion: Math.min(1, Math.max(0, (3 - o.dissolvedOxygen) / 3)),
        variable: 'Oxígeno disuelto', valor: o.dissolvedOxygen, referencia: 3, unidad: 'mg/L',
        descripcion: `El oxígeno disuelto cayó a ${o.dissolvedOxygen.toFixed(2)} mg/L a las ${String(hora).padStart(2, '0')}:00, por debajo del criterio EPA de 3 mg/L.`,
        consecuencia: 'De noche cesa la fotosíntesis y solo queda la respiración de la propia biomasa. Además de la mortandad de peces, la anoxia en el sedimento libera el fósforo acumulado, que realimenta la floración: es un bucle que se refuerza solo.',
        accionSugerida: 'Aireación hipolimnética al máximo durante la franja nocturna, hasta romper el ciclo.',
        metodo: 'Umbral fijo EPA restringido a la franja 00:00–07:00',
      });
    });

    // --- 3. Pulso de nutrientes -------------------------------------------
    const subidaP = grupo.map((o, i) => (i >= 6 ? o.totalPhosphorus - grupo[i - 6].totalPhosphorus : NaN));
    const zP = zRobusto(subidaP);
    const medP = mediana(grupo.map((o) => o.totalPhosphorus));
    zP.forEach((z, i) => {
      if (!(z > 4 && subidaP[i] > 0)) return;
      contador++;
      salida.push({
        id: `ANM-${String(contador).padStart(3, '0')}`,
        t: grupo[i].t, estacionId: estId, estacion: nombre,
        tipo: 'PULSO_NUTRIENTES',
        severidad: z > 6 ? 'ALTO' : 'MODERADO',
        puntuacion: Math.min(1, z / 8),
        variable: 'Fósforo total', valor: grupo[i].totalPhosphorus, referencia: medP, unidad: 'mg/L',
        descripcion: `El fósforo total subió ${subidaP[i].toFixed(3)} mg/L en 6 h, hasta ${grupo[i].totalPhosphorus.toFixed(3)} mg/L: una variación ${z.toFixed(1)} desviaciones robustas por encima de lo habitual.`,
        consecuencia: 'Un pulso de fósforo suele proceder de escorrentía tras lluvia o de un vertido. Actúa como combustible: precede típicamente en días a un aumento de biomasa.',
        accionSugerida: 'Rastrear el origen en los afluentes y valorar dosificación de coagulante para precipitar el fósforo disponible.',
        metodo: 'Puntuación z robusta sobre la variación a 6 h, umbral 4,0',
      });
    });

    // --- 4. Pico térmico ---------------------------------------------------
    const subidaT = grupo.map((o, i) => (i >= 6 ? o.tempSurface - grupo[i - 6].tempSurface : NaN));
    const zT = zRobusto(subidaT);
    const medT = mediana(grupo.map((o) => o.tempSurface));
    zT.forEach((z, i) => {
      if (!(z > 4 && grupo[i].tempSurface > 24)) return;
      contador++;
      salida.push({
        id: `ANM-${String(contador).padStart(3, '0')}`,
        t: grupo[i].t, estacionId: estId, estacion: nombre,
        tipo: 'PICO_TERMICO',
        severidad: 'MODERADO',
        puntuacion: Math.min(1, z / 6),
        variable: 'Temperatura superficial', valor: grupo[i].tempSurface, referencia: medT, unidad: '°C',
        descripcion: `La temperatura superficial subió ${subidaT[i].toFixed(1)} °C en 6 h, hasta ${grupo[i].tempSurface.toFixed(1)} °C: una variación ${z.toFixed(1)} desviaciones sobre lo habitual.`,
        consecuencia: 'Por encima de 24 °C las cianobacterias superan competitivamente a diatomeas y clorofitas. Un pico térmico sostenido inclina la comunidad hacia el grupo potencialmente tóxico.',
        accionSugerida: 'Reforzar la vigilancia de ficocianina en las 48–72 h siguientes.',
        metodo: 'Puntuación z robusta sobre la variación a 6 h, umbral 4,0, con filtro de 24 °C',
      });
    });
  });

  return agruparEpisodios(salida);
}

/**
 * Colapsa detecciones consecutivas del mismo tipo y estación en un solo evento.
 *
 * Un fenómeno real dura horas y dispara el detector en cada registro de ese
 * intervalo. Se conserva la detección de mayor puntuación de cada episodio.
 */
function agruparEpisodios(anomalias: Anomalia[], horas = 12): Anomalia[] {
  if (!anomalias.length) return [];
  const ventana = horas * 3600_000;

  const grupos = new Map<string, Anomalia[]>();
  anomalias.forEach((a) => {
    const k = `${a.estacionId}|${a.tipo}`;
    const g = grupos.get(k) ?? [];
    g.push(a);
    grupos.set(k, g);
  });

  const salida: Anomalia[] = [];
  grupos.forEach((g) => {
    g.sort((a, b) => a.t - b.t);
    let episodio: Anomalia[] = [g[0]];
    for (let i = 1; i < g.length; i++) {
      if (g[i].t - episodio[episodio.length - 1].t <= ventana) episodio.push(g[i]);
      else {
        salida.push(episodio.reduce((m, x) => (x.puntuacion > m.puntuacion ? x : m)));
        episodio = [g[i]];
      }
    }
    salida.push(episodio.reduce((m, x) => (x.puntuacion > m.puntuacion ? x : m)));
  });

  return salida.sort((a, b) => b.t - a.t);
}
