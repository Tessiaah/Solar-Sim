from src.data.constants import DAY_S
from src.simulation.physics import compute_system_diagnostics, velocity_verlet
from src.simulation.scenario import create_solar_system, create_sun_earth_system


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


class SimulationRuntime:
    def __init__(self) -> None:
        self._bodies = []
        self._scenario_id = None
        self._elapsed_s = 0.0
        self._dt_s = DAY_S / 24.0
        self.load_scenario("solar-system")

    def list_scenarios(self) -> dict:
        return {
            "ok": True,
            "scenarios": [
                {
                    "id": scenario["id"],
                    "name": scenario["name"],
                    "description": scenario["description"],
                }
                for scenario in SCENARIOS.values()
            ],
        }

    def load_scenario(self, scenario_id: str = "sun-earth") -> dict:
        scenario = SCENARIOS.get(scenario_id)

        if scenario is None:
            return {"ok": False, "reason": f"Unknown scenario: {scenario_id}"}

        self._scenario_id = scenario_id
        self._bodies = scenario["factory"]()
        self._elapsed_s = 0.0

        return {
            "ok": True,
            "scenarioId": self._scenario_id,
            "scenario": self.get_scenario_metadata(),
            "snapshot": self.get_snapshot(),
        }

    def step(self, steps: int = 1) -> dict:
        safe_steps = max(1, min(int(steps), 240))

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
        scenario = SCENARIOS[self._scenario_id]

        return {
            "id": scenario["id"],
            "name": scenario["name"],
            "description": scenario["description"],
            "bodies": [serialize_body_metadata(body) for body in self._bodies],
        }


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


def body_id_from_name(name: str) -> str:
    return name.lower().replace(" ", "-")
