from simulation.scenario import create_solar_system
from src.data.constants import DAY_S
from src.simulation.physics import velocity_verlet
from src.simulation.scenario import create_sun_earth_system


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
        return {
            "scenarioId": self._scenario_id,
            "elapsedS": self._elapsed_s,
            "dtS": self._dt_s,
            "bodies": [serialize_body_state(body) for body in self._bodies],
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
    body_id = definition.name.lower().replace(" ", "-")

    return {
        "id": body_id,
        "name": definition.name,
        "massKg": definition.mass_kg,
        "radiusM": definition.radius_m,
        "color": definition.color,
        "isFixed": bool(definition.isfixed),
        "parent": definition.parent,
        "visual": serialize_body_visual(definition),
    }


def serialize_body_state(body) -> dict:
    definition = body.definition
    body_id = definition.name.lower().replace(" ", "-")

    return {
        "id": body_id,
        "positionM": body.state.position_m.tolist(),
        "velocityMS": body.state.velocity_ms.tolist(),
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
    })


def remove_none_values(values: dict) -> dict:
    return {
        key: value
        for key, value in values.items()
        if value is not None
    }
