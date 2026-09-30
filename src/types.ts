export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type TrophicStatus = 'Oligotrophic' | 'Mesotrophic' | 'Eutrophic' | 'Hypereutrophic';

export interface WaterBasin {
  id: string;
  name: string;
  location: string;
  country: string;
  lat: number;
  lng: number;
  surfaceAreaKm2: number;
  maxDepthMeters: number;
  avgDepthMeters: number;
  volumeMcm: number;
  trophicStatus: TrophicStatus;
  primaryUse: 'Drinking Water' | 'Hydroelectric' | 'Recreational / Tourism' | 'Aquaculture / Ecology';
  currentRisk: RiskLevel;
  chlorophyllAvg: number; // µg/L
  phycocyaninAvg: number; // cells/mL
  waterTempAvg: number; // °C
  dissolvedOxygenAvg: number; // mg/L
  lastSatellitePass: string;
  satelliteSensor: 'Sentinel-2 MSI' | 'Landsat-9 OLI-2' | 'Sentinel-3 OLCI';
}

export type SpectralLayerType = 
  | 'CHLOROPHYLL_A' 
  | 'NDCI' 
  | 'PHYCOCYANIN' 
  | 'SST_TEMPERATURE' 
  | 'TURBIDITY' 
  | 'DISSOLVED_O2' 
  | 'BATHYMETRY';

export interface SpectralLayerConfig {
  id: SpectralLayerType;
  name: string;
  unit: string;
  min: number;
  max: number;
  colorScale: string[];
  description: string;
  thresholdWarning: number;
  thresholdCritical: number;
}

export interface IoTBuoy {
  id: string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  gridX: number; // 3D local coordinate
  gridZ: number;
  depthMeters: number;
  status: 'ONLINE' | 'WARNING' | 'ALERT' | 'OFFLINE';
  batteryLevel: number;
  lastPing: string;
  telemetry: {
    tempSurface: number; // °C
    tempDepth: number; // °C at 5m
    ph: number;
    dissolvedOxygen: number; // mg/L
    dissolvedOxygenSat: number; // %
    turbidity: number; // NTU
    chlorophyllA: number; // µg/L
    phycocyanin: number; // cells/mL
    totalNitrogen: number; // mg/L
    totalPhosphorus: number; // mg/L
    nitrate: number; // mg/L
    phosphate: number; // mg/L
    solarRadiationPAR: number; // µmol/(m²·s)
    windSpeed: number; // km/h
    windDirection: string;
  };
}

export interface ActuatorDevice {
  id: string;
  name: string;
  type: 'AERATOR' | 'ULTRASONIC' | 'FLOW_GATE' | 'COAGULANT_DISPENSER';
  gridX: number;
  gridZ: number;
  status: 'ACTIVE' | 'IDLE' | 'MAINTENANCE' | 'ERROR';
  powerLevel: number; // 0-100%
  flowRateM3s?: number;
  ultrasonicFreqKhz?: number;
  lastCommandTimestamp: string;
  controlledBy: string;
}

export interface MLPrediction {
  timestamp: string;
  hoursAhead: number;
  predictedChlorophyll: number;
  confidenceMin: number;
  confidenceMax: number;
  predictedPhycocyanin: number;
  bloomProbability: number; // 0 - 100%
  riskLevel: RiskLevel;
  dominantTaxa: 'Microcystis aeruginosa' | 'Dolichospermum flos-aquae' | 'Planktothrix agardhii' | 'Cylindrospermopsis raciborskii';
  estimatedMicrocystinUgL: number;
}

export interface AnomalyEvent {
  id: string;
  timestamp: string;
  severity: 'HIGH' | 'MEDIUM' | 'CRITICAL';
  type: 'THERMAL_SPIKE' | 'NOCTURNAL_HYPOXIA' | 'NUTRIENT_SURGE' | 'RAPID_BIOMASS_DOUBLING';
  location: string;
  buoyId: string;
  description: string;
  anomalyScore: number; // 0.0 to 1.0 (Isolation Forest metric)
  suggestedAction: string;
  resolved: boolean;
}

export interface SHAPFeatureContribution {
  feature: string;
  displayName: string;
  value: string;
  impactScore: number; // positive increases bloom risk, negative decreases
  description: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'LIMNOLOGIST' | 'OPERATOR' | 'FIELD_TECH' | 'AUDITOR';
  organization: string;
  permissions: string[];
  avatar: string;
  mfaEnabled: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  lastLogin: string;
}

export interface SystemArchitectureSpec {
  layers: {
    name: string;
    technologies: string[];
    description: string;
  }[];
}
