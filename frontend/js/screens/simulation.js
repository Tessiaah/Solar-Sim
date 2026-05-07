window.SolarSim = window.SolarSim || {};
window.SolarSim.screens = window.SolarSim.screens || {};

window.SolarSim.screens.initSimulationScreen = function initSimulationScreen({ root, router, store }) {
    if (!root) {
        return;
    }

    const viewport = root.querySelector("#simulation-viewport");
    const timeReadout = root.querySelector("[data-simulation-time]");
    const routeButtons = root.querySelectorAll("[data-route]");

    routeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            router.goTo(button.dataset.route);
        });
    });

    if (!viewport || typeof THREE === "undefined") {
        root.dataset.rendererState = "unavailable";
        return;
    }

    const renderer = window.SolarSim.rendering.createSimulationRenderer({
        container: viewport,
        timeReadout,
        store,
    });

    window.addEventListener("solar-sim:navigate", (event) => {
        if (event.detail.screenName === "simulation") {
            renderer.start();
            return;
        }

        renderer.stop();
    });
};
