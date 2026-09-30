import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FlaskConical,
  Loader2,
  Play,
  Sigma,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  ALFA,
  CicloHorizonte,
  ejecutarCRISPDM,
  esSignificativo,
  FilaCorrelacion,
  FilaHiperparametro,
  FilaModelo,
  FilaPliegue,
  FilaPrueba,
  FilaUnivariante,
  fmtP,
  getInformeCRISPDM,
  InformeCRISPDM,
  MESES,
} from '../../gd/crispdm';
import { ColumnaDoc, Ficha, Figura, NotaMetodologica, TablaExplicada } from './Ficha';
import {
  BarrasImportancia,
  BarrasPliegues,
  CajasMensuales,
  CascadaShapley,
  CurvaValidacion,
  DispersionPrediccion,
  SerieUmbrales,
} from './GraficasCRISPDM';

/**
 * Informe CRISP-DM del motor del GD sobre el dataset público.
 *
 * Seis tablas (T1–T6) y seis figuras (G1–G6) repartidas por las seis fases de
 * CRISP-DM. Ninguna se renderiza suelta: todas pasan por `<Figura>` o
 * `<TablaExplicada>`, que exigen una `Ficha` con los seis campos de
 * interpretabilidad y explicabilidad. Si alguien añade una figura sin ficha,
 * TypeScript no compila —el requisito es estructural, no una convención que
 * dependa de que alguien se acuerde—.
 *
 * El campo `hallazgo` de cada ficha se calcula **en cada render a partir de los
 * datos que se están mostrando**, no es un texto fijo. Una ficha con el
 * hallazgo escrito a mano deja de ser cierta en cuanto cambia el dataset, y una
 * explicación falsa es peor que ninguna.
 */

const n1 = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('es-ES', { maximumFractionDigits: d })} %`;

const Chip: React.FC<{ tono: 'ok' | 'mal' | 'neutro' | 'aviso'; children: React.ReactNode }> = ({ tono, children }) => {
  const estilos = {
    ok: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
    mal: 'text-red-300 border-red-500/40 bg-red-500/10',
    aviso: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    neutro: 'text-slate-400 border-slate-600/40 bg-slate-600/10',
  }[tono];
  return <span className={`inline-block rounded-full border px-1.5 py-0 text-[10px] font-semibold ${estilos}`}>{children}</span>;
};

const Fase: React.FC<{ n: number; titulo: string; icono: React.ReactNode; resumen: string; children: React.ReactNode }> = ({
  n,
  titulo,
  icono,
  resumen,
  children,
}) => (
  <section className="space-y-4">
    <header className="flex items-start gap-3 border-l-2 border-cyan-500/50 pl-3">
      <div className="mt-0.5 text-cyan-400">{icono}</div>
      <div>
        <h3 className="text-sm font-bold text-slate-100">
          <span className="font-mono text-cyan-400">Fase {n}</span> — {titulo}
        </h3>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-400">{resumen}</p>
      </div>
    </header>
    {children}
  </section>
);

// ═══════════════════════════════════════════════════════════════════════════
// Componente principal
// ═══════════════════════════════════════════════════════════════════════════

export const CRISPDMModule: React.FC = () => {
  const [informe, setInforme] = useState<InformeCRISPDM | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizonte, setHorizonte] = useState<string>('14');

  useEffect(() => {
    let vivo = true;
    getInformeCRISPDM()
      .then((r) => {
        if (!vivo) return;
        setInforme(r);
        if (r) setHorizonte(Object.keys(r.horizontes).sort((a, b) => Number(b) - Number(a))[0]);
      })
      .catch((e) => vivo && setError(String(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const lanzar = async () => {
    setEjecutando(true);
    setError(null);
    try {
      const r = await ejecutarCRISPDM('fcr', [7, 14]);
      setInforme(r);
      setHorizonte(Object.keys(r.horizontes).sort((a, b) => Number(b) - Number(a))[0]);
    } catch (e) {
      setError(String(e));
    } finally {
      setEjecutando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando informe CRISP-DM…
      </div>
    );
  }

  if (!informe) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-sm text-slate-300">Todavía no se ha generado ningún informe CRISP-DM.</p>
        <p className="text-[11.5px] leading-relaxed text-slate-500">
          Generarlo recorre las seis fases sobre el dataset real: análisis exploratorio, ingeniería de rasgos,
          validación cruzada anidada de origen móvil, búsqueda de hiperparámetros y cinco contrastes estadísticos
          con 2 000 réplicas de bootstrap. Tarda <strong className="text-slate-300">varios minutos</strong>; no se ha
          colgado.
        </p>
        <button
          onClick={lanzar}
          disabled={ejecutando}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {ejecutando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {ejecutando ? 'Ejecutando el ciclo…' : 'Ejecutar ciclo CRISP-DM'}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  const h: CicloHorizonte = informe.horizontes[horizonte] ?? Object.values(informe.horizontes)[0];

  return (
    <div className="space-y-8">
      <Cabecera
        informe={informe}
        horizonte={horizonte}
        setHorizonte={setHorizonte}
        onEjecutar={lanzar}
        ejecutando={ejecutando}
        error={error}
      />
      <Fase
        n={1}
        titulo="Comprensión del negocio"
        icono={<Target className="h-4 w-4" />}
        resumen="Qué decisión sostiene el modelo, con qué umbral y qué cuesta equivocarse en cada dirección."
      >
        <FaseNegocio informe={informe} />
      </Fase>

      <Fase
        n={2}
        titulo="Comprensión de los datos — EDA"
        icono={<Database className="h-4 w-4" />}
        resumen="Qué hay realmente en el dataset antes de modelar: cobertura, cuánto es medida y cuánto relleno, atípicos, tendencia, estacionalidad y qué se relaciona con el objetivo."
      >
        <TablaT1 filas={informe.fase_2_datos.t1_univariante} informe={informe} />
        <FiguraG1 informe={informe} />
        <FiguraG2 informe={informe} />
        <TablaT2 filas={h.t2_correlaciones} horizonte={h.horizonte} />
      </Fase>

      <Fase
        n={3}
        titulo="Preparación de los datos"
        icono={<FlaskConical className="h-4 w-4" />}
        resumen="Cómo se construyen los rasgos y, sobre todo, qué impide que el futuro se cuele en el entrenamiento."
      >
        <FasePreparacion ciclo={h} />
      </Fase>

      <Fase
        n={4}
        titulo="Modelado"
        icono={<TrendingUp className="h-4 w-4" />}
        resumen="Candidatos comparados en igualdad de condiciones y rejilla de hiperparámetros resuelta dentro de cada pliegue."
      >
        <TablaT3 filas={h.t3_modelos} ciclo={h} umbral={informe.umbral_evento} />
        <TablaT4 filas={h.t4_hiperparametros} />
        <FiguraG3 ciclo={h} />
      </Fase>

      <Fase
        n={5}
        titulo="Evaluación"
        icono={<Sigma className="h-4 w-4" />}
        resumen="Validación cruzada pliegue a pliegue y cinco contrastes estadísticos robustos sobre si la mejora es real o es ruido."
      >
        <TablaT5 filas={h.t5_validacion_cruzada} ciclo={h} />
        <FiguraG4 ciclo={h} />
        <TablaT6 filas={h.t6_pruebas} ciclo={h} />
        <FiguraG5 ciclo={h} umbral={informe.umbral_evento} />
        <FiguraG6 ciclo={h} />
      </Fase>

      <Fase
        n={6}
        titulo="Despliegue"
        icono={<CheckCircle2 className="h-4 w-4" />}
        resumen="Veredicto y, con el mismo peso, las condiciones bajo las cuales estos números significan algo."
      >
        <FaseDespliegue informe={informe} />
      </Fase>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Cabecera
// ═══════════════════════════════════════════════════════════════════════════

const Cabecera: React.FC<{
  informe: InformeCRISPDM;
  horizonte: string;
  setHorizonte: (h: string) => void;
  onEjecutar: () => void;
  ejecutando: boolean;
  error: string | null;
}> = ({ informe, horizonte, setHorizonte, onEjecutar, ejecutando, error }) => {
  const d = informe.dataset;
  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-100">Informe CRISP-DM sobre datos reales</h2>
          <p className="mt-1 text-[11.5px] text-slate-400">
            {d.embalse ?? 'Dataset configurado'} · {d.filas.toLocaleString('es-ES')} días ·{' '}
            {d.inicio.slice(0, 10)} → {d.fin.slice(0, 10)} · huella{' '}
            <code className="font-mono text-slate-500">{d.huella}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 p-0.5">
            {Object.keys(informe.horizontes)
              .sort((a, b) => Number(a) - Number(b))
              .map((k) => (
                <button
                  key={k}
                  onClick={() => setHorizonte(k)}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    horizonte === k ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {k} días
                </button>
              ))}
          </div>
          <button
            onClick={onEjecutar}
            disabled={ejecutando}
            title="Vuelve a ejecutar las seis fases. Tarda varios minutos."
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {ejecutando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {ejecutando ? 'Ejecutando…' : 'Regenerar'}
          </button>
        </div>
      </div>

      {d.advertencia && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[11.5px] leading-relaxed text-amber-200/90">{d.advertencia}</p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] md:grid-cols-3">
        {[
          ['Fuente del agua', d.fuente_agua],
          ['Fuente meteorológica', d.fuente_meteo],
          ['Generado', new Date(informe.generado).toLocaleString('es-ES')],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-300">{v}</dd>
            </div>
          ))}
      </dl>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Fase 1
// ═══════════════════════════════════════════════════════════════════════════

const FaseNegocio: React.FC<{ informe: InformeCRISPDM }> = ({ informe }) => {
  const f = informe.fase_1_negocio;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        ['Objetivo operativo', f.objetivo],
        ['Criterio de éxito', f.criterio_exito],
        ['Norma de referencia', f.norma],
        ['Coste asimétrico del error', f.coste_asimetrico],
      ].map(([k, v]) => (
        <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</h4>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{v}</p>
        </div>
      ))}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 md:col-span-2">
        <p className="text-[12px] text-slate-300">
          En el histórico hay <strong className="text-slate-100">{f.eventos_historicos}</strong> días por encima de{' '}
          {f.umbral} µg/L, el <strong className="text-slate-100">{pct(f.tasa_evento_pct, 2)}</strong> del total. Esa
          tasa condiciona todo lo que viene: con clases tan desequilibradas, <em>no avisar nunca</em> ya acierta el{' '}
          {pct(100 - f.tasa_evento_pct, 1)} de los días, así que la exactitud global es una métrica engañosa y el
          informe se apoya en sensibilidad, F1 y contrastes pareados.
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// T1 — Resumen univariante
// ═══════════════════════════════════════════════════════════════════════════

const TablaT1: React.FC<{ filas: FilaUnivariante[]; informe: InformeCRISPDM }> = ({ filas, informe }) => {
  const masInterpolada = useMemo(
    () => [...filas].sort((a, b) => b.interpolado_pct - a.interpolado_pct)[0],
    [filas],
  );
  const conTendencia = filas.filter((f) => f.tendencia !== 'sin tendencia').length;
  const chl = filas.find((f) => f.variable === 'chlorophyll_a');

  const columnas: ColumnaDoc<FilaUnivariante & Record<string, unknown>>[] = [
    { clave: 'variable', titulo: 'Variable', definicion: 'Nombre canónico de la variable en el contrato del motor.' },
    { clave: 'unidad', titulo: 'Unidad', definicion: 'Unidad física tras la conversión al catálogo de OAPAT.' },
    { clave: 'n', titulo: 'n', definicion: 'Días con valor no nulo.', alinear: 'right' },
    {
      clave: 'cobertura_pct',
      titulo: 'Cobertura',
      unidad: '%',
      definicion: 'Porcentaje de días del periodo con dato disponible.',
      alinear: 'right',
      render: (f) => pct(f.cobertura_pct),
    },
    {
      clave: 'interpolado_pct',
      titulo: 'Interpolado',
      unidad: '%',
      definicion:
        'Porcentaje del dato disponible que NO se midió, sino que se rellenó por interpolación lineal dentro de huecos acotados.',
      origen: 'import_fcr.interpolar_lentas',
      alinear: 'right',
      render: (f) =>
        f.interpolado_pct > 50 ? (
          <Chip tono="aviso">{pct(f.interpolado_pct, 0)}</Chip>
        ) : f.interpolado_pct > 0 ? (
          pct(f.interpolado_pct, 0)
        ) : (
          <span className="text-slate-600">medido</span>
        ),
    },
    { clave: 'minimo', titulo: 'Mín.', definicion: 'Valor mínimo observado.', alinear: 'right', render: (f) => n1(f.minimo) },
    { clave: 'mediana', titulo: 'Mediana', definicion: 'Percentil 50. Se prefiere a la media por robustez ante atípicos.', alinear: 'right', render: (f) => n1(f.mediana) },
    { clave: 'maximo', titulo: 'Máx.', definicion: 'Valor máximo observado.', alinear: 'right', render: (f) => n1(f.maximo) },
    { clave: 'iqr', titulo: 'IQR', definicion: 'Rango intercuartílico (Q3 − Q1): dispersión robusta.', alinear: 'right', render: (f) => n1(f.iqr) },
    {
      clave: 'asimetria',
      titulo: 'Asimetría',
      definicion:
        'Coeficiente de asimetría. Por encima de 1 la distribución tiene cola derecha larga y la media deja de representarla.',
      alinear: 'right',
      render: (f) => (Math.abs(f.asimetria) > 1 ? <Chip tono="aviso">{n1(f.asimetria)}</Chip> : n1(f.asimetria)),
    },
    {
      clave: 'atipicos_pct',
      titulo: 'Atípicos',
      unidad: '%',
      definicion: 'Porcentaje de valores fuera de [Q1 − 1,5·IQR, Q3 + 1,5·IQR] (criterio de Tukey).',
      alinear: 'right',
      render: (f) => `${pct(f.atipicos_pct, 1)} (${f.atipicos})`,
    },
    {
      clave: 'tendencia',
      titulo: 'Tendencia',
      definicion: 'Resultado del contraste de Mann-Kendall sobre tendencia monótona, con α = 0,05.',
      origen: 'crispdm.mann_kendall',
      render: (f) =>
        f.tendencia === 'sin tendencia' ? (
          <span className="text-slate-500">sin tendencia</span>
        ) : (
          <Chip tono={f.tendencia === 'creciente' ? 'mal' : 'ok'}>
            {f.tendencia} (τ={n1(f.mk_tau, 3)})
          </Chip>
        ),
    },
    { clave: 'mk_p', titulo: 'p Mann-K.', definicion: 'p-valor del contraste de tendencia de Mann-Kendall.', alinear: 'right', render: (f) => fmtP(f.mk_p) },
  ];

  const ficha: Ficha = {
    titulo: 'T1 · Resumen univariante del dataset: qué se midió, qué se rellenó y qué se mueve',
    queMuestra:
      `Una fila por cada una de las ${filas.length} variables numéricas del dataset diario de ` +
      `${informe.dataset.embalse ?? 'el embalse'}, con su cobertura temporal, su distribución robusta ` +
      '(mediana e IQR), su proporción de atípicos y el resultado del contraste de tendencia.',
    comoLeer:
      'Las columnas de **Cobertura** e **Interpolado** se leen juntas: una variable puede tener 87 % de cobertura ' +
      'y ser casi toda relleno. **Asimetría** por encima de 1 avisa de que la media no representa la variable. ' +
      'La columna **Tendencia** solo declara una dirección cuando Mann-Kendall rechaza a α = 0,05; si no, dice ' +
      '"sin tendencia" en vez de insinuar una.',
    hallazgo:
      `La clorofila-a, que es la variable objetivo, tiene ${pct(chl?.cobertura_pct)} de cobertura y ` +
      `asimetría ${n1(chl?.asimetria ?? null)} —cola derecha larga, como corresponde a una variable dominada por ` +
      `episodios—. La variable con más relleno es **${masInterpolada?.variable}**, con ${pct(masInterpolada?.interpolado_pct, 0)} ` +
      `de valores interpolados. ${conTendencia} de ${filas.length} variables muestran tendencia monótona significativa.`,
    criterio:
      'Atípicos por el criterio de Tukey (1,5·IQR). Tendencia por Mann-Kendall con corrección de empates, α = 0,05. ' +
      'Se eligen ambos por ser no paramétricos: las variables limnológicas no son normales.',
    procedencia:
      `Dataset ${informe.dataset.fuente_agua ?? '—'}. Meteorología: ${informe.dataset.fuente_meteo ?? '—'}. ` +
      'Agregación diaria de la capa superficial (≤ 2 m); nutrientes y Secchi interpolados linealmente dentro de ' +
      `huecos de hasta ${informe.dataset.interpolacion?.limite_dias ?? 21} días.`,
    limitaciones:
      'Una fracción interpolada alta significa que las métricas calculadas sobre esa variable describen en parte la ' +
      'interpolación y no la observación. Mann-Kendall detecta tendencia monótona: no capta cambios de régimen ni ' +
      'ciclos, y sobre una serie submuestreada pierde potencia. Los atípicos de Tukey son una señal para mirar, no ' +
      'un veredicto de error: en esta variable un valor extremo suele ser una floración de verdad.',
  };

  return <TablaExplicada ficha={ficha} columnas={columnas} datos={filas as never} maxAltura="26rem" claveFila={(f) => f.variable} />;
};

// ═══════════════════════════════════════════════════════════════════════════
// G1 — Serie con umbrales
// ═══════════════════════════════════════════════════════════════════════════

const FiguraG1: React.FC<{ informe: InformeCRISPDM }> = ({ informe }) => {
  const g = informe.fase_2_datos.g1_serie;
  // Los recuentos vienen del motor y describen la serie completa. Contarlos
  // sobre `g.puntos` daria la mitad cuando la figura va submuestreada.
  const { dias_sobre_1: sobre1, dias_sobre_2: sobre2, total_dias: totalDias, maximo: max } = g;

  const ficha: Ficha = {
    titulo: 'G1 · Serie diaria de clorofila-a frente a los dos umbrales de alerta de la OMS',
    queMuestra:
      `Clorofila-a en µg/L medida en la capa superficial, un punto por día, entre ` +
      `${informe.dataset.inicio.slice(0, 10)} y ${informe.dataset.fin.slice(0, 10)}. ` +
      (g.submuestreo > 1
        ? `Se dibuja 1 de cada ${g.submuestreo} puntos para que la figura siga siendo legible, pero los recuentos ` +
          'de la ficha se calculan sobre la serie entera.'
        : ''),
    comoLeer:
      'Eje vertical en µg/L. Las dos rectas discontinuas son los umbrales de la OMS, rotulados con su valor. ' +
      'Los puntos marcados en ámbar y rojo son los días que superan cada umbral. **Los huecos del invierno se ' +
      'dibujan como huecos**: la boya se retira parte del año, y unir esos extremos con una línea sugeriría una ' +
      'medición que nadie tomó.',
    hallazgo:
      `De los ${totalDias} días con medida, ${sobre1} superan los ${g.umbral_1} µg/L (${pct((100 * sobre1) / totalDias, 1)}) ` +
      `y ${sobre2} superan los ${g.umbral_2} µg/L. El máximo de la serie es ${n1(max)} µg/L. Los episodios son ` +
      'marcadamente estacionales y de corta duración, que es justamente lo que hace difícil el pronóstico a dos ' +
      'semanas. Estos recuentos son de la serie completa, no de los puntos dibujados.',
    criterio:
      'OMS, *Guidelines for safe recreational water environments*: 25 µg/L de clorofila-a marca el nivel de ' +
      'vigilancia (alerta 1) y 50 µg/L el de riesgo alto (alerta 2).',
    procedencia:
      'Sonda de fluorescencia fija a 1,6 m, promediada a valor diario. ' + (informe.dataset.fuente_agua ?? ''),
    limitaciones:
      `La sonda lee del orden de ${Math.abs(informe.dataset.sesgo_sonda_vs_laboratorio_ugl ?? 0)} µg/L por debajo de ` +
      'la clorofila extraída en laboratorio y correlaciona poco con ella ' +
      `(r = ${informe.dataset.correlacion_sonda_laboratorio_r ?? '—'}). Aplicar el umbral de la OMS sobre este ` +
      'valor, por tanto, **sub-alerta**: los cruces dibujados aquí son menos de los que habría medido el ' +
      'laboratorio. La serie es de un único punto del embalse, no de toda su superficie.',
  };

  return (
    <Figura ficha={ficha}>
      <SerieUmbrales puntos={g.puntos} umbral1={g.umbral_1} umbral2={g.umbral_2} />
    </Figura>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// G2 — Estacionalidad
// ═══════════════════════════════════════════════════════════════════════════

const FiguraG2: React.FC<{ informe: InformeCRISPDM }> = ({ informe }) => {
  const g = informe.fase_2_datos.g2_estacionalidad;
  const pico = [...g.cajas].sort((a, b) => b.mediana - a.mediana)[0];
  const peor = [...g.cajas].sort((a, b) => b.sobre_umbral_pct - a.sobre_umbral_pct)[0];
  const kw = g.kruskal_wallis;

  const ficha: Ficha = {
    titulo: 'G2 · Distribución mensual de la clorofila-a: hay estacionalidad y está contrastada',
    queMuestra:
      'Una caja por mes con la distribución de la clorofila-a diaria: cuartiles, mediana y extremos, agregando ' +
      `todos los años del periodo. La intensidad del rojo codifica qué proporción de los días de ese mes superan ` +
      `los ${g.umbral} µg/L.`,
    comoLeer:
      'La caja abarca del primer al tercer cuartil y la línea clara es la mediana; los bigotes llegan al mínimo y ' +
      'al máximo. Comparar **alturas de mediana** indica el nivel típico del mes; comparar **altura de la caja** ' +
      'indica la variabilidad. El color no añade información nueva sobre la posición: codifica el riesgo, y por ' +
      'eso el dato exacto está también en el texto emergente de cada caja.',
    hallazgo:
      `El mes de mediana más alta es **${MESES[(pico?.mes ?? 1) - 1]}** (${n1(pico?.mediana)} µg/L) y el de mayor ` +
      `proporción de días sobre umbral es **${MESES[(peor?.mes ?? 1) - 1]}** (${pct(peor?.sobre_umbral_pct, 0)} de sus días). ` +
      `El contraste de Kruskal-Wallis da p = ${fmtP(kw.p_valor)}: ${kw.veredicto.toLowerCase()}.`,
    criterio:
      `Kruskal-Wallis, α = ${ALFA}. Se usa en lugar de un ANOVA porque la clorofila no es normal ni tiene varianza ` +
      'homogénea entre meses, y el ANOVA sobre estos datos daría un p-valor que no significa lo que aparenta.',
    procedencia: 'Misma serie diaria de G1, agrupada por mes natural sin distinguir el año.',
    limitaciones:
      'Agregar todos los años juntos **oculta la variabilidad interanual**: un mes con mediana alta puede deberse a ' +
      'dos años extremos y no a un patrón estable. La prueba confirma que los meses difieren, pero no dice cuáles ' +
      'entre sí ni cuánto, y no implica que el mes sirva por sí solo para predecir: eso se contrasta en T2 y T3.',
  };

  return (
    <Figura ficha={ficha}>
      <CajasMensuales cajas={g.cajas} umbral={g.umbral} />
    </Figura>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// T2 — Correlaciones
// ═══════════════════════════════════════════════════════════════════════════

const TablaT2: React.FC<{ filas: FilaCorrelacion[]; horizonte: number }> = ({ filas, horizonte }) => {
  const top = filas[0];
  const sig = filas.filter((f) => f.significativo).length;
  const nolin = filas.filter((f) => f.no_lineal).length;

  const columnas: ColumnaDoc<FilaCorrelacion & Record<string, unknown>>[] = [
    { clave: 'rasgo', titulo: 'Rasgo', definicion: 'Variable derivada que entra al modelo como predictor.' },
    {
      clave: 'pearson_r',
      titulo: 'Pearson r',
      definicion: 'Correlación lineal con el incremento de clorofila. Rango −1 a 1.',
      alinear: 'right',
      render: (f) => n1(f.pearson_r, 3),
    },
    { clave: 'pearson_p', titulo: 'p', definicion: 'p-valor de la correlación de Pearson.', alinear: 'right', render: (f) => fmtP(f.pearson_p) },
    {
      clave: 'spearman_rho',
      titulo: 'Spearman ρ',
      definicion: 'Correlación de rangos: capta relaciones monótonas aunque no sean lineales.',
      alinear: 'right',
      render: (f) => n1(f.spearman_rho, 3),
    },
    { clave: 'spearman_p', titulo: 'p', definicion: 'p-valor de la correlación de Spearman.', alinear: 'right', render: (f) => fmtP(f.spearman_p) },
    {
      clave: 'no_lineal',
      titulo: 'Forma',
      definicion: 'Marcado cuando |ρ| supera a |r| en más de 0,05: indicio de relación monótona no lineal.',
      render: (f) => (f.no_lineal ? <Chip tono="aviso">no lineal</Chip> : <span className="text-slate-600">lineal</span>),
    },
    {
      clave: 'significativo',
      titulo: `α = ${ALFA}`,
      definicion: 'Si la correlación de Pearson es significativa al nivel declarado.',
      alinear: 'center',
      render: (f) => (f.significativo ? <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="inline h-3.5 w-3.5 text-slate-600" />),
    },
  ];

  const ficha: Ficha = {
    titulo: `T2 · Relación de cada rasgo con el incremento de clorofila a ${horizonte} días`,
    queMuestra:
      `Para cada uno de los ${filas.length} rasgos construidos, su correlación con la variable objetivo —el ` +
      `**incremento** de clorofila dentro de ${horizonte} días, no su nivel—, medida de dos formas: lineal ` +
      '(Pearson) y de rangos (Spearman). Ordenada por |ρ| descendente.',
    comoLeer:
      'Un valor **negativo** significa que un rasgo alto anticipa un *descenso*. Comparar las dos columnas de ' +
      'correlación es el uso principal de la tabla: cuando Spearman supera claramente a Pearson, la relación ' +
      'existe pero no es una recta, y eso justifica probar modelos no lineales (fase 4). La columna de p-valor ' +
      'se interpreta con cautela: con n grande, correlaciones minúsculas salen significativas.',
    hallazgo:
      `El rasgo más asociado es **${top?.rasgo}** (ρ = ${n1(top?.spearman_rho, 3)}, r = ${n1(top?.pearson_r, 3)}). ` +
      `Su signo negativo es reversión a la media: cuanto más alta está la clorofila hoy, más tiende a bajar en ` +
      `${horizonte} días. ${sig} de ${filas.length} rasgos son significativos a α = ${ALFA} y ${nolin} muestran ` +
      'indicio de relación no lineal.',
    criterio:
      `Significación a α = ${ALFA}, sin corrección por comparaciones múltiples: la tabla es exploratoria y sirve ` +
      'para orientar el modelado, no para declarar descubrimientos. Las conclusiones se toman en T6.',
    procedencia:
      'Rasgos calculados con ventanas cerradas en t (medias y desviaciones de 7 días, retardos de 1, 3 y 7 días) ' +
      'sobre la serie diaria. Objetivo emparejado por fecha con tolerancia de ±2 días.',
    limitaciones:
      '**Correlación no es causalidad ni capacidad predictiva.** Estos coeficientes se calculan sobre todo el ' +
      'periodo, incluido el que después se usa para entrenar, así que no son una estimación fuera de muestra: ' +
      'un rasgo con ρ alto aquí puede no aportar nada en T3. Además los rasgos están fuertemente correlacionados ' +
      'entre sí, de modo que sus contribuciones no se suman.',
  };

  return <TablaExplicada ficha={ficha} columnas={columnas} datos={filas as never} maxAltura="24rem" claveFila={(f) => f.rasgo} />;
};

// ═══════════════════════════════════════════════════════════════════════════
// Fase 3 — Preparación
// ═══════════════════════════════════════════════════════════════════════════

const FasePreparacion: React.FC<{ ciclo: CicloHorizonte }> = ({ ciclo }) => {
  const p = ciclo.preparacion;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['Muestras válidas', p.muestras.toLocaleString('es-ES')],
          ['Rasgos', String(p.rasgos)],
          ['Purga entre train y test', `${p.purga_dias} días`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt>
            <dd className="mt-0.5 text-lg font-bold text-slate-100">{v}</dd>
          </div>
        ))}
      </div>
      <NotaMetodologica titulo="por qué se predice el incremento y no el nivel">
        <p>{p.por_que_incremento}</p>
        <p>
          <strong className="text-slate-100">Objetivo:</strong> {p.objetivo}
        </p>
      </NotaMetodologica>
      <NotaMetodologica titulo="control de fuga temporal">
        <p>{p.control_fuga}</p>
        <p>
          <strong className="text-slate-100">Emparejamiento:</strong> {p.emparejado}. Emparejar por posición de fila
          es el error clásico con series que tienen huecos: <code className="font-mono">shift(−7)</code> desplaza
          siete <em>registros</em>, que con datos reales pueden ser siete semanas.
        </p>
      </NotaMetodologica>
      <details className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-400">
          Ver los {p.rasgos} rasgos que entran al modelo
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.lista_rasgos.map((r) => (
            <code key={r} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {r}
            </code>
          ))}
        </div>
      </details>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// T3 — Comparación de modelos
// ═══════════════════════════════════════════════════════════════════════════

const TablaT3: React.FC<{ filas: FilaModelo[]; ciclo: CicloHorizonte; umbral: number }> = ({ filas, ciclo, umbral }) => {
  const mejorMae = filas[0];
  const mejorF1 = [...filas].sort((a, b) => b.f1 - a.f1)[0];
  const pers = filas.find((f) => f.modelo === 'Persistencia');

  const columnas: ColumnaDoc<FilaModelo & Record<string, unknown>>[] = [
    {
      clave: 'modelo',
      titulo: 'Modelo',
      definicion: 'Candidato evaluado. Persistencia y Climatología son referencias obligatorias, no propuestas.',
      render: (f) => (
        <span className="flex items-center gap-1.5">
          <span className={f.familia === 'referencia' ? 'text-slate-400' : 'font-semibold text-slate-100'}>{f.modelo}</span>
          {f.interpretable && <Chip tono="neutro">interpretable</Chip>}
        </span>
      ),
    },
    { clave: 'familia', titulo: 'Familia', definicion: 'Tipo de modelo: determina qué clase de relaciones puede representar.' },
    {
      clave: 'mae',
      titulo: 'MAE',
      unidad: 'µg/L',
      definicion: 'Error absoluto medio del incremento pronosticado, fuera de muestra, agregando todos los pliegues.',
      alinear: 'right',
      render: (f) => <span className={f === mejorMae ? 'font-bold text-emerald-300' : ''}>{n1(f.mae, 3)}</span>,
    },
    { clave: 'rmse', titulo: 'RMSE', unidad: 'µg/L', definicion: 'Raíz del error cuadrático medio: penaliza más los fallos grandes que el MAE.', alinear: 'right', render: (f) => n1(f.rmse, 3) },
    {
      clave: 'r2',
      titulo: 'R²',
      definicion: 'Proporción de varianza del incremento explicada. Negativo significa peor que predecir la media.',
      alinear: 'right',
      render: (f) => n1(f.r2, 3),
    },
    {
      clave: 'skill_vs_persistencia_pct',
      titulo: 'Skill',
      unidad: '%',
      definicion: 'Reducción porcentual del MAE respecto a la persistencia. Negativo = peor que no hacer nada.',
      alinear: 'right',
      render: (f) =>
        f.skill_vs_persistencia_pct === null ? '—' : (
          <Chip tono={f.skill_vs_persistencia_pct > 0 ? 'ok' : f.skill_vs_persistencia_pct < 0 ? 'mal' : 'neutro'}>
            {f.skill_vs_persistencia_pct > 0 ? '+' : ''}
            {n1(f.skill_vs_persistencia_pct, 1)} %
          </Chip>
        ),
    },
    {
      clave: 'sensibilidad',
      titulo: 'Sensib.',
      definicion: 'Fracción de floraciones reales que el modelo avisa, con el umbral de decisión calibrado en entrenamiento.',
      alinear: 'right',
      render: (f) => n1(f.sensibilidad, 3),
    },
    { clave: 'especificidad', titulo: 'Especif.', definicion: 'Fracción de días tranquilos correctamente no señalados.', alinear: 'right', render: (f) => n1(f.especificidad, 3) },
    {
      clave: 'f1',
      titulo: 'F1',
      definicion: 'Media armónica de precisión y sensibilidad sobre el aviso, con umbral de decisión calibrado.',
      alinear: 'right',
      render: (f) => <span className={f === mejorF1 ? 'font-bold text-emerald-300' : ''}>{n1(f.f1, 3)}</span>,
    },
    {
      clave: 'f1_umbral_fisico',
      titulo: 'F1 sin calibrar',
      definicion: `F1 aplicando directamente el umbral físico de ${umbral} µg/L a la predicción puntual, sin calibrar la decisión.`,
      alinear: 'right',
      render: (f) => <span className="text-slate-500">{n1(f.f1_umbral_fisico, 3)}</span>,
    },
    {
      clave: 'falsos_negativos',
      titulo: 'FN',
      definicion: 'Floraciones reales no avisadas. Es el error caro: expone a la población.',
      alinear: 'right',
      render: (f) => <span className="text-red-300">{f.falsos_negativos}</span>,
    },
    { clave: 'falsas_alarmas', titulo: 'FP', definicion: 'Avisos sin floración. Cuestan dinero y credibilidad.', alinear: 'right', render: (f) => <span className="text-amber-300">{f.falsas_alarmas}</span> },
  ];

  const ganaAlgo = mejorF1.familia !== 'referencia';

  const ficha: Ficha = {
    titulo: `T3 · Comparación de candidatos a ${ciclo.horizonte} días: error medio y calidad de la alerta, por separado`,
    queMuestra:
      `Los ${filas.length} modelos evaluados sobre exactamente las mismas particiones fuera de muestra, con dos ` +
      'bloques de métricas: las de **error** (MAE, RMSE, R², skill) y las de **decisión** (sensibilidad, ' +
      'especificidad, F1, falsos negativos y falsas alarmas). Persistencia y Climatología son referencias que hay ' +
      'que batir, no propuestas.',
    comoLeer:
      'Se lee en dos pasadas. Primero la columna **Skill**: mide la mejora sobre no hacer nada, y un valor ' +
      'negativo significa que el modelo estorba. Después **F1 y FN**, que responden a otra pregunta —si el sistema ' +
      'sirve para avisar—. La columna **F1 sin calibrar** está para mostrar cuánto cambia el resultado por ' +
      'calibrar el umbral de decisión, que es un parámetro y no una constante heredada de la norma.',
    hallazgo:
      `Menor error: **${mejorMae.modelo}** (MAE ${n1(mejorMae.mae, 3)} µg/L, skill ` +
      `${n1(mejorMae.skill_vs_persistencia_pct, 1)} % sobre persistencia). Mejor alerta: **${mejorF1.modelo}** ` +
      `(F1 ${n1(mejorF1.f1, 3)}, sensibilidad ${n1(mejorF1.sensibilidad, 3)}). ` +
      (ganaAlgo
        ? 'Un modelo aprendido encabeza las dos columnas.'
        : `**Las dos mejores cifras de alerta las firman las referencias, no los modelos aprendidos**: ` +
          `la persistencia alcanza F1 ${n1(pers?.f1, 3)}. Es el hallazgo incómodo de este informe y no se corrige ` +
          'ajustando hasta que salga otra cosa.'),
    criterio:
      `Umbral de evento ${umbral} µg/L (OMS alerta 1). El umbral de *decisión* se calibra maximizando F1 sobre el ` +
      'tramo de entrenamiento de cada pliegue y se aplica sin tocar al de prueba.',
    procedencia:
      `Validación cruzada de origen móvil con ${ciclo.t5_validacion_cruzada.length} pliegues y purga de ` +
      `${ciclo.preparacion.purga_dias} días; los hiperparámetros se resuelven dentro de cada pliegue. Métricas ` +
      `agregadas sobre ${mejorMae.n_evaluacion.toLocaleString('es-ES')} predicciones fuera de muestra.`,
    limitaciones:
      'El MAE y el F1 no se mueven juntos: un modelo puede reducir el error medio sin cambiar ninguna decisión, y ' +
      'al revés. Ninguna diferencia de esta tabla está contrastada aquí —para eso está T6—, así que dos modelos ' +
      'con MAE parecido pueden ser estadísticamente indistinguibles. Los recuentos de FN y FP dependen del umbral ' +
      'calibrado; con otro criterio de calibración cambiarían.',
  };

  return <TablaExplicada ficha={ficha} columnas={columnas} datos={filas as never} claveFila={(f) => f.modelo} />;
};

// ═══════════════════════════════════════════════════════════════════════════
// T4 — Hiperparámetros
// ═══════════════════════════════════════════════════════════════════════════

const TablaT4: React.FC<{ filas: FilaHiperparametro[] }> = ({ filas }) => {
  const mejores = filas.filter((f) => f.es_mejor);
  const estables = filas.filter((f) => f.elegido_en_pliegues >= 3).length;

  const columnas: ColumnaDoc<FilaHiperparametro & Record<string, unknown>>[] = [
    { clave: 'modelo', titulo: 'Modelo', definicion: 'Familia de modelo a la que pertenece esta combinación.' },
    {
      clave: 'parametros',
      titulo: 'Combinación',
      definicion: 'Valores de los hiperparámetros evaluados, tal cual los recibió el estimador.',
      render: (f) => <code className="font-mono text-[10.5px] text-slate-300">{f.parametros}</code>,
    },
    {
      clave: 'mae_cv_medio',
      titulo: 'MAE interno',
      unidad: 'µg/L',
      definicion: 'MAE medio en los pliegues de validación interna, promediado sobre los pliegues externos.',
      alinear: 'right',
      render: (f) => <span className={f.es_mejor ? 'font-bold text-emerald-300' : ''}>{n1(f.mae_cv_medio, 4)}</span>,
    },
    { clave: 'mae_cv_desv', titulo: '± desv.', definicion: 'Desviación del MAE entre evaluaciones: mide lo estable que es la combinación.', alinear: 'right', render: (f) => n1(f.mae_cv_desv, 4) },
    {
      clave: 'elegido_en_pliegues',
      titulo: 'Elegida en',
      definicion: 'Número de pliegues externos en los que la búsqueda interna seleccionó esta combinación.',
      alinear: 'center',
      render: (f) =>
        f.elegido_en_pliegues > 0 ? (
          <Chip tono={f.elegido_en_pliegues >= 3 ? 'ok' : 'neutro'}>{f.elegido_en_pliegues} / {f.pliegues}</Chip>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
  ];

  const ficha: Ficha = {
    titulo: 'T4 · Rejilla de hiperparámetros resuelta dentro de cada pliegue',
    queMuestra:
      `Las ${filas.length} combinaciones de hiperparámetros exploradas, con el error que obtuvo cada una en la ` +
      'validación **interna** y cuántas veces resultó elegida por la búsqueda al cambiar de pliegue externo.',
    comoLeer:
      'La columna **MAE interno** ordena dentro de cada modelo; el mejor de cada familia va resaltado. La columna ' +
      '**Elegida en** es la que revela si la elección es sólida: una combinación escogida en 4 de 5 pliegues es ' +
      'una preferencia estable del problema, mientras que si cada pliegue elige una distinta, el hiperparámetro ' +
      'importa poco y conviene no presumir de haberlo "optimizado".',
    hallazgo:
      `${estables} de ${filas.length} combinaciones fueron elegidas en 3 o más pliegues. Mejores por familia: ` +
      mejores.map((m) => `${m.modelo} → ${m.parametros} (MAE ${n1(m.mae_cv_medio, 4)})`).join('; ') + '.',
    criterio:
      'Selección por MAE mínimo en validación interna de origen móvil. El criterio se fija antes de mirar los ' +
      'resultados y no se cambia después: elegir la métrica a posteriori es otra forma de mirar el test.',
    procedencia:
      'Búsqueda anidada: dentro del tramo de entrenamiento de cada pliegue externo se abre una validación de ' +
      'origen móvil propia, y solo el ganador se lleva al tramo de prueba. El tramo de prueba nunca participa en ' +
      'la elección.',
    limitaciones:
      'La rejilla es pequeña y discreta: el óptimo real puede caer entre dos valores probados o fuera del rango. ' +
      'Un MAE interno bajo **no garantiza** buen rendimiento externo —para eso está T3—, y comparar combinaciones ' +
      'de familias distintas por esta columna no es válido, porque cada familia se evalúa en su propia escala de ' +
      'complejidad.',
  };

  return <TablaExplicada ficha={ficha} columnas={columnas} datos={filas as never} maxAltura="22rem" claveFila={(f, i) => `${f.modelo}-${i}`} />;
};

// ═══════════════════════════════════════════════════════════════════════════
// G3 — Curva de validación
// ═══════════════════════════════════════════════════════════════════════════

const FiguraG3: React.FC<{ ciclo: CicloHorizonte }> = ({ ciclo }) => {
  const g = ciclo.g3_curva_validacion;
  const puntosValidos = (g?.puntos || []).filter(
    (p) => p && p.mae !== null && p.mae !== undefined && !Number.isNaN(p.mae)
  );
  const mejor = puntosValidos.length
    ? puntosValidos.reduce((a, b) => (b.mae < a.mae ? b : a), puntosValidos[0])
    : null;
  const peor = puntosValidos.length
    ? puntosValidos.reduce((a, b) => (b.mae > a.mae ? b : a), puntosValidos[0])
    : null;
  const rango = mejor && peor ? peor.mae - mejor.mae : 0;
  const desvTipica = puntosValidos.length
    ? puntosValidos.reduce((s, p) => s + (p.desv || 0), 0) / puntosValidos.length
    : 0;
  const plano = rango < desvTipica;

  const ficha: Ficha = {
    titulo: `G3 · Curva de validación de ${g.modelo}: sensibilidad al hiperparámetro «${g.hiperparametro}»`,
    queMuestra:
      `Cómo cambia el error de validación interna del modelo ganador al recorrer los valores de ` +
      `**${g.hiperparametro}**, con la dispersión entre pliegues dibujada como banda.`,
    comoLeer:
      'El eje vertical es MAE, así que **más abajo es mejor**. El punto verde marca el mínimo. La banda es ± 1 ' +
      'desviación entre pliegues y es la parte importante: si la banda es más ancha que la diferencia entre ' +
      'valores, la curva no distingue realmente entre ellos, por muy marcado que parezca el mínimo.',
    hallazgo: mejor
      ? `El mínimo está en ${g.hiperparametro} = ${mejor.x} (MAE ${n1(mejor.mae, 4)} ± ${n1(mejor.desv, 4)}). ` +
        `El recorrido completo de la curva abarca ${n1(rango, 4)} µg/L frente a una dispersión típica entre ` +
        `pliegues de ${n1(desvTipica, 4)} µg/L: ` +
        (plano
          ? '**la curva es plana en relación con su propio ruido**, así que el valor exacto del hiperparámetro ' +
            'apenas cambia el resultado y no conviene presentarlo como un ajuste fino.'
          : 'la diferencia entre valores supera al ruido, así que la elección sí importa.')
      : 'Sin rejilla que mostrar para este modelo.',
    criterio: 'MAE de validación interna, mismo criterio con el que se seleccionó la combinación en T4.',
    procedencia:
      `Promedio de los pliegues internos de cada uno de los ${ciclo.t5_validacion_cruzada.length} pliegues ` +
      'externos. Ningún punto de esta curva ha visto el tramo de prueba.',
    limitaciones:
      'Es una curva **unidimensional**: recorre un hiperparámetro dejando los demás en su valor de la rejilla, ' +
      'así que no muestra interacciones entre ellos. Solo cubre los valores probados; nada dice de lo que pasa ' +
      'fuera del rango. Y el error de validación interna es optimista respecto al externo, por lo que la altura ' +
      'absoluta de la curva no es comparable con el MAE de T3.',
  };

  return (
    <Figura ficha={ficha}>
      <CurvaValidacion puntos={g.puntos} hiperparametro={g.hiperparametro} modelo={g.modelo} />
    </Figura>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// T5 — Validación cruzada
// ═══════════════════════════════════════════════════════════════════════════

const TablaT5: React.FC<{ filas: FilaPliegue[]; ciclo: CicloHorizonte }> = ({ filas, ciclo }) => {
  const modelos = filas.length ? Object.keys(filas[0].modelos) : [];
  const ganadores = useMemo(() => {
    const c: Record<string, number> = {};
    filas.forEach((f) => {
      c[f.ganador] = (c[f.ganador] ?? 0) + 1;
    });
    return c;
  }, [filas]);
  const dominante = Object.entries(ganadores).sort((a, b) => b[1] - a[1])[0];

  const columnas: ColumnaDoc<FilaPliegue & Record<string, unknown>>[] = [
    { clave: 'pliegue', titulo: 'Pliegue', definicion: 'Índice de la partición, en orden cronológico creciente.', alinear: 'center' },
    {
      clave: 'train_desde',
      titulo: 'Entrenamiento',
      definicion: 'Rango temporal usado para ajustar, ya descontada la purga.',
      render: (f) => (
        <span className="font-mono text-[10.5px] text-slate-400">
          {f.train_desde} → {f.train_hasta}
        </span>
      ),
    },
    {
      clave: 'test_desde',
      titulo: 'Prueba',
      definicion: 'Rango temporal evaluado. Siempre posterior al de entrenamiento.',
      render: (f) => (
        <span className="font-mono text-[10.5px] text-cyan-300/80">
          {f.test_desde} → {f.test_hasta}
        </span>
      ),
    },
    { clave: 'n_train', titulo: 'n train', definicion: 'Muestras de entrenamiento tras la purga.', alinear: 'right' },
    { clave: 'n_test', titulo: 'n test', definicion: 'Muestras evaluadas en este pliegue.', alinear: 'right' },
    ...modelos.map<ColumnaDoc<FilaPliegue & Record<string, unknown>>>((m) => ({
      clave: `m_${m}`,
      titulo: m,
      unidad: 'µg/L',
      definicion: `MAE de ${m} en el tramo de prueba de este pliegue.`,
      alinear: 'right',
      render: (f) => (
        <span className={f.ganador === m ? 'font-bold text-emerald-300' : 'text-slate-400'}>{n1(f.modelos[m], 3)}</span>
      ),
    })),
  ];

  const ficha: Ficha = {
    titulo: `T5 · Validación cruzada de origen móvil, pliegue a pliegue (${ciclo.horizonte} días)`,
    queMuestra:
      `Los ${filas.length} pliegues de la validación cruzada con sus rangos temporales exactos de entrenamiento y ` +
      'prueba, el tamaño de cada uno y el MAE que obtuvo cada modelo en cada pliegue.',
    comoLeer:
      'Cada fila es un experimento independiente en el tiempo, y el mejor de cada fila va resaltado. Lo que ' +
      'importa no es solo quién gana más veces, sino **cuánto varían los números entre filas**: si el MAE de un ' +
      'modelo cambia mucho de pliegue a pliegue, su cifra agregada en T3 esconde esa inestabilidad. Compruebe ' +
      'también que la fecha de entrenamiento siempre termina antes de que empiece la de prueba.',
    hallazgo:
      `**${dominante?.[0]}** gana en ${dominante?.[1]} de los ${filas.length} pliegues. Los tramos de prueba ` +
      `recorren de ${filas[0]?.test_desde} a ${filas[filas.length - 1]?.test_hasta}, con tamaños de entrenamiento ` +
      `crecientes de ${filas[0]?.n_train} a ${filas[filas.length - 1]?.n_train} muestras.`,
    criterio:
      'Particionado expansivo de origen móvil. Está prohibido el particionado aleatorio: mezclaría futuro en el ' +
      `entrenamiento. Entre ambos tramos se purgan ${ciclo.preparacion.purga_dias} días.`,
    procedencia:
      'Cada celda es el MAE fuera de muestra del modelo, con sus hiperparámetros elegidos dentro de ese mismo ' +
      'pliegue por una validación interna independiente.',
    limitaciones:
      'Los pliegues **no son independientes entre sí**: comparten el tramo inicial de la serie, porque el ' +
      'entrenamiento es expansivo. Además cada uno cubre una estación distinta del año, de modo que parte de la ' +
      'variación entre filas es estacionalidad y no inestabilidad del modelo. Con pocos pliegues, la media ' +
      'agregada es sensible a un solo tramo atípico.',
  };

  return <TablaExplicada ficha={ficha} columnas={columnas} datos={filas as never} claveFila={(f) => `p${f.pliegue}`} />;
};

// ═══════════════════════════════════════════════════════════════════════════
// G4 — Error por pliegue
// ═══════════════════════════════════════════════════════════════════════════

const FiguraG4: React.FC<{ ciclo: CicloHorizonte }> = ({ ciclo }) => {
  const g = ciclo.g4_pliegues;
  const maes = g.pliegues.map((p) => p.valores[ciclo.mejor_modelo]).filter((v) => v !== undefined);
  const min = Math.min(...maes);
  const max = Math.max(...maes);

  const ficha: Ficha = {
    titulo: `G4 · Error de cada modelo en cada pliegue: ¿es estable la ventaja o depende del tramo?`,
    queMuestra:
      `El MAE de los ${g.modelos.length} modelos en cada uno de los ${g.pliegues.length} pliegues de la ` +
      'validación cruzada, agrupado por pliegue.',
    comoLeer:
      'Dentro de cada grupo, **barra más baja es mejor**. La figura responde a una pregunta que la media de T3 no ' +
      'puede: si un modelo gana siempre o solo gana de media. Comparar la altura de los grupos entre sí muestra ' +
      'que unos periodos son intrínsecamente más difíciles que otros, para todos los modelos a la vez.',
    hallazgo:
      `El MAE de ${ciclo.mejor_modelo} oscila entre ${n1(min, 3)} y ${n1(max, 3)} µg/L según el pliegue, un ` +
      `recorrido de ${n1(max - min, 3)} µg/L. Esa variación entre tramos es mayor que la diferencia media entre ` +
      `el modelo y la persistencia (${n1(Math.abs(ciclo.mae_persistencia - ciclo.mae_mejor), 3)} µg/L), lo que ` +
      'anticipa el resultado de los contrastes de T6.',
    criterio: 'MAE fuera de muestra por pliegue, sin ponderar por tamaño del tramo.',
    procedencia: 'Mismos números de T5, dibujados para comparar de un vistazo en lugar de leer una celda cada vez.',
    limitaciones:
      'Las barras **no llevan intervalo de confianza**: cada una es una única estimación sobre unas decenas o ' +
      'cientos de muestras. Los pliegues comparten historia de entrenamiento, así que sus errores no son ' +
      'independientes y no se puede tratar esta serie como una muestra aleatoria para hacer inferencia; eso se ' +
      'hace en T6 con métodos que sí asumen dependencia.',
  };

  return (
    <Figura ficha={ficha}>
      <BarrasPliegues pliegues={g.pliegues} modelos={g.modelos} />
    </Figura>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// T6 — Pruebas estadísticas
// ═══════════════════════════════════════════════════════════════════════════

const TablaT6: React.FC<{ filas: FilaPrueba[]; ciclo: CicloHorizonte }> = ({ filas, ciclo }) => {
  const rechazan = filas.filter((f) => esSignificativo(f.p_valor)).length;

  const columnas: ColumnaDoc<FilaPrueba & Record<string, unknown>>[] = [
    {
      clave: 'prueba',
      titulo: 'Prueba',
      definicion: 'Contraste aplicado. Todos son no paramétricos o robustos a la autocorrelación de los errores.',
      render: (f) => (
        <div>
          <span className="font-semibold text-slate-100">{f.prueba}</span>
          <div className="mt-0.5 text-[10.5px] text-slate-500">{f.compara}</div>
        </div>
      ),
    },
    { clave: 'hipotesis_nula', titulo: 'Hipótesis nula', definicion: 'Lo que la prueba supone cierto mientras no haya evidencia en contra.' },
    { clave: 'estadistico', titulo: 'Estadístico', definicion: 'Valor del estadístico de contraste.', alinear: 'right', render: (f) => n1(f.estadistico, 4) },
    {
      clave: 'p_valor',
      titulo: 'p-valor',
      definicion: `Probabilidad de observar algo al menos tan extremo si la nula fuera cierta. Se rechaza por debajo de α = ${ALFA}.`,
      alinear: 'right',
      render: (f) =>
        f.p_valor === null && f.ic95 ? (
          <span className="font-mono text-[10.5px] text-slate-400">
            IC95 [{n1(f.ic95[0], 3)}, {n1(f.ic95[1], 3)}]
          </span>
        ) : (
          <span className={esSignificativo(f.p_valor) ? 'font-bold text-emerald-300' : 'text-slate-400'}>{fmtP(f.p_valor)}</span>
        ),
    },
    { clave: 'n', titulo: 'n', definicion: 'Observaciones pareadas que entran en el contraste.', alinear: 'right' },
    {
      clave: 'veredicto',
      titulo: 'Conclusión',
      definicion: 'Lectura del resultado en los términos del problema, no en jerga estadística.',
      render: (f) => (
        <div>
          <span className={esSignificativo(f.p_valor) ? 'text-emerald-300' : 'text-slate-300'}>{f.veredicto}</span>
          {f.cautela && (
            <div className="mt-1 flex gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 p-1.5">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-amber-400" />
              <span className="text-[10.5px] leading-snug text-amber-200/90">{f.cautela}</span>
            </div>
          )}
        </div>
      ),
    },
  ];

  const ficha: Ficha = {
    titulo: `T6 · Cinco contrastes estadísticos robustos: ¿la diferencia es real o es ruido? (${ciclo.horizonte} días)`,
    queMuestra:
      `Los ${filas.length} contrastes aplicados a los errores fuera de muestra del modelo ganador frente a la ` +
      'persistencia, cada uno con su hipótesis nula explícita, su estadístico, su p-valor y la razón por la que ' +
      'se eligió esa prueba y no otra.',
    comoLeer:
      'Cada fila responde a una pregunta distinta y no son intercambiables: Diebold-Mariano y Wilcoxon miran el ' +
      '**error**, McNemar mira la **decisión de avisar**, y la permutación comprueba que el modelo no esté ' +
      'simplemente acertando por azar. Un p-valor por encima de α **no prueba que no haya diferencia**: significa ' +
      'que estos datos no bastan para afirmarla. Donde una prueba puede engañar por sí sola, lleva un aviso.',
    hallazgo:
      `${rechazan} de ${filas.length} contrastes rechazan su hipótesis nula a α = ${ALFA}. ` +
      filas
        .filter((f) => esSignificativo(f.p_valor))
        .map((f) => `${f.prueba.split(' ')[0]} (p = ${fmtP(f.p_valor)})`)
        .join(', ') +
      (rechazan > 0 ? '.' : ' Ninguno alcanza el nivel declarado.'),
    criterio:
      `Nivel de significación α = ${ALFA}, fijado antes de ejecutar. Sin corrección por multiplicidad: las cinco ` +
      'pruebas responden a preguntas distintas y no se usan para escoger la más favorable.',
    procedencia:
      `Errores pareados de las predicciones fuera de muestra agregadas de los ${ciclo.t5_validacion_cruzada.length} ` +
      'pliegues. Diebold-Mariano con varianza de Newey-West y corrección Harvey-Leybourne-Newbold; bootstrap ' +
      'estacionario de Politis-Romano con 2 000 réplicas; permutación con 2 000 réplicas.',
    limitaciones:
      'Los pliegues comparten historia, así que los errores no son del todo independientes ni siquiera con estas ' +
      'correcciones, y los p-valores son algo optimistas. La significación estadística **no es relevancia ' +
      'operativa**: una mejora de 0,1 µg/L puede ser significativa con n grande y no cambiar ninguna decisión. Y ' +
      'al revés, no rechazar con esta muestra no cierra la cuestión.',
  };

  return <TablaExplicada ficha={ficha} columnas={columnas} datos={filas as never} claveFila={(f) => f.prueba} />;
};

// ═══════════════════════════════════════════════════════════════════════════
// G5 — Predicho frente a observado
// ═══════════════════════════════════════════════════════════════════════════

const FiguraG5: React.FC<{ ciclo: CicloHorizonte; umbral: number }> = ({ ciclo, umbral }) => {
  const g = ciclo.g5_dispersion;
  const fn = g.puntos.filter((p) => p.obs >= umbral && p.pred < umbral).length;
  const fp = g.puntos.filter((p) => p.obs < umbral && p.pred >= umbral).length;
  const eventos = g.puntos.filter((p) => p.obs >= umbral).length;

  const ficha: Ficha = {
    titulo: `G5 · Predicho frente a observado: dónde se equivoca ${g.modelo} y si esos fallos importan`,
    queMuestra:
      `Cada punto es una predicción fuera de muestra del nivel de clorofila a ${ciclo.horizonte} días, situada ` +
      `por su valor observado (eje horizontal) y el previsto (eje vertical). ` +
      (g.submuestreo > 1 ? `Se muestra 1 de cada ${g.submuestreo} predicciones.` : ''),
    comoLeer:
      'La diagonal es la predicción perfecta: cuanto más se aleja un punto de ella, mayor el error. Pero lo que ' +
      'decide es **de qué lado de las líneas ámbar cae**, porque esas marcan el umbral de aviso. El rectángulo ' +
      'rojo inferior derecho es la zona peligrosa: floraciones reales que el modelo situó por debajo del umbral. ' +
      'Los puntos rojos son los que caen del lado equivocado.',
    hallazgo:
      `De ${eventos} episodios reales por encima de ${umbral} µg/L en el conjunto dibujado, **${fn} quedaron por ` +
      `debajo del umbral en la predicción** y ${fp} avisos no correspondían a un episodio. La nube se aplana ` +
      'respecto a la diagonal en la parte alta: el modelo **encoge sus predicciones hacia la media**, que es el ' +
      'comportamiento esperado de un ajuste por error cuadrático y justo el que peor conviene a una alerta.',
    criterio: `Umbral de aviso ${umbral} µg/L (OMS alerta 1), dibujado en los dos ejes.`,
    procedencia:
      `Predicciones fuera de muestra del modelo ganador (${g.modelo}), reconstruidas a nivel absoluto sumando el ` +
      `incremento pronosticado a la clorofila del día de origen. MAE del conjunto: ${n1(g.mae, 3)} µg/L.`,
    limitaciones:
      'La figura muestra el umbral **físico**, no el umbral de decisión calibrado que usan las métricas de T3, ' +
      'así que los recuentos de esta figura y los de aquella tabla no tienen por qué coincidir. El submuestreo ' +
      'puede dejar fuera episodios concretos. Y como el eje horizontal es la clorofila de la sonda, hereda su ' +
      'sesgo respecto al laboratorio.',
  };

  return (
    <Figura ficha={ficha}>
      <DispersionPrediccion puntos={g.puntos} umbral={umbral} modelo={g.modelo} />
    </Figura>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// G6 — Explicabilidad
// ═══════════════════════════════════════════════════════════════════════════

const FiguraG6: React.FC<{ ciclo: CicloHorizonte }> = ({ ciclo }) => {
  const g = ciclo.g6_shapley;
  const top = g.contribuciones[0];
  const suben = g.contribuciones.filter((c) => c.contribucion > 0).length;
  const topGlobal = g.importancia_global[0];

  const ficha: Ficha = {
    titulo: `G6 · Por qué el modelo dijo esto: contribuciones de Shapley del caso del ${g.fecha_caso}`,
    queMuestra:
      `La descomposición exacta de una predicción concreta —la del ${g.fecha_caso}— en las aportaciones de cada ` +
      `rasgo, partiendo del valor esperado del modelo ${g.modelo_local} y llegando a la predicción final. Debajo, ` +
      `la importancia global por permutación del modelo ganador (${g.modelo_global}).`,
    comoLeer:
      'Se recorre de arriba abajo como una escalera: se parte del valor esperado y cada barra desplaza el ' +
      'pronóstico. **Rojo empuja al alza, azul a la baja**, y la longitud es la magnitud del empujón en µg/L. Pase ' +
      'el cursor sobre una barra para ver el valor que tomó ese rasgo. Las dos figuras responden a preguntas ' +
      'distintas: la cascada explica **este caso**, la de importancia explica **el modelo en general**.',
    hallazgo:
      `El rasgo que más pesa en este caso es **${top?.rasgo}** (${top?.contribucion >= 0 ? '+' : ''}` +
      `${n1(top?.contribucion, 3)} µg/L, con valor ${n1(top?.valor, 2)}); ${suben} de los ${g.contribuciones.length} ` +
      `rasgos mostrados empujan al alza. El modelo predijo un incremento de ${n1(g.prediccion, 2)} µg/L y el ` +
      `observado fue ${n1(g.observado, 2)} µg/L, partiendo de ${n1(g.chl_actual, 2)} µg/L. Globalmente, el rasgo ` +
      `más determinante es **${topGlobal?.rasgo}**: barajarlo empeora el MAE en ${n1(topGlobal?.aumento_mae, 4)} µg/L.`,
    criterio:
      g.nota_exactitud +
      ' La importancia por permutación mide el efecto sobre el error real, no la mecánica interna del ajuste, y ' +
      'por eso se puede aplicar igual a un modelo lineal que a uno de árboles.',
    procedencia:
      `Cascada calculada sobre ${g.modelo_local} ajustado en el último pliegue de entrenamiento. Importancia ` +
      `global por permutación de ${g.modelo_global} sobre el tramo de prueba de ese mismo pliegue, con 8 ` +
      'repeticiones por rasgo.',
    limitaciones:
      `La cascada explica a **${g.modelo_local}**, que aquí coincide con el mejor por error pero que no tiene por ` +
      'qué ser siempre el modelo desplegado: para los de árboles no hay atribución local exacta sin librerías ' +
      'adicionales, y por eso se acompaña de la importancia global. Los rasgos están correlacionados entre sí, de ' +
      'modo que la atribución reparte crédito entre variables que se mueven juntas y **no debe leerse como ' +
      'causalidad**: que la ficocianina contribuya no demuestra que cause la floración.',
  };

  return (
    <Figura ficha={ficha}>
      <div className="space-y-4">
        <CascadaShapley base={g.base} contribuciones={g.contribuciones} prediccion={g.prediccion} />
        <div className="border-t border-slate-800 pt-3">
          <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Importancia global por permutación — {g.modelo_global}
          </h5>
          <BarrasImportancia datos={g.importancia_global} />
        </div>
      </div>
    </Figura>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Fase 6 — Despliegue
// ═══════════════════════════════════════════════════════════════════════════

const FaseDespliegue: React.FC<{ informe: InformeCRISPDM }> = ({ informe }) => {
  const f = informe.fase_6_despliegue;
  const favorable = f.resumen.some((r) => r.significativo);

  return (
    <div className="space-y-3">
      <div
        className={`flex gap-3 rounded-xl border p-4 ${
          favorable ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
        }`}
      >
        {favorable ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        )}
        <div>
          <h4 className="text-sm font-bold text-slate-100">Veredicto</h4>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{f.veredicto}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="bg-slate-950 text-slate-400">
              {['Horizonte', 'Modelo', 'MAE', 'MAE persist.', 'Skill', 'F1', 'F1 persist.', 'p D-M', 'p McNemar', 'p Permut.'].map((h) => (
                <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.resumen.map((r) => (
              <tr key={r.horizonte} className="border-t border-slate-800">
                <td className="px-2.5 py-2 font-semibold text-slate-200">{r.horizonte} días</td>
                <td className="px-2.5 py-2 text-slate-300">{r.modelo}</td>
                <td className="px-2.5 py-2 text-right font-mono text-slate-300">{n1(r.mae, 3)}</td>
                <td className="px-2.5 py-2 text-right font-mono text-slate-500">{n1(r.mae_persistencia, 3)}</td>
                <td className="px-2.5 py-2 text-right">
                  <Chip tono={(r.skill_pct ?? 0) > 0 ? 'ok' : 'mal'}>{n1(r.skill_pct, 1)} %</Chip>
                </td>
                <td className="px-2.5 py-2 text-right font-mono text-slate-300">{n1(r.f1, 3)}</td>
                <td className="px-2.5 py-2 text-right font-mono text-slate-500">{n1(r.f1_persistencia, 3)}</td>
                <td className={`px-2.5 py-2 text-right font-mono ${esSignificativo(r.p_diebold_mariano) ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {fmtP(r.p_diebold_mariano)}
                </td>
                <td className={`px-2.5 py-2 text-right font-mono ${esSignificativo(r.p_mcnemar) ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {fmtP(r.p_mcnemar)}
                </td>
                <td className={`px-2.5 py-2 text-right font-mono ${esSignificativo(r.p_permutacion) ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {fmtP(r.p_permutacion)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] leading-relaxed text-slate-400">
        Las métricas de esta tabla proceden del bloque temporal final no usado para seleccionar el modelo:
        {` ${f.resumen.length ? f.resumen[0].modelo : 'el ganador'} `}se evaluó una sola vez después de la CV,
        evitando reutilizar los pliegues de selección como resultado final.
      </p>

      <NotaMetodologica titulo="por qué el error medio y la calidad de la alerta se informan por separado">
        <p>{f.lectura_doble}</p>
      </NotaMetodologica>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Condiciones de uso — se publican con el mismo peso que el veredicto
        </h4>
        <ul className="space-y-1.5">
          {f.condiciones_de_uso.map((c, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-slate-300">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CRISPDMModule;
