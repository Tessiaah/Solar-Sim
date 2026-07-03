window.SolarSim = window.SolarSim || {};
window.SolarSim.screens = window.SolarSim.screens || {};

window.SolarSim.screens.initAboutScreen = function initAboutScreen({ root, router }) {
    if (!root || !router) {
        return;
    }

    root.querySelectorAll("[data-route]").forEach((button) => {
        button.addEventListener("click", () => {
            router.goTo(button.dataset.route);
        });
    });
};
