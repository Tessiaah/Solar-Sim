from dataclasses import replace

import numpy as np

from src.data.constants import *
from src.simulation.body import BodyOrbit, BodyRing, BodyRingBand, BodyState, BodyVisual, CelestialBody, SimBody
from src.simulation.ids import body_id_from_name


TEXTURE_BASE_PATH = "./assets/textures/planets"
BODY_TEXTURES = {
    "Sun": f"{TEXTURE_BASE_PATH}/sun.jpg",
    "Mercury": f"{TEXTURE_BASE_PATH}/mercury.jpg",
    "Venus": f"{TEXTURE_BASE_PATH}/venus.jpg",
    "Earth": f"{TEXTURE_BASE_PATH}/earth.jpg",
    "Mars": f"{TEXTURE_BASE_PATH}/mars.jpg",
    "Jupiter": f"{TEXTURE_BASE_PATH}/jupiter.jpg",
    "Saturn": f"{TEXTURE_BASE_PATH}/saturn.jpg",
    "Uranus": f"{TEXTURE_BASE_PATH}/uranus.jpg",
    "Neptune": f"{TEXTURE_BASE_PATH}/neptune.jpg",
}

BODY_FACTS = {
    "Sun": (
        "facts.sun.centralStar",
        "facts.sun.integrated",
        "facts.sun.primaryLight",
    ),
    "Mercury": (
        "facts.mercury.closest",
        "facts.mercury.smallest",
        "facts.mercury.fastest",
    ),
    "Venus": (
        "facts.venus.second",
        "facts.venus.earthSized",
    ),
    "Earth": (
        "facts.earth.scaleReference",
        "facts.earth.oneAu",
    ),
    "Mars": (
        "facts.mars.rocky",
        "facts.mars.warmMaterial",
    ),
    "Jupiter": (
        "facts.jupiter.largest",
        "facts.jupiter.momentum",
    ),
    "Saturn": (
        "facts.saturn.secondLargest",
        "facts.saturn.mainRings",
    ),
    "Uranus": (
        "facts.uranus.iceGiant",
        "facts.uranus.outerPlanet",
    ),
    "Neptune": (
        "facts.neptune.outermost",
        "facts.neptune.slowest",
    ),
}

PLANET_SPECS = {
    "Mercury": {
        "mass_kg": MERCURY_MASS_KG,
        "radius_m": MERCURY_RADIUS_M,
        "distance_m": MERCURY_DISTANCE_FROM_SUN_M,
        "orbital_speed_ms": MERCURY_ORBITAL_SPEED_MS,
        "color": "#b7b1a7",
        "roughness": 0.85,
    },
    "Venus": {
        "mass_kg": VENUS_MASS_KG,
        "radius_m": VENUS_RADIUS_M,
        "distance_m": VENUS_DISTANCE_FROM_SUN_M,
        "orbital_speed_ms": VENUS_ORBITAL_SPEED_MS,
        "color": "#d9b38c",
        "roughness": 0.9,
    },
    "Earth": {
        "mass_kg": EARTH_MASS_KG,
        "radius_m": EARTH_RADIUS_M,
        "distance_m": EARTH_DISTANCE_FROM_SUN_M,
        "orbital_speed_ms": EARTH_ORBITAL_SPEED_MS,
        "color": "#4f85ff",
        "roughness": 0.78,
    },
    "Mars": {
        "mass_kg": MARS_MASS_KG,
        "radius_m": MARS_RADIUS_M,
        "distance_m": MARS_DISTANCE_FROM_SUN_M,
        "orbital_speed_ms": MARS_ORBITAL_SPEED_MS,
        "color": "#c1440e",
        "roughness": 0.8,
    },
    "Jupiter": {
        "mass_kg": JUPITER_MASS_KG,
        "radius_m": JUPITER_RADIUS_M,
        "distance_m": JUPITER_DISTANCE_FROM_SUN_M,
        "orbital_speed_ms": JUPITER_ORBITAL_SPEED_MS,
        "color": "#d2b48c",
        "roughness": 0.75,
    },
    "Saturn": {
        "mass_kg": SATURN_MASS_KG,
        "radius_m": SATURN_RADIUS_M,
        "distance_m": SATURN_DISTANCE_FROM_SUN_M,
        "orbital_speed_ms": SATURN_ORBITAL_SPEED_MS,
        "color": "#e3c27d",
        "roughness": 0.7,
    },
    "Uranus": {
        "mass_kg": URANUS_MASS_KG,
        "radius_m": URANUS_RADIUS_M,
        "distance_m": URANUS_DISTANCE_FROM_SUN_M,
        "orbital_speed_ms": URANUS_ORBITAL_SPEED_MS,
        "color": "#9fd6d2",
        "roughness": 0.65,
    },
    "Neptune": {
        "mass_kg": NEPTUNE_MASS_KG,
        "radius_m": NEPTUNE_RADIUS_M,
        "distance_m": NEPTUNE_DISTANCE_FROM_SUN_M,
        "orbital_speed_ms": NEPTUNE_ORBITAL_SPEED_MS,
        "color": "#3d5aa9",
        "roughness": 0.7,
    },
}

PLANET_ORDER = (
    "Mercury",
    "Venus",
    "Earth",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
)

PLANET_INITIAL_PHASES_RAD = {
    "Mercury": np.deg2rad(20.0),
    "Venus": np.deg2rad(78.0),
    "Earth": np.deg2rad(142.0),
    "Mars": np.deg2rad(215.0),
    "Jupiter": np.deg2rad(305.0),
    "Saturn": np.deg2rad(35.0),
    "Uranus": np.deg2rad(168.0),
    "Neptune": np.deg2rad(260.0),
}

PLANET_NAMES_BY_ID = {
    body_id_from_name(name): name
    for name in PLANET_ORDER
}

SATURN_RINGS = (
    BodyRing(
        inner_radius_m=66_900_000.0,
        outer_radius_m=140_220_000.0,
        tilt_rad=float(np.deg2rad(26.73)),
        color="#d9c48a",
        opacity=0.5,
        radial_segments=256,
        animation_rate_rad_s=0.035,
        bands=(
            BodyRingBand(
                inner_radius_m=66_900_000.0,
                outer_radius_m=74_510_000.0,
                color="#927f5e",
                opacity=0.22,
            ),
            BodyRingBand(
                inner_radius_m=74_658_000.0,
                outer_radius_m=92_000_000.0,
                color="#b7a178",
                opacity=0.34,
            ),
            BodyRingBand(
                inner_radius_m=92_000_000.0,
                outer_radius_m=117_580_000.0,
                color="#e2d0a1",
                opacity=0.58,
            ),
            BodyRingBand(
                inner_radius_m=122_170_000.0,
                outer_radius_m=136_775_000.0,
                color="#c8b283",
                opacity=0.46,
            ),
            BodyRingBand(
                inner_radius_m=140_180_000.0,
                outer_radius_m=140_220_000.0,
                color="#f0dfb5",
                opacity=0.5,
            ),
        ),
    ),
)

BODY_RINGS = {
    "Saturn": SATURN_RINGS,
}


def create_sun_earth_system() -> list[SimBody]:
    sun_velocity_y = -(
        EARTH_MASS_KG * EARTH_ORBITAL_SPEED_MS
    ) / SUN_MASS_KG

    return [
        create_sun(np.array([0.0, sun_velocity_y, 0.0], dtype=np.float64)),
        create_planet("Earth"),
    ]


def create_solar_system() -> list[SimBody]:
    planets = [
        create_planet(name, PLANET_INITIAL_PHASES_RAD[name])
        for name in PLANET_ORDER
    ]
    sun_velocity = calculate_momentum_balancing_sun_velocity(planets)

    return [
        create_sun(sun_velocity),
        *planets,
    ]


def create_custom_solar_system(
    planet_names: tuple[str, ...],
    include_sun: bool = True,
) -> list[SimBody]:
    planets = create_planets_for_names(planet_names)

    if not include_sun:
        return create_sunless_planet_system(planets)

    sun_velocity = calculate_momentum_balancing_sun_velocity(planets)

    return [
        create_sun(sun_velocity),
        *planets,
    ]


def create_planets_for_names(planet_names: tuple[str, ...]) -> list[SimBody]:
    return [
        create_planet(name, PLANET_INITIAL_PHASES_RAD[name])
        for name in planet_names
    ]


def create_sunless_planet_system(planets: list[SimBody]) -> list[SimBody]:
    sunless_planets = [
        remove_solar_parent_metadata(planet)
        for planet in planets
    ]

    return recenter_system_to_barycentric_frame(sunless_planets)


def remove_solar_parent_metadata(body: SimBody) -> SimBody:
    return SimBody(
        definition=replace(
            body.definition,
            parent=None,
            orbit=None,
        ),
        state=BodyState(
            position_m=body.state.position_m.copy(),
            velocity_ms=body.state.velocity_ms.copy(),
        ),
    )


def recenter_system_to_barycentric_frame(bodies: list[SimBody]) -> list[SimBody]:
    total_mass_kg = sum(body.definition.mass_kg for body in bodies)

    if total_mass_kg <= 0.0:
        return bodies

    barycenter_m = sum(
        body.state.position_m * body.definition.mass_kg
        for body in bodies
    ) / total_mass_kg
    bulk_velocity_ms = sum(
        body.state.velocity_ms * body.definition.mass_kg
        for body in bodies
    ) / total_mass_kg

    for body in bodies:
        body.state.position_m = body.state.position_m - barycenter_m
        body.state.velocity_ms = body.state.velocity_ms - bulk_velocity_ms

    return bodies


def create_scenario_body_catalog() -> list[SimBody]:
    return [
        create_planet(name, PLANET_INITIAL_PHASES_RAD[name])
        for name in PLANET_ORDER
    ]


def get_planet_name_from_id(body_id: str) -> str | None:
    return PLANET_NAMES_BY_ID.get(body_id)


def create_sun(velocity_ms: np.ndarray) -> SimBody:
    return SimBody(
        definition=CelestialBody(
            name="Sun",
            mass_kg=SUN_MASS_KG,
            radius_m=SUN_RADIUS_M,
            color="#f4d27a",
            isfixed=False,
            visual=BodyVisual(
                kind="basic",
                emissive="#f4b84a",
                emissive_intensity=1.8,
                roughness=0.62,
                textures={
                    "map": BODY_TEXTURES["Sun"],
                },
            ),
            facts=BODY_FACTS["Sun"],
        ),
        state=BodyState(
            position_m=np.array([0.0, 0.0, 0.0], dtype=np.float64),
            velocity_ms=velocity_ms,
        ),
    )


def create_planet(name: str, phase_rad: float = 0.0) -> SimBody:
    spec = PLANET_SPECS[name]
    position_m = circular_orbit_position(spec["distance_m"], phase_rad)
    velocity_ms = circular_orbit_velocity(spec["orbital_speed_ms"], phase_rad)

    return SimBody(
        definition=CelestialBody(
            name=name,
            mass_kg=spec["mass_kg"],
            radius_m=spec["radius_m"],
            color=spec["color"],
            parent="Sun",
            isfixed=False,
            visual=create_planet_visual(name, spec["roughness"]),
            orbit=BodyOrbit(
                semi_major_axis_m=spec["distance_m"],
            ),
            facts=BODY_FACTS[name],
        ),
        state=BodyState(
            position_m=position_m,
            velocity_ms=velocity_ms,
        ),
    )


def create_planet_visual(name: str, roughness: float) -> BodyVisual:
    return BodyVisual(
        kind="standard",
        roughness=roughness,
        textures={
            "map": BODY_TEXTURES[name],
        },
        rings=BODY_RINGS.get(name, ()),
    )


def circular_orbit_position(distance_m: float, phase_rad: float) -> np.ndarray:
    return np.array([
        distance_m * np.cos(phase_rad),
        distance_m * np.sin(phase_rad),
        0.0,
    ], dtype=np.float64)


def circular_orbit_velocity(speed_ms: float, phase_rad: float) -> np.ndarray:
    return np.array([
        -speed_ms * np.sin(phase_rad),
        speed_ms * np.cos(phase_rad),
        0.0,
    ], dtype=np.float64)


def calculate_momentum_balancing_sun_velocity(planets: list[SimBody]) -> np.ndarray:
    planet_momentum = np.zeros(3, dtype=np.float64)

    for planet in planets:
        planet_momentum += planet.definition.mass_kg * planet.state.velocity_ms

    return -planet_momentum / SUN_MASS_KG
