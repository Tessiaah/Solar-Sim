const settingsStore = window.SolarSim.settings.createStore(window.SolarSim.settings.schema);

window.SolarSim.settings.store = settingsStore;

const router = window.SolarSim.ui.createScreenRouter({
    initialScreen: "welcome",
});

window.SolarSim.screens.initWelcomeScreen({
    root: document.querySelector('[data-screen="welcome"]'),
    router,
    store: settingsStore,
});

window.SolarSim.screens.initSettingsScreen({
    root: document.querySelector('[data-screen="settings"]'),
    router,
    schema: window.SolarSim.settings.schema,
    store: settingsStore,
});

window.SolarSim.settings.applyRuntimeEffects({
    schema: window.SolarSim.settings.schema,
    store: settingsStore,
});
