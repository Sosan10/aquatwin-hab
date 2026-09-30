/**
 * Motor del Gemelo Digital — Generador de serie histórica y control de calidad.
 *
 * La serie es **simulada**, no medida, y así se declara en toda la interfaz.
 * Se genera con un modelo fenomenológico determinista: cada variable se
 * construye desde un proceso físico o biológico documentado, no desde ruido
 * ajustado para parecer verosímil.
 *
 * Esto importa para la explicabilidad: el modelo predictivo aprende de esta
 * serie, y sus atribuciones solo significan algo si las relaciones subyacentes
 * son causalmente coherentes.
 *
 * Procesos representados
 * ----------------------
 * - Temperatura: estacionalidad + ciclo diario sinusoidal + ruido.
 * - Radiación PAR: ciclo solar diurno, nulo de noche, atenuado por nubosidad.
 * - Viento: proceso autorregresivo AR(1) con episodios de calma persistente.
 * - Nutrientes: nivel base + pulsos de escorrentía con decaimiento exponencial.
 * - Biomasa: crecimiento logístico con tasa dependiente de temperatura (Q10),
 *   luz (saturación), fósforo (Monod) y estabilidad de la columna de agua.
 * - Ficocianina: fracción cianobacteriana, creciente con T y con N:P bajo.
 * - Oxígeno: saturación por temperatura + fotosíntesis − respiración.
 *
 * El generador es determinista y sembrado: la misma semilla produce exactamente
 * la misma serie, de modo que todas las figuras son reproducibles.
 */

import { IOT_BUOYS } from '../data/mockData';
import { CalidadDato, Observacion, VARIABLES, esFisicamenteValido } from './dominio';

/** PRNG sembrado (mulberry32). Math.random no sirve: no es reproducible. */
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar por Box–Muller, a partir del PRNG sembrado. */
function normal(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-12);
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Condiciones de contorno del embalse. Sin esto todos los cuerpos de agua
 * producirían la misma serie y el gemelo no distinguiría un hipereutrófico de
 * un mesotrófico.
 */
export interface PerfilEmbalse {
  tempMedia: number;
  amplitudDiaria: number;
  fosforoBase: number;
  nitrogenoBase: number;
  biomasaInicial: number;
  capacidadCarga: number;
  vientoMedio: number;
  turbidezBase: number;
}

export const PERFILES: Record<string, PerfilEmbalse> = {
  // Falling Creek Reservoir (Virginia) — Dataset real Carey Lab / ERA5
  'basin-fcr': {
    tempMedia: 21.4, amplitudDiaria: 3.5, fosforoBase: 0.05, nitrogenoBase: 0.8,
    biomasaInicial: 24.8, capacidadCarga: 85, vientoMedio: 4.2, turbidezBase: 15,
  },
  // Hipereutrófico y cálido, con fuerte carga del Río San Antonio
  'basin-san-roque': {
    tempMedia: 24.8, amplitudDiaria: 3.2, fosforoBase: 0.32, nitrogenoBase: 3.8,
    biomasaInicial: 45, capacidadCarga: 130, vientoMedio: 5, turbidezBase: 40,
  },
  // Eutrófico somero de altura: frío pero muy somero y con alta carga urbana
  'basin-titicaca-puno': {
    tempMedia: 16.2, amplitudDiaria: 4.5, fosforoBase: 0.28, nitrogenoBase: 3.2,
    biomasaInicial: 60, capacidadCarga: 110, vientoMedio: 7.5, turbidezBase: 30,
  },
  // Mesotrófico, más profundo y ventoso: la mezcla limita la floración
  'basin-paso-piedras': {
    tempMedia: 21.4, amplitudDiaria: 2.8, fosforoBase: 0.09, nitrogenoBase: 1.6,
    biomasaInicial: 12, capacidadCarga: 45, vientoMedio: 14, turbidezBase: 18,
  },
};

export function perfilDe(basinId: string): PerfilEmbalse {
  return PERFILES[basinId] ?? PERFILES['basin-fcr'] ?? PERFILES['basin-san-roque'];
}

export interface OpcionesSerie {
  dias?: number;
  semilla?: number;
  fraccionHuecos?: number;
  fraccionPicos?: number;
}

/**
 * Genera la serie histórica de todas las estaciones del embalse.
 * Devuelve observaciones horarias, cada una con su bandera de calidad evaluada.
 */
export function generarSerie(basinId: string, opciones: OpcionesSerie = {}): Observacion[] {
  const { dias = 45, semilla = 42, fraccionHuecos = 0.02, fraccionPicos = 0.015 } = opciones;
  const perfil = perfilDe(basinId);
  const rnd = mulberry32(semilla);

  const n = dias * 24;
  const fin = new Date();
  fin.setMinutes(0, 0, 0);
  const t0 = fin.getTime() - (n - 1) * 3600_000;

  const filas: Observacion[] = [];

  IOT_BUOYS.forEach((boya) => {
    // Estaciones someras y abrigadas se calientan más y acumulan más biomasa:
    // es lo que después explica la heterogeneidad espacial entre estaciones.
    const someridad = Math.min(0.95, Math.max(0.05, 1 - boya.depthMeters / 35));
    const sesgoTermico = 1.2 * someridad - 0.3;
    const sesgoNutriente = 0.55 + 1.1 * someridad;
    const abrigo = 0.45 + 0.5 * someridad;

    const temp = new Array<number>(n);
    const par = new Array<number>(n);
    const viento = new Array<number>(n);
    const fosforo = new Array<number>(n);
    const nitrogeno = new Array<number>(n);
    const clorofilaReal = new Array<number>(n);

    // --- Forzantes físicos -------------------------------------------------
    for (let i = 0; i < n; i++) {
      const hora = new Date(t0 + i * 3600_000).getHours();
      const dia = i / 24;

      const estacional = 3 * Math.sin((2 * Math.PI * dia) / 365);
      const cicloDiario = perfil.amplitudDiaria * Math.sin((2 * Math.PI * (hora - 9)) / 24);
      temp[i] = perfil.tempMedia + sesgoTermico + estacional + cicloDiario + normal(rnd) * 0.35;

      const nubosidad = Math.min(1, Math.max(0, 0.35 + normal(rnd) * 0.22));
      const potencial = Math.max(0, Math.sin((Math.PI * (hora - 6)) / 12));
      par[i] = 1850 * potencial * (1 - 0.65 * nubosidad);
    }

    // Viento: AR(1) con episodios de calma que persisten varias horas
    viento[0] = perfil.vientoMedio;
    for (let i = 1; i < n; i++) {
      viento[i] = 0.88 * viento[i - 1] + 0.12 * perfil.vientoMedio + normal(rnd) * 1.6;
    }
    for (let i = 0; i < n; i++) viento[i] = Math.min(60, Math.max(0.2, viento[i] * abrigo));

    // --- Nutrientes: nivel base + pulsos de escorrentía --------------------
    for (let i = 0; i < n; i++) {
      fosforo[i] = perfil.fosforoBase * sesgoNutriente;
      nitrogeno[i] = perfil.nitrogenoBase * sesgoNutriente;
    }
    const nPulsos = Math.max(1, Math.floor(dias / 22));
    for (let p = 0; p < nPulsos; p++) {
      const inicio = Math.floor(rnd() * Math.max(1, n - 48));
      const magnitud = (0.1 + rnd() * 0.2) * sesgoNutriente;
      for (let i = inicio; i < n; i++) {
        const decaimiento = Math.exp(-(i - inicio) / 60);
        fosforo[i] += magnitud * decaimiento;
        nitrogeno[i] += magnitud * 7 * decaimiento;
      }
    }
    for (let i = 0; i < n; i++) {
      fosforo[i] = Math.min(3, Math.max(0.005, fosforo[i] + normal(rnd) * 0.008));
      nitrogeno[i] = Math.min(30, Math.max(0.05, nitrogeno[i] + normal(rnd) * 0.06));
    }

    // --- Biomasa: crecimiento logístico multifactorial ---------------------
    // r = r_max · f(T) · f(luz) · f(P) · f(estabilidad)
    clorofilaReal[0] = perfil.biomasaInicial * (0.7 + 0.6 * someridad);
    const dt = 1 / 24;
    for (let i = 1; i < n; i++) {
      const fTemp = Math.pow(1.9, (temp[i] - 20) / 10);        // Q10 ≈ 1,9
      const fLuz = par[i] / (par[i] + 350);                     // saturación lumínica
      const fP = fosforo[i] / (fosforo[i] + 0.03);              // Monod, Ks = 0,03 mg/L
      const fEstab = Math.min(1, Math.max(0.12, 1.25 - viento[i] / 16));

      const r = 0.62 * fTemp * fLuz * fP * fEstab;
      const perdida = 0.1 + 0.016 * viento[i];
      const previo = clorofilaReal[i - 1];
      const crecimiento = r * previo * (1 - previo / perfil.capacidadCarga);

      // Ruido de PROCESO, pequeño: la biomasa evoluciona según la ecuación.
      clorofilaReal[i] = Math.max(
        0.6,
        previo + (crecimiento - perdida * previo) * dt + normal(rnd) * 0.12,
      );
    }

    // --- Derivadas y ruido de OBSERVACIÓN ---------------------------------
    // La distinción entre ruido de proceso y de observación no es un detalle:
    // si el ruido se inyecta dentro del bucle se integra, la biomasa deriva sin
    // causa física y el sistema se vuelve impredecible por construcción. El
    // estado evoluciona suave; lo imperfecto es la lectura del sensor.
    for (let i = 0; i < n; i++) {
      const real = clorofilaReal[i];
      const clorofila = Math.max(0.3, real + normal(rnd) * 0.85);

      const npRatio = Math.min(100, Math.max(1, nitrogeno[i] / Math.max(fosforo[i], 1e-6)));
      const fracCiano = Math.min(
        0.92,
        Math.max(0.03, 0.16 + 0.03 * (temp[i] - 20) + 0.32 * Math.min(1, Math.max(0, (16 - npRatio) / 16))),
      );
      const ficocianina = Math.max(0, real * fracCiano * 1150 + normal(rnd) * 400);

      const odSat = 14.6 - 0.41 * temp[i] + 0.0045 * temp[i] * temp[i];
      const produccion = 0.055 * real * (par[i] / 1850);
      const respiracion = 0.03 * real;
      const od = Math.min(22, Math.max(0.05, odSat + produccion - respiracion + normal(rnd) * 0.22));

      const ph = Math.min(11, Math.max(6, 7.5 + 0.019 * real * (par[i] / 1850) + normal(rnd) * 0.06));
      const turbidez = Math.min(
        400,
        Math.max(0.5, perfil.turbidezBase * (0.55 + 0.45 * someridad) + 0.34 * real + normal(rnd) * 1.6),
      );
      const microcistina = Math.min(160, Math.max(0, ficocianina / 3400 + normal(rnd) * 0.3));

      filas.push({
        t: t0 + i * 3600_000,
        estacionId: boya.id,
        estacion: boya.name,
        codigo: boya.code,
        profundidadM: boya.depthMeters,
        tempSurface: temp[i],
        solarPAR: par[i],
        windSpeed: viento[i],
        totalPhosphorus: fosforo[i],
        totalNitrogen: nitrogeno[i],
        chlorophyllA: clorofila,
        phycocyanin: ficocianina,
        dissolvedOxygen: od,
        ph,
        turbidity: turbidez,
        microcystin: microcistina,
        calidad: 'bueno',
      });
    }
  });

  return controlDeCalidad(inyectarFallos(filas, rnd, fraccionHuecos, fraccionPicos));
}

/**
 * Introduce fallos de sensor deliberados.
 *
 * Un motor que solo funciona con datos perfectos no sirve para datos reales:
 * hay sondas sucias, pérdidas de comunicación y picos espurios.
 */
function inyectarFallos(
  filas: Observacion[],
  rnd: () => number,
  fraccionHuecos: number,
  fraccionPicos: number,
): Observacion[] {
  const n = filas.length;

  // Picos espurios (biofouling, burbuja en la celda óptica)
  const nPicos = Math.floor(n * fraccionPicos);
  for (let k = 0; k < nPicos; k++) {
    const i = Math.floor(rnd() * n);
    filas[i].chlorophyllA *= 2.5 + rnd() * 2.5;
  }

  // Huecos por pérdida de comunicación: se marcan, no se inventan
  const nHuecos = Math.floor(n * fraccionHuecos);
  for (let k = 0; k < nHuecos; k++) {
    const i = Math.floor(rnd() * n);
    filas[i].calidad = 'malo';
    filas[i].chlorophyllA = NaN;
    filas[i].dissolvedOxygen = NaN;
    filas[i].phycocyanin = NaN;
  }

  return filas;
}

const mediana = (xs: number[]): number => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Control de calidad QARTOD simplificado, aplicado por estación.
 *
 * 1. **Rango físicamente válido** — fuera del rango del instrumento es `malo`.
 *    No se interpola: se descarta.
 * 2. **Prueba de pico** — un valor que se aparta de sus vecinos **tanto** en
 *    desviaciones robustas (6·MAD) **como** en magnitud relativa (15 % de la
 *    mediana) es `sospechoso`. Exigir ambos criterios es imprescindible: en una
 *    serie suave con tendencia la MAD tiende a cero y un umbral puramente
 *    estadístico marcaría media serie. Un pico de sensor real se aparta en
 *    magnitud absoluta, no solo en unidades de dispersión.
 *
 * Los sospechosos **no se eliminan**: se conservan y se señalan. Borrar un dato
 * en silencio es una decisión del analista, no del motor.
 */
export function controlDeCalidad(filas: Observacion[]): Observacion[] {
  const porEstacion = new Map<string, Observacion[]>();
  filas.forEach((f) => {
    const g = porEstacion.get(f.estacionId) ?? [];
    g.push(f);
    porEstacion.set(f.estacionId, g);
  });

  const claves = Object.keys(VARIABLES).filter((k) => k !== 'solarPAR');

  porEstacion.forEach((grupo) => {
    grupo.sort((a, b) => a.t - b.t);

    claves.forEach((clave) => {
      const v = VARIABLES[clave];
      const serie = grupo.map((o) => (o as unknown as Record<string, number>)[clave]);

      // 1. Rango físico
      serie.forEach((valor, i) => {
        if (Number.isFinite(valor) && !esFisicamenteValido(v, valor)) {
          grupo[i].calidad = 'malo';
          (grupo[i] as unknown as Record<string, number>)[clave] = NaN;
        }
      });

      // 2. Prueba de pico contra la mediana móvil de 7
      const escala = Math.abs(mediana(serie));
      const residuos: number[] = [];
      for (let i = 0; i < serie.length; i++) {
        const ventana = serie.slice(Math.max(0, i - 3), Math.min(serie.length, i + 4));
        const med = mediana(ventana);
        residuos.push(
          Number.isFinite(serie[i]) && Number.isFinite(med) ? Math.abs(serie[i] - med) : NaN,
        );
      }
      const mad = mediana(residuos);
      if (!Number.isFinite(mad) || mad <= 0 || !Number.isFinite(escala)) return;

      const umbralEstadistico = 6 * mad * 1.4826;
      const umbralRelativo = 0.15 * escala;
      residuos.forEach((r, i) => {
        if (
          Number.isFinite(r) &&
          r > umbralEstadistico &&
          r > umbralRelativo &&
          grupo[i].calidad !== 'malo'
        ) {
          grupo[i].calidad = 'sospechoso';
        }
      });
    });
  });

  return filas;
}

export interface ResumenCalidad {
  bandera: CalidadDato;
  registros: number;
  porcentaje: number;
  significado: string;
}

const SIGNIFICADO: Record<CalidadDato, string> = {
  bueno: 'Supera todas las pruebas de control de calidad.',
  sospechoso:
    'Pico o valor atípico; se conserva y se señala, pero no alimenta decisiones automáticas.',
  malo: 'Fuera de rango físico o hueco de comunicación; se descarta.',
};

export function resumenCalidad(filas: Observacion[]): ResumenCalidad[] {
  const conteo: Record<CalidadDato, number> = { bueno: 0, sospechoso: 0, malo: 0 };
  filas.forEach((f) => (conteo[f.calidad] += 1));
  return (['bueno', 'sospechoso', 'malo'] as CalidadDato[]).map((b) => ({
    bandera: b,
    registros: conteo[b],
    porcentaje: filas.length ? (conteo[b] / filas.length) * 100 : 0,
    significado: SIGNIFICADO[b],
  }));
}

/** Subconjunto apto para modelar: solo registros que superan el control. */
export function datosValidos(filas: Observacion[]): Observacion[] {
  return filas.filter(
    (f) =>
      f.calidad === 'bueno' &&
      Number.isFinite(f.chlorophyllA) &&
      Number.isFinite(f.dissolvedOxygen) &&
      Number.isFinite(f.phycocyanin),
  );
}
