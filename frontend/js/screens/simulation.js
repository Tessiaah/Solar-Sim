window.SolarSim = window.SolarSim || {};
window.SolarSim.screens = window.SolarSim.screens || {};

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
        selectedBodyId: null,
    };
    let simulationEntryToken = 0;
    let requestedScenarioId = null;

    bindSimulationControls({ controls, renderer, store });
    bindCameraSettingsControls(controls.cameraSettings, store);
    bindOrientationGizmoControls(controls.orientationGizmo, renderer);

    renderer.onBodiesChanged((payload) => {
        uiState.bodiesById = new Map(payload.bodies.map((body) => [body.id, body]));
        uiState.selectedBodyId = payload.selectedBodyId;
        updateBodySelector(controls.bodySelect, payload.bodies, payload.selectedBodyId);
        updateSelectedBodyStats(controls.stats, uiState);
    });

    renderer.onSelectionChanged((payload) => {
        uiState.selectedBodyId = payload.selectedBodyId;

        if (controls.bodySelect && controls.bodySelect.value !== payload.selectedBodyId) {
            controls.bodySelect.value = payload.selectedBodyId || "";
        }

        updateSelectedBodyStats(controls.stats, uiState);
    });

    renderer.onSnapshot((snapshot) => {
        uiState.latestSnapshot = snapshot;
        updateSelectedBodyStats(controls.stats, uiState);
    });

    renderer.onPlaybackChanged((state) => {
        updatePlaybackControls(controls, state);
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
        if (event.key !== "Escape" || !root.classList.contains("screen-active")) {
            return;
        }

        if (isSimulationEditableTarget(event.target)) {
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
        updateSelectedBodyStats(controls.stats, uiState);
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
        togglePlaybackButton: root.querySelector('[data-simulation-command="toggle-playback"]'),
        trackToggle: root.querySelector('[data-simulation-toggle="track-selected"]'),
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
        renderer.setFollowSelected(controls.trackToggle.checked);
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
            store.setValue("camera", settingKey, parseCameraSettingValue(input.value, control));
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

function runSimulationCommand(command, renderer) {
    const handlers = {
        "focus-selected": () => renderer.focusSelectedBody(),
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

function updateSelectedBodyStats(stats, uiState) {
    const selectedBodyId = uiState.selectedBodyId;
    const metadata = selectedBodyId ? uiState.bodiesById.get(selectedBodyId) : null;
    const snapshotBody = selectedBodyId
        ? uiState.latestSnapshot?.bodies?.find((body) => body.id === selectedBodyId)
        : null;

    setStat(stats.mass, metadata ? window.SolarSim.format.mass(metadata.massKg) : "--");
    setStat(stats.radius, metadata ? window.SolarSim.format.distance(metadata.radiusM) : "--");
    setStat(stats.distance, snapshotBody ? window.SolarSim.format.distance(window.SolarSim.format.vectorMagnitude(snapshotBody.positionM)) : "--");
    setStat(stats.velocity, snapshotBody ? window.SolarSim.format.velocity(window.SolarSim.format.vectorMagnitude(snapshotBody.velocityMS)) : "--");
    updateSelectedBodyFacts(stats.factsList, metadata, snapshotBody, uiState.latestSnapshot);
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
