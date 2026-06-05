const settingsStore = window.SolarSim.settings.createStore(window.SolarSim.settings.schema);

window.SolarSim.settings.store = settingsStore;

const i18n = window.SolarSim.i18n.createI18n({
    defaultLanguage: settingsStore.getState().interface.language,
    translations: window.SolarSim.i18n.translations,
});

window.SolarSim.i18n.instance = i18n;
i18n.applyDocument();

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

window.SolarSim.screens.initSimulationScreen({
    root: document.querySelector('[data-screen="simulation"]'),
    router,
    store: settingsStore,
});

window.SolarSim.settings.applyRuntimeEffects({
    schema: window.SolarSim.settings.schema,
    store: settingsStore,
});
