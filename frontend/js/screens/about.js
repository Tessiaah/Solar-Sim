window.SolarSim = window.SolarSim || {};
window.SolarSim.screens = window.SolarSim.screens || {};

window.SolarSim.screens.initAboutScreen = function initAboutScreen({ root, router, store }) {
    if (!root || !router) {
        return;
    }

    const cameraModeButtons = Array.from(root.querySelectorAll("[data-about-camera-mode]"));

    root.querySelectorAll("[data-route]").forEach((button) => {
        button.addEventListener("click", () => {
            router.goTo(button.dataset.route);
        });
    });

    cameraModeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const nextMode = normalizeCameraMode(button.dataset.aboutCameraMode);

            if (store?.getState?.()?.camera?.navigationMode === nextMode) {
                return;
            }

            store?.setValue?.("camera", "navigationMode", nextMode);
            syncCameraModeButtons(cameraModeButtons, nextMode);
        });
    });

    window.addEventListener("solar-sim:settings-changed", (event) => {
        if (event.detail?.categoryKey !== "camera" || event.detail?.settingKey !== "navigationMode") {
            return;
        }

        syncCameraModeButtons(cameraModeButtons, event.detail.value);
    });

    window.addEventListener("solar-sim:settings-reset", (event) => {
        if (event.detail?.categoryKey !== "camera") {
            return;
        }

        syncCameraModeButtons(cameraModeButtons, event.detail.state?.camera?.navigationMode);
    });

    syncCameraModeButtons(cameraModeButtons, store?.getState?.()?.camera?.navigationMode);
};

function syncCameraModeButtons(buttons, activeMode) {
    const safeMode = normalizeCameraMode(activeMode);

    buttons.forEach((button) => {
        const isActive = normalizeCameraMode(button.dataset.aboutCameraMode) === safeMode;

        button.classList.toggle("is-selected", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function normalizeCameraMode(mode) {
    return mode === "orbit" ? "orbit" : "fly";
}
