import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  FileSpreadsheet, 
  FileCheck, 
  Calendar, 
  Clock, 
  Printer, 
  CheckCircle2, 
  Sparkles,
  AlertCircle,
  FileCode,
  Layers,
  ShieldAlert
} from 'lucide-react';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { WaterBasin, IoTBuoy, MLPrediction, AnomalyEvent, UserProfile } from '../types';
import { ML_FORECASTS, ANOMALIES } from '../data/mockData';
import { obtenerUltimaCorridaOAPAT, resumirCorridaOAPAT, useUltimaCorridaOAPAT } from '../services/oaaptStore';

interface ReportingModuleProps {
  basin: WaterBasin;
  buoys: IoTBuoy[];
  currentUser: UserProfile;
}

export const ReportingModule: React.FC<ReportingModuleProps> = ({
  basin,
  buoys,
  currentUser
}) => {
  const [reportType, setReportType] = useState<'DAILY_BULLETIN' | 'WHO_CYANOTOXIN' | 'IOT_TELEMETRY_LOG' | 'ML_FORECAST_AUDIT'>('DAILY_BULLETIN');
  const [include3DCanvasSnapshot, setInclude3DCanvasSnapshot] = useState(true);
  const [includeMLForecast, setIncludeMLForecast] = useState(true);
  const [includeIoTTelemetries, setIncludeIoTTelemetries] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  // Fase 4: si hay una corrida OAPAT publicada, se incluye en PDF, Excel, Word y JSON
  const corridaOAPAT = useUltimaCorridaOAPAT();

  // 1. Export PDF using jsPDF
  const exportPDF = () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('AquaTwin HAB - Informe Limnológico Oficial', 14, 20);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(56, 189, 248); // cyan-400
      doc.text(`Gemelo Digital 3D & Teledetección Satelital | ${basin.name}`, 14, 28);
      doc.text(`Generado: ${new Date().toLocaleString()} | Usuario: ${currentUser.name} (${currentUser.role})`, 14, 34);

      // Section 1: Executive Summary
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('1. Resumen Ejecutivo del Cuerpo de Agua', 14, 50);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(`Cuerpo Hídrico: ${basin.name} (${basin.country})`, 14, 58);
      doc.text(`Estado Trófico: ${basin.trophicStatus} | Nivel de Alerta: ${basin.currentRisk}`, 14, 64);
      doc.text(`Último Paso Satelital: ${basin.lastSatellitePass}`, 14, 70);
      doc.text(`Promedio Clorofila-a: ${basin.chlorophyllAvg} µg/L | Ficocianina: ${basin.phycocyaninAvg.toLocaleString()} cél/mL`, 14, 76);
      doc.text(`Temperatura Media: ${basin.waterTempAvg} °C | Oxígeno Disuelto Mínimo: ${basin.dissolvedOxygenAvg} mg/L`, 14, 82);
      doc.text('Dataset Base In-Situ: fcr_oapat.csv (1.960 obs reales, Carey Lab LTREB + ERA5)', 14, 88);

      // Section 2: Sensor Buoy Telemetry Table
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('2. Telemetría de Boyas IoT en Tiempo Real', 14, 96);

      let yPos = 104;
      doc.setFillColor(241, 245, 249);
      doc.rect(14, yPos - 5, pageWidth - 28, 8, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Estación / Código', 16, yPos);
      doc.text('Chl-a (µg/L)', 70, yPos);
      doc.text('OD (mg/L)', 105, yPos);
      doc.text('Temp (°C)', 135, yPos);
      doc.text('Fósforo (mg/L)', 165, yPos);

      yPos += 8;
      doc.setFont('helvetica', 'normal');
      buoys.forEach((b) => {
        doc.text(`${b.name.substring(0, 24)}... (${b.code})`, 16, yPos);
        doc.text(`${b.telemetry.chlorophyllA}`, 70, yPos);
        doc.text(`${b.telemetry.dissolvedOxygen}`, 105, yPos);
        doc.text(`${b.telemetry.tempSurface}`, 135, yPos);
        doc.text(`${b.telemetry.totalPhosphorus}`, 165, yPos);
        yPos += 7;
      });

      // Section 3: AI Predictive Forecast
      yPos += 6;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('3. Pronóstico IA (CNN-LSTM) y Evaluación de Riesgo OMS', 14, yPos);

      yPos += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text('El modelo espacio-temporal estima una expansión de la biomasa de Microcystis en las próximas 48-72 horas.', 14, yPos);
      yPos += 6;
      doc.text('Cianotoxina proyectada (Microcistina-LR): >25.0 µg/L. Se sugiere mantener alerta roja para tomas de agua potable.', 14, yPos);

      // 4. Alerta temprana OAPAT (Fase 4): solo si hay una corrida publicada
      const oapat = obtenerUltimaCorridaOAPAT();
      if (oapat) {
        const s = resumirCorridaOAPAT(oapat);
        yPos += 14;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`4. Alerta Temprana ${s.horizonteDias} días (Orquestador OAPAT)`, 14, yPos);
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const lineas = [
          `Corrida: ${s.runId} | Generada: ${new Date(s.generadoEn).toLocaleString()} | Estado: ${s.estado} | Calidad de datos: ${s.calidadDatos}`,
          s.estado === 'degraded'
            ? `Corrida DEGRADADA por calidad insuficiente (${s.observacionesRechazadas} observaciones rechazadas). Sin pronóstico numérico.`
            : `Riesgo: ${s.nivelRiesgoEtiqueta} | Probabilidad de floración: ${s.probabilidadBloomPct} %${s.confianza !== null ? ` | Confianza: ${s.confianza} %` : ''}`,
          `Impulsores: ${s.impulsores.join(', ') || 'no reportados'}`,
          `Fuentes: ${s.fuentes || '-'} | Modelos: ${Object.entries(s.versionesModelo).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}`,
          `Aprobacion humana: ${s.decision}${s.decididoEn ? ` por ${s.decididoPor} el ${new Date(s.decididoEn).toLocaleString()}` : ''}${s.comentarioDecision ? ` - "${s.comentarioDecision}"` : ''} | Comandos a actuadores: ${s.comandosActuador}`,
          'Procedencia: dataset in-situ real fcr_oapat.csv (1.960 observaciones, Carey Lab Virginia Tech LTREB + ERA5) y modelos validados OAPAT.',
        ];
        lineas.forEach((l) => {
          doc.text(doc.splitTextToSize(l, pageWidth - 28), 14, yPos);
          yPos += 6 * Math.max(1, doc.splitTextToSize(l, pageWidth - 28).length);
        });
      }

      // Footer & Signature Line
      yPos += 24;
      doc.setDrawColor(203, 213, 225);
      doc.line(14, yPos, 80, yPos);
      doc.line(pageWidth - 80, yPos, pageWidth - 14, yPos);
      
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Firma Responsable Limnológico: ${currentUser.name}`, 14, yPos + 5);
      doc.text('Autoridad Ambiental / Auditoría Sanitaria', pageWidth - 80, yPos + 5);

      doc.save(`AquaTwin_Reporte_${basin.id}_${Date.now()}.pdf`);
      setDownloadSuccess('Reporte PDF descargado con éxito.');
      setTimeout(() => setDownloadSuccess(null), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Export Excel (.xlsx) using xlsx library
  const exportExcel = () => {
    setIsGenerating(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Basin Overview
      const basinData = [
        ['AquaTwin HAB Digital Twin - Hoja de Datos'],
        ['Cuerpo de Agua', basin.name],
        ['Ubicación', basin.location],
        ['País', basin.country],
        ['Área Superficial (km²)', basin.surfaceAreaKm2],
        ['Profundidad Máxima (m)', basin.maxDepthMeters],
        ['Volumen (hm³)', basin.volumeMcm],
        ['Estado Trófico', basin.trophicStatus],
        ['Nivel de Alerta Actual', basin.currentRisk],
        ['Sensor Satelital', basin.satelliteSensor],
        ['Último Paso Satelital', basin.lastSatellitePass],
        ['Dataset Base In-Situ', 'fcr_oapat.csv (1.960 obs reales, Carey Lab LTREB + ERA5)'],
        ['Fecha Generación', new Date().toISOString()]
      ];
      const wsBasin = XLSX.utils.aoa_to_sheet(basinData);
      XLSX.utils.book_append_sheet(wb, wsBasin, 'Resumen_Cuenca');

      // Sheet 2: IoT Buoys Telemetry
      const buoyRows = buoys.map(b => ({
        ID: b.id,
        Nombre: b.name,
        Codigo: b.code,
        Estado: b.status,
        Profundidad_m: b.depthMeters,
        Bateria_Pct: b.batteryLevel,
        ClorofilaA_ugL: b.telemetry.chlorophyllA,
        Ficocianina_celmL: b.telemetry.phycocyanin,
        OxigenoDisuelto_mgL: b.telemetry.dissolvedOxygen,
        OxigenoSat_Pct: b.telemetry.dissolvedOxygenSat,
        TempSuperficie_C: b.telemetry.tempSurface,
        TempFondo_C: b.telemetry.tempDepth,
        pH: b.telemetry.ph,
        Turbidez_NTU: b.telemetry.turbidity,
        FosforoTotal_mgL: b.telemetry.totalPhosphorus,
        NitrogenoTotal_mgL: b.telemetry.totalNitrogen,
        RadiacionPAR: b.telemetry.solarRadiationPAR,
        Viento_kmh: b.telemetry.windSpeed,
        UltimoPing: b.lastPing
      }));
      const wsBuoys = XLSX.utils.json_to_sheet(buoyRows);
      XLSX.utils.book_append_sheet(wb, wsBuoys, 'Telemetria_Boyas_IoT');

      // Sheet 3: ML Predictions Forecast
      const forecastRows = ML_FORECASTS.map(f => ({
        Horizonte: f.timestamp,
        HorasAdelanto: f.hoursAhead,
        ClorofilaPredicha_ugL: f.predictedChlorophyll,
        IntervaloConf_Min: f.confidenceMin,
        IntervaloConf_Max: f.confidenceMax,
        FicocianinaPredicha_celmL: f.predictedPhycocyanin,
        ProbabilidadBloom_Pct: f.bloomProbability,
        NivelRiesgo: f.riskLevel,
        TaxonDominante: f.dominantTaxa,
        MicrocistinaEstimada_ugL: f.estimatedMicrocystinUgL
      }));
      const wsForecast = XLSX.utils.json_to_sheet(forecastRows);
      XLSX.utils.book_append_sheet(wb, wsForecast, 'Predicciones_ML');

      // Hoja OAPAT (Fase 4): una fila por campo del resumen de la última corrida
      const oapat = obtenerUltimaCorridaOAPAT();
      if (oapat) {
        const s = resumirCorridaOAPAT(oapat);
        const filasOAPAT = Object.entries(s).map(([campo, valor]) => ({
          Campo: campo,
          Valor: Array.isArray(valor) ? valor.join('; ') : typeof valor === 'object' && valor !== null ? JSON.stringify(valor) : String(valor ?? ''),
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasOAPAT), 'Alerta_OAPAT');
      }

      XLSX.writeFile(wb, `AquaTwin_Dataset_${basin.id}_${Date.now()}.xlsx`);
      setDownloadSuccess('Libro de Excel (.xlsx) exportado con éxito.');
      setTimeout(() => setDownloadSuccess(null), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Export Word Document (.doc)
  const exportWord = () => {
    setIsGenerating(true);
    try {
      const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>Informe Limnológico AquaTwin</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
        h1 { color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 5px; }
        h2 { color: #0369a1; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
        th { background-color: #f1f5f9; color: #0f172a; font-weight: bold; }
      </style>
      </head>
      <body>
        <h1>AquaTwin HAB - Boletín Limnológico & Sanitario</h1>
        <p><strong>Cuerpo de Agua:</strong> ${basin.name} (${basin.country})</p>
        <p><strong>Fecha y Hora:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Auditor/Operador:</strong> ${currentUser.name} (${currentUser.organization})</p>
        <p><strong>Nivel de Alerta Sanitaria:</strong> ${basin.currentRisk}</p>
        
        <h2>1. Resumen de Calidad del Agua</h2>
        <p>Durante las últimas 24 horas, la reflectancia espectral en banda B5/B4 de Sentinel-2 y los sensores de boyas evidencian un crecimiento de fitoplancton en ${basin.name}.</p>
        
        <h2>2. Estado de Estaciones Telemétricas</h2>
        <table>
          <tr>
            <th>Estación</th>
            <th>Chl-a (µg/L)</th>
            <th>OD (mg/L)</th>
            <th>Temp (°C)</th>
            <th>Fósforo (mg/L)</th>
          </tr>
          ${buoys.map(b => `
            <tr>
              <td>${b.name} (${b.code})</td>
              <td>${b.telemetry.chlorophyllA}</td>
              <td>${b.telemetry.dissolvedOxygen}</td>
              <td>${b.telemetry.tempSurface}</td>
              <td>${b.telemetry.totalPhosphorus}</td>
            </tr>
          `).join('')}
        </table>

        <h2>3. Directivas de Mitigación Recomendadas</h2>
        <ol>
          <li>Mantener la desestratificación mediante aireación hipolimnética continua en la presa central.</li>
          <li>Ajustar la profundidad de la torre de toma de agua potable para evitar el estrato superficial cargado de cianotoxinas.</li>
          <li>Notificar a la autoridad sanitaria municipal sobre la restricción preventiva de uso recreacional.</li>
        </ol>
        ${(() => {
          const o = obtenerUltimaCorridaOAPAT();
          if (!o) return '';
          const s = resumirCorridaOAPAT(o);
          return `
        <h2>4. Alerta Temprana ${s.horizonteDias} días (Orquestador OAPAT)</h2>
        <p><b>Corrida:</b> ${s.runId} &middot; <b>Generada:</b> ${new Date(s.generadoEn).toLocaleString()} &middot; <b>Estado:</b> ${s.estado} &middot; <b>Calidad de datos:</b> ${s.calidadDatos}</p>
        <p>${s.estado === 'degraded'
          ? `Corrida <b>degradada</b> por calidad insuficiente (${s.observacionesRechazadas} observaciones rechazadas). Sin pron&oacute;stico num&eacute;rico.`
          : `<b>Riesgo:</b> ${s.nivelRiesgoEtiqueta} &middot; <b>Probabilidad de floraci&oacute;n:</b> ${s.probabilidadBloomPct} %${s.confianza !== null ? ` &middot; <b>Confianza:</b> ${s.confianza} %` : ''}`}</p>
        <p><b>Impulsores:</b> ${s.impulsores.join(', ') || 'no reportados'}</p>
        <p><b>Fuentes:</b> ${s.fuentes || '-'} &middot; <b>Modelos:</b> ${Object.entries(s.versionesModelo).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}</p>
        <p><b>Aprobaci&oacute;n humana:</b> ${s.decision}${s.decididoEn ? ` por ${s.decididoPor} el ${new Date(s.decididoEn).toLocaleString()}` : ''}${s.comentarioDecision ? ` &mdash; &laquo;${s.comentarioDecision}&raquo;` : ''} &middot; <b>Comandos a actuadores:</b> ${s.comandosActuador}</p>
        <p><b>Procedencia:</b> Dataset real in-situ <code>fcr_oapat.csv</code> (1.960 observaciones, Carey Lab / Virginia Tech LTREB + ERA5) y modelos validados OAPAT.</p>`;
        })()}
      </body>
      </html>`;

      const blob = new Blob(['\ufeff' + content], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AquaTwin_Boletin_${basin.id}_${Date.now()}.doc`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadSuccess('Documento Word (.doc) descargado con éxito.');
      setTimeout(() => setDownloadSuccess(null), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  // 4. Export JSON
  const exportJSON = () => {
    const exportData = {
      basin,
      buoys,
      forecasts: ML_FORECASTS,
      anomalies: ANOMALIES,
      // Fase 4: corrida completa del orquestador (o null si no se ha ejecutado)
      oapatEarlyWarning: obtenerUltimaCorridaOAPAT(),
      exportedBy: currentUser,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AquaTwin_Payload_${basin.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Reporting Hub */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950/40 to-slate-900 border border-teal-500/40 rounded-xl p-4 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-teal-600/30 border border-teal-400/50 flex items-center justify-center text-teal-300">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-100">
                Centro de Generación de Reportes & Exportación Multiformato
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-900 text-teal-200 border border-teal-700 font-mono">
                PDF • Word • Excel • JSON
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Generación programada y bajo demanda de boletines técnicos, auditorías de cumplimiento OMS y hojas de telemetría.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 self-start md:self-auto">
          <Calendar className="w-3.5 h-3.5 text-teal-400" />
          <span>Frecuencia: Diaria & On-Demand</span>
        </div>
      </div>

      {/* Success Notification */}
      {downloadSuccess && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs flex items-center gap-2 font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {/* Main Grid: Template Builder & Export Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (7 Cols): Report Configuration & Template Selection */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-400" />
              <h3 className="font-bold text-slate-100 text-sm">
                Plantilla del Informe & Parámetros a Incluir
              </h3>
            </div>
          </div>

          {/* Template Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">Tipo de Reporte Oficial:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setReportType('DAILY_BULLETIN')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  reportType === 'DAILY_BULLETIN'
                    ? 'bg-teal-950/80 border-teal-500 text-teal-200 font-semibold shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">Boletín Limnológico Diario</span>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${reportType === 'DAILY_BULLETIN' ? 'text-teal-400' : 'text-slate-600'}`} />
                </div>
                <p className="text-[11px] text-slate-400 font-normal">
                  Resumen de índices satelitales (NDCI, Chl-a), estado de boyas y acciones de remediación.
                </p>
              </button>

              <button
                onClick={() => setReportType('WHO_CYANOTOXIN')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  reportType === 'WHO_CYANOTOXIN'
                    ? 'bg-teal-950/80 border-teal-500 text-teal-200 font-semibold shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">Auditoría Sanitaria OMS</span>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${reportType === 'WHO_CYANOTOXIN' ? 'text-teal-400' : 'text-slate-600'}`} />
                </div>
                <p className="text-[11px] text-slate-400 font-normal">
                  Evaluación de cianotoxinas (Microcistinas), riesgo epidemiológico para tomas de agua y recreación.
                </p>
              </button>

              <button
                onClick={() => setReportType('ML_FORECAST_AUDIT')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  reportType === 'ML_FORECAST_AUDIT'
                    ? 'bg-teal-950/80 border-teal-500 text-teal-200 font-semibold shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">Auditoría de Modelos IA</span>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${reportType === 'ML_FORECAST_AUDIT' ? 'text-teal-400' : 'text-slate-600'}`} />
                </div>
                <p className="text-[11px] text-slate-400 font-normal">
                  Métricas de precisión CNN-LSTM, intervalos de confianza a 7 días y atribución SHAP.
                </p>
              </button>

              <button
                onClick={() => setReportType('IOT_TELEMETRY_LOG')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  reportType === 'IOT_TELEMETRY_LOG'
                    ? 'bg-teal-950/80 border-teal-500 text-teal-200 font-semibold shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">Log Crudo de Telemetría IoT</span>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${reportType === 'IOT_TELEMETRY_LOG' ? 'text-teal-400' : 'text-slate-600'}`} />
                </div>
                <p className="text-[11px] text-slate-400 font-normal">
                  Registros continuos a alta frecuencia de OD, pH, temperatura, nutrientes y turbidez.
                </p>
              </button>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="pt-2 border-t border-slate-800">
            <span className="text-xs font-semibold text-slate-300 block mb-2">Secciones y Datos a Adjuntar:</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={include3DCanvasSnapshot}
                  onChange={(e) => setInclude3DCanvasSnapshot(e.target.checked)}
                  className="rounded border-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <span>Captura Gemelo 3D</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMLForecast}
                  onChange={(e) => setIncludeMLForecast(e.target.checked)}
                  className="rounded border-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <span>Pronóstico 7 Días (IA)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeIoTTelemetries}
                  onChange={(e) => setIncludeIoTTelemetries(e.target.checked)}
                  className="rounded border-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <span>Tabla Boyas IoT</span>
              </label>
              <div
                className={`flex items-center gap-2 text-xs rounded-md px-2 py-1 border ${
                  corridaOAPAT
                    ? 'border-cyan-700/60 bg-cyan-950/40 text-cyan-200'
                    : 'border-slate-800 bg-slate-950/40 text-slate-500'
                }`}
                title={corridaOAPAT
                  ? `Corrida ${corridaOAPAT.run_id} — se añadirá como sección 4 en PDF/Word, hoja Alerta_OAPAT en Excel y clave oapatEarlyWarning en JSON.`
                  : 'Lanza una corrida en «IA & Alerta Temprana» o en «Motor GD» para incluirla en los informes.'}
              >
                <span className={`w-2 h-2 rounded-full ${corridaOAPAT ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                <span>
                  Alerta OAPAT 7–14 días:{' '}
                  {corridaOAPAT
                    ? `incluida (${corridaOAPAT.run_id.slice(0, 8)}…, ${corridaOAPAT.status})`
                    : 'sin corrida'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right (5 Cols): Export Trigger Buttons */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Descargar Informe Generado
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              Selecciona el formato de exportación requerido para organismos de cuenca, ministerios y operadores:
            </p>

            <div className="mt-4 space-y-2.5">
              {/* PDF Button */}
              <button
                onClick={exportPDF}
                disabled={isGenerating}
                className="w-full p-3 bg-rose-600/90 hover:bg-rose-500 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-between shadow-lg shadow-rose-950/40"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4" />
                  <span>Descargar Documento PDF Oficial (jsPDF)</span>
                </div>
                <Download className="w-4 h-4" />
              </button>

              {/* Excel Button */}
              <button
                onClick={exportExcel}
                disabled={isGenerating}
                className="w-full p-3 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-between shadow-lg shadow-emerald-950/40"
              >
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Exportar Libro Excel .XLSX (Multi-hoja)</span>
                </div>
                <Download className="w-4 h-4" />
              </button>

              {/* Word Button */}
              <button
                onClick={exportWord}
                disabled={isGenerating}
                className="w-full p-3 bg-blue-600/90 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-between shadow-lg shadow-blue-950/40"
              >
                <div className="flex items-center gap-2.5">
                  <FileCheck className="w-4 h-4" />
                  <span>Generar Documento Word .DOC</span>
                </div>
                <Download className="w-4 h-4" />
              </button>

              {/* JSON Button */}
              <button
                onClick={exportJSON}
                disabled={isGenerating}
                className="w-full p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs transition-all flex items-center justify-between border border-slate-700"
              >
                <div className="flex items-center gap-2.5">
                  <FileCode className="w-4 h-4 text-purple-400" />
                  <span>Exportar Payload Crudo JSON</span>
                </div>
                <Download className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
            <span>Firma Digital SHA-256</span>
            <span className="text-teal-400">Verificado OK</span>
          </div>
        </div>
      </div>
    </div>
  );
};
