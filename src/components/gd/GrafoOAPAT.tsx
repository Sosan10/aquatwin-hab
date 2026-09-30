import React, { useMemo } from 'react';
import type { OAPATGraph } from '../../services/oaaptClient';

/**
 * Diagrama del grafo LangGraph, dibujado a partir de lo que el propio grafo
 * declara en `GET /graph` (nodos y aristas). No es un dibujo a mano: si el
 * grafo cambia, el diagrama cambia.
 *
 * Disposición por capas (longitud del camino más largo desde START), que es
 * la forma natural de leer un pipeline con bifurcaciones. Las aristas
 * condicionales van discontinuas. Los nodos por los que pasó la última
 * corrida se resaltan a partir de su `audit_log`.
 */
export const GrafoOAPAT: React.FC<{
  grafo: OAPATGraph;
  nodosRecorridos?: string[];
  nodoPausa?: string | null;
}> = ({ grafo, nodosRecorridos = [], nodoPausa = null }) => {
  const { capas, pos, ancho, alto } = useMemo(() => {
    const nodos = grafo.nodes.filter((n) => n !== '__start__' && n !== '__end__');
    const entrantes = new Map<string, string[]>();
    const salientes = new Map<string, string[]>();
    grafo.edges.forEach((e) => {
      salientes.set(e.source, [...(salientes.get(e.source) ?? []), e.target]);
      entrantes.set(e.target, [...(entrantes.get(e.target) ?? []), e.source]);
    });

    // Capa = longitud del camino más largo desde __start__ (Kahn con relajación)
    const capa = new Map<string, number>();
    const pendientes = new Map<string, number>();
    nodos.forEach((n) => pendientes.set(n, (entrantes.get(n) ?? []).filter((s) => s !== '__start__').length));
    let cola = (salientes.get('__start__') ?? []).filter((n) => nodos.includes(n));
    cola.forEach((n) => capa.set(n, 0));
    while (cola.length) {
      const n = cola.shift()!;
      (salientes.get(n) ?? []).forEach((m) => {
        if (!nodos.includes(m)) return;
        capa.set(m, Math.max(capa.get(m) ?? 0, (capa.get(n) ?? 0) + 1));
        pendientes.set(m, (pendientes.get(m) ?? 1) - 1);
        if ((pendientes.get(m) ?? 0) <= 0 && !cola.includes(m)) cola.push(m);
      });
    }
    nodos.forEach((n) => { if (!capa.has(n)) capa.set(n, 0); });

    const capas: string[][] = [];
    nodos.forEach((n) => {
      const c = capa.get(n) ?? 0;
      (capas[c] = capas[c] ?? []).push(n);
    });

    const cw = 150, ch = 78, mx = 30, my = 26;
    const alto = Math.max(...capas.map((c) => c.length)) * ch + my * 2;
    const ancho = capas.length * cw + mx * 2;
    const pos = new Map<string, { x: number; y: number }>();
    capas.forEach((c, i) => {
      const offset = (alto - c.length * ch) / 2;
      c.forEach((n, j) => pos.set(n, { x: mx + i * cw + 8, y: offset + j * ch + 14 }));
    });
    return { capas, pos, ancho, alto };
  }, [grafo]);

  const recorridos = new Set(nodosRecorridos);
  const W = 128, H = 44;
  const etiqueta = (n: string) => n.replace(/_/g, ' ');

  return (
    <div className="overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Grafo LangGraph del orquestador OAPAT" style={{ minWidth: 900 }}>
        <defs>
          <marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {grafo.edges.map((e, i) => {
          const a = pos.get(e.source), b = pos.get(e.target);
          if (!a || !b) return null;
          const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
          const cx = (x1 + x2) / 2;
          const activa = recorridos.has(e.source) && recorridos.has(e.target);
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
              fill="none"
              stroke={activa ? '#22d3ee' : '#64748b'}
              strokeWidth={activa ? 2 : 1.2}
              strokeDasharray={e.conditional ? '6 4' : undefined}
              opacity={activa ? 0.95 : 0.55}
              markerEnd="url(#flecha)"
            />
          );
        })}

        {capas.flat().map((n) => {
          const p = pos.get(n)!;
          const paso = recorridos.has(n);
          const pausa = nodoPausa === n;
          const color = pausa ? '#f59e0b' : paso ? '#22d3ee' : '#475569';
          return (
            <g key={n} transform={`translate(${p.x} ${p.y})`}>
              <rect
                width={W} height={H} rx={8}
                fill={pausa ? 'rgba(245,158,11,0.16)' : paso ? 'rgba(34,211,238,0.12)' : 'rgba(15,23,42,0.9)'}
                stroke={color} strokeWidth={pausa || paso ? 1.8 : 1}
              />
              <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fontSize={9.5} fontWeight={600}
                    fill={pausa ? '#fcd34d' : paso ? '#cffafe' : '#94a3b8'}>
                {etiqueta(n).length > 22 ? `${etiqueta(n).slice(0, 21)}…` : etiqueta(n)}
                <title>{n}</title>
              </text>
              {pausa && <text x={W / 2} y={H + 12} textAnchor="middle" fontSize={8.5} fill="#fbbf24">⏸ interrupt()</text>}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] text-slate-400">
        <span><span className="inline-block w-3 h-0.5 bg-cyan-400 align-middle mr-1" /> recorrido en la última corrida</span>
        <span><span className="inline-block w-3 border-t border-dashed border-slate-400 align-middle mr-1" /> arista condicional</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded border border-amber-400 align-middle mr-1" /> pausa por aprobación humana</span>
      </div>
    </div>
  );
};
