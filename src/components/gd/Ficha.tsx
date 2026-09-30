import React, { ReactNode, useState } from 'react';
import { ChevronDown, BookOpen, Table2, Info } from 'lucide-react';
import { COLOR_RIESGO, ICONO_RIESGO, NivelRiesgo } from '../../gd/dominio';

/**
 * Framework de interpretabilidad y explicabilidad.
 *
 * Requisito del proyecto: *toda* figura y *toda* tabla generada debe contener
 * interpretabilidad y explicabilidad. Se resuelve de forma **estructural**, no
 * decorativa: las figuras y las tablas no se renderizan sueltas, sino a través
 * de `<Figura>` y `<TablaExplicada>`, que **exigen** una `Ficha` como prop.
 *
 * Si alguien intenta publicar una figura sin explicación, TypeScript no compila.
 *
 * Distinción que se aplica en todo el motor:
 *
 * - **Interpretabilidad** — el resultado se entiende por construcción:
 *   unidades en los ejes, umbrales dibujados con su norma, fórmulas visibles,
 *   reglas legibles. Es una propiedad del diseño.
 * - **Explicabilidad** — se puede responder *por qué* el modelo dio ESTE
 *   resultado para ESTE caso: contribuciones, reglas disparadas,
 *   contrafactuales. Es una propiedad de la salida.
 */
export interface Ficha {
  /** Enunciado del hallazgo, no una etiqueta genérica. */
  titulo: string;
  /** Qué representa: variable, unidad, cobertura espacial y temporal. */
  queMuestra: string;
  /** Cómo se descodifica: ejes, colores, líneas de referencia, marcas. */
  comoLeer: string;
  /** Lectura del dato concreto de *ahora*. Se calcula en cada render. */
  hallazgo: string;
  /** Norma o umbral con el que se juzga, citando la fuente. */
  criterio: string;
  /** De dónde salen los números y qué transformaciones sufrieron. */
  procedencia: string;
  /** Qué NO se puede concluir. La honestidad sobre la incertidumbre es parte
   *  de la interpretabilidad, no un descargo de responsabilidad. */
  limitaciones: string;
}

/** Documentación de una columna: sin definición y unidad, una tabla no es
 *  interpretable por mucho que los encabezados parezcan claros a quien la hizo. */
export interface ColumnaDoc<T = Record<string, unknown>> {
  clave: string;
  titulo: string;
  definicion: string;
  unidad?: string;
  origen?: string;
  alinear?: 'left' | 'right' | 'center';
  render?: (fila: T) => ReactNode;
}

const CAMPOS: { clave: keyof Ficha; etiqueta: string }[] = [
  { clave: 'queMuestra', etiqueta: 'Qué muestra' },
  { clave: 'comoLeer', etiqueta: 'Cómo leerla' },
  { clave: 'hallazgo', etiqueta: 'Hallazgo' },
  { clave: 'criterio', etiqueta: 'Criterio de referencia' },
  { clave: 'procedencia', etiqueta: 'Procedencia del dato' },
  { clave: 'limitaciones', etiqueta: 'Limitaciones' },
];

/** Convierte **negritas** de markdown ligero en <strong>. */
function conNegritas(texto: string): ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i} className="text-slate-100 font-semibold">{p.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    ),
  );
}

const BloqueFicha: React.FC<{ ficha: Ficha; abiertoPorDefecto?: boolean }> = ({
  ficha,
  abiertoPorDefecto = true,
}) => {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
  return (
    <div className="mt-3 border-l-2 border-cyan-500/70 bg-cyan-500/[0.045] rounded-r-lg">
      <button
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-3.5 py-2 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5 shrink-0" />
        <span>Interpretación y explicabilidad</span>
        <ChevronDown
          className={`w-3.5 h-3.5 ml-auto transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>
      {abierto && (
        <dl className="px-3.5 pb-3 space-y-2 text-[11.5px] leading-relaxed">
          {CAMPOS.map(({ clave, etiqueta }) => (
            <div key={clave}>
              <dt className="text-cyan-400/90 font-semibold inline">{etiqueta}. </dt>
              <dd className="text-slate-300 inline">{conNegritas(ficha[clave])}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

/**
 * Publica una figura junto a su ficha. Es la única vía para mostrar un gráfico
 * en este módulo: no hay ninguna figura suelta fuera de este componente.
 */
export const Figura: React.FC<{ ficha: Ficha; children: ReactNode; acciones?: ReactNode }> = ({
  ficha,
  children,
  acciones,
}) => (
  <figure className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
    <figcaption className="flex items-start justify-between gap-3 mb-3">
      <h4 className="text-sm font-semibold text-slate-100 leading-snug">{ficha.titulo}</h4>
      {acciones}
    </figcaption>
    <div className="overflow-x-auto">{children}</div>
    <BloqueFicha ficha={ficha} />
  </figure>
);

/**
 * Publica una tabla junto a su ficha y su diccionario de datos.
 * El diccionario es obligatorio por el mismo motivo que la ficha.
 */
export function TablaExplicada<T extends Record<string, unknown>>({
  ficha,
  columnas,
  datos,
  maxAltura,
  claveFila,
}: {
  ficha: Ficha;
  columnas: ColumnaDoc<T>[];
  datos: T[];
  maxAltura?: string;
  claveFila?: (fila: T, i: number) => string;
}) {
  const [dicc, setDicc] = useState(false);

  return (
    <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="text-sm font-semibold text-slate-100 leading-snug">{ficha.titulo}</h4>
        <span className="text-[10px] font-mono text-slate-500 shrink-0 pt-0.5">
          {datos.length} fila{datos.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-800" style={{ maxHeight: maxAltura }}>
        <table className="w-full text-[11.5px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-950">
              {columnas.map((c) => (
                <th
                  key={c.clave}
                  scope="col"
                  title={`${c.definicion}${c.unidad ? ` — Unidad: ${c.unidad}` : ''}`}
                  className={`px-2.5 py-2 font-semibold text-slate-300 border-b border-slate-800 whitespace-nowrap ${
                    c.alinear === 'right' ? 'text-right' : c.alinear === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {c.titulo}
                  {c.unidad && c.unidad !== '—' && (
                    <span className="ml-1 font-normal text-slate-500 font-mono">[{c.unidad}]</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.map((fila, i) => (
              <tr
                key={claveFila ? claveFila(fila, i) : i}
                className="odd:bg-slate-900/40 hover:bg-slate-800/50 transition-colors"
              >
                {columnas.map((c) => (
                  <td
                    key={c.clave}
                    className={`px-2.5 py-1.5 border-b border-slate-800/60 text-slate-300 align-top ${
                      c.alinear === 'right'
                        ? 'text-right font-mono tabular-nums'
                        : c.alinear === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }`}
                  >
                    {c.render ? c.render(fila) : String(fila[c.clave] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {!datos.length && (
              <tr>
                <td colSpan={columnas.length} className="px-3 py-6 text-center text-slate-500">
                  Sin registros para los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BloqueFicha ficha={ficha} />

      <div className="mt-2">
        <button
          onClick={() => setDicc(!dicc)}
          aria-expanded={dicc}
          className="w-full flex items-center gap-2 px-3.5 py-2 text-[11px] font-semibold text-slate-400 hover:text-slate-200 border-l-2 border-slate-700 bg-slate-800/30 rounded-r-lg transition-colors"
        >
          <Table2 className="w-3.5 h-3.5 shrink-0" />
          <span>Diccionario de datos (definición, unidad y origen de cada columna)</span>
          <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${dicc ? 'rotate-180' : ''}`} />
        </button>
        {dicc && (
          <div className="mt-1 overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-slate-950 text-slate-400">
                  <th scope="col" className="px-2.5 py-1.5 text-left font-semibold">Columna</th>
                  <th scope="col" className="px-2.5 py-1.5 text-left font-semibold">Definición</th>
                  <th scope="col" className="px-2.5 py-1.5 text-left font-semibold">Unidad</th>
                  <th scope="col" className="px-2.5 py-1.5 text-left font-semibold">Origen</th>
                </tr>
              </thead>
              <tbody>
                {columnas.map((c) => (
                  <tr key={c.clave} className="odd:bg-slate-900/40">
                    <td className="px-2.5 py-1.5 text-slate-200 font-medium whitespace-nowrap">{c.titulo}</td>
                    <td className="px-2.5 py-1.5 text-slate-400">{c.definicion}</td>
                    <td className="px-2.5 py-1.5 text-slate-400 font-mono">{c.unidad ?? '—'}</td>
                    <td className="px-2.5 py-1.5 text-slate-400">{c.origen ?? 'Motor del GD'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/** Bloque de método para cálculos que merecen explicarse aparte. */
export const NotaMetodologica: React.FC<{ titulo: string; children: ReactNode }> = ({
  titulo,
  children,
}) => {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="border border-slate-800 rounded-xl bg-slate-900/50">
      <button
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
      >
        <Info className="w-4 h-4 text-cyan-400 shrink-0" />
        <span>Nota metodológica — {titulo}</span>
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="px-4 pb-4 text-[11.5px] leading-relaxed text-slate-300 space-y-2">{children}</div>
      )}
    </div>
  );
};

/**
 * Etiqueta de riesgo con **icono y texto**, no solo color.
 * Codificar el riesgo únicamente por color excluye a quien tiene deficiencia en
 * la visión cromática: la redundancia es un requisito de accesibilidad.
 */
export const BadgeRiesgo: React.FC<{ nivel: NivelRiesgo; compacto?: boolean }> = ({
  nivel,
  compacto,
}) => {
  const color = COLOR_RIESGO[nivel];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold border ${
        compacto ? 'px-1.5 py-0 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
      }`}
      style={{ color, borderColor: `${color}66`, background: `${color}1f` }}
    >
      <span aria-hidden="true">{ICONO_RIESGO[nivel]}</span>
      {nivel}
    </span>
  );
};
