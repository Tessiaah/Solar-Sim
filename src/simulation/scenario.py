import numpy as np
from src.data.constants import (
    AU_M,
    EARTH_MASS_KG,
    EARTH_ORBITAL_SPEED_MS,
    EARTH_RADIUS_M,
    SUN_MASS_KG,
    SUN_RADIUS_M,
)
from body import CelestialBody, BodyState, SimBody

def create_sun_earth_system()->list[SimBody]:
    sun_velocity_y = -(
            EARTH_MASS_KG * EARTH_ORBITAL_SPEED_MS
    ) / SUN_MASS_KG

    sun = SimBody(
        definition=CelestialBody(
            name="Sun",
            mass_kg=SUN_MASS_KG,
            radius_m=SUN_RADIUS_M,
            color="#f4d27a",
            isfixed=False,
        ),
        state=BodyState(
            position_m=np.array([0.0, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, sun_velocity_y, 0.0], dtype=np.float64),
        ),
    )
    earth = SimBody(
        definition=CelestialBody(
            name="Earth",
            mass_kg=EARTH_MASS_KG,
            radius_m=EARTH_RADIUS_M,
            color="#4f85ff",
            isfixed=False,
        ),
        state=BodyState(
            position_m=np.array([AU_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, EARTH_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )

    return [sun, earth]

