/**
 * Cliente HTTP para el servicio OAPAT (Orquestador de Asimilación,
 * Pronóstico y Alerta Temprana). Todas las llamadas pasan por el
 * proxy Express en /api/oapat/*.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface OAPATHealth {
  status: string;
  service: string;
  phase: number;
  data_mode: string;
  capabilities: string[];
}

export interface OAPATForecast {
  kind: string;
  horizon_days: number;
  ensemble: Record<string, number>;
  physics: Record<string, number>;
  ml: Record<string, number>;
  effective_weights: { physics: number; ml: number };
}

export interface OAPATInterval {
  lower: number;
  mean: number;
  upper: number;
}

export interface OAPATUncertainty {
  confidence: number;
  intervals: Record<string, OAPATInterval>;
  penalties: Record<string, number>;
  agreement: number;
}

export interface OAPATRiskAssessment {
  level: 'NORMAL' | 'PREVENTIVE' | 'ALERT' | 'CRITICAL';
  bloom_probability: number;
  bloom_probability_upper: number;
  drivers: string[];
  thresholds: Record<string, [number, number]>;
  confidence: number;
}

export interface OAPATAuditEntry {
  node: string;
  message: string;
  at: string;
}

export interface OAPATRunResult {
  run_id: string;
  basin_id: string;
  generated_at: string;
  horizon_days: number;
  status: 'completed' | 'degraded' | 'failed' | 'pending_approval';
  data_quality: 'acceptable' | 'insufficient';
  risk: string;
  bloom_probability: number;
  quality_report: {
    accepted: number;
    rejected: Array<{ source: string; issues: string[] }>;
    duplicates_removed: number;
    missing_sources: string[];
    maximum_age_hours: number;
    acceptable: boolean;
  };
  source_summary: Record<string, number>;
  audit_log: OAPATAuditEntry[];
  forecast: OAPATForecast | null;
  uncertainty: OAPATUncertainty | null;
  drivers: string[];
  model_versions: Record<string, string>;
  recommendations: string[];
  assimilation_report: {
    prior_state: Record<string, number>;
    corrections: Record<string, {
      prior: number | null;
      observed: number;
      delta: number | null;
      corrected: number;
    }>;
    confidence: number;
    gain_used: number;
    quality_score_used: number;
  } | null;
  risk_assessment: OAPATRiskAssessment | null;
  // Fase 5 — aprobación humana y trazabilidad
  requires_approval: boolean;
  approval: OAPATApproval | null;
  approval_request: OAPATApprovalRequestPayload | null;
  actuator_commands: OAPATActuatorAck[];
}

/** Registro de la decisión humana: quién, qué, cuándo y sobre qué evidencia. */
export interface OAPATApproval {
  decision: 'approved' | 'rejected';
  user_id: string;
  user_name: string;
  user_role: string;
  comment: string;
  decided_at: string;
  risk_level_at_decision: string;
  bloom_probability_at_decision: number;
  data_quality_at_decision: boolean;
}

/** Lo que el grafo expone al aprobador mientras está pausado en interrupt(). */
export interface OAPATApprovalRequestPayload {
  run_id: string;
  basin_id: string;
  risk_level: string;
  bloom_probability: number;
  drivers: string[];
  recommendations: string[];
  data_quality: boolean;
  confidence: number | null;
  reason: string;
}

export interface OAPATActuatorAck {
  at: string;
  user_id: string;
  user_name: string;
  user_role: string;
  device_id: string;
  command: string;
  power_level: number | null;
  status: string;
  approved_by: string;
  approval_decided_at: string;
}

/** Roles que pueden aprobar y roles que pueden accionar. Espejo de api.py. */
export const OAPAT_APPROVER_ROLES = ['ADMIN', 'LIMNOLOGIST', 'OPERATOR'] as const;
export const OAPAT_ACTUATOR_ROLES = ['ADMIN', 'OPERATOR'] as const;
export const puedeAprobarOAPAT = (rol: string) => (OAPAT_APPROVER_ROLES as readonly string[]).includes(rol);
export const puedeAccionarOAPAT = (rol: string) => (OAPAT_ACTUATOR_ROLES as readonly string[]).includes(rol);

// ---------------------------------------------------------------------------
// Estado del request
// ---------------------------------------------------------------------------

export type OAPATRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: OAPATRunResult }
  | { status: 'error'; error: string };

// ---------------------------------------------------------------------------
// Funciones del cliente
// ---------------------------------------------------------------------------

const OAPAT_BASE = '/api/oapat';

export async function getOAPATHealth(): Promise<OAPATHealth> {
  const res = await fetch(`${OAPAT_BASE}/health`);
  if (!res.ok) {
    throw new Error(`OAPAT health check failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function runOAPAT(
  basinId: string = 'san-roque',
  horizonDays: 7 | 14 = 7,
): Promise<OAPATRunResult> {
  const res = await fetch(`${OAPAT_BASE}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      basin_id: basinId,
      horizon_days: horizonDays,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAPAT run failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function getOAPATRun(runId: string): Promise<OAPATRunResult> {
  const res = await fetch(`${OAPAT_BASE}/runs/${runId}`);
  if (!res.ok) {
    throw new Error(`OAPAT run not found: ${res.status}`);
  }
  return res.json();
}

async function leerError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail ?? body?.error ?? JSON.stringify(body);
  } catch {
    return await res.text();
  }
}

// ---------------------------------------------------------------------------
// Fase 6 — fuentes, validación científica, grafo
// ---------------------------------------------------------------------------

export interface OAPATSourceStatus {
  name: string;
  configured: boolean;
  verified: boolean;
  active: boolean;
  mode: string;
  reason: string;
  endpoint?: string;
}

export interface OAPATModelResult {
  model: 'persistence' | 'physics_baseline' | 'ml_baseline' | 'hybrid_ensemble';
  f1: number; precision: number; recall: number;
  rmse: number; mae: number; brier?: number;
  tp: number; fp: number; fn: number; tn: number;
}

export interface OAPATValidationReport {
  generated_at: string;
  basin_id: string;
  horizon_days: number;
  dataset: { source: 'csv' | 'synthetic'; path: string | null; rows: number; start: string; end: string; fingerprint: string; note: string };
  protocol: { type: string; min_train_days: number; step_days: number; origins: number; leakage_violations: number; event_definition: string; event_rate: number; valid_data_pct: number };
  results: OAPATModelResult[];
  brier_climatology: number;
  interval_coverage_hybrid: number | null;
  hypothesis: {
    f1_target: number; hybrid_f1: number; meets_f1_target: boolean;
    beats_physics_baseline: boolean; beats_ml_baseline: boolean; beats_persistence_mae: boolean;
    class_balance_warning: string | null; supported: boolean; verdict: string;
  };
  folds_count: number;
}

export interface OAPATGraph {
  mermaid: string;
  nodes: string[];
  edges: { source: string; target: string; conditional: boolean }[];
}

export async function getOAPATSources(): Promise<{ mode: string; sources: OAPATSourceStatus[]; note: string }> {
  const res = await fetch(`${OAPAT_BASE}/sources`);
  if (!res.ok) throw new Error(`(${res.status}) ${await leerError(res)}`);
  return res.json();
}

export async function getOAPATValidation(): Promise<OAPATValidationReport | null> {
  const res = await fetch(`${OAPAT_BASE}/validation/latest`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`(${res.status}) ${await leerError(res)}`);
  return res.json();
}

export async function runOAPATBacktest(
  basinId: string,
  horizonDays: number,
  opts: { days?: number; minTrainDays?: number; stepDays?: number } = {},
): Promise<OAPATValidationReport> {
  const res = await fetch(`${OAPAT_BASE}/validation/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      basin_id: basinId, horizon_days: horizonDays,
      days: opts.days ?? 240, min_train_days: opts.minTrainDays ?? 60, step_days: opts.stepDays ?? 6,
    }),
  });
  if (!res.ok) throw new Error(`(${res.status}) ${await leerError(res)}`);
  return res.json();
}

export async function getOAPATGraph(): Promise<OAPATGraph> {
  const res = await fetch(`${OAPAT_BASE}/graph`);
  if (!res.ok) throw new Error(`(${res.status}) ${await leerError(res)}`);
  return res.json();
}

/** Fase 5: aprueba o rechaza una corrida pausada. El servidor verifica el rol. */
export async function decidirOAPATRun(
  runId: string,
  usuario: { id: string; name: string; role: string },
  decision: 'approved' | 'rejected',
  comment = '',
): Promise<OAPATRunResult> {
  const res = await fetch(`${OAPAT_BASE}/runs/${runId}/approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: usuario.id, user_name: usuario.name, user_role: usuario.role, decision, comment,
    }),
  });
  if (!res.ok) throw new Error(`(${res.status}) ${await leerError(res)}`);
  return res.json();
}

/** Fase 5: comando a actuador; el servidor solo lo acepta tras aprobación y con rol habilitado. */
export async function enviarComandoActuadorOAPAT(
  runId: string,
  usuario: { id: string; name: string; role: string },
  comando: { deviceId: string; command: string; powerLevel?: number },
): Promise<OAPATActuatorAck> {
  const res = await fetch(`${OAPAT_BASE}/runs/${runId}/actuator-commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: usuario.id, user_name: usuario.name, user_role: usuario.role,
      device_id: comando.deviceId, command: comando.command, power_level: comando.powerLevel ?? null,
    }),
  });
  if (!res.ok) throw new Error(`(${res.status}) ${await leerError(res)}`);
  return res.json();
}
