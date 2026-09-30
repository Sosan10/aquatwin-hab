/**
 * Almacén de la última corrida OAPAT.
 *
 * Fase 4 del plan: el resultado de una corrida debe poder verse en la interfaz
 * (IA & Alerta Temprana, Motor GD) **y** en los informes. El panel que lanza
 * la corrida y el módulo de informes viven en pestañas distintas y no comparten
 * antecesor cercano, así que en lugar de subir el estado hasta `App` y bajarlo
 * por props a tres módulos, se usa un almacén externo mínimo con
 * `useSyncExternalStore` (React 18+). Sin dependencias nuevas.
 */

import { useSyncExternalStore } from 'react';
import type { OAPATRunResult } from './oaaptClient';

let ultimaCorrida: OAPATRunResult | null = null;
const oyentes = new Set<() => void>();

export function publicarCorridaOAPAT(resultado: OAPATRunResult | null): void {
  ultimaCorrida = resultado;
  oyentes.forEach((fn) => fn());
}

function suscribir(fn: () => void): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

const leer = () => ultimaCorrida;

/** Última corrida OAPAT publicada, o `null` si aún no se ha ejecutado ninguna. */
export function useUltimaCorridaOAPAT(): OAPATRunResult | null {
  return useSyncExternalStore(suscribir, leer, leer);
}

/** Acceso no reactivo, para los generadores de informes (PDF, Excel, JSON). */
export function obtenerUltimaCorridaOAPAT(): OAPATRunResult | null {
  return ultimaCorrida;
}

/** Etiqueta legible del nivel de riesgo OAPAT. */
export const ETIQUETA_RIESGO_OAPAT: Record<string, string> = {
  NORMAL: 'Normal',
  PREVENTIVE: 'Preventivo',
  ALERT: 'Alerta',
  CRITICAL: 'Crítico',
  DEGRADED: 'Degradado',
};

/**
 * Resumen plano de una corrida para informes y tablas: riesgo, calidad,
 * incertidumbre, impulsores, versiones de modelo y procedencia. Es el contrato
 * que exige el plan ("mostrar riesgo, calidad, incertidumbre, impulsores y
 * procedencia") en un solo sitio, para que PDF, Excel, JSON y pantalla no
 * diverjan.
 */
export function resumirCorridaOAPAT(r: OAPATRunResult) {
  const nivel = r.risk_assessment?.level ?? r.risk;
  const prob = (r.risk_assessment?.bloom_probability ?? r.bloom_probability) ?? 0;
  const conf = r.uncertainty?.confidence ?? r.risk_assessment?.confidence ?? null;
  const fuentes = Object.entries(r.source_summary ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return {
    runId: r.run_id,
    generadoEn: r.generated_at,
    horizonteDias: r.horizon_days,
    estado: r.status,
    calidadDatos: r.data_quality,
    nivelRiesgo: nivel,
    nivelRiesgoEtiqueta: ETIQUETA_RIESGO_OAPAT[nivel] ?? nivel,
    probabilidadBloomPct: Math.round(prob * 1000) / 10,
    confianza: conf === null ? null : Math.round(conf * 1000) / 10,
    impulsores: r.drivers ?? [],
    recomendaciones: r.recommendations ?? [],
    versionesModelo: r.model_versions ?? {},
    fuentes,
    observacionesAceptadas: r.quality_report?.accepted ?? 0,
    observacionesRechazadas: r.quality_report?.rejected?.length ?? 0,
    duplicadosEliminados: r.quality_report?.duplicates_removed ?? 0,
    fuentesAusentes: r.quality_report?.missing_sources ?? [],
    // Fase 5 — trazabilidad de la decisión humana
    requiereAprobacion: r.requires_approval ?? false,
    decision: r.approval?.decision ?? (r.status === 'pending_approval' ? 'pendiente' : 'no requerida'),
    decididoPor: r.approval ? `${r.approval.user_name} (${r.approval.user_role})` : '—',
    decididoEn: r.approval?.decided_at ?? null,
    comentarioDecision: r.approval?.comment ?? '',
    comandosActuador: (r.actuator_commands ?? []).length,
    esSimulado: false,
    dataset: 'fcr_oapat.csv (1.960 obs reales)',
  };
}
