"""Fase 3 — Adaptadores de modelos de pronóstico.

Interfaces abstractas (ABC) y versiones simuladas deterministas para
el modelo hidrodinámico-ecológico (physics) y el modelo ML (LSTM/Transformer).
Los modelos reales se conectarán en Fase 6 sin cambiar la interfaz.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from typing import Any


# ---------------------------------------------------------------------------
# Claves estándar del pronóstico
# ---------------------------------------------------------------------------

FORECAST_KEYS = {
    "chlorophyll_a",
    "microcystin",
    "bloom_probability",
    "temp_surface",
    "dissolved_oxygen",
}


# ---------------------------------------------------------------------------
# Interfaz abstracta — Modelo Físico
# ---------------------------------------------------------------------------

class PhysicsModelAdapter(ABC):
    """Interfaz para adaptadores de modelos hidrodinámico-ecológicos."""

    @abstractmethod
    def forecast(
        self,
        posterior_state: dict[str, float],
        horizon_days: int,
    ) -> dict[str, Any]:
        """Genera un pronóstico a partir del estado asimilado.

        Returns
        -------
        dict con al menos las claves de FORECAST_KEYS más:
            model_id: str
            model_version: str
            parameters: dict
        """

    @property
    @abstractmethod
    def model_id(self) -> str: ...

    @property
    @abstractmethod
    def model_version(self) -> str: ...


# ---------------------------------------------------------------------------
# Interfaz abstracta — Modelo ML
# ---------------------------------------------------------------------------

class MLModelAdapter(ABC):
    """Interfaz para adaptadores de modelos ML (LSTM, Transformer, etc.)."""

    @abstractmethod
    def forecast(
        self,
        posterior_state: dict[str, float],
        horizon_days: int,
    ) -> dict[str, Any]:
        """Genera un pronóstico ML a partir del estado asimilado."""

    @property
    @abstractmethod
    def model_id(self) -> str: ...

    @property
    @abstractmethod
    def model_version(self) -> str: ...


# ---------------------------------------------------------------------------
# Implementación simulada — Modelo Físico
# ---------------------------------------------------------------------------

class SyntheticPhysicsModel(PhysicsModelAdapter):
    """Modelo fenomenológico simplificado de crecimiento de cianobacterias.

    Simula efectos de:
    - Temperatura: tasa de crecimiento con óptimo a 28 °C (Monod-like)
    - Fósforo: limitación de nutrientes (Michaelis-Menten)
    - Viento: mezcla → rompe estratificación → reduce bloom
    - Luz: saturación fotosintética
    """

    MODEL_ID = "synthetic-physics"
    MODEL_VERSION = "v1.0"

    # Parámetros del modelo
    GROWTH_RATE_BASE = 0.12          # día⁻¹
    TEMP_OPTIMAL = 28.0              # °C
    TEMP_SIGMA = 8.0                 # °C — ancho de la curva gaussiana
    PHOSPHORUS_KS = 0.05             # mg/L — constante de semisaturación
    WIND_MIXING_THRESHOLD = 15.0     # km/h — viento que rompe estratificación
    LIGHT_SATURATION = 1500.0        # µmol/m²/s
    MICROCYSTIN_RATIO = 0.15         # µg MC / µg Chl-a

    @property
    def model_id(self) -> str:
        return self.MODEL_ID

    @property
    def model_version(self) -> str:
        return self.MODEL_VERSION

    def forecast(
        self,
        posterior_state: dict[str, float],
        horizon_days: int,
    ) -> dict[str, Any]:
        chl = posterior_state.get("chlorophyll_a", 40.0)
        temp = posterior_state.get("temp_surface", 22.0)
        phos = posterior_state.get("total_phosphorus", 0.15)
        do = posterior_state.get("dissolved_oxygen", 7.5)
        wind = posterior_state.get("wind_speed", 8.0)
        light = posterior_state.get("solar_radiation", 1200.0)

        # Efecto de temperatura (gaussiana centrada en óptimo)
        temp_factor = math.exp(-0.5 * ((temp - self.TEMP_OPTIMAL) / self.TEMP_SIGMA) ** 2)

        # Limitación por fósforo (Michaelis-Menten)
        phos_factor = phos / (phos + self.PHOSPHORUS_KS)

        # Efecto del viento (mezcla reduce bloom)
        wind_factor = max(0.1, 1.0 - wind / (self.WIND_MIXING_THRESHOLD * 2))

        # Efecto de luz (saturación)
        light_factor = min(1.0, light / self.LIGHT_SATURATION)

        # Tasa de crecimiento efectiva
        growth_rate = (
            self.GROWTH_RATE_BASE * temp_factor * phos_factor
            * wind_factor * light_factor
        )

        # Proyección de clorofila-a
        chl_forecast = chl * (1.0 + growth_rate * horizon_days)
        chl_forecast = max(0.0, min(500.0, chl_forecast))

        # Microcistina estimada
        mc_forecast = chl_forecast * self.MICROCYSTIN_RATIO

        # Probabilidad de bloom basada en clorofila proyectada
        bloom_prob = min(0.99, max(0.01, 1.0 / (1.0 + math.exp(
            -0.08 * (chl_forecast - 60.0)
        ))))

        # Temperatura proyectada (variación mínima en horizonte corto)
        temp_forecast = temp + 0.1 * horizon_days * (0.5 - wind_factor)

        # OD tiende a bajar con bloom
        do_forecast = max(0.5, do - 0.3 * horizon_days * bloom_prob)

        return {
            "chlorophyll_a": round(chl_forecast, 2),
            "microcystin": round(mc_forecast, 2),
            "bloom_probability": round(bloom_prob, 4),
            "temp_surface": round(temp_forecast, 2),
            "dissolved_oxygen": round(do_forecast, 2),
            "model_id": self.MODEL_ID,
            "model_version": self.MODEL_VERSION,
            "parameters": {
                "growth_rate_base": self.GROWTH_RATE_BASE,
                "temp_optimal": self.TEMP_OPTIMAL,
                "phosphorus_ks": self.PHOSPHORUS_KS,
                "wind_mixing_threshold": self.WIND_MIXING_THRESHOLD,
                "horizon_days": horizon_days,
            },
        }


# ---------------------------------------------------------------------------
# Implementación simulada — Modelo ML
# ---------------------------------------------------------------------------

class SyntheticMLModel(MLModelAdapter):
    """Modelo ML simulado que emula un LSTM/Transformer.

    Usa una lógica basada en tendencias del estado asimilado con un
    factor de "patrón aprendido" que difiere ligeramente del modelo físico.
    Esto genera la dispersión inter-modelo necesaria para el ensemble.
    """

    MODEL_ID = "synthetic-ml"
    MODEL_VERSION = "v1.0"

    # El ML "aprende" pesos ligeramente diferentes
    CHL_SENSITIVITY = 0.15           # sensibilidad a clorofila actual
    TEMP_SENSITIVITY = 0.04          # sensibilidad a temperatura
    NUTRIENT_BOOST = 1.8             # factor de nutrientes
    BIAS_CORRECTION = -5.0           # corrección de sesgo aprendido

    @property
    def model_id(self) -> str:
        return self.MODEL_ID

    @property
    def model_version(self) -> str:
        return self.MODEL_VERSION

    def forecast(
        self,
        posterior_state: dict[str, float],
        horizon_days: int,
    ) -> dict[str, Any]:
        chl = posterior_state.get("chlorophyll_a", 40.0)
        temp = posterior_state.get("temp_surface", 22.0)
        phos = posterior_state.get("total_phosphorus", 0.15)
        do = posterior_state.get("dissolved_oxygen", 7.5)
        wind = posterior_state.get("wind_speed", 8.0)

        # Proyección ML con pesos "aprendidos"
        chl_delta = (
            self.CHL_SENSITIVITY * chl
            + self.TEMP_SENSITIVITY * max(0, temp - 18) * chl
            + self.NUTRIENT_BOOST * phos * chl * 0.1
            - 0.02 * wind * chl * 0.1
            + self.BIAS_CORRECTION
        )
        chl_forecast = max(0.0, min(500.0, chl + chl_delta * horizon_days / 7))

        # Microcistina con ratio ligeramente diferente al modelo físico
        mc_forecast = chl_forecast * 0.13

        # Probabilidad de bloom (sigmoid con umbral diferente al físico)
        bloom_prob = min(0.99, max(0.01, 1.0 / (1.0 + math.exp(
            -0.07 * (chl_forecast - 55.0)
        ))))

        # Temperatura
        temp_forecast = temp + 0.05 * horizon_days

        # OD
        do_forecast = max(0.5, do - 0.25 * horizon_days * bloom_prob)

        return {
            "chlorophyll_a": round(chl_forecast, 2),
            "microcystin": round(mc_forecast, 2),
            "bloom_probability": round(bloom_prob, 4),
            "temp_surface": round(temp_forecast, 2),
            "dissolved_oxygen": round(do_forecast, 2),
            "model_id": self.MODEL_ID,
            "model_version": self.MODEL_VERSION,
            "parameters": {
                "chl_sensitivity": self.CHL_SENSITIVITY,
                "temp_sensitivity": self.TEMP_SENSITIVITY,
                "nutrient_boost": self.NUTRIENT_BOOST,
                "bias_correction": self.BIAS_CORRECTION,
                "horizon_days": horizon_days,
            },
        }
