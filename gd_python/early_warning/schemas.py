"""Contratos públicos del MVP de alerta temprana."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


class DataSource(str, Enum):
    BUOY = "buoy"
    METEOROLOGY = "meteorology"
    SENTINEL3 = "sentinel3"
    SIMULATION = "simulation"


class QualityFlag(str, Enum):
    GOOD = "good"
    SUSPECT = "suspect"
    BAD = "bad"
    MISSING = "missing"


class MeasurementQuality(BaseModel):
    flag: QualityFlag = QualityFlag.GOOD
    confidence: float = Field(default=0.9, ge=0, le=1)


class Observation(BaseModel):
    source: DataSource
    basin_id: str = Field(min_length=1, max_length=100)
    timestamp: datetime
    measurements: dict[str, float]
    units: dict[str, str] = Field(default_factory=dict)
    quality: MeasurementQuality = Field(default_factory=MeasurementQuality)

    @field_validator("timestamp")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp debe incluir zona horaria, por ejemplo UTC")
        return value.astimezone(timezone.utc)


class RunRequest(BaseModel):
    basin_id: str = Field(default="san-roque", min_length=1, max_length=100)
    horizon_days: Literal[7, 14] = 7
    observations: list[Observation] | None = None


class RiskLevel(str, Enum):
    NORMAL = "NORMAL"
    PREVENTIVE = "PREVENTIVE"
    ALERT = "ALERT"
    CRITICAL = "CRITICAL"
    DEGRADED = "DEGRADED"


class RunResult(BaseModel):
    run_id: str
    basin_id: str
    generated_at: datetime
    horizon_days: int
    status: Literal["completed", "degraded", "failed", "pending_approval"]
    data_quality: Literal["acceptable", "insufficient"]
    risk: RiskLevel
    bloom_probability: float = Field(ge=0, le=1)
    quality_report: dict
    source_summary: dict[str, int]
    audit_log: list[dict]
    forecast: dict | None = None
    uncertainty: dict | None = None
    drivers: list[str] = Field(default_factory=list)
    model_versions: dict[str, str] = Field(default_factory=dict)
    recommendations: list[str] = Field(default_factory=list)
    assimilation_report: dict | None = None
    risk_assessment: dict | None = None
    # Fase 5 — aprobación humana y trazabilidad
    requires_approval: bool = False
    approval: dict | None = None
    approval_request: dict | None = None
    actuator_commands: list[dict] = Field(default_factory=list)
    # Fase 6 — procedencia: estado de cada fuente en esta corrida
    source_status: list[dict] = Field(default_factory=list)


class BacktestRequest(BaseModel):
    basin_id: str = "basin-san-roque"
    horizon_days: int = Field(default=7, ge=1, le=30)
    # Hasta 50 años: un histórico real puede ser largo (Mendota: 1999–2023)
    days: int = Field(default=365, ge=60, le=20000)
    min_train_days: int = Field(default=90, ge=30)
    step_days: int = Field(default=5, ge=1)


class CrispDmRequest(BaseModel):
    """Peticion del ciclo CRISP-DM completo.

    ``horizontes`` se limita a cuatro valores: cada uno dispara una validacion
    cruzada anidada con bootstrap y permutacion, asi que una lista larga
    convertiria una peticion HTTP en un trabajo de horas.
    """
    basin_id: str = "fcr"
    horizontes: list[int] = Field(default=[7, 14], min_length=1, max_length=4)

    @field_validator("horizontes")
    @classmethod
    def _rango(cls, v: list[int]) -> list[int]:
        for h in v:
            if not 1 <= h <= 60:
                raise ValueError(f"Horizonte fuera de rango (1-60 dias): {h}")
        return v


class TrainRequest(BaseModel):
    basin_id: str = "basin-san-roque"
    horizon_days: int = Field(default=7, ge=1, le=30)
    days: int = Field(default=365, ge=60, le=20000)


class ApprovalRequest(BaseModel):
    """Decisión humana sobre una corrida pausada. El rol se verifica en la API (RBAC)."""
    user_id: str
    user_name: str
    user_role: str
    decision: Literal["approved", "rejected"]
    comment: str = ""


class ActuatorCommandRequest(BaseModel):
    """Comando a un actuador, solo aceptado si la corrida fue aprobada explícitamente."""
    user_id: str
    user_name: str
    user_role: str
    device_id: str
    command: str
    power_level: float | None = Field(default=None, ge=0, le=100)


def new_run_id() -> str:
    return str(uuid4())
