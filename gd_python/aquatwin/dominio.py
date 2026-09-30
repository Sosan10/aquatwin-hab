"""
Dominio del Gemelo Digital AquaTwin HAB.

Tipos, enumeraciones y umbrales normativos. Portado desde `src/types.ts` del
gemelo web, conservando nombres de campo y unidades para que ambos motores
hablen el mismo idioma.

Todo umbral declarado aquí lleva su referencia normativa explícita: es la base
de la trazabilidad del diagnóstico (ver `motor/reglas.py`).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


# ---------------------------------------------------------------------------
# Enumeraciones del dominio
# ---------------------------------------------------------------------------

class NivelRiesgo(str, Enum):
    """Nivel de alerta sanitaria. El orden define la severidad."""
    BAJO = "BAJO"
    MODERADO = "MODERADO"
    ALTO = "ALTO"
    CRITICO = "CRITICO"

    @property
    def orden(self) -> int:
        return {"BAJO": 0, "MODERADO": 1, "ALTO": 2, "CRITICO": 3}[self.value]

    @property
    def color(self) -> str:
        return {
            "BAJO": "#10b981",
            "MODERADO": "#f59e0b",
            "ALTO": "#f97316",
            "CRITICO": "#ef4444",
        }[self.value]


class EstadoTrofico(str, Enum):
    """Clasificación trófica según el índice TSI de Carlson (1977)."""
    OLIGOTROFICO = "Oligotrófico"
    MESOTROFICO = "Mesotrófico"
    EUTROFICO = "Eutrófico"
    HIPEREUTROFICO = "Hipereutrófico"


class CalidadDato(str, Enum):
    """
    Bandera de calidad por medición, siguiendo el esquema QARTOD
    (Quality Assurance of Real-Time Oceanographic Data).

    Toda figura y tabla debe poder distinguir un dato medido de uno dudoso.
    """
    BUENO = "bueno"
    SOSPECHOSO = "sospechoso"
    MALO = "malo"
    INTERPOLADO = "interpolado"
    NO_EVALUADO = "no_evaluado"

    @property
    def color(self) -> str:
        return {
            "bueno": "#22d3ee",
            "sospechoso": "#a78bfa",
            "malo": "#ef4444",
            "interpolado": "#64748b",
            "no_evaluado": "#475569",
        }[self.value]


TipoAnomalia = Literal[
    "PICO_TERMICO",
    "HIPOXIA_NOCTURNA",
    "PULSO_NUTRIENTES",
    "DUPLICACION_BIOMASA",
]


# ---------------------------------------------------------------------------
# Entidades
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Variable:
    """
    Definición de una variable limnológica.

    Es la pieza que hace posible la interpretabilidad automática: cada variable
    conoce su unidad, su rango físicamente válido, sus umbrales y de dónde sale.
    Cualquier figura o tabla que la use puede describirse sola.
    """
    clave: str
    nombre: str
    unidad: str
    descripcion: str
    rango_valido: tuple[float, float]      # rango físicamente posible (control de calidad)
    umbral_atencion: float | None = None
    umbral_critico: float | None = None
    referencia: str = ""                   # norma o fuente del umbral
    mayor_es_peor: bool = True             # dirección del riesgo

    def clasificar(self, valor: float) -> NivelRiesgo:
        """Clasifica un valor según los umbrales de la variable."""
        if self.umbral_atencion is None or self.umbral_critico is None:
            return NivelRiesgo.BAJO
        if self.mayor_es_peor:
            if valor >= self.umbral_critico:
                return NivelRiesgo.CRITICO
            if valor >= self.umbral_atencion:
                return NivelRiesgo.MODERADO
            return NivelRiesgo.BAJO
        # Variables donde el riesgo crece al bajar (p. ej. oxígeno disuelto)
        if valor <= self.umbral_critico:
            return NivelRiesgo.CRITICO
        if valor <= self.umbral_atencion:
            return NivelRiesgo.MODERADO
        return NivelRiesgo.BAJO

    def es_fisicamente_valido(self, valor: float) -> bool:
        lo, hi = self.rango_valido
        return lo <= valor <= hi

    def etiqueta(self) -> str:
        """Etiqueta de eje lista para graficar, siempre con unidad."""
        return f"{self.nombre} [{self.unidad}]"


@dataclass(frozen=True)
class Embalse:
    """Cuerpo de agua monitorizado."""
    id: str
    nombre: str
    ubicacion: str
    pais: str
    lat: float
    lng: float
    area_km2: float
    prof_max_m: float
    prof_media_m: float
    volumen_hm3: float
    estado_trofico: EstadoTrofico
    uso_principal: str
    sensor_satelital: str

    @property
    def tiempo_residencia_dias(self) -> float:
        """
        Aproximación grosera del tiempo de residencia hidráulica.

        Se usa solo como contexto interpretativo (un embalse con residencia
        larga acumula nutrientes); no alimenta el diagnóstico.
        """
        return self.volumen_hm3 / max(self.area_km2, 0.1) * 30.0


@dataclass(frozen=True)
class Estacion:
    """
    Estación de monitorización (boya IoT o punto de muestreo).

    En el gemelo web se llama `IoTBuoy`. Aquí se nombra `Estacion` porque el
    motor Python admite además puntos de muestreo manual y píxeles satelitales.
    """
    id: str
    nombre: str
    codigo: str
    embalse_id: str
    lat: float
    lng: float
    x: float                  # coordenada local de escena (m, relativa al centro)
    z: float
    profundidad_m: float
    bateria_pct: float = 100.0


@dataclass(frozen=True)
class Actuador:
    """Dispositivo de mitigación. En este motor su efecto es simulado."""
    id: str
    nombre: str
    tipo: Literal["AIREADOR", "ULTRASONICO", "COMPUERTA", "COAGULANTE"]
    embalse_id: str
    x: float
    z: float
    potencia_pct: float
    estado: str
    frecuencia_khz: float | None = None
    caudal_m3s: float | None = None


# ---------------------------------------------------------------------------
# Catálogo de variables — fuente única de verdad para ejes, unidades y umbrales
# ---------------------------------------------------------------------------

OMS_MICROCISTINA_POTABLE = 1.0      # µg/L — OMS, agua de consumo
OMS_MICROCISTINA_RECREATIVA = 10.0  # µg/L — OMS, uso recreativo
REDFIELD_NP = 16.0                  # relación molar N:P de Redfield

VARIABLES: dict[str, Variable] = {
    "chlorophyll_a": Variable(
        clave="chlorophyll_a",
        nombre="Clorofila-a",
        unidad="µg/L",
        descripcion=(
            "Estimador de biomasa fitoplanctónica total. Es el indicador "
            "primario del estado trófico y la base del índice TSI de Carlson."
        ),
        rango_valido=(0.0, 500.0),
        umbral_atencion=25.0,
        umbral_critico=50.0,
        referencia="OMS (2003), guía de aguas recreativas — nivel de alerta 1 y 2",
    ),
    "phycocyanin": Variable(
        clave="phycocyanin",
        nombre="Ficocianina",
        unidad="células/mL",
        descripcion=(
            "Pigmento accesorio exclusivo de cianobacterias. A diferencia de la "
            "clorofila-a, distingue cianobacterias de algas verdes y diatomeas, "
            "por lo que es el indicador directo de riesgo de cianotoxinas."
        ),
        rango_valido=(0.0, 500_000.0),
        umbral_atencion=20_000.0,
        umbral_critico=100_000.0,
        referencia="OMS (2003), umbrales de densidad celular de cianobacterias",
    ),
    "temp_surface": Variable(
        clave="temp_surface",
        nombre="Temperatura superficial",
        unidad="°C",
        descripcion=(
            "Controla la tasa de división celular. Por encima de ~23 °C las "
            "cianobacterias superan competitivamente a diatomeas y clorofitas."
        ),
        rango_valido=(-2.0, 45.0),
        umbral_atencion=24.0,
        umbral_critico=28.0,
        referencia="Paerl & Huisman (2008), 'Blooms like it hot'",
    ),
    "dissolved_oxygen": Variable(
        clave="dissolved_oxygen",
        nombre="Oxígeno disuelto",
        unidad="mg/L",
        descripcion=(
            "Balance entre fotosíntesis y respiración. Valores muy bajos indican "
            "hipoxia; valores muy altos, sobresaturación por floración activa."
        ),
        rango_valido=(0.0, 25.0),
        umbral_atencion=5.0,
        umbral_critico=3.0,
        referencia="EPA (1986), criterio de calidad para vida acuática",
        mayor_es_peor=False,
    ),
    "total_phosphorus": Variable(
        clave="total_phosphorus",
        nombre="Fósforo total",
        unidad="mg/L",
        descripcion=(
            "Nutriente habitualmente limitante en aguas continentales. Es la "
            "palanca de gestión más eficaz a largo plazo."
        ),
        rango_valido=(0.0, 5.0),
        umbral_atencion=0.05,
        umbral_critico=0.10,
        referencia="OCDE (1982), límites de clasificación trófica",
    ),
    "total_nitrogen": Variable(
        clave="total_nitrogen",
        nombre="Nitrógeno total",
        unidad="mg/L",
        descripcion=(
            "Junto al fósforo determina la relación N:P, que condiciona qué "
            "grupo algal domina la comunidad."
        ),
        rango_valido=(0.0, 50.0),
        umbral_atencion=1.5,
        umbral_critico=3.0,
        referencia="OCDE (1982)",
    ),
    "ph": Variable(
        clave="ph",
        nombre="pH",
        unidad="unidades de pH",
        descripcion=(
            "Sube durante la fotosíntesis intensa por consumo de CO₂. Un pH > 9 "
            "sostenido es indicio indirecto de floración activa."
        ),
        rango_valido=(0.0, 14.0),
        umbral_atencion=8.5,
        umbral_critico=9.0,
        referencia="Indicador secundario de actividad fotosintética",
    ),
    "turbidity": Variable(
        clave="turbidity",
        nombre="Turbidez",
        unidad="NTU",
        descripcion=(
            "Material en suspensión. Limita la penetración de luz y compite con "
            "la señal óptica de la clorofila en teledetección."
        ),
        rango_valido=(0.0, 1000.0),
        umbral_atencion=25.0,
        umbral_critico=50.0,
        referencia="Criterio operativo de la planta potabilizadora",
    ),
    "wind_speed": Variable(
        clave="wind_speed",
        nombre="Velocidad del viento",
        unidad="km/h",
        descripcion=(
            "El viento genera mezcla vertical turbulenta. Con calma sostenida "
            "(< 3 km/h) las cianobacterias flotan y forman nata superficial."
        ),
        rango_valido=(0.0, 200.0),
        umbral_atencion=3.0,
        umbral_critico=2.0,
        referencia="Criterio de formación de nata (scum) por flotación",
        mayor_es_peor=False,
    ),
    "solar_par": Variable(
        clave="solar_par",
        nombre="Radiación PAR",
        unidad="µmol/m²·s",
        descripcion=(
            "Radiación fotosintéticamente activa (400–700 nm). Es el aporte "
            "energético que sostiene la producción primaria."
        ),
        rango_valido=(0.0, 2500.0),
        umbral_atencion=1200.0,
        umbral_critico=1500.0,
        referencia="Umbral operativo de saturación lumínica",
    ),
    "microcystin": Variable(
        clave="microcystin",
        nombre="Microcistina-LR estimada",
        unidad="µg/L",
        descripcion=(
            "Hepatotoxina producida por Microcystis. Es la variable con "
            "consecuencia sanitaria directa; se estima a partir de la densidad "
            "de cianobacterias y requiere confirmación por HPLC o ELISA."
        ),
        rango_valido=(0.0, 200.0),
        umbral_atencion=OMS_MICROCISTINA_POTABLE,
        umbral_critico=OMS_MICROCISTINA_RECREATIVA,
        referencia="OMS, guías para agua de consumo (1,0 µg/L) y recreativa (10 µg/L)",
    ),
}


def variable(clave: str) -> Variable:
    """Acceso al catálogo con error explícito si la clave no existe."""
    if clave not in VARIABLES:
        raise KeyError(
            f"Variable '{clave}' no está en el catálogo. "
            f"Disponibles: {', '.join(sorted(VARIABLES))}"
        )
    return VARIABLES[clave]


# ---------------------------------------------------------------------------
# Taxones de cianobacterias — para la interpretación del pronóstico
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Taxon:
    nombre: str
    toxina: str
    rango_temp_optimo: tuple[float, float]
    nota: str


TAXONES: dict[str, Taxon] = {
    "Microcystis aeruginosa": Taxon(
        nombre="Microcystis aeruginosa",
        toxina="Microcistina-LR (hepatotoxina)",
        rango_temp_optimo=(25.0, 32.0),
        nota=(
            "Forma colonias con vesículas de gas que le permiten flotar y "
            "acumularse en superficie con viento en calma. Es el taxón "
            "dominante en floraciones de embalses hipereutróficos cálidos."
        ),
    ),
    "Dolichospermum flos-aquae": Taxon(
        nombre="Dolichospermum flos-aquae",
        toxina="Anatoxina-a (neurotoxina)",
        rango_temp_optimo=(20.0, 28.0),
        nota=(
            "Fija nitrógeno atmosférico, por lo que prospera cuando la relación "
            "N:P es muy baja y el nitrógeno es limitante."
        ),
    ),
    "Planktothrix agardhii": Taxon(
        nombre="Planktothrix agardhii",
        toxina="Microcistina",
        rango_temp_optimo=(15.0, 25.0),
        nota=(
            "Tolera baja irradiancia; típica de aguas someras y turbias, y de "
            "floraciones que persisten en otoño."
        ),
    ),
    "Cylindrospermopsis raciborskii": Taxon(
        nombre="Cylindrospermopsis raciborskii",
        toxina="Cilindrospermopsina (hepatotoxina)",
        rango_temp_optimo=(25.0, 35.0),
        nota=(
            "Especie invasora en expansión hacia latitudes templadas. Tolera "
            "baja luz y fija nitrógeno."
        ),
    ),
}
