from dataclasses import dataclass
import math
import numpy as np

@dataclass
class BodyState:
    position_m: np.ndarray
    velocity_ms: np.ndarray


@dataclass(frozen=True)
class CelestialBody:
    name: str
    mass_kg: float
    radius_m: float
    color: str
    parent: str | None = None
    isfixed: bool | None = False

@dataclass
class SimBody:
    definition: CelestialBody
    state: BodyState


