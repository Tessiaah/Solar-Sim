from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
from typing import Iterable

from src.simulation.ids import normalize_body_ids


STORAGE_VERSION = 1
APP_DATA_DIR_NAME = "Solar Sim"
CUSTOM_SCENARIOS_FILE_NAME = "custom_scenarios.json"


@dataclass(frozen=True)
class CustomScenarioRecipe:
    id: str
    name: str
    selected_body_ids: tuple[str, ...]
    include_sun: bool


class CustomScenarioStorage:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or get_custom_scenarios_path()

    def load(self) -> tuple[list[CustomScenarioRecipe], int]:
        if not self.path.exists():
            return [], 0

        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return [], 0

        if not isinstance(data, dict):
            return [], 0

        recipes = [
            recipe
            for recipe in (
                parse_custom_scenario_recipe(item)
                for item in data.get("scenarios", [])
            )
            if recipe is not None
        ]
        counters = [
            normalize_non_negative_int(data.get("lastCustomScenarioCounter")),
            *(get_custom_scenario_counter(recipe.id) for recipe in recipes),
        ]
        last_counter = max(counters, default=0)

        return recipes, last_counter

    def save(
        self,
        recipes: Iterable[CustomScenarioRecipe],
        last_custom_scenario_counter: int,
    ) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "version": STORAGE_VERSION,
            "lastCustomScenarioCounter": max(0, int(last_custom_scenario_counter)),
            "scenarios": [
                serialize_custom_scenario_recipe(recipe)
                for recipe in recipes
            ],
        }
        temp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")

        temp_path.write_text(
            json.dumps(data, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temp_path.replace(self.path)


def get_custom_scenarios_path() -> Path:
    app_data = os.environ.get("APPDATA")
    base_path = Path(app_data) if app_data else Path.home() / "AppData" / "Roaming"

    return base_path / APP_DATA_DIR_NAME / CUSTOM_SCENARIOS_FILE_NAME


def parse_custom_scenario_recipe(value) -> CustomScenarioRecipe | None:
    if not isinstance(value, dict):
        return None

    scenario_id = normalize_string(value.get("id"), 64).lower()
    name = normalize_string(value.get("name"), 80)
    selected_body_ids = tuple(normalize_body_ids(value.get("selectedBodyIds")))

    if not scenario_id or not name or not selected_body_ids:
        return None

    return CustomScenarioRecipe(
        id=scenario_id,
        name=name,
        selected_body_ids=selected_body_ids,
        include_sun=value.get("includeSun") is not False,
    )


def serialize_custom_scenario_recipe(recipe: CustomScenarioRecipe) -> dict:
    return {
        "id": recipe.id,
        "name": recipe.name,
        "selectedBodyIds": list(recipe.selected_body_ids),
        "includeSun": recipe.include_sun,
    }


def normalize_string(value, max_length: int) -> str:
    if not isinstance(value, str):
        return ""

    return " ".join(value.strip().split())[:max_length]


def normalize_non_negative_int(value) -> int:
    try:
        number_value = int(value)
    except (TypeError, ValueError):
        return 0

    return max(0, number_value)


def get_custom_scenario_counter(scenario_id: str) -> int:
    prefix = "custom-"

    if not scenario_id.startswith(prefix):
        return 0

    return normalize_non_negative_int(scenario_id[len(prefix):])
