import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Sparkles, 
  TrendingUp, 
  AlertTriangle, 
  ShieldCheck, 
  Sliders, 
  Send, 
  RefreshCw, 
  Layers, 
  Activity, 
  CheckCircle2, 
  FileText, 
  Info,
  ChevronRight,
  Zap,
  BarChart3,
  Workflow,
  BookOpen,
  ExternalLink,
  X,
  Database
} from 'lucide-react';
import { WaterBasin, MLPrediction, AnomalyEvent, SHAPFeatureContribution, UserProfile } from '../types';
import { ML_FORECASTS, ANOMALIES, SHAP_CONTRIBUTIONS } from '../data/mockData';
import { OAPATAlertPanel } from './OAPATAlertPanel';

interface AIEarlyWarningModuleProps {
  basin: WaterBasin;
  currentUser: UserProfile;
  simulatedTempOffset: number;
  onTempOffsetChange: (val: number) => void;
  simulatedPO4Offset: number;
  onPO4OffsetChange: (val: number) => void;
  simulatedAeratorPower: number;
  onAeratorPowerChange: (val: number) => void;
  onOpenReportTab: () => void;
}

export const AIEarlyWarningModule: React.FC<AIEarlyWarningModuleProps> = ({
  basin,
  currentUser,
  simulatedTempOffset,
  onTempOffsetChange,
  simulatedPO4Offset,
  onPO4OffsetChange,
  simulatedAeratorPower,
  onAeratorPowerChange,
  onOpenReportTab
}) => {
  const [forecasts, setForecasts] = useState<MLPrediction[]>(ML_FORECASTS);
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>(ANOMALIES);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotHistory, setCopilotHistory] = useState<Array<{ sender: 'USER' | 'AI'; text: string; time: string; source?: string; isError?: boolean }>>([
    {
      sender: 'AI',
      text: `Hola ${currentUser.name}. Soy el motor de IA Limnológica de AquaTwin. He analizado el paso satelital Sentinel-2 y la red de boyas IoT en ${basin.name}. Se proyecta un riesgo crítico de floración por Microcystis en las próximas 48 horas debido a la temperatura de 27.8°C y alta disponibilidad de fósforo. ¿Deseas evaluar el impacto de incrementar la aireación hipolimnética al 100%?`,
      time: '09:15 UTC',
      source: 'AquaTwin AI Core'
    }
  ]);
  const [isGeneratingDiagnosis, setIsGeneratingDiagnosis] = useState(false);
  const [aiDiagnosisResult, setAiDiagnosisResult] = useState<string | null>(null);
  // Origen del diagnóstico. Sin OPENAI_API_KEY el servidor devuelve un texto
  // fijo con HTTP 200, así que sin mostrarlo un diagnóstico inventado y uno
  // real de OpenAI son indistinguibles en pantalla.
  const [aiDiagnosisSource, setAiDiagnosisSource] = useState<string | null>(null);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);

  // Estados de integración con Langflow
  const [aiEngine, setAiEngine] = useState<'openai' | 'langflow'>('openai');
  const [langflowInfo, setLangflowInfo] = useState<{ configured: boolean; reachable: boolean; url: string; flowId: string; latencyMs?: number } | null>(null);
  const [isCheckingLangflow, setIsCheckingLangflow] = useState(false);
  const [showLangflowModal, setShowLangflowModal] = useState(false);

  const checkLangflowStatus = async () => {
    setIsCheckingLangflow(true);
    try {
      const res = await fetch('/api/langflow/status');
      if (res.ok) {
        const data = await res.json();
        setLangflowInfo(data);
      }
    } catch (e) {
      console.error('Error comprobando estado de Langflow:', e);
    } finally {
      setIsCheckingLangflow(false);
    }
  };

  useEffect(() => {
    checkLangflowStatus();
  }, []);

  // Trigger OpenAI diagnosis
  const handleGenerateAIDiagnosis = async () => {
    setIsGeneratingDiagnosis(true);
    try {
      const res = await fetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basinName: basin.name,
          telemetry: {
            tempSurface: 27.8 + simulatedTempOffset,
            ph: 9.3,
            dissolvedOxygen: 3.4,
            dissolvedOxygenSat: 42,
            chlorophyllA: 78.3 + (simulatedTempOffset * 5) + (simulatedPO4Offset * 40),
            phycocyanin: 64200 + (simulatedPO4Offset * 30000),
            totalPhosphorus: 0.45 + simulatedPO4Offset,
            totalNitrogen: 4.2,
            solarRadiationPAR: 1550,
            windSpeed: 2.5
          },
          satelliteIndices: {
            ndci: 0.42,
            chla: 82.0,
            turbidity: 54.0
          },
          simulatedScenario: {
            tempOffset: simulatedTempOffset,
            po4Offset: simulatedPO4Offset,
            aeratorPower: simulatedAeratorPower
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo completar la solicitud de IA');
      setAiDiagnosisResult(data.diagnosis || 'Diagnóstico generado.');
      setAiDiagnosisSource(data.source || null);
    } catch (e) {
      console.error(e);
      setAiDiagnosisResult('Error al invocar el modelo GPT. Revisa la configuración y conectividad.');
      setAiDiagnosisSource(null);
    } finally {
      setIsGeneratingDiagnosis(false);
    }
  };

  // Trigger Copilot Chat Message
  const handleSendCopilot = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!copilotPrompt.trim() || isCopilotLoading) return;

    const userMsg = copilotPrompt.trim();
    setCopilotPrompt('');
    setCopilotHistory(prev => [
      ...prev,
      { sender: 'USER', text: userMsg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ]);
    setIsCopilotLoading(true);

    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          engine: aiEngine,
          basinContext: {
            name: basin.name,
            currentRisk: basin.currentRisk,
            chlorophyllAvg: basin.chlorophyllAvg,
            phycocyaninAvg: basin.phycocyaninAvg
          },
          userRole: currentUser.role
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Error al procesar la respuesta del motor de IA.');
      }

      setCopilotHistory(prev => [
        ...prev,
        {
          sender: 'AI',
          text: data.reply || 'Respuesta del Copilot',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: data.source || (aiEngine === 'langflow' ? 'Langflow Flow' : 'OpenAI Core')
        }
      ]);
    } catch (err: any) {
      setCopilotHistory(prev => [
        ...prev,
        {
          sender: 'AI',
          text: `⚠️ ${err?.message || 'Error al comunicarse con el asistente.'}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: aiEngine === 'langflow' ? 'Langflow Disconnected' : 'Error de Conexión',
          isError: true
        }
      ]);
    } finally {
      setIsCopilotLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: AI Model Architecture & Status */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/40 rounded-xl p-3 sm:p-4 shadow-xl flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-3.5">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-indigo-600/30 border border-indigo-400/50 flex items-center justify-center text-indigo-300 shrink-0">
            <Cpu className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-100">
                Pipeline Predictivo & Detección de Anomalías
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-900 text-indigo-200 border border-indigo-700 font-mono">
                CNN-LSTM + Isolation Forest + GPT
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Fusión espacio-temporal de bandas multiespectrales (Sentinel-2 B4, B5, B8A) y telemetría de boyas a 1 Hz.
            </p>
          </div>
        </div>

        <button
          onClick={handleGenerateAIDiagnosis}
          disabled={isGeneratingDiagnosis}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 whitespace-nowrap justify-center"
        >
          {isGeneratingDiagnosis ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Analizando con GPT...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generar Diagnóstico Limnológico IA</span>
            </>
          )}
        </button>
      </div>

      {/* AI Diagnostic Result Banner (if generated) */}
      {aiDiagnosisResult && (
        <div className="bg-slate-900 border border-cyan-500/50 rounded-xl p-5 shadow-2xl text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Informe de Diagnóstico Limnológico & Recomendación Prescriptiva
              </h3>
              {aiDiagnosisSource && (
                <span
                  title={aiDiagnosisSource}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    aiDiagnosisSource.toLowerCase().includes('openai')
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {aiDiagnosisSource.toLowerCase().includes('openai')
                    ? '● OpenAI GPT'
                    : '▲ Motor local (sin API key)'}
                </span>
              )}
            </div>
            <button
              onClick={() => { setAiDiagnosisResult(null); setAiDiagnosisSource(null); }}
              className="text-slate-400 hover:text-white font-mono"
            >
              ✕ Cerrar
            </button>
          </div>
          <div className="prose prose-invert max-w-none text-slate-300 whitespace-pre-wrap leading-relaxed font-sans bg-slate-950/60 p-4 rounded-lg border border-slate-800">
            {aiDiagnosisResult}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onOpenReportTab}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-semibold text-xs border border-slate-700 flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Incluir en Boletín PDF Oficial</span>
            </button>
          </div>
        </div>
      )}

      {/* Section 1: CNN-LSTM Spatio-Temporal Prediction Table & Trend */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Pronóstico de Biomasa Algal y Cianotoxinas (Horizonte 7 Días)
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-xs text-slate-400">
                Modelo CNN-LSTM calibrado sobre observaciones in-situ e hidrodinámica 3D.
              </p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/70 border border-emerald-700/50 text-emerald-300">
                <Database className="w-3 h-3 text-emerald-400" /> Dataset: fcr_oapat.csv (1.960 obs reales)
              </span>
            </div>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800/80 self-start sm:self-auto">
            R² Test Score: 0.942 | RMSE: ±6.8 µg/L
          </span>
        </div>

        {/* Prediction Cards Horizontal Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-2.5">
          {forecasts.map((f, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                f.riskLevel === 'CRITICAL'
                  ? 'bg-rose-950/40 border-rose-700/80 text-rose-200'
                  : f.riskLevel === 'HIGH'
                  ? 'bg-amber-950/40 border-amber-700/80 text-amber-200'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs">{f.timestamp}</span>
                <span className={`w-2 h-2 rounded-full ${
                  f.riskLevel === 'CRITICAL' ? 'bg-rose-500 animate-pulse' : f.riskLevel === 'HIGH' ? 'bg-amber-500' : 'bg-emerald-500'
                }`} />
              </div>

              <div className="my-2">
                <div className="text-lg font-black font-mono">
                  {(f.predictedChlorophyll + (simulatedTempOffset * 4) + (simulatedPO4Offset * 30)).toFixed(1)}
                  <span className="text-[10px] font-normal text-slate-400 ml-1">µg/L</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  CI: [{f.confidenceMin} - {f.confidenceMax}]
                </div>
              </div>

              <div className="text-[10px] pt-1.5 border-t border-slate-800/80 space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Prob. Bloom:</span>
                  <span className="font-bold">{f.bloomProbability}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Toxina Est.:</span>
                  <span className="font-semibold text-rose-300">{f.estimatedMicrocystinUgL} µg/L</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerta 7–14 días (OAPAT, Fase 4 del plan). El orquestador LangGraph
          produce el número; el copiloto de abajo solo lo explica en lenguaje
          natural, nunca es la fuente del pronóstico. */}
      <section aria-labelledby="oapat-titulo" className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 id="oapat-titulo" className="font-bold text-slate-100 text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Alerta temprana 7–14 días (OAPAT — orquestador de asimilación y pronóstico)
          </h3>
          <span className="text-[10.5px] text-emerald-400 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Servicio LangGraph · Dataset real: fcr_oapat.csv (1.960 obs reales)
          </span>
        </div>
        <OAPATAlertPanel basinId={basin.id} basinName={basin.name} currentUser={currentUser} />
        <p className="text-[10.5px] text-slate-500 italic">
          El copiloto conversacional de esta pestaña puede explicar este resultado, pero no lo
          calcula: la probabilidad, la incertidumbre y los impulsores proceden exclusivamente del
          ensemble físico–ML del orquestador.
        </p>
      </section>

      {/* Section 2: Two Columns: Explainable AI (SHAP) & Interactive What-If Scenario Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Explainable AI (SHAP Waterfall Attribution) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Explicabilidad del Modelo IA (Valores SHAP)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Atribución de Causas</span>
          </div>
          <p className="text-xs text-slate-400">
            Cuantificación del impacto relativo de cada variable biofísica en la probabilidad del bloom:
          </p>

          <div className="space-y-2.5 pt-1">
            {SHAP_CONTRIBUTIONS.map((item, idx) => (
              <div key={idx} className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-200">{item.displayName}</span>
                  <span className={`font-mono font-bold ${item.impactScore > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {item.impactScore > 0 ? `+${(item.impactScore * 100).toFixed(0)}% Riesgo` : `${(item.impactScore * 100).toFixed(0)}% Riesgo`}
                  </span>
                </div>
                {/* La anchura se limita al 100 %: con el factor 180 sin acotar,
                    cualquier impacto por encima de 0,55 desbordaba la barra. */}
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full rounded-full ${item.impactScore > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, Math.abs(item.impactScore) * 180)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: What-If Limnological Scenario Sandbox */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Sandbox de Simulación "What-If" (Gemelo Digital)
              </h3>
            </div>
            <button
              onClick={() => {
                onTempOffsetChange(0);
                onPO4OffsetChange(0);
                onAeratorPowerChange(85);
              }}
              className="text-[11px] text-slate-400 hover:text-cyan-400 underline font-mono"
            >
              Restablecer
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Ajusta variables ambientales o de intervención para observar en tiempo real la respuesta en el Gemelo 3D:
          </p>

          <div className="space-y-4 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            {/* Slider 1: Ola de Calor (Temp Offset) */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Variación Térmica (Ola de Calor):</span>
                <span className="font-mono text-cyan-400 font-bold">
                  {simulatedTempOffset >= 0 ? `+${simulatedTempOffset}°C` : `${simulatedTempOffset}°C`}
                </span>
              </div>
              <input
                type="range"
                min={-3}
                max={5}
                step={0.5}
                value={simulatedTempOffset}
                onChange={(e) => onTempOffsetChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] text-slate-500 font-mono mt-0.5 gap-0.5">
                <span>-3.0°C (Enfriamiento)</span>
                <span className="hidden sm:inline">0.0°C (Actual)</span>
                <span>+5.0°C (Ola de Calor Severa)</span>
              </div>
            </div>

            {/* Slider 2: Escorrentía Agrícola (Fósforo) */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Aporte de Fósforo por Escorrentía:</span>
                <span className="font-mono text-orange-400 font-bold">
                  {simulatedPO4Offset >= 0 ? `+${(simulatedPO4Offset * 100).toFixed(0)}%` : `${(simulatedPO4Offset * 100).toFixed(0)}%`}
                </span>
              </div>
              <input
                type="range"
                min={-0.2}
                max={0.5}
                step={0.05}
                value={simulatedPO4Offset}
                onChange={(e) => onPO4OffsetChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] text-slate-500 font-mono mt-0.5 gap-0.5">
                <span>-20% (Inhibición)</span>
                <span className="hidden sm:inline">0% (Línea Base)</span>
                <span>+50% (Lluvia Torrencial)</span>
              </div>
            </div>

            {/* Slider 3: Potencia de Aireación */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Potencia de Aireación Hipolimnética:</span>
                <span className="font-mono text-emerald-400 font-bold">{simulatedAeratorPower}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={simulatedAeratorPower}
                onChange={(e) => onAeratorPowerChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] text-slate-500 font-mono mt-0.5 gap-0.5">
                <span>0% (Apagado)</span>
                <span className="hidden sm:inline">50% (Económico)</span>
                <span>100% (Desestratificación Máxima)</span>
              </div>
            </div>
          </div>

          {/* Sandbox Projected Output */}
          <div className="bg-indigo-950/40 border border-indigo-800/80 rounded-xl p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <span className="text-slate-300 font-semibold">Impacto Proyectado en Biomasa Algal:</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {simulatedAeratorPower > 80 && simulatedTempOffset <= 0 && simulatedPO4Offset <= 0
                  ? 'Reducción de riesgo del 24% gracias a la desestratificación forzada.'
                  : 'Condiciones de crecimiento exponencial activas. Se recomienda alerta roja.'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 font-mono">Chl-a Proyectada</span>
              <div className="text-lg font-black text-cyan-300 font-mono">
                {(basin.chlorophyllAvg + (simulatedTempOffset * 6) + (simulatedPO4Offset * 45) - (simulatedAeratorPower * 0.15)).toFixed(1)} µg/L
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Limnological Copilot Chatbot (OpenAI & Langflow Multi-Engine) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
          <div className="flex items-center gap-2">
            {aiEngine === 'langflow' ? (
              <Workflow className="w-4 h-4 text-purple-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-cyan-400" />
            )}
            <h3 className="font-bold text-slate-100 text-sm">
              Asistente Copilot Limnológico
            </h3>
          </div>

          {/* Motor Selector & Helpers */}
          <div className="flex items-center gap-2">
            <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAiEngine('openai')}
                className={`px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                  aiEngine === 'openai'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
                title="Usar motor nativo OpenAI GPT"
              >
                <Sparkles className="w-3 h-3" />
                <span>OpenAI GPT</span>
              </button>

              <button
                type="button"
                onClick={() => setAiEngine('langflow')}
                className={`px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                  aiEngine === 'langflow'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
                title="Usar orquestador de flujos visuales Langflow"
              >
                <Workflow className="w-3 h-3" />
                <span>Langflow Flow</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    langflowInfo?.reachable ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowLangflowModal(true)}
              className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs flex items-center gap-1 transition-colors"
              title="Guía de configuración y estado de Langflow"
            >
              <Info className="w-3.5 h-3.5 text-purple-400" />
            </button>
          </div>
        </div>

        {/* Langflow Active Status Bar */}
        {aiEngine === 'langflow' && (
          <div className="bg-purple-950/30 border border-purple-800/50 rounded-lg p-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  langflowInfo?.reachable ? 'bg-emerald-400 animate-ping' : 'bg-amber-500'
                }`}
              />
              <span className="text-slate-300 font-medium">
                {langflowInfo?.reachable ? (
                  <>Langflow en línea en <code className="text-purple-300 font-mono text-[11px]">{langflowInfo?.url}</code> (Flujo: {langflowInfo?.flowId})</>
                ) : (
                  <>Langflow desconectado en <code className="text-amber-300 font-mono text-[11px]">{langflowInfo?.url || 'http://127.0.0.1:7860'}</code></>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={checkLangflowStatus}
                disabled={isCheckingLangflow}
                className="text-[11px] text-purple-300 hover:text-purple-200 underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingLangflow ? 'animate-spin' : ''}`} />
                <span>Reintentar</span>
              </button>
              <button
                type="button"
                onClick={() => setShowLangflowModal(true)}
                className="text-[11px] bg-purple-900/60 hover:bg-purple-800 text-purple-200 px-2 py-0.5 rounded border border-purple-700/60"
              >
                Ver Guía
              </button>
            </div>
          </div>
        )}

        {/* Chat History Box */}
        <div className="h-48 sm:h-60 bg-slate-950/80 rounded-xl p-2.5 sm:p-3 border border-slate-800 overflow-y-auto space-y-3 text-xs">
          {copilotHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.sender === 'USER' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500 font-mono">
                <span>{msg.sender === 'USER' ? currentUser.name : 'AquaTwin AI'}</span>
                <span>• {msg.time}</span>
                {msg.source && (
                  <span className={`px-1.5 py-0.2 rounded text-[9px] ${
                    msg.isError
                      ? 'bg-red-950/70 text-red-400 border border-red-800/60'
                      : msg.source.toLowerCase().includes('langflow')
                      ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                      : 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                  }`}>
                    {msg.source}
                  </span>
                )}
              </div>
              <div
                className={`p-3 rounded-xl max-w-[85%] leading-relaxed ${
                  msg.sender === 'USER'
                    ? 'bg-cyan-600 text-white rounded-br-none'
                    : msg.isError
                    ? 'bg-red-950/50 border border-red-800/80 text-red-200 rounded-bl-none shadow'
                    : 'bg-slate-900 border border-slate-700/80 text-slate-200 rounded-bl-none shadow'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {isCopilotLoading && (
            <div className="flex items-center gap-2 text-slate-400 text-xs italic">
              <RefreshCw className={`w-3.5 h-3.5 animate-spin ${aiEngine === 'langflow' ? 'text-purple-400' : 'text-cyan-400'}`} />
              <span>
                {aiEngine === 'langflow'
                  ? 'Ejecutando grafo conversacional en Langflow...'
                  : 'Consultando corpus limnológico y datos satelitales...'}
              </span>
            </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <form onSubmit={handleSendCopilot} className="flex gap-2">
          <input
            type="text"
            value={copilotPrompt}
            onChange={(e) => setCopilotPrompt(e.target.value)}
            placeholder={
              aiEngine === 'langflow'
                ? "Consulta a través del flujo Langflow (ej. 'Analiza el riesgo de microcistina')..."
                : "Pregunta a la IA sobre cianotoxinas, bandas Sentinel-2, dosis de peróxido o vertidos..."
            }
            className={`flex-1 bg-slate-950 border rounded-xl px-4 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-500 ${
              aiEngine === 'langflow'
                ? 'border-purple-800/60 focus:border-purple-500'
                : 'border-slate-800 focus:border-cyan-500'
            }`}
          />
          <button
            type="submit"
            disabled={!copilotPrompt.trim() || isCopilotLoading}
            className={`px-4 py-2 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5 shadow ${
              aiEngine === 'langflow'
                ? 'bg-purple-600 hover:bg-purple-500'
                : 'bg-cyan-600 hover:bg-cyan-500'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Enviar</span>
          </button>
        </form>
      </div>

      {/* Modal Guía Langflow */}
      {showLangflowModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300">
                  <Workflow className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">
                    Integración de Langflow con AquaTwin
                  </h3>
                  <p className="text-xs text-slate-400">
                    Orquestador visual de flujos conversacionales, agentes y RAG limnológico
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLangflowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-xl space-y-1">
                <span className="font-bold text-purple-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Estado de la Conexión
                </span>
                <p>
                  URL configurada: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-purple-200 font-mono">{langflowInfo?.url || 'http://127.0.0.1:7860'}</code>
                </p>
                <p>
                  ID de Flujo / Endpoint: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-purple-200 font-mono">{langflowInfo?.flowId || 'aquatwin-limnology-copilot'}</code>
                </p>
                <p className="flex items-center gap-1.5 pt-1">
                  Estado actual:{' '}
                  {langflowInfo?.reachable ? (
                    <span className="text-emerald-400 font-semibold">● Conectado y listo ({langflowInfo.latencyMs} ms)</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">○ Servidor desconectado en el puerto 7860</span>
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  Pasos para iniciar Langflow en 1 minuto
                </h4>

                <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-[11px]">
                  <p className="text-slate-400">// 1. En Windows, ejecuta el launcher automático desde la carpeta langflow:</p>
                  <p className="text-cyan-300">cd langflow ; .\start_langflow.bat</p>

                  <p className="text-slate-400 pt-2">// O ejecuta con pip:</p>
                  <p className="text-cyan-300">pip install langflow</p>
                  <p className="text-cyan-300">langflow run --port 7860</p>

                  <p className="text-slate-400 pt-2">// 2. Importa el flujo de AquaTwin en Langflow:</p>
                  <p className="text-slate-300">Abre <a href="http://localhost:7860" target="_blank" rel="noreferrer" className="text-purple-400 underline">http://localhost:7860</a> &gt; Click en &quot;Import&quot; &gt; Selecciona el archivo <code className="text-cyan-300">langflow/aquatwin_limnology_flow.json</code></p>
                </div>
              </div>

              <div className="space-y-1 text-slate-400">
                <p className="font-medium text-slate-300">¿Qué hace el flujo preconfigurado?</p>
                <p>
                  El flujo conecta la entrada de chat de AquaTwin con un nodo de <strong>Prompt Limnológico Experto</strong> (con las bandas de Sentinel-2, índices NDCI/FAI y guías de cianotoxinas), un <strong>Motor LLM</strong> y la salida del Copilot.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowLangflowModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
