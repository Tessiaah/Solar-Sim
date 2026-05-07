import numpy as np
from src.data.constants import *

from src.simulation.body import BodyState, BodyVisual, CelestialBody, SimBody

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
            visual=BodyVisual(
                kind="standard",
                emissive="#f4b84a",
                emissive_intensity=1.8,
                roughness=0.62,
            ),
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
            visual=BodyVisual(
                kind="standard",
                roughness=0.78,
            ),
        ),
        state=BodyState(
            position_m=np.array([EARTH_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, EARTH_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )
    return [sun, earth]



#q ganda crl de esparguete mn to do refazer esta mrd toda
def create_solar_system()->list[SimBody]:

    mercury = SimBody(
        definition=CelestialBody(
            name="Mercury",
            mass_kg=MERCURY_MASS_KG,
            radius_m=MERCURY_RADIUS_M,
            color="#b7b1a7",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                roughness=0.85,
            ),
        ),
        state=BodyState(
            position_m=np.array([MERCURY_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, MERCURY_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )

    venus = SimBody(
        definition=CelestialBody(
            name="Venus",
            mass_kg=VENUS_MASS_KG,
            radius_m=VENUS_RADIUS_M,
            color="#d9b38c",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                roughness=0.9,
            ),
        ),
        state=BodyState(
            position_m=np.array([VENUS_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, VENUS_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )

    earth = SimBody(
        definition=CelestialBody(
            name="Earth",
            mass_kg=EARTH_MASS_KG,
            radius_m=EARTH_RADIUS_M,
            color="#4f85ff",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                roughness=0.78,
            ),
        ),
        state=BodyState(
            position_m=np.array([EARTH_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, EARTH_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )

    mars = SimBody(
        definition=CelestialBody(
            name="Mars",
            mass_kg=MARS_MASS_KG,
            radius_m=MARS_RADIUS_M,
            color="#c1440e",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                roughness=0.8,
            ),
        ),
        state=BodyState(
            position_m=np.array([MARS_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, MARS_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )


    jupiter = SimBody(
        definition=CelestialBody(
            name="Jupiter",
            mass_kg=JUPITER_MASS_KG,
            radius_m=JUPITER_RADIUS_M,
            color="#d2b48c",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                roughness=0.75,
            ),
        ),
        state=BodyState(
            position_m=np.array([JUPITER_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, JUPITER_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )

    saturn = SimBody(
        definition=CelestialBody(
            name="Saturn",
            mass_kg=SATURN_MASS_KG,
            radius_m=SATURN_RADIUS_M,
            color="#e3c27d",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                roughness=0.7,
            ),
        ),
        state=BodyState(
            position_m=np.array([SATURN_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, SATURN_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )

    uranus = SimBody(
        definition=CelestialBody(
            name="Uranus",
            mass_kg=URANUS_MASS_KG,
            radius_m=URANUS_RADIUS_M,
            color="#9fd6d2",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                roughness=0.65,
            ),
        ),
        state=BodyState(
            position_m=np.array([URANUS_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, URANUS_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )

    neptune = SimBody(
        definition=CelestialBody(
            name="Neptune",
            mass_kg=NEPTUNE_MASS_KG,
            radius_m=NEPTUNE_RADIUS_M,
            color="#3d5aa9",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                roughness=0.7,
            ),
        ),
        state=BodyState(
            position_m=np.array([NEPTUNE_DISTANCE_FROM_SUN_M, 0.0, 0.0], dtype=np.float64),
            velocity_ms=np.array([0.0, NEPTUNE_ORBITAL_SPEED_MS, 0.0], dtype=np.float64),
        ),
    )

    # Sun initial calc velocity
    planets = [mercury, venus, earth, mars, jupiter, saturn, uranus, neptune]

    planet_momentum = np.zeros(3, dtype=np.float64)

    for planet in planets:
        planet_momentum += planet.definition.mass_kg * planet.state.velocity_ms

    sun_velocity: np.ndarray = -planet_momentum / SUN_MASS_KG

    sun = SimBody(
        definition=CelestialBody(
            name="Sun",
            mass_kg=SUN_MASS_KG,
            radius_m=SUN_RADIUS_M,
            color="#f4d27a",
            isfixed=False,
            visual=BodyVisual(
                kind="standard",
                emissive="#f4b84a",
                emissive_intensity=1.8,
                roughness=0.62,
            ),
        ),
        state=BodyState(
            position_m=np.array([0.0, 0.0, 0.0], dtype=np.float64),
            velocity_ms=sun_velocity,
        ),
    )

    return [sun, mercury, venus, earth, mars, jupiter, saturn, uranus, neptune]
