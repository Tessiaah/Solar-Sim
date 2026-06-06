window.SolarSim = window.SolarSim || {};

window.SolarSim.backend = (function createBackendApi() {
    function getPyWebViewApi() {
        return window.pywebview?.api || null;
    }

    function call(methodName, ...args) {
        const api = getPyWebViewApi();
        const method = api?.[methodName];

        if (typeof method !== "function") {
            return Promise.resolve(null);
        }

        return Promise.resolve(method(...args));
    }

    return {
        isAvailable() {
            return Boolean(getPyWebViewApi());
        },
        host: {
            applyWindowSettings(settings) {
                return call("apply_window_settings", settings);
            },
            quit() {
                return call("quit_app");
            },
        },
        simulation: {
            listScenarios() {
                return call("list_scenarios");
            },
            listScenarioBodies() {
                return call("list_scenario_bodies");
            },
            createCustomScenario(config) {
                return call("create_custom_scenario", config);
            },
            loadScenario(scenarioId) {
                return call("load_scenario", scenarioId);
            },
            step(steps) {
                return call("step_simulation", steps);
            },
            getSnapshot() {
                return call("get_simulation_snapshot");
            },
            getScenarioMetadata() {
                return call("get_scenario_metadata");
            },
        },
    };
})();
