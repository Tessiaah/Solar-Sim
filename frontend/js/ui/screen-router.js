window.SolarSim = window.SolarSim || {};
window.SolarSim.ui = window.SolarSim.ui || {};

window.SolarSim.ui.createScreenRouter = function createScreenRouter({ initialScreen }) {
    let currentScreen = initialScreen;

    function goTo(screenName) {
        const previousScreen = currentScreen;

        currentScreen = screenName;
        document.querySelectorAll("[data-screen]").forEach((screen) => {
            screen.classList.toggle("screen-active", screen.dataset.screen === screenName);
        });

        window.dispatchEvent(
            new CustomEvent("solar-sim:navigate", {
                detail: { screenName, previousScreen },
            }),
        );
    }

    function getCurrentScreen() {
        return currentScreen;
    }

    return {
        getCurrentScreen,
        goTo,
    };
};
