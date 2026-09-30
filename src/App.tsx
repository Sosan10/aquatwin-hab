import React, { useState } from 'react';
import { 
  Sidebar 
} from './components/Sidebar';
import { 
  Header 
} from './components/Header';
import { 
  DashboardKPIs 
} from './components/DashboardKPIs';
import { 
  DigitalTwin3DCanvas 
} from './components/DigitalTwin3DCanvas';
import { 
  AIEarlyWarningModule 
} from './components/AIEarlyWarningModule';
import { 
  IoTBidirectionalTwin 
} from './components/IoTBidirectionalTwin';
import { 
  UsersRBACModule 
} from './components/UsersRBACModule';
import { 
  ReportingModule 
} from './components/ReportingModule';
import { 
  ArchitectureDeliverables 
} from './components/ArchitectureDeliverables';
import { 
  GDMotorModule 
} from './components/GDMotorModule';
import {
  LangflowStudioModule
} from './components/LangflowStudioModule';
import { 
  WATER_BASINS, 
  IOT_BUOYS, 
  ACTUATORS, 
  ANOMALIES, 
  RBAC_USERS,
  getBuoysForBasin,
  getActuatorsForBasin
} from './data/mockData';
import { 
  WaterBasin, 
  IoTBuoy, 
  ActuatorDevice, 
  SpectralLayerType, 
  UserProfile 
} from './types';

export default function App() {
  const [basins, setBasins] = useState<WaterBasin[]>(WATER_BASINS);
  const [selectedBasin, setSelectedBasin] = useState<WaterBasin>(WATER_BASINS[0]);
  const [buoys, setBuoys] = useState<IoTBuoy[]>(IOT_BUOYS);
  const [actuators, setActuators] = useState<ActuatorDevice[]>(ACTUATORS);
  const [selectedBuoy, setSelectedBuoy] = useState<IoTBuoy | null>(null);
  const [selectedActuator, setSelectedActuator] = useState<ActuatorDevice | null>(null);
  
  // Navigation & Tab State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  
  // 3D Visualization Controls
  const [spectralLayer, setSpectralLayer] = useState<SpectralLayerType>('CHLOROPHYLL_A');
  const [selectedHour, setSelectedHour] = useState<number>(14); // 14:00 (Peak solar irradiance)
  
  // What-If Simulation Parameters
  const [simulatedTempOffset, setSimulatedTempOffset] = useState<number>(0);
  const [simulatedPO4Offset, setSimulatedPO4Offset] = useState<number>(0);
  const [simulatedAeratorPower, setSimulatedAeratorPower] = useState<number>(85);

  // RBAC User Session
  const [currentUser, setCurrentUser] = useState<UserProfile>(RBAC_USERS[0]);

  // Handle buoy selection from 3D Canvas or KPI list
  const handleSelectBuoy = (buoy: IoTBuoy) => {
    setSelectedBuoy(buoy);
    setSelectedActuator(null);
  };

  const handleSelectActuator = (actuator: ActuatorDevice) => {
    setSelectedActuator(actuator);
    setSelectedBuoy(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-row font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* 1. Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        anomalyCount={ANOMALIES.filter(a => !a.resolved).length}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        currentUser={currentUser}
        selectedBasin={selectedBasin}
      />

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Global Top Header */}
        <Header
          basins={basins}
          selectedBasin={selectedBasin}
          onSelectBasin={(b) => {
            setSelectedBasin(b);
            setBuoys(getBuoysForBasin(b.id));
            setActuators(getActuatorsForBasin(b.id));
            setSelectedBuoy(null);
            setSelectedActuator(null);
          }}
          currentUser={currentUser}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          anomalyCount={ANOMALIES.filter(a => !a.resolved).length}
        />

        {/* Main Content Body */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* TAB 1: 3D Twin & Dashboard Telemetry */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
            {/* Real-time KPIs & Anomaly Alert Bar */}
            <DashboardKPIs
              basin={selectedBasin}
              buoys={buoys}
              anomalies={ANOMALIES}
              onSelectBuoy={handleSelectBuoy}
              onOpenAIDiagnosis={() => setActiveTab('ai-forecast')}
            />

            {/* Interactive 3D Digital Twin Canvas */}
            <DigitalTwin3DCanvas
              basin={selectedBasin}
              buoys={buoys}
              actuators={actuators}
              selectedLayer={spectralLayer}
              onSelectLayer={setSpectralLayer}
              selectedHour={selectedHour}
              onSelectHour={setSelectedHour}
              selectedBuoy={selectedBuoy}
              onSelectBuoy={handleSelectBuoy}
              selectedActuator={selectedActuator}
              onSelectActuator={handleSelectActuator}
              simulatedTempOffset={simulatedTempOffset}
              simulatedPO4Offset={simulatedPO4Offset}
              simulatedAeratorPower={simulatedAeratorPower}
            />
          </div>
        )}

        {/* TAB 2: AI & Early Warning Engine */}
        {activeTab === 'ai-forecast' && (
          <AIEarlyWarningModule
            basin={selectedBasin}
            currentUser={currentUser}
            simulatedTempOffset={simulatedTempOffset}
            onTempOffsetChange={setSimulatedTempOffset}
            simulatedPO4Offset={simulatedPO4Offset}
            onPO4OffsetChange={setSimulatedPO4Offset}
            simulatedAeratorPower={simulatedAeratorPower}
            onAeratorPowerChange={setSimulatedAeratorPower}
            onOpenReportTab={() => setActiveTab('reports')}
          />
        )}

        {/* TAB: Motor del Gemelo Digital — diagnóstico, pronóstico y explicabilidad.
            Todas sus figuras y tablas llevan ficha de interpretación (ver src/components/gd/Ficha.tsx). */}
        {activeTab === 'gd-motor' && <GDMotorModule basin={selectedBasin} currentUser={currentUser} />}

        {/* TAB: Langflow Studio & Visual Flow Engine (Embebido en localhost:3000) */}
        {activeTab === 'langflow-studio' && (
          <LangflowStudioModule basin={selectedBasin} currentUser={currentUser} />
        )}

        {/* TAB 3: IoT Bidirectional Sync & Actuator Control */}
        {activeTab === 'iot-sync' && (
          <IoTBidirectionalTwin
            buoys={buoys}
            actuators={actuators}
            currentUser={currentUser}
            onUpdateActuators={setActuators}
          />
        )}

        {/* TAB 4: Users & RBAC Matrix */}
        {activeTab === 'users-rbac' && (
          <UsersRBACModule
            currentUser={currentUser}
            onSwitchUser={setCurrentUser}
          />
        )}

        {/* TAB 5: Multiformat Reporting (PDF/Word/Excel) */}
        {activeTab === 'reports' && (
          <ReportingModule
            basin={selectedBasin}
            buoys={buoys}
            currentUser={currentUser}
          />
        )}

        {/* TAB 6: Senior Architecture & Technical Deliverables */}
        {activeTab === 'architecture' && (
          <ArchitectureDeliverables />
        )}
      </main>

      {/* 3. Modern Tech Footer */}
      <footer className="bg-slate-900/90 border-t border-slate-800 text-xs text-slate-400 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold text-slate-200">AquaTwin HAB Digital Twin</span>
            <span className="text-slate-500 font-mono">| Clean Architecture & Sensor Fusion</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span>FastAPI + WebSockets Backend Ready</span>
            <span>•</span>
            <span>PostgreSQL / PostGIS</span>
            <span>•</span>
            <span>Three.js & WebGL 3D</span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
