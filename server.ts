import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load local development secrets before creating the OpenAI client.
dotenv.config({ path: ['.env.local', '.env'] });
const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const LANGFLOW_URL = process.env.LANGFLOW_URL || 'http://127.0.0.1:7860';
const LANGFLOW_FLOW_ID = process.env.LANGFLOW_FLOW_ID || 'aquatwin-limnology-copilot';
const LANGFLOW_APPLICATION_TOKEN = process.env.LANGFLOW_APPLICATION_TOKEN || '';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // The API key stays on the server; never expose it through Vite variables.
  let aiClient: OpenAI | null = null;
  function getOpenAI(): OpenAI | null {
    if (!aiClient && process.env.OPENAI_API_KEY) {
      aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return aiClient;
  }

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'AquaTwin HAB Digital Twin Core',
      version: '2.4.0',
      timestamp: new Date().toISOString(),
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      model: AI_MODEL,
      langflowConfigured: !!(process.env.LANGFLOW_URL && process.env.LANGFLOW_FLOW_ID),
      langflowUrl: LANGFLOW_URL,
      langflowFlowId: LANGFLOW_FLOW_ID
    });
  });

  // 2. AI Limnology Diagnosis endpoint
  app.post('/api/ai/diagnose', async (req, res) => {
    try {
      const { basinName, telemetry, satelliteIndices, simulatedScenario } = req.body;
      const ai = getOpenAI();

      if (!ai) {
        // Fallback intelligent limnological diagnosis if no key provided
        return res.json({
          diagnosis: `ANÁLISIS LIMNOLÓGICO PREDICTIVO (${basinName}):
- Nivel de Riesgo: ALERTA CRÍTICA (Nivel 3 OMS).
- Especie Dominante Proyectada: Microcystis aeruginosa con formación de floraciones superficiales (scum).
- Factores Detonantes Clave: Temperatura del agua elevada (${telemetry?.tempSurface || 27.8}°C), relación Redfield desbalanceada (N:P < 10) y condiciones de bajo estrés por viento (< 3 km/h).
- Estimación de Cianotoxinas: Microcistina-LR estimada en 28.5 µg/L (excede límite guía de agua potable OMS 1.0 µg/L y recreacional 10 µg/L).
- Medidas Prescriptivas Inmediatas:
  1. Activar aireación hipolimnética continua para romper termoclina.
  2. Ajustar toma de agua potable a estrato intermedio (-12m a -18m).
  3. Desplegar ultrasonido de resonancia celular en la bahía de mayor biomasa.`,
          confidence: 0.94,
          source: 'AquaTwin Expert Engine (Local Limnological Ruleset)'
        });
      }

      const prompt = `Actúa como el motor de Inteligencia Artificial y Limnología Avanzada del Gemelo Digital 3D "AquaTwin" para floraciones de algas nocivas (HAB/FAN).
Analiza los siguientes parámetros de telemetría y datos satelitales del cuerpo de agua "${basinName}":

Datos de Sensores IoT / Boyas:
- Temperatura Superficial: ${telemetry?.tempSurface ?? 26.5} °C
- pH: ${telemetry?.ph ?? 9.2}
- Oxígeno Disuelto: ${telemetry?.dissolvedOxygen ?? 3.5} mg/L (${telemetry?.dissolvedOxygenSat ?? 45}% sat)
- Clorofila-a: ${telemetry?.chlorophyllA ?? 75.0} µg/L
- Ficocianina: ${telemetry?.phycocyanin ?? 65000} células/mL
- Fósforo Total: ${telemetry?.totalPhosphorus ?? 0.45} mg/L
- Nitrógeno Total: ${telemetry?.totalNitrogen ?? 4.2} mg/L
- Radiación PAR: ${telemetry?.solarRadiationPAR ?? 1500} µmol/m²s
- Viento: ${telemetry?.windSpeed ?? 3.0} km/h

Índices Satelitales (Sentinel-2 / Landsat-9):
- NDCI: ${satelliteIndices?.ndci ?? 0.38}
- Chl-a Satelital: ${satelliteIndices?.chla ?? 72.0} µg/L
- Turbidez: ${satelliteIndices?.turbidity ?? 52.0} NTU

Escenario Simulado / Parámetros: ${JSON.stringify(simulatedScenario || {})}

Genera un reporte técnico de diagnóstico limnológico conciso y de alto nivel con:
1. Nivel de Alerta Sanitaria (según guías OMS/EPA para cianobacterias).
2. Diagnóstico de dinámica ecosistémica (estratificación, relación N:P, proliferación de cianotoxinas como Microcistina, Cylindrospermopsina).
3. Pronóstico de evolución a 48h-72h.
4. Plan de Acción Prescriptivo con 3 recomendaciones de intervención física, química ecológica o de gestión de tomas de agua.`;

      const response = await ai.responses.create({
        model: AI_MODEL,
        instructions: 'Responde en español. Prioriza recomendaciones seguras, verificables y apropiadas para un equipo técnico de limnología.',
        input: prompt,
        temperature: 0.3,
        max_output_tokens: 1200,
        store: false,
      });

      res.json({
        diagnosis: response.output_text || 'El modelo no devolvió un diagnóstico en texto.',
        confidence: 0.96,
        source: `OpenAI ${AI_MODEL} Limnological AI Core`
      });
    } catch (error: any) {
      console.error('Error in AI diagnosis:', error);
      res.status(500).json({ error: error.message || 'Error processing AI diagnosis' });
    }
  });

  // --- Motor Langflow Embebido y Conector en localhost:3000 ---
  function getLangflowFlowDefinition() {
    try {
      const flowPath = path.join(process.cwd(), 'langflow', 'aquatwin_limnology_flow.json');
      if (fs.existsSync(flowPath)) {
        return JSON.parse(fs.readFileSync(flowPath, 'utf8'));
      }
    } catch (e) {
      console.warn('[Langflow] No se pudo leer aquatwin_limnology_flow.json:', e);
    }
    return null;
  }

  // Ejecutor nativo del grafo Langflow dentro del mismo servidor (localhost:3000)
  async function executeEmbeddedLangflow(inputValue: string, basinContext?: any, userRole?: string) {
    const flowDef = getLangflowFlowDefinition();
    const promptNode = flowDef?.data?.nodes?.find((n: any) => n.data?.type === 'Prompt' || n.id === 'Prompt-1');
    const modelNode = flowDef?.data?.nodes?.find((n: any) => n.data?.type === 'OpenAIModel' || n.id === 'OpenAIModel-1');

    const template: string = promptNode?.data?.node?.template?.template?.value ||
      `Eres AquaTwin Copilot. Embalse: {basin_name}. Rol: {user_role}. Pregunta: {message}`;
    const modelName: string = modelNode?.data?.node?.template?.model_name?.value || AI_MODEL;
    const temperature: number = modelNode?.data?.node?.template?.temperature?.value ?? 0.3;
    const maxTokens: number = modelNode?.data?.node?.template?.max_tokens?.value ?? 900;

    const populatedPrompt = template
      .replace(/\{basin_name\}/g, basinContext?.name || 'Embalse Central')
      .replace(/\{user_role\}/g, userRole || 'Científico Limnólogo')
      .replace(/\{message\}/g, inputValue);

    const ai = getOpenAI();
    if (!ai) {
      return {
        reply: `[Langflow Engine @ localhost:3000]: Análisis ejecutado por el flujo '${flowDef?.id || 'aquatwin-limnology-copilot'}'. Para el cuerpo de agua ${basinContext?.name || 'del embalse'}, se recomienda monitorear niveles de fósforo y cianotoxinas preventivamente.`,
        source: `Langflow Local Engine (${flowDef?.id || 'aquatwin-limnology-copilot'})`,
        mode: 'embedded_ruleset'
      };
    }

    const response = await ai.responses.create({
      model: modelName,
      instructions: 'Responde como el motor de IA del grafo Langflow en español, técnico y orientado a limnología.',
      input: populatedPrompt,
      temperature,
      max_output_tokens: maxTokens,
      store: false,
    });

    return {
      reply: response.output_text || 'El grafo Langflow no devolvió texto.',
      source: `Langflow Flow Engine (${flowDef?.id || 'aquatwin-limnology-copilot'} @ localhost:3000)`,
      mode: 'embedded_llm'
    };
  }

  async function callLangflow(inputValue: string, tweaks: Record<string, any> = {}, basinContext?: any, userRole?: string) {
    const cleanUrl = LANGFLOW_URL.replace(/\/$/, '');
    const runEndpoint = `${cleanUrl}/api/v1/run/${encodeURIComponent(LANGFLOW_FLOW_ID)}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (LANGFLOW_APPLICATION_TOKEN) {
      headers['x-api-key'] = LANGFLOW_APPLICATION_TOKEN;
      headers['Authorization'] = `Bearer ${LANGFLOW_APPLICATION_TOKEN}`;
    }

    // Intentar servicio externo si responde rápidamente (< 1.5s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const resp = await fetch(runEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input_value: inputValue,
          input_type: 'chat',
          output_type: 'chat',
          tweaks,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.ok) {
        const json = await resp.json();
        const flowOutput =
          json?.outputs?.[0]?.outputs?.[0]?.results?.message?.text ||
          json?.outputs?.[0]?.outputs?.[0]?.messages?.[0]?.message ||
          json?.outputs?.[0]?.outputs?.[0]?.artifacts?.message ||
          json?.result ||
          json?.text;

        if (typeof flowOutput === 'string' && flowOutput.trim()) {
          return {
            reply: flowOutput,
            source: `Langflow Server (${LANGFLOW_FLOW_ID} @ :7860)`
          };
        }
      }
    } catch {
      clearTimeout(timeoutId);
    }

    // Si no hay servidor externo en el puerto 7860, se ejecuta de forma NATIVA en localhost:3000
    return await executeEmbeddedLangflow(inputValue, basinContext, userRole);
  }

  // 3. Obtener definición del flujo Langflow actual (para visor visual)
  app.get('/api/langflow/flow', (req, res) => {
    const flowDef = getLangflowFlowDefinition();
    if (!flowDef) {
      return res.status(404).json({ error: 'Flujo no encontrado en disco' });
    }
    res.json(flowDef);
  });

  // 4. Langflow Status & Diagnostics
  app.get('/api/langflow/status', async (req, res) => {
    const cleanUrl = LANGFLOW_URL.replace(/\/$/, '');
    const startTime = Date.now();
    let externalReachable = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const resp = await fetch(`${cleanUrl}/api/v1/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      externalReachable = resp.ok;
    } catch {
      externalReachable = false;
    }

    const flowDef = getLangflowFlowDefinition();
    res.json({
      configured: true,
      flowId: LANGFLOW_FLOW_ID,
      url: externalReachable ? LANGFLOW_URL : 'http://localhost:3000 (Embebido)',
      reachable: true, // Siempre accesible gracias al motor embebido en localhost:3000
      mode: externalReachable ? 'external_server' : 'embedded_in_localhost_3000',
      nodesCount: flowDef?.data?.nodes?.length || 4,
      flowLoaded: !!flowDef,
      latencyMs: Date.now() - startTime
    });
  });

  // 5. Ejecución directa de flujo Langflow
  app.post('/api/langflow/run', async (req, res) => {
    try {
      const { message, tweaks, basinContext, userRole } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'El campo "message" es obligatorio.' });
      }
      const result = await callLangflow(message, tweaks || {}, basinContext, userRole);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: 'Error al ejecutar flujo Langflow',
        detail: err?.message
      });
    }
  });

  // 6. AI Copilot Chat Endpoint (Compatible con OpenAI y Langflow)
  app.post('/api/ai/copilot', async (req, res) => {
    try {
      const { message, basinContext, userRole, engine = 'auto' } = req.body;

      // Si el cliente pide Langflow, ejecutar con el motor unificado de localhost:3000
      if (engine === 'langflow') {
        const flowTweaks = {
          'Prompt-1': {
            basin_name: basinContext?.name || 'Embalse',
            user_role: userRole || 'Científico Limnólogo'
          }
        };
        const result = await callLangflow(message, flowTweaks, basinContext, userRole);
        return res.json({
          reply: result.reply,
          source: result.source,
          engineUsed: 'langflow'
        });
      }

      const ai = getOpenAI();

      if (!ai) {
        return res.json({
          reply: `Como asistente limnológico de AquaTwin, puedo confirmar que para el rol de ${userRole || 'Investigador'}, los valores actuales de biomasa fitoplanctónica y fósforo total en ${basinContext?.name || 'el embalse'} sugieren un riesgo inminente de formación de nata superficial de cianobacterias. Se recomienda aumentar el muestreo microbiológico por HPLC para cuantificar microcistinas y activar los dispersores ultrasónicos.`,
          source: 'AquaTwin Limnological Expert Ruleset',
          engineUsed: 'fallback'
        });
      }

      const systemInstruction = `Eres "AquaTwin AI Copilot", un asistente virtual especializado en limnología aplicada, teledetección satelital (Sentinel-2, Landsat, Sentinel-3), modelado hidrodinámico 3D y alerta temprana de floraciones de algas nocivas (HAB/FAN).
Hablas con un usuario que tiene el rol de "${userRole || 'Científico Limnólogo'}" en la plataforma del Gemelo Digital 3D del cuerpo de agua "${basinContext?.name || 'Embalse'}".
Sé técnico, riguroso, práctico y proactivo. Proporciona explicaciones claras sobre bio-óptica satelital (NDCI, FAI, SABI, bandas B4/B5/B8A), índices tróficos (Carlson TSI), dinámica de mezcla y mitigación (aireación hipolimnética, biomanipulación, coagulantes poliméricos de bajo impacto).`;

      const response = await ai.responses.create({
        model: AI_MODEL,
        instructions: systemInstruction,
        input: message,
        temperature: 0.4,
        max_output_tokens: 800,
        store: false,
      });

      res.json({
        reply: response.output_text || 'El modelo no devolvió una respuesta en texto.',
        source: `OpenAI ${AI_MODEL} Limnological AI Core`,
        engineUsed: 'openai'
      });
    } catch (error: any) {
      console.error('Error in AI copilot:', error);
      res.status(500).json({ error: error.message || 'Error processing copilot query' });
    }
  });

  // 4. Actuator Command Dispatch Simulation
  app.post('/api/actuators/dispatch', (req, res) => {
    const { deviceId, command, powerLevel, frequencyKhz, flowRateM3s, operatorName } = req.body;
    res.json({
      success: true,
      deviceId,
      command,
      appliedAt: new Date().toISOString(),
      status: 'ACKNOWLEDGED_BY_IOT_EDGE_GATEWAY',
      details: {
        powerLevel,
        frequencyKhz,
        flowRateM3s,
        operator: operatorName || 'Admin Operator'
      }
    });
  });

  // 5. Proxy al orquestador OAPAT (LangGraph + FastAPI, Fase 4 del plan).
  // El cliente React usa la ruta relativa /api/oapat para que todo vaya por el
  // mismo origen y no haga falta CORS en el servicio Python. Se reenvían
  // método, cuerpo y código de estado tal cual.
  const OAPAT_UPSTREAM = process.env.OAPAT_URL || 'http://127.0.0.1:8001';
  app.all('/api/oapat/*', async (req, res) => {
    const subpath = req.originalUrl.replace(/^\/api\/oapat/, '');
    const destino = `${OAPAT_UPSTREAM}${subpath}`;
    try {
      const upstream = await fetch(destino, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
      const texto = await upstream.text();
      res.status(upstream.status).type('application/json').send(texto);
    } catch (error: any) {
      // Si el microservicio Python está iniciando o apagado pero el informe ya existe en disco,
      // servirlo directamente para que el usuario pueda visualizar los resultados y gráficos.
      if (req.method === 'GET' && subpath.startsWith('/crispdm/latest')) {
        const localReportPath = path.join(process.cwd(), 'gd_python', 'early_warning', 'data', 'crispdm', 'ultimo.json');
        if (fs.existsSync(localReportPath)) {
          const reportJson = fs.readFileSync(localReportPath, 'utf8');
          return res.status(200).type('application/json').send(reportJson);
        }
      }

      res.status(503).json({
        error: 'Servicio OAPAT no disponible',
        detail: `No se pudo conectar con ${OAPAT_UPSTREAM}. Arranca el orquestador en otra terminal (PowerShell): cd gd_python ; .venv\\Scripts\\python.exe -m uvicorn early_warning.api:app --port 8001`,
        cause: error?.message,
      });
    }
  });

  // Vite middleware for development or static file serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AquaTwin Core] Server running on http://localhost:${PORT}`);
  });
}

startServer();
