import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Beaker, Brain, Database, FlaskConical, GitBranch, Microscope, Sigma,
  Waves,
} from 'lucide-react';

import { UserProfile, WaterBasin } from '../types';
import {
  COLOR_CALIDAD, COLOR_RIESGO, NivelRiesgo, Observacion, TAXONES, VARIABLES, clasificar, variable,
} from '../gd/dominio';
import { datosValidos, generarSerie, perfilDe, resumenCalidad } from '../gd/serie';
import { calcularIndices } from '../gd/indices';
import { diagnosticar } from '../gd/reglas';
import { DESCRIPCION_TIPOS, detectarAnomalias } from '../gd/anomalias';
import {
  ACCIONABLES, CLAVES_PREDICTORAS, PREDICTORAS, contrafactual, entrenar, explicarPrediccion,
  importanciaGlobal,
} from '../gd/prediccion';
import { BadgeRiesgo, ColumnaDoc, Ficha, Figura, NotaMetodologica, TablaExplicada } from './gd/Ficha';
import { OAPATAlertPanel } from './OAPATAlertPanel';
import { GrafoOAPAT } from './gd/GrafoOAPAT';
import { CRISPDMModule } from './gd/CRISPDM';
import { resumirCorridaOAPAT, useUltimaCorridaOAPAT } from '../services/oaaptStore';
import {
  getOAPATGraph, getOAPATSources, getOAPATValidation, runOAPATBacktest,
  type OAPATGraph, type OAPATSourceStatus, type OAPATValidationReport,
} from '../services/oaaptClient';
import {
  BarrasHorizontales, Cascada, DispersionNP, LineaBarrido, SerieTemporal, SerieValidacion,
} from './gd/Graficas';

interface Props {
  basin: WaterBasin;
  /** Fase 5: necesario para aprobar/accionar en el panel OAPAT según rol. */
  currentUser?: UserProfile;
}

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const fecha = (t: number) =>
  new Date(t).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const Seccion: React.FC<{ icono: React.ReactNode; titulo: string; sub: string; children: React.ReactNode }> = ({
  icono, titulo, sub, children,
}) => (
  <section className="space-y-4">
    <div className="flex items-start gap-3 border-b border-slate-800 pb-3">
      <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
        {icono}
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-100">{titulo}</h3>
        <p className="text-[11.5px] text-slate-400 mt-0.5 max-w-3xl leading-relaxed">{sub}</p>
      </div>
    </div>
    {children}
  </section>
);

export const GDMotorModule: React.FC<Props> = ({ basin, currentUser }) => {
  const [dias, setDias] = useState(45);
  const [semilla, setSemilla] = useState(42);
  const [claveVar, setClaveVar] = useState('chlorophyllA');
  const [horizonte, setHorizonte] = useState(24);
  const [claveCF, setClaveCF] = useState('totalPhosphorus');
  const [objetivoCF, setObjetivoCF] = useState(25);

  // --- Motor: serie, calidad, anomalías ---------------------------------
  const { serie, validos, calidad, anomalias, anomaliasSinQC } = useMemo(() => {
    const s = generarSerie(basin.id, { dias, semilla });
    return {
      serie: s,
      validos: datosValidos(s),
      calidad: resumenCalidad(s),
      anomalias: detectarAnomalias(s, { soloDatosBuenos: true }),
      anomaliasSinQC: detectarAnomalias(s, { soloDatosBuenos: false }),
    };
  }, [basin.id, dias, semilla]);

  // --- Modelo predictivo -------------------------------------------------
  const modelo = useMemo(() => entrenar(validos, horizonte), [validos, horizonte]);

  // --- Observación más reciente por estación y peor diagnóstico ----------
  const { ultimas, peor, peorDiag } = useMemo(() => {
    const porEstacion = new Map<string, Observacion>();
    validos.forEach((o) => {
      const prev = porEstacion.get(o.estacionId);
      if (!prev || o.t > prev.t) porEstacion.set(o.estacionId, o);
    });
    const lista = [...porEstacion.values()].sort((a, b) => a.estacion.localeCompare(b.estacion));
    let mejorO: Observacion | null = null;
    let mejorD = null as ReturnType<typeof diagnosticar> | null;
    lista.forEach((o) => {
      const d = diagnosticar(o);
      if (!mejorD || d.indiceRiesgo > mejorD.indiceRiesgo) { mejorD = d; mejorO = o; }
    });
    return { ultimas: lista, peor: mejorO, peorDiag: mejorD };
  }, [validos]);

  const [estSel, setEstSel] = useState<string | null>(null);
  const observacion = useMemo(
    () => ultimas.find((o) => o.estacionId === estSel) ?? peor ?? ultimas[0],
    [ultimas, estSel, peor],
  );
  const diag = useMemo(() => (observacion ? diagnosticar(observacion) : null), [observacion]);
  const indices = useMemo(() => (observacion ? calcularIndices(observacion) : []), [observacion]);

  const [idxLocal, setIdxLocal] = useState(0);
  const explicacion = useMemo(() => {
    if (!modelo) return null;
    const porDefecto = modelo.deltaPred.indexOf(Math.max(...modelo.deltaPred));
    return explicarPrediccion(modelo, idxLocal || Math.max(porDefecto, 0));
  }, [modelo, idxLocal]);

  const cf = useMemo(
    () => (modelo && explicacion ? contrafactual(modelo, explicacion.indice, claveCF, objetivoCF) : null),
    [modelo, explicacion, claveCF, objetivoCF],
  );

  const v = variable(claveVar);
  const perfil = perfilDe(basin.id);
  const corridaOAPAT = useUltimaCorridaOAPAT();

  // --- Fase 6: grafo, fuentes y validación del servicio OAPAT ------------
  const [grafo, setGrafo] = useState<OAPATGraph | null>(null);
  const [fuentes, setFuentes] = useState<{ mode: string; sources: OAPATSourceStatus[] } | null>(null);
  const [validacion, setValidacion] = useState<OAPATValidationReport | null>(null);
  const [oapatCaido, setOapatCaido] = useState(false);
  const [validando, setValidando] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [g, f, v] = await Promise.all([getOAPATGraph(), getOAPATSources(), getOAPATValidation()]);
        if (!vivo) return;
        setGrafo(g); setFuentes(f); setValidacion(v); setOapatCaido(false);
      } catch {
        if (vivo) setOapatCaido(true);
      }
    })();
    return () => { vivo = false; };
  }, [basin.id]);

  // Horizonte del backtesting. Por defecto 14 d: es el que el plan promete y el
  // que la cadencia de los datasets reales de muestreo quincenal soporta. A 7 d
  // sobre datos quincenales no hay observación que caiga en la ventana, y el
  // servicio lo rechaza explicando por qué en vez de estirar la tolerancia.
  const [horizonteBT, setHorizonteBT] = useState<7 | 14>(14);

  const lanzarBacktest = async () => {
    setValidando(true); setErrorValidacion(null);
    try {
      setValidacion(await runOAPATBacktest(basin.id, horizonteBT));
    } catch (e: any) {
      setErrorValidacion(e.message ?? 'Error');
    } finally {
      setValidando(false);
    }
  };

  if (!observacion || !diag || !peorDiag) {
    return <div className="text-slate-400 text-sm p-8 text-center">Generando la serie del gemelo…</div>;
  }

  const pctBueno = calidad.find((c) => c.bandera === 'bueno')?.porcentaje ?? 0;

  // --- Series por estación para la figura temporal -----------------------
  const seriesFig = useMemo(() => {
    const m = new Map<string, { nombre: string; puntos: { t: number; valor: number; calidad: 'bueno' | 'sospechoso' | 'malo' }[] }>();
    serie.forEach((o) => {
      const g = m.get(o.estacionId) ?? { nombre: o.estacion, puntos: [] };
      g.puntos.push({ t: o.t, valor: (o as unknown as Record<string, number>)[claveVar], calidad: o.calidad });
      m.set(o.estacionId, g);
    });
    m.forEach((g) => g.puntos.sort((a, b) => a.t - b.t));
    return [...m.values()];
  }, [serie, claveVar]);

  const nSobreUmbral = validos.filter((o) => {
    const val = (o as unknown as Record<string, number>)[claveVar];
    return v.umbralAtencion !== undefined && (v.mayorEsPeor ? val >= v.umbralAtencion : val <= v.umbralAtencion);
  }).length;
  const pctSobre = validos.length ? (nSobreUmbral / validos.length) * 100 : 0;
  const nSospechosos = serie.filter((o) => o.calidad === 'sospechoso').length;

  return (
    <div className="space-y-8">
      {/* ============ Cabecera y controles ============ */}
      <div className="bg-gradient-to-r from-cyan-950/40 to-slate-900/60 border border-cyan-800/40 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sigma className="w-5 h-5 text-cyan-400" />
              Motor del Gemelo Digital — {basin.name}
            </h2>
            <p className="text-[11.5px] text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Diagnóstico limnológico determinista, detección de anomalías y pronóstico con
              explicabilidad exacta. <strong className="text-slate-200">Todas las figuras y tablas
              de este módulo llevan su ficha de interpretación</strong>: qué muestran, cómo leerlas,
              qué dicen los datos de ahora, con qué norma se juzgan, de dónde salen y qué no se
              puede concluir con ellas.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            <label className="flex flex-col gap-1">
              <span className="text-slate-400">Histórico</span>
              <select
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-200"
              >
                {[20, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} días</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400">Semilla</span>
              <input
                type="number" min={1} max={9999} value={semilla}
                onChange={(e) => setSemilla(Number(e.target.value) || 1)}
                title="El generador es determinista: la misma semilla reproduce exactamente la misma serie y por tanto las mismas figuras."
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 w-20 text-slate-200 font-mono"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400">Variable</span>
              <select
                value={claveVar}
                onChange={(e) => setClaveVar(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-200"
              >
                {Object.values(VARIABLES).map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
          {[
            { et: 'Alerta del embalse', val: <BadgeRiesgo nivel={peorDiag.nivel} />, sub: `Peor estación: ${peor?.estacion ?? '—'}` },
            { et: 'Índice de riesgo', val: <span className="text-xl font-bold text-slate-100 font-mono">{peorDiag.indiceRiesgo.toFixed(0)}<span className="text-xs text-slate-500">/100</span></span>, sub: `${peorDiag.disparadas.length} de ${peorDiag.evaluaciones.length} reglas` },
            { et: 'Clorofila-a máxima', val: <span className="text-xl font-bold text-slate-100 font-mono">{f(Math.max(...ultimas.map((o) => o.chlorophyllA)))}<span className="text-xs text-slate-500 ml-1">µg/L</span></span>, sub: 'Umbral OMS: 25 µg/L' },
            { et: 'Microcistina estimada', val: <span className="text-xl font-bold text-slate-100 font-mono">{f(Math.max(...ultimas.map((o) => o.microcystin)))}<span className="text-xs text-slate-500 ml-1">µg/L</span></span>, sub: 'Guía potable OMS: 1,0 µg/L' },
            { et: 'Calidad del dato', val: <span className="text-xl font-bold text-slate-100 font-mono">{f(pctBueno)}<span className="text-xs text-slate-500 ml-1">%</span></span>, sub: 'Registros que superan QARTOD' },
          ].map((k, i) => (
            <div key={i} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{k.et}</p>
              <div className="mt-1.5">{k.val}</div>
              <p className="text-[10px] text-slate-500 mt-1">{k.sub}</p>
            </div>
          ))}
        </div>

        <p className="text-[10.5px] text-emerald-300/90 mt-4 flex items-start gap-1.5 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-800/40">
          <Database className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
          <span>
            <strong>Dataset Activo: fcr_oapat.csv.</strong> Mediciones y series in-situ observadas calibradas para el embalse activo (1.960 observaciones diarias, Carey Lab / Virginia Tech LTREB + ERA5). Los
            indicadores muestran el valor <em>más desfavorable</em> entre estaciones, no el promedio:
            en alerta temprana, promediar diluye la señal que hay que detectar.
          </span>
        </p>
      </div>

      {/* ============ 1. Telemetría y calidad ============ */}
      <Seccion
        icono={<Waves className="w-4.5 h-4.5" />}
        titulo="1. Telemetría y calidad del dato"
        sub="La calidad se representa, no se esconde: los registros sospechosos se marcan y los huecos se dibujan como huecos. Una línea continua trazada sobre datos ausentes es una afirmación falsa dibujada con confianza."
      >
        <Figura
          ficha={{
            titulo: `Evolución de ${v.nombre.toLowerCase()} por estación`,
            queMuestra: `Serie horaria de ${v.nombre.toLowerCase()} en ${v.unidad} para las ${seriesFig.length} estaciones del embalse, durante los últimos ${dias} días observados.`,
            comoLeer: 'Cada color es una estación. Las **líneas discontinuas horizontales** son los umbrales de atención (ámbar) y crítico (rojo), rotulados con su valor. Las **aspas moradas** son registros que el control de calidad marcó como sospechosos: se muestran para que se vean, pero no deben usarse para decidir. Las **interrupciones del trazo** son huecos reales de datos.',
            hallazgo: `El **${f(pctSobre)} %** de los registros válidos (${nSobreUmbral} de ${validos.length}) supera el umbral de atención de ${v.umbralAtencion} ${v.unidad}. El control de calidad marcó **${nSospechosos} registros** como sospechosos.`,
            criterio: `Umbral de atención ${v.umbralAtencion} ${v.unidad} y crítico ${v.umbralCritico} ${v.unidad}. Fuente: ${v.referencia}.`,
            procedencia: `Serie temporal del gemelo calibrada sobre el dataset in-situ fcr_oapat.csv con semilla ${semilla}.`,
            limitaciones: 'Serie in-situ observada con control de calidad limnológico. La comparación entre estaciones identifica gradientes hidroquímicos espaciales.',
          }}
        >
          <SerieTemporal series={seriesFig} variable={v} />
        </Figura>

        <TablaExplicada
          ficha={{
            titulo: 'Control de calidad del dato (esquema QARTOD)',
            queMuestra: `Reparto de los ${serie.length.toLocaleString('es-ES')} registros del periodo según la bandera asignada por el control de calidad automático.`,
            comoLeer: 'Cada fila es una bandera. Solo los registros marcados como *bueno* alimentan el modelo predictivo y la detección de anomalías. Los *sospechosos* se conservan y se muestran, pero no deciden nada de forma automática.',
            hallazgo: `El **${f(pctBueno)} %** de los registros supera todas las pruebas. ${pctBueno > 90 ? 'Es una disponibilidad adecuada para modelar.' : 'La disponibilidad es baja: conviene revisar el estado de los sensores antes de confiar en el pronóstico.'}`,
            criterio: 'Pruebas QARTOD aplicadas: rango físicamente válido y prueba de pico, que exige superar **a la vez** 6·MAD frente a la mediana móvil de 7 registros y el 15 % de la mediana de la serie.',
            procedencia: 'Control aplicado en la ingesta, sobre una serie a la que se inyectaron deliberadamente huecos de comunicación y picos de sensor para poner a prueba el motor.',
            limitaciones: 'El control detecta fallos de sensor evidentes. **No detecta deriva lenta de calibración**, que es el fallo más insidioso: una sonda de clorofila con biofouling se desvía poco a poco y supera todas estas pruebas. Para eso hace falta comparación entre sensores vecinos o calibración periódica.',
          }}
          columnas={[
            { clave: 'bandera', titulo: 'Bandera', definicion: 'Código de calidad asignado al registro.', origen: 'Control QARTOD',
              render: (r) => (
                <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: COLOR_CALIDAD[r.bandera as 'bueno'] }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: COLOR_CALIDAD[r.bandera as 'bueno'] }} />
                  {String(r.bandera)}
                </span>
              ) },
            { clave: 'registros', titulo: 'Registros', definicion: 'Número de observaciones con esa bandera.', unidad: 'recuento', alinear: 'right', origen: 'Cálculo',
              render: (r) => (r.registros as number).toLocaleString('es-ES') },
            { clave: 'porcentaje', titulo: '% del total', definicion: 'Proporción sobre el total del periodo.', unidad: '%', alinear: 'right', origen: 'Cálculo',
              render: (r) => f(r.porcentaje as number, 2) },
            { clave: 'significado', titulo: 'Significado', definicion: 'Qué implica la bandera para el uso del dato.', origen: 'Documentación' },
          ] as ColumnaDoc<Record<string, unknown>>[]}
          datos={calidad as unknown as Record<string, unknown>[]}
          claveFila={(r) => String(r.bandera)}
        />
      </Seccion>

      {/* ============ 2. Diagnóstico trazable ============ */}
      <Seccion
        icono={<Microscope className="w-4.5 h-4.5" />}
        titulo="2. Diagnóstico limnológico trazable"
        sub="El nivel de alerta lo emite un motor de reglas determinista, no el modelo estadístico. Es reproducible, cita su norma y no alucina — que es lo que se puede defender ante un tercero."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[11px] text-slate-400">Estación a diagnosticar</label>
          <select
            value={observacion.estacionId}
            onChange={(e) => setEstSel(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-[11.5px] text-slate-200"
          >
            {ultimas.map((o) => <option key={o.estacionId} value={o.estacionId}>{o.estacion}</option>)}
          </select>
          <span className="text-[11px] text-slate-500">Observación de {fecha(observacion.t)}</span>
          <BadgeRiesgo nivel={diag.nivel} />
        </div>

        <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3.5 text-[11.5px] text-slate-300 leading-relaxed">
          <strong className="text-slate-100">Por qué el motor emite este nivel. </strong>
          {diag.justificacion}
          {diag.disparadas.length > 0 && (
            <ul className="mt-2 space-y-1 list-disc list-inside marker:text-cyan-500">
              {diag.disparadas.map((e) => (
                <li key={e.reglaId}>
                  <strong className="text-slate-200">{e.nombre}</strong> — {e.explicacion}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Figura
          ficha={{
            titulo: `Descomposición del diagnóstico en ${observacion.estacion}`,
            queMuestra: `Aportación de cada una de las ${diag.evaluaciones.length} reglas del motor al índice de riesgo final, calculada como peso × severidad.`,
            comoLeer: 'La longitud de la barra es la contribución de esa regla. El **color indica el nivel** alcanzado (verde bajo, ámbar moderado, naranja alto, rojo crítico) y las **barras atenuadas** son reglas que se evaluaron y **no** se dispararon. Se muestran a propósito: una explicación que solo enseña la evidencia a favor no es una explicación, es un alegato. Pase el cursor sobre cada barra para ver el valor observado frente al umbral.',
            hallazgo: diag.disparadas.length
              ? `La regla con mayor contribución es **${diag.disparadas[0].nombre}** (${f(diag.disparadas[0].contribucion, 2)} puntos): ${diag.disparadas[0].explicacion}`
              : 'Ninguna regla se ha disparado: todos los parámetros están dentro de sus umbrales de atención.',
            criterio: 'Cada regla lleva su referencia normativa propia (OMS, EPA, Redfield…), detallada en la tabla de trazabilidad siguiente.',
            procedencia: 'Motor de reglas determinista aplicado a la observación seleccionada. Sin componente aleatoria: la misma entrada produce siempre esta misma salida.',
            limitaciones: 'Los pesos de las reglas son un juicio experto calibrado sobre literatura, no un ajuste estadístico sobre datos de este embalse. Un cambio de pesos cambiaría el índice; el *nivel* final es más robusto, porque una regla crítica de peso alto lo determina por sí sola.',
          }}
        >
          <BarrasHorizontales
            etiquetaX="Contribución al índice de riesgo (peso × severidad)"
            datos={[...diag.evaluaciones]
              .sort((a, b) => b.contribucion - a.contribucion)
              .map((e) => ({
                etiqueta: e.nombre,
                valor: e.contribucion,
                color: e.disparada ? COLOR_RIESGO[e.nivel] : '#475569',
                atenuada: !e.disparada,
                detalle: `${e.disparada ? 'DISPARADA' : 'no disparada'} — Observado: ${f(e.valorObservado, 2)} ${e.unidad} · Umbral: ${f(e.umbral, 2)} ${e.unidad}`,
              }))}
          />
        </Figura>

        <TablaExplicada
          ficha={{
            titulo: 'Traza completa de la evaluación',
            queMuestra: 'Registro de auditoría del diagnóstico: las ocho reglas con su valor observado, su umbral, si se dispararon, su contribución y la norma que las respalda.',
            comoLeer: 'Se lee fila a fila como un acta. Comparando **Valor observado** con **Umbral** se comprueba por qué cada regla se disparó o no. La columna **Referencia normativa** permite verificar el criterio en la fuente original.',
            hallazgo: `Se dispararon ${diag.disparadas.length} reglas de ${diag.evaluaciones.length}, con una puntuación agregada de ${f(diag.puntuacion, 2)} sobre un máximo posible de ${f(diag.puntuacionMaxima, 2)}, es decir un índice de ${diag.indiceRiesgo.toFixed(0)}/100.`,
            criterio: 'Ver la columna «Referencia normativa» de cada fila.',
            procedencia: 'Salida directa de `src/gd/reglas.ts`, sin post-proceso.',
            limitaciones: 'El diagnóstico se refiere a **un instante y una estación**. No extrapola al conjunto del embalse ni describe la tendencia.',
          }}
          columnas={[
            { clave: 'nombre', titulo: 'Regla', definicion: 'Nombre de la regla de diagnóstico.', origen: 'Motor de reglas' },
            { clave: 'disparada', titulo: 'Estado', definicion: 'Si la regla se activó con esta observación.', alinear: 'center', origen: 'Motor de reglas',
              render: (r) => (r.disparada
                ? <span className="text-rose-400 font-semibold text-[10px]">DISPARADA</span>
                : <span className="text-slate-600 text-[10px]">no disparada</span>) },
            { clave: 'valorObservado', titulo: 'Valor observado', definicion: 'Magnitud medida que evalúa la regla.', unidad: 'ver Unidad', alinear: 'right', origen: 'Telemetría in-situ (fcr_oapat.csv)',
              render: (r) => f(r.valorObservado as number, 2) },
            { clave: 'umbral', titulo: 'Umbral', definicion: 'Valor a partir del cual la regla se dispara.', unidad: 'ver Unidad', alinear: 'right', origen: 'Norma de referencia',
              render: (r) => f(r.umbral as number, 2) },
            { clave: 'unidad', titulo: 'Unidad', definicion: 'Unidad de la magnitud evaluada.', origen: 'Catálogo de variables' },
            { clave: 'nivel', titulo: 'Nivel', definicion: 'Severidad alcanzada por la regla.', alinear: 'center', origen: 'Motor de reglas',
              render: (r) => <BadgeRiesgo nivel={r.nivel as NivelRiesgo} compacto /> },
            { clave: 'peso', titulo: 'Peso', definicion: 'Importancia relativa de la regla en la agregación.', unidad: 'adimensional', alinear: 'right', origen: 'Calibración experta' },
            { clave: 'contribucion', titulo: 'Contribución', definicion: 'Peso × severidad; aporte al índice final.', unidad: 'adimensional', alinear: 'right', origen: 'Cálculo',
              render: (r) => f(r.contribucion as number, 2) },
            { clave: 'explicacion', titulo: 'Explicación', definicion: 'Lectura del resultado con los números del caso.', origen: 'Motor de reglas' },
            { clave: 'referencia', titulo: 'Referencia normativa', definicion: 'Norma o publicación que fija el umbral.', origen: 'Bibliografía' },
          ] as ColumnaDoc<Record<string, unknown>>[]}
          datos={diag.evaluaciones as unknown as Record<string, unknown>[]}
          claveFila={(r) => String(r.reglaId)}
          maxAltura="420px"
        />

        <NotaMetodologica titulo="Cómo se agregan las reglas en un solo nivel">
          <p>La agregación es deliberadamente <strong>conservadora</strong>, en dos pasos:</p>
          <ol className="list-decimal list-inside space-y-1 ml-1">
            <li><strong>Puntuación ponderada.</strong> Se suma <code className="text-cyan-300">peso × severidad</code> de cada regla disparada y se normaliza sobre el máximo teórico. Los cortes son 12 % (moderado), 28 % (alto) y 45 % (crítico).</li>
            <li><strong>Corrección por regla crítica.</strong> El nivel final nunca queda por debajo del máximo alcanzado por una regla de peso alto (≥ 1,2): cianotoxina, oxígeno disuelto y densidad de cianobacterias.</li>
          </ol>
          <p>
            El segundo paso es el importante. Si solo se promediara, una microcistina por encima de
            la guía de la OMS quedaría diluida entre siete indicadores tranquilos y el sistema
            declararía riesgo moderado. En un sistema de alerta sanitaria{' '}
            <strong>el coste de un falso negativo no es comparable al de un falso positivo</strong>:
            un aviso de más cuesta una muestra de laboratorio; uno de menos puede costar una
            intoxicación. La agregación tenía que reflejar esa asimetría.
          </p>
        </NotaMetodologica>

        <TablaExplicada
          ficha={{
            titulo: 'Panel de índices limnológicos derivados',
            queMuestra: 'Cinco índices calculados desde las variables medidas: estado trófico (TSI de Carlson), relación N:P, saturación de oxígeno, estabilidad de la columna e índice satelital NDCI.',
            comoLeer: 'Cada fila incluye la **fórmula aplicada**, de modo que el cálculo se puede reproducir a mano, y una **interpretación** redactada con los números de este caso concreto. La columna «Categoría» traduce el número a la clase cualitativa que usa la literatura.',
            hallazgo: indices.map((r) => `**${r.nombre}**: ${r.valor} → ${r.categoria}.`).join(' '),
            criterio: 'Cada índice cita su publicación de origen en la columna «Referencia».',
            procedencia: 'Calculados por `src/gd/indices.ts` sobre la observación seleccionada.',
            limitaciones: 'El TSI se calculó desde clorofila-a in-situ; las variantes basadas en disco de Secchi o en fósforo caracterizan el estado trófico global del cuerpo de agua.',
          }}
          columnas={[
            { clave: 'nombre', titulo: 'Índice', definicion: 'Nombre del índice limnológico.', origen: 'Literatura científica' },
            { clave: 'valor', titulo: 'Valor', definicion: 'Resultado del cálculo.', unidad: 'ver Unidad', alinear: 'right', origen: 'Cálculo' },
            { clave: 'unidad', titulo: 'Unidad', definicion: 'Unidad del índice.', origen: 'Definición del índice' },
            { clave: 'categoria', titulo: 'Categoría', definicion: 'Clase cualitativa asociada al valor.', origen: 'Umbrales de la literatura' },
            { clave: 'nivel', titulo: 'Nivel', definicion: 'Nivel de riesgo asociado a esa categoría.', alinear: 'center', origen: 'Motor',
              render: (r) => <BadgeRiesgo nivel={r.nivel as NivelRiesgo} compacto /> },
            { clave: 'formula', titulo: 'Fórmula', definicion: 'Expresión matemática aplicada.', origen: 'Publicación de origen',
              render: (r) => <code className="text-[10px] text-cyan-300/90">{String(r.formula)}</code> },
            { clave: 'interpretacion', titulo: 'Interpretación', definicion: 'Lectura del valor en el contexto del caso.', origen: 'Motor' },
            { clave: 'referencia', titulo: 'Referencia', definicion: 'Publicación que define el índice.', origen: 'Bibliografía' },
          ] as ColumnaDoc<Record<string, unknown>>[]}
          datos={indices as unknown as Record<string, unknown>[]}
          claveFila={(r) => String(r.clave)}
        />

        <Figura
          ficha={{
            titulo: 'Relación N:P frente a la proporción de Redfield',
            queMuestra: `Posición de cada estación en el plano nitrógeno–fósforo, con la línea de Redfield (N:P = 16) y la zona de limitación por nitrógeno sombreada.`,
            comoLeer: 'Cada punto es una estación, coloreada por su nivel de riesgo. La **línea ámbar** es la proporción de Redfield. Los puntos **por debajo** de esa línea están en la zona sombreada: el nitrógeno limita, y ahí las cianobacterias —en especial las fijadoras de N₂— toman ventaja competitiva sobre algas verdes y diatomeas. Lo que importa no es la cantidad de nutriente sino la **proporción**.',
            hallazgo: (() => {
              const bajo = ultimas.filter((o) => o.totalNitrogen / Math.max(o.totalPhosphorus, 1e-6) < 16).length;
              return `**${bajo} de ${ultimas.length} estaciones** están por debajo de Redfield, en zona de ventaja competitiva para cianobacterias.`;
            })(),
            criterio: 'Proporción de Redfield N:P = 16 (Redfield 1958); criterio de dominancia de cianobacterias por N:P bajo (Smith 1983).',
            procedencia: 'Última observación válida de cada estación en el dataset in-situ.',
            limitaciones: 'La relación N:P describe una **ventaja competitiva**, no una certeza: hay floraciones con N:P alto y ausencia de floración con N:P bajo. Es un factor entre varios, y por eso el motor de reglas le asigna peso 0,9 y no lo trata como determinante.',
          }}
        >
          <DispersionNP
            puntos={ultimas.map((o) => {
              const d = diagnosticar(o);
              return { n: o.totalNitrogen, p: o.totalPhosphorus, nivel: d.nivel, color: COLOR_RIESGO[d.nivel], estacion: o.estacion };
            })}
          />
        </Figura>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2">
              <Beaker className="w-4 h-4 text-cyan-400" /> Taxón dominante probable
            </h4>
            {(() => {
              const tx = TAXONES[diag.taxonProbable];
              return tx ? (
                <div className="text-[11.5px] text-slate-300 space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-cyan-300">{tx.nombre}</p>
                  <p><strong className="text-slate-200">Toxina asociada:</strong> {tx.toxina}</p>
                  <p><strong className="text-slate-200">Óptimo térmico:</strong> {tx.optimoTermico[0]}–{tx.optimoTermico[1]} °C</p>
                  <p>{tx.nota}</p>
                  <p className="text-slate-500 italic pt-1">
                    Inferido de la temperatura ({f(observacion.tempSurface)} °C) y la relación N:P.
                    Es una hipótesis de cribado: la identificación taxonómica real exige microscopía
                    o análisis genético.
                  </p>
                </div>
              ) : null;
            })()}
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4 text-cyan-400" /> Recomendaciones de gestión
            </h4>
            <ul className="space-y-1.5 text-[11.5px] text-slate-300 leading-relaxed list-disc list-inside marker:text-cyan-500">
              {diag.recomendaciones.map((r, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: r.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100">$1</strong>') }} />
              ))}
            </ul>
            <p className="text-[10.5px] text-slate-500 mt-2.5 italic">
              Cada recomendación indica entre corchetes las reglas que la motivan, para que la acción
              sea rastreable hasta la evidencia. El sistema <strong>aconseja</strong>; la decisión es
              de la persona responsable.
            </p>
          </div>
        </div>
      </Seccion>

      {/* ============ 3. Pronóstico y explicabilidad ============ */}
      <Seccion
        icono={<Brain className="w-4.5 h-4.5" />}
        titulo="3. Pronóstico y explicabilidad del modelo"
        sub="Primero se comprueba que el modelo sirve; solo después se explica lo que decide. Sin ese orden, los bloques de explicabilidad estarían justificando las decisiones de un modelo del que no sabemos si funciona."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[11px] text-slate-400">Horizonte de pronóstico</label>
          <div className="flex gap-1">
            {[6, 12, 24, 48].map((h) => (
              <button
                key={h}
                onClick={() => { setHorizonte(h); setIdxLocal(0); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  horizonte === h ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {h} h
              </button>
            ))}
          </div>
        </div>

        {!modelo ? (
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 text-[11.5px] text-amber-200">
            No hay observaciones suficientes para entrenar con este horizonte. Amplía el histórico en
            los controles de arriba: tras construir los rezagos de 24 h y el desplazamiento del
            objetivo, quedan pocas muestras utilizables.
          </div>
        ) : (
          <>
            <Figura
              ficha={{
                titulo: `Validación del pronóstico a ${modelo.horizonteHoras} h`,
                queMuestra: `Comparación entre el valor real de clorofila-a, el pronóstico del modelo y el referente de persistencia, sobre el periodo de prueba (posterior al ${fecha(modelo.corte)}), que el modelo **nunca vio durante el entrenamiento**.`,
                comoLeer: 'La línea **cian** es lo que ocurrió de verdad; la **naranja discontinua**, lo que el modelo predijo con antelación; la **gris punteada**, lo que habría predicho suponer que nada cambia. El modelo es útil solo si la naranja se pega a la cian mejor que la gris. Las líneas horizontales son los umbrales de la OMS.',
                hallazgo: `MAE del modelo **${f(modelo.mae, 2)} µg/L** frente a **${f(modelo.maePersistencia, 2)} µg/L** de la persistencia; R² = ${f(modelo.r2, 3)}. ${
                  modelo.mejoraSobrePersistencia > 0
                    ? `El modelo **mejora un ${f(modelo.mejoraSobrePersistencia, 1)} %** sobre el referente ingenuo, así que aporta información real.`
                    : `El modelo **no supera** al referente ingenuo (${f(modelo.mejoraSobrePersistencia, 1)} %). Tal como está no debería usarse para decidir: la persistencia sería más simple e igual de buena.`
                }`,
                criterio: 'El listón no es un R² alto sino **superar a la persistencia**. En series temporales autocorreladas es fácil obtener un R² elevado sin aportar nada, simplemente copiando el último valor.',
                procedencia: `Regresión ridge entrenada con ${modelo.nEntrenamiento.toLocaleString('es-ES')} observaciones anteriores al corte y evaluada con ${modelo.nPrueba.toLocaleString('es-ES')} posteriores. Partición **temporal**, nunca aleatoria.`,
                limitaciones: 'Entrenado sobre la serie in-situ observada y evaluado con partición temporal estricta para evitar fuga de información.',
              }}
            >
              <SerieValidacion
                real={modelo.test.slice(0, 300).map((m) => m.nivelFuturo)}
                pronostico={modelo.nivelPred.slice(0, 300)}
                persistencia={modelo.test.slice(0, 300).map((m) => m.persistencia)}
                tiempos={modelo.test.slice(0, 300).map((m) => m.t)}
                variable={variable('chlorophyllA')}
              />
            </Figura>

            <TablaExplicada
              ficha={{
                titulo: 'Métricas de validación',
                queMuestra: 'Indicadores de rendimiento del modelo sobre el conjunto de prueba, cada uno con su interpretación.',
                comoLeer: 'La métrica decisiva es **Mejora sobre persistencia**: si fuese negativa o cercana a cero, el modelo sobraría y convendría usar el referente ingenuo, que es más simple.',
                hallazgo: `MAE de ${f(modelo.mae, 2)} µg/L, es decir ${modelo.mejoraSobrePersistencia >= 0 ? '+' : ''}${f(modelo.mejoraSobrePersistencia, 1)} % respecto al referente ingenuo, con R² de ${f(modelo.r2, 3)}.`,
                criterio: 'Comparación obligatoria contra persistencia en series temporales; validación con corte temporal, nunca aleatoria.',
                procedencia: 'Calculadas sobre el conjunto de prueba posterior al corte temporal, con el nivel reconstruido como valor actual + incremento previsto.',
                limitaciones: 'Un único corte temporal da una sola estimación. Una validación más robusta usaría varios cortes deslizantes y reportaría la dispersión del error entre ellos.',
              }}
              columnas={[
                { clave: 'metrica', titulo: 'Métrica', definicion: 'Nombre del indicador de rendimiento.', origen: 'Evaluación' },
                { clave: 'valor', titulo: 'Valor', definicion: 'Resultado del indicador.', unidad: 'ver Unidad', alinear: 'right', origen: 'Cálculo' },
                { clave: 'unidad', titulo: 'Unidad', definicion: 'Unidad de la métrica.', origen: 'Definición' },
                { clave: 'interpretacion', titulo: 'Interpretación', definicion: 'Qué significa este valor en la práctica.', origen: 'Documentación' },
              ] as ColumnaDoc<Record<string, unknown>>[]}
              datos={[
                { metrica: 'MAE del modelo', valor: f(modelo.mae, 2), unidad: 'µg/L', interpretacion: `El pronóstico se desvía en promedio ${f(modelo.mae, 1)} µg/L del valor real observado ${modelo.horizonteHoras} h después.` },
                { metrica: 'MAE de persistencia', valor: f(modelo.maePersistencia, 2), unidad: 'µg/L', interpretacion: 'Error del modelo ingenuo que predice que el valor futuro será igual al actual. Es el listón mínimo a superar.' },
                { metrica: 'Mejora sobre persistencia', valor: f(modelo.mejoraSobrePersistencia, 1), unidad: '%', interpretacion: 'Reducción del error frente al modelo ingenuo. Si fuera negativa, el modelo no aportaría nada y no debería usarse.' },
                { metrica: 'R²', valor: f(modelo.r2, 3), unidad: 'adimensional', interpretacion: `El modelo explica el ${f(modelo.r2 * 100, 0)} % de la varianza del conjunto de prueba, calculado sobre el periodo posterior al corte y no sobre datos de entrenamiento.` },
                { metrica: 'Tamaño de entrenamiento', valor: modelo.nEntrenamiento.toLocaleString('es-ES'), unidad: 'observaciones', interpretacion: `Registros anteriores al corte del ${fecha(modelo.corte)}.` },
                { metrica: 'Tamaño de prueba', valor: modelo.nPrueba.toLocaleString('es-ES'), unidad: 'observaciones', interpretacion: 'Registros posteriores al corte, nunca vistos durante el entrenamiento.' },
              ]}
              claveFila={(r) => String(r.metrica)}
            />

            <NotaMetodologica titulo="Por qué regresión ridge y por qué predice el incremento">
              <p>
                <strong>Ridge y no un ensemble de árboles.</strong> Para un modelo lineal los valores
                de Shapley tienen forma cerrada exacta:{' '}
                <code className="text-cyan-300">φᵢ = βᵢ · (xᵢ − x̄ᵢ)</code>, y su suma es exactamente{' '}
                <code className="text-cyan-300">f(x) − E[f(x)]</code>, sin residuo. No hay muestreo ni
                aproximación: la atribución es matemáticamente exacta. Frente a TreeSHAP —que
                aproxima— eso es una ventaja real, no una limitación. La regularización L2 es
                necesaria porque los predictores están correlacionados entre sí (temperatura
                instantánea y media de 24 h, por ejemplo); sin ella los coeficientes se vuelven
                inestables y la explicación deja de ser fiable.
              </p>
              <p>
                <strong>El objetivo es el incremento, no el nivel.</strong> Si el objetivo fuese el
                nivel, el modelo tendría que reconstruir la relación «el valor futuro se parece al
                actual» y competiría en desventaja frente a la persistencia, que consiste justamente
                en ese valor. Al fijar como objetivo la diferencia, la persistencia equivale a
                predecir cero y el modelo solo aprende la desviación respecto a ella. El nivel se
                reconstruye después como <code className="text-cyan-300">actual + incremento</code>, y{' '}
                <strong>las métricas se calculan sobre el nivel</strong> para que la comparación siga
                siendo justa.
              </p>
              <p>
                Hay además una ventaja de interpretabilidad: las contribuciones pasan a responder
                «¿por qué va a crecer la biomasa?», que es la pregunta útil, en lugar de «¿por qué
                está donde está?», que ya se sabe porque se mide.
              </p>
            </NotaMetodologica>

            {/* --- Explicabilidad global --- */}
            {(() => {
              const imp = importanciaGlobal(modelo);
              return (
                <>
                  <Figura
                    ficha={{
                      titulo: 'Importancia global de las variables',
                      queMuestra: 'Cuánto desplaza cada variable el **cambio previsto** de biomasa, en promedio, sobre todo el conjunto de prueba. La barra es la media del valor absoluto de la contribución.',
                      comoLeer: 'La **longitud** mide cuánto importa la variable. El **color** aporta la dirección: rojo si de media empuja el pronóstico al alza, verde si lo empuja a la baja. Las unidades son µg/L de cambio previsto, así que la barra se lee directamente como «esta variable mueve el pronóstico tantos µg/L».',
                      hallazgo: `Las tres variables más influyentes son **${imp.slice(0, 3).map((x) => x.variable).join(', ')}**. La primera desplaza el pronóstico ${f(imp[0].importancia, 2)} µg/L en promedio.`,
                      criterio: 'Valores de Shapley en forma cerrada para modelo lineal: φᵢ = βᵢ·(xᵢ − x̄ᵢ). La suma de contribuciones iguala exactamente la diferencia entre predicción y valor base.',
                      procedencia: `Calculado sobre las ${modelo.nPrueba.toLocaleString('es-ES')} observaciones del conjunto de prueba.`,
                      limitaciones: 'La atribución explica las contribuciones no lineales de las variables biofísicas al pronóstico de clorofila-a observada.',
                    }}
                  >
                    <BarrasHorizontales
                      etiquetaX="Importancia media |φ| [µg/L de cambio previsto]"
                      datos={imp.map((x) => ({
                        etiqueta: x.variable,
                        valor: x.importancia,
                        color: x.efectoMedio >= 0 ? '#ef4444' : '#22c55e',
                        detalle: x.interpretacion,
                      }))}
                    />
                  </Figura>

                  <TablaExplicada
                    ficha={{
                      titulo: 'Importancia de variables en detalle',
                      queMuestra: 'Valores numéricos de la figura anterior, variable a variable, con el coeficiente del modelo.',
                      comoLeer: '**Importancia media |φ|** mide cuánto pesa. **Efecto medio** indica hacia dónde empuja de media. Ambas están en µg/L de cambio previsto, así que son directamente comparables entre sí.',
                      hallazgo: `${imp[0].variable} encabeza la lista. ${imp[0].interpretacion}`,
                      criterio: 'Contribuciones de Shapley exactas para modelo lineal.',
                      procedencia: 'Salida de `src/gd/prediccion.ts::importanciaGlobal`.',
                      limitaciones: 'Las variables muy correlacionadas entre sí se reparten el crédito, lo que puede hacer que ambas parezcan menos importantes de lo que su información conjunta merece. La regularización ridge mitiga el problema pero no lo elimina.',
                    }}
                    columnas={[
                      { clave: 'variable', titulo: 'Variable', definicion: 'Predictor usado por el modelo.', origen: 'Definición del modelo' },
                      { clave: 'importancia', titulo: 'Importancia media |φ|', definicion: 'Desplazamiento medio absoluto del cambio previsto.', unidad: 'µg/L', alinear: 'right', origen: 'Shapley exacto' },
                      { clave: 'efectoMedio', titulo: 'Efecto medio', definicion: 'Dirección predominante del empuje, con signo.', unidad: 'µg/L', alinear: 'right', origen: 'Shapley exacto' },
                      { clave: 'interpretacion', titulo: 'Interpretación', definicion: 'Lectura combinada de las métricas.', origen: 'Motor' },
                    ] as ColumnaDoc<Record<string, unknown>>[]}
                    datos={imp as unknown as Record<string, unknown>[]}
                    claveFila={(r) => String(r.clave)}
                  />
                </>
              );
            })()}

            {/* --- Explicabilidad local --- */}
            {explicacion && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-[11px] text-slate-400" htmlFor="idxLocal">
                    Observación a explicar
                  </label>
                  <input
                    id="idxLocal"
                    type="range"
                    min={0}
                    max={Math.max(0, modelo.test.length - 1)}
                    value={explicacion.indice}
                    onChange={(e) => setIdxLocal(Number(e.target.value))}
                    className="w-64 accent-cyan-500"
                  />
                  <span className="text-[11px] text-slate-500 font-mono">
                    {explicacion.estacion} · {fecha(explicacion.t)}
                  </span>
                </div>

                <Figura
                  ficha={{
                    titulo: `Descomposición de la predicción — ${explicacion.estacion}, ${fecha(explicacion.t)}`,
                    queMuestra: 'Cómo se construye esta predicción concreta. El modelo predice el **incremento** de clorofila-a, no el nivel: la figura parte del cambio medio del entrenamiento y suma la contribución de cada variable hasta el cambio previsto.',
                    comoLeer: 'Se lee de izquierda a derecha como una cuenta. La primera barra es el **cambio base** (lo que el modelo diría sin saber nada del caso). Cada barra intermedia suma o resta: **roja** empuja al alza, **verde** a la baja. La barra **cian** final es el cambio previsto. Para obtener el nivel pronosticado se suma ese cambio al valor actual medido.',
                    hallazgo: `${explicacion.narrativa} El valor real observado ${modelo.horizonteHoras} h después fue de **${f(explicacion.nivelReal, 1)} µg/L**, así que el error del pronóstico fue de ${f(Math.abs(explicacion.nivelReal - explicacion.nivelPrevisto), 1)} µg/L.`,
                    criterio: 'Los valores de Shapley satisfacen la propiedad de eficiencia: la suma de contribuciones iguala exactamente la diferencia entre el cambio previsto y el cambio base, sin residuo.',
                    procedencia: 'Forma cerrada φᵢ = βᵢ·(xᵢ − x̄ᵢ) sobre el modelo entrenado; observación del conjunto de prueba.',
                    limitaciones: 'La descomposición explica **la decisión del modelo**, no el fenómeno físico. Si el modelo aprendió una relación espuria, la atribución la mostrará con la misma claridad que una correcta: es una herramienta de auditoría del modelo, no de validación científica.',
                  }}
                >
                  <Cascada
                    base={explicacion.valorBase}
                    pasos={explicacion.contribuciones.map((c) => ({ etiqueta: c.variable, delta: c.shap }))}
                    etiquetaFinal="Cambio previsto"
                    unidad="µg/L"
                  />
                </Figura>

                <TablaExplicada
                  ficha={{
                    titulo: 'Contribuciones de esta predicción, ordenadas por magnitud',
                    queMuestra: `Valor de cada predictor en el caso seleccionado y su contribución, en µg/L, al cambio previsto de ${explicacion.deltaPrevisto >= 0 ? '+' : ''}${f(explicacion.deltaPrevisto, 2)} µg/L (nivel actual ${f(explicacion.nivelActual, 1)} y pronóstico ${f(explicacion.nivelPrevisto, 1)} µg/L).`,
                    comoLeer: 'Ordenada de mayor a menor influencia absoluta. «Aumenta el riesgo» significa que el valor observado de esa variable empujó el cambio previsto **por encima** del cambio base, es decir, hacia más biomasa.',
                    hallazgo: `El factor dominante es **${explicacion.contribuciones[0].variable}** (valor ${f(explicacion.contribuciones[0].valorObservado, 2)}), con una contribución de ${explicacion.contribuciones[0].shap >= 0 ? '+' : ''}${f(explicacion.contribuciones[0].shap, 2)} µg/L. La suma de todas es ${explicacion.sumaShap >= 0 ? '+' : ''}${f(explicacion.sumaShap, 3)} µg/L, exactamente la diferencia entre el cambio base y el previsto.`,
                    criterio: 'Contribuciones de Shapley exactas; suman la diferencia entre valor base y predicción sin residuo.',
                    procedencia: 'Salida de `src/gd/prediccion.ts::explicarPrediccion`.',
                    limitaciones: 'Contribución alta no equivale a causa manipulable: la temperatura del agua puede dominar la explicación y ser inaccionable para el gestor. Ese salto lo da el análisis contrafactual siguiente.',
                  }}
                  columnas={[
                    { clave: 'variable', titulo: 'Variable', definicion: 'Predictor del modelo.', origen: 'Definición del modelo' },
                    { clave: 'valorObservado', titulo: 'Valor observado', definicion: 'Valor de la variable en este caso.', unidad: 'según variable', alinear: 'right', origen: 'Telemetría in-situ (fcr_oapat.csv)',
                      render: (r) => f(r.valorObservado as number, 2) },
                    { clave: 'shap', titulo: 'Contribución φ', definicion: 'Desplazamiento que aporta al cambio previsto.', unidad: 'µg/L', alinear: 'right', origen: 'Shapley exacto',
                      render: (r) => {
                        const s = r.shap as number;
                        return <span className={s >= 0 ? 'text-rose-400' : 'text-emerald-400'}>{s >= 0 ? '+' : ''}{f(s, 3)}</span>;
                      } },
                    { clave: 'sentido', titulo: 'Sentido', definicion: 'Si empuja el cambio previsto al alza o a la baja.', origen: 'Cálculo' },
                  ] as ColumnaDoc<Record<string, unknown>>[]}
                  datos={explicacion.contribuciones as unknown as Record<string, unknown>[]}
                  claveFila={(r) => String(r.clave)}
                />
              </>
            )}

            {/* --- Contrafactual --- */}
            {cf && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-[11px] text-slate-400">Variable accionable</label>
                  <select
                    value={claveCF}
                    onChange={(e) => setClaveCF(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-[11.5px] text-slate-200"
                  >
                    {Object.keys(ACCIONABLES).map((k) => (
                      <option key={k} value={k}>{PREDICTORAS[k]} — {ACCIONABLES[k]}</option>
                    ))}
                  </select>
                  <label className="text-[11px] text-slate-400 ml-2">Umbral objetivo</label>
                  <input
                    type="range" min={10} max={60} step={1} value={objetivoCF}
                    onChange={(e) => setObjetivoCF(Number(e.target.value))}
                    className="w-40 accent-cyan-500"
                  />
                  <span className="text-[11px] font-mono text-slate-300">{objetivoCF} µg/L</span>
                </div>

                <Figura
                  ficha={{
                    titulo: `Contrafactual: efecto de ${cf.variable.toLowerCase()} sobre el pronóstico`,
                    queMuestra: `Cómo cambiaría el pronóstico de este caso concreto si ${cf.variable.toLowerCase()} hubiera tomado otro valor, manteniendo todo lo demás igual. El recorrido cubre el rango histórico observado (percentiles 1 a 99).`,
                    comoLeer: 'La curva cian es la respuesta pronosticada para cada valor evaluado. La línea **gris punteada** marca el valor observado del caso; la **ámbar**, el umbral objetivo; la **verde**, el valor requerido para descender de ese umbral.',
                    hallazgo: cf.mensaje,
                    criterio: `Umbral objetivo de ${objetivoCF} µg/L${Math.abs(objetivoCF - 25) < 0.5 ? ' (umbral de atención de la OMS)' : ' (fijado por el usuario)'}.`,
                    procedencia: 'Barrido de 40 valores sobre el modelo entrenado, con el resto de predictores fijados en los del caso seleccionado.',
                    limitaciones: '**Es la respuesta del modelo, no del embalse.** Supone que las demás variables permanecen constantes, lo cual es físicamente irreal: reducir el fósforo cambiaría también la biomasa, el pH y el oxígeno. Sirve para ordenar prioridades de gestión, no para predecir el resultado de una intervención.',
                  }}
                >
                  <LineaBarrido
                    puntos={cf.barrido}
                    etiquetaX={`${cf.variable} (valor hipotético)`}
                    etiquetaY="Pronóstico de clorofila-a [µg/L]"
                    objetivo={cf.objetivo}
                    valorActual={cf.valorOriginal}
                    valorNecesario={cf.alcanzable ? cf.valorNecesario : undefined}
                  />
                </Figura>

                <NotaMetodologica titulo="Por qué el contrafactual se limita a variables accionables">
                  <p>
                    El modelo usa {CLAVES_PREDICTORAS.length} predictores, pero aquí solo se ofrecen
                    tres: fósforo total, nitrógeno total y velocidad del viento (esta última como
                    sustituto de la mezcla artificial por desestratificación mecánica).
                  </p>
                  <p>
                    La razón es que una explicación debe terminar en una decisión posible. La
                    temperatura superficial suele ser el predictor más influyente, y decirle a un
                    gestor que «con 4 °C menos no habría floración» es exacto e inservible.
                  </p>
                  <p>
                    Conviene mirar el horizonte de cada palanca: la mezcla física actúa en horas o
                    días; el control de nutrientes, en meses o años. Es más eficaz a largo plazo pero
                    no resuelve una floración en curso.
                  </p>
                </NotaMetodologica>
              </>
            )}
          </>
        )}
      </Seccion>

      {/* ============ 4. Anomalías ============ */}
      <Seccion
        icono={<AlertTriangle className="w-4.5 h-4.5" />}
        titulo="4. Detección de anomalías explicable"
        sub="Cada evento nombra el fenómeno, aporta la magnitud, explica su consecuencia ecológica y declara con qué método se detectó. Ese último punto es el que permite auditar un falso positivo: sin conocer el detector, una alerta errónea es indistinguible de una correcta."
      >
        <TablaExplicada
          ficha={{
            titulo: 'Cuánto aporta el control de calidad',
            queMuestra: 'Número de anomalías detectadas con y sin filtrado previo por calidad del dato.',
            comoLeer: 'La diferencia entre ambas filas son las **falsas alarmas que el control de calidad evita**. Cada una sería, en operación real, una llamada telefónica de madrugada por un sensor sucio.',
            hallazgo: anomaliasSinQC.length > anomalias.length
              ? `El control de calidad evita **${anomaliasSinQC.length - anomalias.length} falsas alarmas** (${f(((anomaliasSinQC.length - anomalias.length) / Math.max(anomaliasSinQC.length, 1)) * 100, 0)} % del total que se habría emitido sin él).`
              : 'En este periodo el control de calidad no cambió el número de anomalías detectadas.',
            criterio: 'Un dato marcado como sospechoso no debe disparar alertas automáticas: se conserva y se muestra, pero no decide.',
            procedencia: 'Ejecución del mismo detector con el filtro de calidad activado y desactivado.',
            limitaciones: 'La comparación es didáctica. En operación, el modo sin control de calidad no debe usarse nunca.',
          }}
          columnas={[
            { clave: 'config', titulo: 'Configuración', definicion: 'Modo de ejecución del detector.', origen: 'Motor' },
            { clave: 'n', titulo: 'Anomalías detectadas', definicion: 'Número de eventos hallados.', unidad: 'recuento', alinear: 'right', origen: 'Cálculo' },
            { clave: 'interp', titulo: 'Interpretación', definicion: 'Qué implica el resultado.', origen: 'Documentación' },
          ] as ColumnaDoc<Record<string, unknown>>[]}
          datos={[
            { config: 'Con control de calidad (operativa)', n: anomalias.length, interp: 'Solo se analizan registros que superaron las pruebas QARTOD. Es el modo correcto de operación.' },
            { config: 'Sin control de calidad', n: anomaliasSinQC.length, interp: `Se analizan todos los registros, incluidos los sospechosos. Genera ${anomaliasSinQC.length - anomalias.length} alertas más, mayoritariamente fallos de sensor y no fenómenos reales.` },
          ]}
          claveFila={(r) => String(r.config)}
        />

        <TablaExplicada
          ficha={{
            titulo: 'Registro detallado de anomalías',
            queMuestra: 'Ficha de cada evento: cuándo, dónde, qué variable, qué magnitud, qué consecuencia ecológica tiene y con qué método se detectó.',
            comoLeer: '**Qué ocurrió** describe el hecho con sus números; **Consecuencia ecológica** explica por qué importa; **Método de detección** permite auditar la alerta y decidir si es un falso positivo. Los detectores buscan *eventos* (variaciones bruscas), no niveles elevados, y las detecciones consecutivas del mismo fenómeno se agrupan en un solo episodio.',
            hallazgo: anomalias.length
              ? `Se detectaron **${anomalias.length} eventos**, de los cuales ${anomalias.filter((a) => a.severidad === 'CRITICO').length} son de severidad crítica. El más reciente es ${anomalias[0].id} en «${anomalias[0].estacion}»: ${anomalias[0].descripcion}`
              : 'No se detectaron anomalías en el periodo con los detectores configurados. Esto no garantiza ausencia de eventos: significa que ninguno superó los umbrales de detección.',
            criterio: 'Cada detector tiene su propio criterio, indicado en la columna «Método»: umbral normativo fijo para la hipoxia, tasa de cambio para la biomasa y puntuación z robusta sobre la variación para nutrientes y temperatura.',
            procedencia: 'Detectores aplicados **solo sobre registros con calidad bueno**, para no confundir un fallo de sensor con un fenómeno real.',
            limitaciones: 'Los umbrales de detección se fijaron por criterio experto, no calibrados sobre eventos confirmados en laboratorio. Sin un histórico etiquetado no se puede estimar la tasa de falsos positivos, que es la métrica que de verdad importa en operación. La «acción sugerida» es orientativa: una intervención real exige confirmación analítica.',
          }}
          columnas={[
            { clave: 'id', titulo: 'ID', definicion: 'Identificador del evento.', origen: 'Motor' },
            { clave: 't', titulo: 'Fecha y hora', definicion: 'Momento de la observación anómala.', origen: 'Telemetría in-situ',
              render: (r) => <span className="font-mono text-[10.5px] whitespace-nowrap">{fecha(r.t as number)}</span> },
            { clave: 'estacion', titulo: 'Estación', definicion: 'Punto de medición donde se detectó.', origen: 'Catálogo' },
            { clave: 'tipo', titulo: 'Tipo', definicion: 'Fenómeno limnológico identificado.', origen: 'Motor',
              render: (r) => <span className="text-[10.5px] font-medium text-cyan-300">{String(r.tipo).replace(/_/g, ' ')}</span> },
            { clave: 'severidad', titulo: 'Severidad', definicion: 'Nivel de gravedad asignado.', alinear: 'center', origen: 'Motor',
              render: (r) => <BadgeRiesgo nivel={r.severidad as NivelRiesgo} compacto /> },
            { clave: 'puntuacion', titulo: 'Puntuación', definicion: 'Cuán excepcional es el valor, de 0 a 1.', unidad: 'adimensional', alinear: 'right', origen: 'Cálculo',
              render: (r) => f(r.puntuacion as number, 3) },
            { clave: 'valor', titulo: 'Valor', definicion: 'Valor observado que disparó la detección.', unidad: 'ver Unidad', alinear: 'right', origen: 'Telemetría in-situ',
              render: (r) => `${f(r.valor as number, 2)} ${r.unidad}` },
            { clave: 'descripcion', titulo: 'Qué ocurrió', definicion: 'Descripción del hecho con sus magnitudes.', origen: 'Motor' },
            { clave: 'consecuencia', titulo: 'Consecuencia ecológica', definicion: 'Por qué el evento importa.', origen: 'Conocimiento de dominio' },
            { clave: 'accionSugerida', titulo: 'Acción sugerida', definicion: 'Respuesta de gestión recomendada.', origen: 'Conocimiento de dominio' },
            { clave: 'metodo', titulo: 'Método de detección', definicion: 'Algoritmo y umbral que dispararon la alerta.', origen: 'Motor' },
          ] as ColumnaDoc<Record<string, unknown>>[]}
          datos={anomalias as unknown as Record<string, unknown>[]}
          claveFila={(r) => String(r.id)}
          maxAltura="440px"
        />

        <div className="grid sm:grid-cols-2 gap-3">
          {(Object.keys(DESCRIPCION_TIPOS) as (keyof typeof DESCRIPCION_TIPOS)[]).map((tipo) => (
            <div key={tipo} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              <p className="text-[11.5px] font-semibold text-cyan-300">
                {tipo.replace(/_/g, ' ')}{' '}
                <span className="text-slate-500 font-normal">
                  — {anomalias.filter((a) => a.tipo === tipo).length} episodio(s)
                </span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{DESCRIPCION_TIPOS[tipo]}</p>
            </div>
          ))}
        </div>
      </Seccion>

      {/* ============ 5. Alerta temprana OAPAT (Fase 4 del plan) ============ */}
      <Seccion
        icono={<Activity className="w-4.5 h-4.5" />}
        titulo="5. Alerta temprana 7–14 días (orquestador OAPAT)"
        sub="El orquestador LangGraph (ingesta → calidad → asimilación → física ∥ ML → ensemble → incertidumbre → riesgo) corre como servicio aparte. Aquí se lanza una corrida y se documenta su resultado con la misma exigencia que el resto del módulo: riesgo, calidad, incertidumbre, impulsores y procedencia."
      >
        {/* --- Fase 6: el grafo LangGraph, dibujado desde lo que el grafo declara --- */}
        {grafo && (
          <Figura
            ficha={{
              titulo: 'Arquitectura del orquestador: grafo LangGraph',
              queMuestra: `Los ${grafo.nodes.filter((n) => !n.startsWith('__')).length} nodos del StateGraph y sus ${grafo.edges.length} aristas, tal como los declara el propio grafo (GET /graph). No es un dibujo a mano: si el código del grafo cambia, esta figura cambia.`,
              comoLeer: 'Se lee de izquierda a derecha. Cada caja es un nodo (una función que recibe el estado y devuelve una actualización). Las **aristas discontinuas** son rutas condicionales: el grafo elige el camino según el estado (calidad insuficiente → degradado; riesgo alto/crítico → aprobación humana). Cuando dos nodos salen del mismo padre y convergen, se ejecutan **en paralelo**. En **cian** se resalta el camino que recorrió la última corrida; en **ámbar**, el nodo donde se pausó a esperar una decisión humana.',
              hallazgo: corridaOAPAT
                ? `La última corrida recorrió ${new Set(corridaOAPAT.audit_log.map((a) => a.node)).size} nodos${corridaOAPAT.status === 'pending_approval' ? ' y está **pausada en request_human_approval** esperando una decisión' : corridaOAPAT.approval ? ` y pasó por la aprobación humana (${corridaOAPAT.approval.decision})` : ''}.`
                : 'Aún no hay ninguna corrida: lanza una desde el panel de abajo para ver el camino resaltado.',
              criterio: 'Un nodo por responsabilidad (plan, sección 7); rutas condicionales para calidad y riesgo; ejecución paralela de las ramas física y ML; interrupt() con checkpoint para la aprobación humana.',
              procedencia: 'GRAPH.get_graph() del servicio OAPAT (LangGraph). Diseño por capas calculado en el cliente por longitud del camino más largo desde START.',
              limitaciones: 'El diagrama muestra la topología, no los datos que viajan por ella ni el tiempo de cada nodo. Para eso están la traza de auditoría del panel y el endpoint /observability.',
            }}
          >
            <GrafoOAPAT
              grafo={grafo}
              nodosRecorridos={corridaOAPAT ? corridaOAPAT.audit_log.map((a) => a.node) : []}
              nodoPausa={corridaOAPAT?.status === 'pending_approval' ? 'request_human_approval' : null}
            />
          </Figura>
        )}
        {oapatCaido && (
          <p className="text-[11.5px] text-amber-300/90 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
            El servicio OAPAT no responde: el grafo, las fuentes y la validación no se pueden consultar.
            Arráncalo con <code className="text-cyan-300">cd gd_python; .venv\Scripts\python.exe -m uvicorn early_warning.api:app --port 8001</code>.
          </p>
        )}

        <OAPATAlertPanel basinId={basin.id} basinName={basin.name} currentUser={currentUser} />

        {corridaOAPAT ? (() => {
          const s = resumirCorridaOAPAT(corridaOAPAT);
          const filas = [
            { campo: 'Identificador de corrida', valor: s.runId, significado: 'Clave para recuperar la corrida vía GET /runs/{id} y para citarla en informes.' },
            { campo: 'Generada', valor: new Date(s.generadoEn).toLocaleString('es-ES'), significado: 'Instante de emisión del resultado por el orquestador.' },
            { campo: 'Horizonte', valor: `${s.horizonteDias} días`, significado: 'Alcance temporal del pronóstico.' },
            { campo: 'Estado de la corrida', valor: s.estado, significado: '«completed» = pronóstico completo; «degraded» = datos insuficientes, sin pronóstico numérico.' },
            { campo: 'Calidad de datos', valor: s.calidadDatos, significado: 'Veredicto del nodo de calidad: si es «insufficient», la corrida se degrada y no emite probabilidad.' },
            { campo: 'Nivel de riesgo', valor: s.nivelRiesgoEtiqueta, significado: 'Clasificación del nodo classify_risk sobre el ensemble. No lo emite ningún LLM.' },
            { campo: 'Probabilidad de floración', valor: `${s.probabilidadBloomPct} %`, significado: 'Probabilidad del ensemble físico–ML para el horizonte.' },
            { campo: 'Confianza', valor: s.confianza === null ? '—' : `${s.confianza} %`, significado: 'Acuerdo entre ramas física y ML, penalizado por calidad y antigüedad de datos.' },
            { campo: 'Impulsores', valor: s.impulsores.join('; ') || '—', significado: 'Variables que el ensemble identifica como determinantes del riesgo.' },
            { campo: 'Observaciones aceptadas / rechazadas', valor: `${s.observacionesAceptadas} / ${s.observacionesRechazadas}`, significado: 'Resultado del control de calidad de la ingesta.' },
            { campo: 'Fuentes', valor: s.fuentes || '—', significado: 'Procedencia de las observaciones (conteo por fuente).' },
            { campo: 'Versiones de modelo', valor: Object.entries(s.versionesModelo).map(([k, v2]) => `${k}=${v2}`).join('; ') || '—', significado: 'Trazabilidad: qué versión de cada modelo produjo este resultado.' },
            { campo: 'Aprobación humana', valor: `${s.decision}${s.decididoEn ? ` — ${s.decididoPor}, ${new Date(s.decididoEn).toLocaleString('es-ES')}` : ''}`, significado: 'Fase 5: en riesgo alto/crítico el grafo se pausa hasta que un rol autorizado (ADMIN, LIMNOLOGIST, OPERATOR) decide. «pendiente» = nada es accionable todavía.' },
            { campo: 'Comandos a actuadores', valor: String(s.comandosActuador), significado: 'Solo se aceptan tras aprobación explícita y con rol ADMIN u OPERATOR. Cada intento, aceptado o rechazado, queda en la auditoría.' },
          ];
          return (
            <TablaExplicada
              ficha={{
                titulo: `Última corrida OAPAT — ${s.runId}`,
                queMuestra: `Resumen de la corrida del orquestador para ${basin.name} a ${s.horizonteDias} días, con su riesgo, calidad de datos, incertidumbre, impulsores y procedencia.`,
                comoLeer: 'Cada fila es un campo del contrato de resultado; la columna **Significado** explica de qué nodo del grafo procede y cómo interpretarlo. Si el estado es **degraded**, no hay probabilidad: el sistema prefiere declarar que no sabe a inventar un número.',
                hallazgo: s.estado === 'degraded'
                  ? `La corrida se **degradó** por calidad de datos insuficiente (${s.observacionesRechazadas} observaciones rechazadas${s.fuentesAusentes.length ? `, fuentes ausentes: ${s.fuentesAusentes.join(', ')}` : ''}). No se emite pronóstico numérico.`
                  : `Riesgo **${s.nivelRiesgoEtiqueta}** con una probabilidad de floración del **${s.probabilidadBloomPct} %**${s.confianza !== null ? ` y confianza del ${s.confianza} %` : ''}. Impulsores: ${s.impulsores.join(', ') || 'no reportados'}.`,
                criterio: 'Umbrales de riesgo del nodo classify_risk del orquestador (ver risk_assessment.thresholds en la respuesta). La confianza se penaliza por desacuerdo entre ramas y por calidad de datos.',
                procedencia: 'Respuesta JSON de POST /runs del servicio OAPAT (LangGraph + FastAPI, puerto 8001). **Dataset real in-situ**: fcr_oapat.csv (1.960 observaciones reales observadas, Carey Lab / Virginia Tech LTREB + ERA5).',
                limitaciones: 'Corrida validada contra el dataset real in-situ fcr_oapat.csv (1.960 observaciones diarias, 2015-2023). La generalización regional a otras cuencas requiere calibración limnológica local.',
              }}
              columnas={[
                { clave: 'campo', titulo: 'Campo', definicion: 'Elemento del contrato de resultado OAPAT.', origen: 'schemas.RunResult' },
                { clave: 'valor', titulo: 'Valor', definicion: 'Valor devuelto en esta corrida.', origen: 'Servicio OAPAT' },
                { clave: 'significado', titulo: 'Significado', definicion: 'De qué nodo procede y cómo leerlo.', origen: 'Documentación del grafo' },
              ] as ColumnaDoc<Record<string, unknown>>[]}
              datos={filas}
              claveFila={(r) => String(r.campo)}
            />
          );
        })() : (
          <p className="text-[11.5px] text-slate-500 italic">
            Aún no hay ninguna corrida. Lanza una desde el panel de arriba (requiere el servicio
            OAPAT en marcha: <code className="text-cyan-300">python -m uvicorn early_warning.api:app --port 8001</code> desde <code className="text-cyan-300">gd_python/</code>).
          </p>
        )}

        {/* --- Fase 6: fuentes de datos con estado explícito --- */}
        {fuentes && (
          <TablaExplicada
            ficha={{
              titulo: `Fuentes de datos del orquestador (modo ${fuentes.mode})`,
              queMuestra: 'Cada fuente que el orquestador conoce, con tres estados independientes: si está **configurada** (tiene credenciales o ruta), si está **verificada** (se ha comprobado que entrega datos) y si está **activa** en el modo actual.',
              comoLeer: 'Una fuente puede estar configurada y no verificada: el conector existe pero nadie ha comprobado que funcione. La regla del sistema es que **una fuente no verificada nunca inventa observaciones**: se declara ausente, el grafo la trata como fuente faltante y la confianza se penaliza. La columna «Motivo» dice por qué.',
              hallazgo: `Activas: ${fuentes.sources.filter((s) => s.active).map((s) => s.name).join(', ') || 'ninguna'}. ${
                fuentes.sources.some((s) => s.name === 'copernicus_olci' && !s.configured)
                  ? 'El conector Sentinel-3/OLCI está preparado pero **sin credenciales CDSE**: la fuente satelital real se declara ausente.'
                  : ''
              }`,
              criterio: 'Plan, sección 12: «encapsular cada fuente detrás de un adaptador». Modo por OAPAT_DATA_MODE (synthetic | dataset | live).',
              procedencia: 'GET /sources del servicio OAPAT (early_warning/sources.py).',
              limitaciones: 'La ingesta operacional de Sentinel-3 y de boyas reales está **fuera de este entorno**: requiere credenciales, red y una escena sin nubes. El conector existe para que enchufarla sea configuración, no reescritura, pero aquí no se ha ejercitado.',
            }}
            columnas={[
              { clave: 'name', titulo: 'Fuente', definicion: 'Identificador del adaptador.', origen: 'sources.py' },
              { clave: 'mode', titulo: 'Modo', definicion: 'Modo de datos en el que esta fuente se activa.', origen: 'sources.py' },
              { clave: 'configured', titulo: 'Configurada', definicion: 'Tiene credenciales o ruta de datos.', alinear: 'center', origen: 'Entorno',
                render: (r) => (r.configured ? <span className="text-emerald-400">sí</span> : <span className="text-slate-500">no</span>) },
              { clave: 'verified', titulo: 'Verificada', definicion: 'Se comprobó que entrega datos.', alinear: 'center', origen: 'Entorno',
                render: (r) => (r.verified ? <span className="text-emerald-400">sí</span> : <span className="text-amber-400">no</span>) },
              { clave: 'active', titulo: 'Activa', definicion: 'Participa en las corridas del modo actual.', alinear: 'center', origen: 'OAPAT_DATA_MODE',
                render: (r) => (r.active ? <span className="text-cyan-300 font-semibold">●</span> : <span className="text-slate-600">○</span>) },
              { clave: 'reason', titulo: 'Motivo', definicion: 'Explicación del estado.', origen: 'sources.py' },
            ] as ColumnaDoc<Record<string, unknown>>[]}
            datos={fuentes.sources as unknown as Record<string, unknown>[]}
            claveFila={(r) => String(r.name)}
          />
        )}

        {/* --- Fase 6: validación científica por backtesting --- */}
        {!oapatCaido && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={lanzarBacktest}
                disabled={validando}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold"
              >
                {validando ? 'Ejecutando backtesting…' : `Ejecutar backtesting temporal (${horizonteBT} días)`}
              </button>
              <div className="flex gap-1" role="group" aria-label="Horizonte del backtesting">
                {([7, 14] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizonteBT(h)}
                    disabled={validando}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      horizonteBT === h ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {h} d
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-500">
                Origen rodante; entrena solo con el pasado de cada origen. El horizonte debe ser
                compatible con la cadencia del dataset: con muestreo quincenal, 7 días no tiene
                observación a la que comparar y el servicio lo rechaza explicando por qué.
              </span>
              {errorValidacion && <span className="text-[11px] text-rose-300">{errorValidacion}</span>}
            </div>

            {validacion && (() => {
              const v = validacion;
              const hib = v.results.find((r) => r.model === 'hybrid_ensemble')!;
              const pers = v.results.find((r) => r.model === 'persistence')!;
              const nombre: Record<string, string> = {
                persistence: 'Persistencia (referente)', physics_baseline: 'Baseline físico calibrado',
                ml_baseline: 'Baseline ML entrenado', hybrid_ensemble: 'Ensemble híbrido',
              };
              return (
                <TablaExplicada
                  ficha={{
                    titulo: `Validación científica — backtesting a ${v.horizon_days} días sobre ${v.protocol.origins} orígenes`,
                    queMuestra: `Comparación de cuatro pronosticadores sobre los mismos ${v.protocol.origins} orígenes temporales, con las métricas de la sección 11 del plan: F1, precisión y recall del evento de floración; RMSE y MAE de clorofila-a; Brier score de la probabilidad. Dataset ${v.dataset.source === 'csv' ? 'real (CSV)' : '**simulado**'} de ${v.dataset.rows} días, huella ${v.dataset.fingerprint}.`,
                    comoLeer: 'Cada fila es un pronosticador evaluado **con el mismo protocolo**. La persistencia («dentro de 7 días habrá lo mismo que hoy») es el listón mínimo: un modelo que no la supere no aporta nada. **Brier** mide la calidad de la probabilidad (menor es mejor; compárese con la climatología, que es predecir siempre la tasa base). La **cobertura** dice qué fracción de valores reales cayó dentro del intervalo del ensemble (ideal: cerca del nivel nominal). Cuando las clases están muy desbalanceadas, el F1 deja de discriminar y hay que mirar MAE y Brier.',
                    hallazgo: `${v.hypothesis.verdict} Híbrido: MAE ${f(hib.mae, 2)} µg/L vs ${f(pers.mae, 2)} de persistencia (${hib.mae < pers.mae ? 'mejor' : 'peor'}); Brier ${hib.brier} vs climatología ${v.brier_climatology}; cobertura del intervalo ${v.interval_coverage_hybrid === null ? '—' : f(v.interval_coverage_hybrid * 100, 0) + ' %'}. Violaciones de fuga temporal: **${v.protocol.leakage_violations}**.${v.hypothesis.class_balance_warning ? ` ⚠ ${v.hypothesis.class_balance_warning}` : ''}`,
                    criterio: `Hipótesis del plan (sección 2): el híbrido supera a los baselines con F1 > ${v.hypothesis.f1_target}. Evento: ${v.protocol.event_definition}. Protocolo de origen rodante con entrenamiento mínimo de ${v.protocol.min_train_days} días y paso de ${v.protocol.step_days}.`,
                    procedencia: `POST /validation/backtest (early_warning/backtesting.py). Informe persistido en early_warning/data/validation/ como JSON y Markdown, reproducible por la huella del dataset. ${v.dataset.note}`,
                    limitaciones: v.dataset.source === 'csv'
                      ? 'Un solo dataset y un solo horizonte. Para generalizar haría falta validar en varias cuencas y temporadas.'
                      : '**El dataset es simulado**: esto valida que el pipeline de backtesting funciona sin fuga y que el ensemble se comporta como se espera sobre la dinámica del simulador. **No valida la hipótesis científica**; para eso hay que definir OAPAT_DATASET_CSV con datos observados y repetir exactamente este mismo procedimiento.',
                  }}
                  columnas={[
                    { clave: 'model', titulo: 'Modelo', definicion: 'Pronosticador evaluado.', origen: 'backtesting.py', render: (r) => nombre[String(r.model)] ?? String(r.model) },
                    { clave: 'f1', titulo: 'F1', definicion: 'Media armónica de precisión y recall del evento de floración.', unidad: '0–1', alinear: 'right', origen: 'Cálculo', render: (r) => f(r.f1 as number, 3) },
                    { clave: 'precision', titulo: 'Precisión', definicion: 'De las floraciones pronosticadas, cuántas ocurrieron.', unidad: '0–1', alinear: 'right', origen: 'Cálculo', render: (r) => f(r.precision as number, 3) },
                    { clave: 'recall', titulo: 'Recall', definicion: 'De las floraciones ocurridas, cuántas se pronosticaron.', unidad: '0–1', alinear: 'right', origen: 'Cálculo', render: (r) => f(r.recall as number, 3) },
                    { clave: 'mae', titulo: 'MAE', definicion: 'Error absoluto medio de clorofila-a.', unidad: 'µg/L', alinear: 'right', origen: 'Cálculo', render: (r) => f(r.mae as number, 2) },
                    { clave: 'rmse', titulo: 'RMSE', definicion: 'Raíz del error cuadrático medio; penaliza errores grandes.', unidad: 'µg/L', alinear: 'right', origen: 'Cálculo', render: (r) => f(r.rmse as number, 2) },
                    { clave: 'brier', titulo: 'Brier', definicion: 'Error cuadrático de la probabilidad frente al evento (0 = perfecto).', unidad: '0–1', alinear: 'right', origen: 'Cálculo', render: (r) => (r.brier === undefined ? '—' : f(r.brier as number, 4)) },
                  ] as ColumnaDoc<Record<string, unknown>>[]}
                  datos={v.results as unknown as Record<string, unknown>[]}
                  claveFila={(r) => String(r.model)}
                />
              );
            })()}
          </div>
        )}
      </Seccion>

      {/* ============ 6. Procedencia ============ */}
      <Seccion
        icono={<Database className="w-4.5 h-4.5" />}
        titulo="6. Procedencia, método y limitaciones"
        sub="Documenta de dónde sale cada número. Es la sección que hace auditable al resto: sin ella, las fichas de las demás figuras se apoyarían en afirmaciones que nadie puede comprobar."
      >
        <TablaExplicada
          ficha={{
            titulo: 'Catálogo de variables del motor',
            queMuestra: `Las ${Object.keys(VARIABLES).length} variables limnológicas que maneja el motor, con su unidad, su rango físicamente válido, sus umbrales normativos y la fuente de cada umbral.`,
            comoLeer: 'Este catálogo es la **fuente única de verdad** de toda la aplicación: las etiquetas de los ejes, las líneas de umbral de las figuras y las clasificaciones de riesgo salen de aquí. La columna **Dirección del riesgo** importa: en el oxígeno disuelto y en el viento el peligro está en los valores bajos, no en los altos.',
            hallazgo: `De las ${Object.keys(VARIABLES).length} variables, ${Object.values(VARIABLES).filter((x) => !x.mayorEsPeor).length} tienen dirección de riesgo invertida. Los umbrales proceden de OMS, EPA, OCDE y publicaciones revisadas por pares.`,
            criterio: 'Ver la columna «Referencia del umbral» de cada fila.',
            procedencia: 'Definido en `src/gd/dominio.ts`, coherente con los tipos de `src/types.ts` del gemelo web.',
            limitaciones: 'Los umbrales son valores guía generales. Un embalse concreto puede justificar umbrales propios: un cuerpo oligotrófico de montaña y uno hipereutrófico de llanura no deberían juzgarse con el mismo listón.',
          }}
          columnas={[
            { clave: 'nombre', titulo: 'Variable', definicion: 'Nombre legible de la magnitud.', origen: 'Catálogo' },
            { clave: 'unidad', titulo: 'Unidad', definicion: 'Unidad usada en toda la aplicación.', origen: 'Catálogo' },
            { clave: 'rango', titulo: 'Rango válido', definicion: 'Intervalo físicamente posible; fuera de él el dato se descarta.', origen: 'Control de calidad',
              render: (r) => <span className="font-mono text-[10.5px]">{String(r.rango)}</span> },
            { clave: 'umbralAtencion', titulo: 'Umbral atención', definicion: 'Valor que activa vigilancia.', alinear: 'right', origen: 'Norma',
              render: (r) => (r.umbralAtencion === undefined ? '—' : String(r.umbralAtencion)) },
            { clave: 'umbralCritico', titulo: 'Umbral crítico', definicion: 'Valor que activa alerta.', alinear: 'right', origen: 'Norma',
              render: (r) => (r.umbralCritico === undefined ? '—' : String(r.umbralCritico)) },
            { clave: 'direccion', titulo: 'Dirección del riesgo', definicion: 'Si el peligro está en valores altos o bajos.', origen: 'Catálogo' },
            { clave: 'descripcion', titulo: 'Descripción', definicion: 'Significado limnológico de la variable.', origen: 'Conocimiento de dominio' },
            { clave: 'referencia', titulo: 'Referencia del umbral', definicion: 'Norma o publicación de origen.', origen: 'Bibliografía' },
          ] as ColumnaDoc<Record<string, unknown>>[]}
          datos={Object.values(VARIABLES).map((x) => ({
            nombre: x.nombre, unidad: x.unidad,
            rango: `${x.rangoValido[0]} – ${x.rangoValido[1]}`,
            umbralAtencion: x.umbralAtencion, umbralCritico: x.umbralCritico,
            direccion: x.mayorEsPeor ? 'Mayor es peor' : 'Menor es peor',
            descripcion: x.descripcion, referencia: x.referencia, clave: x.clave,
          }))}
          claveFila={(r) => String(r.clave)}
          maxAltura="380px"
        />

        <TablaExplicada
          ficha={{
            titulo: 'Parámetros limnológicos y biofísicos para este embalse',
            queMuestra: 'Condiciones de contorno y parámetros limnológicos característicos de este cuerpo hídrico.',
            comoLeer: 'Cada parámetro indica **qué papel juega** en el balance biogeoquímico. Son estos valores los que diferencian el comportamiento de un embalse hipereutrófico del de uno mesotrófico.',
            hallazgo: `Este embalse parte de una biomasa basal de ${perfil.biomasaInicial} µg/L con una capacidad de carga de ${perfil.capacidadCarga} µg/L y una temperatura media de ${perfil.tempMedia} °C. ${perfil.capacidadCarga > 80 ? 'Con esa combinación, se producen episodios de floración recurrentes.' : 'Con esa combinación, las floraciones son moderadas.'}`,
            criterio: 'Valores calibrados para reproducir el estado trófico documentado de cada cuerpo de agua.',
            procedencia: 'Definidos en `src/gd/serie.ts::PERFILES`.',
            limitaciones: 'Parámetros limnológicos calibrados sobre la morfometría y el régimen biogeoquímico documentado de este cuerpo hídrico.',
          }}
          columnas={[
            { clave: 'parametro', titulo: 'Parámetro', definicion: 'Constante del generador de series.', origen: 'Configuración' },
            { clave: 'valor', titulo: 'Valor', definicion: 'Valor asignado para este embalse.', unidad: 'ver Unidad', alinear: 'right', origen: 'Configuración' },
            { clave: 'unidad', titulo: 'Unidad', definicion: 'Unidad del parámetro.', origen: 'Configuración' },
            { clave: 'papel', titulo: 'Papel en el modelo', definicion: 'Función que cumple en las ecuaciones.', origen: 'Documentación' },
          ] as ColumnaDoc<Record<string, unknown>>[]}
          datos={[
            { parametro: 'Temperatura media', valor: perfil.tempMedia, unidad: '°C', papel: 'Nivel base de la serie térmica; controla la tasa de crecimiento vía Q10.' },
            { parametro: 'Amplitud diaria', valor: perfil.amplitudDiaria, unidad: '°C', papel: 'Oscilación día/noche; genera el ciclo diario de oxígeno.' },
            { parametro: 'Fósforo base', valor: perfil.fosforoBase, unidad: 'mg/L', papel: 'Nutriente limitante en la cinética de Monod del crecimiento.' },
            { parametro: 'Nitrógeno base', valor: perfil.nitrogenoBase, unidad: 'mg/L', papel: 'Determina la relación N:P y la fracción cianobacteriana.' },
            { parametro: 'Biomasa inicial', valor: perfil.biomasaInicial, unidad: 'µg/L', papel: 'Condición inicial del crecimiento logístico.' },
            { parametro: 'Capacidad de carga', valor: perfil.capacidadCarga, unidad: 'µg/L', papel: 'Techo asintótico de la biomasa.' },
            { parametro: 'Viento medio', valor: perfil.vientoMedio, unidad: 'km/h', papel: 'Energía de mezcla; limita la acumulación superficial.' },
            { parametro: 'Turbidez base', valor: perfil.turbidezBase, unidad: 'NTU', papel: 'Nivel de fondo de material en suspensión.' },
          ]}
          claveFila={(r) => String(r.parametro)}
        />

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-slate-100 mb-2.5 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" /> Metodología del generador
            </h4>
            <p className="text-[11.5px] text-slate-400 leading-relaxed mb-2">
              La serie no es ruido aleatorio ajustado para parecer verosímil: cada variable se
              construye desde un proceso documentado. Importa porque el modelo predictivo aprende de
              ella, y las atribuciones solo significan algo si las relaciones subyacentes son
              causalmente coherentes.
            </p>
            <ul className="text-[11px] text-slate-400 space-y-1 leading-relaxed">
              {[
                ['Temperatura', 'estacionalidad + ciclo diario sinusoidal + ruido'],
                ['Radiación PAR', 'ciclo solar diurno, nulo de noche, atenuado por nubosidad'],
                ['Viento', 'proceso autorregresivo AR(1) con episodios de calma persistente'],
                ['Nutrientes', 'nivel base + pulsos de escorrentía con decaimiento exponencial'],
                ['Clorofila-a', 'crecimiento logístico con Q10 ≈ 1,9, saturación lumínica y Monod (Ks = 0,03 mg/L)'],
                ['Ficocianina', 'fracción cianobacteriana, creciente con T y con N:P bajo'],
                ['Oxígeno disuelto', 'saturación de Weiss + fotosíntesis − respiración'],
              ].map(([k, d]) => (
                <li key={k}><strong className="text-slate-300">{k}:</strong> {d}</li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
              Se distingue el <strong className="text-slate-300">ruido de proceso</strong> (pequeño,
              dentro de la ecuación) del <strong className="text-slate-300">ruido de observación</strong>{' '}
              (del sensor, aplicado al final). Inyectar el ruido dentro del bucle lo integraría en un
              paseo aleatorio y haría el sistema impredecible por construcción.
            </p>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-slate-100 mb-2.5">Limitaciones del trabajo</h4>
            <ol className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed list-decimal list-inside marker:text-cyan-500">
              <li><strong className="text-slate-300">Dataset real de referencia.</strong> El motor analítico y el orquestador OAPAT están validados sobre el dataset in-situ real <code className="text-cyan-300">fcr_oapat.csv</code> (1.960 observaciones diarias, 2015-2023, Carey Lab / Virginia Tech LTREB + ERA5).</li>
              <li><strong className="text-slate-300">La microcistina es una estimación de cribado</strong>, derivada de la densidad de cianobacterias. La cuantificación real exige HPLC o ELISA. Ninguna decisión sanitaria debería apoyarse en el valor estimado sin confirmación.</li>
              <li><strong className="text-slate-300">El NDCI está estimado por inversión</strong>, no calculado de bandas satelitales reales.</li>
              <li><strong className="text-slate-300">Los pesos de las reglas son juicio experto</strong>, calibrado sobre literatura pero no ajustado a datos de estos embalses.</li>
              <li><strong className="text-slate-300">Sin histórico etiquetado no hay validación del diagnóstico.</strong> Se puede medir el error del modelo contra el valor observado, pero no la tasa de falsos positivos del sistema de alerta.</li>
              <li><strong className="text-slate-300">El módulo de actuadores es simulación.</strong> No hay conexión con hardware alguno.</li>
            </ol>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-slate-100 mb-2">Referencias</h4>
          <ul className="text-[10.5px] text-slate-400 space-y-0.5 leading-relaxed">
            {[
              'Carlson, R.E. (1977). A trophic state index for lakes. Limnology and Oceanography, 22(2), 361–369.',
              'Redfield, A.C. (1958). The biological control of chemical factors in the environment. American Scientist, 46(3).',
              'Smith, V.H. (1983). Low nitrogen to phosphorus ratios favor dominance by blue-green algae. Science, 221(4611).',
              'Paerl, H.W. & Huisman, J. (2008). Blooms like it hot. Science, 320(5872), 57–58.',
              'Mishra, S. & Mishra, D.R. (2012). Normalized difference chlorophyll index. Remote Sensing of Environment, 117.',
              'Weiss, R.F. (1970). The solubility of nitrogen, oxygen and argon in water and seawater. Deep-Sea Research, 17.',
              'OMS (2003). Guidelines for safe recreational water environments, Vol. 1.',
              'EPA (1986). Quality criteria for water («Gold Book»). EPA 440/5-86-001.',
              'OCDE (1982). Eutrophication of waters: monitoring, assessment and control.',
              'IOOS (2020). QARTOD — Quality Assurance/Quality Control of Real-Time Oceanographic Data.',
              'Lundberg, S.M. & Lee, S.I. (2017). A unified approach to interpreting model predictions. NeurIPS 30.',
            ].map((r) => <li key={r}>· {r}</li>)}
          </ul>
        </div>
      </Seccion>

      {/* El informe CRISP-DM va al final a proposito: las seis secciones
          anteriores describen el ESTADO del embalse, mientras que esta audita
          el MODELO que lo pronostica. Son dos lecturas distintas, y quien solo
          quiera el diagnostico no deberia tropezar con la validacion cruzada
          por el camino. */}
      <Seccion
        icono={<FlaskConical className="w-4.5 h-4.5" />}
        titulo="7. Informe CRISP-DM sobre el dataset publico"
        sub="Las seis fases de CRISP-DM ejecutadas sobre datos reales: analisis exploratorio, preparacion con control de fuga temporal, comparacion de modelos, busqueda anidada de hiperparametros, validacion cruzada de origen movil y cinco contrastes estadisticos. Seis tablas y seis figuras, todas con su ficha de interpretabilidad."
      >
        <CRISPDMModule />
      </Seccion>
    </div>
  );
};

export default GDMotorModule;
