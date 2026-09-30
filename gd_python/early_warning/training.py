"""Fase 6 — Modelos entrenados y calibrados con datos, con artefacto persistido.

Sustituyen a los adaptadores sintéticos **sin tocar el grafo**: implementan las
mismas interfaces ``MLModelAdapter`` / ``PhysicsModelAdapter`` de la Fase 3.

Modelo ML (``TrainedMLModel``)
------------------------------
- **Ridge** sobre el *incremento* de clorofila-a a ``horizon_days`` (no sobre el
  nivel: así el referente de persistencia equivale a predecir cero y el modelo
  solo aprende la desviación, que es lo que aporta).
- **Regresión logística** para la probabilidad de evento de floración
  (chl-a ≥ 50 µg/L en el horizonte).
- Artefacto JSON en ``models/ml_ridge_<basin>_h<H>.json`` con coeficientes,
  medias, métricas de entrenamiento, huella del dataset y fecha: cada
  pronóstico puede rastrearse hasta el modelo exacto que lo produjo.

Modelo físico calibrado (``CalibratedPhysicsModel``)
---------------------------------------------------
Crecimiento logístico con tasa dependiente de temperatura (Q10) y fósforo
(Monod), cuyos parámetros ``r_max`` y ``K`` se ajustan al histórico por mínimos
cuadrados. Es un modelo de proceso, no estadístico: extrapola con sentido físico.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, Ridge

from .datasets import BLOOM_THRESHOLD, DatasetInfo, load_history
from .forecast_models import MLModelAdapter, PhysicsModelAdapter

MODELS_DIR = Path(__file__).resolve().parent / "models"

FEATURES = [
    "chlorophyll_a", "temp_surface", "total_phosphorus", "total_nitrogen",
    "wind_speed", "dissolved_oxygen", "chl_lag1", "chl_trend3", "temp_mean3", "wind_mean3",
]


# ---------------------------------------------------------------------------
# Construcción de muestras (solo mira hacia atrás: sin fuga de información)
# ---------------------------------------------------------------------------

#: Tolerancia al emparejar origen y objetivo: se acepta un objetivo que caiga
#: a horizon_days ± TOLERANCIA_DIAS. Con datos diarios contiguos no cambia nada;
#: con muestreo irregular permite usar la muestra más cercana al horizonte real.
TOLERANCIA_DIAS = 2


def build_samples(daily: pd.DataFrame, horizon_days: int,
                  tolerancia_dias: int = TOLERANCIA_DIAS) -> pd.DataFrame:
    """Construye rezagos, medias móviles y objetivo, emparejando por **fecha**.

    El emparejamiento se hace sobre el calendario, no sobre el índice de fila.
    Es la diferencia entre «dentro de 7 días» y «7 muestras más adelante»: con
    una serie diaria contigua coinciden, pero en cuanto hay huecos —y un dataset
    real siempre los tiene— desplazar filas convierte un horizonte de 7 días en
    uno de semanas o meses sin avisar. `pd.merge_asof` busca la observación
    cuya fecha esté más cerca de `origen + horizon_days`, dentro de la
    tolerancia; si no hay ninguna, la muestra se descarta en vez de inventarse.

    Los rezagos (`chl_lag1`, `chl_trend3`) y las medias móviles siguen siendo
    por posición: miran hacia atrás y solo aportan contexto, así que un hueco
    los degrada pero no falsea el horizonte.
    """
    d = daily.copy().reset_index(drop=True)
    d["timestamp"] = pd.to_datetime(d["timestamp"], utc=True)
    d = d.sort_values("timestamp").reset_index(drop=True)

    # Un dataset real puede no traer alguna columna (Mendota no publica viento):
    # se crean vacías para que las derivadas existan y la selección por
    # cobertura las descarte después, en vez de romper aquí.
    for col in ("chlorophyll_a", "temp_surface", "wind_speed"):
        if col not in d.columns:
            d[col] = float("nan")

    d["chl_lag1"] = d["chlorophyll_a"].shift(1)
    d["chl_trend3"] = d["chlorophyll_a"] - d["chlorophyll_a"].shift(3)
    d["temp_mean3"] = d["temp_surface"].rolling(3, min_periods=1).mean()
    d["wind_mean3"] = d["wind_speed"].rolling(3, min_periods=1).mean()

    # Objetivo: la observación más próxima a origen + horizonte, por fecha
    objetivo = d[["timestamp", "chlorophyll_a"]].rename(
        columns={"timestamp": "target_time", "chlorophyll_a": "target_level"})
    d["_buscado"] = d["timestamp"] + pd.Timedelta(days=horizon_days)
    d = pd.merge_asof(
        d.sort_values("_buscado"),
        objetivo.sort_values("target_time"),
        left_on="_buscado", right_on="target_time",
        direction="nearest", tolerance=pd.Timedelta(days=tolerancia_dias),
    )

    d["horizon_real_days"] = (d["target_time"] - d["timestamp"]).dt.total_seconds() / 86400
    d["target_delta"] = d["target_level"] - d["chlorophyll_a"]
    d["target_event"] = (d["target_level"] >= BLOOM_THRESHOLD).astype(float)

    # El dropna por variables lo hace train_ml, que primero decide cuáles usar
    # según su cobertura: aquí solo se exige tener objetivo.
    return (d.drop(columns=["_buscado"])
             .dropna(subset=["target_level"])
             .sort_values("timestamp")
             .reset_index(drop=True))


#: Cobertura mínima (fracción de filas no nulas) para que una variable entre en
#: el modelo. Por debajo, se descarta: es preferible un modelo con menos
#: variables que uno que descarta el 90 % de las filas por exigirlas todas.
COBERTURA_MINIMA = 0.5

#: La clorofila-a y sus derivadas son imprescindibles: son el objetivo y su
#: propia inercia, sin las cuales no hay pronóstico posible.
FEATURES_OBLIGATORIAS = ("chlorophyll_a", "chl_lag1")


def seleccionar_features(s: pd.DataFrame,
                         cobertura_minima: float = COBERTURA_MINIMA) -> list[str]:
    """Elige qué predictores usar según su cobertura real en el dataset.

    Un dataset real rara vez trae todas las variables: Lake Mendota, por
    ejemplo, no publica viento en su serie de química de agua, y el nitrógeno
    total solo cubre un tercio de las fechas. Exigirlas todas con un `dropna`
    conjunto vaciaría la tabla y el entrenamiento fallaría sin explicar por qué.

    Se conservan las variables con cobertura suficiente y se descartan las
    demás, dejando constancia en el artefacto (`features`) de cuáles actuaron.
    """
    usables = []
    for f in FEATURES:
        if f not in s.columns:
            continue
        if f in FEATURES_OBLIGATORIAS or s[f].notna().mean() >= cobertura_minima:
            usables.append(f)
    faltan = [f for f in FEATURES_OBLIGATORIAS if f not in usables]
    if faltan:
        raise ValueError(f"Faltan variables imprescindibles: {faltan}")
    return usables


def features_from_state(state: dict[str, float], features: list[str] | None = None) -> np.ndarray:
    """Vector de entrada a partir del estado asimilado (sin histórico, los
    rezagos se aproximan con el valor actual: tendencia nula)."""
    chl = float(state.get("chlorophyll_a", 40.0))
    temp = float(state.get("temp_surface", 22.0))
    viento = float(state.get("wind_speed", 8.0))
    valores = {
        "chlorophyll_a": chl,
        "temp_surface": temp,
        "total_phosphorus": float(state.get("total_phosphorus", 0.15)),
        "total_nitrogen": float(state.get("total_nitrogen",
                                          state.get("total_phosphorus", 0.15) * 10.0)),
        "wind_speed": viento,
        "dissolved_oxygen": float(state.get("dissolved_oxygen", 7.5)),
        "chl_lag1": chl,   # sin histórico, el rezago se aproxima con el actual
        "chl_trend3": 0.0,  # tendencia desconocida → sin sesgo
        "temp_mean3": temp,
        "wind_mean3": viento,
    }
    usar = features or FEATURES
    return np.array([[valores[f] for f in usar]])


# ---------------------------------------------------------------------------
# Entrenamiento
# ---------------------------------------------------------------------------

def train_ml(daily: pd.DataFrame, info: DatasetInfo, basin_id: str, horizon_days: int,
             alpha: float = 1.0, persist: bool = True) -> dict[str, Any]:
    s = build_samples(daily, horizon_days)
    usadas = seleccionar_features(s)
    s = s.dropna(subset=usadas + ["target_level"]).reset_index(drop=True)
    if len(s) < 30:
        raise ValueError(
            f"Histórico insuficiente para entrenar: {len(s)} muestras (mínimo 30) "
            f"con las variables {usadas}")

    X = s[usadas].to_numpy(dtype=float)
    means, scales = X.mean(axis=0), X.std(axis=0) + 1e-9
    Xs = (X - means) / scales

    ridge = Ridge(alpha=alpha).fit(Xs, s["target_delta"].to_numpy())
    y_ev = s["target_event"].to_numpy()
    if y_ev.min() == y_ev.max():
        # Sin variación de clase: probabilidad constante (se declara)
        logit = None
        base_rate = float(y_ev.mean())
    else:
        logit = LogisticRegression(max_iter=500).fit(Xs, y_ev)
        base_rate = float(y_ev.mean())

    pred_delta = ridge.predict(Xs)
    mae = float(np.mean(np.abs(pred_delta - s["target_delta"].to_numpy())))
    mae_persist = float(np.mean(np.abs(s["target_delta"].to_numpy())))

    artefacto = {
        "model_id": "trained-ridge-logit",
        "model_version": f"v1.{horizon_days}d.{info.fingerprint[:8]}",
        "basin_id": basin_id,
        "horizon_days": horizon_days,
        "features": usadas,
        "features_available": [f for f in FEATURES if f in s.columns],
        "features_dropped": [f for f in FEATURES if f not in usadas],
        "means": means.tolist(), "scales": scales.tolist(),
        "ridge": {"coef": ridge.coef_.tolist(), "intercept": float(ridge.intercept_), "alpha": alpha},
        "logistic": ({"coef": logit.coef_[0].tolist(), "intercept": float(logit.intercept_[0])}
                     if logit is not None else None),
        "event_base_rate": base_rate,
        "microcystin_ratio": _microcystin_ratio(daily),
        "metrics_train": {"mae_delta": mae, "mae_persistence": mae_persist,
                          "improvement_pct": (1 - mae / mae_persist) * 100 if mae_persist > 0 else 0.0,
                          "n_samples": int(len(s))},
        "dataset": info.__dict__,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    if persist:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        (MODELS_DIR / _artifact_name(basin_id, horizon_days)).write_text(
            json.dumps(artefacto, indent=2, ensure_ascii=False), encoding="utf-8")
    return artefacto


def _microcystin_ratio(daily: pd.DataFrame) -> float:
    """Relación empírica microcistina/clorofila del histórico (cribado, no medición)."""
    if "microcystin" in daily.columns and daily["microcystin"].notna().any():
        chl = daily["chlorophyll_a"].clip(lower=1.0)
        return float((daily["microcystin"] / chl).median())
    return 0.15


def _artifact_name(basin_id: str, horizon_days: int) -> str:
    return f"ml_ridge_{basin_id}_h{horizon_days}.json"


def load_artifact(basin_id: str, horizon_days: int) -> dict[str, Any] | None:
    p = MODELS_DIR / _artifact_name(basin_id, horizon_days)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def list_artifacts() -> list[dict[str, Any]]:
    if not MODELS_DIR.exists():
        return []
    out = []
    for p in sorted(MODELS_DIR.glob("ml_ridge_*.json")):
        a = json.loads(p.read_text(encoding="utf-8"))
        out.append({k: a[k] for k in ("model_id", "model_version", "basin_id", "horizon_days",
                                      "trained_at", "metrics_train")} | {"file": p.name,
                                                                          "dataset_source": a["dataset"]["source"]})
    return out


# ---------------------------------------------------------------------------
# Adaptador ML entrenado
# ---------------------------------------------------------------------------

class TrainedMLModel(MLModelAdapter):
    def __init__(self, artefacto: dict[str, Any]) -> None:
        self.a = artefacto

    @property
    def model_id(self) -> str:
        return self.a["model_id"]

    @property
    def model_version(self) -> str:
        return self.a["model_version"]

    def forecast(self, posterior_state: dict[str, float], horizon_days: int) -> dict[str, Any]:
        a = self.a
        feats = a.get("features", FEATURES)
        x = (features_from_state(posterior_state, feats) - np.array(a["means"])) / np.array(a["scales"])
        delta = float(np.dot(x[0], a["ridge"]["coef"]) + a["ridge"]["intercept"])
        # El artefacto está entrenado para su horizonte; se escala linealmente si difiere.
        delta *= horizon_days / a["horizon_days"]
        chl_now = float(posterior_state.get("chlorophyll_a", 40.0))
        chl = max(0.3, chl_now + delta)

        if a["logistic"]:
            z = float(np.dot(x[0], a["logistic"]["coef"]) + a["logistic"]["intercept"])
            prob = 1.0 / (1.0 + math.exp(-z))
        else:
            prob = a["event_base_rate"]

        temp = float(posterior_state.get("temp_surface", 22.0))
        do = float(posterior_state.get("dissolved_oxygen", 7.5))
        return {
            "chlorophyll_a": round(chl, 2),
            "microcystin": round(chl * a["microcystin_ratio"], 2),
            "bloom_probability": round(min(0.999, max(0.001, prob)), 4),
            "temp_surface": round(temp, 2),
            "dissolved_oxygen": round(max(0.1, do - 0.02 * max(0.0, chl - chl_now)), 2),
            "model_id": self.model_id,
            "model_version": self.model_version,
            "parameters": {"alpha": a["ridge"]["alpha"], "trained_horizon_days": a["horizon_days"],
                           "features_used": feats,
                           "horizon_days": horizon_days, "n_train": a["metrics_train"]["n_samples"],
                           "dataset_source": a["dataset"]["source"]},
        }


# ---------------------------------------------------------------------------
# Modelo físico calibrado
# ---------------------------------------------------------------------------

class CalibratedPhysicsModel(PhysicsModelAdapter):
    """Crecimiento logístico r(T,P) con r_max y K calibrados al histórico."""
    MODEL_ID = "calibrated-logistic-physics"

    def __init__(self, r_max: float = 0.35, K: float = 120.0, q10: float = 1.9,
                 ks_p: float = 0.03, mixing: float = 0.02, version: str = "v1") -> None:
        self.r_max, self.K, self.q10, self.ks_p, self.mixing = r_max, K, q10, ks_p, mixing
        self._version = version

    @property
    def model_id(self) -> str:
        return self.MODEL_ID

    @property
    def model_version(self) -> str:
        return self._version

    def rate(self, temp: float, phosphorus: float, wind: float) -> float:
        f_t = self.q10 ** ((temp - 20.0) / 10.0)
        f_p = phosphorus / (phosphorus + self.ks_p)
        f_w = max(0.15, 1.0 - self.mixing * wind)
        return self.r_max * f_t * f_p * f_w

    def forecast(self, posterior_state: dict[str, float], horizon_days: int) -> dict[str, Any]:
        chl = float(posterior_state.get("chlorophyll_a", 40.0))
        temp = float(posterior_state.get("temp_surface", 22.0))
        p = float(posterior_state.get("total_phosphorus", 0.15))
        wind = float(posterior_state.get("wind_speed", 8.0))
        r = self.rate(temp, p, wind)
        for _ in range(horizon_days):
            chl = max(0.3, chl + r * chl * (1 - chl / self.K) - 0.05 * chl)
        prob = 1.0 / (1.0 + math.exp(-(chl - BLOOM_THRESHOLD) / 8.0))
        return {
            "chlorophyll_a": round(chl, 2),
            "microcystin": round(chl * 0.15, 2),
            "bloom_probability": round(prob, 4),
            "temp_surface": round(temp, 2),
            "dissolved_oxygen": round(max(0.1, float(posterior_state.get("dissolved_oxygen", 7.5)) - 0.01 * chl), 2),
            "model_id": self.model_id,
            "model_version": self.model_version,
            "parameters": {"r_max": self.r_max, "K": self.K, "q10": self.q10, "ks_p": self.ks_p,
                           "mixing": self.mixing, "horizon_days": horizon_days},
        }

    @classmethod
    def calibrate(cls, daily: pd.DataFrame, horizon_days: int, info: DatasetInfo) -> "CalibratedPhysicsModel":
        """Ajusta r_max y K por búsqueda en rejilla minimizando el MAE del pronóstico
        a ``horizon_days`` sobre el histórico. Es calibración, no aprendizaje: el
        modelo conserva su forma física."""
        s = build_samples(daily, horizon_days)

        # Solo se calibra con filas completas en las variables del proceso.
        # El viento es opcional: si el dataset no lo trae —Mendota no publica
        # meteorología en su serie de química— se usa un valor neutro y el
        # término de mezcla queda constante, en vez de propagar NaN y dejar el
        # ajuste sin solución.
        obligatorias = ["chlorophyll_a", "temp_surface", "total_phosphorus", "target_level"]
        s = s.dropna(subset=obligatorias)
        if len(s) < 20:
            return cls(version=f"v1.uncalibrated.{info.fingerprint[:8]}")

        chl_max = float(daily["chlorophyll_a"].max())
        chl0 = s["chlorophyll_a"].to_numpy(dtype=float)
        temp = s["temp_surface"].to_numpy(dtype=float)
        p = s["total_phosphorus"].to_numpy(dtype=float)
        objetivo = s["target_level"].to_numpy(dtype=float)

        viento_col = s["wind_speed"] if "wind_speed" in s.columns else pd.Series(dtype=float)
        sin_viento = viento_col.isna().all()
        wind = (np.full(len(s), 8.0) if sin_viento
                else viento_col.fillna(viento_col.median()).to_numpy(dtype=float))

        # Vectorizado sobre todas las muestras: misma ecuación que forecast()
        f_t = 1.9 ** ((temp - 20.0) / 10.0)
        f_p = p / (p + 0.03)
        f_w = np.maximum(0.15, 1.0 - 0.02 * wind)

        mejor, mejor_mae = None, float("inf")
        for r_max in np.linspace(0.05, 0.8, 16):
            r = r_max * f_t * f_p * f_w
            for K in np.linspace(max(30.0, chl_max * 0.8), max(60.0, chl_max * 2.0), 10):
                chl = chl0.copy()
                for _ in range(horizon_days):
                    chl = np.maximum(0.3, chl + r * chl * (1 - chl / K) - 0.05 * chl)
                mae = float(np.nanmean(np.abs(chl - objetivo)))
                if np.isfinite(mae) and mae < mejor_mae:
                    mejor, mejor_mae = cls(r_max=float(r_max), K=float(K)), mae

        if mejor is None:
            # Ninguna combinación dio un error finito: se devuelve el modelo por
            # defecto marcado como no calibrado, para que el informe lo declare.
            return cls(version=f"v1.uncalibrated.{info.fingerprint[:8]}")

        sufijo = "cal" if not sin_viento else "cal.sinviento"
        mejor._version = f"v1.{sufijo}.{info.fingerprint[:8]}"
        return mejor
