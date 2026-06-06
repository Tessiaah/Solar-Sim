

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
    const metricsDrawer = createSettingsMetricsDrawerController({ schema, store });
    const adapters = {
        interface: createInterfaceAdapter(),
        graphics: createGraphicsAdapter(schema),
        simulation: createSimulationDisplayAdapter(schema),
        camera: createCameraAdapter(),
        debug: createDebugAdapter(),
    };

    function applyAll(state) {
        adapters.interface.apply(state.interface);
        adapters.graphics.apply(state.graphics);
        adapters.simulation.apply(state.simulation);
        adapters.camera.apply(state.camera);
        adapters.debug.apply(state.debug);
        metricsDrawer.apply(state);
    }

    function applyChange({ categoryKey, settingKey, state }) {
        if (!adapters[categoryKey]) {
            return;
        }

        adapters[categoryKey].apply(state[categoryKey], settingKey);
        metricsDrawer.apply(state);

        if (categoryKey === "interface") {
            adapters.simulation.apply(state.simulation);
        }
    }

    function getState() {
        return store.getState();
    }

    function getSphereQualityProfile() {
        const state = store.getState();
        return getControlProfile("graphics", "sphereQuality", state.graphics.sphereQuality);
    }

    function getSkyboxQualityProfile() {
        const state = store.getState();
        return getControlProfile("graphics", "skyboxQuality", state.graphics.skyboxQuality);
    }

    function getLightingQualityProfile() {
        const state = store.getState();
        return getControlProfile("graphics", "lightingQuality", state.graphics.lightingQuality);
    }

    return {
        applyAll,
        applyChange,
        getLightingQualityProfile,
        getRenderQualityProfile: getSphereQualityProfile,
        getSkyboxQualityProfile,
        getSphereQualityProfile,
        getState,
    };
}

function createInterfaceAdapter() {
    return {
        apply(interfaceSettings) {
            window.SolarSim.i18n?.instance?.setLanguage(interfaceSettings.language);
        },
    };
}

function createGraphicsAdapter(schema) {
    const hostWindow = createHostWindowAdapter();

    return {
        apply(graphics, changedSetting) {
            const skyboxQualityProfile = getControlProfile("graphics", "skyboxQuality", graphics.skyboxQuality);
            const sphereQualityProfile = getControlProfile("graphics", "sphereQuality", graphics.sphereQuality);
            const lightingQualityProfile = getControlProfile("graphics", "lightingQuality", graphics.lightingQuality);

            document.documentElement.dataset.resolution = graphics.resolution;
            document.documentElement.dataset.displayMode = graphics.displayMode;
            document.documentElement.dataset.skyboxQuality = graphics.skyboxQuality;
            document.documentElement.dataset.sphereQuality = graphics.sphereQuality;
            document.documentElement.dataset.lightingQuality = graphics.lightingQuality;

            window.dispatchEvent(
                new CustomEvent("solar-sim:graphics-settings-applied", {
                    detail: {
                        changedSetting,
                        graphics,
                        lightingQualityProfile,
                        renderQualityProfile: sphereQualityProfile,
                        skyboxQualityProfile,
                        sphereQualityProfile,
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
            document.documentElement.style.setProperty("--camera-move-speed", camera.moveSpeed);
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
    return {
        apply(debug) {
            document.documentElement.dataset.showLabels = String(debug.uiToggles.showLabels);
            document.documentElement.dataset.showOrbitLines = String(debug.uiToggles.showOrbitLines);
            document.documentElement.dataset.showTrails = String(debug.uiToggles.showTrails);
            document.documentElement.dataset.showVelocityVectors = String(debug.uiToggles.showVelocityVectors);
            document.documentElement.dataset.showAccelerationVectors = String(debug.uiToggles.showAccelerationVectors);
            document.documentElement.dataset.showBarycenterMarker = String(debug.uiToggles.showBarycenterMarker);
            document.documentElement.dataset.fpsCounter = String(debug.performanceOverlay.fpsCounter);
            document.documentElement.dataset.frameTimeGraph = String(debug.performanceOverlay.frameTimeGraph);
            document.documentElement.dataset.simulationStepTime = String(debug.performanceOverlay.simulationStepTime);

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

function createSettingsMetricsDrawerController({ schema, store }) {
    const overlay = document.querySelector("#performance-overlay");
    const debugOverlay = document.querySelector("#debug-overlay");
    const toggle = overlay?.querySelector("[data-metrics-toggle]");
    const rows = metricsCollectElements(overlay, "[data-overlay-row]", "overlayRow");
    const values = metricsCollectElements(overlay, "[data-overlay-value]", "overlayValue");
    const graphs = metricsCollectElements(overlay, "[data-metrics-graph]", "metricsGraph");
    const debugRows = metricsCollectElements(debugOverlay, "[data-debug-row]", "debugRow");
    const debugValues = metricsCollectElements(debugOverlay, "[data-debug-value]", "debugValue");
    const debugGraphs = metricsCollectElements(debugOverlay, "[data-debug-graph]", "debugGraph");
    const debugDragHandle = debugOverlay?.querySelector("[data-debug-drag-handle]");
    const debugLockButton = debugOverlay?.querySelector("[data-debug-overlay-lock]");
    const frameTimes = [];
    const energyErrorValues = [];

    let drawerEnabled = false;
    let debugOverlayEnabled = false;
    let debugOverlayLocked = true;
    let debugOverlayDragging = false;
    let debugOverlayDragOffsetX = 0;
    let debugOverlayDragOffsetY = 0;
    let lastTime = performance.now();
    let frames = 0;
    let accumulator = 0;
    let latestRendererMetrics = null;
    let latestSimulationMetrics = null;
    let energyBaselineJ = NaN;
    let lastEnergyElapsedS = NaN;
    let currentScreen = document.querySelector(".screen-active")?.dataset.screen || "welcome";

    toggle?.addEventListener("click", () => {
        const isCollapsed = overlay.classList.toggle("is-collapsed");

        toggle.setAttribute("aria-expanded", String(!isCollapsed));
    });

    debugLockButton?.addEventListener("click", () => {
        setDebugOverlayLocked(!debugOverlayLocked);
    });
    debugDragHandle?.addEventListener("pointerdown", startDebugOverlayDrag);
    window.addEventListener("pointermove", dragDebugOverlay);
    window.addEventListener("pointerup", stopDebugOverlayDrag);
    window.addEventListener("resize", clampDebugOverlayToViewport);

    window.addEventListener("solar-sim:renderer-metrics", (event) => {
        latestRendererMetrics = event.detail || null;
        updateRendererMetrics();
    });

    window.addEventListener("solar-sim:simulation-metrics", (event) => {
        latestSimulationMetrics = event.detail || null;
        updateSimulationMetrics();
    });

    window.addEventListener("solar-sim:navigate", (event) => {
        currentScreen = event.detail?.screenName || currentScreen;
        apply(store.getState());
    });

    function apply(state) {
        drawerEnabled = currentScreen === "simulation" && Boolean(overlay);
        overlay?.classList.toggle("is-visible", drawerEnabled);
        metricsSetAllRowsVisible(rows);
        metricsSetAllGraphsVisible(graphs);
        updateDebugOverlayLockLabel();
        applyDebugOverlay(state);
        updateSettingsMetrics(state);
        updateRendererMetrics();
        updateSimulationMetrics();
    }

    function tick(time) {
        const frameTime = time - lastTime;
        lastTime = time;

        if (drawerEnabled || debugOverlayEnabled) {
            frames += 1;
            accumulator += frameTime;
            metricsPushGraphValue(frameTimes, frameTime, 120);
            metricsDrawLineGraph(graphs.frameTime, frameTimes, {
                color: "#6ee7d8",
                maxHint: 42,
            });
            metricsDrawLineGraph(debugGraphs.frameTime, frameTimes, {
                color: "#6ee7d8",
                maxHint: 42,
            });
            metricsSetValue(values, "frameTime", `${frameTime.toFixed(1)} ms`);
            metricsSetValue(debugValues, "frameTime", `${frameTime.toFixed(1)} ms`);

            if (accumulator >= 500) {
                const fps = Math.round((frames * 1000) / accumulator);

                metricsSetValue(values, "fps", fps);
                metricsSetValue(debugValues, "fps", fps);
                frames = 0;
                accumulator = 0;
            }
        }

        requestAnimationFrame(tick);
    }

    setDebugOverlayLocked(debugOverlayLocked);
    requestAnimationFrame(tick);

    return { apply };

    function applyDebugOverlay(state) {
        const performanceOverlay = state.debug.performanceOverlay || {};
        const uiToggles = state.debug.uiToggles || {};
        const showEnergyGraph = Boolean(state.debug.showEnergyGraph);
        const momentumCheck = Boolean(state.debug.momentumCheck);
        const showTrails = Boolean(uiToggles.showTrails);
        const showVectors = Boolean(uiToggles.showVelocityVectors || uiToggles.showAccelerationVectors);
        const showBarycenterMarker = Boolean(uiToggles.showBarycenterMarker);

        debugOverlayEnabled = currentScreen === "simulation"
            && Boolean(debugOverlay)
            && (
                Boolean(performanceOverlay.fpsCounter)
                || Boolean(performanceOverlay.frameTimeGraph)
                || Boolean(performanceOverlay.simulationStepTime)
                || showEnergyGraph
                || momentumCheck
                || showTrails
                || showVectors
                || showBarycenterMarker
            );

        debugOverlay?.classList.toggle("is-visible", debugOverlayEnabled);
        setDebugRowVisible("fps", Boolean(performanceOverlay.fpsCounter));
        setDebugRowVisible("frameTime", Boolean(performanceOverlay.frameTimeGraph));
        setDebugGraphVisible("frameTime", Boolean(performanceOverlay.frameTimeGraph));
        setDebugRowVisible("simulationStep", Boolean(performanceOverlay.simulationStepTime));
        setDebugRowVisible("energy", showEnergyGraph);
        setDebugRowVisible("energyError", showEnergyGraph);
        setDebugGraphVisible("energy", showEnergyGraph);
        setDebugRowVisible("momentum", momentumCheck);
        setDebugRowVisible("trails", showTrails);
        setDebugRowVisible("vectors", showVectors);
        setDebugRowVisible("barycenter", showBarycenterMarker);
    }

    function updateSettingsMetrics(state = store.getState()) {
        const sphereQualityProfile = getControlProfile("graphics", "sphereQuality", state.graphics.sphereQuality);

        metricsSetValue(values, "fpsLimit", state.graphics.fpsLimit);
        metricsSetValue(values, "skyboxQuality", metricsTranslateCurrentOption(schema, "graphics", "skyboxQuality", state.graphics.skyboxQuality));
        metricsSetValue(values, "sphereQuality", metricsTranslateCurrentOption(schema, "graphics", "sphereQuality", state.graphics.sphereQuality));
        metricsSetValue(values, "lightingQuality", metricsTranslateCurrentOption(schema, "graphics", "lightingQuality", state.graphics.lightingQuality));
        metricsSetValue(values, "sphereGeometryDetail", sphereQualityProfile?.sphereGeometryDetail ?? "--");
        metricsSetValue(values, "cameraSpeed", state.camera.moveSpeed);
        metricsSetValue(values, "cameraSensitivity", Number(state.camera.mouseSensitivity).toFixed(1));
    }

    function updateRendererMetrics() {
        if (!latestRendererMetrics) {
            return;
        }

        metricsSetValue(values, "pixelRatio", Number(latestRendererMetrics.pixelRatio || 0).toFixed(2));
        metricsSetValue(values, "sphereGeometryDetail", latestRendererMetrics.sphereGeometryDetail ?? "--");
        metricsSetValue(values, "trailPointCount", latestRendererMetrics.trailPointCount ?? "--");
        metricsSetValue(debugValues, "trailPointCount", latestRendererMetrics.trailPointCount ?? "--");
        metricsSetValue(values, "vectorCount", latestRendererMetrics.vectorCount ?? "--");
        metricsSetValue(debugValues, "vectorCount", latestRendererMetrics.vectorCount ?? "--");

        if (latestRendererMetrics.lastStepDurationMs) {
            const steps = latestRendererMetrics.lastStepCount || 1;
            const stepLabel = `${latestRendererMetrics.lastStepDurationMs.toFixed(1)} ms / ${steps}`;

            metricsSetValue(values, "simulationStep", stepLabel);
            metricsSetValue(debugValues, "simulationStep", stepLabel);
        }
    }

    function updateSimulationMetrics() {
        const diagnostics = latestSimulationMetrics?.diagnostics;

        if (!latestSimulationMetrics) {
            return;
        }

        metricsSetValue(values, "timestep", metricsFormatDuration(latestSimulationMetrics.dtS));

        if (!diagnostics) {
            return;
        }

        metricsSetValue(values, "energy", metricsFormatScientific(diagnostics.totalEnergyJ, "J"));
        metricsSetValue(debugValues, "energy", metricsFormatScientific(diagnostics.totalEnergyJ, "J"));
        const energyError = getRelativeEnergyError(diagnostics.totalEnergyJ, latestSimulationMetrics.elapsedS);

        metricsSetValue(values, "energyError", metricsFormatRelativeError(energyError));
        metricsSetValue(debugValues, "energyError", metricsFormatRelativeError(energyError));
        metricsSetValue(values, "momentum", metricsFormatScientific(diagnostics.momentumMagnitudeKgMS, "kg m/s"));
        metricsSetValue(debugValues, "momentum", metricsFormatScientific(diagnostics.momentumMagnitudeKgMS, "kg m/s"));
        metricsSetValue(values, "barycenter", metricsFormatDistance(metricsVectorMagnitude(diagnostics.barycenterM)));
        metricsSetValue(debugValues, "barycenter", metricsFormatDistance(metricsVectorMagnitude(diagnostics.barycenterM)));
        metricsPushGraphValue(energyErrorValues, energyError, 160);
        metricsDrawLineGraph(graphs.energy, energyErrorValues, {
            color: "#ffd36d",
            centerZero: true,
            minAbs: 1e-12,
        });
        metricsDrawLineGraph(debugGraphs.energy, energyErrorValues, {
            color: "#ffd36d",
            centerZero: true,
            minAbs: 1e-12,
        });
    }

    function setDebugRowVisible(rowKey, visible) {
        debugRows[rowKey]?.classList.toggle("is-hidden", !visible);
    }

    function setDebugGraphVisible(graphKey, visible) {
        debugGraphs[graphKey]?.classList.toggle("is-hidden", !visible);
    }

    function getRelativeEnergyError(totalEnergyJ, elapsedS) {
        if (!Number.isFinite(totalEnergyJ)) {
            return NaN;
        }

        if (!Number.isFinite(energyBaselineJ)
            || !Number.isFinite(lastEnergyElapsedS)
            || (Number.isFinite(elapsedS) && elapsedS < lastEnergyElapsedS)
        ) {
            energyBaselineJ = totalEnergyJ;
            energyErrorValues.length = 0;
        }

        if (Number.isFinite(elapsedS)) {
            lastEnergyElapsedS = elapsedS;
        }

        if (energyBaselineJ === 0) {
            return 0;
        }

        return (totalEnergyJ - energyBaselineJ) / Math.abs(energyBaselineJ);
    }

    function setDebugOverlayLocked(locked) {
        debugOverlayLocked = Boolean(locked);
        debugOverlay?.setAttribute("data-locked", String(debugOverlayLocked));
        debugLockButton?.setAttribute("aria-pressed", String(debugOverlayLocked));
        updateDebugOverlayLockLabel();
    }

    function updateDebugOverlayLockLabel() {
        if (!debugLockButton) {
            return;
        }

        const key = debugOverlayLocked ? "overlay.unlockDebugOverlay" : "overlay.lockDebugOverlay";
        const fallback = debugOverlayLocked ? "Unlock debug overlay" : "Lock debug overlay";
        const label = metricsTranslateText(key, fallback);

        debugLockButton.setAttribute("aria-label", label);
        debugLockButton.title = label;
    }

    function startDebugOverlayDrag(event) {
        if (debugOverlayLocked || !debugOverlay || event.button !== 0 || event.target?.closest?.("button")) {
            return;
        }

        const rect = debugOverlay.getBoundingClientRect();

        debugOverlayDragging = true;
        debugOverlayDragOffsetX = event.clientX - rect.left;
        debugOverlayDragOffsetY = event.clientY - rect.top;
        debugOverlay.classList.add("is-dragging");
        debugOverlay.style.right = "auto";
        debugOverlay.style.bottom = "auto";
        debugOverlay.style.left = `${rect.left}px`;
        debugOverlay.style.top = `${rect.top}px`;
        debugDragHandle?.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    function dragDebugOverlay(event) {
        if (!debugOverlayDragging || !debugOverlay) {
            return;
        }

        moveDebugOverlayTo(
            event.clientX - debugOverlayDragOffsetX,
            event.clientY - debugOverlayDragOffsetY,
        );
    }

    function stopDebugOverlayDrag(event) {
        if (!debugOverlayDragging) {
            return;
        }

        debugOverlayDragging = false;
        debugOverlay?.classList.remove("is-dragging");
        debugDragHandle?.releasePointerCapture?.(event.pointerId);
    }

    function moveDebugOverlayTo(left, top) {
        const bounds = getDebugOverlayBounds();

        debugOverlay.style.left = `${clampMetricsNumber(left, 8, bounds.maxLeft)}px`;
        debugOverlay.style.top = `${clampMetricsNumber(top, 8, bounds.maxTop)}px`;
    }

    function clampDebugOverlayToViewport() {
        if (!debugOverlay || !debugOverlay.style.left || !debugOverlay.style.top) {
            return;
        }

        moveDebugOverlayTo(
            parseFloat(debugOverlay.style.left),
            parseFloat(debugOverlay.style.top),
        );
    }

    function getDebugOverlayBounds() {
        const rect = debugOverlay.getBoundingClientRect();

        return {
            maxLeft: Math.max(8, window.innerWidth - rect.width - 8),
            maxTop: Math.max(8, window.innerHeight - rect.height - 8),
        };
    }
}

function metricsCollectElements(root, selector, datasetKey) {
    if (!root) {
        return {};
    }

    return Object.fromEntries(
        Array.from(root.querySelectorAll(selector)).map((element) => [
            element.dataset[datasetKey],
            element,
        ]),
    );
}

function metricsSetValue(values, key, value) {
    if (values[key]) {
        values[key].textContent = value;
    }
}

function metricsSetAllRowsVisible(rows) {
    Object.values(rows).forEach((row) => {
        row.classList.remove("is-hidden");
    });
}

function metricsSetAllGraphsVisible(graphs) {
    Object.values(graphs).forEach((graph) => {
        graph.classList.remove("is-hidden");
    });
}

function metricsTranslateText(key, fallback) {
    const i18n = window.SolarSim.i18n?.instance;

    if (!i18n) {
        return fallback;
    }

    const translated = i18n.t(key);

    return translated === key ? fallback : translated;
}

function updateIntegratorStatus(integratorStatus, schema, integratorValue) {
    if (!integratorStatus) {
        return;
    }

    const control = schema.simulation.controls.find((item) => item.key === "physicsIntegrator");
    const option = control.options.find((item) => item.value === integratorValue);
    integratorStatus.textContent = option
        ? translateSettingOption("simulation", control, option)
        : integratorValue;
}

function metricsTranslateCurrentOption(schema, categoryKey, settingKey, value) {
    const control = schema[categoryKey]?.controls.find((item) => item.key === settingKey);
    const option = control?.options?.find((item) => item.value === value);

    return option ? translateSettingOption(categoryKey, control, option) : value;
}

function metricsPushGraphValue(values, value, limit) {
    if (!Number.isFinite(value)) {
        return;
    }

    values.push(value);

    if (values.length > limit) {
        values.splice(0, values.length - limit);
    }
}

function metricsDrawLineGraph(canvas, values, { color, maxHint, centerZero = false, minAbs = 0 } = {}) {
    if (!canvas || canvas.classList.contains("is-hidden")) {
        return;
    }

    if (values.length < 2) {
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    let min = Math.min(...values);
    let max = Math.max(maxHint || min, ...values);

    if (centerZero) {
        const maxAbs = Math.max(minAbs, ...values.map((value) => Math.abs(value)));

        min = -maxAbs;
        max = maxAbs;
    }

    const range = max - min || 1;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(255, 255, 255, 0.025)";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;

    for (let y = 11; y < height; y += 11) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }

    if (centerZero) {
        const zeroY = height - ((0 - min) / range) * (height - 5) - 2.5;

        context.strokeStyle = "rgba(255, 255, 255, 0.18)";
        context.beginPath();
        context.moveTo(0, zeroY);
        context.lineTo(width, zeroY);
        context.stroke();
    }

    context.strokeStyle = color || "#6ee7d8";
    context.lineWidth = 2;
    context.beginPath();

    values.forEach((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 5) - 2.5;

        if (index === 0) {
            context.moveTo(x, y);
            return;
        }

        context.lineTo(x, y);
    });

    context.stroke();
}

function metricsFormatDuration(valueS) {
    if (!Number.isFinite(valueS)) {
        return "--";
    }

    if (valueS >= 3600) {
        return `${(valueS / 3600).toFixed(2)} h`;
    }

    if (valueS >= 60) {
        return `${(valueS / 60).toFixed(2)} min`;
    }

    return `${valueS.toFixed(2)} s`;
}

function metricsFormatScientific(value, unit) {
    if (!Number.isFinite(value)) {
        return "--";
    }

    return `${value.toExponential(3)} ${unit}`;
}

function metricsFormatRelativeError(value) {
    if (!Number.isFinite(value)) {
        return "--";
    }

    const sign = value > 0 ? "+" : "";

    return `${sign}${value.toExponential(3)}`;
}

function metricsFormatDistance(valueM) {
    if (!Number.isFinite(valueM)) {
        return "--";
    }

    const astronomicalUnitM = 149_597_870_700;

    if (Math.abs(valueM) >= astronomicalUnitM * 0.02) {
        return `${(valueM / astronomicalUnitM).toFixed(4)} AU`;
    }

    return `${(valueM / 1000).toFixed(0)} km`;
}

function metricsVectorMagnitude(values) {
    if (!Array.isArray(values) || values.length < 3) {
        return NaN;
    }

    return Math.hypot(Number(values[0]) || 0, Number(values[1]) || 0, Number(values[2]) || 0);
}

function clampMetricsNumber(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }

    return Math.min(max, Math.max(min, value));
}

function getControlProfile(categoryKey, settingKey, value) {
    return window.SolarSim.settings?.getControlProfile?.(categoryKey, settingKey, value) || null;
}

function translateSettingOption(categoryKey, control, option) {
    const i18n = window.SolarSim.i18n?.instance;

    if (!i18n) {
        return option.label;
    }

    const keys = [
        option.labelKey,
        `settings.${categoryKey}.${control.key}.${option.value}`,
        `settings.${control.key}.${option.value}`,
        `settings.${option.value}`,
    ].filter(Boolean);

    for (const key of keys) {
        const translated = i18n.t(key);

        if (translated !== key) {
            return translated;
        }
    }

    return option.label;
}
