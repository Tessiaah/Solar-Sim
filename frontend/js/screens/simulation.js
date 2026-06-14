window.SolarSim = window.SolarSim || {};
window.SolarSim.screens = window.SolarSim.screens || {};

const BODY_TUNING_FIELDS = {
    massKg: {
        defaultMultiplier: 1,
        labelKey: "simulation.tuneMass",
        min: 0.1,
        max: 10,
        step: 0.1,
        unit: "kg",
        valueMin: Number.MIN_VALUE,
        getBaseValue: (metadata) => Number(metadata?.massKg),
        formatValue: (value) => window.SolarSim.format.mass(value),
    },
    radiusM: {
        defaultMultiplier: 1,
        labelKey: "simulation.tuneRadius",
        min: 0.1,
        max: 10,
        step: 0.1,
        unit: "m",
        valueMin: Number.MIN_VALUE,
        getBaseValue: (metadata) => Number(metadata?.radiusM),
        formatValue: (value) => window.SolarSim.format.distance(value),
    },
    distanceM: {
        defaultMultiplier: 1,
        labelKey: "simulation.tuneDistance",
        min: 0,
        max: 4,
        step: 0.05,
        unit: "m",
        valueMin: 0,
        getBaseValue: (_metadata, snapshotBody) => window.SolarSim.format.vectorMagnitude(snapshotBody?.positionM),
        formatValue: (value) => window.SolarSim.format.distance(value),
    },
    speedMS: {
        defaultMultiplier: 1,
        labelKey: "simulation.tuneSpeed",
        min: 0,
        max: 4,
        step: 0.05,
        unit: "m/s",
        valueMin: 0,
        getBaseValue: (_metadata, snapshotBody) => window.SolarSim.format.vectorMagnitude(snapshotBody?.velocityMS),
        formatValue: (value) => window.SolarSim.format.velocity(value),
    },
};

window.SolarSim.screens.initSimulationScreen = function initSimulationScreen({ root, router, store }) {
    if (!root) {
        return;
    }

    const viewport = root.querySelector("#simulation-viewport");
    const timeReadout = root.querySelector("[data-simulation-time]");
    const routeButtons = root.querySelectorAll("[data-route]");
    const controls = collectSimulationControls(root);

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
    const uiState = {
        bodiesById: new Map(),
        latestSnapshot: null,
        positionPreviewsByBodyId: new Map(),
        scenarioEpoch: 0,
        scenarioId: null,
        selectedBodyId: null,
    };
    let simulationEntryToken = 0;
    let requestedScenarioId = null;

    bindSimulationControls({ controls, renderer, store });
    bindBodyInspectorControls({ controls, renderer, uiState });
    bindCameraSettingsControls(controls.cameraSettings, store);
    bindOrientationGizmoControls(controls.orientationGizmo, renderer);

    renderer.onBodiesChanged((payload) => {
        uiState.bodiesById = new Map(payload.bodies.map((body) => [body.id, body]));
        uiState.positionPreviewsByBodyId.clear();
        uiState.scenarioEpoch = payload.scenarioEpoch ?? uiState.scenarioEpoch;
        uiState.scenarioId = payload.scenarioId ?? uiState.scenarioId;
        uiState.selectedBodyId = payload.selectedBodyId;
        updateBodySelector(controls.bodySelect, payload.bodies, payload.selectedBodyId);
        updateSelectedBodyStats(controls.stats, uiState, controls.tuning);
        syncBodyTuningControls(controls.tuning, uiState);
    });

    renderer.onSelectionChanged((payload) => {
        uiState.selectedBodyId = payload.selectedBodyId;

        if (controls.bodySelect && controls.bodySelect.value !== payload.selectedBodyId) {
            controls.bodySelect.value = payload.selectedBodyId || "";
        }

        updateSelectedBodyStats(controls.stats, uiState, controls.tuning);
        syncBodyTuningControls(controls.tuning, uiState);
    });

    renderer.onSnapshot((snapshot) => {
        uiState.latestSnapshot = snapshot;
        updateSelectedBodyStats(controls.stats, uiState, controls.tuning);
        syncBodyTuningControls(controls.tuning, uiState);
    });

    renderer.onPlaybackChanged((state) => {
        updatePlaybackControls(controls, state);
    });

    window.addEventListener("solar-sim:body-position-preview", (event) => {
        const bodyId = event.detail?.bodyId;
        const positionM = event.detail?.positionM;

        if (!bodyId) {
            return;
        }

        if (Array.isArray(positionM)) {
            uiState.positionPreviewsByBodyId.set(bodyId, positionM);
        } else {
            uiState.positionPreviewsByBodyId.delete(bodyId);
        }

        updateSelectedBodyStats(controls.stats, uiState, controls.tuning);
    });

    window.addEventListener("solar-sim:launch-scenario", (event) => {
        requestedScenarioId = event.detail?.scenarioId || null;
    });

    window.addEventListener("solar-sim:navigate", (event) => {
        if (event.detail.screenName === "simulation") {
            const entryToken = simulationEntryToken + 1;
            const scenarioIdToLoad = requestedScenarioId;
            const shouldResumeExistingScenario = event.detail.previousScreen === "settings"
                && Boolean(uiState.latestSnapshot)
                && !scenarioIdToLoad;

            simulationEntryToken = entryToken;
            requestedScenarioId = null;
            renderer.stop();

            if (shouldResumeExistingScenario) {
                renderer.start();
                return;
            }

            const scenarioRequest = scenarioIdToLoad
                ? renderer.loadScenario(scenarioIdToLoad)
                : renderer.resetScenario();

            scenarioRequest.finally(() => {
                if (entryToken !== simulationEntryToken) {
                    return;
                }

                renderer.setPaused(false);
                renderer.start();
            });
            return;
        }

        simulationEntryToken += 1;
        renderer.stop();
    });

    window.addEventListener("keydown", (event) => {
        if (!root.classList.contains("screen-active")) {
            return;
        }

        if (isSimulationEditableTarget(event.target)) {
            return;
        }

        if (isTrackSelectedKey(event)) {
            event.preventDefault();
            toggleTrackSelected(controls, renderer);
            return;
        }

        if (event.key !== "Escape") {
            return;
        }

        event.preventDefault();
        router.goTo("settings");
    });

    window.addEventListener("solar-sim:debug-settings-applied", (event) => {
        const uiToggles = event.detail?.debug?.uiToggles;
        const showLabels = uiToggles?.showLabels;
        const showOrbitLines = uiToggles?.showOrbitLines;

        if (typeof showLabels === "boolean" && controls.labelToggle) {
            controls.labelToggle.checked = showLabels;
        }

        if (typeof showOrbitLines === "boolean" && controls.orbitToggle) {
            controls.orbitToggle.checked = showOrbitLines;
        }
    });

    window.addEventListener("solar-sim:language-changed", () => {
        updateBodySelector(
            controls.bodySelect,
            Array.from(uiState.bodiesById.values()),
            uiState.selectedBodyId,
        );
        updateSelectedBodyStats(controls.stats, uiState, controls.tuning);
        syncBodyTuningControls(controls.tuning, uiState);
        updatePlaybackControls(controls, renderer.getPlaybackState());
    });

    window.addEventListener("beforeunload", () => {
        renderer.destroy();
    });

    root.dataset.rendererState = "ready";
};

function collectSimulationControls(root) {
    return {
        bodySelect: root.querySelector("[data-simulation-body-select]"),
        cameraSettings: {
            menu: root.querySelector("[data-camera-menu]"),
            inputs: root.querySelectorAll("[data-camera-setting]"),
            values: root.querySelectorAll("[data-camera-setting-value]"),
        },
        inspector: {
            root: root.querySelector("[data-inspector-drawer]"),
            toggle: root.querySelector("[data-inspector-toggle]"),
        },
        bodyPanels: {
            toggles: root.querySelectorAll("[data-body-panel-toggle]"),
            panels: new Map(
                Array.from(root.querySelectorAll("[data-body-panel]")).map((panel) => [
                    panel.dataset.bodyPanel,
                    panel,
                ]),
            ),
        },
        commandButtons: root.querySelectorAll("[data-simulation-command]"),
        labelToggle: root.querySelector('[data-simulation-toggle="labels"]'),
        orbitToggle: root.querySelector('[data-simulation-toggle="orbits"]'),
        orientationGizmo: {
            root: root.querySelector("[data-orientation-gizmo]"),
            scene: root.querySelector("[data-orientation-gizmo-scene]"),
            axisLines: root.querySelectorAll("[data-orientation-axis-line]"),
            axisPoints: root.querySelectorAll("[data-orientation-axis-point]"),
            viewButtons: root.querySelectorAll("[data-camera-view]"),
        },
        speedButtons: root.querySelectorAll("[data-simulation-speed]"),
        stats: {
            factsList: root.querySelector("[data-body-facts]"),
            mass: root.querySelector('[data-body-stat="mass"]'),
            radius: root.querySelector('[data-body-stat="radius"]'),
            distance: root.querySelector('[data-body-stat="distance"]'),
            velocity: root.querySelector('[data-body-stat="velocity"]'),
        },
        stepButton: root.querySelector('[data-simulation-command="step-once"]'),
        tuning: {
            baselinesByBodyId: new Map(),
            busy: false,
            container: root.querySelector("[data-body-tuning-controls]"),
            inputs: root.querySelectorAll("[data-body-tune]"),
            multipliersByBodyId: new Map(),
            outputs: new Map(
                Array.from(root.querySelectorAll("[data-body-tune-output]")).map((output) => [
                    output.dataset.bodyTuneOutput,
                    output,
                ]),
            ),
            resetButton: root.querySelector("[data-body-tune-reset]"),
            scenarioEpoch: null,
            previewBodyId: null,
            previewKeys: new Set(),
            status: root.querySelector("[data-body-tune-status]"),
            systemResetButton: root.querySelector("[data-system-reset]"),
            valueInputs: new Map(),
            valuesByBodyId: new Map(),
        },
        togglePlaybackButton: root.querySelector('[data-simulation-command="toggle-playback"]'),
        trackToggle: root.querySelector('[data-simulation-toggle="track-selected"]'),
        transformToggle: root.querySelector("[data-body-transform-toggle]"),
    };
}

function bindSimulationControls({ controls, renderer, store }) {
    controls.bodySelect?.addEventListener("change", () => {
        renderer.selectBody(controls.bodySelect.value);
    });

    controls.commandButtons.forEach((button) => {
        button.addEventListener("click", () => {
            runSimulationCommand(button.dataset.simulationCommand, renderer);
        });
    });

    controls.speedButtons.forEach((button) => {
        button.addEventListener("click", () => {
            renderer.setPlaybackSpeed(Number(button.dataset.simulationSpeed));
        });
    });

    controls.labelToggle?.addEventListener("change", () => {
        const checked = controls.labelToggle.checked;

        renderer.setLabelsVisible(checked);
        persistDebugToggle(store, "showLabels", checked);
    });

    controls.orbitToggle?.addEventListener("change", () => {
        const checked = controls.orbitToggle.checked;

        renderer.setOrbitLinesVisible(checked);
        persistDebugToggle(store, "showOrbitLines", checked);
    });

    controls.trackToggle?.addEventListener("change", () => {
        setTrackSelected(controls, renderer, controls.trackToggle.checked);
    });
}

function bindBodyInspectorControls({ controls, renderer, uiState }) {
    controls.inspector.toggle?.addEventListener("click", () => {
        toggleInspectorDrawer(controls.inspector);
    });

    controls.bodyPanels.toggles.forEach((button) => {
        button.addEventListener("click", () => {
            const panelKey = button.dataset.bodyPanelToggle;

            toggleBodyPanel(controls.bodyPanels, panelKey);

            if (panelKey === "sandbox" && !controls.bodyPanels.panels.get(panelKey)?.hidden) {
                syncBodyTuningControls(controls.tuning, uiState);
            }
        });
    });

    controls.transformToggle?.addEventListener("click", () => {
        const isActive = controls.transformToggle.getAttribute("aria-pressed") !== "true";

        renderer.setTransformGizmoVisible?.(isActive);
        controls.transformToggle.setAttribute("aria-pressed", String(isActive));
    });

    renderBodyTuningControls(controls.tuning);
    configureBodyTuningInputs(controls.tuning);

    controls.tuning.inputs.forEach((input) => {
        input.addEventListener("input", () => {
            updateBodyTuningFromSlider({
                input,
                renderer,
                stats: controls.stats,
                tuning: controls.tuning,
                uiState,
            });
        });

        input.addEventListener("change", () => {
            commitBodyTuningField({
                key: input.dataset.bodyTune,
                renderer,
                stats: controls.stats,
                tuning: controls.tuning,
                uiState,
            });
        });
    });

    controls.tuning.valueInputs.forEach((input, key) => {
        input.addEventListener("change", () => {
            updateBodyTuningFromValueInput({
                input,
                key,
                renderer,
                stats: controls.stats,
                tuning: controls.tuning,
                uiState,
            });
        });

        input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") {
                return;
            }

            event.preventDefault();
            input.blur();
        });
    });

    controls.tuning.resetButton?.addEventListener("click", () => {
        resetSelectedBodyTuning({
            renderer,
            stats: controls.stats,
            tuning: controls.tuning,
            uiState,
        });
    });

    controls.tuning.systemResetButton?.addEventListener("click", () => {
        resetSystemTuning({
            renderer,
            stats: controls.stats,
            tuning: controls.tuning,
            uiState,
        });
    });
}

function toggleInspectorDrawer(inspector) {
    if (!inspector?.root || !inspector.toggle) {
        return;
    }

    const isCollapsed = inspector.root.classList.toggle("is-collapsed");

    inspector.root.classList.toggle("is-open", !isCollapsed);
    inspector.toggle.setAttribute("aria-expanded", String(!isCollapsed));
    setTranslatedAttribute(
        inspector.toggle,
        "aria-label",
        isCollapsed ? "simulation.expandInspector" : "simulation.collapseInspector",
    );
}

function toggleBodyPanel(bodyPanels, panelKey) {
    const panel = bodyPanels.panels.get(panelKey);

    if (!panel) {
        return;
    }

    const shouldOpen = panel.hidden;

    bodyPanels.panels.forEach((candidatePanel, candidateKey) => {
        candidatePanel.hidden = !(shouldOpen && candidateKey === panelKey);
    });

    bodyPanels.toggles.forEach((button) => {
        const isActive = shouldOpen && button.dataset.bodyPanelToggle === panelKey;

        button.setAttribute("aria-pressed", String(isActive));
    });
}

function bindCameraSettingsControls(cameraSettings, store) {
    if (!store?.setValue || !cameraSettings?.inputs?.length) {
        return;
    }

    const schemaControls = window.SolarSim.settings?.schema?.camera?.controls || [];
    const controlsByKey = new Map(schemaControls.map((control) => [control.key, control]));
    const valuesByKey = new Map(
        Array.from(cameraSettings.values || []).map((valueElement) => [
            valueElement.dataset.cameraSettingValue,
            valueElement,
        ]),
    );

    cameraSettings.inputs.forEach((input) => {
        const settingKey = input.dataset.cameraSetting;
        const control = controlsByKey.get(settingKey);

        if (!control) {
            input.disabled = true;
            return;
        }

        configureCameraSettingInput(input, control);
        input.addEventListener("input", () => {
            const nextValue = parseCameraSettingValue(input.value, control);

            input.value = nextValue;
            updateCameraSettingOutput(valuesByKey.get(settingKey), nextValue, control);
            store.setValue("camera", settingKey, nextValue);
        });
    });

    cameraSettings.menu?.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", () => {
        if (cameraSettings.menu?.open) {
            cameraSettings.menu.open = false;
        }
    });

    window.addEventListener("solar-sim:settings-changed", (event) => {
        if (event.detail?.categoryKey === "camera") {
            syncCameraSettingsControls(cameraSettings.inputs, valuesByKey, controlsByKey, event.detail.state.camera);
        }
    });

    window.addEventListener("solar-sim:settings-reset", (event) => {
        syncCameraSettingsControls(cameraSettings.inputs, valuesByKey, controlsByKey, event.detail.state.camera);
    });

    syncCameraSettingsControls(cameraSettings.inputs, valuesByKey, controlsByKey, store.getState().camera);
}

function bindOrientationGizmoControls(orientationGizmo, renderer) {
    if (!orientationGizmo?.root || !orientationGizmo.scene || !renderer?.setCameraView) {
        return;
    }

    const cameraQuaternion = new THREE.Quaternion();
    const inverseCameraQuaternion = new THREE.Quaternion();
    const projectedAxis = new THREE.Vector3();
    const axisVectors = createOrientationAxisVectors();
    const axisPoints = new Map(
        Array.from(orientationGizmo.axisPoints || []).map((point) => [
            point.dataset.orientationAxisPoint,
            point,
        ]),
    );
    const axisLines = new Map(
        Array.from(orientationGizmo.axisLines || []).map((line) => [
            line.dataset.orientationAxisLine,
            line,
        ]),
    );
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    orientationGizmo.viewButtons.forEach((button) => {
        button.addEventListener("click", () => {
            renderer.setCameraView(button.dataset.cameraView);
            button.blur();
        });
    });

    orientationGizmo.scene.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) {
            return;
        }

        dragging = true;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        orientationGizmo.scene.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    orientationGizmo.scene.addEventListener("pointermove", (event) => {
        if (!dragging) {
            return;
        }

        const deltaX = event.clientX - lastPointerX;
        const deltaY = event.clientY - lastPointerY;

        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        renderer.orbitCamera(deltaX * 0.006, deltaY * 0.006);
    });

    orientationGizmo.scene.addEventListener("pointerup", (event) => {
        dragging = false;
        releaseOrientationPointer(orientationGizmo.scene, event.pointerId);
    });

    orientationGizmo.scene.addEventListener("pointercancel", (event) => {
        dragging = false;
        releaseOrientationPointer(orientationGizmo.scene, event.pointerId);
    });

    syncOrientationGizmo();

    function syncOrientationGizmo() {
        const orientation = renderer.getCameraOrientation?.();
        const values = orientation?.quaternion;

        if (Array.isArray(values) && values.length === 4) {
            cameraQuaternion.set(values[0], values[1], values[2], values[3]);
            inverseCameraQuaternion.copy(cameraQuaternion).invert();
            updateOrientationAxisProjection({
                axisLines,
                axisPoints,
                axisVectors,
                inverseCameraQuaternion,
                projectedAxis,
            });
            orientationGizmo.root.dataset.projection = orientation.projection || "perspective";
        }

        requestAnimationFrame(syncOrientationGizmo);
    }
}

function createOrientationAxisVectors() {
    return {
        "x-positive": new THREE.Vector3(1, 0, 0),
        "x-negative": new THREE.Vector3(-1, 0, 0),
        "y-positive": new THREE.Vector3(0, 0, 1),
        "y-negative": new THREE.Vector3(0, 0, -1),
        "z-positive": new THREE.Vector3(0, 1, 0),
        "z-negative": new THREE.Vector3(0, -1, 0),
    };
}

function updateOrientationAxisProjection({
    axisLines,
    axisPoints,
    axisVectors,
    inverseCameraQuaternion,
    projectedAxis,
}) {
    const center = 46;
    const radius = 31;

    Object.entries(axisVectors).forEach(([axisKey, axisVector]) => {
        const axisPoint = axisPoints.get(axisKey);

        if (!axisPoint) {
            return;
        }

        projectedAxis.copy(axisVector).applyQuaternion(inverseCameraQuaternion);

        const depth = -projectedAxis.z;
        const normalizedDepth = normalizeDepth(depth);
        const x = center + projectedAxis.x * radius;
        const y = center - projectedAxis.y * radius;
        const isPositiveAxis = axisKey.endsWith("positive");
        const scale = isPositiveAxis
            ? 0.84 + normalizedDepth * 0.18
            : 0.68 + normalizedDepth * 0.16;

        axisPoint.style.left = `${x}px`;
        axisPoint.style.top = `${y}px`;
        axisPoint.style.opacity = String(isPositiveAxis ? 0.74 + normalizedDepth * 0.26 : 0.32 + normalizedDepth * 0.34);
        axisPoint.style.transform = `translate(-50%, -50%) scale(${scale})`;
        axisPoint.style.zIndex = String(Math.round(100 + depth * 40));
        axisPoint.classList.toggle("is-behind", depth < -0.04);

        updateOrientationAxisLine(axisLines.get(axisKey), center, x, y, normalizedDepth);
    });
}

function updateOrientationAxisLine(line, center, x, y, normalizedDepth) {
    if (!line) {
        return;
    }

    line.setAttribute("x1", String(center));
    line.setAttribute("y1", String(center));
    line.setAttribute("x2", x.toFixed(2));
    line.setAttribute("y2", y.toFixed(2));
    line.style.opacity = String(0.32 + normalizedDepth * 0.56);
}

function normalizeDepth(depth) {
    return Math.min(1, Math.max(0, (depth + 1) / 2));
}

function releaseOrientationPointer(element, pointerId) {
    if (element.hasPointerCapture?.(pointerId)) {
        element.releasePointerCapture(pointerId);
    }
}

function isSimulationEditableTarget(target) {
    return target instanceof Element
        && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isTrackSelectedKey(event) {
    return event.code === "KeyF"
        && !event.ctrlKey
        && !event.altKey
        && !event.metaKey;
}

function toggleTrackSelected(controls, renderer) {
    const nextValue = !(controls.trackToggle?.checked ?? false);

    setTrackSelected(controls, renderer, nextValue);
}

function setTrackSelected(controls, renderer, enabled) {
    const isEnabled = Boolean(enabled);

    if (controls.trackToggle) {
        controls.trackToggle.checked = isEnabled;
    }

    renderer.setFollowSelected(isEnabled);
}

function configureCameraSettingInput(input, control) {
    if (Number.isFinite(control.min)) {
        input.min = control.min;
    }

    if (Number.isFinite(control.max)) {
        input.max = control.max;
    }

    if (Number.isFinite(control.step)) {
        input.step = control.step;
    }
}

function syncCameraSettingsControls(inputs, valuesByKey, controlsByKey, cameraState) {
    inputs.forEach((input) => {
        const settingKey = input.dataset.cameraSetting;
        const control = controlsByKey.get(settingKey);
        const value = cameraState?.[settingKey];

        if (!control || !Number.isFinite(value)) {
            return;
        }

        input.value = value;
        updateCameraSettingOutput(valuesByKey.get(settingKey), value, control);
    });
}

function updateCameraSettingOutput(output, value, control) {
    if (!output) {
        return;
    }

    output.textContent = formatCameraSettingValue(value, control);
}

function parseCameraSettingValue(value, control) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
        return control.defaultValue;
    }

    const min = Number.isFinite(control.min) ? control.min : numberValue;
    const max = Number.isFinite(control.max) ? control.max : numberValue;

    return Math.min(max, Math.max(min, numberValue));
}

function formatCameraSettingValue(value, control) {
    const step = Number(control.step);
    const fractionDigits = step > 0 && step < 1
        ? String(step).split(".")[1]?.length || 0
        : 0;

    return Number(value).toFixed(fractionDigits);
}

function renderBodyTuningControls(tuning) {
    if (!tuning?.container || tuning.rendered) {
        return;
    }

    const fragment = document.createDocumentFragment();

    Object.entries(BODY_TUNING_FIELDS).forEach(([key, field]) => {
        const label = document.createElement("label");
        const labelText = document.createElement("span");
        const slider = document.createElement("div");
        const input = document.createElement("input");
        const output = document.createElement("output");
        const valueRow = document.createElement("div");
        const valueInput = document.createElement("input");
        const unit = document.createElement("span");

        labelText.dataset.i18n = field.labelKey;
        labelText.textContent = window.SolarSim.format.text(field.labelKey, {}, key);

        slider.className = "body-tuning-slider";

        input.type = "range";
        input.dataset.bodyTune = key;
        input.dataset.i18nAriaLabel = field.labelKey;
        input.setAttribute("aria-label", window.SolarSim.format.text(field.labelKey, {}, key));

        output.dataset.bodyTuneOutput = key;
        output.textContent = formatBodyTuningMultiplier(field.defaultMultiplier);

        valueRow.className = "body-tuning-value";

        valueInput.type = "text";
        valueInput.inputMode = "decimal";
        valueInput.autocomplete = "off";
        valueInput.spellcheck = false;
        valueInput.dataset.bodyTuneValue = key;
        valueInput.dataset.i18nAriaLabel = field.labelKey;
        valueInput.setAttribute("aria-label", window.SolarSim.format.text(field.labelKey, {}, key));

        unit.className = "body-tuning-unit";
        unit.textContent = field.unit;

        slider.append(input, output);
        valueRow.append(valueInput, unit);
        label.append(labelText, slider, valueRow);
        fragment.appendChild(label);
    });

    tuning.container.replaceChildren(fragment);
    tuning.inputs = tuning.container.querySelectorAll("[data-body-tune]");
    tuning.outputs = new Map(
        Array.from(tuning.container.querySelectorAll("[data-body-tune-output]")).map((output) => [
            output.dataset.bodyTuneOutput,
            output,
        ]),
    );
    tuning.valueInputs = new Map(
        Array.from(tuning.container.querySelectorAll("[data-body-tune-value]")).map((input) => [
            input.dataset.bodyTuneValue,
            input,
        ]),
    );
    tuning.rendered = true;
}

function configureBodyTuningInputs(tuning) {
    tuning.inputs.forEach((input) => {
        const field = BODY_TUNING_FIELDS[input.dataset.bodyTune];

        if (!field) {
            input.disabled = true;
            return;
        }

        input.min = field.min;
        input.max = field.max;
        input.step = field.step;
        input.value = field.defaultMultiplier;
    });
}

function syncBodyTuningControls(tuning, uiState) {
    if (!tuning?.inputs?.length) {
        return;
    }

    syncBodyTuningScenario(tuning, uiState);

    const selectedBodyId = uiState.selectedBodyId;
    const metadata = selectedBodyId ? uiState.bodiesById.get(selectedBodyId) : null;
    const snapshotBody = selectedBodyId
        ? uiState.latestSnapshot?.bodies?.find((body) => body.id === selectedBodyId)
        : null;

    if (!metadata) {
        tuning.inputs.forEach((input) => {
            input.disabled = true;
            input.value = BODY_TUNING_FIELDS[input.dataset.bodyTune]?.defaultMultiplier ?? 1;
            syncBodyTuningFieldDisplay(tuning, null, input.dataset.bodyTune);
        });
        tuning.valueInputs.forEach((input) => {
            input.disabled = true;
            input.value = "";
        });
        setBodyTuningStatus(tuning, "simulation.sandboxNoBody", "No body");
        return;
    }

    const baseline = ensureBodyTuningBaseline(tuning, metadata, snapshotBody);

    tuning.inputs.forEach((input) => {
        const field = BODY_TUNING_FIELDS[input.dataset.bodyTune];
        const baseValue = baseline[input.dataset.bodyTune];

        input.disabled = !field || !Number.isFinite(baseValue) || baseValue <= 0;
        syncBodyTuningFieldDisplay(tuning, selectedBodyId, input.dataset.bodyTune);
    });

    tuning.valueInputs.forEach((input, key) => {
        const field = BODY_TUNING_FIELDS[key];
        const baseValue = baseline[key];

        input.disabled = !field || !Number.isFinite(baseValue);
    });

    if (!tuning.busy) {
        setBodyTuningStatus(tuning, "simulation.sandboxReady", "Ready");
    }
}

function syncBodyTuningScenario(tuning, uiState) {
    const scenarioEpoch = uiState.scenarioEpoch ?? 0;

    if (tuning.scenarioEpoch === scenarioEpoch) {
        return;
    }

    tuning.scenarioEpoch = scenarioEpoch;
    tuning.baselinesByBodyId.clear();
    tuning.multipliersByBodyId.clear();
    tuning.valuesByBodyId.clear();
}

function createBodyTuningValues(metadata, snapshotBody) {
    return Object.fromEntries(
        Object.entries(BODY_TUNING_FIELDS).map(([key, field]) => [
            key,
            field.getBaseValue(metadata, snapshotBody),
        ]),
    );
}

function ensureBodyTuningBaseline(tuning, metadata, snapshotBody) {
    const bodyId = metadata.id;
    const baseline = tuning.baselinesByBodyId.get(bodyId) || {};
    const nextValues = createBodyTuningValues(metadata, snapshotBody);

    Object.entries(nextValues).forEach(([key, value]) => {
        if (!Number.isFinite(baseline[key]) && Number.isFinite(value)) {
            baseline[key] = value;
        }
    });

    tuning.baselinesByBodyId.set(bodyId, baseline);

    if (!tuning.multipliersByBodyId.has(bodyId)) {
        tuning.multipliersByBodyId.set(bodyId, {});
    }

    if (!tuning.valuesByBodyId.has(bodyId)) {
        tuning.valuesByBodyId.set(bodyId, {});
    }

    return baseline;
}

function updateBodyTuningFromSlider({ input, renderer, stats, tuning, uiState }) {
    const key = input.dataset.bodyTune;
    const field = BODY_TUNING_FIELDS[key];
    const bodyId = uiState.selectedBodyId;
    const baseline = getBodyTuningBaseline(tuning, bodyId);
    const baseValue = baseline?.[key];

    if (!field || !bodyId || !Number.isFinite(baseValue)) {
        return;
    }

    const multiplier = parseBodyTuningMultiplier(input.value, field);
    const nextValue = baseValue * multiplier;

    setBodyTuningValue(tuning, bodyId, key, nextValue);
    markBodyTuningPreview(tuning, bodyId, key);
    syncBodyTuningFieldDisplay(tuning, bodyId, key);
    previewSelectedBodyTuning(renderer, tuning, bodyId);
    updateSelectedBodyStats(stats, uiState, tuning);
    setBodyTuningStatus(tuning, "simulation.sandboxEdited", "Edited");
}

function updateBodyTuningFromValueInput({ input, key, renderer, stats, tuning, uiState }) {
    const field = BODY_TUNING_FIELDS[key];
    const bodyId = uiState.selectedBodyId;
    const value = parseBodyTuningValue(input.value, field);

    if (!field || !bodyId || !Number.isFinite(value)) {
        setBodyTuningStatus(tuning, "simulation.sandboxFailed", "Failed");
        syncBodyTuningFieldDisplay(tuning, bodyId, key);
        return;
    }

    setBodyTuningValue(tuning, bodyId, key, value);
    markBodyTuningPreview(tuning, bodyId, key);
    syncBodyTuningFieldDisplay(tuning, bodyId, key);
    previewSelectedBodyTuning(renderer, tuning, bodyId);
    updateSelectedBodyStats(stats, uiState, tuning);
    commitBodyTuningField({
        key,
        renderer,
        stats,
        tuning,
        uiState,
    });
}

async function commitBodyTuningField({ key, renderer, stats, tuning, uiState }) {
    const bodyId = uiState.selectedBodyId;
    const nextValue = getBodyTuningValue(tuning, bodyId, key);

    if (!bodyId || !Number.isFinite(nextValue)) {
        return;
    }

    await commitBodyTuningValues({
        renderer,
        stats,
        tuning,
        uiState,
        updates: {
            [key]: nextValue,
        },
    });
}

async function resetSelectedBodyTuning({ renderer, stats, tuning, uiState }) {
    const bodyId = uiState.selectedBodyId;

    if (!bodyId) {
        return;
    }

    setBodyTuningBusy(tuning, true);
    setBodyTuningStatus(tuning, "simulation.sandboxApplying", "Applying");

    const response = await renderer.resetBody(bodyId);

    setBodyTuningBusy(tuning, false);
    clearBodyTuningEdits(tuning, bodyId);
    syncBodyTuningControls(tuning, uiState);
    updateSelectedBodyStats(stats, uiState, tuning);
    setBodyTuningStatus(
        tuning,
        response?.ok ? "simulation.sandboxBodyReset" : "simulation.sandboxFailed",
        response?.ok ? "Body reset" : "Failed",
    );
}

async function resetSystemTuning({ renderer, stats, tuning, uiState }) {
    setBodyTuningBusy(tuning, true);
    setBodyTuningStatus(tuning, "simulation.sandboxApplying", "Applying");

    const response = await renderer.resetScenario();

    setBodyTuningBusy(tuning, false);
    if (response?.ok) {
        resetBodyTuningState(tuning);
        syncBodyTuningControls(tuning, uiState);
        updateSelectedBodyStats(stats, uiState, tuning);
    }
    setBodyTuningStatus(
        tuning,
        response?.ok ? "simulation.sandboxSystemReset" : "simulation.sandboxFailed",
        response?.ok ? "System reset" : "Failed",
    );
}

async function commitBodyTuningValues({ renderer, stats, tuning, uiState, updates }) {
    const bodyId = uiState.selectedBodyId;

    if (!bodyId) {
        return;
    }

    setBodyTuningBusy(tuning, true);
    setBodyTuningStatus(tuning, "simulation.sandboxApplying", "Applying");

    const response = await renderer.updateBodyParameters(bodyId, updates);

    setBodyTuningBusy(tuning, false);
    if (response?.ok) {
        clearBodyTuningPreview(tuning, bodyId, Object.keys(updates));
    } else {
        renderer.previewBodyParameters?.(bodyId, null);
        clearBodyTuningEdits(tuning, bodyId);
        clearBodyTuningPreview(tuning, bodyId);
    }
    syncBodyTuningControls(tuning, uiState);
    updateSelectedBodyStats(stats, uiState, tuning);
    setBodyTuningStatus(
        tuning,
        response?.ok ? "simulation.sandboxApplied" : "simulation.sandboxFailed",
        response?.ok ? "Applied" : "Failed",
    );
}

function previewSelectedBodyTuning(renderer, tuning, bodyId) {
    if (!renderer?.previewBodyParameters || !bodyId) {
        return;
    }

    renderer.previewBodyParameters(bodyId, {
        radiusM: getBodyTuningValue(tuning, bodyId, "radiusM"),
        distanceM: getBodyTuningValue(tuning, bodyId, "distanceM"),
    });
}

function setBodyTuningBusy(tuning, busy) {
    tuning.busy = busy;
    if (tuning.resetButton) {
        tuning.resetButton.disabled = busy;
    }
    if (tuning.systemResetButton) {
        tuning.systemResetButton.disabled = busy;
    }
}

function setBodyTuningStatus(tuning, key, fallback) {
    if (!tuning.status) {
        return;
    }

    tuning.status.dataset.i18n = key;
    tuning.status.textContent = window.SolarSim.format.text(key, {}, fallback);
}

function parseBodyTuningMultiplier(value, field) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
        return field.defaultMultiplier;
    }

    return Math.min(field.max, Math.max(field.min, numberValue));
}

function parseBodyTuningValue(value, field) {
    if (!field) {
        return NaN;
    }

    const normalized = String(value || "").trim().replace(",", ".");
    const numberValue = Number(normalized);

    if (!Number.isFinite(numberValue) || numberValue < field.valueMin) {
        return NaN;
    }

    return numberValue;
}

function getBodyTuningBaseline(tuning, bodyId) {
    return bodyId ? tuning.baselinesByBodyId.get(bodyId) : null;
}

function getBodyTuningMultiplier(tuning, bodyId, key) {
    const field = BODY_TUNING_FIELDS[key];
    const multipliers = bodyId ? tuning.multipliersByBodyId.get(bodyId) : null;

    return Number.isFinite(multipliers?.[key])
        ? multipliers[key]
        : field?.defaultMultiplier ?? 1;
}

function getBodyTuningValue(tuning, bodyId, key) {
    const values = bodyId ? tuning.valuesByBodyId.get(bodyId) : null;
    const baseline = getBodyTuningBaseline(tuning, bodyId);
    const storedValue = values?.[key];

    if (Number.isFinite(storedValue)) {
        return storedValue;
    }

    if (!Number.isFinite(baseline?.[key])) {
        return NaN;
    }

    return baseline[key] * getBodyTuningMultiplier(tuning, bodyId, key);
}

function setBodyTuningValue(tuning, bodyId, key, value) {
    const baseline = getBodyTuningBaseline(tuning, bodyId);
    const baseValue = baseline?.[key];
    const field = BODY_TUNING_FIELDS[key];

    if (!bodyId || !field || !Number.isFinite(value)) {
        return;
    }

    const values = tuning.valuesByBodyId.get(bodyId) || {};
    const multipliers = tuning.multipliersByBodyId.get(bodyId) || {};

    values[key] = value;
    multipliers[key] = Number.isFinite(baseValue) && baseValue > 0
        ? value / baseValue
        : field.defaultMultiplier;

    tuning.valuesByBodyId.set(bodyId, values);
    tuning.multipliersByBodyId.set(bodyId, multipliers);
}

function clearBodyTuningEdits(tuning, bodyId) {
    tuning.multipliersByBodyId.delete(bodyId);
    tuning.valuesByBodyId.delete(bodyId);
    clearBodyTuningPreview(tuning, bodyId);
}

function resetBodyTuningState(tuning) {
    tuning.baselinesByBodyId.clear();
    tuning.multipliersByBodyId.clear();
    tuning.valuesByBodyId.clear();
    tuning.scenarioEpoch = null;
    tuning.previewBodyId = null;
    tuning.previewKeys.clear();
}

function markBodyTuningPreview(tuning, bodyId, key) {
    if (tuning.previewBodyId !== bodyId) {
        tuning.previewBodyId = bodyId;
        tuning.previewKeys.clear();
    }

    tuning.previewKeys.add(key);
}

function clearBodyTuningPreview(tuning, bodyId, keys = null) {
    if (tuning.previewBodyId !== bodyId) {
        return;
    }

    if (Array.isArray(keys)) {
        keys.forEach((key) => {
            tuning.previewKeys.delete(key);
        });
    } else {
        tuning.previewKeys.clear();
    }

    if (tuning.previewKeys.size === 0) {
        tuning.previewBodyId = null;
    }
}

function syncBodyTuningFieldDisplay(tuning, bodyId, key) {
    const field = BODY_TUNING_FIELDS[key];
    const slider = Array.from(tuning.inputs).find((input) => input.dataset.bodyTune === key);
    const output = tuning.outputs.get(key);
    const valueInput = tuning.valueInputs.get(key);
    const value = getBodyTuningValue(tuning, bodyId, key);
    const multiplier = getBodyTuningMultiplier(tuning, bodyId, key);

    if (slider && field) {
        slider.value = clampBodyTuningMultiplierForSlider(multiplier, field);
    }

    if (output) {
        output.textContent = Number.isFinite(multiplier)
            ? formatBodyTuningMultiplier(multiplier)
            : "--";
        output.title = Number.isFinite(value) && field
            ? field.formatValue(value)
            : "";
    }

    if (valueInput && valueInput !== document.activeElement) {
        valueInput.value = Number.isFinite(value)
            ? formatBodyTuningRawValue(value)
            : "";
    }
}

function clampBodyTuningMultiplierForSlider(multiplier, field) {
    if (!Number.isFinite(multiplier)) {
        return field.defaultMultiplier;
    }

    return Math.min(field.max, Math.max(field.min, multiplier));
}

function formatBodyTuningMultiplier(value) {
    return `${Number(value).toFixed(2)}x`;
}

function formatBodyTuningRawValue(value) {
    const absoluteValue = Math.abs(value);

    if (!Number.isFinite(value)) {
        return "";
    }

    if ((absoluteValue > 0 && absoluteValue < 0.001) || absoluteValue >= 1_000_000) {
        return value.toExponential(6);
    }

    return Number(value.toPrecision(8)).toString();
}

function setTranslatedAttribute(element, attribute, key) {
    element.dataset.i18nAriaLabel = attribute === "aria-label" ? key : element.dataset.i18nAriaLabel;
    element.setAttribute(attribute, window.SolarSim.format.text(key, {}, element.getAttribute(attribute) || key));
}

function runSimulationCommand(command, renderer) {
    const handlers = {
        reset: () => renderer.resetScenario(),
        "step-once": () => renderer.stepOnce(),
        "toggle-playback": () => renderer.togglePlayback(),
    };

    handlers[command]?.();
}

function persistDebugToggle(store, toggleKey, checked) {
    if (!store?.setValue) {
        return;
    }

    const state = store.getState();

    store.setValue("debug", "uiToggles", {
        ...(state.debug?.uiToggles || {}),
        [toggleKey]: checked,
    });
}

function updateBodySelector(select, bodies, selectedBodyId) {
    if (!select) {
        return;
    }

    const fragment = document.createDocumentFragment();

    bodies.forEach((body) => {
        const option = document.createElement("option");

        option.value = body.id;
        option.textContent = window.SolarSim.format.bodyName(body);
        fragment.appendChild(option);
    });

    select.replaceChildren(fragment);
    select.disabled = bodies.length === 0;
    select.value = selectedBodyId || "";
}

function updatePlaybackControls(controls, state) {
    if (controls.togglePlaybackButton) {
        controls.togglePlaybackButton.textContent = state.paused
            ? window.SolarSim.format.text("simulation.resume", {}, "Resume")
            : window.SolarSim.format.text("simulation.pause", {}, "Pause");
        controls.togglePlaybackButton.setAttribute("aria-pressed", String(state.paused));
    }

    if (controls.stepButton) {
        controls.stepButton.disabled = !state.paused || state.stepRequestInFlight;
    }

    controls.speedButtons.forEach((button) => {
        const isActive = Number(button.dataset.simulationSpeed) === state.playbackStepsPerFrame;

        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function updateSelectedBodyStats(stats, uiState, tuning = null) {
    const selectedBodyId = uiState.selectedBodyId;
    const metadata = selectedBodyId ? uiState.bodiesById.get(selectedBodyId) : null;
    const snapshotBody = selectedBodyId
        ? uiState.latestSnapshot?.bodies?.find((body) => body.id === selectedBodyId)
        : null;
    const previewMassKg = getPreviewTuningStatValue(tuning, selectedBodyId, "massKg");
    const previewRadiusM = getPreviewTuningStatValue(tuning, selectedBodyId, "radiusM");
    const previewDistanceM = getPreviewTuningStatValue(tuning, selectedBodyId, "distanceM");
    const previewSpeedMS = getPreviewTuningStatValue(tuning, selectedBodyId, "speedMS");
    const previewPositionDistanceM = getPreviewBodyPositionDistance(uiState, selectedBodyId);

    setStat(stats.mass, Number.isFinite(previewMassKg)
        ? window.SolarSim.format.mass(previewMassKg)
        : metadata ? window.SolarSim.format.mass(metadata.massKg) : "--");
    setStat(stats.radius, Number.isFinite(previewRadiusM)
        ? window.SolarSim.format.distance(previewRadiusM)
        : metadata ? window.SolarSim.format.distance(metadata.radiusM) : "--");
    setStat(stats.distance, Number.isFinite(previewPositionDistanceM)
        ? window.SolarSim.format.distance(previewPositionDistanceM)
        : Number.isFinite(previewDistanceM)
            ? window.SolarSim.format.distance(previewDistanceM)
            : snapshotBody ? window.SolarSim.format.distance(window.SolarSim.format.vectorMagnitude(snapshotBody.positionM)) : "--");
    setStat(stats.velocity, Number.isFinite(previewSpeedMS)
        ? window.SolarSim.format.velocity(previewSpeedMS)
        : snapshotBody ? window.SolarSim.format.velocity(window.SolarSim.format.vectorMagnitude(snapshotBody.velocityMS)) : "--");
    updateSelectedBodyFacts(stats.factsList, metadata, snapshotBody, uiState.latestSnapshot);
}

function getPreviewBodyPositionDistance(uiState, bodyId) {
    const positionM = bodyId ? uiState.positionPreviewsByBodyId?.get(bodyId) : null;

    return Array.isArray(positionM)
        ? window.SolarSim.format.vectorMagnitude(positionM)
        : NaN;
}

function getPreviewTuningStatValue(tuning, bodyId, key) {
    const values = tuning && bodyId ? tuning.valuesByBodyId.get(bodyId) : null;

    if (tuning?.previewBodyId !== bodyId
        || !tuning.previewKeys.has(key)
        || !values
        || !Object.prototype.hasOwnProperty.call(values, key)) {
        return NaN;
    }

    return getBodyTuningValue(tuning, bodyId, key);
}

function setStat(element, value) {
    if (element) {
        element.textContent = value;
    }
}

function updateSelectedBodyFacts(list, metadata, snapshotBody, snapshot) {
    if (!list) {
        return;
    }

    const facts = createBodyFacts(metadata, snapshotBody, snapshot);
    const fragment = document.createDocumentFragment();

    if (facts.length === 0) {
        const emptyItem = document.createElement("li");

        emptyItem.textContent = "--";
        fragment.appendChild(emptyItem);
    } else {
        facts.forEach((fact) => {
            const item = document.createElement("li");

            item.textContent = fact;
            fragment.appendChild(item);
        });
    }

    list.replaceChildren(fragment);
}

function createBodyFacts(metadata, snapshotBody, snapshot) {
    if (!metadata) {
        return [];
    }

    const facts = Array.isArray(metadata.facts)
        ? metadata.facts
            .filter((fact) => typeof fact === "string" && fact.trim().length > 0)
            .map(window.SolarSim.format.metadataFact)
        : [];
    const textureCount = Object.values(metadata.visual?.textures || {}).filter(Boolean).length;

    if (metadata.parent) {
        facts.push(window.SolarSim.format.text("simulation.fact.parent", {
            parent: window.SolarSim.format.bodyName({
                id: metadata.parentId || window.SolarSim.format.bodyIdFromBodyName(metadata.parent),
                name: metadata.parent,
            }),
        }, `Parent body: ${metadata.parent}.`));
    }

    facts.push(metadata.isFixed
        ? window.SolarSim.format.text("simulation.fact.fixed", {}, "Fixed in the current backend scenario.")
        : window.SolarSim.format.text("simulation.fact.integrated", {}, "Integrated by the backend physics step."));

    if (textureCount > 0) {
        facts.push(window.SolarSim.format.text("simulation.fact.textureCount", {
            count: textureCount,
            plural: textureCount === 1 ? "" : "s",
        }, `Uses ${textureCount} renderer texture map${textureCount === 1 ? "" : "s"}.`));
    }

    if (snapshotBody) {
        const speed = window.SolarSim.format.velocity(window.SolarSim.format.vectorMagnitude(snapshotBody.velocityMS));

        facts.push(window.SolarSim.format.text("simulation.fact.currentSpeed", { speed }, `Current speed is ${speed}.`));
    }

    if (snapshot?.dtS) {
        const duration = window.SolarSim.format.duration(snapshot.dtS);

        facts.push(window.SolarSim.format.text(
            "simulation.fact.timestep",
            { duration },
            `Backend timestep is ${duration} per integration step.`,
        ));
    }

    return facts.slice(0, 6);
}
