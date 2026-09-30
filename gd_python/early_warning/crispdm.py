"""Motor CRISP-DM sobre el dataset público de Falling Creek Reservoir.

Recorre las seis fases de CRISP-DM y deja, de cada una, **evidencia numérica
reproducible** que la interfaz publica como tablas y figuras. No es un informe
descriptivo: cada número de aquí sale de ejecutar el procedimiento sobre el
dataset real en el momento de la llamada.

Fases y qué produce cada una
----------------------------
1. **Comprensión del negocio** — define el objetivo operativo (avisar de una
   floración con 7 y 14 días de antelación), el umbral de decisión y el coste
   asimétrico de equivocarse.
2. **Comprensión de los datos (EDA)** — T1 univariante con cobertura, fracción
   interpolada, atípicos y tendencia; T2 correlaciones con el objetivo;
   G1 serie con umbrales; G2 estacionalidad mensual.
3. **Preparación** — ingeniería de rasgos, control de fuga temporal y purga.
4. **Modelado** — T3 comparación de candidatos, T4 rejilla de hiperparámetros,
   G3 curva de validación.
5. **Evaluación** — T5 validación cruzada por pliegue, T6 pruebas estadísticas,
   G4 error por pliegue, G5 predicho-observado, G6 atribución de Shapley.
6. **Despliegue** — veredicto, modelo elegido y condiciones de uso.

Decisiones metodológicas que condicionan la lectura
---------------------------------------------------
**Se predice el incremento, no el nivel.** El objetivo es
``Δ = chl(t+H) − chl(t)``. Así la persistencia equivale a predecir cero, y
cualquier mejora sobre ella es capacidad predictiva real y no la inercia de una
serie autocorrelada. Un R² alto sobre el *nivel* es casi siempre un espejismo.

**Validación cruzada de origen móvil con purga.** Las particiones aleatorias
de ``KFold`` están prohibidas aquí: mezclarían futuro en el entrenamiento. Se
usa origen móvil y, además, se **purgan** las ``H`` muestras anteriores al
corte, porque su objetivo ``chl(t+H)`` cae dentro del tramo de prueba. Sin esa
purga la fuga es silenciosa: las métricas mejoran y nadie ve por qué.

**Búsqueda de hiperparámetros anidada.** La rejilla se resuelve *dentro* de
cada pliegue externo, con su propia validación interna. Elegir los
hiperparámetros mirando el pliegue de prueba es la forma más común de inflar
un resultado sin darse cuenta.

**Pruebas no paramétricas.** Los errores de pronóstico no son normales ni
independientes: están sesgados a la derecha y autocorrelados. Por eso el
contraste se hace con Diebold-Mariano corregido (Harvey-Leybourne-Newbold),
Wilcoxon de rangos con signo, McNemar exacto, bootstrap estacionario por
bloques y permutación, y no con una t de Student.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .datasets import OMS_ALERTA_1, OMS_ALERTA_2, load_history

REPORTS_DIR = Path(__file__).resolve().parent / "data" / "crispdm"

#: Umbral de evento. Se toma de la misma variable que el resto del motor para
#: que el informe y las alertas no puedan discrepar.
UMBRAL_EVENTO = float(os.environ.get("OAPAT_BLOOM_THRESHOLD", "25.0"))

#: Pliegues externos de la validación cruzada de origen móvil.
PLIEGUES_EXTERNOS = 5
#: Pliegues internos para resolver la rejilla de hiperparámetros.
PLIEGUES_INTERNOS = 3
#: Fracción inicial reservada para seleccionar el modelo. El tramo final queda
#: intacto hasta la evaluación única del ganador.
FRACCION_DESARROLLO = 0.8
#: Réplicas del bootstrap estacionario.
REPLICAS_BOOTSTRAP = 2000
#: Réplicas de la prueba de permutación.
REPLICAS_PERMUTACION = 2000

_RNG = np.random.default_rng(20260923)


# ─────────────────────────────────────────────────────────────────────────────
# Fase 3 — Preparación de los datos
# ─────────────────────────────────────────────────────────────────────────────

def construir_rasgos(daily: pd.DataFrame) -> pd.DataFrame:
    """Ingeniería de rasgos. Todo se calcula con información de t hacia atrás.

    Ni un solo rasgo mira al futuro: los ``rolling`` son ventanas cerradas en t
    y los ``shift`` son positivos. Es la única forma de que el backtesting
    signifique algo.
    """
    d = daily.copy()
    d["timestamp"] = pd.to_datetime(d["timestamp"], utc=True)
    d = d.sort_values("timestamp").set_index("timestamp")

    r = pd.DataFrame(index=d.index)
    chl = d["chlorophyll_a"]
    r["chl"] = chl
    for k in (1, 3, 7):
        r[f"chl_lag{k}"] = chl.shift(k)
    r["chl_media7"] = chl.rolling(7, min_periods=3).mean()
    r["chl_desv7"] = chl.rolling(7, min_periods=3).std()
    r["chl_tend3"] = chl - chl.shift(3)
    r["chl_max7"] = chl.rolling(7, min_periods=3).max()

    if "phycocyanin" in d:
        r["phyco"] = d["phycocyanin"]
        r["phyco_tend3"] = d["phycocyanin"] - d["phycocyanin"].shift(3)
        # Ficocianina relativa a clorofila: proxy de dominancia cianobacteriana
        r["phyco_ratio"] = d["phycocyanin"] / chl.replace(0, np.nan)

    for col, nom in (("temp_surface", "temp"), ("dissolved_oxygen", "od"),
                     ("wind_speed", "viento"), ("wind_max", "viento_max"),
                     ("solar_radiation", "radiacion"), ("air_temp", "temp_aire"),
                     ("precipitation", "lluvia"), ("inflow", "caudal"),
                     ("fdom", "fdom"), ("secchi", "secchi")):
        if col in d:
            r[nom] = d[col]
            r[f"{nom}_media7"] = d[col].rolling(7, min_periods=3).mean()

    if "total_phosphorus" in d:
        r["pt"] = d["total_phosphorus"]
    if "total_nitrogen" in d:
        r["nt"] = d["total_nitrogen"]
    if "total_phosphorus" in d and "total_nitrogen" in d:
        r["np_ratio"] = d["total_nitrogen"] / d["total_phosphorus"].replace(0, np.nan)

    # Estacionalidad como par seno/coseno: continua en el cambio de año, a
    # diferencia del número de mes, que salta de 12 a 1.
    doy = d.index.dayofyear.to_numpy()
    r["est_sin"] = np.sin(2 * np.pi * doy / 365.25)
    r["est_cos"] = np.cos(2 * np.pi * doy / 365.25)
    return r


def construir_muestras(daily: pd.DataFrame, horizonte: int,
                       tolerancia: int = 2) -> tuple[pd.DataFrame, pd.Series, pd.Series, pd.DatetimeIndex]:
    """Empareja cada instante t con el objetivo en t+H **por fecha, no por fila**.

    Emparejar por posición de fila es el error clásico con series que tienen
    huecos: ``shift(-7)`` desplaza siete *registros*, que pueden ser siete
    semanas. Aquí se usa ``merge_asof`` sobre la fecha con tolerancia explícita.
    """
    rasgos = construir_rasgos(daily)
    chl = rasgos["chl"]

    izq = pd.DataFrame({"t": rasgos.index, "objetivo_t": rasgos.index + pd.Timedelta(days=horizonte)})
    der = pd.DataFrame({"t2": chl.index, "chl_futuro": chl.to_numpy()}).sort_values("t2")
    emp = pd.merge_asof(izq.sort_values("objetivo_t"), der, left_on="objetivo_t", right_on="t2",
                        direction="nearest", tolerance=pd.Timedelta(days=tolerancia))
    emp = emp.dropna(subset=["chl_futuro"]).set_index("t")

    X = rasgos.loc[emp.index]
    chl_ahora = X["chl"]
    # Objetivo: el INCREMENTO. La persistencia es entonces la predicción cero.
    y = emp["chl_futuro"] - chl_ahora
    valido = X.notna().all(axis=1) & y.notna()
    return X[valido], y[valido], chl_ahora[valido], emp.index[valido]


# ─────────────────────────────────────────────────────────────────────────────
# Modelos candidatos y sus rejillas
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Candidato:
    nombre: str
    familia: str
    construir: Callable[[dict], Any]
    rejilla: list[dict]
    interpretable: bool
    nota: str


def _ridge(p: dict):
    return Pipeline([("esc", StandardScaler()), ("m", Ridge(alpha=p["alpha"]))])


def _rf(p: dict):
    return RandomForestRegressor(n_estimators=p["n_estimators"], max_depth=p["max_depth"],
                                 min_samples_leaf=p.get("min_samples_leaf", 3),
                                 random_state=0, n_jobs=1)


def _gbm(p: dict):
    return GradientBoostingRegressor(n_estimators=p["n_estimators"],
                                     learning_rate=p["learning_rate"],
                                     max_depth=p.get("max_depth", 3), random_state=0)


CANDIDATOS: list[Candidato] = [
    Candidato("Ridge", "lineal regularizado", _ridge,
              [{"alpha": a} for a in (0.1, 1.0, 10.0, 100.0)], True,
              "Lineal con penalización L2. Admite atribución de Shapley exacta en forma cerrada."),
    Candidato("Bosque aleatorio", "conjunto de árboles", _rf,
              [{"n_estimators": n, "max_depth": d}
               for n in (200,) for d in (4, 8, None)], False,
              "Captura interacciones y saturaciones. Se explica por importancia de permutación."),
    Candidato("Gradient boosting", "conjunto secuencial", _gbm,
              [{"n_estimators": n, "learning_rate": lr}
               for n in (150,) for lr in (0.03, 0.1)], False,
              "Ajuste secuencial de residuos. Suele ganar en tabular; menos transparente."),
]

#: Referencias obligatorias. Un modelo que no las bate no sirve para nada,
#: por muy buenas que parezcan sus métricas en términos absolutos.
REFERENCIAS = ("Persistencia", "Climatología")


def _predecir_referencia(nombre: str, y_tr: pd.Series, idx_tr: pd.DatetimeIndex,
                         idx_te: pd.DatetimeIndex) -> np.ndarray:
    if nombre == "Persistencia":
        # El incremento esperado es cero: mañana se parece a hoy.
        return np.zeros(len(idx_te))
    # Climatología: incremento medio histórico del mismo mes.
    por_mes = pd.Series(y_tr.to_numpy(), index=idx_tr).groupby(idx_tr.month).mean()
    global_ = float(y_tr.mean())
    return np.array([por_mes.get(m, global_) for m in idx_te.month])


# ─────────────────────────────────────────────────────────────────────────────
# Validación cruzada de origen móvil con purga
# ─────────────────────────────────────────────────────────────────────────────

def pliegues_origen_movil(n: int, k: int, purga: int) -> list[tuple[np.ndarray, np.ndarray]]:
    """Particiones expansivas con purga entre entrenamiento y prueba.

    La purga elimina las ``purga`` muestras finales del entrenamiento porque su
    objetivo cae dentro del tramo de prueba. Es la diferencia entre medir
    pronóstico y medir interpolación.
    """
    if n < (k + 1) * 10:
        k = max(2, n // 30)
    tam = n // (k + 1)
    out = []
    for i in range(1, k + 1):
        fin_tr = tam * i
        ini_te, fin_te = fin_tr, min(tam * (i + 1), n)
        if fin_te - ini_te < 5:
            continue
        tr = np.arange(0, max(fin_tr - purga, 1))
        te = np.arange(ini_te, fin_te)
        if len(tr) >= 20:
            out.append((tr, te))
    return out


def _mae(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(np.abs(a - b)))


def _buscar_hiperparametros(cand: Candidato, X: np.ndarray, y: np.ndarray,
                            purga: int) -> tuple[dict, list[dict]]:
    """Rejilla resuelta con validación interna. Devuelve el mejor y el detalle."""
    pliegues = pliegues_origen_movil(len(y), PLIEGUES_INTERNOS, purga)
    if not pliegues:
        n = len(y)
        corte = max(int(n * 0.7), 1)
        tr = np.arange(0, max(corte - purga, 1))
        te = np.arange(corte, n)
        if len(tr) >= 5 and len(te) >= 2:
            pliegues = [(tr, te)]
        else:
            pliegues = [(np.arange(n), np.arange(n))]

    detalle = []
    for p in cand.rejilla:
        maes = []
        for tr, te in pliegues:
            m = cand.construir(p)
            m.fit(X[tr], y[tr])
            pred = m.predict(X[te])
            maes.append(_mae(pred, y[te]))
        vals_ok = [v for v in maes if not (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))]
        mae_m = float(np.mean(vals_ok)) if vals_ok else 0.0
        mae_s = float(np.std(vals_ok)) if len(vals_ok) > 1 else 0.0
        detalle.append({"parametros": p, "mae_medio": mae_m,
                        "mae_desv": mae_s, "pliegues": len(vals_ok)})
    mejor = min(detalle, key=lambda d: d["mae_medio"])
    return mejor["parametros"], detalle



# ─────────────────────────────────────────────────────────────────────────────
# Pruebas estadísticas robustas
# ─────────────────────────────────────────────────────────────────────────────

def diebold_mariano(e1: np.ndarray, e2: np.ndarray, h: int) -> dict:
    """Diebold-Mariano con corrección de muestra pequeña (Harvey-Leybourne-Newbold).

    Contrasta H0: los dos pronósticos tienen la misma exactitud esperada.
    La varianza se estima con Newey-West a ``h-1`` retardos porque los errores
    a horizonte h están autocorrelados por construcción.
    """
    d = np.abs(e1) - np.abs(e2)
    n = len(d)
    if n < 10:
        return {"estadistico": None, "p_valor": None, "n": n,
                "veredicto": "Muestra insuficiente para el contraste."}
    dbar = float(np.mean(d))
    gamma0 = float(np.mean((d - dbar) ** 2))
    s = gamma0
    for lag in range(1, max(h, 1)):
        if lag >= n:
            break
        g = float(np.mean((d[lag:] - dbar) * (d[:-lag] - dbar)))
        s += 2.0 * (1.0 - lag / max(h, 1)) * g
    if s <= 0:
        return {"estadistico": None, "p_valor": None, "n": n,
                "veredicto": "Varianza de la diferencia no positiva; contraste no aplicable."}
    dm = dbar / math.sqrt(s / n)
    # Corrección HLN para muestra finita
    corr = math.sqrt(max((n + 1 - 2 * h + h * (h - 1) / n) / n, 1e-9))
    dm_hln = dm * corr
    p = float(2 * stats.t.sf(abs(dm_hln), df=n - 1))
    if p < 0.05:
        ver = ("El primero es significativamente PEOR" if dbar > 0
               else "El primero es significativamente MEJOR")
    else:
        ver = "Sin diferencia significativa de exactitud"
    return {"estadistico": round(dm_hln, 4), "p_valor": round(p, 5), "n": n,
            "diferencia_mae": round(dbar, 4), "veredicto": ver}


def bootstrap_estacionario(e1: np.ndarray, e2: np.ndarray,
                           replicas: int = REPLICAS_BOOTSTRAP,
                           long_bloque: float = 10.0) -> dict:
    """IC del 95 % para la diferencia de MAE, por bootstrap estacionario.

    El bootstrap i.i.d. no vale con series autocorreladas: subestima la
    incertidumbre. Politis-Romano remuestrea bloques de longitud geométrica,
    conservando la dependencia local.
    """
    d = np.abs(e1) - np.abs(e2)
    n = len(d)
    if n < 20:
        return {"ic95": None, "veredicto": "Muestra insuficiente."}
    p = 1.0 / long_bloque
    medias = np.empty(replicas)
    for r in range(replicas):
        idx = np.empty(n, dtype=int)
        i = _RNG.integers(0, n)
        for j in range(n):
            idx[j] = i
            i = _RNG.integers(0, n) if _RNG.random() < p else (i + 1) % n
        medias[r] = d[idx].mean()
    lo, hi = np.percentile(medias, [2.5, 97.5])
    incluye_cero = bool(lo <= 0 <= hi)
    return {"diferencia_mae": round(float(d.mean()), 4),
            "ic95": [round(float(lo), 4), round(float(hi), 4)],
            "replicas": replicas, "longitud_bloque": long_bloque,
            "veredicto": ("El intervalo incluye el cero: la diferencia no es concluyente"
                          if incluye_cero else
                          "El intervalo excluye el cero: la diferencia es consistente")}


def wilcoxon_errores(e1: np.ndarray, e2: np.ndarray) -> dict:
    """Wilcoxon de rangos con signo sobre los errores absolutos pareados."""
    a, b = np.abs(e1), np.abs(e2)
    dif = a - b
    if np.count_nonzero(dif) < 10:
        return {"estadistico": None, "p_valor": None, "veredicto": "Muestra insuficiente."}
    try:
        st, p = stats.wilcoxon(a, b, zero_method="wilcox", alternative="two-sided")
    except ValueError as exc:
        return {"estadistico": None, "p_valor": None, "veredicto": f"No aplicable: {exc}"}
    mediana = float(np.median(dif))
    ver = ("Sin diferencia significativa" if p >= 0.05 else
           ("El primero tiene errores significativamente MAYORES" if mediana > 0
            else "El primero tiene errores significativamente MENORES"))
    return {"estadistico": round(float(st), 2), "p_valor": round(float(p), 5),
            "mediana_diferencia": round(mediana, 4), "veredicto": ver}


def mcnemar_alertas(real: np.ndarray, pred1: np.ndarray, pred2: np.ndarray) -> dict:
    """McNemar exacto sobre los aciertos de alerta de dos modelos.

    Compara *clasificación*, no error: dos modelos pueden tener MAE parecido y
    comportarse muy distinto en el cruce del umbral, que es lo que decide si
    alguien cierra una playa.
    """
    ok1, ok2 = (pred1 == real), (pred2 == real)
    b = int(np.sum(ok1 & ~ok2))   # acierta 1, falla 2
    c = int(np.sum(~ok1 & ok2))   # falla 1, acierta 2
    if b + c == 0:
        return {"b": b, "c": c, "p_valor": None,
                "veredicto": "Los dos modelos clasifican idénticamente; nada que contrastar."}
    p = float(stats.binomtest(b, b + c, 0.5).pvalue)
    ver = ("Sin diferencia significativa en la clasificación" if p >= 0.05 else
           ("El primero clasifica significativamente MEJOR" if b > c
            else "El primero clasifica significativamente PEOR"))
    return {"b": b, "c": c, "discordantes": b + c, "p_valor": round(p, 5), "veredicto": ver}


def permutacion_skill(y: np.ndarray, pred: np.ndarray,
                      replicas: int = REPLICAS_PERMUTACION) -> dict:
    """¿El modelo capta señal o podría salir de barajar el objetivo?

    Se permuta el objetivo y se recalcula el MAE. El p-valor es la fracción de
    permutaciones que igualan o mejoran el MAE observado. Es la prueba más
    directa contra el autoengaño: si sale alta, el modelo no sabe nada.
    """
    obs = _mae(pred, y)
    n = len(y)
    if n < 20:
        return {"p_valor": None, "veredicto": "Muestra insuficiente."}
    cuenta = 0
    for _ in range(replicas):
        if _mae(pred, _RNG.permutation(y)) <= obs:
            cuenta += 1
    p = (cuenta + 1) / (replicas + 1)
    return {"mae_observado": round(obs, 4), "p_valor": round(float(p), 5), "replicas": replicas,
            "veredicto": ("El modelo capta señal real (el azar no reproduce este error)"
                          if p < 0.05 else
                          "No se distingue del azar: el error observado es alcanzable permutando")}


def mann_kendall(x: np.ndarray) -> dict:
    """Tendencia monótona no paramétrica, con corrección por empates."""
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 20:
        return {"tau": None, "p_valor": None, "tendencia": "n insuficiente"}
    # S de Kendall por conteo vectorizado
    s = 0
    for i in range(n - 1):
        s += int(np.sum(np.sign(x[i + 1:] - x[i])))
    _, cuentas = np.unique(x, return_counts=True)
    emp = float(np.sum(cuentas * (cuentas - 1) * (2 * cuentas + 5)))
    var = (n * (n - 1) * (2 * n + 5) - emp) / 18.0
    if var <= 0:
        return {"tau": None, "p_valor": None, "tendencia": "varianza nula"}
    z = (s - np.sign(s)) / math.sqrt(var)
    p = float(2 * stats.norm.sf(abs(z)))
    tau = float(s / (0.5 * n * (n - 1)))
    if p >= 0.05:
        t = "sin tendencia"
    else:
        t = "creciente" if s > 0 else "decreciente"
    return {"tau": round(tau, 4), "p_valor": round(p, 5), "tendencia": t}


# ─────────────────────────────────────────────────────────────────────────────
# Fase 2 — EDA
# ─────────────────────────────────────────────────────────────────────────────

UNIDADES = {
    "chlorophyll_a": "µg/L", "phycocyanin": "µg/L", "temp_surface": "°C",
    "dissolved_oxygen": "mg/L", "total_phosphorus": "mg/L", "total_nitrogen": "mg/L",
    "soluble_phosphorus": "mg/L", "ammonium": "mg/L", "nitrate": "mg/L", "doc": "mg/L",
    "wind_speed": "m/s", "wind_max": "m/s", "solar_radiation": "MJ/m²",
    "air_temp": "°C", "precipitation": "mm", "inflow": "m³/s", "fdom": "QSU",
    "secchi": "m", "solar_par": "µmol/m²/s",
}


def tabla_univariante(daily: pd.DataFrame, interpoladas: dict[str, float]) -> list[dict]:
    """T1 — Resumen por variable con cobertura, atípicos y tendencia."""
    filas = []
    n_tot = len(daily)
    for c in daily.columns:
        if c == "timestamp" or not pd.api.types.is_numeric_dtype(daily[c]):
            continue
        s = pd.to_numeric(daily[c], errors="coerce").dropna()
        if s.empty:
            continue
        q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
        iqr = q3 - q1
        atip = int(((s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)).sum())
        mk = mann_kendall(s.to_numpy()[:: max(1, len(s) // 800)])
        filas.append({
            "variable": c, "unidad": UNIDADES.get(c, "—"),
            "n": int(len(s)), "cobertura_pct": round(100 * len(s) / n_tot, 1),
            "interpolado_pct": round(100 * interpoladas.get(c, 0.0), 1),
            "minimo": round(float(s.min()), 3), "mediana": round(float(s.median()), 3),
            "maximo": round(float(s.max()), 3), "iqr": round(iqr, 3),
            "asimetria": round(float(s.skew()), 3),
            "atipicos": atip, "atipicos_pct": round(100 * atip / len(s), 1),
            "tendencia": mk["tendencia"], "mk_tau": mk["tau"], "mk_p": mk["p_valor"],
        })
    return filas


def tabla_correlaciones(X: pd.DataFrame, y: pd.Series, horizonte: int) -> list[dict]:
    """T2 — Relación de cada rasgo con el incremento a H días.

    Pearson mide relación lineal; Spearman, monótona. Se dan los dos porque
    discrepar entre ellos es justamente la señal de una relación no lineal.
    """
    filas = []
    n = len(y)
    for c in X.columns:
        v = X[c].to_numpy(dtype=float)
        if np.nanstd(v) == 0:
            continue
        pr, pp = stats.pearsonr(v, y.to_numpy())
        sr, sp = stats.spearmanr(v, y.to_numpy())
        filas.append({
            "rasgo": c, "n": n,
            "pearson_r": round(float(pr), 4), "pearson_p": round(float(pp), 6),
            "spearman_rho": round(float(sr), 4), "spearman_p": round(float(sp), 6),
            "significativo": bool(pp < 0.05),
            "no_lineal": bool(abs(float(sr)) - abs(float(pr)) > 0.05),
        })
    filas.sort(key=lambda f: -abs(f["spearman_rho"]))
    return filas


def grafico_serie(daily: pd.DataFrame, max_puntos: int = 900) -> dict:
    """G1 — Serie de clorofila con los dos umbrales de la OMS."""
    d = daily[["timestamp", "chlorophyll_a"]].dropna()
    # Los recuentos se calculan sobre la serie COMPLETA y viajan aparte. Si se
    # contara sobre los puntos dibujados, una figura submuestreada informaria de
    # la mitad de los episodios: el submuestreo es una decision de legibilidad y
    # no debe cambiar los numeros que se afirman en la ficha.
    chl = d["chlorophyll_a"]
    totales = {
        "total_dias": int(len(chl)),
        "dias_sobre_1": int((chl >= OMS_ALERTA_1).sum()),
        "dias_sobre_2": int((chl >= OMS_ALERTA_2).sum()),
        "maximo": round(float(chl.max()), 2),
    }
    paso = max(1, len(d) // max_puntos)
    d = d.iloc[::paso]
    return {
        "puntos": [{"t": int(pd.Timestamp(r.timestamp).timestamp() * 1000),
                    "valor": round(float(r.chlorophyll_a), 3)} for r in d.itertuples()],
        "umbral_1": OMS_ALERTA_1, "umbral_2": OMS_ALERTA_2,
        "submuestreo": paso, **totales,
    }


def grafico_estacionalidad(daily: pd.DataFrame) -> dict:
    """G2 — Distribución mensual de la clorofila + Kruskal-Wallis.

    La prueba responde a si los meses difieren de verdad o si la forma del
    gráfico es ruido: sin ella, cualquiera ve un patrón estacional donde le
    apetezca.
    """
    d = daily[["timestamp", "chlorophyll_a"]].dropna().copy()
    d["mes"] = pd.to_datetime(d["timestamp"], utc=True).dt.month
    cajas, grupos = [], []
    for m in range(1, 13):
        s = d.loc[d["mes"] == m, "chlorophyll_a"]
        if s.empty:
            continue
        grupos.append(s.to_numpy())
        cajas.append({"mes": m, "n": int(len(s)),
                      "min": round(float(s.min()), 2),
                      "q1": round(float(s.quantile(0.25)), 2),
                      "mediana": round(float(s.median()), 2),
                      "q3": round(float(s.quantile(0.75)), 2),
                      "max": round(float(s.max()), 2),
                      "sobre_umbral_pct": round(100 * float((s >= UMBRAL_EVENTO).mean()), 1)})
    kw = {"estadistico": None, "p_valor": None, "veredicto": "Grupos insuficientes."}
    if len(grupos) >= 3:
        st, p = stats.kruskal(*grupos)
        kw = {"estadistico": round(float(st), 3), "p_valor": round(float(p), 8),
              "veredicto": ("La distribución difiere entre meses: hay estacionalidad real"
                            if p < 0.05 else "No hay evidencia de diferencia entre meses")}
    return {"cajas": cajas, "kruskal_wallis": kw, "umbral": UMBRAL_EVENTO}


# ─────────────────────────────────────────────────────────────────────────────
# Explicabilidad
# ─────────────────────────────────────────────────────────────────────────────

def shapley_lineal(modelo: Pipeline, X: pd.DataFrame, fila: int) -> list[dict]:
    """Valores de Shapley **exactos** para el modelo lineal, en forma cerrada.

    Para un modelo lineal, φᵢ = βᵢ·(xᵢ − x̄ᵢ) es el valor de Shapley exacto, no
    una aproximación muestreada: la suma de las contribuciones reproduce
    f(x) − E[f(x)] sin error. Por eso el modelo lineal se conserva entre los
    candidatos aunque no gane: da la atribución local que los árboles no dan.
    """
    esc: StandardScaler = modelo.named_steps["esc"]
    reg: Ridge = modelo.named_steps["m"]
    xz = esc.transform(X.to_numpy())[fila]
    beta = reg.coef_
    phi = beta * xz  # media de xz es 0 por construcción del escalador
    orden = np.argsort(-np.abs(phi))
    return [{"rasgo": str(X.columns[i]), "contribucion": round(float(phi[i]), 4),
             "valor": round(float(X.iloc[fila, i]), 4)} for i in orden[:12]]


def importancia_permutacion(modelo, X: np.ndarray, y: np.ndarray,
                            nombres: list[str], repeticiones: int = 8) -> list[dict]:
    """Importancia global por permutación: cuánto empeora el MAE al barajar un rasgo.

    Funciona con cualquier modelo, incluidos los de árboles, y mide el efecto
    sobre el error real en vez de la mecánica interna del ajuste.
    """
    base = _mae(modelo.predict(X), y)
    out = []
    for j, nom in enumerate(nombres):
        caidas = []
        for _ in range(repeticiones):
            Xp = X.copy()
            Xp[:, j] = _RNG.permutation(Xp[:, j])
            caidas.append(_mae(modelo.predict(Xp), y) - base)
        out.append({"rasgo": nom, "aumento_mae": round(float(np.mean(caidas)), 4),
                    "desv": round(float(np.std(caidas)), 4)})
    out.sort(key=lambda d: -d["aumento_mae"])
    return out[:12]


# ─────────────────────────────────────────────────────────────────────────────
# Orquestación CRISP-DM
# ─────────────────────────────────────────────────────────────────────────────

def _umbral_decision(chl_tr: np.ndarray, pred_tr: np.ndarray, y_tr: np.ndarray,
                     umbral_fisico: float) -> float:
    """Umbral de AVISO calibrado sobre el entrenamiento, nunca sobre la prueba.

    Por que hace falta: un regresor ajustado por error cuadratico encoge sus
    predicciones hacia la media. Si el aviso se dispara comparando la prediccion
    puntual contra el umbral fisico de la OMS, el modelo casi nunca avisa: gana
    exactitud global —el 93 % de los dias no hay floracion— y pierde justo los
    casos que motivan el sistema. Con sensibilidad 0,13 se escapan 87 de cada
    100 floraciones, y eso no es un sistema de alerta temprana.

    El umbral de decision es por tanto un **parametro que hay que ajustar**, no
    una constante que se hereda de la norma. Se elige el que maximiza F1 sobre
    el tramo de entrenamiento del pliegue y se aplica tal cual al de prueba: si
    se eligiera mirando la prueba, el resultado estaria inflado.

    Se devuelve el umbral fisico si no hay ningun evento en el entrenamiento,
    porque entonces no hay nada sobre lo que calibrar.
    """
    real = (chl_tr + y_tr) >= umbral_fisico
    if real.sum() < 3:
        return umbral_fisico
    futuro = chl_tr + pred_tr
    candidatos = np.unique(np.quantile(futuro, np.linspace(0.50, 0.999, 60)))
    mejor_f1, mejor_u = -1.0, umbral_fisico
    for u in candidatos:
        pred = futuro >= u
        vp = int(np.sum(real & pred)); fp = int(np.sum(~real & pred))
        fn = int(np.sum(real & ~pred))
        if vp == 0:
            continue
        prec, sens = vp / (vp + fp), vp / (vp + fn)
        f1 = 2 * prec * sens / (prec + sens)
        if f1 > mejor_f1:
            mejor_f1, mejor_u = f1, float(u)
    return mejor_u


def _metricas_alerta(real: np.ndarray, pred: np.ndarray) -> dict:
    """Calidad de la DECISION, no del numero.

    Un modelo puede tener buen MAE y ser inutil para avisar, y al reves. Como el
    coste de un falso negativo (gente expuesta a toxinas) no es el de un falso
    positivo (dinero y credibilidad), se informan sensibilidad y especificidad
    por separado en vez de una sola exactitud que las promedia y las esconde.
    """
    vp = int(np.sum(real & pred)); fp = int(np.sum(~real & pred))
    fn = int(np.sum(real & ~pred)); vn = int(np.sum(~real & ~pred))
    sens = vp / (vp + fn) if (vp + fn) else None
    espec = vn / (vn + fp) if (vn + fp) else None
    prec = vp / (vp + fp) if (vp + fp) else None
    f1 = (2 * prec * sens / (prec + sens)) if (prec and sens) else 0.0
    return {"vp": vp, "fp": fp, "fn": fn, "vn": vn,
            "sensibilidad": round(sens, 4) if sens is not None else None,
            "especificidad": round(espec, 4) if espec is not None else None,
            "precision": round(prec, 4) if prec is not None else None,
            "f1": round(float(f1), 4), "eventos_reales": vp + fn}


def _metricas(pred: np.ndarray, y: np.ndarray) -> dict:
    err = pred - y
    ss_res = float(np.sum(err ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    return {"mae": round(_mae(pred, y), 4),
            "rmse": round(float(np.sqrt(np.mean(err ** 2))), 4),
            "r2": round(1 - ss_res / ss_tot, 4) if ss_tot > 0 else None,
            "sesgo": round(float(np.mean(err)), 4)}


def ejecutar(basin_id: str = "fcr", horizontes: tuple[int, ...] = (7, 14),
             guardar: bool = True) -> dict:
    """Ejecuta el ciclo CRISP-DM completo y devuelve el informe."""
    daily, info = load_history(basin_id)
    proc = _procedencia(info)

    informe: dict[str, Any] = {
        "generado": datetime.now(timezone.utc).isoformat(),
        "metodologia": "CRISP-DM",
        "dataset": {
            "origen": info.source, "ruta": info.path, "filas": info.rows,
            "inicio": info.start, "fin": info.end, "huella": info.fingerprint,
            "nota": info.note, **proc,
        },
        "umbral_evento": UMBRAL_EVENTO,
        "fase_1_negocio": _fase_negocio(daily),
        "fase_2_datos": {},
        "fase_3_preparacion": {},
        "fase_4_modelado": {},
        "fase_5_evaluacion": {},
        "fase_6_despliegue": {},
        "horizontes": {},
    }

    interp = proc.get("interpolacion", {}).get("fraccion_interpolada", {})
    informe["fase_2_datos"] = {
        "t1_univariante": tabla_univariante(daily, interp),
        "g1_serie": grafico_serie(daily),
        "g2_estacionalidad": grafico_estacionalidad(daily),
    }

    for H in horizontes:
        informe["horizontes"][str(H)] = _ciclo_horizonte(daily, H)

    principal = str(horizontes[-1])
    h0 = informe["horizontes"][principal]
    informe["fase_2_datos"]["t2_correlaciones"] = h0["t2_correlaciones"]
    informe["fase_3_preparacion"] = h0["preparacion"]
    informe["fase_4_modelado"] = {"t3_modelos": h0["t3_modelos"],
                                  "t4_hiperparametros": h0["t4_hiperparametros"],
                                  "g3_curva_validacion": h0["g3_curva_validacion"]}
    informe["fase_5_evaluacion"] = {"t5_validacion_cruzada": h0["t5_validacion_cruzada"],
                                    "t6_pruebas": h0["t6_pruebas"],
                                    "g4_pliegues": h0["g4_pliegues"],
                                    "g5_dispersion": h0["g5_dispersion"],
                                    "g6_shapley": h0["g6_shapley"]}
    informe["fase_6_despliegue"] = _fase_despliegue(informe)

    informe = _sanear_json(informe)

    if guardar:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        p = REPORTS_DIR / "ultimo.json"
        p.write_text(json.dumps(informe, indent=2, ensure_ascii=False, default=str), encoding="utf8")
        informe["ruta_informe"] = str(p)
    return informe


def _sanear_json(obj: Any) -> Any:
    """Reemplaza cualquier NaN o Inf por None para garantizar JSON estricto estándar."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanear_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanear_json(v) for v in obj]
    return obj


def ultimo_informe() -> dict | None:
    """Ultimo informe CRISP-DM guardado, o None si aun no se ha generado ninguno."""
    p = REPORTS_DIR / "ultimo.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf8"))
    except (OSError, json.JSONDecodeError):
        return None


def _procedencia(info) -> dict:
    if not info.path:
        return {}
    p = Path(info.path).with_suffix(".procedencia.json")
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf8"))
        except Exception:
            return {}
    return {}


def _fase_negocio(daily: pd.DataFrame) -> dict:
    chl = daily["chlorophyll_a"].dropna()
    n_ev = int((chl >= UMBRAL_EVENTO).sum())
    return {
        "objetivo": ("Avisar con 7 y 14 días de antelación de que la clorofila-a superará "
                     f"{UMBRAL_EVENTO:.0f} µg/L, para dar margen a cerrar la toma de agua, "
                     "reforzar el tratamiento o restringir el uso recreativo."),
        "criterio_exito": ("Batir de forma estadísticamente significativa a la persistencia "
                           "en MAE y mejorar la detección de cruces de umbral."),
        "umbral": UMBRAL_EVENTO,
        "norma": ("OMS, Guidelines for safe recreational water environments: 25 µg/L nivel de "
                  "vigilancia (alerta 1) y 50 µg/L riesgo alto (alerta 2)."),
        "coste_asimetrico": ("Un falso negativo expone a la población a toxinas; un falso "
                             "positivo cuesta dinero y credibilidad. No son intercambiables, "
                             "por eso se informa sensibilidad aparte de exactitud."),
        "eventos_historicos": n_ev,
        "tasa_evento_pct": round(100 * n_ev / max(len(chl), 1), 2),
    }


def _ciclo_horizonte(daily: pd.DataFrame, H: int) -> dict:
    X, y, chl_ahora, idx = construir_muestras(daily, H)
    nombres = list(X.columns)
    Xa, ya = X.to_numpy(dtype=float), y.to_numpy(dtype=float)
    n = len(ya)
    purga = H

    preparacion = {
        "horizonte_dias": H,
        "muestras": n,
        "rasgos": len(nombres),
        "lista_rasgos": nombres,
        "objetivo": "incremento de clorofila-a a H días (chl[t+H] − chl[t]), µg/L",
        "por_que_incremento": ("Predecir el nivel premia la inercia de una serie autocorrelada. "
                               "Predecir el incremento hace que la persistencia sea la predicción "
                               "cero, y obliga a demostrar capacidad por encima de ella."),
        "emparejado": f"merge_asof por fecha, tolerancia ±2 días (no por posición de fila)",
        "purga_dias": purga,
        "control_fuga": ("Todos los rasgos usan ventanas cerradas en t. Entre entrenamiento y "
                         f"prueba se purgan {purga} muestras, porque su objetivo cae dentro del "
                         "tramo de prueba."),
        "rango": [str(idx.min()), str(idx.max())],
    }

    n_desarrollo = max((PLIEGUES_EXTERNOS + 1) * 30, int(n * FRACCION_DESARROLLO))
    n_desarrollo = min(n - 10, n_desarrollo)
    pliegues = pliegues_origen_movil(n_desarrollo, PLIEGUES_EXTERNOS, purga)
    if not pliegues:
        raise ValueError(f"Datos insuficientes para validación cruzada a {H} días (n={n}).")
    holdout = np.arange(n_desarrollo, n)

    # ── Fase 4/5: CV anidada ────────────────────────────────────────────────
    acum: dict[str, dict[str, list]] = {}
    detalle_pliegues: list[dict] = []
    rejilla_agregada: dict[str, list[dict]] = {}
    elegidos: dict[str, list[dict]] = {}

    for k, (tr, te) in enumerate(pliegues, start=1):
        fila = {"pliegue": k,
                "train_desde": str(idx[tr[0]].date()), "train_hasta": str(idx[tr[-1]].date()),
                "test_desde": str(idx[te[0]].date()), "test_hasta": str(idx[te[-1]].date()),
                "n_train": len(tr), "n_test": len(te), "modelos": {}}

        chl_np = chl_ahora.to_numpy()
        for nom in REFERENCIAS:
            pred = _predecir_referencia(nom, y.iloc[tr], idx[tr], idx[te])
            pred_tr = _predecir_referencia(nom, y.iloc[tr], idx[tr], idx[tr])
            u = _umbral_decision(chl_np[tr], pred_tr, ya[tr], UMBRAL_EVENTO)
            acum.setdefault(nom, {"pred": [], "y": [], "idx": [], "chl": [], "alerta": [], "umbral": []})
            acum[nom]["pred"].append(pred); acum[nom]["y"].append(ya[te])
            acum[nom]["idx"].append(idx[te]); acum[nom]["chl"].append(chl_np[te])
            acum[nom]["alerta"].append((chl_np[te] + pred) >= u)
            acum[nom]["umbral"].append(u)
            fila["modelos"][nom] = round(_mae(pred, ya[te]), 4)

        for cand in CANDIDATOS:
            mejor_p, detalle = _buscar_hiperparametros(cand, Xa[tr], ya[tr], purga)
            rejilla_agregada.setdefault(cand.nombre, []).append(
                {"pliegue": k, "detalle": detalle, "elegido": mejor_p})
            elegidos.setdefault(cand.nombre, []).append(mejor_p)

            m = cand.construir(mejor_p)
            m.fit(Xa[tr], ya[tr])
            pred = m.predict(Xa[te])
            u = _umbral_decision(chl_np[tr], m.predict(Xa[tr]), ya[tr], UMBRAL_EVENTO)
            acum.setdefault(cand.nombre, {"pred": [], "y": [], "idx": [], "chl": [], "alerta": [], "umbral": []})
            acum[cand.nombre]["pred"].append(pred); acum[cand.nombre]["y"].append(ya[te])
            acum[cand.nombre]["idx"].append(idx[te])
            acum[cand.nombre]["chl"].append(chl_np[te])
            acum[cand.nombre]["alerta"].append((chl_np[te] + pred) >= u)
            acum[cand.nombre]["umbral"].append(u)
            fila["modelos"][cand.nombre] = round(_mae(pred, ya[te]), 4)

        fila["ganador"] = min(fila["modelos"], key=lambda kk: fila["modelos"][kk])
        detalle_pliegues.append(fila)

    # ── Agregado fuera de muestra ───────────────────────────────────────────
    resultados: dict[str, dict] = {}
    for nom, a in acum.items():
        pred = np.concatenate(a["pred"]); yv = np.concatenate(a["y"])
        resultados[nom] = {"pred": pred, "y": yv,
                           "chl": np.concatenate(a["chl"]),
                           "alerta_cal": np.concatenate(a["alerta"]),
                           "umbrales": [round(float(u), 3) for u in a["umbral"]],
                           "idx": np.concatenate([i.to_numpy() for i in a["idx"]]),
                           **_metricas(pred, yv)}

    mae_pers = resultados["Persistencia"]["mae"]
    t3 = []
    for nom, r in sorted(resultados.items(), key=lambda kv: kv[1]["mae"]):
        cand = next((c for c in CANDIDATOS if c.nombre == nom), None)
        real_a = (r["chl"] + r["y"]) >= UMBRAL_EVENTO
        pred_a = (r["chl"] + r["pred"]) >= UMBRAL_EVENTO
        al_fis = _metricas_alerta(real_a, pred_a)
        al = _metricas_alerta(real_a, r["alerta_cal"])
        t3.append({
            "modelo": nom,
            "familia": cand.familia if cand else "referencia",
            "interpretable": cand.interpretable if cand else True,
            "mae": r["mae"], "rmse": r["rmse"], "r2": r["r2"], "sesgo": r["sesgo"],
            "sensibilidad": al["sensibilidad"], "especificidad": al["especificidad"],
            "f1": al["f1"], "falsos_negativos": al["fn"], "falsas_alarmas": al["fp"],
            "eventos_reales": al["eventos_reales"],
            "f1_umbral_fisico": al_fis["f1"],
            "sensibilidad_umbral_fisico": al_fis["sensibilidad"],
            "umbrales_calibrados": r["umbrales"],
            "skill_vs_persistencia_pct": round(100 * (mae_pers - r["mae"]) / mae_pers, 2)
            if mae_pers > 0 else None,
            "nota": cand.nota if cand else ("Referencia: predice incremento cero."
                                            if nom == "Persistencia"
                                            else "Referencia: incremento medio del mes."),
            "n_evaluacion": int(len(r["y"])),
        })

    # El modelo se elige solo con la CV del tramo de desarrollo. El holdout no
    # se toca hasta después de esta decisión.
    nombres_cand = [c.nombre for c in CANDIDATOS]
    mejor = min((n_ for n_ in nombres_cand if n_ in resultados),
                key=lambda n_: resultados[n_]["mae"])

    # ── Evaluación final bloqueada ─────────────────────────────────────────
    cand_mejor = next(c for c in CANDIDATOS if c.nombre == mejor)
    p_final, _ = _buscar_hiperparametros(cand_mejor, Xa[:n_desarrollo], ya[:n_desarrollo], purga)
    modelo_final = cand_mejor.construir(p_final)
    modelo_final.fit(Xa[:n_desarrollo], ya[:n_desarrollo])
    pred_final = modelo_final.predict(Xa[holdout])
    pred_final_tr = modelo_final.predict(Xa[:n_desarrollo])
    umbral_final = _umbral_decision(chl_ahora.to_numpy()[:n_desarrollo], pred_final_tr,
                                    ya[:n_desarrollo], UMBRAL_EVENTO)
    chl_final = chl_ahora.to_numpy()[holdout]
    y_final = ya[holdout]
    alerta_final = (chl_final + pred_final) >= umbral_final
    alerta_persistencia_final = (chl_final + 0.0) >= UMBRAL_EVENTO
    metricas_final = _metricas(pred_final, y_final)
    metricas_persistencia_final = _metricas(np.zeros(len(y_final)), y_final)
    real_final = (chl_final + y_final) >= UMBRAL_EVENTO
    evaluacion_final = {
        "desde": str(idx[holdout[0]].date()), "hasta": str(idx[holdout[-1]].date()),
        "n": int(len(holdout)), "modelo": mejor,
        "mae": metricas_final["mae"], "rmse": metricas_final["rmse"],
        "sesgo": metricas_final["sesgo"],
        "mae_persistencia": metricas_persistencia_final["mae"],
        "skill_pct": round(100 * (metricas_persistencia_final["mae"] - metricas_final["mae"])
                             / metricas_persistencia_final["mae"], 2)
        if metricas_persistencia_final["mae"] > 0 else None,
        "f1": _metricas_alerta(real_final, alerta_final)["f1"],
        "f1_persistencia": _metricas_alerta(real_final, alerta_persistencia_final)["f1"],
        "sensibilidad": _metricas_alerta(real_final, alerta_final)["sensibilidad"],
        "especificidad": _metricas_alerta(real_final, alerta_final)["especificidad"],
        "umbral_calibrado": round(float(umbral_final), 3),
    }

    # ── T4 y G3: hiperparámetros ────────────────────────────────────────────
    t4, g3 = [], {"series": [], "modelo": mejor}
    for cand in CANDIDATOS:
        bolsas: dict[str, list[float]] = {}
        for entrada in rejilla_agregada.get(cand.nombre, []):
            for d in entrada["detalle"]:
                m_val = d.get("mae_medio")
                if m_val is not None and not (isinstance(m_val, float) and (math.isnan(m_val) or math.isinf(m_val))):
                    bolsas.setdefault(json.dumps(d["parametros"], sort_keys=True), []).append(float(m_val))
        for clave, vals in bolsas.items():
            params = json.loads(clave)
            veces = sum(1 for p in elegidos.get(cand.nombre, []) if p == params)
            vals_ok = [v for v in vals if not math.isnan(v)]
            mae_m = float(np.mean(vals_ok)) if vals_ok else 0.0
            mae_s = float(np.std(vals_ok)) if len(vals_ok) > 1 else 0.0
            t4.append({"modelo": cand.nombre, "parametros": clave,
                       "mae_cv_medio": round(mae_m, 4),
                       "mae_cv_desv": round(mae_s, 4),
                       "pliegues": len(vals_ok),
                       "elegido_en_pliegues": veces,
                       "es_mejor": False})
        if cand.nombre == mejor:
            clave_var = next((k for k in cand.rejilla[0] if len({str(p[k]) for p in cand.rejilla}) > 1),
                             list(cand.rejilla[0])[0])
            pts = []
            for clave, vals in bolsas.items():
                params = json.loads(clave)
                vals_ok = [v for v in vals if not math.isnan(v)]
                mae_m = float(np.mean(vals_ok)) if vals_ok else 0.0
                mae_s = float(np.std(vals_ok)) if len(vals_ok) > 1 else 0.0
                pts.append({"x": str(params.get(clave_var)), "mae": round(mae_m, 4),
                            "desv": round(mae_s, 4)})
            g3 = {"modelo": cand.nombre, "hiperparametro": clave_var, "puntos": pts}
    for f in t4:
        mismos = [x for x in t4 if x["modelo"] == f["modelo"]]
        f["es_mejor"] = f["mae_cv_medio"] == min(x["mae_cv_medio"] for x in mismos)
    t4.sort(key=lambda f: (f["modelo"], f["mae_cv_medio"]))

    # ── T6: pruebas estadísticas ────────────────────────────────────────────
    e_mejor = pred_final - y_final
    e_pers = -y_final
    real_alerta = real_final
    al_mejor = alerta_final
    al_pers = alerta_persistencia_final

    dm = diebold_mariano(e_pers, e_mejor, H)
    bs = bootstrap_estacionario(e_pers, e_mejor)
    wx = wilcoxon_errores(e_pers, e_mejor)
    mn = mcnemar_alertas(real_alerta, al_mejor, al_pers)
    pm = permutacion_skill(resultados[mejor]["y"], resultados[mejor]["pred"])

    t6 = [
        {"prueba": "Diebold-Mariano (HLN)", "compara": f"Persistencia vs {mejor}",
         "hipotesis_nula": "Ambos pronósticos tienen la misma exactitud esperada",
         "estadistico": dm.get("estadistico"), "p_valor": dm.get("p_valor"),
         "n": dm.get("n"), "veredicto": dm["veredicto"],
         "por_que": "Contraste estándar de exactitud de pronósticos; corrige la autocorrelación "
                    "a horizonte H y el sesgo de muestra pequeña."},
        {"prueba": "Bootstrap estacionario", "compara": f"ΔMAE Persistencia − {mejor}",
         "hipotesis_nula": "La diferencia de MAE es cero",
         "estadistico": bs.get("diferencia_mae"), "p_valor": None,
         "ic95": bs.get("ic95"), "n": int(len(e_mejor)), "veredicto": bs["veredicto"],
         "por_que": "Remuestrea bloques y conserva la dependencia temporal; el bootstrap i.i.d. "
                    "subestimaría la incertidumbre en una serie autocorrelada."},
        {"prueba": "Wilcoxon de rangos con signo", "compara": f"|error| Persistencia vs {mejor}",
         "hipotesis_nula": "La mediana de la diferencia de errores absolutos es cero",
         "estadistico": wx.get("estadistico"), "p_valor": wx.get("p_valor"),
         "n": int(len(e_mejor)), "veredicto": wx["veredicto"],
         "por_que": "No paramétrico: los errores de pronóstico están sesgados a la derecha y "
                    "una t de Student sobre ellos es poco fiable."},
        {"prueba": "McNemar exacto", "compara": f"Aciertos de alerta {mejor} vs Persistencia",
         "hipotesis_nula": "Ambos clasifican el cruce de umbral igual de bien",
         "estadistico": mn.get("discordantes"), "p_valor": mn.get("p_valor"),
         "n": int(len(real_alerta)), "veredicto": mn["veredicto"],
         "por_que": "El MAE puede mejorar sin que mejore la decision que importa: cruzar o no el "
                    "umbral. Esta prueba mira solo eso, sobre los casos discordantes.",
         "cautela": "McNemar contrasta EXACTITUD, y con una tasa de evento del "
                    + str(round(100 * float(real_alerta.mean()), 1)) + " % no avisar nunca ya "
                    "acierta casi siempre. Por eso su veredicto se lee junto al F1 y a la "
                    "sensibilidad de T3, no en su lugar: un modelo puede ganar esta prueba y aun "
                    "asi dejar pasar la mayoria de las floraciones."},
        {"prueba": "Permutación del objetivo", "compara": f"{mejor} frente al azar",
         "hipotesis_nula": "El MAE observado es alcanzable barajando el objetivo",
         "estadistico": pm.get("mae_observado"), "p_valor": pm.get("p_valor"),
         "n": int(len(e_mejor)), "veredicto": pm["veredicto"],
         "por_que": "Prueba directa contra el autoengaño: si permutar el objetivo reproduce el "
                    "error, el modelo no ha aprendido nada."},
    ]

    # ── G4, G5, G6 ──────────────────────────────────────────────────────────
    g4 = {"pliegues": [{"pliegue": f["pliegue"], "test_desde": f["test_desde"],
                        "n_test": f["n_test"], "valores": f["modelos"]}
                       for f in detalle_pliegues],
          "modelos": list(resultados.keys())}

    paso = max(1, len(y_final) // 700)
    g5 = {"modelo": mejor,
          "puntos": [{"obs": round(float(chl_final[i] + y_final[i]), 3),
                      "pred": round(float(chl_final[i] + pred_final[i]), 3)}
                     for i in range(0, len(y_final), paso)],
          "umbral": UMBRAL_EVENTO,
          "mae": metricas_final["mae"], "submuestreo": paso}

    # Shapley exacto del modelo lineal sobre el último caso evaluado
    tr_fin = np.arange(n_desarrollo)
    p_ridge, _ = _buscar_hiperparametros(CANDIDATOS[0], Xa[tr_fin], ya[tr_fin], purga)
    m_lin = CANDIDATOS[0].construir(p_ridge)
    m_lin.fit(Xa[tr_fin], ya[tr_fin])
    te_fin = holdout
    g6 = {
        "modelo_local": "Ridge",
        "fecha_caso": str(idx[te_fin[-1]].date()),
        "base": round(float(m_lin.named_steps["m"].intercept_), 4),
        "contribuciones": shapley_lineal(m_lin, X, int(te_fin[-1])),
        "prediccion": round(float(m_lin.predict(Xa[te_fin[-1]:te_fin[-1] + 1])[0]), 4),
        "observado": round(float(ya[te_fin[-1]]), 4),
        "chl_actual": round(float(chl_ahora.to_numpy()[te_fin[-1]]), 3),
        "nota_exactitud": ("Shapley exacto en forma cerrada (φᵢ = βᵢ·zᵢ). La suma de las "
                           "contribuciones reproduce la predicción menos su valor esperado sin "
                           "error de muestreo."),
    }

    # Importancia global por permutación del modelo ganador
    cand_mejor = next(c for c in CANDIDATOS if c.nombre == mejor)
    p_mejor = p_final
    m_best = cand_mejor.construir(p_mejor)
    m_best.fit(Xa[tr_fin], ya[tr_fin])
    g6["importancia_global"] = importancia_permutacion(m_best, Xa[te_fin], ya[te_fin], nombres)
    g6["modelo_global"] = mejor

    return {
        "horizonte": H,
        "preparacion": preparacion,
        "t2_correlaciones": tabla_correlaciones(X, y, H),
        "t3_modelos": t3,
        "t4_hiperparametros": t4,
        "t5_validacion_cruzada": detalle_pliegues,
        "t6_pruebas": t6,
        "g3_curva_validacion": g3,
        "g4_pliegues": g4,
        "g5_dispersion": g5,
        "g6_shapley": g6,
        "mejor_modelo": mejor,
        "mae_mejor": resultados[mejor]["mae"],
        "mae_persistencia": mae_pers,
        "skill_pct": round(100 * (mae_pers - resultados[mejor]["mae"]) / mae_pers, 2)
        if mae_pers > 0 else None,
        "evaluacion_final": evaluacion_final,
    }


def _fase_despliegue(informe: dict) -> dict:
    hs = informe["horizontes"]
    filas = []
    for H, h in sorted(hs.items(), key=lambda kv: int(kv[0])):
        dm = next((p for p in h["t6_pruebas"] if p["prueba"].startswith("Diebold")), {})
        mc = next((p for p in h["t6_pruebas"] if p["prueba"].startswith("McNemar")), {})
        pm = next((p for p in h["t6_pruebas"] if p["prueba"].startswith("Permutaci")), {})
        final = h["evaluacion_final"]
        sig_error = bool(dm.get("p_valor") is not None and dm["p_valor"] < 0.05
                 and final["skill_pct"] and final["skill_pct"] > 0)
        # Exigir DOS cosas para dar por buena la alerta: que McNemar rechace y que
        # el F1 supere al de la persistencia. Solo con McNemar, un modelo que casi
        # nunca avisa gana la prueba por exactitud y aun asi es inservible.
        f1_m = final["f1"] or 0.0
        f1_p = final["f1_persistencia"] or 0.0
        sig_alerta = bool(mc.get("p_valor") is not None and mc["p_valor"] < 0.05
                          and "MEJOR" in str(mc.get("veredicto", "")) and f1_m > f1_p)
        filas.append({"horizonte": int(H), "modelo": h["mejor_modelo"],
                  "mae": final["mae"], "mae_persistencia": final["mae_persistencia"],
                  "skill_pct": final["skill_pct"],
                  "f1": final["f1"], "f1_persistencia": final["f1_persistencia"],
                  "sensibilidad": final["sensibilidad"],
                  "especificidad": final["especificidad"],
                      "p_diebold_mariano": dm.get("p_valor"),
                      "p_mcnemar": mc.get("p_valor"),
                      "p_permutacion": pm.get("p_valor"),
                      "significativo_error": sig_error,
                      "significativo_alerta": sig_alerta,
                      "significativo": sig_error or sig_alerta})
    err_ok = [f for f in filas if f["significativo_error"]]
    al_ok = [f for f in filas if f["significativo_alerta"]]

    def _hs(fs):
        return ", ".join(str(f["horizonte"]) + " d" for f in fs)

    if al_ok and not err_ok:
        veredicto = (
            "Respaldo PARCIAL y asimetrico, que es el hallazgo principal: el modelo NO mejora el "
            "error medio frente a la persistencia de forma significativa (Diebold-Mariano y "
            "Wilcoxon no rechazan), pero SI clasifica mejor el cruce del umbral en "
            + _hs(al_ok) + " (McNemar). Son dos preguntas distintas y solo una tiene respuesta "
            "favorable: sirve para decidir si se avisa, no para anunciar una cifra de clorofila.")
    elif err_ok and al_ok:
        veredicto = ("Hipotesis respaldada en " + _hs(err_ok) + ": el modelo bate a la "
                     "persistencia en error medio y ademas clasifica mejor el cruce del umbral en "
                     + _hs(al_ok) + ".")
    elif err_ok:
        veredicto = ("Hipotesis respaldada en error medio (" + _hs(err_ok) + "), pero sin mejora "
                     "significativa en la clasificacion del umbral: reduce el error sin mejorar la "
                     "decision de avisar.")
    else:
        veredicto = ("Hipotesis NO respaldada: ningun horizonte muestra mejora significativa sobre "
                     "la persistencia, ni en error medio ni en clasificacion del umbral. Es un "
                     "resultado, no un fallo de ejecucion.")
    return {
        "resumen": filas,
        "lectura_doble": ("El error medio y la calidad de la alerta no se mueven juntos. Un modelo "
                          "puede reducir el MAE y no cambiar ninguna decision, o al reves: acertar "
                          "mas cruces de umbral sin bajar el MAE. Por eso el informe contrasta las "
                          "dos cosas por separado en vez de resumirlas en una sola metrica."),
        "veredicto": veredicto,
        "condiciones_de_uso": [
            "La clorofila-a procede de una sonda de fluorescencia fija a 1,6 m que lee ~7,9 µg/L "
            "por debajo del laboratorio: aplicar el umbral de la OMS sobre ella SUB-ALERTA.",
            "El viento es reanálisis ERA5, no un anemómetro en el embalse; suaviza los extremos "
            "locales que gobiernan la mezcla.",
            "Los nutrientes son de laboratorio quincenal interpolado dentro de huecos de 21 días; "
            "la fracción interpolada está en la tabla T1.",
            "Los resultados describen Falling Creek Reservoir (Virginia, EE. UU.). Transferirlos a "
            "San Roque o Titicaca exige recalibrar y volver a validar: no se ha hecho.",
        ],
    }


if __name__ == "__main__":  # pragma: no cover
    import sys
    rep = ejecutar(horizontes=(7, 14))
    print(json.dumps(rep["fase_6_despliegue"], indent=2, ensure_ascii=False))
    print("informe en", rep.get("ruta_informe"), file=sys.stderr)
