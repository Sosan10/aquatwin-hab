import React from 'react';
import { 
  Waves, 
  Satellite, 
  Radio, 
  Flame, 
  Globe2, 
  Menu, 
  PanelLeftClose, 
  PanelLeftOpen,
  Database,
  CheckCircle2
} from 'lucide-react';
import { WaterBasin, UserProfile } from '../types';

export interface HeaderProps {
  basins: WaterBasin[];
  selectedBasin: WaterBasin;
  onSelectBasin: (basin: WaterBasin) => void;
  currentUser: UserProfile;
  onToggleSidebar?: () => void;
  onOpenMobileMenu?: () => void;
  sidebarCollapsed?: boolean;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  anomalyCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  basins,
  selectedBasin,
  onSelectBasin,
  currentUser,
  onToggleSidebar,
  onOpenMobileMenu,
  sidebarCollapsed,
}) => {
  return (
    <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-20 backdrop-blur-md">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          
          {/* Left: Sidebar Toggle & Basin Selector */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Hamburger Drawer Trigger */}
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 rounded-xl border border-slate-700/80 bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              aria-label="Abrir menú de navegación"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Desktop Sidebar Collapse / Expand Quick Toggle */}
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="hidden lg:flex items-center justify-center p-2 rounded-xl border border-slate-700/80 bg-slate-800/60 text-slate-300 hover:text-cyan-300 hover:bg-slate-700/70 hover:border-cyan-500/40 transition-all"
                title={sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
                aria-label="Alternar barra lateral"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4 text-cyan-400" />
                ) : (
                  <PanelLeftClose className="w-4 h-4 text-slate-400" />
                )}
              </button>
            )}

            {/* Mobile Logo when Sidebar is hidden on small screens */}
            <div className="flex lg:hidden items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow shrink-0">
                <Waves className="w-4 h-4 text-white" />
              </div>
              <span className="font-extrabold text-sm text-white tracking-tight truncate">
                AquaTwin
              </span>
            </div>

            {/* Basin Switcher */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-inner min-w-0 max-w-[260px] lg:max-w-none">
              <Globe2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <select
                value={selectedBasin.id}
                onChange={(e) => {
                  const found = basins.find((b) => b.id === e.target.value);
                  if (found) onSelectBasin(found);
                }}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer pr-2 min-w-0 truncate"
              >
                {basins.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-slate-100">
                    {b.name} ({b.country}) - {b.currentRisk}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Real Dataset Pill */}
            <div
              className="hidden lg:flex items-center gap-1.5 bg-emerald-950/70 hover:bg-emerald-950/90 transition-all px-2.5 py-1.5 rounded-xl border border-emerald-600/40 text-xs shadow-inner cursor-default"
              title="Dataset Real In-Situ Activo: fcr_oapat.csv (1.960 observaciones observadas in-situ 2015-2023, Carey Lab / Virginia Tech LTREB + ERA5). Cero datos sintéticos."
            >
              <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-300">Dataset:</span>
              <span className="font-mono text-[11px] font-bold text-emerald-300">fcr_oapat.csv</span>
              <span className="hidden xl:inline text-[9.5px] font-bold text-emerald-200 bg-emerald-900/60 px-1.5 py-0.5 rounded border border-emerald-700/50">
                1.960 obs reales
              </span>
            </div>
          </div>

          {/* Right: Live Telemetry, Risk and User Status */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Satellite Pass Health */}
            <div className="hidden xl:flex items-center gap-2 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/60 text-xs font-mono">
              <Satellite className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-slate-300">{selectedBasin.satelliteSensor}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>

            {/* MQTT IoT Broker Health */}
            <div className="hidden md:flex items-center gap-2 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/60 text-xs font-mono">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300">MQTT QoS 1</span>
              <span className="text-[10px] text-emerald-400 font-semibold">Online</span>
            </div>

            {/* Risk Badge */}
            <div
              className={`px-2 sm:px-2.5 py-1 rounded-lg font-bold text-[10px] sm:text-xs flex items-center gap-1 sm:gap-1.5 border shadow ${
                selectedBasin.currentRisk === 'CRITICAL'
                  ? 'bg-rose-950/80 text-rose-300 border-rose-700/80 animate-pulse'
                  : selectedBasin.currentRisk === 'HIGH'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/80'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80'
              }`}
            >
              <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Riesgo {selectedBasin.currentRisk}</span>
              <span className="sm:hidden">{selectedBasin.currentRisk}</span>
            </div>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border border-cyan-500/50">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-slate-200 leading-tight">{currentUser.name}</p>
                <p className="text-[10px] text-cyan-400 font-mono">{currentUser.role}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Basin Switcher & Real Dataset Pill — visible only on xs screens */}
        <div className="sm:hidden pb-2.5 space-y-1.5">
          <div className="flex items-center gap-2 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-inner">
            <Globe2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <select
              value={selectedBasin.id}
              onChange={(e) => {
                const found = basins.find((b) => b.id === e.target.value);
                if (found) onSelectBasin(found);
              }}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer flex-1 min-w-0"
            >
              {basins.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900 text-slate-100">
                  {b.name} ({b.country}) - {b.currentRisk}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1 bg-emerald-950/60 rounded-lg border border-emerald-700/40 text-[10px]">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Database className="w-3 h-3 text-emerald-400" /> Dataset real:
            </span>
            <span className="font-mono font-bold text-emerald-300">fcr_oapat.csv (1.960 obs)</span>
          </div>
        </div>
      </div>
    </header>
  );
};

