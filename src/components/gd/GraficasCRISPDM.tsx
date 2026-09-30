import React, { useMemo } from 'react';
import { MESES } from '../../gd/crispdm';

/**
 * Figuras del informe CRISP-DM, en SVG a mano.
 *
 * Mismo criterio que el resto del motor: ningún eje sin unidad, ningún umbral
 * sin rotular con su norma, y los huecos del dato dibujados como huecos y no
 * como una línea que los atraviesa fingiendo continuidad.
 *
 * Van en su propio archivo, y no dentro de `Graficas.tsx`, porque responden a
 * preguntas de metodología —¿cómo se comporta el error al variar un
 * hiperparámetro?, ¿difieren los pliegues entre sí?— y no al estado del
 * embalse. Mezclarlas obligaría a quien lea `Graficas.tsx` a saltar entre dos
 * dominios distintos.
 */

const M = { top: 16, right: 20, bottom: 38, left: 60 };

interface Escala {
  x: (v: number) => number;
  y: (v: number) => number;
  ancho: number;
  alto: number;
  /** Margen izquierdo efectivo: las figuras con etiquetas largas usan uno mayor. */
  izquierda: number;
}

/** Margen izquierdo de las figuras cuyo eje vertical son nombres de rasgo y no
 *  numeros: `chl_media7` o `Valor esperado` no caben en el margen de un eje
 *  numerico, y recortarlos convierte la etiqueta en un jeroglifico. */
const IZQ_ETIQUETAS = 116;

function crearEscala(
  xs: [number, number],
  ys: [number, number],
  ancho: number,
  alto: number,
  izquierda: number = M.left,
): Escala {
  const [x0, x1] = xs;
  const [y0, y1] = ys;
  const dx = x1 - x0 || 1;
  const dy = y1 - y0 || 1;
  return {
    x: (v) => izquierda + ((v - x0) / dx) * (ancho - izquierda - M.right),
    y: (v) => alto - M.bottom - ((v - y0) / dy) * (alto - M.top - M.bottom),
    ancho,
    alto,
    izquierda,
  };
}

const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || Number.isNaN(v)
    ? '—'
    : Math.abs(v) >= 10000
    ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
    : v.toFixed(d);

const PALETA = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#60a5fa'];

const Rejilla: React.FC<{ e: Escala; ticksY: number[]; ticksX?: { v: number; etiqueta: string }[] }> = ({
  e,
  ticksY,
  ticksX,
}) => (
  <g>
    {ticksY.map((t) => (
      <g key={`y${t}`}>
        <line x1={e.izquierda} x2={e.ancho - M.right} y1={e.y(t)} y2={e.y(t)} stroke="rgba(148,163,184,0.14)" />
        <text x={e.izquierda - 7} y={e.y(t) + 3.5} textAnchor="end" className="fill-slate-500" fontSize={9.5}>
          {fmt(t, Math.abs(t) < 10 ? 1 : 0)}
        </text>
      </g>
    ))}
    {ticksX?.map((t, i) => (
      <text
        key={`x${i}`}
        x={e.x(t.v)}
        y={e.alto - M.bottom + 15}
        textAnchor="middle"
        className="fill-slate-500"
        fontSize={9.5}
      >
        {t.etiqueta}
      </text>
    ))}
  </g>
);

const EjeY: React.FC<{ e: Escala; etiqueta: string }> = ({ e, etiqueta }) => (
  <text
    transform={`rotate(-90) translate(${-(e.alto / 2)} 13)`}
    textAnchor="middle"
    className="fill-slate-400"
    fontSize={10}
    fontWeight={500}
  >
    {etiqueta}
  </text>
);

const Leyenda: React.FC<{ entradas: { nombre: string; color: string }[] }> = ({ entradas }) => (
  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
    {entradas.map((s) => (
      <span key={s.nombre} className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
        {s.nombre}
      </span>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// G1 — Serie de clorofila con los dos umbrales de la OMS
// ---------------------------------------------------------------------------

export const SerieUmbrales: React.FC<{
  puntos: { t: number; valor: number }[];
  umbral1: number;
  umbral2: number;
  alto?: number;
}> = ({ puntos, umbral1, umbral2, alto = 280 }) => {
  const ancho = 880;
  const { e, ticksY, ticksX } = useMemo(() => {
    const ts = puntos.map((p) => p.t);
    const vs = puntos.map((p) => p.valor);
    const yMax = Math.max(...vs, umbral2) * 1.08;
    const esc = crearEscala([Math.min(...ts), Math.max(...ts)], [0, yMax], ancho, alto);
    return {
      e: esc,
      ticksY: Array.from({ length: 5 }, (_, i) => (yMax * i) / 4),
      ticksX: Array.from({ length: 6 }, (_, i) => {
        const v = Math.min(...ts) + ((Math.max(...ts) - Math.min(...ts)) * i) / 5;
        return { v, etiqueta: new Date(v).toLocaleDateString('es-ES', { year: '2-digit', month: 'short' }) };
      }),
    };
  }, [puntos, umbral2, alto]);

  // Huecos mayores a 10 días se dibujan como discontinuidad: unir con una recta
  // dos observaciones separadas por semanas sugiere un dato que nadie tomó.
  const CORTE = 10 * 24 * 3600 * 1000;
  const tramos: { t: number; valor: number }[][] = [];
  let actual: { t: number; valor: number }[] = [];
  puntos.forEach((p, i) => {
    if (i > 0 && p.t - puntos[i - 1].t > CORTE) {
      tramos.push(actual);
      actual = [];
    }
    actual.push(p);
  });
  if (actual.length) tramos.push(actual);

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Serie de clorofila-a con umbrales de la OMS">
        <Rejilla e={e} ticksY={ticksY} ticksX={ticksX} />
        <EjeY e={e} etiqueta="Clorofila-a [µg/L]" />
        {([[umbral1, 'OMS alerta 1 (vigilancia)', '#f59e0b'], [umbral2, 'OMS alerta 2 (riesgo alto)', '#ef4444']] as [number, string, string][]).map(
          ([v, etiqueta, color]) => (
            <g key={etiqueta}>
              <line x1={e.izquierda} x2={ancho - M.right} y1={e.y(v)} y2={e.y(v)} stroke={color} strokeWidth={1.2} strokeDasharray="5 3" />
              <text x={e.izquierda + 5} y={e.y(v) - 4} fill={color} fontSize={9} fontWeight={600}>
                {etiqueta}: {v} µg/L
              </text>
            </g>
          ),
        )}
        {tramos.map((tramo, i) => (
          <polyline
            key={i}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={1.1}
            points={tramo.map((p) => `${e.x(p.t)},${e.y(p.valor)}`).join(' ')}
          />
        ))}
        {puntos
          .filter((p) => p.valor >= umbral1)
          .map((p, i) => (
            <circle key={i} cx={e.x(p.t)} cy={e.y(p.valor)} r={1.8} fill={p.valor >= umbral2 ? '#ef4444' : '#f59e0b'} />
          ))}
      </svg>
      <Leyenda
        entradas={[
          { nombre: 'Clorofila-a diaria (sonda, 1,6 m)', color: '#22d3ee' },
          { nombre: `Día ≥ ${umbral1} µg/L`, color: '#f59e0b' },
          { nombre: `Día ≥ ${umbral2} µg/L`, color: '#ef4444' },
        ]}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// G2 — Cajas mensuales
// ---------------------------------------------------------------------------

export const CajasMensuales: React.FC<{
  cajas: { mes: number; n: number; min: number; q1: number; mediana: number; q3: number; max: number; sobre_umbral_pct: number }[];
  umbral: number;
  alto?: number;
}> = ({ cajas, umbral, alto = 280 }) => {
  const ancho = 880;
  const yMax = Math.max(...cajas.map((c) => c.max), umbral) * 1.06;
  const e = crearEscala([0, cajas.length], [0, yMax], ancho, alto);
  const ticksY = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4);
  const anchoCaja = (e.x(1) - e.x(0)) * 0.52;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Distribución mensual de clorofila-a">
        <Rejilla
          e={e}
          ticksY={ticksY}
          ticksX={cajas.map((c, i) => ({ v: i + 0.5, etiqueta: MESES[c.mes - 1] }))}
        />
        <EjeY e={e} etiqueta="Clorofila-a [µg/L]" />
        <line x1={e.izquierda} x2={ancho - M.right} y1={e.y(umbral)} y2={e.y(umbral)} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="5 3" />
        <text x={e.izquierda + 5} y={e.y(umbral) - 4} fill="#f59e0b" fontSize={9} fontWeight={600}>
          Umbral de evento: {umbral} µg/L
        </text>
        {cajas.map((c, i) => {
          const cx = e.x(i + 0.5);
          const x0 = cx - anchoCaja / 2;
          // Color por proporción de días del mes que superan el umbral
          const intensidad = Math.min(c.sobre_umbral_pct / 40, 1);
          const relleno = `rgba(239,68,68,${0.12 + intensidad * 0.5})`;
          return (
            <g key={c.mes}>
              <line x1={cx} x2={cx} y1={e.y(c.min)} y2={e.y(c.q1)} stroke="#64748b" strokeWidth={1} />
              <line x1={cx} x2={cx} y1={e.y(c.q3)} y2={e.y(c.max)} stroke="#64748b" strokeWidth={1} />
              <line x1={cx - anchoCaja / 4} x2={cx + anchoCaja / 4} y1={e.y(c.min)} y2={e.y(c.min)} stroke="#64748b" strokeWidth={1} />
              <line x1={cx - anchoCaja / 4} x2={cx + anchoCaja / 4} y1={e.y(c.max)} y2={e.y(c.max)} stroke="#64748b" strokeWidth={1} />
              <rect
                x={x0}
                y={e.y(c.q3)}
                width={anchoCaja}
                height={Math.max(e.y(c.q1) - e.y(c.q3), 1)}
                fill={relleno}
                stroke="#94a3b8"
                strokeWidth={0.9}
                rx={1.5}
              />
              <line x1={x0} x2={x0 + anchoCaja} y1={e.y(c.mediana)} y2={e.y(c.mediana)} stroke="#e2e8f0" strokeWidth={1.8} />
              <title>
                {MESES[c.mes - 1]}: mediana {c.mediana} µg/L, IQR {c.q1}–{c.q3}, n={c.n}, {c.sobre_umbral_pct}% sobre umbral
              </title>
            </g>
          );
        })}
      </svg>
      <Leyenda
        entradas={[
          { nombre: 'Caja: cuartiles 1–3 · línea clara: mediana · bigotes: mínimo y máximo', color: '#94a3b8' },
          { nombre: 'Rojo más intenso: mayor proporción de días sobre el umbral', color: 'rgba(239,68,68,0.6)' },
        ]}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// G3 — Curva de validación sobre un hiperparámetro
// ---------------------------------------------------------------------------

export const CurvaValidacion: React.FC<{
  puntos: { x: string; mae: number; desv: number }[];
  hiperparametro: string;
  modelo: string;
  alto?: number;
}> = ({ puntos: puntosBrutos, hiperparametro, modelo, alto = 250 }) => {
  const puntos = (puntosBrutos || []).filter(
    (p) => p && p.mae !== null && p.mae !== undefined && !Number.isNaN(p.mae)
  );
  const ancho = 880;
  if (!puntos.length) return <p className="text-sm text-slate-500 p-4">Sin rejilla que mostrar para este modelo.</p>;

  const lo = Math.min(...puntos.map((p) => p.mae - (p.desv || 0)));
  const hi = Math.max(...puntos.map((p) => p.mae + (p.desv || 0)));
  const margen = (hi - lo) * 0.15 || 0.1;
  const e = crearEscala([0, puntos.length - 1 || 1], [lo - margen, hi + margen], ancho, alto);
  const ticksY = Array.from({ length: 5 }, (_, i) => lo - margen + ((hi - lo + 2 * margen) * i) / 4);
  const mejor = puntos.reduce((a, b) => (b.mae < a.mae ? b : a), puntos[0]);

  const banda = [
    ...puntos.map((p, i) => `${e.x(i)},${e.y(p.mae + (p.desv || 0))}`),
    ...puntos.map((p, i) => `${e.x(puntos.length - 1 - i)},${e.y(puntos[puntos.length - 1 - i].mae - (puntos[puntos.length - 1 - i].desv || 0))}`),
  ].join(' ');

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Curva de validación de ${modelo}`}>
        <Rejilla e={e} ticksY={ticksY} ticksX={puntos.map((p, i) => ({ v: i, etiqueta: p.x }))} />
        <EjeY e={e} etiqueta="MAE en validación interna [µg/L]" />
        <polygon points={banda} fill="rgba(34,211,238,0.13)" />
        <polyline
          fill="none"
          stroke="#22d3ee"
          strokeWidth={1.8}
          points={puntos.map((p, i) => `${e.x(i)},${e.y(p.mae)}`).join(' ')}
        />
        {puntos.map((p, i) => (
          <g key={p.x}>
            <circle cx={e.x(i)} cy={e.y(p.mae)} r={p === mejor ? 5 : 3.2} fill={p === mejor ? '#34d399' : '#22d3ee'} />
            <title>
              {hiperparametro} = {p.x}: MAE {p.mae != null ? p.mae.toFixed(4) : '—'} ± {p.desv != null ? p.desv.toFixed(4) : '—'}
            </title>
          </g>
        ))}
        <text x={ancho / 2} y={alto - 4} textAnchor="middle" className="fill-slate-400" fontSize={10} fontWeight={500}>
          {hiperparametro}
        </text>
      </svg>
      <Leyenda
        entradas={[
          { nombre: `MAE medio de ${modelo} en los pliegues internos`, color: '#22d3ee' },
          { nombre: 'Banda: ± 1 desviación entre pliegues', color: 'rgba(34,211,238,0.35)' },
          { nombre: `Mínimo (${hiperparametro} = ${mejor.x})`, color: '#34d399' },
        ]}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// G4 — Error por pliegue y modelo
// ---------------------------------------------------------------------------

export const BarrasPliegues: React.FC<{
  pliegues: { pliegue: number; test_desde: string; n_test: number; valores: Record<string, number> }[];
  modelos: string[];
  alto?: number;
}> = ({ pliegues, modelos, alto = 280 }) => {
  const ancho = 880;
  const todos = pliegues.flatMap((p) =>
    modelos.map((m) => {
      const val = p.valores[m];
      return val !== null && val !== undefined && !Number.isNaN(val) ? val : 0;
    })
  );
  const yMax = Math.max(...todos, 0.1) * 1.1;
  const e = crearEscala([0, pliegues.length], [0, yMax], ancho, alto);
  const ticksY = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4);
  const ranura = e.x(1) - e.x(0);
  const anchoBarra = (ranura * 0.78) / modelos.length;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Error absoluto medio por pliegue">
        <Rejilla
          e={e}
          ticksY={ticksY}
          ticksX={pliegues.map((p, i) => ({ v: i + 0.5, etiqueta: `P${p.pliegue} · ${p.test_desde.slice(0, 7)}` }))}
        />
        <EjeY e={e} etiqueta="MAE del pliegue [µg/L]" />
        {pliegues.map((p, i) =>
          modelos.map((m, j) => {
            const v = p.valores[m];
            if (v === undefined || v === null || Number.isNaN(v)) return null;
            const x = e.x(i) + ranura * 0.11 + j * anchoBarra;
            return (
              <g key={`${p.pliegue}-${m}`}>
                <rect
                  x={x}
                  y={e.y(v)}
                  width={Math.max(anchoBarra - 1.5, 1)}
                  height={Math.max(e.y(0) - e.y(v), 0)}
                  fill={PALETA[j % PALETA.length]}
                  opacity={0.85}
                  rx={1.5}
                />
                <title>
                  Pliegue {p.pliegue} ({p.n_test} muestras desde {p.test_desde}) — {m}: MAE {v != null ? v.toFixed(4) : '—'}
                </title>
              </g>
            );
          }),
        )}
      </svg>
      <Leyenda entradas={modelos.map((m, j) => ({ nombre: m, color: PALETA[j % PALETA.length] }))} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// G5 — Predicho frente a observado
// ---------------------------------------------------------------------------

export const DispersionPrediccion: React.FC<{
  puntos: { obs: number; pred: number }[];
  umbral: number;
  modelo: string;
  alto?: number;
}> = ({ puntos, umbral, modelo, alto = 330 }) => {
  const ancho = 880;
  const max = Math.max(...puntos.flatMap((p) => [p.obs, p.pred])) * 1.05;
  const e = crearEscala([0, max], [0, max], ancho, alto);
  const ticks = Array.from({ length: 5 }, (_, i) => (max * i) / 4);

  // Cuadrantes de decisión: lo que importa no es la distancia a la diagonal,
  // sino si el modelo y la realidad caen del mismo lado del umbral.
  const fn = puntos.filter((p) => p.obs >= umbral && p.pred < umbral).length;
  const fp = puntos.filter((p) => p.obs < umbral && p.pred >= umbral).length;
  const vp = puntos.filter((p) => p.obs >= umbral && p.pred >= umbral).length;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Predicho frente a observado, ${modelo}`}>
        <Rejilla e={e} ticksY={ticks} ticksX={ticks.map((t) => ({ v: t, etiqueta: fmt(t, 0) }))} />
        <EjeY e={e} etiqueta="Predicho [µg/L]" />
        {/* Zona de falso negativo: observado sobre umbral, predicho por debajo */}
        <rect
          x={e.x(umbral)}
          y={e.y(umbral)}
          width={Math.max(e.x(max) - e.x(umbral), 0)}
          height={Math.max(e.y(0) - e.y(umbral), 0)}
          fill="rgba(239,68,68,0.10)"
        />
        <text x={e.x(umbral) + 8} y={e.y(0) - 8} fill="#fca5a5" fontSize={9} fontWeight={600}>
          Falsos negativos: {fn} — floraciones no avisadas
        </text>
        <line x1={e.x(0)} y1={e.y(0)} x2={e.x(max)} y2={e.y(max)} stroke="#64748b" strokeWidth={1.1} strokeDasharray="4 3" />
        <text x={e.x(max) - 8} y={e.y(max) + 14} textAnchor="end" fill="#94a3b8" fontSize={9}>
          Diagonal: predicción perfecta
        </text>
        <line x1={e.x(umbral)} y1={e.y(0)} x2={e.x(umbral)} y2={e.y(max)} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={e.x(0)} y1={e.y(umbral)} x2={e.x(max)} y2={e.y(umbral)} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3" />
        {puntos.map((p, i) => {
          const malo = (p.obs >= umbral) !== (p.pred >= umbral);
          return (
            <circle
              key={i}
              cx={e.x(p.obs)}
              cy={e.y(p.pred)}
              r={malo ? 2.4 : 1.7}
              fill={malo ? '#ef4444' : '#22d3ee'}
              opacity={malo ? 0.8 : 0.42}
            />
          );
        })}
        <text x={ancho / 2} y={alto - 4} textAnchor="middle" className="fill-slate-400" fontSize={10} fontWeight={500}>
          Observado [µg/L]
        </text>
      </svg>
      <Leyenda
        entradas={[
          { nombre: 'Mismo lado del umbral que la realidad', color: '#22d3ee' },
          { nombre: `Lado equivocado: ${fn} falsos negativos, ${fp} falsas alarmas`, color: '#ef4444' },
          { nombre: `Aciertos sobre umbral: ${vp}`, color: '#f59e0b' },
        ]}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// G6 — Cascada de contribuciones de Shapley
// ---------------------------------------------------------------------------

export const CascadaShapley: React.FC<{
  base: number;
  contribuciones: { rasgo: string; contribucion: number; valor: number }[];
  prediccion: number;
  alto?: number;
}> = ({ base, contribuciones, prediccion, alto = 330 }) => {
  const ancho = 880;
  const pasos = [...contribuciones].slice(0, 10);

  // Recorrido acumulado desde el valor esperado hasta la predicción
  let acc = base;
  const barras = pasos.map((c) => {
    const desde = acc;
    acc += c.contribucion;
    return { ...c, desde, hasta: acc };
  });
  const resto = prediccion - acc;

  const vs = [base, prediccion, ...barras.flatMap((b) => [b.desde, b.hasta])];
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const margen = (hi - lo) * 0.12 || 0.5;
  const filas = barras.length + 2;
  const e = crearEscala([lo - margen, hi + margen], [0, filas], ancho, alto, IZQ_ETIQUETAS);
  const altoBarra = Math.max((e.y(0) - e.y(1)) * 0.62, 6);
  const ticks = Array.from({ length: 5 }, (_, i) => lo - margen + ((hi - lo + 2 * margen) * i) / 4);

  const etiqueta = (i: number, txt: string) => (
    <text x={e.izquierda - 8} y={e.y(filas - i - 0.5) + 3.5} textAnchor="end" className="fill-slate-400" fontSize={9.5}>
      {txt.length > 18 ? `${txt.slice(0, 17)}…` : txt}
      <title>{txt}</title>
    </text>
  );

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Contribuciones de Shapley">
        <Rejilla e={e} ticksY={[]} ticksX={ticks.map((t) => ({ v: t, etiqueta: fmt(t, 1) }))} />
        <line x1={e.x(base)} x2={e.x(base)} y1={M.top} y2={alto - M.bottom} stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" />
        {/* El eje X real es x = 0, no el borde del area de dibujo */}
        {/* Valor esperado */}
        <rect x={e.x(Math.min(base, 0))} y={e.y(filas - 0.5) - altoBarra / 2} width={Math.abs(e.x(base) - e.x(0))} height={altoBarra} fill="#64748b" opacity={0.55} rx={2} />
        {etiqueta(0, 'Valor esperado')}
        {barras.map((b, i) => {
          const x0 = e.x(Math.min(b.desde, b.hasta));
          const w = Math.abs(e.x(b.hasta) - e.x(b.desde));
          return (
            <g key={b.rasgo}>
              <rect
                x={x0}
                y={e.y(filas - (i + 1) - 0.5) - altoBarra / 2}
                width={Math.max(w, 1.2)}
                height={altoBarra}
                fill={b.contribucion >= 0 ? '#ef4444' : '#22d3ee'}
                opacity={0.82}
                rx={2}
              />
              {etiqueta(i + 1, b.rasgo)}
              <title>
                {b.rasgo} = {b.valor} → contribuye {b.contribucion >= 0 ? '+' : ''}
                {b.contribucion != null ? b.contribucion.toFixed(4) : '—'} µg/L
              </title>
            </g>
          );
        })}
        {/* Predicción final */}
        <rect
          x={e.x(Math.min(prediccion, 0))}
          y={e.y(0.5) - altoBarra / 2}
          width={Math.abs(e.x(prediccion) - e.x(0))}
          height={altoBarra}
          fill="#a78bfa"
          opacity={0.75}
          rx={2}
        />
        {etiqueta(filas - 1, 'Predicción')}
        <text x={ancho / 2} y={alto - 4} textAnchor="middle" className="fill-slate-400" fontSize={10} fontWeight={500}>
          Incremento de clorofila-a previsto [µg/L]
        </text>
      </svg>
      <Leyenda
        entradas={[
          { nombre: 'Empuja el pronóstico al alza', color: '#ef4444' },
          { nombre: 'Lo empuja a la baja', color: '#22d3ee' },
          { nombre: 'Valor esperado del modelo', color: '#64748b' },
          { nombre: `Predicción final${resto != null && Math.abs(resto) > 0.01 ? ` (resto de rasgos: ${resto >= 0 ? '+' : ''}${resto.toFixed(3)})` : ''}`, color: '#a78bfa' },
        ]}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Importancia global por permutación (acompaña a G6)
// ---------------------------------------------------------------------------

export const BarrasImportancia: React.FC<{
  datos: { rasgo: string; aumento_mae: number; desv: number }[];
  alto?: number;
}> = ({ datos, alto = 260 }) => {
  const ancho = 880;
  const max = Math.max(...datos.map((d) => (d.aumento_mae || 0) + (d.desv || 0)), 0.001);
  const min = Math.min(...datos.map((d) => (d.aumento_mae || 0) - (d.desv || 0)), 0);
  const e = crearEscala([min, max], [0, datos.length], ancho, alto, IZQ_ETIQUETAS);
  const altoBarra = Math.max((e.y(0) - e.y(1)) * 0.6, 5);
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Importancia por permutación">
        <Rejilla e={e} ticksY={[]} ticksX={ticks.map((t) => ({ v: t, etiqueta: t != null ? t.toFixed(3) : '—' }))} />
        <line x1={e.x(0)} x2={e.x(0)} y1={M.top} y2={alto - M.bottom} stroke="#64748b" strokeWidth={1} />
        {datos.map((d, i) => {
          const y = e.y(datos.length - i - 0.5);
          return (
            <g key={d.rasgo}>
              <rect
                x={e.x(Math.min(0, d.aumento_mae || 0))}
                y={y - altoBarra / 2}
                width={Math.max(Math.abs(e.x(d.aumento_mae || 0) - e.x(0)), 1)}
                height={altoBarra}
                fill={(d.aumento_mae || 0) > 0 ? '#34d399' : '#64748b'}
                opacity={0.8}
                rx={2}
              />
              <line
                x1={e.x((d.aumento_mae || 0) - (d.desv || 0))}
                x2={e.x((d.aumento_mae || 0) + (d.desv || 0))}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={0.9}
                opacity={0.6}
              />
              <text x={e.izquierda - 8} y={y + 3.5} textAnchor="end" className="fill-slate-400" fontSize={9.5}>
                {d.rasgo.length > 18 ? `${d.rasgo.slice(0, 17)}…` : d.rasgo}
                <title>{d.rasgo}</title>
              </text>
              <title>
                {d.rasgo}: barajarlo empeora el MAE en {d.aumento_mae != null ? d.aumento_mae.toFixed(4) : '—'} ± {d.desv != null ? d.desv.toFixed(4) : '—'} µg/L
              </title>
            </g>
          );
        })}
        <text x={ancho / 2} y={alto - 4} textAnchor="middle" className="fill-slate-400" fontSize={10} fontWeight={500}>
          Aumento del MAE al permutar el rasgo [µg/L]
        </text>
      </svg>
      <Leyenda
        entradas={[
          { nombre: 'El rasgo aporta: barajarlo empeora el error', color: '#34d399' },
          { nombre: 'No aporta o el efecto es nulo', color: '#64748b' },
          { nombre: 'Línea clara: ± 1 desviación entre repeticiones', color: '#e2e8f0' },
        ]}
      />
    </div>
  );
};
