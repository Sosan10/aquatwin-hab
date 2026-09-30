# Integración de Langflow con AquaTwin HAB 🌊🤖

Esta carpeta contiene la configuración, flujo visual y utilidades para conectar **Langflow** con el Gemelo Digital 3D **AquaTwin**.

---

## 1. ¿Qué aporta Langflow al Gemelo Digital?
- **Diseño Visual de Agentes y RAG**: Permite editar visualmente cómo el Copilot Limnológico procesa el contexto del embalse, añade fuentes documentales (normativas OMS/EPA, guías de cianotoxinas) y selecciona modelos de lenguaje (OpenAI, Ollama, Anthropic, etc.).
- **Desacoplamiento y Trazabilidad**: El asistente en React (`AIEarlyWarningModule.tsx`) puede consultar directamente a Langflow mediante su API REST (`POST /api/v1/run/<flow_id>`).
- **Flexibilidad Multi-Modelo**: Cambia de proveedor LLM o ajusta hiperparámetros en el lienzo interactivo sin recompilar el código de AquaTwin.

---

## 2. Puesta en Marcha Rápida (Windows / macOS / Linux)

### Opción A: Ejecutar mediante Python / pip (Recomendado)
1. Instala Langflow en tu entorno o en uno independiente:
   ```bash
   pip install langflow
   ```
2. Inicia el servidor de Langflow (por defecto en el puerto `7860`):
   ```bash
   langflow run --port 7860
   ```
   *(En Windows puedes simplemente hacer doble clic en `start_langflow.bat` ubicado en esta misma carpeta)*.

### Opción B: Ejecutar mediante Docker
```bash
docker run -d -p 7860:7860 --name langflow langflowai/langflow:latest
```

---

## 3. Importar el Flujo de AquaTwin

1. Abre tu navegador en **http://localhost:7860**.
2. Haz clic en **"New Flow"** (o "Import") y selecciona **"Upload File"**.
3. Elige el archivo:
   `langflow/aquatwin_limnology_flow.json`
4. En el nodo **OpenAI LLM Engine**, introduce tu `OPENAI_API_KEY` (o configúrala globalmente en las variables de entorno de Langflow).
5. Haz clic en **Play** / **Run** en el lienzo para probarlo.
6. Copia el **Endpoint Name** o **Flow ID** (por defecto: `aquatwin-limnology-copilot`).

---

## 4. Conectar con AquaTwin

Añade las siguientes variables a tu archivo `.env.local` en la raíz del proyecto:

```env
# Integración con Langflow
LANGFLOW_URL="http://127.0.0.1:7860"
LANGFLOW_FLOW_ID="aquatwin-limnology-copilot"
# Opcional si tienes autenticación activada en Langflow:
# LANGFLOW_APPLICATION_TOKEN="tu-token-aqui"
```

El servidor proxy de AquaTwin (`server.ts`) detectará automáticamente el servicio Langflow en `http://127.0.0.1:7860` y podrás alternar entre **OpenAI Directo** y **Langflow Visual Flow** en el módulo de Alerta Temprana e IA.
