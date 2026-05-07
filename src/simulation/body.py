from dataclasses import dataclass
import numpy as np

@dataclass
class BodyState:
    position_m: np.ndarray
    velocity_ms: np.ndarray


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


@dataclass(frozen=True)
class CelestialBody:
    name: str
    mass_kg: float
    radius_m: float
    color: str
    parent: str | None = None
    isfixed: bool | None = False
    visual: BodyVisual | None = None

@dataclass
class SimBody:
    definition: CelestialBody
    state: BodyState


