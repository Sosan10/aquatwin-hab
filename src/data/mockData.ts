import { WaterBasin, IoTBuoy, ActuatorDevice, MLPrediction, AnomalyEvent, SHAPFeatureContribution, UserProfile, SpectralLayerConfig } from '../types';

export const WATER_BASINS: WaterBasin[] = [
  {
    id: 'basin-fcr',
    name: 'Falling Creek Reservoir (FCR)',
    location: 'Vinton, Virginia',
    country: 'EE. UU.',
    lat: 37.3033,
    lng: -79.8375,
    surfaceAreaKm2: 0.119,
    maxDepthMeters: 9.3,
    avgDepthMeters: 4.0,
    volumeMcm: 0.31,
    trophicStatus: 'Eutrophic',
    primaryUse: 'Drinking Water',
    currentRisk: 'HIGH',
    chlorophyllAvg: 24.8,
    phycocyaninAvg: 28500,
    waterTempAvg: 21.4,
    dissolvedOxygenAvg: 6.8,
    lastSatellitePass: 'Hoy 10:14 UTC (Sentinel-2 MSI Level-2A)',
    satelliteSensor: 'Sentinel-2 MSI'
  },
  {
    id: 'basin-san-roque',
    name: 'Embalse San Roque',
    location: 'Valle de Punilla, Córdoba',
    country: 'Argentina',
    lat: -31.3789,
    lng: -64.4623,
    surfaceAreaKm2: 35.0,
    maxDepthMeters: 35.3,
    avgDepthMeters: 13.5,
    volumeMcm: 201.0,
    trophicStatus: 'Hypereutrophic',
    primaryUse: 'Drinking Water',
    currentRisk: 'HIGH',
    chlorophyllAvg: 58.4,
    phycocyaninAvg: 48200,
    waterTempAvg: 24.8,
    dissolvedOxygenAvg: 4.2,
    lastSatellitePass: 'Hoy 10:14 UTC (Sentinel-2 MSI Level-2A)',
    satelliteSensor: 'Sentinel-2 MSI'
  },
  {
    id: 'basin-titicaca-puno',
    name: 'Bahía Interior de Puno (Lago Titicaca)',
    location: 'Puno',
    country: 'Perú',
    lat: -15.8291,
    lng: -70.0154,
    surfaceAreaKm2: 17.5,
    maxDepthMeters: 9.2,
    avgDepthMeters: 4.8,
    volumeMcm: 84.0,
    trophicStatus: 'Eutrophic',
    primaryUse: 'Aquaculture / Ecology',
    currentRisk: 'CRITICAL',
    chlorophyllAvg: 74.2,
    phycocyaninAvg: 89000,
    waterTempAvg: 16.2,
    dissolvedOxygenAvg: 2.8,
    lastSatellitePass: 'Ayer 15:30 UTC (Landsat-9 OLI-2)',
    satelliteSensor: 'Landsat-9 OLI-2'
  },
  {
    id: 'basin-paso-piedras',
    name: 'Embalse Paso de las Piedras',
    location: 'Bahía Blanca, Buenos Aires',
    country: 'Argentina',
    lat: -38.3750,
    lng: -61.8083,
    surfaceAreaKm2: 40.0,
    maxDepthMeters: 28.0,
    avgDepthMeters: 11.2,
    volumeMcm: 320.0,
    trophicStatus: 'Mesotrophic',
    primaryUse: 'Drinking Water',
    currentRisk: 'MODERATE',
    chlorophyllAvg: 22.1,
    phycocyaninAvg: 12500,
    waterTempAvg: 21.4,
    dissolvedOxygenAvg: 7.6,
    lastSatellitePass: 'Hace 4h (Sentinel-3 OLCI)',
    satelliteSensor: 'Sentinel-3 OLCI'
  }
];

export const SPECTRAL_LAYERS: SpectralLayerConfig[] = [
  {
    id: 'CHLOROPHYLL_A',
    name: 'Clorofila-a (Chl-a)',
    unit: 'µg/L',
    min: 0,
    max: 120,
    colorScale: ['#02384d', '#0d9488', '#10b981', '#22c55e', '#84cc16', '#a3e635', '#eab308'],
    description: 'Estimación bio-óptica de biomasa fitoplanctónica calculada con el algoritmo OC2/OC3 sobre bandas B4 (Red) y B5 (Red Edge) de Sentinel-2.',
    thresholdWarning: 25.0,
    thresholdCritical: 50.0
  },
  {
    id: 'NDCI',
    name: 'Índice NDCI (Normal Difference Chlorophyll)',
    unit: 'adimensional (-1 a 1)',
    min: -0.2,
    max: 0.8,
    colorScale: ['#061a29', '#0284c7', '#059669', '#10b981', '#84cc16', '#a3e635', '#eab308'],
    description: 'Índice normalizado (B5 - B4) / (B5 + B4) optimizado para aguas turbias continentales y detección de floraciones algales.',
    thresholdWarning: 0.15,
    thresholdCritical: 0.35
  },
  {
    id: 'PHYCOCYANIN',
    name: 'Ficocianina (Biomarcador Cianobacterias)',
    unit: 'células/mL',
    min: 0,
    max: 120000,
    colorScale: ['#042f2e', '#0891b2', '#06b6d4', '#10b981', '#22c55e', '#84cc16', '#eab308'],
    description: 'Pigmento fluorescente accesorio exclusivo de cianobacterias (Microcystis, Dolichospermum). Alerta directa de riesgo de cianotoxinas.',
    thresholdWarning: 20000,
    thresholdCritical: 50000
  },
  {
    id: 'SST_TEMPERATURE',
    name: 'Temperatura Superficial del Agua (SST)',
    unit: '°C',
    min: 14,
    max: 32,
    colorScale: ['#313695', '#4575b4', '#74add1', '#fee090', '#f46d43', '#a50026'],
    description: 'Canales térmicos infrarrojos (TIRS Landsat / SLSTR Sentinel-3). Las temperaturas >23°C disparan la tasa de división celular de cianobacterias.',
    thresholdWarning: 24.0,
    thresholdCritical: 28.0
  },
  {
    id: 'DISSOLVED_O2',
    name: 'Oxígeno Disuelto Superficial (OD)',
    unit: 'mg/L',
    min: 0,
    max: 14,
    colorScale: ['#67001f', '#b2182b', '#d6604d', '#92c5de', '#4393c3', '#2166ac'],
    description: 'Correlación óptica y datos IoT interpolados. Valores <4.0 mg/L indican hipoxia crítica y colapso de biomasa en descomposición.',
    thresholdWarning: 5.0,
    thresholdCritical: 3.0
  },
  {
    id: 'BATHYMETRY',
    name: 'Relieve Batimétrico 3D (DEM Subacuático)',
    unit: 'metros',
    min: -35,
    max: 0,
    colorScale: ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef'],
    description: 'Malla batimétrica obtenida por ecosonda multihaz y levantamiento topográfico de la cuenca, delimitando zonas de acumulación de sedimentos y termoclina.',
    thresholdWarning: -10,
    thresholdCritical: -5
  }
];

export const BUOYS_BY_BASIN: Record<string, IoTBuoy[]> = {
  'basin-fcr': [
    {
      id: 'buoy-fcr-50',
      name: 'Boya FCR Station 50 - Deep Hole (Toma)',
      code: 'FCR-IOT-50',
      lat: 37.3033,
      lng: -79.8375,
      gridX: 2.2,
      gridZ: 2.0,
      depthMeters: 9.3,
      status: 'ALERT',
      batteryLevel: 94,
      lastPing: 'Hace 45s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 21.4,
        tempDepth: 14.2,
        ph: 7.8,
        dissolvedOxygen: 6.8,
        dissolvedOxygenSat: 74,
        turbidity: 18.6,
        chlorophyllA: 24.8,
        phycocyanin: 28200,
        totalNitrogen: 0.85,
        totalPhosphorus: 0.05,
        nitrate: 0.22,
        phosphate: 0.015,
        solarRadiationPAR: 1250,
        windSpeed: 3.2,
        windDirection: 'SSE'
      }
    },
    {
      id: 'buoy-fcr-20',
      name: 'Boya FCR Station 20 - Zona Eutrófica Somera',
      code: 'FCR-IOT-20',
      lat: 37.3075,
      lng: -79.8410,
      gridX: -2.5,
      gridZ: -1.0,
      depthMeters: 5.4,
      status: 'ALERT',
      batteryLevel: 88,
      lastPing: 'Hace 12s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 27.8,
        tempDepth: 24.1,
        ph: 9.6,
        dissolvedOxygen: 14.8,
        dissolvedOxygenSat: 185,
        turbidity: 62.0,
        chlorophyllA: 112.5,
        phycocyanin: 98000,
        totalNitrogen: 5.2,
        totalPhosphorus: 0.54,
        nitrate: 2.7,
        phosphate: 0.34,
        solarRadiationPAR: 1620,
        windSpeed: 2.1,
        windDirection: 'CALMA'
      }
    },
    {
      id: 'buoy-fcr-cw',
      name: 'Boya FCR Catwalk - Entrada Afluente',
      code: 'FCR-IOT-CW',
      lat: 37.3110,
      lng: -79.8450,
      gridX: 0.5,
      gridZ: -5.5,
      depthMeters: 2.8,
      status: 'WARNING',
      batteryLevel: 98,
      lastPing: 'Hace 30s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 19.5,
        tempDepth: 18.1,
        ph: 7.3,
        dissolvedOxygen: 7.8,
        dissolvedOxygenSat: 88,
        turbidity: 14.0,
        chlorophyllA: 14.2,
        phycocyanin: 12500,
        totalNitrogen: 0.65,
        totalPhosphorus: 0.03,
        nitrate: 0.18,
        phosphate: 0.009,
        solarRadiationPAR: 1150,
        windSpeed: 3.8,
        windDirection: 'NW'
      }
    },
    {
      id: 'buoy-fcr-30',
      name: 'Boya FCR Station 30 - Intermedia',
      code: 'FCR-IOT-30',
      lat: 37.3050,
      lng: -79.8390,
      gridX: 1.5,
      gridZ: -0.5,
      depthMeters: 7.2,
      status: 'WARNING',
      batteryLevel: 91,
      lastPing: 'Hace 1m (MQTT QoS 1)',
      telemetry: {
        tempSurface: 24.9,
        tempDepth: 17.8,
        ph: 8.7,
        dissolvedOxygen: 5.1,
        dissolvedOxygenSat: 61,
        turbidity: 26.5,
        chlorophyllA: 42.1,
        phycocyanin: 31000,
        totalNitrogen: 2.9,
        totalPhosphorus: 0.22,
        nitrate: 1.4,
        phosphate: 0.11,
        solarRadiationPAR: 1410,
        windSpeed: 5.0,
        windDirection: 'SE'
      }
    }
  ],
  'basin-san-roque': [
    {
      id: 'buoy-sr-01',
      name: 'Boya SR-01 - Bahía San Antonio (Crítica)',
      code: 'SR-IOT-01',
      lat: -31.4250,
      lng: -64.4980,
      gridX: -4.2,
      gridZ: 3.2,
      depthMeters: 12.0,
      status: 'ALERT',
      batteryLevel: 92,
      lastPing: 'Hace 20s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 26.8,
        tempDepth: 18.2,
        ph: 9.4,
        dissolvedOxygen: 13.5,
        dissolvedOxygenSat: 172,
        turbidity: 58.0,
        chlorophyllA: 118.0,
        phycocyanin: 95000,
        totalNitrogen: 4.8,
        totalPhosphorus: 0.48,
        nitrate: 2.4,
        phosphate: 0.29,
        solarRadiationPAR: 1580,
        windSpeed: 4.2,
        windDirection: 'S'
      }
    },
    {
      id: 'buoy-sr-02',
      name: 'Boya SR-02 - Garganta y Presa El Embudo',
      code: 'SR-IOT-02',
      lat: -31.3789,
      lng: -64.4623,
      gridX: 4.2,
      gridZ: 0.2,
      depthMeters: 35.3,
      status: 'ALERT',
      batteryLevel: 89,
      lastPing: 'Hace 50s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 23.8,
        tempDepth: 14.0,
        ph: 8.3,
        dissolvedOxygen: 5.2,
        dissolvedOxygenSat: 63,
        turbidity: 24.0,
        chlorophyllA: 54.2,
        phycocyanin: 46000,
        totalNitrogen: 2.6,
        totalPhosphorus: 0.19,
        nitrate: 1.2,
        phosphate: 0.08,
        solarRadiationPAR: 1390,
        windSpeed: 6.1,
        windDirection: 'SSE'
      }
    },
    {
      id: 'buoy-sr-03',
      name: 'Boya SR-03 - Desembocadura Río Cosquín',
      code: 'SR-IOT-03',
      lat: -31.3520,
      lng: -64.4850,
      gridX: -4.0,
      gridZ: -3.5,
      depthMeters: 8.5,
      status: 'WARNING',
      batteryLevel: 96,
      lastPing: 'Hace 15s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 22.1,
        tempDepth: 19.5,
        ph: 7.6,
        dissolvedOxygen: 7.2,
        dissolvedOxygenSat: 84,
        turbidity: 32.0,
        chlorophyllA: 38.5,
        phycocyanin: 32000,
        totalNitrogen: 1.8,
        totalPhosphorus: 0.12,
        nitrate: 0.85,
        phosphate: 0.04,
        solarRadiationPAR: 1240,
        windSpeed: 5.5,
        windDirection: 'NW'
      }
    },
    {
      id: 'buoy-sr-04',
      name: 'Boya SR-04 - Centro del Embalse (Pelágica)',
      code: 'SR-IOT-04',
      lat: -31.3900,
      lng: -64.4750,
      gridX: 0.0,
      gridZ: 0.0,
      depthMeters: 22.0,
      status: 'WARNING',
      batteryLevel: 93,
      lastPing: 'Hace 1m (MQTT QoS 1)',
      telemetry: {
        tempSurface: 24.2,
        tempDepth: 16.5,
        ph: 8.1,
        dissolvedOxygen: 6.4,
        dissolvedOxygenSat: 76,
        turbidity: 21.0,
        chlorophyllA: 42.0,
        phycocyanin: 38000,
        totalNitrogen: 2.1,
        totalPhosphorus: 0.15,
        nitrate: 0.95,
        phosphate: 0.06,
        solarRadiationPAR: 1450,
        windSpeed: 5.0,
        windDirection: 'S'
      }
    }
  ],
  'basin-titicaca-puno': [
    {
      id: 'buoy-puno-01',
      name: 'Boya Puno-01 - Desembocadura Río Seco (Crítica)',
      code: 'PUN-IOT-01',
      lat: -15.8291,
      lng: -70.0154,
      gridX: -3.8,
      gridZ: 1.5,
      depthMeters: 5.2,
      status: 'ALERT',
      batteryLevel: 87,
      lastPing: 'Hace 10s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 17.5,
        tempDepth: 14.8,
        ph: 9.8,
        dissolvedOxygen: 2.1, // Hipoxia severa por floración masiva
        dissolvedOxygenSat: 24,
        turbidity: 78.0,
        chlorophyllA: 148.0,
        phycocyanin: 135000,
        totalNitrogen: 7.4,
        totalPhosphorus: 0.72,
        nitrate: 3.8,
        phosphate: 0.46,
        solarRadiationPAR: 1980,
        windSpeed: 6.8,
        windDirection: 'NE'
      }
    },
    {
      id: 'buoy-puno-02',
      name: 'Boya Puno-02 - Isla Esteves / Zona Oriental',
      code: 'PUN-IOT-02',
      lat: -15.8220,
      lng: -69.9950,
      gridX: 2.8,
      gridZ: -1.2,
      depthMeters: 8.5,
      status: 'WARNING',
      batteryLevel: 94,
      lastPing: 'Hace 35s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 15.8,
        tempDepth: 13.9,
        ph: 8.4,
        dissolvedOxygen: 4.8,
        dissolvedOxygenSat: 55,
        turbidity: 34.0,
        chlorophyllA: 52.0,
        phycocyanin: 62000,
        totalNitrogen: 3.2,
        totalPhosphorus: 0.28,
        nitrate: 1.6,
        phosphate: 0.12,
        solarRadiationPAR: 1850,
        windSpeed: 8.5,
        windDirection: 'ENE'
      }
    },
    {
      id: 'buoy-puno-03',
      name: 'Boya Puno-03 - Muelle Turístico / Malecón',
      code: 'PUN-IOT-03',
      lat: -15.8350,
      lng: -70.0210,
      gridX: -1.8,
      gridZ: 3.8,
      depthMeters: 4.8,
      status: 'ALERT',
      batteryLevel: 90,
      lastPing: 'Hace 25s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 16.9,
        tempDepth: 15.1,
        ph: 9.1,
        dissolvedOxygen: 3.2,
        dissolvedOxygenSat: 38,
        turbidity: 65.0,
        chlorophyllA: 96.0,
        phycocyanin: 88000,
        totalNitrogen: 5.6,
        totalPhosphorus: 0.51,
        nitrate: 2.8,
        phosphate: 0.31,
        solarRadiationPAR: 1920,
        windSpeed: 5.2,
        windDirection: 'NNE'
      }
    },
    {
      id: 'buoy-puno-04',
      name: 'Boya Puno-04 - Estrecho Salida a Lago Mayor',
      code: 'PUN-IOT-04',
      lat: -15.8150,
      lng: -69.9750,
      gridX: 4.5,
      gridZ: -3.2,
      depthMeters: 9.2,
      status: 'ONLINE',
      batteryLevel: 97,
      lastPing: 'Hace 55s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 14.8,
        tempDepth: 13.5,
        ph: 7.9,
        dissolvedOxygen: 6.9,
        dissolvedOxygenSat: 78,
        turbidity: 16.0,
        chlorophyllA: 22.4,
        phycocyanin: 18000,
        totalNitrogen: 1.4,
        totalPhosphorus: 0.08,
        nitrate: 0.55,
        phosphate: 0.03,
        solarRadiationPAR: 1790,
        windSpeed: 9.2,
        windDirection: 'E'
      }
    }
  ],
  'basin-paso-piedras': [
    {
      id: 'buoy-pdp-01',
      name: 'Boya PDP-01 - Torre de Toma de Agua',
      code: 'PDP-IOT-01',
      lat: -38.3750,
      lng: -61.8083,
      gridX: 4.5,
      gridZ: 0.5,
      depthMeters: 28.0,
      status: 'WARNING',
      batteryLevel: 95,
      lastPing: 'Hace 40s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 21.2,
        tempDepth: 16.4,
        ph: 8.0,
        dissolvedOxygen: 7.4,
        dissolvedOxygenSat: 85,
        turbidity: 20.0,
        chlorophyllA: 24.5,
        phycocyanin: 14000,
        totalNitrogen: 1.2,
        totalPhosphorus: 0.07,
        nitrate: 0.42,
        phosphate: 0.02,
        solarRadiationPAR: 1400,
        windSpeed: 24.6,
        windDirection: 'WNW'
      }
    },
    {
      id: 'buoy-pdp-02',
      name: 'Boya PDP-02 - Afluente Río Sauce Grande',
      code: 'PDP-IOT-02',
      lat: -38.3680,
      lng: -61.8450,
      gridX: -4.8,
      gridZ: -0.8,
      depthMeters: 6.5,
      status: 'ONLINE',
      batteryLevel: 98,
      lastPing: 'Hace 20s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 20.5,
        tempDepth: 19.8,
        ph: 7.7,
        dissolvedOxygen: 8.1,
        dissolvedOxygenSat: 92,
        turbidity: 28.0,
        chlorophyllA: 16.2,
        phycocyanin: 8500,
        totalNitrogen: 0.95,
        totalPhosphorus: 0.04,
        nitrate: 0.31,
        phosphate: 0.015,
        solarRadiationPAR: 1320,
        windSpeed: 22.0,
        windDirection: 'W'
      }
    },
    {
      id: 'buoy-pdp-03',
      name: 'Boya PDP-03 - Brazo Norte Somero (Sotavento)',
      code: 'PDP-IOT-03',
      lat: -38.3620,
      lng: -61.8150,
      gridX: -0.5,
      gridZ: -3.5,
      depthMeters: 10.2,
      status: 'ALERT',
      batteryLevel: 91,
      lastPing: 'Hace 15s (MQTT QoS 1)',
      telemetry: {
        tempSurface: 23.4,
        tempDepth: 18.0,
        ph: 8.6,
        dissolvedOxygen: 9.8,
        dissolvedOxygenSat: 115,
        turbidity: 36.0,
        chlorophyllA: 38.0,
        phycocyanin: 22500,
        totalNitrogen: 2.1,
        totalPhosphorus: 0.16,
        nitrate: 0.78,
        phosphate: 0.05,
        solarRadiationPAR: 1480,
        windSpeed: 26.5,
        windDirection: 'WNW'
      }
    },
    {
      id: 'buoy-pdp-04',
      name: 'Boya PDP-04 - Brazo Sur / Zona Pelágica',
      code: 'PDP-IOT-04',
      lat: -38.3820,
      lng: -61.8120,
      gridX: 1.0,
      gridZ: 2.2,
      depthMeters: 18.0,
      status: 'ONLINE',
      batteryLevel: 94,
      lastPing: 'Hace 1m (MQTT QoS 1)',
      telemetry: {
        tempSurface: 21.0,
        tempDepth: 16.8,
        ph: 7.9,
        dissolvedOxygen: 7.8,
        dissolvedOxygenSat: 89,
        turbidity: 18.0,
        chlorophyllA: 18.0,
        phycocyanin: 10200,
        totalNitrogen: 1.1,
        totalPhosphorus: 0.05,
        nitrate: 0.38,
        phosphate: 0.018,
        solarRadiationPAR: 1390,
        windSpeed: 23.8,
        windDirection: 'W'
      }
    }
  ]
};

export const ACTUATORS_BY_BASIN: Record<string, ActuatorDevice[]> = {
  'basin-fcr': [
    {
      id: 'act-fcr-01',
      name: 'Sistema de Aireación Hipolimnética HOx (Deep Hole)',
      type: 'AERATOR',
      gridX: 2.2,
      gridZ: 2.0,
      status: 'ACTIVE',
      powerLevel: 85,
      lastCommandTimestamp: '2026-08-26 08:30:00',
      controlledBy: 'AI Auto-Mitigation Engine'
    },
    {
      id: 'act-fcr-02',
      name: 'Emisor Ultrasónico Bioacústico U-1 (Station 20)',
      type: 'ULTRASONIC',
      gridX: -2.5,
      gridZ: -1.0,
      status: 'ACTIVE',
      powerLevel: 90,
      ultrasonicFreqKhz: 28.5,
      lastCommandTimestamp: '2026-08-26 09:00:15',
      controlledBy: 'Ing. M. Benítez (Operador)'
    },
    {
      id: 'act-fcr-03',
      name: 'Vertedero de Fondo y Compuerta Ecológica',
      type: 'FLOW_GATE',
      gridX: 3.5,
      gridZ: 3.0,
      status: 'IDLE',
      powerLevel: 30,
      flowRateM3s: 2.4,
      lastCommandTimestamp: '2026-08-25 18:00:00',
      controlledBy: 'Sistema Hidráulico Central'
    }
  ],
  'basin-san-roque': [
    {
      id: 'act-sr-01',
      name: 'Aireador SolarMixer Bahía San Antonio',
      type: 'AERATOR',
      gridX: -4.2,
      gridZ: 3.2,
      status: 'ACTIVE',
      powerLevel: 95,
      lastCommandTimestamp: '2026-08-26 08:30:00',
      controlledBy: 'AI Auto-Mitigation Engine'
    },
    {
      id: 'act-sr-02',
      name: 'Emisor Ultrasónico Garganta Presa',
      type: 'ULTRASONIC',
      gridX: 3.8,
      gridZ: 0.2,
      status: 'ACTIVE',
      powerLevel: 100,
      ultrasonicFreqKhz: 32.0,
      lastCommandTimestamp: '2026-08-26 09:00:15',
      controlledBy: 'Ing. M. Benítez (Operador)'
    },
    {
      id: 'act-sr-03',
      name: 'Compuerta de Desfogue El Embudo',
      type: 'FLOW_GATE',
      gridX: 5.0,
      gridZ: 0.0,
      status: 'IDLE',
      powerLevel: 45,
      flowRateM3s: 14.5,
      lastCommandTimestamp: '2026-08-25 18:00:00',
      controlledBy: 'Sistema Hidráulico Central'
    }
  ],
  'basin-titicaca-puno': [
    {
      id: 'act-puno-01',
      name: 'Biofiltro de Totorales Flotantes Río Seco',
      type: 'AERATOR',
      gridX: -3.8,
      gridZ: 1.5,
      status: 'ACTIVE',
      powerLevel: 75,
      lastCommandTimestamp: '2026-08-26 07:15:00',
      controlledBy: 'Comité Ambiental Lago Titicaca'
    },
    {
      id: 'act-puno-02',
      name: 'Dispersor Ultrasónico Muelle Puno',
      type: 'ULTRASONIC',
      gridX: -1.8,
      gridZ: 3.8,
      status: 'ACTIVE',
      powerLevel: 80,
      ultrasonicFreqKhz: 29.0,
      lastCommandTimestamp: '2026-08-26 08:45:00',
      controlledBy: 'Operador Puno'
    },
    {
      id: 'act-puno-03',
      name: 'Barrera de Contención Flotante Canal Mayor',
      type: 'FLOW_GATE',
      gridX: 4.5,
      gridZ: -3.2,
      status: 'IDLE',
      powerLevel: 20,
      flowRateM3s: 8.0,
      lastCommandTimestamp: '2026-08-25 12:00:00',
      controlledBy: 'PELT Autoridad Binacional'
    }
  ],
  'basin-paso-piedras': [
    {
      id: 'act-pdp-01',
      name: 'Difusor Aireación Torre de Toma',
      type: 'AERATOR',
      gridX: 4.5,
      gridZ: 0.5,
      status: 'ACTIVE',
      powerLevel: 80,
      lastCommandTimestamp: '2026-08-26 06:00:00',
      controlledBy: 'ABSA Planta Potabilizadora'
    },
    {
      id: 'act-pdp-02',
      name: 'Transductor Ultrasónico Brazo Norte',
      type: 'ULTRASONIC',
      gridX: -0.5,
      gridZ: -3.5,
      status: 'ACTIVE',
      powerLevel: 85,
      ultrasonicFreqKhz: 30.5,
      lastCommandTimestamp: '2026-08-26 09:10:00',
      controlledBy: 'Ing. M. Benítez'
    },
    {
      id: 'act-pdp-03',
      name: 'Válvula Reguladora Vertedero Central',
      type: 'FLOW_GATE',
      gridX: 5.2,
      gridZ: 1.0,
      status: 'IDLE',
      powerLevel: 40,
      flowRateM3s: 6.2,
      lastCommandTimestamp: '2026-08-25 20:00:00',
      controlledBy: 'Control Hidráulico ABSA'
    }
  ]
};

export function getBuoysForBasin(basinId: string): IoTBuoy[] {
  return BUOYS_BY_BASIN[basinId] || BUOYS_BY_BASIN['basin-fcr'];
}

export function getActuatorsForBasin(basinId: string): ActuatorDevice[] {
  return ACTUATORS_BY_BASIN[basinId] || ACTUATORS_BY_BASIN['basin-fcr'];
}

export const IOT_BUOYS: IoTBuoy[] = BUOYS_BY_BASIN['basin-fcr'];

export const ACTUATORS: ActuatorDevice[] = ACTUATORS_BY_BASIN['basin-fcr'];

export const ML_FORECASTS: MLPrediction[] = [
  {
    timestamp: 'Hoy +6h',
    hoursAhead: 6,
    predictedChlorophyll: 62.4,
    confidenceMin: 57.1,
    confidenceMax: 68.2,
    predictedPhycocyanin: 52000,
    bloomProbability: 82,
    riskLevel: 'HIGH',
    dominantTaxa: 'Microcystis aeruginosa',
    estimatedMicrocystinUgL: 14.2
  },
  {
    timestamp: 'Hoy +12h',
    hoursAhead: 12,
    predictedChlorophyll: 71.8,
    confidenceMin: 64.0,
    confidenceMax: 79.5,
    predictedPhycocyanin: 64000,
    bloomProbability: 89,
    riskLevel: 'HIGH',
    dominantTaxa: 'Microcystis aeruginosa',
    estimatedMicrocystinUgL: 18.5
  },
  {
    timestamp: 'Mañana +24h',
    hoursAhead: 24,
    predictedChlorophyll: 86.3,
    confidenceMin: 76.5,
    confidenceMax: 96.0,
    predictedPhycocyanin: 79500,
    bloomProbability: 95,
    riskLevel: 'CRITICAL',
    dominantTaxa: 'Microcystis aeruginosa',
    estimatedMicrocystinUgL: 26.8
  },
  {
    timestamp: 'Día +2 (+48h)',
    hoursAhead: 48,
    predictedChlorophyll: 104.0,
    confidenceMin: 90.2,
    confidenceMax: 118.5,
    predictedPhycocyanin: 96000,
    bloomProbability: 98,
    riskLevel: 'CRITICAL',
    dominantTaxa: 'Microcystis aeruginosa',
    estimatedMicrocystinUgL: 34.1
  },
  {
    timestamp: 'Día +3 (+72h)',
    hoursAhead: 72,
    predictedChlorophyll: 112.5,
    confidenceMin: 95.0,
    confidenceMax: 130.0,
    predictedPhycocyanin: 105000,
    bloomProbability: 99,
    riskLevel: 'CRITICAL',
    dominantTaxa: 'Microcystis aeruginosa',
    estimatedMicrocystinUgL: 39.5
  },
  {
    timestamp: 'Día +5 (+120h)',
    hoursAhead: 120,
    predictedChlorophyll: 98.2,
    confidenceMin: 80.0,
    confidenceMax: 119.0,
    predictedPhycocyanin: 88000,
    bloomProbability: 91,
    riskLevel: 'HIGH',
    dominantTaxa: 'Dolichospermum flos-aquae',
    estimatedMicrocystinUgL: 29.0
  },
  {
    timestamp: 'Día +7 (+168h)',
    hoursAhead: 168,
    predictedChlorophyll: 76.0,
    confidenceMin: 58.0,
    confidenceMax: 97.0,
    predictedPhycocyanin: 62000,
    bloomProbability: 78,
    riskLevel: 'HIGH',
    dominantTaxa: 'Dolichospermum flos-aquae',
    estimatedMicrocystinUgL: 19.4
  }
];

export const ANOMALIES: AnomalyEvent[] = [
  {
    id: 'anom-01',
    timestamp: '2026-08-26 08:42 UTC',
    severity: 'CRITICAL',
    type: 'RAPID_BIOMASS_DOUBLING',
    location: 'Bahía San Antonio (Sector Sur)',
    buoyId: 'buoy-02',
    description: 'Incremento anómalo de Clorofila-a (+45 µg/L en 3h) detectado por fusión sensor-satélite con reflectancia B5/B4 anormal.',
    anomalyScore: 0.94,
    suggestedAction: 'Desplegar cortina de microburbujas y activar emisores de ultrasonido a 28 kHz.',
    resolved: false
  },
  {
    id: 'anom-02',
    timestamp: '2026-08-26 05:15 UTC',
    severity: 'HIGH',
    type: 'NOCTURNAL_HYPOXIA',
    location: 'Zona de Garganta Central',
    buoyId: 'buoy-01',
    description: 'Caída de Oxígeno Disuelto a 1.8 mg/L a las 05:00 am por alta respiración nocturna de fitoplancton denso.',
    anomalyScore: 0.87,
    suggestedAction: 'Encender aireador hipolimnético al 100% de potencia para evitar mortandad de peces.',
    resolved: true
  },
  {
    id: 'anom-03',
    timestamp: '2026-08-25 19:30 UTC',
    severity: 'MEDIUM',
    type: 'NUTRIENT_SURGE',
    location: 'Afluente Río San Antonio',
    buoyId: 'buoy-02',
    description: 'Pico de Fósforo Reactivo Soluble (PO4 > 0.35 mg/L) correlacionado con vertido o escorrentía agrícola post-tormenta.',
    anomalyScore: 0.76,
    suggestedAction: 'Notificar a policía ambiental e iniciar dosificación de sales de aluminio coagulantes.',
    resolved: false
  }
];

export const SHAP_CONTRIBUTIONS: SHAPFeatureContribution[] = [
  {
    feature: 'surface_temp_sst',
    displayName: 'Temperatura Superficial del Agua (27.8°C)',
    value: '+27.8 °C',
    impactScore: +0.38,
    description: 'Condición térmica óptima que maximiza la tasa fotosintética de Microcystis frente a diatomeas.'
  },
  {
    feature: 'phosphorus_total',
    displayName: 'Fósforo Total en Columna (0.54 mg/L)',
    value: '0.54 mg/L',
    impactScore: +0.32,
    description: 'Relación N:P = 9.6 (<16 Redfield Ratio), favoreciendo dominancia absoluta de cianobacterias fijadoras y no fijadoras.'
  },
  {
    feature: 'wind_speed_stagnation',
    displayName: 'Velocidad de Viento / Estancamiento (2.1 km/h)',
    value: '2.1 km/h',
    impactScore: +0.22,
    description: 'Viento casi nulo inhibe la mezcla vertical turbulenta y permite flotación por vesículas de gas hacia la superficie.'
  },
  {
    feature: 'solar_radiation_par',
    displayName: 'Radiación Fotosintéticamente Activa (PAR)',
    value: '1620 µmol/m²s',
    impactScore: +0.14,
    description: 'Alta insolación estival diurna acelera la síntesis de pigmentos y biomasa.'
  },
  {
    feature: 'hypolimnetic_aeration',
    displayName: 'Mitigación: Aireador Central Activo',
    value: '85% Potencia',
    impactScore: -0.18,
    description: 'La inyección forzada de oxígeno en profundidad reduce la tasa neta de anoxia y desestabiliza la estratificación térmica.'
  }
];

export const RBAC_USERS: UserProfile[] = [
  {
    id: 'usr-01',
    name: 'Dra. Elena Albarracín',
    email: 'elena.albarracin@limnologia-gob.ar',
    role: 'LIMNOLOGIST',
    organization: 'Instituto Nacional del Agua (INA) / CONICET',
    permissions: ['VIEW_3D_TWIN', 'RUN_ML_SIMULATION', 'EXPORT_SCIENTIFIC_REPORTS', 'CONFIGURE_SPECTRAL_BANDS', 'VALIDATE_TOXIN_DATA'],
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    mfaEnabled: true,
    status: 'ACTIVE',
    lastLogin: 'Hace 10 min'
  },
  {
    id: 'usr-02',
    name: 'Ing. Martín Benítez',
    email: 'mbenitez@aguascordobesas.com.ar',
    role: 'OPERATOR',
    organization: 'Planta Potabilizadora Los Molinos / San Roque',
    permissions: ['VIEW_3D_TWIN', 'CONTROL_IOT_ACTUATORS', 'ADJUST_DOSING_RATES', 'TRIGGER_EMERGENCY_ALERTS', 'VIEW_TELEMETRY'],
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80',
    mfaEnabled: true,
    status: 'ACTIVE',
    lastLogin: 'En línea'
  },
  {
    id: 'usr-03',
    name: 'Arq. Arisbeth Solórzano',
    email: 'ysolorzano@unitru.edu.pe',
    role: 'ADMIN',
    organization: 'Cátedra de Arquitectura de Gemelos Digitales 3D',
    permissions: ['ALL_PERMISSIONS', 'MANAGE_USERS', 'MANAGE_MODELS', 'DEPLOY_DOCKER_NODES', 'OVERRIDE_SECURITY', 'EDIT_ARCHITECTURE'],
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    mfaEnabled: true,
    status: 'ACTIVE',
    lastLogin: 'Sesión actual'
  },
  {
    id: 'usr-04',
    name: 'Lic. Rodrigo Carballo',
    email: 'rcarballo@guardaparques.gob.ar',
    role: 'FIELD_TECH',
    organization: 'Cuerpo Especial de Policía Ambiental y Guardaparques',
    permissions: ['VIEW_3D_TWIN', 'LOG_FIELD_SAMPLES', 'ACKNOWLEDGE_LOCAL_ALERTS', 'UPLOAD_DRONE_ORTHOMOSAIC'],
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    mfaEnabled: false,
    status: 'ACTIVE',
    lastLogin: 'Ayer 18:20'
  },
  {
    id: 'usr-05',
    name: 'Dra. Claudia Varela',
    email: 'cvarela@ops-oms.org',
    role: 'AUDITOR',
    organization: 'Organización Panamericana de la Salud (OPS/OMS)',
    permissions: ['VIEW_3D_TWIN', 'VIEW_EPIDEMIOLOGY_RISK', 'EXPORT_OFFICIAL_AUDIT_PDF', 'READ_ONLY_ACCESS'],
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    mfaEnabled: true,
    status: 'ACTIVE',
    lastLogin: 'Hace 3 días'
  }
];
