from src.app.bridge import HostWindowApi
from src.simulation.runtime import SimulationRuntime


class AppApi:
    def __init__(self) -> None:
        self.host = HostWindowApi()
        self.simulation = SimulationRuntime()

    def bind_window(self, window) -> None:
        self.host.bind_window(window)

    def apply_window_settings(self, settings: dict) -> dict:
        return self.host.apply_window_settings(settings)

    def quit_app(self) -> dict:
        return self.host.quit_app()

    def list_scenarios(self) -> dict:
        return self.simulation.list_scenarios()

    def list_scenario_bodies(self) -> dict:
        return self.simulation.list_scenario_bodies()

    def create_custom_scenario(self, config: dict | None = None) -> dict:
        return self.simulation.create_custom_scenario(config)

    def load_scenario(self, scenario_id: str = "sun-earth") -> dict:
        return self.simulation.load_scenario(scenario_id)

    def step_simulation(self, steps: int = 1) -> dict:
        return self.simulation.step(steps)

    def get_simulation_snapshot(self) -> dict:
        return self.simulation.get_snapshot()

    def get_scenario_metadata(self) -> dict:
        return self.simulation.get_scenario_metadata()
