from dataclasses import dataclass
import numpy as np

@dataclass
class BodyState:
    position_m: np.ndarray
    velocity_ms: np.ndarray


@dataclass(frozen=True)
class BodyRingBand:
    inner_radius_m: float
    outer_radius_m: float
    color: str
    opacity: float = 1.0


@dataclass(frozen=True)
class BodyRing:
    inner_radius_m: float
    outer_radius_m: float
    tilt_rad: float = 0.0
    color: str = "#d8c48e"
    opacity: float = 0.64
    radial_segments: int = 192
    animation_rate_rad_s: float = 0.0
    bands: tuple[BodyRingBand, ...] = ()


@dataclass(frozen=True)
class BodyVisual:
    kind: str = "standard"
    base_color: str | None = None
    emissive: str | None = None
    emissive_intensity: float = 0.0
    roughness: float = 0.7
    metalness: float = 0.0
    clearcoat: float = 0.0
    textures: dict[str, str] | None = None
    rings: tuple[BodyRing, ...] = ()


@dataclass(frozen=True)
class BodyOrbit:
    semi_major_axis_m: float
    eccentricity: float = 0.0
    inclination_rad: float = 0.0
    longitude_of_ascending_node_rad: float = 0.0
    argument_of_periapsis_rad: float = 0.0
    center_m: tuple[float, float, float] = (0.0, 0.0, 0.0)


@dataclass(frozen=True)
class CelestialBody:
    name: str
    mass_kg: float
    radius_m: float
    color: str
    parent: str | None = None
    isfixed: bool | None = False
    visual: BodyVisual | None = None
    orbit: BodyOrbit | None = None
    facts: tuple[str, ...] = ()

@dataclass
class SimBody:
    definition: CelestialBody
    state: BodyState


