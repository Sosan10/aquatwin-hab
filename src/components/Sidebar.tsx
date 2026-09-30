import React from 'react';
import {
  Waves,
  Cpu,
  Sigma,
  Radio,
  ShieldAlert,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
  Flame,
  Globe2,
  Layers,
  Sparkles,
  Workflow,
  Database,
} from 'lucide-react';
import { WaterBasin, UserProfile } from '../types';

export interface NavItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ElementType;
  group?: string;
  badge?: number;
  highlight?: boolean;
}

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  anomalyCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  currentUser: UserProfile;
  selectedBasin?: WaterBasin;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard 3D & Telemetría',
    shortLabel: 'Dashboard',
    icon: Waves,
    group: 'Gemelo Digital',
  },
  {
    id: 'ai-forecast',
    label: 'IA & Alerta Temprana',
    shortLabel: 'IA Alerta',
    icon: Cpu,
    group: 'Gemelo Digital',
  },
  {
    id: 'gd-motor',
    label: 'Motor GD & Explicabilidad',
    shortLabel: 'Motor GD',
    icon: Sigma,
    group: 'Análisis & Métodos',
  },
  {
    id: 'langflow-studio',
    label: 'Langflow Studio & Flujos',
    shortLabel: 'Langflow Studio',
    icon: Workflow,
    group: 'Análisis & Métodos',
  },
  {
    id: 'iot-sync',
    label: 'Gemelo 3D & Ingestión IoT',
    shortLabel: 'IoT & Actuadores',
    icon: Radio,
    group: 'Operación & Control',
  },
  {
    id: 'users-rbac',
    label: 'Usuarios & RBAC',
    shortLabel: 'Usuarios',
    icon: ShieldAlert,
    group: 'Administración',
  },
  {
    id: 'reports',
    label: 'Reportes PDF/Word/Excel',
    shortLabel: 'Reportes',
    icon: CheckCircle2,
    group: 'Administración',
  },
  {
    id: 'architecture',
    label: 'Arquitectura Senior & Entregables',
    shortLabel: 'Arquitectura',
    icon: Layers,
    group: 'Documentación',
    highlight: true,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  anomalyCount,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  currentUser,
  selectedBasin,
}) => {
  const handleItemClick = (id: string) => {
    onSelectTab(id);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full bg-slate-900/95 border-r border-slate-800 text-slate-100 select-none backdrop-blur-md">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 border border-cyan-400/30 shrink-0">
            <Waves className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0 transition-opacity duration-200">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white">AquaTwin</span>
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                  HAB 3D
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono truncate">
                Digital Twin Alerta Temprana
              </p>
            </div>
          )}
        </div>

        {/* Mobile Close Button */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Cerrar barra lateral"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Basin status widget (when expanded) */}
      {!collapsed && selectedBasin && (
        <div className="px-3 pt-3 pb-1">
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2 shadow-inner">
            <div className="flex items-center gap-2 min-w-0">
              <Globe2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate">{selectedBasin.name}</p>
                <p className="text-[10px] text-slate-400 font-mono">{selectedBasin.country}</p>
              </div>
            </div>
            <div
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 shrink-0 border ${
                selectedBasin.currentRisk === 'CRITICAL'
                  ? 'bg-rose-950/90 text-rose-300 border-rose-700/80 animate-pulse'
                  : selectedBasin.currentRisk === 'HIGH'
                  ? 'bg-amber-950/90 text-amber-300 border-amber-700/80'
                  : 'bg-emerald-950/90 text-emerald-300 border-emerald-700/80'
              }`}
            >
              <Flame className="w-2.5 h-2.5" />
              <span>{selectedBasin.currentRisk}</span>
            </div>
          </div>
        </div>
      )}

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isAI = item.id === 'ai-forecast';
          const badgeCount = isAI ? anomalyCount : item.badge;

          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                isActive
                  ? item.highlight
                    ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-600/30'
                    : 'bg-cyan-600 text-white font-semibold shadow-lg shadow-cyan-600/25'
                  : item.highlight
                  ? 'text-indigo-300/90 hover:text-white hover:bg-indigo-950/40 border border-indigo-900/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              } ${collapsed ? 'justify-center px-2' : ''}`}
            >
              {/* Active Indicator Bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-cyan-300 rounded-r-full" />
              )}

              <Icon
                className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-white' : item.highlight ? 'text-indigo-400' : 'text-cyan-400'
                }`}
              />

              {!collapsed && (
                <span className="truncate text-left flex-1 font-medium">{item.label}</span>
              )}

              {/* Anomaly Badge */}
              {badgeCount !== undefined && badgeCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shadow-sm ${
                    collapsed
                      ? 'absolute top-1.5 right-1.5 bg-rose-500 text-white ring-2 ring-slate-900'
                      : 'bg-rose-500 text-white ml-auto'
                  }`}
                >
                  {badgeCount}
                </span>
              )}

              {/* Tooltip on Collapsed Mode */}
              {collapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-slate-100 text-xs rounded-lg shadow-xl border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  <div className="font-semibold">{item.label}</div>
                  {item.group && <div className="text-[10px] text-cyan-400">{item.group}</div>}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / User Profile & Collapse Toggle */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 shrink-0 space-y-2.5">
        {/* Real Dataset Provenance Pill */}
        {!collapsed ? (
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-600/30 text-[11px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" /> Dataset Activo
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="font-mono text-xs font-bold text-emerald-300 truncate">
              fcr_oapat.csv
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              1.960 obs · Carey Lab LTREB
            </p>
          </div>
        ) : (
          <div className="flex justify-center p-2 rounded-xl bg-slate-900/90 border border-emerald-600/30" title="Dataset Activo: fcr_oapat.csv (1.960 obs reales)">
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
        )}

        {/* User Card */}
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/50 shrink-0">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate leading-tight">
                {currentUser.name}
              </p>
              <p className="text-[10px] text-cyan-400 font-mono truncate">{currentUser.role}</p>
            </div>
          )}
        </div>

        {/* Desktop Collapse / Expand Button */}
        <button
          onClick={onToggleCollapse}
          className={`hidden lg:flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors text-[11px] font-medium ${
            collapsed ? 'justify-center' : ''
          }`}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-cyan-400" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 text-cyan-400" />
              <span>Colapsar barra lateral</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Sticky Left Column) */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-all duration-300 z-30 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {navContent}
      </aside>

      {/* Mobile Backdrop & Off-Canvas Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
