import React, { useMemo, useState } from 'react';
import { COLOR_CALIDAD, Variable } from '../../gd/dominio';

/**
 * Figuras del motor del GD, en SVG a mano.
 *
 * Se construyen sin librería de gráficas por dos razones: no añadir
 * dependencias al proyecto, y poder controlar exactamente las anotaciones que
 * hacen la figura interpretable —líneas de umbral rotuladas con su valor y su
 * norma, marcas de calidad del dato, huecos representados como huecos—.
 *
 * Regla transversal: **ningún eje sin unidad y ninguna serie sin leyenda**.
 */

const M = { top: 14, right: 18, bottom: 34, left: 56 };

interface Escala {
  x: (v: number) => number;
  y: (v: number) => number;
  ancho: number;
  alto: number;
}

function crearEscala(
  xs: [number, number],
  ys: [number, number],
  ancho: number,
  alto: number,
): Escala {
  const [x0, x1] = xs;
  const [y0, y1] = ys;
  const dx = x1 - x0 || 1;
  const dy = y1 - y0 || 1;
  return {
    x: (v) => M.left + ((v - x0) / dx) * (ancho - M.left - M.right),
    y: (v) => alto - M.bottom - ((v - y0) / dy) * (alto - M.top - M.bottom),
    ancho,
    alto,
  };
}

const fmt = (v: number, d = 1) =>
  Math.abs(v) >= 10000 ? v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : v.toFixed(d);

const Rejilla: React.FC<{ e: Escala; ticksY: number[]; ticksX?: { v: number; etiqueta: string }[] }> = ({
  e,
  ticksY,
  ticksX,
}) => (
  <g>
    {ticksY.map((t) => (
      <g key={`y${t}`}>
        <line x1={M.left} x2={e.ancho - M.right} y1={e.y(t)} y2={e.y(t)} stroke="rgba(148,163,184,0.14)" />
        <text x={M.left - 7} y={e.y(t) + 3.5} textAnchor="end" className="fill-slate-500" fontSize={9.5}>
          {fmt(t, Math.abs(t) < 10 ? 1 : 0)}
        </text>
      </g>
    ))}
    {ticksX?.map((t) => (
      <text
        key={`x${t.v}`}
        x={e.x(t.v)}
        y={e.alto - M.bottom + 14}
        textAnchor="middle"
        className="fill-slate-500"
        fontSize={9.5}
      >
        {t.etiqueta}
      </text>
    ))}
  </g>
);

/** Líneas de umbral con su valor rotulado. Un gráfico con el umbral dibujado se
 *  interpreta solo; uno sin él obliga a recordar la norma de memoria. */
const Umbrales: React.FC<{ e: Escala; v: Variable; rango: [number, number] }> = ({ e, v, rango }) => (
  <g>
    {([
      [v.umbralAtencion, 'Atención', '#f59e0b'],
      [v.umbralCritico, 'Crítico', '#ef4444'],
    ] as [number | undefined, string, string][]).map(([valor, etiqueta, color]) =>
      valor === undefined || valor < rango[0] || valor > rango[1] ? null : (
        <g key={etiqueta}>
          <line
            x1={M.left}
            x2={e.ancho - M.right}
            y1={e.y(valor)}
            y2={e.y(valor)}
            stroke={color}
            strokeWidth={1.2}
            strokeDasharray="5 3"
          />
          <text x={M.left + 5} y={e.y(valor) - 4} fill={color} fontSize={9} fontWeight={600}>
            {etiqueta}: {fmt(valor, valor < 10 ? 1 : 0)} {v.unidad}
          </text>
        </g>
      ),
    )}
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

const PALETA = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#60a5fa'];

// ---------------------------------------------------------------------------
// 1. Serie temporal multi-estación
// ---------------------------------------------------------------------------

export interface PuntoSerie {
  t: number;
  valor: number;
  calidad: 'bueno' | 'sospechoso' | 'malo';
}

export const SerieTemporal: React.FC<{
  series: { nombre: string; puntos: PuntoSerie[] }[];
  variable: Variable;
  alto?: number;
}> = ({ series, variable, alto = 260 }) => {
  const ancho = 860;

  const { e, ticksY, ticksX, rango } = useMemo(() => {
    const todos = series.flatMap((s) => s.puntos).filter((p) => Number.isFinite(p.valor));
    const ts = todos.map((p) => p.t);
    const vs = todos.map((p) => p.valor);
    const umbrales = [variable.umbralAtencion, variable.umbralCritico].filter(
      (u): u is number => u !== undefined,
    );

    const vMin = Math.min(...vs, ...umbrales);
    const vMax = Math.max(...vs, ...umbrales);
    const pad = (vMax - vMin) * 0.08 || 1;
    const rango: [number, number] = [vMin - pad, vMax + pad];

    const esc = crearEscala([Math.min(...ts), Math.max(...ts)], rango, ancho, alto);
    const ticksY = Array.from({ length: 5 }, (_, i) => rango[0] + ((rango[1] - rango[0]) * i) / 4);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    const ticksX = Array.from({ length: 5 }, (_, i) => {
      const v = t0 + ((t1 - t0) * i) / 4;
      return { v, etiqueta: new Date(v).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) };
    });
    return { e: esc, ticksY, ticksX, rango };
  }, [series, variable, alto]);

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Serie temporal de ${variable.nombre}`}>
        <Rejilla e={e} ticksY={ticksY} ticksX={ticksX} />
        <Umbrales e={e} v={variable} rango={rango} />
        <EjeY e={e} etiqueta={`${variable.nombre} [${variable.unidad}]`} />

        {series.map((s, i) => {
          // Los huecos se dibujan como huecos: se corta el trazo en cada dato
          // no válido en vez de unir por encima como si nada faltara.
          const tramos: PuntoSerie[][] = [];
          let actual: PuntoSerie[] = [];
          s.puntos.forEach((p) => {
            if (Number.isFinite(p.valor) && p.calidad !== 'malo') actual.push(p);
            else if (actual.length) { tramos.push(actual); actual = []; }
          });
          if (actual.length) tramos.push(actual);

          const color = PALETA[i % PALETA.length];
          return (
            <g key={s.nombre}>
              {tramos.map((tr, k) => (
                <path
                  key={k}
                  d={tr.map((p, j) => `${j ? 'L' : 'M'}${e.x(p.t).toFixed(1)},${e.y(p.valor).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.4}
                  opacity={0.92}
                />
              ))}
              {/* Registros sospechosos: se muestran, no se esconden */}
              {s.puntos
                .filter((p) => p.calidad === 'sospechoso' && Number.isFinite(p.valor))
                .map((p, k) => (
                  <g key={`sos${k}`} transform={`translate(${e.x(p.t)} ${e.y(p.valor)})`}>
                    <line x1={-3} y1={-3} x2={3} y2={3} stroke={COLOR_CALIDAD.sospechoso} strokeWidth={1.6} />
                    <line x1={-3} y1={3} x2={3} y2={-3} stroke={COLOR_CALIDAD.sospechoso} strokeWidth={1.6} />
                  </g>
                ))}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[10px] text-slate-400">
        {series.map((s, i) => (
          <span key={s.nombre} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded" style={{ background: PALETA[i % PALETA.length] }} />
            {s.nombre}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span style={{ color: COLOR_CALIDAD.sospechoso }}>✕</span> dato sospechoso
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">línea cortada = hueco de datos</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. Barras horizontales (contribución de reglas, importancia global)
// ---------------------------------------------------------------------------

export interface BarraDato {
  etiqueta: string;
  valor: number;
  color: string;
  detalle?: string;
  atenuada?: boolean;
}

export const BarrasHorizontales: React.FC<{
  datos: BarraDato[];
  etiquetaX: string;
  divergente?: boolean;
}> = ({ datos, etiquetaX, divergente = false }) => {
  const [hover, setHover] = useState<number | null>(null);
  const filaAlto = 26;
  const alto = datos.length * filaAlto + 44;
  const ancho = 860;
  const izq = 250;

  // Se reservan 52 px a la derecha para la etiqueta numérica: sin ese margen,
  // el valor de la barra más larga se dibuja fuera del lienzo y se corta.
  const espacioEtiqueta = 52;
  const max = Math.max(...datos.map((d) => Math.abs(d.valor)), 1e-9);
  const disponible = ancho - M.right - izq - espacioEtiqueta;
  const x0 = divergente ? izq + disponible / 2 : izq;
  const util = divergente ? disponible / 2 : disponible;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={etiquetaX}>
        {divergente && (
          <line x1={x0} x2={x0} y1={8} y2={alto - 32} stroke="rgba(148,163,184,0.45)" strokeWidth={1} />
        )}
        {datos.map((d, i) => {
          const y = 8 + i * filaAlto;
          const w = (Math.abs(d.valor) / max) * util;
          const x = divergente && d.valor < 0 ? x0 - w : x0;
          return (
            <g
              key={d.etiqueta}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: d.detalle ? 'help' : 'default' }}
            >
              {hover === i && (
                <rect x={0} y={y - 2} width={ancho} height={filaAlto - 2} fill="rgba(148,163,184,0.07)" />
              )}
              <text x={izq - 10} y={y + 14} textAnchor="end" className="fill-slate-300" fontSize={10.5}>
                {d.etiqueta.length > 42 ? `${d.etiqueta.slice(0, 41)}…` : d.etiqueta}
                {d.detalle && <title>{d.detalle}</title>}
              </text>
              <rect
                x={x}
                y={y + 3}
                width={Math.max(w, d.valor === 0 ? 0 : 1.5)}
                height={filaAlto - 12}
                rx={2.5}
                fill={d.color}
                opacity={d.atenuada ? 0.32 : 0.92}
              >
                {d.detalle && <title>{d.detalle}</title>}
              </rect>
              <text
                x={divergente && d.valor < 0 ? x - 6 : x + w + 6}
                y={y + 14}
                textAnchor={divergente && d.valor < 0 ? 'end' : 'start'}
                className="fill-slate-400 font-mono"
                fontSize={9.5}
              >
                {d.valor === 0 ? '—' : `${d.valor > 0 && divergente ? '+' : ''}${fmt(d.valor, 2)}`}
              </text>
            </g>
          );
        })}
        <text x={ancho / 2} y={alto - 8} textAnchor="middle" className="fill-slate-400" fontSize={10}>
          {etiquetaX}
        </text>
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. Cascada (explicabilidad local)
// ---------------------------------------------------------------------------

export const Cascada: React.FC<{
  base: number;
  pasos: { etiqueta: string; delta: number }[];
  etiquetaFinal: string;
  unidad: string;
}> = ({ base, pasos, etiquetaFinal, unidad }) => {
  const ancho = 860;
  const alto = 300;
  const n = pasos.length + 2;
  const bw = (ancho - M.left - M.right) / n;

  const acumulados: { desde: number; hasta: number }[] = [];
  let acc = base;
  pasos.forEach((p) => {
    acumulados.push({ desde: acc, hasta: acc + p.delta });
    acc += p.delta;
  });
  const total = acc;

  const valores = [base, total, ...acumulados.flatMap((a) => [a.desde, a.hasta]), 0];
  const vMin = Math.min(...valores);
  const vMax = Math.max(...valores);
  const pad = (vMax - vMin) * 0.15 || 1;
  const e = crearEscala([0, n], [vMin - pad, vMax + pad], ancho, alto);
  const ticksY = Array.from({ length: 5 }, (_, i) => vMin - pad + ((vMax - vMin + 2 * pad) * i) / 4);

  const barra = (i: number, y0: number, y1: number, color: string, etiqueta: string, valor: number, mostrarSigno: boolean) => {
    const x = e.x(i) + bw * 0.18;
    const w = bw * 0.64;
    const yTop = Math.min(e.y(y0), e.y(y1));
    const h = Math.max(Math.abs(e.y(y0) - e.y(y1)), 2);
    return (
      <g key={`${etiqueta}-${i}`}>
        <rect x={x} y={yTop} width={w} height={h} rx={2} fill={color} opacity={0.9}>
          <title>{`${etiqueta}: ${mostrarSigno && valor > 0 ? '+' : ''}${valor.toFixed(2)} ${unidad}`}</title>
        </rect>
        <text x={x + w / 2} y={yTop - 5} textAnchor="middle" className="fill-slate-300 font-mono" fontSize={9}>
          {mostrarSigno && valor > 0 ? '+' : ''}{valor.toFixed(1)}
        </text>
        <text
          x={e.x(i) + bw / 2}
          y={alto - M.bottom + 12}
          textAnchor="end"
          className="fill-slate-400"
          fontSize={8.5}
          transform={`rotate(-32 ${e.x(i) + bw / 2} ${alto - M.bottom + 12})`}
        >
          {etiqueta.length > 22 ? `${etiqueta.slice(0, 21)}…` : etiqueta}
        </text>
      </g>
    );
  };

  return (
    <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Descomposición de la predicción">
      <Rejilla e={e} ticksY={ticksY} />
      <line x1={M.left} x2={ancho - M.right} y1={e.y(0)} y2={e.y(0)} stroke="rgba(148,163,184,0.5)" strokeWidth={1} />
      <EjeY e={e} etiqueta={`Incremento [${unidad}]`} />

      {barra(0, 0, base, '#06b6d4', 'Cambio base', base, true)}
      {acumulados.map((a, i) =>
        barra(i + 1, a.desde, a.hasta, pasos[i].delta >= 0 ? '#ef4444' : '#22c55e', pasos[i].etiqueta, pasos[i].delta, true),
      )}
      {barra(n - 1, 0, total, '#06b6d4', etiquetaFinal, total, true)}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// 4. Línea simple (barrido contrafactual)
// ---------------------------------------------------------------------------

export const LineaBarrido: React.FC<{
  puntos: { x: number; y: number }[];
  etiquetaX: string;
  etiquetaY: string;
  objetivo: number;
  valorActual: number;
  valorNecesario?: number;
}> = ({ puntos, etiquetaX, etiquetaY, objetivo, valorActual, valorNecesario }) => {
  const ancho = 860;
  const alto = 250;

  const xs = puntos.map((p) => p.x);
  const ys = [...puntos.map((p) => p.y), objetivo];
  const rangoY: [number, number] = [Math.min(...ys) * 0.95, Math.max(...ys) * 1.05];
  const e = crearEscala([Math.min(...xs), Math.max(...xs)], rangoY, ancho, alto);
  const ticksY = Array.from({ length: 5 }, (_, i) => rangoY[0] + ((rangoY[1] - rangoY[0]) * i) / 4);
  const ticksX = Array.from({ length: 5 }, (_, i) => {
    const v = Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 4;
    return { v, etiqueta: fmt(v, 3) };
  });

  const linVert = (v: number, color: string, texto: string, dash: string) => (
    <g>
      <line x1={e.x(v)} x2={e.x(v)} y1={M.top} y2={alto - M.bottom} stroke={color} strokeWidth={1.2} strokeDasharray={dash} />
      <text x={e.x(v) + 4} y={M.top + 10} fill={color} fontSize={9} fontWeight={600}>{texto}</text>
    </g>
  );

  return (
    <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Análisis contrafactual">
      <Rejilla e={e} ticksY={ticksY} ticksX={ticksX} />
      <EjeY e={e} etiqueta={etiquetaY} />
      <line x1={M.left} x2={ancho - M.right} y1={e.y(objetivo)} y2={e.y(objetivo)} stroke="#f59e0b" strokeWidth={1.3} strokeDasharray="5 3" />
      <text x={ancho - M.right - 4} y={e.y(objetivo) - 5} textAnchor="end" fill="#f59e0b" fontSize={9} fontWeight={600}>
        Objetivo: {objetivo} µg/L
      </text>
      <path
        d={puntos.map((p, i) => `${i ? 'L' : 'M'}${e.x(p.x).toFixed(1)},${e.y(p.y).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={2}
      />
      {linVert(valorActual, '#94a3b8', `Actual: ${fmt(valorActual, 3)}`, '2 3')}
      {valorNecesario !== undefined && Number.isFinite(valorNecesario) &&
        linVert(valorNecesario, '#22c55e', `Necesario: ${fmt(valorNecesario, 3)}`, '5 3')}
      <text x={ancho / 2} y={alto - 6} textAnchor="middle" className="fill-slate-400" fontSize={10}>
        {etiquetaX}
      </text>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// 5. Validación: real vs. pronóstico vs. persistencia
// ---------------------------------------------------------------------------

export const SerieValidacion: React.FC<{
  real: number[];
  pronostico: number[];
  persistencia: number[];
  tiempos: number[];
  variable: Variable;
}> = ({ real, pronostico, persistencia, tiempos, variable }) => {
  const ancho = 860;
  const alto = 270;

  const todos = [...real, ...pronostico, ...persistencia].filter(Number.isFinite);
  const umbrales = [variable.umbralAtencion, variable.umbralCritico].filter(
    (u): u is number => u !== undefined,
  );
  const vMin = Math.min(...todos, ...umbrales);
  const vMax = Math.max(...todos, ...umbrales);
  const pad = (vMax - vMin) * 0.08 || 1;
  const rango: [number, number] = [vMin - pad, vMax + pad];

  const e = crearEscala([Math.min(...tiempos), Math.max(...tiempos)], rango, ancho, alto);
  const ticksY = Array.from({ length: 5 }, (_, i) => rango[0] + ((rango[1] - rango[0]) * i) / 4);
  const ticksX = Array.from({ length: 4 }, (_, i) => {
    const v = tiempos[0] + ((tiempos[tiempos.length - 1] - tiempos[0]) * i) / 3;
    return { v, etiqueta: new Date(v).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) };
  });

  const trazo = (vals: number[], color: string, w: number, dash?: string) => (
    <path
      d={vals.map((v, i) => `${i ? 'L' : 'M'}${e.x(tiempos[i]).toFixed(1)},${e.y(v).toFixed(1)}`).join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={w}
      strokeDasharray={dash}
    />
  );

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Validación del pronóstico">
        <Rejilla e={e} ticksY={ticksY} ticksX={ticksX} />
        <Umbrales e={e} v={variable} rango={rango} />
        <EjeY e={e} etiqueta={`${variable.nombre} [${variable.unidad}]`} />
        {trazo(persistencia, '#64748b', 1.1, '2 3')}
        {trazo(pronostico, '#f97316', 1.8, '6 3')}
        {trazo(real, '#22d3ee', 2)}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-cyan-400" /> Valor real observado</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-orange-500" style={{ borderTop: '2px dashed' }} /> Pronóstico del modelo</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-slate-500" /> Referente ingenuo (persistencia)</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 6. Dispersión N:P
// ---------------------------------------------------------------------------

export const DispersionNP: React.FC<{
  puntos: { n: number; p: number; nivel: string; color: string; estacion: string }[];
}> = ({ puntos }) => {
  const ancho = 860;
  const alto = 280;

  const ps = puntos.map((d) => d.p);
  const ns = puntos.map((d) => d.n);
  const rangoX: [number, number] = [0, Math.max(...ps) * 1.1];
  const rangoY: [number, number] = [0, Math.max(...ns) * 1.1];
  const e = crearEscala(rangoX, rangoY, ancho, alto);
  const ticksY = Array.from({ length: 5 }, (_, i) => (rangoY[1] * i) / 4);
  const ticksX = Array.from({ length: 5 }, (_, i) => ({ v: (rangoX[1] * i) / 4, etiqueta: fmt((rangoX[1] * i) / 4, 2) }));

  // Línea de Redfield N:P = 16 y zona de limitación por nitrógeno bajo ella
  const pMax = rangoX[1];
  const redfieldY = Math.min(16 * pMax, rangoY[1]);
  const redfieldX = redfieldY === rangoY[1] ? rangoY[1] / 16 : pMax;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Dispersión nitrógeno frente a fósforo">
        <Rejilla e={e} ticksY={ticksY} ticksX={ticksX} />
        <EjeY e={e} etiqueta="Nitrógeno total [mg/L]" />
        <polygon
          points={`${e.x(0)},${e.y(0)} ${e.x(redfieldX)},${e.y(redfieldY)} ${e.x(rangoX[1])},${e.y(0)}`}
          fill="rgba(239,68,68,0.10)"
        />
        <line x1={e.x(0)} y1={e.y(0)} x2={e.x(redfieldX)} y2={e.y(redfieldY)} stroke="#f59e0b" strokeWidth={1.3} strokeDasharray="5 3" />
        <text x={e.x(redfieldX) - 6} y={e.y(redfieldY) + 12} textAnchor="end" fill="#f59e0b" fontSize={9} fontWeight={600}>
          Redfield N:P = 16
        </text>
        <text x={e.x(rangoX[1] * 0.55)} y={e.y(rangoY[1] * 0.12)} fill="#fca5a5" fontSize={9}>
          Zona de limitación por N — ventaja para cianobacterias
        </text>
        {puntos.map((d, i) => (
          <circle key={i} cx={e.x(d.p)} cy={e.y(d.n)} r={5} fill={d.color} fillOpacity={0.75} stroke={d.color} strokeWidth={1.2}>
            <title>{`${d.estacion}\nN = ${d.n.toFixed(2)} mg/L, P = ${d.p.toFixed(3)} mg/L\nN:P = ${(d.n / Math.max(d.p, 1e-6)).toFixed(1)} — ${d.nivel}`}</title>
          </circle>
        ))}
        <text x={ancho / 2} y={alto - 6} textAnchor="middle" className="fill-slate-400" fontSize={10}>
          Fósforo total [mg/L]
        </text>
      </svg>
    </div>
  );
};
