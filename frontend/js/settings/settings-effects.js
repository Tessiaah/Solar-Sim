

window.SolarSim = window.SolarSim || {};
window.SolarSim.settings = window.SolarSim.settings || {};

window.SolarSim.settings.applyRuntimeEffects = function applyRuntimeEffects({ schema, store }) {
    const runtime = createRuntimeSettingsController({ schema, store });

    window.SolarSim.settings.runtime = runtime;
    runtime.applyAll(store.getState());

    window.addEventListener("solar-sim:settings-changed", (event) => {
        runtime.applyChange(event.detail);
    });

    window.addEventListener("solar-sim:settings-reset", (event) => {
        runtime.applyAll(event.detail.state);
    });
};

function createRuntimeSettingsController({ schema, store }) {
    const adapters = {
        graphics: createGraphicsAdapter(schema),
        simulation: createSimulationDisplayAdapter(schema),
        camera: createCameraAdapter(),
        debug: createDebugAdapter(),
    };

    function applyAll(state) {
        adapters.graphics.apply(state.graphics);
        adapters.simulation.apply(state.simulation);
        adapters.camera.apply(state.camera);
        adapters.debug.apply(state.debug);
    }

    function applyChange({ categoryKey, settingKey, state }) {
        if (!adapters[categoryKey]) {
            return;
        }

        adapters[categoryKey].apply(state[categoryKey], settingKey);
    }

    function getState() {
        return store.getState();
    }

    function getRenderQualityProfile() {
        const state = store.getState();
        const control = schema.graphics.controls.find((item) => item.key === "renderQuality");
        return control.mapsTo[state.graphics.renderQuality];
    }

    return {
        applyAll,
        applyChange,
        getRenderQualityProfile,
        getState,
    };
}

function createGraphicsAdapter(schema) {
    const hostWindow = createHostWindowAdapter();

    return {
        apply(graphics, changedSetting) {
            const renderQualityProfile = getRenderQualityProfile(schema, graphics.renderQuality);

            document.documentElement.dataset.resolution = graphics.resolution;
            document.documentElement.dataset.displayMode = graphics.displayMode;
            document.documentElement.dataset.renderQuality = graphics.renderQuality;
            document.documentElement.dataset.antiAliasing = String(graphics.antiAliasing);
            document.documentElement.dataset.bloom = String(graphics.postProcessing.bloom);
            document.documentElement.dataset.motionBlur = String(graphics.postProcessing.motionBlur);
            document.documentElement.dataset.depthOfField = String(graphics.postProcessing.depthOfField);

            window.dispatchEvent(
                new CustomEvent("solar-sim:graphics-settings-applied", {
                    detail: {
                        graphics,
                        renderQualityProfile,
                    },
                }),
            );

            const handledByHost = changedSetting === "resolution" || changedSetting === "displayMode"
                ? hostWindow.apply(graphics)
                : false;

            if (handledByHost) {
                return;
            }

            if (changedSetting === "resolution") {
                applyResolution(graphics.resolution, graphics.displayMode);
            }

            if (changedSetting === "displayMode") {
                applyDisplayMode(graphics.displayMode);
            }
        },
    };
}

function createSimulationDisplayAdapter(schema) {
    const integratorStatus = document.querySelector('[data-status="integrator"]');

    return {
        apply(simulation) {
            document.documentElement.dataset.trailSystem = simulation.trailSystem;
            updateIntegratorStatus(integratorStatus, schema, simulation.physicsIntegrator);

            window.dispatchEvent(
                new CustomEvent("solar-sim:simulation-display-settings-applied", {
                    detail: {
                        integrator: simulation.physicsIntegrator,
                        trailSystem: simulation.trailSystem,
                    },
                }),
            );
        },
    };
}

function createCameraAdapter() {
    return {
        apply(camera) {
            document.documentElement.style.setProperty("--mouse-sensitivity", camera.mouseSensitivity);
            document.documentElement.style.setProperty("--min-zoom-distance", camera.minZoomDistance);
            document.documentElement.style.setProperty("--max-zoom-distance", camera.maxZoomDistance);

            window.dispatchEvent(
                new CustomEvent("solar-sim:camera-settings-applied", {
                    detail: { camera },
                }),
            );
        },
    };
}

function createDebugAdapter() {
    const performanceOverlay = createPerformanceOverlayController();

    return {
        apply(debug) {
            document.documentElement.dataset.showLabels = String(debug.uiToggles.showLabels);
            document.documentElement.dataset.showVelocityVectors = String(debug.uiToggles.showVelocityVectors);
            document.documentElement.dataset.showAccelerationVectors = String(debug.uiToggles.showAccelerationVectors);
            document.documentElement.dataset.showBarycenterMarker = String(debug.uiToggles.showBarycenterMarker);
            document.documentElement.dataset.fpsCounter = String(debug.performanceOverlay.fpsCounter);
            document.documentElement.dataset.frameTimeGraph = String(debug.performanceOverlay.frameTimeGraph);
            document.documentElement.dataset.simulationStepTime = String(debug.performanceOverlay.simulationStepTime);

            performanceOverlay.apply(debug.performanceOverlay);

            window.dispatchEvent(
                new CustomEvent("solar-sim:debug-settings-applied", {
                    detail: { debug },
                }),
            );
        },
    };
}

function applyResolution(resolution, displayMode) {
    const [width, height] = resolution.split("x").map(Number);

    document.documentElement.style.setProperty("--app-resolution-width", `${width}px`);
    document.documentElement.style.setProperty("--app-resolution-height", `${height}px`);

    if (displayMode !== "windowed" || typeof window.resizeTo !== "function") {
        return;
    }

    try {
        window.resizeTo(width, height);
    } catch (error) {
        console.info("Window resizing is not available in this host.", error);
    }
}

function applyDisplayMode(displayMode) {
    if (displayMode === "windowed") {
        exitFullscreen();
        return;
    }

    enterFullscreen(displayMode);
}

function createHostWindowAdapter() {
    let pendingGraphics = null;
    let isPyWebViewReady = Boolean(window.pywebview?.api);

    window.addEventListener("pywebviewready", () => {
        isPyWebViewReady = true;

        if (pendingGraphics) {
            apply(pendingGraphics);
            pendingGraphics = null;
        }
    });

    function apply(graphics) {
        const [width, height] = graphics.resolution.split("x").map(Number);

        if (!isPyWebViewReady || !window.SolarSim?.backend?.isAvailable()) {
            if (window.pywebview) {
                pendingGraphics = graphics;
                return true;
            }

            return false;
        }

        const request = window.SolarSim.backend.host.applyWindowSettings({
            displayMode: graphics.displayMode,
            width,
            height,
        });

        if (request && typeof request.catch === "function") {
            request.catch((error) => {
                console.info("Host window settings were rejected.", error);
            });
        }

        return true;
    }

    return { apply };
}

function enterFullscreen(displayMode) {
    if (!document.fullscreenEnabled || document.fullscreenElement) {
        return;
    }

    const navigationUI = displayMode === "fullscreen" ? "hide" : "auto";
    let request;

    try {
        request = document.documentElement.requestFullscreen({ navigationUI });
    } catch (error) {
        console.info("Fullscreen request is not available in this host.", error);
        return;
    }

    if (request && typeof request.catch === "function") {
        request.catch((error) => {
            console.info("Fullscreen request was rejected by the host.", error);
        });
    }
}

function exitFullscreen() {
    if (!document.fullscreenElement || typeof document.exitFullscreen !== "function") {
        return;
    }

    const request = document.exitFullscreen();

    if (request && typeof request.catch === "function") {
        request.catch((error) => {
            console.info("Fullscreen exit was rejected by the host.", error);
        });
    }
}

function createPerformanceOverlayController() {
    const overlay = document.querySelector("#performance-overlay");
    const rows = {
        fpsCounter: overlay?.querySelector('[data-overlay-row="fps"]'),
        frameTimeGraph: overlay?.querySelector('[data-overlay-row="frameTime"]'),
        simulationStepTime: overlay?.querySelector('[data-overlay-row="simulationStep"]'),
    };
    const values = {
        fps: overlay?.querySelector('[data-overlay-value="fps"]'),
        frameTime: overlay?.querySelector('[data-overlay-value="frameTime"]'),
    };
    let enabled = false;
    let lastTime = performance.now();
    let frames = 0;
    let accumulator = 0;

    function apply(performanceOverlay) {
        if (!overlay) {
            return;
        }

        enabled = Object.values(performanceOverlay).some(Boolean);
        overlay.classList.toggle("is-visible", enabled);
        rows.fpsCounter?.classList.toggle("is-visible", performanceOverlay.fpsCounter);
        rows.frameTimeGraph?.classList.toggle("is-visible", performanceOverlay.frameTimeGraph);
        rows.simulationStepTime?.classList.toggle("is-visible", performanceOverlay.simulationStepTime);
    }

    function tick(time) {
        const frameTime = time - lastTime;
        lastTime = time;

        if (enabled) {
            frames += 1;
            accumulator += frameTime;

            if (values.frameTime) {
                values.frameTime.textContent = `${frameTime.toFixed(1)} ms`;
            }

            if (accumulator >= 500 && values.fps) {
                values.fps.textContent = Math.round((frames * 1000) / accumulator);
                frames = 0;
                accumulator = 0;
            }
        }

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

    return { apply };
}

function updateIntegratorStatus(integratorStatus, schema, integratorValue) {
    if (!integratorStatus) {
        return;
    }

    const control = schema.simulation.controls.find((item) => item.key === "physicsIntegrator");
    const option = control.options.find((item) => item.value === integratorValue);
    integratorStatus.textContent = option ? option.label : integratorValue;
}

function getRenderQualityProfile(schema, renderQuality) {
    const control = schema.graphics.controls.find((item) => item.key === "renderQuality");
    return control.mapsTo[renderQuality];
}
