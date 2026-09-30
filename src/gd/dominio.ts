/**
 * Motor del Gemelo Digital — Dominio.
 *
 * Catálogo de variables limnológicas con sus unidades, rangos físicamente
 * válidos, umbrales normativos y la referencia de cada umbral.
 *
 * Es la fuente única de verdad de toda la interfaz: las etiquetas de los ejes,
 * las líneas de umbral de las figuras, las clasificaciones de riesgo y los
 * diccionarios de datos salen de aquí. Por eso cada figura y cada tabla puede
 * describirse sola: la variable sabe lo que es.
 */

export type NivelRiesgo = 'BAJO' | 'MODERADO' | 'ALTO' | 'CRITICO';

export const ORDEN_RIESGO: Record<NivelRiesgo, number> = {
  BAJO: 0,
  MODERADO: 1,
  ALTO: 2,
  CRITICO: 3,
};

export const COLOR_RIESGO: Record<NivelRiesgo, string> = {
  BAJO: '#10b981',
  MODERADO: '#f59e0b',
  ALTO: '#f97316',
  CRITICO: '#ef4444',
};

/** Icono además del color: codificar el riesgo solo por color excluye a quien
 *  tiene deficiencia en la visión cromática. */
export const ICONO_RIESGO: Record<NivelRiesgo, string> = {
  BAJO: '●',
  MODERADO: '◆',
  ALTO: '▲',
  CRITICO: '■',
};

/**
 * Bandera de calidad por medición, según el esquema QARTOD
 * (Quality Assurance of Real-Time Oceanographic Data).
 */
export type CalidadDato = 'bueno' | 'sospechoso' | 'malo';

export const COLOR_CALIDAD: Record<CalidadDato, string> = {
  bueno: '#22d3ee',
  sospechoso: '#a78bfa',
  malo: '#ef4444',
};

export interface Variable {
  clave: string;
  nombre: string;
  unidad: string;
  descripcion: string;
  /** Rango físicamente posible; fuera de él la lectura se descarta. */
  rangoValido: [number, number];
  umbralAtencion?: number;
  umbralCritico?: number;
  /** Norma o publicación que fija el umbral. */
  referencia: string;
  /** false cuando el riesgo crece al bajar (oxígeno disuelto, viento). */
  mayorEsPeor: boolean;
}

export const OMS_MICROCISTINA_POTABLE = 1.0;
export const OMS_MICROCISTINA_RECREATIVA = 10.0;
export const REDFIELD_NP = 16.0;

export const VARIABLES: Record<string, Variable> = {
  chlorophyllA: {
    clave: 'chlorophyllA',
    nombre: 'Clorofila-a',
    unidad: 'µg/L',
    descripcion:
      'Estimador de biomasa fitoplanctónica total. Es el indicador primario del estado trófico y la base del índice TSI de Carlson.',
    rangoValido: [0, 500],
    umbralAtencion: 25,
    umbralCritico: 50,
    referencia: 'OMS (2003), guía de aguas recreativas — niveles de alerta 1 y 2',
    mayorEsPeor: true,
  },
  phycocyanin: {
    clave: 'phycocyanin',
    nombre: 'Ficocianina',
    unidad: 'células/mL',
    descripcion:
      'Pigmento accesorio exclusivo de cianobacterias. A diferencia de la clorofila-a, distingue cianobacterias de algas verdes y diatomeas, por lo que es el indicador directo de riesgo de cianotoxinas.',
    rangoValido: [0, 500000],
    umbralAtencion: 20000,
    umbralCritico: 100000,
    referencia: 'OMS (2003), umbrales de densidad celular de cianobacterias',
    mayorEsPeor: true,
  },
  tempSurface: {
    clave: 'tempSurface',
    nombre: 'Temperatura superficial',
    unidad: '°C',
    descripcion:
      'Controla la tasa de división celular. Por encima de ~23 °C las cianobacterias superan competitivamente a diatomeas y clorofitas.',
    rangoValido: [-2, 45],
    umbralAtencion: 24,
    umbralCritico: 28,
    referencia: 'Paerl & Huisman (2008), «Blooms like it hot»',
    mayorEsPeor: true,
  },
  dissolvedOxygen: {
    clave: 'dissolvedOxygen',
    nombre: 'Oxígeno disuelto',
    unidad: 'mg/L',
    descripcion:
      'Balance entre fotosíntesis y respiración. Valores muy bajos indican hipoxia; valores muy altos, sobresaturación por floración activa.',
    rangoValido: [0, 25],
    umbralAtencion: 5,
    umbralCritico: 3,
    referencia: 'EPA (1986), criterio de calidad para vida acuática',
    mayorEsPeor: false,
  },
  totalPhosphorus: {
    clave: 'totalPhosphorus',
    nombre: 'Fósforo total',
    unidad: 'mg/L',
    descripcion:
      'Nutriente habitualmente limitante en aguas continentales. Es la palanca de gestión más eficaz a largo plazo.',
    rangoValido: [0, 5],
    umbralAtencion: 0.05,
    umbralCritico: 0.1,
    referencia: 'OCDE (1982), límites de clasificación trófica',
    mayorEsPeor: true,
  },
  totalNitrogen: {
    clave: 'totalNitrogen',
    nombre: 'Nitrógeno total',
    unidad: 'mg/L',
    descripcion:
      'Junto al fósforo determina la relación N:P, que condiciona qué grupo algal domina la comunidad.',
    rangoValido: [0, 50],
    umbralAtencion: 1.5,
    umbralCritico: 3,
    referencia: 'OCDE (1982)',
    mayorEsPeor: true,
  },
  ph: {
    clave: 'ph',
    nombre: 'pH',
    unidad: 'unidades de pH',
    descripcion:
      'Sube durante la fotosíntesis intensa por consumo de CO₂. Un pH > 9 sostenido es indicio indirecto de floración activa.',
    rangoValido: [0, 14],
    umbralAtencion: 8.5,
    umbralCritico: 9,
    referencia: 'Indicador secundario de actividad fotosintética',
    mayorEsPeor: true,
  },
  turbidity: {
    clave: 'turbidity',
    nombre: 'Turbidez',
    unidad: 'NTU',
    descripcion:
      'Material en suspensión. Limita la penetración de luz y compite con la señal óptica de la clorofila en teledetección.',
    rangoValido: [0, 1000],
    umbralAtencion: 25,
    umbralCritico: 50,
    referencia: 'Criterio operativo de planta potabilizadora',
    mayorEsPeor: true,
  },
  windSpeed: {
    clave: 'windSpeed',
    nombre: 'Velocidad del viento',
    unidad: 'km/h',
    descripcion:
      'El viento genera mezcla vertical turbulenta. Con calma sostenida (< 3 km/h) las cianobacterias flotan y forman nata superficial.',
    rangoValido: [0, 200],
    umbralAtencion: 3,
    umbralCritico: 2,
    referencia: 'Criterio de formación de nata (scum) por flotación',
    mayorEsPeor: false,
  },
  solarPAR: {
    clave: 'solarPAR',
    nombre: 'Radiación PAR',
    unidad: 'µmol/m²·s',
    descripcion:
      'Radiación fotosintéticamente activa (400–700 nm). Es el aporte energético que sostiene la producción primaria.',
    rangoValido: [0, 2500],
    umbralAtencion: 1200,
    umbralCritico: 1500,
    referencia: 'Umbral operativo de saturación lumínica',
    mayorEsPeor: true,
  },
  microcystin: {
    clave: 'microcystin',
    nombre: 'Microcistina-LR estimada',
    unidad: 'µg/L',
    descripcion:
      'Hepatotoxina producida por Microcystis. Es la variable con consecuencia sanitaria directa; se estima a partir de la densidad de cianobacterias y requiere confirmación por HPLC o ELISA.',
    rangoValido: [0, 200],
    umbralAtencion: OMS_MICROCISTINA_POTABLE,
    umbralCritico: OMS_MICROCISTINA_RECREATIVA,
    referencia: 'OMS: guía de agua de consumo (1,0 µg/L) y recreativa (10 µg/L)',
    mayorEsPeor: true,
  },
};

export function variable(clave: string): Variable {
  const v = VARIABLES[clave];
  if (!v) throw new Error(`Variable desconocida: ${clave}`);
  return v;
}

/** Etiqueta de eje lista para graficar: siempre con unidad. */
export function etiqueta(v: Variable): string {
  return `${v.nombre} [${v.unidad}]`;
}

/** Clasifica un valor según los umbrales de la variable, respetando la
 *  dirección del riesgo. */
export function clasificar(v: Variable, valor: number): NivelRiesgo {
  if (v.umbralAtencion === undefined || v.umbralCritico === undefined) return 'BAJO';
  if (v.mayorEsPeor) {
    if (valor >= v.umbralCritico) return 'CRITICO';
    if (valor >= v.umbralAtencion) return 'MODERADO';
    return 'BAJO';
  }
  if (valor <= v.umbralCritico) return 'CRITICO';
  if (valor <= v.umbralAtencion) return 'MODERADO';
  return 'BAJO';
}

export function esFisicamenteValido(v: Variable, valor: number): boolean {
  return valor >= v.rangoValido[0] && valor <= v.rangoValido[1];
}

/** Una observación de una estación en un instante. */
export interface Observacion {
  t: number;                 // milisegundos epoch
  estacionId: string;
  estacion: string;
  codigo: string;
  profundidadM: number;
  tempSurface: number;
  solarPAR: number;
  windSpeed: number;
  totalPhosphorus: number;
  totalNitrogen: number;
  chlorophyllA: number;
  phycocyanin: number;
  dissolvedOxygen: number;
  ph: number;
  turbidity: number;
  microcystin: number;
  calidad: CalidadDato;
}

export interface Taxon {
  nombre: string;
  toxina: string;
  optimoTermico: [number, number];
  nota: string;
}

export const TAXONES: Record<string, Taxon> = {
  'Microcystis aeruginosa': {
    nombre: 'Microcystis aeruginosa',
    toxina: 'Microcistina-LR (hepatotoxina)',
    optimoTermico: [25, 32],
    nota:
      'Forma colonias con vesículas de gas que le permiten flotar y acumularse en superficie con viento en calma. Es el taxón dominante en floraciones de embalses hipereutróficos cálidos.',
  },
  'Dolichospermum flos-aquae': {
    nombre: 'Dolichospermum flos-aquae',
    toxina: 'Anatoxina-a (neurotoxina)',
    optimoTermico: [20, 28],
    nota:
      'Fija nitrógeno atmosférico, por lo que prospera cuando la relación N:P es muy baja y el nitrógeno es limitante.',
  },
  'Planktothrix agardhii': {
    nombre: 'Planktothrix agardhii',
    toxina: 'Microcistina',
    optimoTermico: [15, 25],
    nota:
      'Tolera baja irradiancia; típica de aguas someras y turbias, y de floraciones que persisten en otoño.',
  },
  'Cylindrospermopsis raciborskii': {
    nombre: 'Cylindrospermopsis raciborskii',
    toxina: 'Cilindrospermopsina (hepatotoxina)',
    optimoTermico: [25, 35],
    nota:
      'Especie invasora en expansión hacia latitudes templadas. Tolera baja luz y fija nitrógeno.',
  },
};
