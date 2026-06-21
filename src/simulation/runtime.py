from dataclasses import replace

import numpy as np

from src.data.constants import DAY_S
from src.simulation.physics import compute_system_diagnostics, velocity_verlet
from src.simulation.ids import body_id_from_name, normalize_body_ids
from src.simulation.scenario import (
    create_custom_solar_system,
    create_scenario_body_catalog,
    create_solar_system,
    create_sun_earth_system,
    get_planet_name_from_id,
)
from src.simulation.scenario_storage import (
    CustomScenarioRecipe,
    CustomScenarioStorage,
    get_custom_scenario_counter,
)


SCENARIOS = {
    "sun-earth": {
        "id": "sun-earth",
        "name": "Sun and Earth",
        "description": "A two-body Sun-Earth system with balanced initial momentum.",
        "factory": create_sun_earth_system,
    },
    "solar-system": {
        "id": "solar-system",
        "name": "Solar System",
        "description": "Full Solar System",
        "factory": create_solar_system,
    },
}

MAX_INTEGRATION_STEPS = 240
MAX_BODY_MASS_KG = 1.0e45
MAX_BODY_RADIUS_M = 1.0e11
MAX_BODY_DISTANCE_M = 1.0e14
MAX_BODY_SPEED_MS = 3.0e6


class SimulationRuntime:
    def __init__(self, scenario_storage: CustomScenarioStorage | None = None) -> None:
        self._bodies = []
        self._scenario_id = None
        self._custom_scenarios = {}
        self._custom_scenario_counter = 0
        self._scenario_storage = scenario_storage or CustomScenarioStorage()
        self._elapsed_s = 0.0
        self._dt_s = DAY_S / 24.0
        self._load_custom_scenarios()
        self.load_scenario("solar-system")

    def list_scenarios(self) -> dict:
        scenarios = [
            *SCENARIOS.values(),
            *self._custom_scenarios.values(),
        ]

        return {
            "ok": True,
            "scenarios": [
                {
                    "id": scenario["id"],
                    "name": scenario["name"],
                    "description": scenario["description"],
                    "custom": bool(scenario.get("custom", False)),
                    "includeSun": bool(scenario.get("includeSun", True)),
                    "selectedBodyIds": list(scenario.get("selectedBodyIds", [])),
                }
                for scenario in scenarios
            ],
        }

    def list_scenario_bodies(self) -> dict:
        return {
            "ok": True,
            "bodies": [
                serialize_body_metadata(body)
                for body in create_scenario_body_catalog()
            ],
        }

    def create_custom_scenario(self, config: dict | None = None) -> dict:
        safe_config = config if isinstance(config, dict) else {}
        selected_body_ids = normalize_body_ids(safe_config.get("bodyIds"))
        previous_counter = self._custom_scenario_counter
        scenario_id = self._next_custom_scenario_id()
        scenario_name = normalize_custom_scenario_name(
            safe_config.get("name"),
            self._custom_scenario_counter,
        )
        include_sun = normalize_include_sun(safe_config.get("includeSun"))
        scenario = create_custom_scenario_entry(
            scenario_id,
            scenario_name,
            selected_body_ids,
            include_sun,
        )

        if scenario is None:
            self._custom_scenario_counter = previous_counter
            return {
                "ok": False,
                "reason": "Select at least one supported planet.",
            }

        self._custom_scenarios[scenario_id] = scenario

        try:
            self._persist_custom_scenarios()
        except OSError:
            del self._custom_scenarios[scenario_id]
            self._custom_scenario_counter = previous_counter
            return {
                "ok": False,
                "reason": "Could not save custom scenario.",
            }

        return self.load_scenario(scenario_id)

    def delete_custom_scenario(self, scenario_id: str) -> dict:
        safe_scenario_id = normalize_custom_scenario_id(scenario_id)

        if not safe_scenario_id or safe_scenario_id not in self._custom_scenarios:
            return {"ok": False, "reason": f"Unknown custom scenario: {scenario_id}"}

        scenario = self._custom_scenarios.pop(safe_scenario_id)

        try:
            self._persist_custom_scenarios()
        except OSError:
            self._custom_scenarios[safe_scenario_id] = scenario
            return {
                "ok": False,
                "reason": "Could not delete custom scenario.",
            }

        if self._scenario_id == safe_scenario_id:
            self.load_scenario("solar-system")

        return self.list_scenarios()

    def update_body_parameters(self, body_id: str, updates: dict | None = None) -> dict:
        body = self._find_body(body_id)

        if body is None:
            return {"ok": False, "reason": f"Unknown body: {body_id}"}

        safe_updates = updates if isinstance(updates, dict) else {}
        next_definition = body.definition

        if "massKg" in safe_updates:
            next_definition = replace(
                next_definition,
                mass_kg=normalize_positive_float(
                    safe_updates["massKg"],
                    next_definition.mass_kg,
                    MAX_BODY_MASS_KG,
                ),
            )

        if "radiusM" in safe_updates:
            next_definition = replace(
                next_definition,
                radius_m=normalize_positive_float(
                    safe_updates["radiusM"],
                    next_definition.radius_m,
                    MAX_BODY_RADIUS_M,
                ),
            )

        body.definition = next_definition

        if "distanceM" in safe_updates:
            body.state.position_m = scale_vector_magnitude(
                body.state.position_m,
                normalize_non_negative_float(
                    safe_updates["distanceM"],
                    float(np.linalg.norm(body.state.position_m)),
                    MAX_BODY_DISTANCE_M,
                ),
                fallback_direction=np.array([1.0, 0.0, 0.0], dtype=np.float64),
            )

        if "positionM" in safe_updates:
            body.state.position_m = normalize_vector3_float(
                safe_updates["positionM"],
                body.state.position_m,
                MAX_BODY_DISTANCE_M,
            )

        if "speedMS" in safe_updates:
            body.state.velocity_ms = scale_vector_magnitude(
                body.state.velocity_ms,
                normalize_non_negative_float(
                    safe_updates["speedMS"],
                    float(np.linalg.norm(body.state.velocity_ms)),
                    MAX_BODY_SPEED_MS,
                ),
                fallback_direction=get_tangent_direction(body.state.position_m),
            )

        return {
            "ok": True,
            "scenario": self.get_scenario_metadata(),
            "snapshot": self.get_snapshot(),
        }

    def reset_body(self, body_id: str) -> dict:
        body = self._find_body(body_id)
        initial_body = self._find_body_in(self._create_scenario_bodies(), body_id)

        if body is None or initial_body is None:
            return {"ok": False, "reason": f"Unknown body: {body_id}"}

        restore_body_from_initial_state(body, initial_body)

        return {
            "ok": True,
            "scenario": self.get_scenario_metadata(),
            "snapshot": self.get_snapshot(),
        }

    def load_scenario(self, scenario_id: str = "sun-earth") -> dict:
        scenario = self._get_scenario(scenario_id)

        if scenario is None:
            return {"ok": False, "reason": f"Unknown scenario: {scenario_id}"}

        self._scenario_id = scenario_id
        self._bodies = self._create_scenario_bodies()
        self._elapsed_s = 0.0

        return {
            "ok": True,
            "scenarioId": self._scenario_id,
            "scenario": self.get_scenario_metadata(),
            "snapshot": self.get_snapshot(),
        }

    def step(self, steps: int = 1) -> dict:
        safe_steps = normalize_step_count(steps)

        for _ in range(safe_steps):
            velocity_verlet(self._bodies, self._dt_s)
            self._elapsed_s += self._dt_s

        return {
            "ok": True,
            "snapshot": self.get_snapshot(),
        }

    def get_snapshot(self) -> dict:
        diagnostics = compute_system_diagnostics(self._bodies)

        return {
            "scenarioId": self._scenario_id,
            "elapsedS": self._elapsed_s,
            "dtS": self._dt_s,
            "bodies": [
                serialize_body_state(body, diagnostics["accelerations"][index])
                for index, body in enumerate(self._bodies)
            ],
            "diagnostics": serialize_diagnostics(diagnostics),
        }

    def get_scenario_metadata(self) -> dict:
        scenario = self._get_scenario(self._scenario_id)

        return {
            "id": scenario["id"],
            "name": scenario["name"],
            "description": scenario["description"],
            "custom": bool(scenario.get("custom", False)),
            "includeSun": bool(scenario.get("includeSun", True)),
            "selectedBodyIds": list(scenario.get("selectedBodyIds", [])),
            "bodies": [serialize_body_metadata(body) for body in self._bodies],
        }

    def _get_scenario(self, scenario_id: str) -> dict | None:
        return SCENARIOS.get(scenario_id) or self._custom_scenarios.get(scenario_id)

    def _find_body(self, body_id: str):
        return self._find_body_in(self._bodies, body_id)

    def _find_body_in(self, bodies, body_id: str):
        safe_body_id = str(body_id or "").strip().lower()

        for body in bodies:
            if body_id_from_name(body.definition.name) == safe_body_id:
                return body

        return None

    def _create_scenario_bodies(self):
        scenario = self._get_scenario(self._scenario_id)

        if scenario is None:
            return []

        return scenario["factory"]()

    def _load_custom_scenarios(self) -> None:
        recipes, last_counter = self._scenario_storage.load()

        self._custom_scenario_counter = max(self._custom_scenario_counter, last_counter)

        for recipe in recipes:
            scenario_id = normalize_custom_scenario_id(recipe.id)

            if not scenario_id or scenario_id in SCENARIOS or scenario_id in self._custom_scenarios:
                continue

            scenario = create_custom_scenario_entry(
                scenario_id,
                recipe.name,
                list(recipe.selected_body_ids),
                recipe.include_sun,
            )

            if scenario is None:
                continue

            self._custom_scenarios[scenario_id] = scenario
            self._custom_scenario_counter = max(
                self._custom_scenario_counter,
                get_custom_scenario_counter(scenario_id),
            )

    def _persist_custom_scenarios(self) -> None:
        self._scenario_storage.save(
            (
                CustomScenarioRecipe(
                    id=scenario["id"],
                    name=scenario["name"],
                    selected_body_ids=tuple(scenario.get("selectedBodyIds", [])),
                    include_sun=bool(scenario.get("includeSun", True)),
                )
                for scenario in self._custom_scenarios.values()
            ),
            self._custom_scenario_counter,
        )

    def _next_custom_scenario_id(self) -> str:
        while True:
            self._custom_scenario_counter += 1
            scenario_id = f"custom-{self._custom_scenario_counter}"

            if scenario_id not in SCENARIOS and scenario_id not in self._custom_scenarios:
                return scenario_id


def serialize_body_metadata(body) -> dict:
    definition = body.definition
    body_id = body_id_from_name(definition.name)
    metadata = {
        "id": body_id,
        "name": definition.name,
        "massKg": definition.mass_kg,
        "radiusM": definition.radius_m,
        "color": definition.color,
        "isFixed": bool(definition.isfixed),
        "parent": definition.parent,
        "parentId": body_id_from_name(definition.parent) if definition.parent else None,
        "facts": list(definition.facts),
        "visual": serialize_body_visual(definition),
    }
    orbit = serialize_body_orbit(definition)

    if orbit is not None:
        metadata["orbit"] = orbit

    return metadata


def serialize_body_state(body, acceleration_ms2) -> dict:
    definition = body.definition
    body_id = body_id_from_name(definition.name)

    return {
        "id": body_id,
        "positionM": body.state.position_m.tolist(),
        "velocityMS": body.state.velocity_ms.tolist(),
        "accelerationMS2": acceleration_ms2.tolist(),
    }


def serialize_diagnostics(diagnostics: dict) -> dict:
    return {
        "kineticEnergyJ": diagnostics["kineticEnergyJ"],
        "potentialEnergyJ": diagnostics["potentialEnergyJ"],
        "totalEnergyJ": diagnostics["totalEnergyJ"],
        "momentumKgMS": diagnostics["momentumKgMS"].tolist(),
        "momentumMagnitudeKgMS": diagnostics["momentumMagnitudeKgMS"],
        "barycenterM": diagnostics["barycenterM"].tolist(),
    }


def serialize_body_visual(definition) -> dict:
    visual = definition.visual

    if visual is None:
        return {
            "kind": "standard",
            "baseColor": definition.color,
            "textures": {},
        }

    return remove_none_values({
        "kind": visual.kind,
        "baseColor": visual.base_color or definition.color,
        "emissive": visual.emissive,
        "emissiveIntensity": visual.emissive_intensity,
        "roughness": visual.roughness,
        "metalness": visual.metalness,
        "clearcoat": visual.clearcoat,
        "textures": remove_none_values(visual.textures or {}),
        "rings": [serialize_body_ring(ring) for ring in visual.rings],
    })


def serialize_body_ring(ring) -> dict:
    return remove_none_values({
        "innerRadiusM": ring.inner_radius_m,
        "outerRadiusM": ring.outer_radius_m,
        "tiltRad": ring.tilt_rad,
        "color": ring.color,
        "opacity": ring.opacity,
        "radialSegments": ring.radial_segments,
        "animationRateRadS": ring.animation_rate_rad_s,
        "bands": [serialize_body_ring_band(band) for band in ring.bands],
    })


def serialize_body_ring_band(band) -> dict:
    return remove_none_values({
        "innerRadiusM": band.inner_radius_m,
        "outerRadiusM": band.outer_radius_m,
        "color": band.color,
        "opacity": band.opacity,
    })


def serialize_body_orbit(definition) -> dict | None:
    orbit = definition.orbit

    if orbit is None:
        return None

    return remove_none_values({
        "semiMajorAxisM": orbit.semi_major_axis_m,
        "eccentricity": orbit.eccentricity,
        "inclinationRad": orbit.inclination_rad,
        "longitudeOfAscendingNodeRad": orbit.longitude_of_ascending_node_rad,
        "argumentOfPeriapsisRad": orbit.argument_of_periapsis_rad,
        "centerM": list(orbit.center_m),
    })


def remove_none_values(values: dict) -> dict:
    return {
        key: value
        for key, value in values.items()
        if value is not None
    }


def normalize_custom_scenario_name(value, counter: int) -> str:
    if isinstance(value, str):
        normalized = " ".join(value.strip().split())

        if normalized:
            return normalized[:80]

    return f"Custom System {counter}"


def normalize_custom_scenario_id(value) -> str:
    scenario_id = str(value or "").strip().lower()

    if get_custom_scenario_counter(scenario_id) <= 0:
        return ""

    return scenario_id


def normalize_include_sun(value) -> bool:
    return value is not False


def normalize_step_count(value) -> int:
    try:
        number_value = float(value)
    except (TypeError, ValueError, OverflowError):
        return 1

    if not np.isfinite(number_value):
        return 1

    return max(1, min(int(number_value), MAX_INTEGRATION_STEPS))


def normalize_positive_float(value, fallback: float, maximum: float | None = None) -> float:
    try:
        number_value = float(value)
    except (TypeError, ValueError, OverflowError):
        return fallback

    if np.isposinf(number_value) and maximum is not None:
        return maximum

    if not np.isfinite(number_value) or number_value <= 0.0:
        return fallback

    if maximum is not None:
        return min(number_value, maximum)

    return number_value


def normalize_non_negative_float(value, fallback: float, maximum: float | None = None) -> float:
    try:
        number_value = float(value)
    except (TypeError, ValueError, OverflowError):
        return fallback

    if np.isposinf(number_value) and maximum is not None:
        return maximum

    if not np.isfinite(number_value) or number_value < 0.0:
        return fallback

    if maximum is not None:
        return min(number_value, maximum)

    return number_value


def normalize_vector3_float(
    value,
    fallback: np.ndarray,
    max_magnitude: float | None = None,
) -> np.ndarray:
    if not isinstance(value, (list, tuple)) or len(value) < 3:
        return np.array(fallback, dtype=np.float64, copy=True)

    try:
        vector = np.array(value[:3], dtype=np.float64)
    except (TypeError, ValueError):
        return np.array(fallback, dtype=np.float64, copy=True)

    if not np.all(np.isfinite(vector)):
        return np.array(fallback, dtype=np.float64, copy=True)

    if max_magnitude is not None:
        magnitude = float(np.linalg.norm(vector))

        if magnitude > max_magnitude and magnitude > 0.0:
            return vector / magnitude * max_magnitude

    return vector


def scale_vector_magnitude(
    vector: np.ndarray,
    magnitude: float,
    fallback_direction: np.ndarray,
) -> np.ndarray:
    current_magnitude = float(np.linalg.norm(vector))

    if current_magnitude > 0.0:
        return vector / current_magnitude * magnitude

    fallback_magnitude = float(np.linalg.norm(fallback_direction))

    if fallback_magnitude == 0.0:
        return np.zeros(3, dtype=np.float64)

    return fallback_direction / fallback_magnitude * magnitude


def get_tangent_direction(position_m: np.ndarray) -> np.ndarray:
    if float(np.linalg.norm(position_m)) == 0.0:
        return np.array([0.0, 1.0, 0.0], dtype=np.float64)

    tangent = np.array([
        -position_m[1],
        position_m[0],
        0.0,
    ], dtype=np.float64)

    if float(np.linalg.norm(tangent)) == 0.0:
        return np.array([0.0, 1.0, 0.0], dtype=np.float64)

    return tangent


def restore_body_from_initial_state(body, initial_body) -> None:
    body.definition = initial_body.definition
    body.state.position_m = np.array(initial_body.state.position_m, dtype=np.float64, copy=True)
    body.state.velocity_ms = np.array(initial_body.state.velocity_ms, dtype=np.float64, copy=True)


def build_custom_scenario_description(
    planet_names: tuple[str, ...],
    include_sun: bool,
) -> str:
    prefix = "Custom system with Sun, " if include_sun else "Sunless custom system with "

    return prefix + ", ".join(planet_names) + "."


def create_custom_scenario_entry(
    scenario_id: str,
    scenario_name: str,
    selected_body_ids: list[str],
    include_sun: bool,
) -> dict | None:
    selected_planet_names = tuple(
        get_planet_name_from_id(body_id)
        for body_id in normalize_body_ids(selected_body_ids)
    )

    if not selected_planet_names or any(name is None for name in selected_planet_names):
        return None

    selected_names = tuple(name for name in selected_planet_names if name is not None)
    selected_ids = [body_id_from_name(name) for name in selected_names]

    return {
        "id": scenario_id,
        "name": scenario_name,
        "description": build_custom_scenario_description(selected_names, include_sun),
        "factory": (
            lambda selected_names=selected_names, include_sun=include_sun:
                create_custom_solar_system(selected_names, include_sun)
        ),
        "custom": True,
        "includeSun": include_sun,
        "selectedBodyIds": selected_ids,
    }
