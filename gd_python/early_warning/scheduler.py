"""Fase 6 — Corridas programadas y observabilidad.

- **Programación**: un hilo en segundo plano lanza corridas cada
  ``OAPAT_SCHEDULE_MINUTES`` minutos para las cuencas de ``OAPAT_SCHEDULE_BASINS``
  (por defecto desactivado: ``0``). Se arranca/detiene con el ciclo de vida de
  FastAPI, así que no quedan hilos huérfanos.
- **Observabilidad**: contadores de corridas y fallos, latencia (última, media,
  máxima), últimos errores con su traza corta, y estado del programador. Se
  expone en ``GET /observability`` y se registra con ``logging`` estructurado.

Un sistema de alerta temprana caído en silencio es peor que no tenerlo: por
eso los fallos se cuentan y se guardan, no solo se imprimen.
"""

from __future__ import annotations

import logging
import os
import threading
import time
import traceback
from collections import deque
from datetime import datetime, timezone
from typing import Any, Callable

log = logging.getLogger("oapat")
if not log.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter('%(asctime)s oapat %(levelname)s %(message)s'))
    log.addHandler(h)
log.setLevel(logging.INFO)


class Observability:
    def __init__(self, max_errors: int = 20) -> None:
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.runs_total = 0
        self.runs_failed = 0
        self.runs_scheduled = 0
        self.pending_approvals = 0
        self.latencies_ms: deque[float] = deque(maxlen=200)
        self.errors: deque[dict[str, Any]] = deque(maxlen=max_errors)
        self.last_run_at: str | None = None
        self._lock = threading.Lock()

    def record(self, ok: bool, latency_ms: float, *, scheduled: bool = False,
               error: BaseException | None = None, context: dict[str, Any] | None = None) -> None:
        with self._lock:
            self.runs_total += 1
            self.latencies_ms.append(latency_ms)
            self.last_run_at = datetime.now(timezone.utc).isoformat()
            if scheduled:
                self.runs_scheduled += 1
            if not ok:
                self.runs_failed += 1
                self.errors.appendleft({
                    "at": self.last_run_at, "error": repr(error), "context": context or {},
                    "trace": traceback.format_exc(limit=3) if error else None,
                })
                log.error("corrida fallida %s: %r", context, error)
            else:
                log.info("corrida ok %s en %.0f ms", context, latency_ms)

    def snapshot(self, scheduler: "Scheduler | None") -> dict[str, Any]:
        with self._lock:
            lat = list(self.latencies_ms)
            return {
                "started_at": self.started_at,
                "runs_total": self.runs_total,
                "runs_failed": self.runs_failed,
                "runs_scheduled": self.runs_scheduled,
                "failure_rate": round(self.runs_failed / self.runs_total, 4) if self.runs_total else 0.0,
                "latency_ms": {"last": lat[-1] if lat else None,
                               "mean": round(sum(lat) / len(lat), 1) if lat else None,
                               "max": max(lat) if lat else None},
                "last_run_at": self.last_run_at,
                "recent_errors": list(self.errors),
                "scheduler": scheduler.status() if scheduler else {"enabled": False},
            }


OBS = Observability()


def timed(fn: Callable[..., Any], *args: Any, context: dict[str, Any] | None = None,
          scheduled: bool = False, **kwargs: Any) -> Any:
    """Ejecuta `fn` midiendo latencia y registrando éxito/fallo en OBS."""
    t0 = time.perf_counter()
    try:
        out = fn(*args, **kwargs)
        OBS.record(True, (time.perf_counter() - t0) * 1000, scheduled=scheduled, context=context)
        return out
    except BaseException as e:  # se re-lanza tras registrar
        OBS.record(False, (time.perf_counter() - t0) * 1000, scheduled=scheduled, error=e, context=context)
        raise


class Scheduler:
    def __init__(self, job: Callable[[str], Any]) -> None:
        self.job = job
        self.interval_min = float(os.environ.get("OAPAT_SCHEDULE_MINUTES", "0") or 0)
        self.basins = [b.strip() for b in os.environ.get("OAPAT_SCHEDULE_BASINS", "basin-san-roque").split(",") if b.strip()]
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.last_tick: str | None = None
        self.ticks = 0

    @property
    def enabled(self) -> bool:
        return self.interval_min > 0

    def start(self) -> None:
        if not self.enabled or self._thread:
            return
        self._thread = threading.Thread(target=self._loop, name="oapat-scheduler", daemon=True)
        self._thread.start()
        log.info("programador activo: cada %.1f min para %s", self.interval_min, self.basins)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None

    def _loop(self) -> None:
        while not self._stop.wait(self.interval_min * 60):
            self.ticks += 1
            self.last_tick = datetime.now(timezone.utc).isoformat()
            for basin in self.basins:
                try:
                    timed(self.job, basin, context={"basin_id": basin, "trigger": "scheduled"}, scheduled=True)
                except Exception:  # ya registrado en OBS; el programador no debe morir
                    pass

    def status(self) -> dict[str, Any]:
        return {"enabled": self.enabled, "interval_minutes": self.interval_min, "basins": self.basins,
                "ticks": self.ticks, "last_tick": self.last_tick,
                "alive": bool(self._thread and self._thread.is_alive())}
