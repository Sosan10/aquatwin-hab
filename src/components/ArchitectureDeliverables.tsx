import React, { useState } from 'react';
import { 
  Cpu, 
  Database, 
  Box, 
  Server, 
  Radio, 
  Code, 
  Copy, 
  Check, 
  Layers, 
  Workflow, 
  FileCode2, 
  ExternalLink,
  ChevronRight,
  Shield,
  Zap
} from 'lucide-react';

export const ArchitectureDeliverables: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'ARCHITECTURE' | 'DATABASE' | 'FORMATS_3D' | 'DOCKER' | 'INTEGRATION_FLOW'>('ARCHITECTURE');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(key);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const sqlPostGISCode = `-- =========================================================================
-- AQUATWIN HAB DIGITAL TWIN - POSTGIS SPATIAL DATABASE SCHEMA (DDL)
-- Database: PostgreSQL 16 + PostGIS 3.4
-- Spatial Reference System: EPSG:4326 (WGS84) & EPSG:3857 (Web Mercator)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- 1. CUENCAS Y CUERPOS DE AGUA (POLÍGONOS GEOMÉTRICOS & METADATOS)
CREATE TABLE water_basins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    country VARCHAR(64) NOT NULL,
    surface_area_km2 NUMERIC(8,2) NOT NULL,
    max_depth_m NUMERIC(6,2) NOT NULL,
    avg_depth_m NUMERIC(6,2) NOT NULL,
    volume_mcm NUMERIC(10,2) NOT NULL,
    trophic_status VARCHAR(32) DEFAULT 'Eutrophic',
    primary_use VARCHAR(64) NOT NULL,
    boundary_geom GEOMETRY(Polygon, 4326) NOT NULL,
    centroid_geom GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_water_basins_geom ON water_basins USING GIST (boundary_geom);

-- 2. ADQUISICIONES SATELITALES & METADATOS MULTIESPECTRALES
CREATE TABLE satellite_acquisitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    basin_id UUID REFERENCES water_basins(id) ON DELETE CASCADE,
    satellite_mission VARCHAR(32) NOT NULL, -- 'Sentinel-2 MSI', 'Landsat-9 OLI-2', 'Sentinel-3 OLCI'
    product_level VARCHAR(16) NOT NULL,     -- 'Level-2A BOA Reflectance'
    acquisition_date TIMESTAMPTZ NOT NULL,
    cloud_coverage_pct NUMERIC(5,2) NOT NULL,
    ndci_mean NUMERIC(5,3),
    chla_estimated_mean_ug_l NUMERIC(7,2),
    sst_temp_c NUMERIC(5,2),
    raster_tile_path VARCHAR(256),          -- Cloud Storage URI GeoTIFF / Cloud Optimized GeoTIFF (COG)
    raster_bbox GEOMETRY(Polygon, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sat_acquisitions_spatial ON satellite_acquisitions USING GIST (raster_bbox);
CREATE INDEX idx_sat_acquisitions_date ON satellite_acquisitions(acquisition_date DESC);

-- 3. ESTACIONES DE BOYAS IOT TELEMÉTRICAS
CREATE TABLE iot_buoy_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    basin_id UUID REFERENCES water_basins(id) ON DELETE CASCADE,
    station_code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    location_geom GEOMETRY(Point, 4326) NOT NULL,
    local_3d_grid_x NUMERIC(6,2) NOT NULL,
    local_3d_grid_z NUMERIC(6,2) NOT NULL,
    bathymetry_depth_m NUMERIC(6,2) NOT NULL,
    hardware_model VARCHAR(64) DEFAULT 'YSI EXO2 Multi-Parameter Sonde + Solar IoT',
    mqtt_topic VARCHAR(128) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_buoys_geom ON iot_buoy_stations USING GIST (location_geom);

-- 4. TELEMETRÍA TEMPORAL PARTICIONADA A ALTA FRECUENCIA
CREATE TABLE sensor_telemetry (
    id BIGSERIAL,
    station_id UUID REFERENCES iot_buoy_stations(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    temp_surface_c NUMERIC(5,2) NOT NULL,
    temp_depth_c NUMERIC(5,2),
    ph NUMERIC(4,2) NOT NULL,
    dissolved_oxygen_mg_l NUMERIC(5,2) NOT NULL,
    dissolved_oxygen_sat_pct NUMERIC(5,2),
    turbidity_ntu NUMERIC(6,2) NOT NULL,
    chlorophyll_a_ug_l NUMERIC(7,2) NOT NULL,
    phycocyanin_cells_ml INTEGER NOT NULL,
    total_nitrogen_mg_l NUMERIC(5,2),
    total_phosphorus_mg_l NUMERIC(5,2),
    solar_radiation_par_umol NUMERIC(7,2),
    wind_speed_kmh NUMERIC(5,2),
    battery_level_pct SMALLINT,
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- 5. PRONÓSTICOS DE MODELOS IA (CNN-LSTM FORECASTS)
CREATE TABLE ml_bloom_forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    basin_id UUID REFERENCES water_basins(id) ON DELETE CASCADE,
    model_version VARCHAR(32) NOT NULL,     -- 'AquaTwin-CNN-LSTM-v2.4'
    prediction_target_time TIMESTAMPTZ NOT NULL,
    forecast_horizon_hours INTEGER NOT NULL,
    predicted_chla_ug_l NUMERIC(7,2) NOT NULL,
    confidence_interval_min NUMERIC(7,2) NOT NULL,
    confidence_interval_max NUMERIC(7,2) NOT NULL,
    predicted_phycocyanin_cells_ml INTEGER NOT NULL,
    bloom_probability_pct NUMERIC(5,2) NOT NULL,
    risk_level VARCHAR(16) NOT NULL,        -- 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'
    dominant_algae_taxa VARCHAR(64) NOT NULL,
    estimated_microcystin_ug_l NUMERIC(6,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);`;

  const dockerComposeCode = `# =========================================================================
# AQUATWIN HAB 3D DIGITAL TWIN - DOCKER COMPOSE DEPLOYMENT BLUEPRINT
# Production Multi-Container Microservices Architecture
# =========================================================================
version: '3.8'

services:
  # 1. Spatial Database Engine (PostgreSQL + PostGIS)
  postgis-db:
    image: postgis/postgis:16-3.4
    container_name: aquatwin_postgis
    environment:
      POSTGRES_DB: aquatwin_db
      POSTGRES_USER: aquatwin_admin
      POSTGRES_PASSWORD: \${POSTGRES_SECURE_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgis_data:/var/lib/postgresql/data
      - ./init-db:/docker-entrypoint-initdb.d
    networks:
      - aquatwin_net
    restart: unless-stopped

  # 2. Ingestion Message Broker (Mosquitto MQTT with TLS)
  mqtt-broker:
    image: eclipse-mosquitto:2.0
    container_name: aquatwin_mqtt
    ports:
      - "1883:1883"
      - "9001:9001" # WebSockets for MQTT
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
    networks:
      - aquatwin_net
    restart: unless-stopped

  # 3. High-Performance Redis (Pub/Sub & WebSocket State Caching)
  redis-cache:
    image: redis:7.2-alpine
    container_name: aquatwin_redis
    ports:
      - "6379:6379"
    networks:
      - aquatwin_net
    restart: unless-stopped

  # 4. Backend API Core (Python + FastAPI + WebSockets + SQLAlchemy)
  fastapi-backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.fastapi
    container_name: aquatwin_backend
    environment:
      DATABASE_URL: postgresql+asyncpg://aquatwin_admin:\${POSTGRES_SECURE_PASSWORD}@postgis-db:5432/aquatwin_db
      REDIS_URL: redis://redis-cache:6379/0
      MQTT_HOST: mqtt-broker
      MQTT_PORT: 1883
      JWT_SECRET_KEY: \${JWT_SECRET_KEY}
      OPENAI_API_KEY: \${OPENAI_API_KEY}
    ports:
      - "8000:8000"
    depends_on:
      - postgis-db
      - redis-cache
      - mqtt-broker
    networks:
      - aquatwin_net
    restart: unless-stopped

  # 5. Distributed Worker Engine for Satellite Processing & ML Inference (Celery)
  ml-celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.worker
    container_name: aquatwin_worker
    environment:
      DATABASE_URL: postgresql://aquatwin_admin:\${POSTGRES_SECURE_PASSWORD}@postgis-db:5432/aquatwin_db
      CELERY_BROKER_URL: redis://redis-cache:6379/1
      CELERY_RESULT_BACKEND: redis://redis-cache:6379/2
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu] # GPU acceleration for PyTorch CNN-LSTM inference
    depends_on:
      - redis-cache
      - postgis-db
    networks:
      - aquatwin_net
    restart: unless-stopped

  # 6. Frontend 3D Digital Twin (Next.js / React Three Fiber & Three.js)
  nextjs-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.frontend
    container_name: aquatwin_frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000/api/v1
      NEXT_PUBLIC_WS_URL: ws://localhost:8000/ws/stream
    ports:
      - "3000:3000"
    depends_on:
      - fastapi-backend
    networks:
      - aquatwin_net
    restart: unless-stopped

volumes:
  postgis_data:
  
networks:
  aquatwin_net:
    driver: bridge`;

  const webSocketProtocolCode = `// =========================================================================
// AQUATWIN 3D CANVAS <-> WEBSOCKET REAL-TIME SYNC PROTOCOL
// JSON Schema Specification for Bi-directional State Synchronization
// =========================================================================

// 1. INCOMING TELEMETRY DELTA (Server -> 3D Canvas Client)
{
  "event": "BUOY_TELEMETRY_STREAM",
  "timestamp": "2026-08-26T10:14:00.125Z",
  "stationId": "buoy-02",
  "gridCoords": { "x": -3.5, "y": 0.0, "z": 2.4 },
  "telemetry": {
    "chlorophyllA": 112.5,        // Drives 3D Particle density & surface shader colormap
    "phycocyanin": 98000,         // Drives toxic cyanobacteria cloud alpha & tint
    "tempSurface": 27.8,          // Adjusts water shader refraction & thermal layer
    "dissolvedOxygen": 14.8,      // Triggers beacon color state (Alert/Warning/Normal)
    "windSpeed": 2.1,             // Regulates wave displacement frequency in vertex shader
    "windDirection": 145          // Rotates vector current arrows in degrees
  }
}

// 2. BIDIRECTIONAL ACTUATOR COMMAND (Client -> FastAPI Backend -> MQTT Gateway)
{
  "action": "DISPATCH_ACTUATOR_COMMAND",
  "deviceId": "act-01",
  "deviceType": "AERATOR",
  "command": "SET_POWER_LEVEL",
  "params": {
    "powerLevelPct": 100,         // Scaled to 3D bubble column particle emission rate
    "bubbleVelocity": 1.8         // Three.js Point Cloud vertical velocity
  },
  "operator": {
    "id": "usr-02",
    "role": "OPERATOR",
    "jwtToken": "Bearer eyJhbGciOiJSUzI1Ni..."
  }
}

// 3. SATELLITE TILE TEXTURE READY EVENT (Server -> 3D Canvas)
{
  "event": "SATELLITE_LAYER_REFRESH",
  "mission": "Sentinel-2 MSI",
  "layerType": "CHLOROPHYLL_A",
  "timestamp": "2026-08-26T10:14:00Z",
  "textureUrl": "https://storage.aquatwin.gov.ar/tiles/san-roque-chla-20260826.webp",
  "resolutionMeters": 10.0,
  "bounds": {
    "north": -31.350, "south": -31.420,
    "east": -64.430, "west": -64.490
  }
}`;

  return (
    <div className="space-y-6">
      {/* Top Banner: Senior Architecture Header */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border border-indigo-500/50 rounded-xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-400 flex items-center justify-center text-indigo-300 shadow-lg shadow-indigo-600/20">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-100">
                Arquitectura de Gemelo Digital 3D & Entregables de Ingeniería
              </h2>
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-indigo-900 text-indigo-200 border border-indigo-700 font-mono">
                Senior Digital Twin Architect
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Especificaciones de diseño técnico: Clean Architecture, PostGIS DDL, formatos 3D/LOD, Docker Compose y protocolo WebSockets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-indigo-300 bg-indigo-950/80 px-3 py-1.5 rounded-lg border border-indigo-800 self-start md:self-auto">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Cumplimiento Estándar ISO/IEC 30105 & OGC 3D Tiles</span>
        </div>
      </div>

      {/* Navigation Tabs between Technical Deliverables */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs font-semibold scrollbar-none">
        <button
          onClick={() => setActiveSection('ARCHITECTURE')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSection === 'ARCHITECTURE'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Workflow className="w-4 h-4" />
          <span>1. Diagrama de Arquitectura Limpia</span>
        </button>

        <button
          onClick={() => setActiveSection('DATABASE')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSection === 'DATABASE'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>2. Modelo PostGIS & DDL</span>
        </button>

        <button
          onClick={() => setActiveSection('FORMATS_3D')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSection === 'FORMATS_3D'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Box className="w-4 h-4" />
          <span>3. Especificación Formatos 3D & LOD</span>
        </button>

        <button
          onClick={() => setActiveSection('DOCKER')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSection === 'DOCKER'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>4. Despliegue Docker Compose</span>
        </button>

        <button
          onClick={() => setActiveSection('INTEGRATION_FLOW')}
          className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeSection === 'INTEGRATION_FLOW'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>5. Integración Canvas 3D ↔ WebSockets</span>
        </button>
      </div>

      {/* Section 1: System Clean Architecture Interactive Diagram */}
      {activeSection === 'ARCHITECTURE' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <Workflow className="w-4 h-4 text-indigo-400" />
              Arquitectura de Software Limpia (Clean Architecture) & Flujo de Datos en Tiempo Real
            </h3>
            <p className="text-xs text-slate-300">
              Estructura desacoplada en 5 capas maestras para garantizar latencia ultra baja, escalabilidad horizontal e interoperabilidad con satélites e IoT:
            </p>

            {/* Architecture Flow Diagram Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
              {/* Layer 1: Ingestion & Physical World */}
              <div className="bg-slate-950/80 border border-cyan-800/60 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block mb-1">
                    Capa 1: Ingestión Física
                  </span>
                  <h4 className="font-bold text-slate-100 text-xs">Fuentes de Datos & Edge</h4>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300 font-mono">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🛰️ Sentinel-2 / Landsat-9 (COGs)
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    📡 Boyas IoT (MQTT QoS 1 / TLS)
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    ⚙️ SCADA Hidráulico (OPC-UA)
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🚁 Ortomosaicos Dron (Multiespectral)
                  </div>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono">Edge Ingestion Gateways</span>
              </div>

              {/* Layer 2: Message Broker & Caching */}
              <div className="bg-slate-950/80 border border-purple-800/60 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider block mb-1">
                    Capa 2: Event Bus
                  </span>
                  <h4 className="font-bold text-slate-100 text-xs">Mensajería & Streaming</h4>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300 font-mono">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    ⚡ Mosquitto / EMQX (MQTT)
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🚀 Redis Pub/Sub (State Sync)
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    📦 Apache Kafka (Time-series)
                  </div>
                </div>
                <span className="text-[10px] text-purple-400 font-mono">Latencia &lt; 20ms</span>
              </div>

              {/* Layer 3: Backend Clean Architecture (FastAPI) */}
              <div className="bg-slate-950/80 border border-indigo-800/60 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider block mb-1">
                    Capa 3: Backend Core
                  </span>
                  <h4 className="font-bold text-slate-100 text-xs">FastAPI + Async Python</h4>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300 font-mono">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🌐 WebSockets Async Engine
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🛡️ RBAC / OAuth2 JWT Auth
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🔄 SQLAlchemy 2.0 Async
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    📑 Celery Report Generators
                  </div>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono">Clean Domain / Usecases</span>
              </div>

              {/* Layer 4: AI / ML Pipeline */}
              <div className="bg-slate-950/80 border border-amber-800/60 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block mb-1">
                    Capa 4: IA & Analítica
                  </span>
                  <h4 className="font-bold text-slate-100 text-xs">Modelos & Diagnóstico</h4>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300 font-mono">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🧠 PyTorch CNN-LSTM Forecast
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🌲 Isolation Forest Anomalies
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🔍 SHAP Explainable AI
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    ✨ OpenAI GPT Copilot & XAI
                  </div>
                </div>
                <span className="text-[10px] text-amber-400 font-mono">GPU TensorRT Inference</span>
              </div>

              {/* Layer 5: Frontend 3D Digital Twin */}
              <div className="bg-slate-950/80 border border-emerald-800/60 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider block mb-1">
                    Capa 5: Gemelo 3D
                  </span>
                  <h4 className="font-bold text-slate-100 text-xs">Three.js / WebGL / Next.js</h4>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300 font-mono">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🌊 3D Shaders & Bathymetry
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🕹️ Sincronización Bidireccional
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    🗺️ OGC 3D Tiles / GLTF PBR
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    ⏱️ 4D Temporal Timeline Slider
                  </div>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">60 FPS Render Loop</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: PostgreSQL / PostGIS Spatial Database DDL */}
      {activeSection === 'DATABASE' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Esquema Relacional y Geoespacial PostGIS (DDL SQL)
                </h3>
              </div>
              <button
                onClick={() => copyCode('sql', sqlPostGISCode)}
                className="text-xs text-cyan-300 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedCode === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode === 'sql' ? 'Copiado' : 'Copiar DDL'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Tablas geoespaciales con indexación espacial GIST, particionamiento temporal de telemetría y soporte raster PostGIS:
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-[420px] overflow-y-auto font-mono text-[11px] text-slate-200">
              <pre className="text-cyan-300">{sqlPostGISCode}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: 3D Formats & LOD Specification */}
      {activeSection === 'FORMATS_3D' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-400" />
              Especificación de Formatos 3D, Compresión y Niveles de Detalle (LOD)
            </h3>
            <p className="text-xs text-slate-300">
              Estrategia de renderizado y conversión de datos geoespaciales a geometrías 3D de alta eficiencia:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
              {/* Format 1: GLTF/GLB */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-300 text-sm">GLTF 2.0 / GLB Binary</span>
                  <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-400 font-mono text-[10px]">PBR Ready</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Utilizado para boyas IoT, aireadores solares, transductores y modelos BIM de presas/vertederos.
                </p>
                <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                  <li>Compresión de malla con <strong className="text-purple-300">Draco Compression</strong> (reducción de tamaño ~75%).</li>
                  <li>Texturas en formato KTX2 / Basis Universal.</li>
                  <li>Materiales Physically Based Rendering (Roughness, Metalness, Transmission).</li>
                </ul>
              </div>

              {/* Format 2: Bathymetric GeoTIFF to 3D Mesh */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-300 text-sm">GeoTIFF DEM a 3D Heightmap</span>
                  <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-mono text-[10px]">Quantized Mesh</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Pipeline automatizado que convierte modelos digitales de elevación (DEM/Batimetría) en mallas trianguladas Three.js.
                </p>
                <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                  <li>Resolución nativa: 2m x 2m en zonas de embalse.</li>
                  <li>Normales calculadas por sombreado Gouraud/Phong.</li>
                  <li>Estructura de cuadrículas espacialmente indexadas (Tile Tree).</li>
                </ul>
              </div>

              {/* Format 3: IFC / BIM for Hydraulics */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300 text-sm">IFC / BIM a 3D Tiles</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono text-[10px]">OGC Standard</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Integración de infraestructuras civiles: compuertas de descarga, túneles de toma y plantas potabilizadoras.
                </p>
                <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                  <li>LOD 0: Huella ortográfica 2D (visión regional).</li>
                  <li>LOD 1: Volumetría básica extruida.</li>
                  <li>LOD 2: Arquitectura y compuertas operativas animadas.</li>
                  <li>LOD 3: Sensores internos y conductos de aspiración.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 4: Docker & Docker Compose Deployment Blueprint */}
      {activeSection === 'DOCKER' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Configuración de Despliegue en Contenedores (docker-compose.yml)
                </h3>
              </div>
              <button
                onClick={() => copyCode('docker', dockerComposeCode)}
                className="text-xs text-amber-300 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedCode === 'docker' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode === 'docker' ? 'Copiado' : 'Copiar Compose'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Orquestación lista para producción con aislamiento de red, aceleración GPU para inferencia IA y persistencia PostGIS:
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-[420px] overflow-y-auto font-mono text-[11px] text-slate-200">
              <pre className="text-amber-300">{dockerComposeCode}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Section 5: Integration Protocol Canvas 3D ↔ WebSockets */}
      {activeSection === 'INTEGRATION_FLOW' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Especificación de Protocolo Canvas 3D ↔ API REST / WebSockets
                </h3>
              </div>
              <button
                onClick={() => copyCode('ws', webSocketProtocolCode)}
                className="text-xs text-emerald-300 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedCode === 'ws' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode === 'ws' ? 'Copiado' : 'Copiar Protocolo'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Esquema de eventos JSON para sincronización de telemetría de boyas a 60 FPS, control de actuadores y refresco satelital:
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-[420px] overflow-y-auto font-mono text-[11px] text-slate-200">
              <pre className="text-emerald-300">{webSocketProtocolCode}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
