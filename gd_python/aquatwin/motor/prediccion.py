"""
Modelo predictivo de biomasa con explicabilidad SHAP.

División de responsabilidades, deliberada:

* El **motor de reglas** (`reglas.py`) emite el *nivel de alerta*. Es
  determinista, auditable y cita normas. Es lo que se defiende ante un tercero.
* El **modelo de aprendizaje** (este módulo) proyecta el *valor futuro* de la
  clorofila-a. Es más preciso para extrapolar, pero es una caja gris, y por eso
  no se le deja emitir la alerta: se le exige explicar cada predicción.

Explicabilidad implementada en tres niveles:

1. **Global** — importancia media |SHAP| sobre todo el conjunto: qué variables
   mueven el modelo en general.
2. **Local** — descomposición SHAP de *una* predicción concreta: por qué este
   valor y no otro, variable a variable.
3. **Contrafactual** — qué cambio mínimo en una variable accionable habría
   bajado la predicción por debajo del umbral. Convierte la explicación en
   una palanca de gestión.

Se acompaña además de una **validación con corte temporal**: nunca aleatoria,
porque barajar una serie temporal filtra el futuro en el entrenamiento e infla
artificialmente las métricas.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

# Variables predictoras.
#
# Se incluye la clorofila-a **actual** a propósito. La tentación es excluirla
# para que el modelo "no copie el último valor", pero eso lo dejaría compitiendo
# en desventaja contra el referente de persistencia, que consiste justamente en
# ese valor. Con ella dentro, el modelo aprende la *corrección* sobre la
# persistencia —cuánto y en qué dirección se desviará— que es lo que de verdad
# aporta valor sobre suponer que nada cambia.
PREDICTORAS: dict[str, str] = {
    "chlorophyll_a": "Clorofila-a actual",
    "temp_surface": "Temperatura superficial",
    "solar_par": "Radiación PAR",
    "wind_speed": "Velocidad del viento",
    "total_phosphorus": "Fósforo total",
    "total_nitrogen": "Nitrógeno total",
    "ph": "pH",
    "turbidity": "Turbidez",
    "chl_lag_24h": "Clorofila-a hace 24 h",
    "chl_tendencia_24h": "Tendencia de clorofila (24 h)",
    "temp_media_24h": "Temperatura media (24 h)",
    "viento_medio_24h": "Viento medio (24 h)",
}

HORIZONTE_HORAS = 24


@dataclass
class ResultadoModelo:
    """Modelo entrenado junto con todo lo necesario para interpretarlo."""
    modelo: GradientBoostingRegressor
    X_train: pd.DataFrame
    X_test: pd.DataFrame
    y_train: pd.Series
    y_test: pd.Series
    y_pred: np.ndarray
    mae: float
    r2: float
    mae_persistencia: float
    corte: pd.Timestamp
    horizonte_horas: int
    delta_pred: np.ndarray = field(default_factory=lambda: np.array([]))
    delta_test: pd.Series = field(default_factory=pd.Series)
    meta: pd.DataFrame = field(default_factory=pd.DataFrame)
    shap_values: np.ndarray | None = None
    shap_base: float = 0.0

    @property
    def mejora_sobre_persistencia(self) -> float:
        """
        Porcentaje de mejora frente al modelo ingenuo de persistencia.

        La persistencia («mañana será como hoy») es el referente honesto en
        series temporales: un R² alto no significa nada si no se supera.
        """
        if self.mae_persistencia <= 0:
            return 0.0
        return round((1 - self.mae / self.mae_persistencia) * 100, 1)

    def tabla_metricas(self) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {
                    "Métrica": "MAE del modelo",
                    "Valor": round(self.mae, 2),
                    "Unidad": "µg/L",
                    "Interpretación": (
                        f"El pronóstico se desvía en promedio {self.mae:.1f} µg/L "
                        f"del valor real observado {self.horizonte_horas} h después."
                    ),
                },
                {
                    "Métrica": "MAE de persistencia",
                    "Valor": round(self.mae_persistencia, 2),
                    "Unidad": "µg/L",
                    "Interpretación": (
                        "Error del modelo ingenuo que predice que el valor futuro "
                        "será igual al actual. Es el listón mínimo a superar."
                    ),
                },
                {
                    "Métrica": "Mejora sobre persistencia",
                    "Valor": self.mejora_sobre_persistencia,
                    "Unidad": "%",
                    "Interpretación": (
                        "Reducción del error frente al modelo ingenuo. Si fuera "
                        "negativa, el modelo no aportaría nada y no debería usarse."
                    ),
                },
                {
                    "Métrica": "R²",
                    "Valor": round(self.r2, 3),
                    "Unidad": "adimensional",
                    "Interpretación": (
                        f"El modelo explica el {self.r2 * 100:.0f} % de la varianza "
                        f"del conjunto de prueba. No se calculó sobre datos de "
                        f"entrenamiento, sino sobre el periodo posterior al corte."
                    ),
                },
                {
                    "Métrica": "Tamaño de entrenamiento",
                    "Valor": len(self.X_train),
                    "Unidad": "observaciones",
                    "Interpretación": f"Registros anteriores al corte del {self.corte:%d/%m/%Y %H:%M}.",
                },
                {
                    "Métrica": "Tamaño de prueba",
                    "Valor": len(self.X_test),
                    "Unidad": "observaciones",
                    "Interpretación": "Registros posteriores al corte, nunca vistos al entrenar.",
                },
            ]
        )


# ---------------------------------------------------------------------------
# Preparación de variables
# ---------------------------------------------------------------------------

def construir_caracteristicas(df: pd.DataFrame, horizonte_horas: int = HORIZONTE_HORAS) -> pd.DataFrame:
    """
    Construye rezagos, medias móviles y la variable objetivo.

    El objetivo es la clorofila-a **`horizonte_horas` en el futuro**, desplazada
    dentro de cada estación. Todas las variables derivadas miran solo hacia
    atrás: cualquier ventana centrada filtraría información del futuro.
    """
    marcos = []
    for _, grupo in df.sort_values("tiempo").groupby("estacion_id", sort=False):
        g = grupo.copy()
        g["chlorophyll_a"] = g["chlorophyll_a"]
        g["chl_lag_24h"] = g["chlorophyll_a"].shift(24)
        g["chl_tendencia_24h"] = g["chlorophyll_a"] - g["chlorophyll_a"].shift(24)
        g["temp_media_24h"] = g["temp_surface"].rolling(24, min_periods=6).mean()
        g["viento_medio_24h"] = g["wind_speed"].rolling(24, min_periods=6).mean()
        g["persistencia"] = g["chlorophyll_a"]
        g["nivel_futuro"] = g["chlorophyll_a"].shift(-horizonte_horas)
        # El modelo aprende el INCREMENTO, no el nivel. Ver nota en entrenar().
        g["objetivo"] = g["nivel_futuro"] - g["chlorophyll_a"]
        marcos.append(g)

    listo = pd.concat(marcos, ignore_index=True)
    columnas = list(PREDICTORAS) + [
        "objetivo", "nivel_futuro", "persistencia", "tiempo", "estacion_id", "estacion",
    ]
    return listo.dropna(subset=columnas)[columnas].reset_index(drop=True)


def entrenar(
    df: pd.DataFrame,
    *,
    horizonte_horas: int = HORIZONTE_HORAS,
    fraccion_train: float = 0.75,
    semilla: int = 42,
) -> ResultadoModelo:
    """
    Entrena el modelo con **corte temporal**, no con partición aleatoria.

    Se entrena con el pasado y se evalúa con el futuro, que es la única forma
    de estimar honestamente cómo se comportará en operación. Una partición
    aleatoria dejaría en el entrenamiento observaciones posteriores a las de
    prueba y produciría métricas optimistas y falsas.

    **El modelo predice el incremento, no el nivel.** Es la decisión técnica más
    importante de este módulo. Un modelo de árboles que predice el nivel tiene
    que reconstruir la identidad «el valor futuro se parece al actual» mediante
    una escalera de cortes, lo que aproxima mal y hace que pierda frente a la
    persistencia pese a disponer de más información. Al fijar como objetivo la
    diferencia, la persistencia equivale a predecir cero y el modelo solo tiene
    que aprender la desviación respecto a ella, que es justamente lo que aporta.

    El nivel se reconstruye después como `valor_actual + incremento_previsto`, y
    **las métricas se calculan sobre el nivel** para que sigan siendo
    directamente comparables con el referente de persistencia.

    Ventaja añadida para la explicabilidad: las contribuciones SHAP pasan a
    explicar *por qué la biomasa va a cambiar*, que es la pregunta útil, en vez
    de *por qué está donde está*, que ya se sabe porque se mide.
    """
    datos = construir_caracteristicas(df, horizonte_horas)
    datos = datos.sort_values("tiempo").reset_index(drop=True)

    corte_idx = int(len(datos) * fraccion_train)
    corte = datos.loc[corte_idx, "tiempo"]

    train = datos.iloc[:corte_idx]
    test = datos.iloc[corte_idx:]

    X_train, X_test = train[list(PREDICTORAS)], test[list(PREDICTORAS)]
    delta_train, delta_test = train["objetivo"], test["objetivo"]
    nivel_test = test["nivel_futuro"]
    persistencia_test = test["persistencia"]

    modelo = GradientBoostingRegressor(
        n_estimators=220,
        learning_rate=0.06,
        max_depth=3,
        subsample=0.85,
        random_state=semilla,
    )
    modelo.fit(X_train, delta_train)

    delta_pred = modelo.predict(X_test)
    # Reconstrucción del nivel: valor actual + incremento previsto
    y_pred = persistencia_test.to_numpy() + delta_pred

    return ResultadoModelo(
        modelo=modelo,
        X_train=X_train,
        X_test=X_test,
        y_train=delta_train,
        y_test=nivel_test,
        y_pred=y_pred,
        delta_pred=delta_pred,
        delta_test=delta_test,
        # Métricas sobre el NIVEL, para que sean comparables con la persistencia
        mae=float(mean_absolute_error(nivel_test, y_pred)),
        r2=float(r2_score(nivel_test, y_pred)),
        mae_persistencia=float(mean_absolute_error(nivel_test, persistencia_test)),
        meta=test[["tiempo", "estacion_id", "estacion", "persistencia"]].reset_index(drop=True),
        corte=corte,
        horizonte_horas=horizonte_horas,
    )


# ---------------------------------------------------------------------------
# Explicabilidad SHAP
# ---------------------------------------------------------------------------

def calcular_shap(res: ResultadoModelo, *, max_muestras: int = 400) -> ResultadoModelo:
    """
    Calcula los valores SHAP sobre el conjunto de prueba.

    SHAP reparte la diferencia entre la predicción y el valor base (la media
    del entrenamiento) entre las variables de entrada, con una propiedad
    valiosa: las contribuciones **suman exactamente** esa diferencia. Eso
    permite leer la explicación como un balance cerrado, sin residuo
    inexplicado.
    """
    import shap

    X = res.X_test.iloc[:max_muestras]
    explicador = shap.TreeExplainer(res.modelo)
    valores = explicador.shap_values(X)

    res.shap_values = np.asarray(valores)
    base = explicador.expected_value
    res.shap_base = float(np.ravel(base)[0]) if np.ndim(base) else float(base)
    return res


def importancia_global(res: ResultadoModelo) -> pd.DataFrame:
    """
    Importancia global: media de |SHAP| por variable.

    Responde a «¿qué mueve al modelo en general?». Se acompaña del efecto medio
    con signo, que responde a algo distinto y complementario: «¿en qué
    dirección empuja habitualmente?».
    """
    if res.shap_values is None:
        raise RuntimeError("Llama antes a calcular_shap().")

    n = res.shap_values.shape[0]
    X = res.X_test.iloc[:n]

    filas = []
    for i, clave in enumerate(PREDICTORAS):
        contrib = res.shap_values[:, i]
        filas.append(
            {
                "variable": clave,
                "Variable": PREDICTORAS[clave],
                "Importancia media |SHAP|": round(float(np.abs(contrib).mean()), 3),
                "Efecto medio (con signo)": round(float(contrib.mean()), 3),
                "Correlación con el valor": round(float(np.corrcoef(X[clave], contrib)[0, 1]), 3)
                if X[clave].std() > 0 else 0.0,
            }
        )

    tabla = pd.DataFrame(filas).sort_values("Importancia media |SHAP|", ascending=False)

    def leer(fila) -> str:
        direccion = (
            "valores altos aumentan la biomasa prevista"
            if fila["Correlación con el valor"] > 0.15
            else "valores altos reducen la biomasa prevista"
            if fila["Correlación con el valor"] < -0.15
            else "su efecto no es monótono: depende del resto de variables"
        )
        return (
            f"Desplaza el pronóstico {fila['Importancia media |SHAP|']:.2f} µg/L "
            f"en promedio; {direccion}."
        )

    tabla["Interpretación"] = tabla.apply(leer, axis=1)
    return tabla.reset_index(drop=True)


@dataclass
class ExplicacionLocal:
    """
    Descomposición SHAP de una predicción concreta.

    Atención a las unidades: `valor_base`, `prediccion` y las contribuciones
    están en µg/L **de incremento** a lo largo del horizonte, porque es lo que
    el modelo aprende. `nivel_actual` y `nivel_previsto` son el nivel absoluto
    reconstruido.
    """
    indice: int
    prediccion: float          # incremento previsto [µg/L]
    valor_base: float          # incremento medio del entrenamiento [µg/L]
    contribuciones: pd.DataFrame
    tiempo: pd.Timestamp
    estacion: str
    nivel_actual: float = 0.0
    nivel_previsto: float = 0.0

    def narrativa(self) -> str:
        """Explicación en prosa de por qué el modelo predijo este cambio."""
        empujan = self.contribuciones[self.contribuciones["Contribución SHAP"] > 0].head(3)
        frenan = self.contribuciones[self.contribuciones["Contribución SHAP"] < 0].head(3)

        sentido = "aumento" if self.prediccion >= 0 else "descenso"
        partes = [
            f"El modelo parte de un cambio base de "
            f"**{self.valor_base:+.1f} µg/L** (el incremento medio del conjunto "
            f"de entrenamiento) y llega a un **{sentido} previsto de "
            f"{self.prediccion:+.1f} µg/L** para {self.estacion} "
            f"el {self.tiempo:%d/%m/%Y a las %H:%M}. Sobre el nivel actual de "
            f"{self.nivel_actual:.1f} µg/L, eso sitúa el pronóstico en "
            f"**{self.nivel_previsto:.1f} µg/L**."
        ]
        if not empujan.empty:
            detalle = "; ".join(
                f"{r['Variable']} = {r['Valor observado']:.2f} (+{r['Contribución SHAP']:.1f} µg/L)"
                for _, r in empujan.iterrows()
            )
            partes.append(f"**Empujan al alza:** {detalle}.")
        if not frenan.empty:
            detalle = "; ".join(
                f"{r['Variable']} = {r['Valor observado']:.2f} ({r['Contribución SHAP']:.1f} µg/L)"
                for _, r in frenan.iterrows()
            )
            partes.append(f"**Empujan a la baja:** {detalle}.")

        suma = self.contribuciones["Contribución SHAP"].sum()
        partes.append(
            f"La suma de todas las contribuciones es {suma:+.1f} µg/L, que es "
            f"exactamente la diferencia entre el cambio base y el previsto: la "
            f"explicación no deja residuo sin justificar."
        )
        return " ".join(partes)


def explicar_prediccion(res: ResultadoModelo, indice: int) -> ExplicacionLocal:
    """Descompone una predicción concreta en contribuciones por variable."""
    if res.shap_values is None:
        raise RuntimeError("Llama antes a calcular_shap().")

    n = res.shap_values.shape[0]
    indice = int(np.clip(indice, 0, n - 1))

    X = res.X_test.iloc[:n]
    fila_shap = res.shap_values[indice]
    fila_x = X.iloc[indice]

    contrib = pd.DataFrame(
        {
            "Variable": [PREDICTORAS[c] for c in PREDICTORAS],
            "Valor observado": [float(fila_x[c]) for c in PREDICTORAS],
            "Contribución SHAP": [float(v) for v in fila_shap],
        }
    )
    contrib["|Contribución|"] = contrib["Contribución SHAP"].abs()
    contrib = contrib.sort_values("|Contribución|", ascending=False).reset_index(drop=True)
    contrib["Sentido"] = np.where(
        contrib["Contribución SHAP"] > 0, "Aumenta el riesgo", "Reduce el riesgo"
    )

    if len(res.meta) > indice:
        tiempo = pd.Timestamp(res.meta.loc[indice, "tiempo"])
        estacion = str(res.meta.loc[indice, "estacion"])
    else:
        tiempo, estacion = pd.Timestamp.now(), "estación seleccionada"

    nivel_actual = float(res.meta.loc[indice, "persistencia"]) if len(res.meta) > indice else 0.0

    return ExplicacionLocal(
        indice=indice,
        prediccion=float(res.delta_pred[indice]),
        valor_base=res.shap_base,
        contribuciones=contrib,
        tiempo=tiempo,
        estacion=estacion,
        nivel_actual=nivel_actual,
        nivel_previsto=float(res.y_pred[indice]),
    )


# ---------------------------------------------------------------------------
# Contrafactuales
# ---------------------------------------------------------------------------

ACCIONABLES: dict[str, str] = {
    "total_phosphorus": "reducir la carga de fósforo en los afluentes",
    "wind_speed": "forzar mezcla artificial (desestratificación mecánica)",
    "total_nitrogen": "reducir la carga de nitrógeno",
}


def contrafactual(
    res: ResultadoModelo,
    indice: int,
    variable: str,
    *,
    objetivo: float = 25.0,
    pasos: int = 40,
) -> dict:
    """
    Busca el cambio mínimo en una variable que baja la predicción del umbral.

    Es la forma más accionable de explicabilidad: en lugar de decir «el fósforo
    influye mucho», responde «con el fósforo por debajo de 0,18 mg/L la
    predicción habría quedado bajo el umbral de atención».

    Solo se ofrecen variables sobre las que un gestor puede actuar. Un
    contrafactual sobre la temperatura del agua sería cierto e inútil.
    """
    if variable not in PREDICTORAS:
        raise KeyError(f"Variable no usada por el modelo: {variable}")

    n = res.shap_values.shape[0] if res.shap_values is not None else len(res.X_test)
    indice = int(np.clip(indice, 0, n - 1))
    base = res.X_test.iloc[[indice]].copy()

    # El modelo devuelve el INCREMENTO; el nivel es valor actual + incremento.
    nivel_actual = float(res.meta.loc[indice, "persistencia"]) if len(res.meta) > indice else 0.0
    pred_original = nivel_actual + float(res.modelo.predict(base)[0])
    valor_original = float(base[variable].iloc[0])

    lo = float(res.X_train[variable].quantile(0.01))
    hi = float(res.X_train[variable].quantile(0.99))
    barrido = np.linspace(lo, hi, pasos)

    predicciones = []
    for v in barrido:
        prueba = base.copy()
        prueba[variable] = v
        predicciones.append(nivel_actual + float(res.modelo.predict(prueba)[0]))
    predicciones = np.array(predicciones)

    bajo_umbral = np.where(predicciones <= objetivo)[0]
    if len(bajo_umbral):
        # El valor alcanzable más próximo al actual
        idx = bajo_umbral[np.argmin(np.abs(barrido[bajo_umbral] - valor_original))]
        valor_necesario = float(barrido[idx])
        alcanzable = True
        cambio = valor_necesario - valor_original
        mensaje = (
            f"Con **{PREDICTORAS[variable]} = {valor_necesario:.3f}** "
            f"(un cambio de {cambio:+.3f} respecto al valor observado de "
            f"{valor_original:.3f}), la predicción bajaría a "
            f"{predicciones[idx]:.1f} µg/L, por debajo del umbral de "
            f"{objetivo:.0f} µg/L. Acción asociada: {ACCIONABLES.get(variable, 'no accionable directamente')}."
        )
    else:
        valor_necesario = float("nan")
        alcanzable = False
        mensaje = (
            f"Ningún valor de **{PREDICTORAS[variable]}** dentro del rango "
            f"histórico observado ({lo:.3f} – {hi:.3f}) consigue por sí solo "
            f"bajar la predicción de {objetivo:.0f} µg/L. Actuar sobre esta "
            f"única variable no basta: haría falta una intervención combinada."
        )

    return {
        "variable": variable,
        "nombre": PREDICTORAS[variable],
        "valor_original": valor_original,
        "prediccion_original": pred_original,
        "valor_necesario": valor_necesario,
        "alcanzable": alcanzable,
        "objetivo": objetivo,
        "nivel_actual": nivel_actual,
        "barrido": barrido,
        "predicciones": predicciones,
        "mensaje": mensaje,
    }
