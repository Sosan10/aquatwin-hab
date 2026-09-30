"""Pruebas del motor CRISP-DM.

No comprueban que el código *corra*: comprueban las **garantías metodológicas**
de las que depende que el informe signifique algo. Un backtesting con fuga
temporal produce números preciosos y falsos, y no falla nunca por su cuenta;
solo lo detecta una prueba escrita a propósito para eso.

Cada contraste estadístico se verifica además en las dos direcciones: que
detecte una diferencia cuando la hay **y** que no la invente cuando no la hay.
Una prueba que solo comprueba lo primero pasaría igual con una función que
siempre rechaza.
"""

from __future__ import annotations

import os
import numpy as np
import pandas as pd
import pytest

from early_warning import crispdm as C


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

def _serie(dias: int = 500, semilla: int = 7, huecos: bool = False) -> pd.DataFrame:
    """Serie diaria sintética con estacionalidad, deriva y ruido."""
    rng = np.random.default_rng(semilla)
    t = pd.date_range("2019-01-01", periods=dias, freq="D", tz="UTC")
    est = 12 + 8 * np.sin(2 * np.pi * np.arange(dias) / 365.25)
    chl = np.clip(est + rng.normal(0, 3, dias).cumsum() * 0.05 + rng.normal(0, 2, dias), 0.5, None)
    df = pd.DataFrame({
        "timestamp": t,
        "chlorophyll_a": chl,
        "temp_surface": 15 + 8 * np.sin(2 * np.pi * np.arange(dias) / 365.25) + rng.normal(0, 1, dias),
        "dissolved_oxygen": 9 + rng.normal(0, 0.8, dias),
        "wind_speed": np.abs(rng.normal(3, 1.2, dias)),
        "total_phosphorus": np.abs(rng.normal(0.03, 0.008, dias)),
        "total_nitrogen": np.abs(rng.normal(0.6, 0.15, dias)),
        "phycocyanin": np.abs(chl * 0.08 + rng.normal(0, 0.3, dias)),
    })
    if huecos:
        # Quita un bloque de 40 días: fuerza a que el emparejado por fecha
        # tenga que descartar pares, cosa que un shift por filas no haría.
        df = pd.concat([df.iloc[:200], df.iloc[240:]], ignore_index=True)
    return df


@pytest.fixture
def csv_sintetico(tmp_path, monkeypatch):
    p = tmp_path / "sintetico.csv"
    _serie().to_csv(p, index=False)
    monkeypatch.setenv("OAPAT_DATASET_CSV", str(p))
    return p


# ─────────────────────────────────────────────────────────────────────────────
# Preparación: fuga temporal
# ─────────────────────────────────────────────────────────────────────────────

def test_pliegues_nunca_solapan_entrenamiento_y_prueba():
    """Ni un solo índice puede estar en los dos lados de la partición."""
    for tr, te in C.pliegues_origen_movil(600, 5, purga=14):
        assert set(tr).isdisjoint(set(te)), "hay índices compartidos entre train y test"
        assert tr.max() < te.min(), "el entrenamiento alcanza o supera al tramo de prueba"


def test_la_purga_separa_los_tramos_el_horizonte_completo():
    """Las muestras cuyo objetivo cae en el test deben salir del entrenamiento.

    Sin esta separación la fuga es invisible: el modelo ve, a través del
    objetivo de las últimas muestras de entrenamiento, valores que pertenecen
    al tramo que se va a evaluar.
    """
    purga = 14
    for tr, te in C.pliegues_origen_movil(600, 5, purga=purga):
        assert te.min() - tr.max() > purga, (
            f"solo hay {te.min() - tr.max()} muestras de separación, se exigen más de {purga}")


def test_el_objetivo_es_el_incremento_y_la_persistencia_es_el_cero():
    """Si el objetivo fuera el nivel, la persistencia no sería predecir cero."""
    daily = _serie(300)
    X, y, chl_ahora, idx = C.construir_muestras(daily, horizonte=7)
    # y = chl(t+7) - chl(t): reconstruir el nivel debe devolver la serie futura
    futuro = chl_ahora.to_numpy() + y.to_numpy()
    assert np.all(futuro > 0)
    # La media del incremento ronda cero; la del nivel estaría lejos.
    assert abs(float(y.mean())) < float(chl_ahora.mean()) / 2


def test_el_horizonte_se_empareja_por_fecha_y_no_por_posicion_de_fila():
    """Con un hueco de 40 días, emparejar por fila mentiría sobre el horizonte."""
    daily = _serie(500, huecos=True)
    X, y, chl_ahora, idx = C.construir_muestras(daily, horizonte=7, tolerancia=2)
    serie = daily.set_index(pd.to_datetime(daily["timestamp"], utc=True))["chlorophyll_a"]
    for t in idx[:: max(1, len(idx) // 40)]:
        objetivo = t + pd.Timedelta(days=7)
        # Debe existir una observación a ±2 días del objetivo real en el tiempo
        cerca = serie.index[(serie.index >= objetivo - pd.Timedelta(days=2))
                            & (serie.index <= objetivo + pd.Timedelta(days=2))]
        assert len(cerca) > 0, f"se emparejó {t} con un objetivo que no existe a ±2 días"


def test_ningun_rasgo_mira_al_futuro():
    """Cambiar el final de la serie no puede alterar rasgos anteriores."""
    daily = _serie(300)
    r1 = C.construir_rasgos(daily)
    alterada = daily.copy()
    alterada.loc[alterada.index[-30:], "chlorophyll_a"] *= 5
    r2 = C.construir_rasgos(alterada)
    corte = len(daily) - 40
    pd.testing.assert_frame_equal(r1.iloc[:corte], r2.iloc[:corte])


# ─────────────────────────────────────────────────────────────────────────────
# Pruebas estadísticas: deben detectar y deben abstenerse
# ─────────────────────────────────────────────────────────────────────────────

def test_diebold_mariano_detecta_una_diferencia_real():
    rng = np.random.default_rng(1)
    malo = rng.normal(0, 4, 400)
    bueno = rng.normal(0, 1, 400)
    r = C.diebold_mariano(malo, bueno, h=7)
    assert r["p_valor"] < 0.05
    assert "PEOR" in r["veredicto"]


def test_diebold_mariano_no_inventa_diferencia_entre_modelos_identicos():
    """Con errores idénticos la varianza de la diferencia es exactamente cero.

    Lo correcto ahí es **negarse a contrastar**, no devolver un p-valor: la
    fórmula dividiría por cero y cualquier número que saliera sería inventado.
    """
    rng = np.random.default_rng(2)
    e = rng.normal(0, 2, 400)
    r = C.diebold_mariano(e.copy(), e.copy(), h=7)
    assert r["p_valor"] is None
    assert "no aplicable" in r["veredicto"].lower()


def test_diebold_mariano_se_abstiene_con_modelos_casi_iguales():
    """Diferencia despreciable pero varianza no nula: debe no rechazar."""
    rng = np.random.default_rng(22)
    e1 = rng.normal(0, 2, 400)
    e2 = e1 + rng.normal(0, 0.01, 400)
    r = C.diebold_mariano(e1, e2, h=7)
    assert r["p_valor"] is not None and r["p_valor"] > 0.05
    assert "Sin diferencia significativa" in r["veredicto"]


def test_wilcoxon_detecta_y_se_abstiene():
    rng = np.random.default_rng(3)
    peor, mejor = rng.normal(0, 5, 300), rng.normal(0, 1, 300)
    assert C.wilcoxon_errores(peor, mejor)["p_valor"] < 0.05
    e = rng.normal(0, 2, 300)
    r = C.wilcoxon_errores(e, e + rng.normal(0, 1e-9, 300))
    assert r["p_valor"] is None or r["p_valor"] > 0.01


def test_permutacion_no_encuentra_senal_donde_no_la_hay():
    """Predicciones al azar no deben pasar por capacidad predictiva."""
    rng = np.random.default_rng(4)
    y = rng.normal(0, 3, 300)
    pred = rng.normal(0, 3, 300)   # sin relación con y
    r = C.permutacion_skill(y, pred, replicas=400)
    assert r["p_valor"] > 0.05, "la prueba dio por buena una predicción aleatoria"


def test_permutacion_detecta_senal_real():
    rng = np.random.default_rng(5)
    y = rng.normal(0, 3, 300)
    pred = y + rng.normal(0, 0.4, 300)   # casi perfecta
    r = C.permutacion_skill(y, pred, replicas=400)
    assert r["p_valor"] < 0.05


def test_mcnemar_no_distingue_clasificadores_identicos():
    rng = np.random.default_rng(6)
    real = rng.random(300) < 0.2
    pred = real.copy()
    r = C.mcnemar_alertas(real, pred, pred.copy())
    assert r["p_valor"] is None or r["p_valor"] > 0.05


def test_mcnemar_detecta_al_clasificador_mejor():
    rng = np.random.default_rng(7)
    real = rng.random(400) < 0.3
    bueno = real.copy()
    bueno[rng.choice(400, 10, replace=False)] ^= True      # 10 fallos
    malo = real.copy()
    malo[rng.choice(400, 90, replace=False)] ^= True       # 90 fallos
    r = C.mcnemar_alertas(real, bueno, malo)
    assert r["p_valor"] < 0.05
    assert "MEJOR" in r["veredicto"]


def test_mann_kendall_detecta_tendencia_y_la_niega_en_ruido_blanco():
    assert C.mann_kendall(np.arange(200, dtype=float))["tendencia"] == "creciente"
    assert C.mann_kendall(-np.arange(200, dtype=float))["tendencia"] == "decreciente"
    rng = np.random.default_rng(8)
    assert C.mann_kendall(rng.normal(0, 1, 300))["tendencia"] == "sin tendencia"


def test_bootstrap_estacionario_devuelve_intervalo_que_contiene_la_diferencia():
    rng = np.random.default_rng(9)
    e1, e2 = rng.normal(0, 4, 400), rng.normal(0, 1, 400)
    r = C.bootstrap_estacionario(e1, e2, replicas=300)
    lo, hi = r["ic95"]
    assert lo < r["diferencia_mae"] < hi
    assert lo > 0, "con una diferencia tan marcada el intervalo debería excluir el cero"


# ─────────────────────────────────────────────────────────────────────────────
# Calibración del umbral de decisión
# ─────────────────────────────────────────────────────────────────────────────

def test_el_umbral_de_decision_mejora_la_deteccion_frente_al_umbral_fisico():
    """Un regresor encogido hacia la media casi nunca cruza el umbral físico."""
    rng = np.random.default_rng(10)
    chl = rng.uniform(5, 30, 500)
    y = rng.normal(2, 6, 500)
    pred = y * 0.3                      # predicción encogida, como un Ridge
    u = C._umbral_decision(chl, pred, y, umbral_fisico=25.0)
    real = (chl + y) >= 25.0
    con_fisico = C._metricas_alerta(real, (chl + pred) >= 25.0)
    con_calibrado = C._metricas_alerta(real, (chl + pred) >= u)
    assert con_calibrado["f1"] >= con_fisico["f1"]


def test_sin_eventos_en_entrenamiento_el_umbral_cae_al_fisico():
    """No hay nada sobre lo que calibrar: debe decirlo, no inventar un umbral."""
    chl = np.full(100, 5.0)
    y = np.zeros(100)
    assert C._umbral_decision(chl, y, y, umbral_fisico=25.0) == 25.0


def test_metricas_de_alerta_cuadran_con_la_matriz_de_confusion():
    real = np.array([True, True, True, False, False, False, False])
    pred = np.array([True, False, True, True, False, False, False])
    m = C._metricas_alerta(real, pred)
    assert (m["vp"], m["fn"], m["fp"], m["vn"]) == (2, 1, 1, 3)
    # Las métricas se publican redondeadas a 4 decimales: son para leerlas en
    # pantalla, no para encadenar cálculos. La tolerancia lo refleja.
    assert m["sensibilidad"] == pytest.approx(2 / 3, abs=5e-5)
    assert m["especificidad"] == pytest.approx(3 / 4, abs=5e-5)
    assert m["f1"] == pytest.approx(2 / 3, abs=5e-5)
    assert m["eventos_reales"] == 3


# ─────────────────────────────────────────────────────────────────────────────
# Explicabilidad
# ─────────────────────────────────────────────────────────────────────────────

def test_shapley_lineal_suma_exactamente_la_prediccion_menos_su_esperanza():
    """Es la propiedad de eficiencia. Si no se cumple, la atribución miente."""
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    rng = np.random.default_rng(11)
    X = pd.DataFrame(rng.normal(0, 1, (200, 6)), columns=[f"v{i}" for i in range(6)])
    y = X["v0"] * 2 - X["v3"] + rng.normal(0, 0.1, 200)
    m = Pipeline([("esc", StandardScaler()), ("m", Ridge(alpha=0.1))])
    m.fit(X.to_numpy(), y.to_numpy())

    fila = 42
    phis = C.shapley_lineal(m, X, fila)          # devuelve las 12 mayores; aquí son 6
    suma = sum(p["contribucion"] for p in phis)
    esperado = float(m.predict(X.to_numpy()[fila:fila + 1])[0] - m.named_steps["m"].intercept_)
    # La eficiencia se cumple de forma exacta en el cálculo; lo que se publica
    # va redondeado a 4 decimales, así que la suma visible puede desviarse hasta
    # medio dígito del último decimal por contribución.
    assert suma == pytest.approx(esperado, abs=5e-5 * len(phis))

    # Y sin redondeo, la identidad es exacta:
    esc, reg = m.named_steps["esc"], m.named_steps["m"]
    phi_exacto = reg.coef_ * esc.transform(X.to_numpy())[fila]
    assert float(phi_exacto.sum()) == pytest.approx(esperado, abs=1e-10)


def test_importancia_por_permutacion_situa_arriba_al_rasgo_que_manda():
    from sklearn.linear_model import Ridge

    rng = np.random.default_rng(12)
    X = rng.normal(0, 1, (300, 5))
    y = X[:, 2] * 5 + rng.normal(0, 0.2, 300)    # solo v2 importa
    m = Ridge(alpha=0.1).fit(X, y)
    imp = C.importancia_permutacion(m, X, y, [f"v{i}" for i in range(5)], repeticiones=4)
    assert imp[0]["rasgo"] == "v2"


# ─────────────────────────────────────────────────────────────────────────────
# Informe completo
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def informe(csv_sintetico, monkeypatch):
    monkeypatch.setattr(C, "REPLICAS_BOOTSTRAP", 120)
    monkeypatch.setattr(C, "REPLICAS_PERMUTACION", 120)
    return C.ejecutar(basin_id="prueba", horizontes=(7,), guardar=False)


def test_el_informe_trae_las_seis_tablas_y_las_seis_figuras(informe):
    h = informe["horizontes"]["7"]
    tablas = [informe["fase_2_datos"]["t1_univariante"], h["t2_correlaciones"], h["t3_modelos"],
              h["t4_hiperparametros"], h["t5_validacion_cruzada"], h["t6_pruebas"]]
    for i, t in enumerate(tablas, start=1):
        assert isinstance(t, list) and len(t) > 0, f"la tabla T{i} llegó vacía"

    figuras = [informe["fase_2_datos"]["g1_serie"], informe["fase_2_datos"]["g2_estacionalidad"],
               h["g3_curva_validacion"], h["g4_pliegues"], h["g5_dispersion"], h["g6_shapley"]]
    for i, g in enumerate(figuras, start=1):
        assert isinstance(g, dict) and g, f"la figura G{i} llegó vacía"


def test_el_informe_recorre_las_seis_fases_de_crisp_dm(informe):
    for clave in ("fase_1_negocio", "fase_2_datos", "fase_3_preparacion",
                  "fase_4_modelado", "fase_5_evaluacion", "fase_6_despliegue"):
        assert informe[clave], f"falta {clave}"


def test_las_referencias_obligatorias_siempre_compiten(informe):
    """Sin persistencia y climatología, cualquier MAE parece bueno."""
    nombres = {m["modelo"] for m in informe["horizontes"]["7"]["t3_modelos"]}
    assert {"Persistencia", "Climatología"} <= nombres


def test_los_recuentos_de_g1_describen_la_serie_entera_no_el_submuestreo(informe):
    g = informe["fase_2_datos"]["g1_serie"]
    assert g["total_dias"] >= len(g["puntos"])
    if g["submuestreo"] > 1:
        assert g["total_dias"] > len(g["puntos"])


def test_el_veredicto_no_se_declara_favorable_sin_respaldo(informe):
    """El F1 debe superar al de la persistencia, no basta con McNemar."""
    d = informe["fase_6_despliegue"]
    for fila in d["resumen"]:
        if fila["significativo_alerta"]:
            assert (fila["f1"] or 0) > (fila["f1_persistencia"] or 0), (
                "se declaró la alerta significativa con un F1 que no bate a la persistencia")


def test_cada_prueba_estadistica_declara_su_hipotesis_nula(informe):
    """Un p-valor sin hipótesis nula escrita no es interpretable."""
    for p in informe["horizontes"]["7"]["t6_pruebas"]:
        assert p["hipotesis_nula"].strip(), f"{p['prueba']} no declara su hipótesis nula"
        assert p["por_que"].strip(), f"{p['prueba']} no justifica por qué se eligió"
        assert p["veredicto"].strip()


def test_el_despliegue_publica_las_condiciones_de_uso(informe):
    cond = informe["fase_6_despliegue"]["condiciones_de_uso"]
    assert len(cond) >= 3, "las limitaciones deben viajar con el veredicto, no aparte"


# ─────────────────────────────────────────────────────────────────────────────
# API
# ─────────────────────────────────────────────────────────────────────────────

def test_la_api_rechaza_un_horizonte_fuera_de_rango():
    from fastapi.testclient import TestClient
    from early_warning.api import app

    r = TestClient(app).post("/crispdm/run", json={"basin_id": "x", "horizontes": [999]})
    assert r.status_code == 422


def test_la_api_devuelve_404_clara_cuando_no_hay_informe(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from early_warning.api import app

    monkeypatch.setattr(C, "REPORTS_DIR", tmp_path / "vacio")
    r = TestClient(app).get("/crispdm/latest")
    assert r.status_code == 404
    assert "crispdm/run" in r.json()["detail"]
