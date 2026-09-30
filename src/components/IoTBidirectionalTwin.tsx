import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Zap, 
  Waves, 
  Cpu, 
  Send, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Terminal, 
  Sliders, 
  RefreshCw, 
  AlertCircle,
  Power,
  Volume2
} from 'lucide-react';
import { IoTBuoy, ActuatorDevice, UserProfile } from '../types';
import { ACTUATORS } from '../data/mockData';

interface IoTBidirectionalTwinProps {
  buoys: IoTBuoy[];
  actuators: ActuatorDevice[];
  currentUser: UserProfile;
  onUpdateActuators: (actuators: ActuatorDevice[]) => void;
}

export const IoTBidirectionalTwin: React.FC<IoTBidirectionalTwinProps> = ({
  buoys,
  actuators: initialActuators,
  currentUser,
  onUpdateActuators
}) => {
  const [actuators, setActuators] = useState<ActuatorDevice[]>(initialActuators || ACTUATORS);
  const [selectedActuator, setSelectedActuator] = useState<ActuatorDevice>(actuators[0]);
  const [powerInput, setPowerInput] = useState(selectedActuator.powerLevel);
  const [freqInput, setFreqInput] = useState(selectedActuator.ultrasonicFreqKhz || 28.5);
  const [flowInput, setFlowInput] = useState(selectedActuator.flowRateM3s || 14.5);
  const [isDispatching, setIsDispatching] = useState(false);
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);

  // Ingestion Packet Stream Log
  const [packetLogs, setPacketLogs] = useState<Array<{
    id: string;
    protocol: 'MQTT' | 'OPC-UA' | 'HTTP-REST';
    topic: string;
    payload: string;
    timestamp: string;
    status: 'OK' | 'WARN';
  }>>([
    {
      id: 'pkt-01',
      protocol: 'MQTT',
      topic: 'san-roque/iot/buoy-02/telemetry',
      payload: JSON.stringify({ chla: 112.5, phyco: 98000, temp: 27.8, od: 14.8, ph: 9.6, p_total: 0.54 }),
      timestamp: 'Hace 3s',
      status: 'WARN'
    },
    {
      id: 'pkt-02',
      protocol: 'MQTT',
      topic: 'san-roque/iot/buoy-01/telemetry',
      payload: JSON.stringify({ chla: 78.3, phyco: 64200, temp: 26.4, od: 3.4, ph: 9.1, p_total: 0.32 }),
      timestamp: 'Hace 8s',
      status: 'OK'
    },
    {
      id: 'pkt-03',
      protocol: 'OPC-UA',
      topic: 'scada/embalse/spillway/gate-01/position',
      payload: JSON.stringify({ open_pct: 30.0, flow_m3s: 14.5, head_pressure_bar: 2.8 }),
      timestamp: 'Hace 15s',
      status: 'OK'
    },
    {
      id: 'pkt-04',
      protocol: 'MQTT',
      topic: 'san-roque/actuators/aerator-01/telemetry',
      payload: JSON.stringify({ rpm: 1450, current_amps: 24.2, temp_motor_c: 48.5, power_pct: 85 }),
      timestamp: 'Hace 22s',
      status: 'OK'
    }
  ]);

  // Simulate incoming live telemetry packets periodically
  useEffect(() => {
    const timer = setInterval(() => {
      const randomBuoy = buoys[Math.floor(Math.random() * buoys.length)];
      const newPkt = {
        id: `pkt-${Date.now()}`,
        protocol: 'MQTT' as const,
        topic: `san-roque/iot/${randomBuoy.code.toLowerCase()}/telemetry`,
        payload: JSON.stringify({
          temp: (randomBuoy.telemetry.tempSurface + (Math.random() * 0.4 - 0.2)).toFixed(1),
          chla: (randomBuoy.telemetry.chlorophyllA + (Math.random() * 2 - 1)).toFixed(1),
          od: (randomBuoy.telemetry.dissolvedOxygen + (Math.random() * 0.2 - 0.1)).toFixed(1),
          bat: randomBuoy.batteryLevel
        }),
        timestamp: 'Justo ahora',
        status: randomBuoy.status === 'ALERT' ? ('WARN' as const) : ('OK' as const)
      };
      setPacketLogs(prev => [newPkt, ...prev.slice(0, 7)]);
    }, 4000);
    return () => clearInterval(timer);
  }, [buoys]);

  // Send Command to Actuator via Backend API
  const handleDispatchCommand = async () => {
    setIsDispatching(true);
    setCommandFeedback(null);
    try {
      const res = await fetch('/api/actuators/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedActuator.id,
          command: selectedActuator.type === 'AERATOR' ? 'SET_POWER_LEVEL' : selectedActuator.type === 'ULTRASONIC' ? 'SET_FREQUENCY' : 'SET_FLOW_RATE',
          powerLevel: powerInput,
          frequencyKhz: freqInput,
          flowRateM3s: flowInput,
          operatorName: currentUser.name
        })
      });
      const data = await res.json();

      // Update actuator local and parent state
      const updatedList = actuators.map(a => {
        if (a.id === selectedActuator.id) {
          return {
            ...a,
            powerLevel: powerInput,
            ultrasonicFreqKhz: freqInput,
            flowRateM3s: flowInput,
            status: powerInput > 0 ? ('ACTIVE' as const) : ('IDLE' as const),
            lastCommandTimestamp: new Date().toLocaleTimeString(),
            controlledBy: currentUser.name
          };
        }
        return a;
      });

      setActuators(updatedList);
      onUpdateActuators(updatedList);
      setCommandFeedback(`Comando enviado exitosamente al Gateway IoT (${selectedActuator.name}).`);
    } catch (e: any) {
      setCommandFeedback('Error al despachar el comando al actuador.');
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Bidirectional Sync Concept */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-cyan-500/40 rounded-xl p-3 sm:p-4 shadow-xl flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-3.5">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-cyan-600/30 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0">
            <Radio className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-100">
                Sincronización Bidireccional Físico-Virtual
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-900 text-cyan-200 border border-cyan-700 font-mono">
                MQTT Broker + OPC-UA Bridge
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Ingestión continua de telemetría de sensores y control remoto de dispositivos de remediación física/química.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 self-start md:self-auto">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Broker Latencia: 18ms</span>
        </div>
      </div>

      {/* Main Grid: Actuator Control Desk & Live Ingestion Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left (7 Cols): Actuator Command Desk */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 shadow-lg space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Consola de Control de Actuadores & Mitigación Activa
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Operador: {currentUser.name} ({currentUser.role})
            </span>
          </div>

          {/* Actuator Selector Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {actuators.map((act) => (
              <button
                key={act.id}
                onClick={() => {
                  setSelectedActuator(act);
                  setPowerInput(act.powerLevel);
                  if (act.ultrasonicFreqKhz) setFreqInput(act.ultrasonicFreqKhz);
                  if (act.flowRateM3s) setFlowInput(act.flowRateM3s);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedActuator.id === act.id
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 shadow-md shadow-cyan-950/50'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs">{act.name.split(' ')[0]}</span>
                  <span className={`w-2 h-2 rounded-full ${act.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                </div>
                <p className="text-[10px] truncate">{act.name}</p>
                <div className="mt-1 text-[10px] font-mono text-slate-300">
                  {act.type === 'AERATOR' ? `${act.powerLevel}% Potencia` : act.type === 'ULTRASONIC' ? `${act.ultrasonicFreqKhz} kHz` : `${act.flowRateM3s} m³/s`}
                </div>
              </button>
            ))}
          </div>

          {/* Detailed Selected Actuator Control Panel */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-100 text-sm">{selectedActuator.name}</h4>
                <p className="text-xs text-slate-400 leading-snug">
                  Tipo: {selectedActuator.type} | Último: {selectedActuator.lastCommandTimestamp} por {selectedActuator.controlledBy}
                </p>
              </div>
              <span className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold ${
                selectedActuator.status === 'ACTIVE'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}>
                {selectedActuator.status}
              </span>
            </div>

            {/* Actuator-Specific Slider Controls */}
            {selectedActuator.type === 'AERATOR' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">Potencia de Inyección de Aire (Compresor):</span>
                  <span className="font-mono text-cyan-400 font-bold text-sm">{powerInput}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={powerInput}
                  onChange={(e) => setPowerInput(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] text-slate-500 font-mono gap-0.5">
                <span>0% (Detener)</span>
                <span className="hidden sm:inline">50% (Mantenimiento)</span>
                <span>100% (Aireación Máxima Anti-Hipoxia)</span>
                </div>
              </div>
            )}

            {selectedActuator.type === 'ULTRASONIC' && (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-300">Frecuencia de Resonancia Bioacústica:</span>
                    <span className="font-mono text-purple-400 font-bold text-sm">{freqInput} kHz</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={40}
                    step={0.5}
                    value={freqInput}
                    onChange={(e) => setFreqInput(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded appearance-none cursor-pointer accent-purple-500"
                  />
                  <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] text-slate-500 font-mono mt-0.5 gap-0.5">
                    <span>20.0 kHz (Colapso Microcystis)</span>
                    <span className="hidden sm:inline">28.5 kHz (Óptimo Vesículas)</span>
                    <span>40.0 kHz (Amplio Espectro)</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-300">Nivel de Potencia Acústica:</span>
                    <span className="font-mono text-purple-300 font-bold">{powerInput}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={powerInput}
                    onChange={(e) => setPowerInput(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>
            )}

            {selectedActuator.type === 'FLOW_GATE' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">Caudal de Descarga de Fondo (Desfogue Ecológico):</span>
                  <span className="font-mono text-blue-400 font-bold text-sm">{flowInput} m³/s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={2.5}
                  value={flowInput}
                  onChange={(e) => setFlowInput(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] text-slate-500 font-mono gap-0.5">
                <span>0 m³/s (Cerrada)</span>
                <span className="hidden sm:inline">15 m³/s (Caudal Ecológico)</span>
                <span>50 m³/s (Descarga Rápida)</span>
                </div>
              </div>
            )}

            {/* Command Feedback message */}
            {commandFeedback && (
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700/80 text-emerald-300 text-xs flex items-center gap-2 font-mono">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{commandFeedback}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={handleDispatchCommand}
                disabled={isDispatching}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20"
              >
                {isDispatching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Despachar Comando al Gemelo Físico</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right (5 Cols): Live Ingestion Stream & Packet Inspector */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 shadow-lg space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Inspector de Ingestión IoT (MQTT Stream)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 animate-pulse">STREAMING</span>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              Flujo continuo de tramas JSON de sensores de boyas y SCADA recibidos vía WebSockets/MQTT:
            </p>

            <div className="mt-3 space-y-2 max-h-[260px] sm:max-h-[340px] overflow-y-auto font-mono text-[10px] sm:text-[11px]">
              {packetLogs.map((pkt) => (
                <div
                  key={pkt.id}
                  className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-2.5 space-y-1 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        pkt.protocol === 'MQTT' ? 'bg-cyan-950 text-cyan-400' : 'bg-purple-950 text-purple-400'
                      }`}>
                        {pkt.protocol}
                      </span>
                      <span className="text-slate-300 font-semibold">{pkt.topic}</span>
                    </div>
                    <span className="text-slate-500">{pkt.timestamp}</span>
                  </div>
                  <div className="text-slate-400 break-all bg-slate-900/80 p-1.5 rounded text-[10px] text-emerald-300/90">
                    {pkt.payload}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>Tasa de Ingestión: 42 tramas/min</span>
            <span className="text-cyan-400">Pérdida de Paquetes: 0.0%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
