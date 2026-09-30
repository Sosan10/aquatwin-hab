import React, { useState, useEffect } from 'react';
import {
  Workflow,
  Sparkles,
  Play,
  RefreshCw,
  CheckCircle2,
  FileCode2,
  Sliders,
  Send,
  Database,
  ArrowRight,
  Terminal,
  Activity,
  Layers,
  HelpCircle
} from 'lucide-react';
import { WaterBasin, UserProfile } from '../types';

interface LangflowStudioProps {
  basin: WaterBasin;
  currentUser: UserProfile;
}

interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    type: string;
    node: {
      display_name?: string;
      description?: string;
      template?: Record<string, any>;
    };
  };
}

export const LangflowStudioModule: React.FC<LangflowStudioProps> = ({
  basin,
  currentUser,
}) => {
  const [flowData, setFlowData] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [testInput, setTestInput] = useState('¿Cuál es la dosis recomendada de peróxido de hidrógeno si la microcistina supera los 10 µg/L?');
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ reply: string; source: string; time: string } | null>(null);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [statusInfo, setStatusInfo] = useState<{ mode: string; reachable: boolean; latencyMs: number } | null>(null);

  // Cargar definición del flujo desde localhost:3000/api/langflow/flow
  const loadFlow = async () => {
    try {
      const [flowRes, statusRes] = await Promise.all([
        fetch('/api/langflow/flow'),
        fetch('/api/langflow/status')
      ]);
      if (flowRes.ok) {
        const data = await flowRes.json();
        setFlowData(data);
        if (data?.data?.nodes?.length > 0) {
          setSelectedNode(data.data.nodes[1] || data.data.nodes[0]);
        }
      }
      if (statusRes.ok) {
        const sData = await statusRes.json();
        setStatusInfo(sData);
      }
    } catch (err) {
      console.error('Error cargando flujo Langflow:', err);
    }
  };

  useEffect(() => {
    loadFlow();
  }, []);

  const handleRunFlow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testInput.trim() || isRunning) return;

    setIsRunning(true);
    setTestResult(null);

    // Simular animación secuencial de paso por nodos del grafo
    setActiveStep(0);
    setTimeout(() => setActiveStep(1), 300);
    setTimeout(() => setActiveStep(2), 650);

    try {
      const res = await fetch('/api/langflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: testInput,
          basinContext: {
            name: basin.name,
            chlorophyllAvg: basin.chlorophyllAvg,
            phycocyaninAvg: basin.phycocyaninAvg
          },
          userRole: currentUser.role
        })
      });

      const data = await res.json();
      setActiveStep(3);

      setTestResult({
        reply: data.reply || 'Sin respuesta',
        source: data.source || 'Langflow Engine',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });
    } catch (err: any) {
      setTestResult({
        reply: `Error al ejecutar: ${err?.message}`,
        source: 'Error',
        time: new Date().toLocaleTimeString()
      });
    } finally {
      setIsRunning(false);
      setTimeout(() => setActiveStep(-1), 2500);
    }
  };

  const nodes: FlowNode[] = flowData?.data?.nodes || [];

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/40 rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-600/30 border border-purple-400/50 flex items-center justify-center text-purple-300 shrink-0 shadow-inner">
            <Workflow className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-wide">
                Langflow Studio &amp; Visual Flow Engine
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Nativo en localhost:3000
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Orquestación visual de agentes de IA y RAG limnológico ejecutándose directamente en este proyecto.
            </p>
          </div>
        </div>

        {/* Status Chip */}
        <div className="flex items-center gap-2.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-purple-800/60 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-slate-300 text-[11px]">
            Modo: <strong className="text-purple-300">Embebido Nativamente</strong>
          </span>
          <button
            onClick={loadFlow}
            className="text-slate-400 hover:text-white ml-1"
            title="Recargar definición del flujo"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Panel Superior: Canvas Visual del Grafo de Langflow */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-slate-100 text-sm">
              Grafo de Nodos Langflow: <span className="text-purple-300 font-mono text-xs">{flowData?.name || 'aquatwin-limnology-copilot'}</span>
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Haz clic en cualquier nodo para inspeccionar sus parámetros
          </span>
        </div>

        {/* Lienzo / Canvas Interactivo de Nodos */}
        <div className="relative bg-slate-950/90 rounded-xl p-6 border border-slate-800/80 overflow-x-auto min-h-[220px]">
          {/* Fondo cuadriculado estilo Langflow Canvas */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none rounded-xl"
            style={{
              backgroundImage: 'radial-gradient(circle, #a855f7 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          />

          {/* Nodos en Línea de Flujo */}
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2">
            {nodes.map((node, index) => {
              const isSelected = selectedNode?.id === node.id;
              const isStepActive = activeStep === index;

              return (
                <React.Fragment key={node.id}>
                  {/* Tarjeta de Nodo */}
                  <div
                    onClick={() => setSelectedNode(node)}
                    className={`cursor-pointer transition-all duration-300 w-full md:w-56 p-3.5 rounded-xl border flex flex-col gap-2 ${isStepActive
                        ? 'bg-purple-900/40 border-purple-400 shadow-lg shadow-purple-500/20 scale-105'
                        : isSelected
                          ? 'bg-slate-900 border-purple-500/80 shadow-md ring-2 ring-purple-500/20'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-bold">
                        Paso {index + 1}
                      </span>
                      {isStepActive && (
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-950/80 border border-purple-800/80 flex items-center justify-center text-purple-300 shrink-0">
                        {index === 0 && <Send className="w-3.5 h-3.5 text-cyan-400" />}
                        {index === 1 && <FileCode2 className="w-3.5 h-3.5 text-amber-400" />}
                        {index === 2 && <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                        {index === 3 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-100 truncate">
                          {node.data?.node?.display_name || node.id}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {node.data?.type}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Flecha conectora entre nodos */}
                  {index < nodes.length - 1 && (
                    <div className="hidden md:flex items-center justify-center text-slate-600">
                      <ArrowRight className={`w-5 h-5 transition-colors ${activeStep === index ? 'text-purple-400 animate-pulse' : 'text-slate-600'
                        }`} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Inspector de Nodo Seleccionado */}
        {selectedNode && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                Detalles del Nodo: <span className="text-purple-300 font-mono">{selectedNode.data?.node?.display_name || selectedNode.id}</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">ID: {selectedNode.id}</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              {selectedNode.data?.node?.description || 'Nodo configurado en el flujo de AquaTwin.'}
            </p>

            {/* Template Preview */}
            {selectedNode.data?.node?.template?.template?.value && (
              <div className="pt-1">
                <span className="text-slate-400 font-semibold block mb-1">Plantilla de Prompt Limnológico:</span>
                <pre className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[10px] text-slate-300 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {selectedNode.data.node.template.template.value}
                </pre>
              </div>
            )}

            {selectedNode.data?.node?.template?.model_name?.value && (
              <div className="flex items-center gap-4 text-[11px] pt-1 text-slate-300">
                <span>Modelo: <strong className="text-purple-300 font-mono">{selectedNode.data.node.template.model_name.value}</strong></span>
                <span>Temperatura: <strong className="text-cyan-300 font-mono">{selectedNode.data.node.template.temperature?.value ?? 0.3}</strong></span>
                <span>Max Tokens: <strong className="text-amber-300 font-mono">{selectedNode.data.node.template.max_tokens?.value ?? 900}</strong></span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel Inferior: Consola de Pruebas en Vivo (Sandbox) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Consola de Ejecución en Vivo (Sandbox)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-purple-400">POST /api/langflow/run</span>
          </div>

          <form onSubmit={handleRunFlow} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Pregunta o Instrucción para el Grafo:
              </label>
              <textarea
                rows={3}
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Escribe una consulta técnica sobre el embalse..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-purple-500 placeholder-slate-500 font-sans"
              />
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
              <span className="font-semibold text-slate-300 block">Contexto Inyectado Automáticamente:</span>
              <p>• Embalse: <span className="text-purple-300">{basin.name}</span> (Chl-a: {basin.chlorophyllAvg.toFixed(1)} µg/L)</p>
              <p>• Rol de Operador: <span className="text-purple-300">{currentUser.role}</span> ({currentUser.name})</p>
            </div>

            <button
              type="submit"
              disabled={!testInput.trim() || isRunning}
              className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Procesando Nodos del Grafo...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Ejecutar Grafo Langflow</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Salida del Grafo */}
        <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Salida Generada por Langflow
              </h3>
            </div>
            {testResult && (
              <span className="text-[10px] font-mono text-slate-400">{testResult.time}</span>
            )}
          </div>

          <div className="flex-1 bg-slate-950/90 rounded-xl p-4 border border-slate-800/80 overflow-y-auto min-h-[180px] text-xs">
            {isRunning ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                <span className="text-xs">Ejecutando pipeline de nodos: Prompt &rarr; LLM &rarr; Output...</span>
              </div>
            ) : testResult ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-950/80 text-purple-300 border border-purple-800/60">
                    {testResult.source}
                  </span>
                </div>
                <div className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {testResult.reply}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 py-8 space-y-1">
                <HelpCircle className="w-6 h-6 text-slate-600" />
                <span>Haz clic en &quot;Ejecutar Grafo&quot; para probar la respuesta del flujo.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
