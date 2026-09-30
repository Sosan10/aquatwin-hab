import React, { useState, useCallback } from 'react';
import {
  ShieldAlert,
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
  Gauge,
  Droplets,
  Wind,
  Thermometer,
  Info,
  Clock,
  Layers,
  FileText
} from 'lucide-react';
import {
  runOAPAT,
  decidirOAPATRun,
  enviarComandoActuadorOAPAT,
  puedeAprobarOAPAT,
  puedeAccionarOAPAT,
  OAPAT_APPROVER_ROLES,
  OAPAT_ACTUATOR_ROLES,
  type OAPATRunResult,
  type OAPATRequestState,
} from '../services/oaaptClient';
import { publicarCorridaOAPAT } from '../services/oaaptStore';
import type { UserProfile } from '../types';

interface OAPATAlertPanelProps {
  basinId: string;
  basinName: string;
  /** Fase 5: usuario en sesión, para aprobar/rechazar y accionar según su rol. */
  currentUser?: UserProfile;
}

/**
 * Fase 5 — Caja de aprobación humana.
 *
 * Aparece solo cuando el grafo está pausado en `request_human_approval`
 * (riesgo alto/crítico). El servidor vuelve a verificar el rol: esta UI oculta
 * lo que no se puede hacer, pero es la API la que lo impide.
 */
const CajaAprobacion: React.FC<{
  result: OAPATRunResult;
  currentUser?: UserProfile;
  onDecidido: (r: OAPATRunResult) => void;
}> = ({ result, currentUser, onDecidido }) => {
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const req = result.approval_request;
  const autorizado = !!currentUser && puedeAprobarOAPAT(currentUser.role);

  const decidir = async (decision: 'approved' | 'rejected') => {
    if (!currentUser) return;
    setEnviando(decision);
    setError(null);
    try {
      const r = await decidirOAPATRun(
        result.run_id,
        { id: currentUser.id, name: currentUser.name, role: currentUser.role },
        decision,
        comentario,
      );
      onDecidido(r);
    } catch (e: any) {
      setError(e.message || 'Error al registrar la decisión');
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="bg-amber-950/40 border-2 border-amber-500/60 rounded-xl p-4 space-y-3 shadow-lg shadow-amber-900/20">
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-amber-200">Aprobación humana requerida</h4>
          <p className="text-[11.5px] text-amber-100/80 mt-0.5 leading-relaxed">
            {req?.reason ??
              'El riesgo es alto o crítico: el orquestador está pausado y no publica recomendaciones accionables hasta que una persona autorizada decida.'}
          </p>
        </div>
      </div>

      {req && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          {[
            ['Riesgo', req.risk_level],
            ['Prob. bloom', `${(req.bloom_probability * 100).toFixed(1)} %`],
            ['Confianza', req.confidence === null ? '—' : `${(req.confidence * 100).toFixed(0)} %`],
            ['Calidad de datos', req.data_quality ? 'aceptable' : 'insuficiente'],
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-950/50 rounded-md px-2 py-1.5 border border-amber-900/40">
              <dt className="text-slate-500 uppercase tracking-wide text-[9.5px]">{k}</dt>
              <dd className="text-slate-100 font-mono font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {currentUser ? (
        autorizado ? (
          <>
            <label className="block text-[11px] text-slate-300">
              Comentario de la decisión (queda en la auditoría)
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={2}
                placeholder="p. ej. Confirmado con muestreo HPLC del 15/09"
                className="mt-1 w-full bg-slate-950/60 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 text-[11.5px] focus:outline-none focus:border-cyan-500"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => decidir('approved')}
                disabled={enviando !== null}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {enviando === 'approved' ? 'Registrando…' : 'Aprobar recomendaciones'}
              </button>
              <button
                onClick={() => decidir('rejected')}
                disabled={enviando !== null}
                className="px-3.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <AlertTriangle className="w-4 h-4" />
                {enviando === 'rejected' ? 'Registrando…' : 'Rechazar'}
              </button>
              <span className="text-[10.5px] text-slate-400">
                Decides como <strong className="text-slate-200">{currentUser.name}</strong> ({currentUser.role})
              </span>
            </div>
          </>
        ) : (
          <p className="text-[11.5px] text-slate-300 bg-slate-950/50 border border-slate-700 rounded-md px-3 py-2">
            Tu rol <strong className="text-amber-200">{currentUser.role}</strong> no está autorizado a
            aprobar. Roles con permiso: {OAPAT_APPROVER_ROLES.join(', ')}. La corrida queda pendiente
            hasta que decida un perfil autorizado.
          </p>
        )
      ) : (
        <p className="text-[11.5px] text-slate-400">Inicia sesión con un perfil autorizado para decidir.</p>
      )}

      {error && <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-md px-2.5 py-1.5">{error}</p>}
    </div>
  );
};

/** Fase 5 — Traza de la decisión y envío de comandos, solo tras aprobación. */
const TrazaDecision: React.FC<{
  result: OAPATRunResult;
  currentUser?: UserProfile;
  onComando: (r: OAPATRunResult) => void;
}> = ({ result, currentUser, onComando }) => {
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const ap = result.approval;
  if (!ap) return null;

  const aprobada = ap.decision === 'approved';
  const puedeAccionar = !!currentUser && puedeAccionarOAPAT(currentUser.role);

  const enviar = async () => {
    if (!currentUser) return;
    setEnviando(true);
    setMensaje(null);
    try {
      const ack = await enviarComandoActuadorOAPAT(
        result.run_id,
        { id: currentUser.id, name: currentUser.name, role: currentUser.role },
        { deviceId: 'act-01', command: 'AERATOR_ON', powerLevel: 100 },
      );
      setMensaje(`Comando ${ack.command} → ${ack.device_id} aceptado (${ack.status}), amparado en la aprobación de ${ack.approved_by}.`);
      onComando({ ...result, actuator_commands: [...result.actuator_commands, ack] });
    } catch (e: any) {
      setMensaje(`Rechazado: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={`rounded-xl p-3 space-y-2 border ${aprobada ? 'bg-emerald-950/30 border-emerald-700/50' : 'bg-rose-950/30 border-rose-800/50'}`}>
      <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
        {aprobada ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
        Decisión humana registrada — {aprobada ? 'APROBADA' : 'RECHAZADA'}
      </h4>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
        <div><dt className="text-slate-500">Usuario</dt><dd className="text-slate-100">{ap.user_name} <span className="text-slate-500">({ap.user_role})</span></dd></div>
        <div><dt className="text-slate-500">Fecha</dt><dd className="text-slate-100 font-mono">{new Date(ap.decided_at).toLocaleString('es-ES')}</dd></div>
        <div><dt className="text-slate-500">Riesgo al decidir</dt><dd className="text-slate-100 font-mono">{ap.risk_level_at_decision} · {(ap.bloom_probability_at_decision * 100).toFixed(1)} %</dd></div>
        <div><dt className="text-slate-500">Modelos</dt><dd className="text-slate-100 font-mono text-[10px]">{Object.entries(result.model_versions).map(([k, v]) => `${k}=${v}`).join(' · ')}</dd></div>
        {ap.comment && <div className="col-span-2 lg:col-span-4"><dt className="text-slate-500">Comentario</dt><dd className="text-slate-200 italic">«{ap.comment}»</dd></div>}
      </dl>

      {aprobada && (
        <div className="pt-1 border-t border-slate-800/60 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={enviar}
              disabled={enviando || !puedeAccionar}
              title={puedeAccionar ? 'Envía comando de control al actuador aireador A-1' : `Solo ${OAPAT_ACTUATOR_ROLES.join(' / ')} pueden accionar actuadores`}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              {enviando ? 'Enviando…' : 'Enviar comando: Aireador A-1 al 100 % (Actuador de campo)'}
            </button>
            <span className="text-[10.5px] text-slate-500">
              {puedeAccionar
                ? 'Permitido: la corrida está aprobada y tu rol puede accionar.'
                : `Tu rol${currentUser ? ` ${currentUser.role}` : ''} no puede accionar actuadores.`}
            </span>
          </div>
          {result.actuator_commands.length > 0 && (
            <ul className="text-[10.5px] text-slate-400 space-y-0.5">
              {result.actuator_commands.map((c, i) => (
                <li key={i} className="font-mono">
                  {new Date(c.at).toLocaleTimeString('es-ES')} · {c.command} → {c.device_id} · {c.user_name} ({c.user_role}) · {c.status}
                </li>
              ))}
            </ul>
          )}
          {mensaje && <p className="text-[11px] text-slate-300">{mensaje}</p>}
        </div>
      )}
      {!aprobada && (
        <p className="text-[11px] text-slate-400">
          Corrida rechazada: las recomendaciones no son accionables y los comandos a actuadores quedan bloqueados.
        </p>
      )}
    </div>
  );
};

// Colores y etiquetas por nivel de riesgo
const RISK_CONFIG: Record<string, { bg: string; border: string; text: string; glow: string; label: string; icon: React.ReactNode }> = {
  NORMAL:     { bg: 'bg-emerald-950/60', border: 'border-emerald-600/50', text: 'text-emerald-300', glow: 'shadow-emerald-900/30', label: 'Normal', icon: <CheckCircle2 className="w-5 h-5" /> },
  PREVENTIVE: { bg: 'bg-amber-950/60',   border: 'border-amber-600/50',   text: 'text-amber-300',   glow: 'shadow-amber-900/30',   label: 'Preventivo', icon: <ShieldAlert className="w-5 h-5" /> },
  ALERT:      { bg: 'bg-orange-950/60',   border: 'border-orange-500/60',  text: 'text-orange-300',  glow: 'shadow-orange-900/30',  label: 'Alerta', icon: <AlertTriangle className="w-5 h-5" /> },
  CRITICAL:   { bg: 'bg-rose-950/70',     border: 'border-rose-500/70',    text: 'text-rose-300',    glow: 'shadow-rose-900/40',    label: 'Crítico', icon: <Zap className="w-5 h-5" /> },
  DEGRADED:   { bg: 'bg-slate-800/60',    border: 'border-slate-600/50',   text: 'text-slate-400',   glow: 'shadow-slate-900/20',   label: 'Degradado', icon: <Info className="w-5 h-5" /> },
};

export const OAPATAlertPanel: React.FC<OAPATAlertPanelProps> = ({ basinId, basinName, currentUser }) => {
  const [requestState, setRequestState] = useState<OAPATRequestState>({ status: 'idle' });
  const [horizonDays, setHorizonDays] = useState<7 | 14>(7);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showModels, setShowModels] = useState(false);

  const handleRunOAPAT = useCallback(async () => {
    setRequestState({ status: 'loading' });
    try {
      const result = await runOAPAT(basinId, horizonDays);
      setRequestState({ status: 'success', data: result });
      // Fase 4: la corrida queda disponible para Motor GD e Informes.
      publicarCorridaOAPAT(result);
    } catch (err: any) {
      setRequestState({ status: 'error', error: err.message || 'Error desconocido' });
    }
  }, [basinId, horizonDays]);

  const result: OAPATRunResult | null = requestState.status === 'success' ? requestState.data : null;
  const riskLevel = result?.risk_assessment?.level || result?.risk || 'NORMAL';
  const riskCfg = RISK_CONFIG[riskLevel] || RISK_CONFIG['NORMAL'];

  return (
    <div className="bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 border border-cyan-500/30 rounded-xl p-4 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-100">
                Alerta OAPAT — Pronóstico {horizonDays} días
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-900 text-cyan-200 border border-cyan-700 font-mono">
                Fase 3 — Ensemble Híbrido
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Orquestador de Asimilación, Pronóstico y Alerta Temprana · {basinName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Horizon selector */}
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 text-xs font-mono">
            <button
              onClick={() => setHorizonDays(7)}
              className={`px-3 py-1.5 rounded-l-lg transition-all ${horizonDays === 7 ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              7 días
            </button>
            <button
              onClick={() => setHorizonDays(14)}
              className={`px-3 py-1.5 rounded-r-lg transition-all ${horizonDays === 14 ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              14 días
            </button>
          </div>

          <button
            onClick={handleRunOAPAT}
            disabled={requestState.status === 'loading'}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold text-xs transition-all flex items-center gap-2 shadow-lg shadow-cyan-600/20 disabled:opacity-50"
          >
            {requestState.status === 'loading' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Ejecutando...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                <span>Ejecutar Corrida OAPAT</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {requestState.status === 'error' && (
        <div className="bg-rose-950/60 border border-rose-700/60 rounded-lg p-3 text-xs text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Error al ejecutar la corrida OAPAT</p>
            <p className="text-rose-300/80 mt-0.5">{requestState.error}</p>
            {/* El puerto es el 8001 y en PowerShell se encadena con ';', no con '&&' */}
            <p className="text-rose-400/60 mt-1 font-mono text-[10px] break-all">
              Arranca el servicio en otra terminal: cd gd_python ; .venv\Scripts\python.exe -m uvicorn early_warning.api:app --port 8001
            </p>
          </div>
        </div>
      )}

      {/* Idle state */}
      {requestState.status === 'idle' && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-6 text-center">
          <Gauge className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">
            Pulsa <span className="text-cyan-400 font-semibold">Ejecutar Corrida OAPAT</span> para generar un pronóstico de alerta temprana de {horizonDays} días.
          </p>
          <p className="text-[11px] text-emerald-400/90 mt-1 font-mono">
            Dataset in-situ: fcr_oapat.csv (1.960 obs reales) · Carey Lab Virginia Tech LTREB
          </p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Risk Banner */}
          <div className={`${riskCfg.bg} ${riskCfg.border} border rounded-xl p-4 shadow-lg ${riskCfg.glow} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}>
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${riskCfg.text} ${riskLevel === 'CRITICAL' ? 'animate-pulse' : ''}`}>
                {riskCfg.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-black ${riskCfg.text}`}>{riskCfg.label}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${riskCfg.border} ${riskCfg.text} font-mono`}>
                    {result.risk}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    result.status === 'completed'
                      ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
                      : result.status === 'pending_approval'
                      ? 'bg-amber-900/40 text-amber-200 border-amber-600/60 animate-pulse'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {result.status === 'completed'
                      ? '✓ Completado'
                      : result.status === 'pending_approval'
                      ? '⏸ Pendiente de aprobación'
                      : '⚠ Degradado'}
                  </span>
                  {result.approval && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      result.approval.decision === 'approved'
                        ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
                        : 'bg-rose-900/40 text-rose-300 border-rose-700/50'
                    }`}>
                      {result.approval.decision === 'approved' ? '✓ Aprobada' : '✕ Rechazada'} · {result.approval.user_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Horizonte: {result.horizon_days} días · Calidad: {result.data_quality} · {new Date(result.generated_at).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 font-mono">Prob. Bloom</div>
              <div className={`text-3xl font-black font-mono ${riskCfg.text}`}>
                {(result.bloom_probability * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          {result.forecast && result.uncertainty && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Clorofila-a */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Chl-a Ensemble</span>
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-xl font-black text-slate-100 font-mono">
                  {result.forecast.ensemble.chlorophyll_a?.toFixed(1)}
                  <span className="text-[10px] text-slate-400 ml-1 font-normal">µg/L</span>
                </div>
                {result.uncertainty.intervals.chlorophyll_a && (
                  <div className="text-[10px] text-slate-500 font-mono">
                    IC: [{result.uncertainty.intervals.chlorophyll_a.lower.toFixed(1)} – {result.uncertainty.intervals.chlorophyll_a.upper.toFixed(1)}]
                  </div>
                )}
              </div>

              {/* Microcistina */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Microcistina Est.</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-xl font-black text-slate-100 font-mono">
                  {result.forecast.ensemble.microcystin?.toFixed(1)}
                  <span className="text-[10px] text-slate-400 ml-1 font-normal">µg/L</span>
                </div>
                <div className={`text-[10px] font-semibold ${(result.forecast.ensemble.microcystin || 0) > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {(result.forecast.ensemble.microcystin || 0) > 1 ? '⚠ Supera guía OMS potable (1 µg/L)' : '✓ Dentro de guía OMS'}
                </div>
              </div>

              {/* Confianza */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Confianza Global</span>
                  <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="text-xl font-black text-slate-100 font-mono">
                  {((result.uncertainty.confidence || 0) * 100).toFixed(0)}%
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${(result.uncertainty.confidence || 0) > 0.6 ? 'bg-emerald-500' : (result.uncertainty.confidence || 0) > 0.3 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${(result.uncertainty.confidence || 0) * 100}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Acuerdo inter-modelo: {((result.uncertainty.agreement || 0) * 100).toFixed(0)}%
                </div>
              </div>

              {/* Temp + DO */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Temp. / OD Proj.</span>
                  <Thermometer className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="flex gap-3">
                  <div>
                    <div className="text-lg font-black text-slate-100 font-mono">
                      {result.forecast.ensemble.temp_surface?.toFixed(1)}°
                    </div>
                    <div className="text-[10px] text-slate-500">Temp</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-slate-100 font-mono">
                      {result.forecast.ensemble.dissolved_oxygen?.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-slate-500">OD mg/L</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Drivers */}
          {result.drivers.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-amber-400" />
                Impulsores del Riesgo
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {result.drivers.map((d, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg text-[11px] bg-amber-950/40 text-amber-200 border border-amber-800/50 font-medium">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fase 5: aprobación humana (pausa) o traza de la decisión */}
          {result.status === 'pending_approval' && (
            <CajaAprobacion
              result={result}
              currentUser={currentUser}
              onDecidido={(r) => { setRequestState({ status: 'success', data: r }); publicarCorridaOAPAT(r); }}
            />
          )}
          {result.approval && (
            <TrazaDecision
              result={result}
              currentUser={currentUser}
              onComando={(r) => { setRequestState({ status: 'success', data: r }); publicarCorridaOAPAT(r); }}
            />
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                Recomendaciones
              </h4>
              <div className="space-y-1.5">
                {result.recommendations.map((r, i) => (
                  <div key={i} className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Model Weights & Versions (collapsible) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowModels(!showModels)}
              className="w-full px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Versiones de Modelo & Pesos del Ensemble
              </div>
              {showModels ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showModels && (
              <div className="px-3 pb-3 space-y-2">
                {/* Weights */}
                {result.forecast?.effective_weights && (
                  <div className="flex gap-2">
                    <div className="flex-1 bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-slate-400 font-mono">Physics</div>
                      <div className="text-sm font-bold text-indigo-300 font-mono">{((result.forecast.effective_weights.physics || 0) * 100).toFixed(0)}%</div>
                    </div>
                    <div className="flex-1 bg-violet-950/30 border border-violet-800/40 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-slate-400 font-mono">ML</div>
                      <div className="text-sm font-bold text-violet-300 font-mono">{((result.forecast.effective_weights.ml || 0) * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                )}
                {/* Versions table */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                  {Object.entries(result.model_versions).map(([k, v]) => (
                    <div key={k} className="bg-slate-950/60 rounded px-2 py-1 border border-slate-800/60 flex justify-between">
                      <span className="text-slate-500">{k}</span>
                      <span className="text-slate-300">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Audit Log (collapsible) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowAuditLog(!showAuditLog)}
              className="w-full px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                Traza de Auditoría ({result.audit_log.length} nodos)
              </div>
              {showAuditLog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showAuditLog && (
              <div className="px-3 pb-3">
                <div className="space-y-1">
                  {result.audit_log.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 text-[10px] font-mono bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <span className="text-emerald-400 shrink-0 mt-0.5">●</span>
                      <div>
                        <span className="text-cyan-300 font-semibold">{entry.node}</span>
                        <span className="text-slate-500 ml-2">{new Date(entry.at).toLocaleTimeString()}</span>
                        <p className="text-slate-400 mt-0.5">{entry.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
