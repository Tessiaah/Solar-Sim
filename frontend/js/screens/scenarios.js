window.SolarSim = window.SolarSim || {};
window.SolarSim.screens = window.SolarSim.screens || {};

window.SolarSim.screens.initScenariosScreen = function initScenariosScreen({ root, router }) {
    if (!root) {
        return;
    }

    const controls = collectScenarioControls(root);
    const state = {
        bodies: [],
        includeSun: true,
        router,
        scenarios: [],
        selectedBodyIds: new Set(),
        loading: false,
    };

    controls.routeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            router.goTo(button.dataset.route);
        });
    });

    controls.commandButtons.forEach((button) => {
        button.addEventListener("click", () => {
            runScenarioCommand(button.dataset.scenarioCommand, state, controls);
        });
    });

    controls.createButton?.addEventListener("click", () => {
        createAndLaunchCustomScenario(state, controls, router);
    });

    controls.includeSunToggle?.addEventListener("change", () => {
        state.includeSun = controls.includeSunToggle.checked;
        renderScenarioBodyGrid(state, controls);
        updateScenarioSummary(state, controls);
    });

    window.addEventListener("solar-sim:navigate", (event) => {
        if (event.detail?.screenName === "scenarios") {
            refreshScenarioWorkspace(state, controls);
        }
    });

    window.addEventListener("solar-sim:language-changed", () => {
        renderScenarioWorkspace(state, controls);
        window.SolarSim.i18n?.instance?.applyDocument(root);
    });
};

function collectScenarioControls(root) {
    return {
        bodyGrid: root.querySelector("[data-scenario-body-grid]"),
        commandButtons: root.querySelectorAll("[data-scenario-command]"),
        createButton: root.querySelector("[data-create-custom-scenario]"),
        centralBody: root.querySelector("[data-scenario-central-body]"),
        includeSunToggle: root.querySelector("[data-custom-scenario-include-sun]"),
        nameInput: root.querySelector("[data-custom-scenario-name]"),
        routeButtons: root.querySelectorAll("[data-route]"),
        scenarioList: root.querySelector("[data-scenario-list]"),
        selectedCount: root.querySelector("[data-scenario-selected-count]"),
        status: root.querySelector("[data-scenario-status]"),
    };
}

async function refreshScenarioWorkspace(state, controls) {
    if (state.loading) {
        return;
    }

    state.loading = true;
    setScenarioStatus(controls, window.SolarSim.format.text("scenarios.status.loading", {}, "Loading..."));
    setScenarioControlsDisabled(controls, true);

    try {
        const [bodyResponse, scenarioResponse] = await Promise.all([
            window.SolarSim.backend.simulation.listScenarioBodies(),
            window.SolarSim.backend.simulation.listScenarios(),
        ]);

        state.bodies = Array.isArray(bodyResponse?.bodies) ? bodyResponse.bodies : [];
        state.scenarios = Array.isArray(scenarioResponse?.scenarios) ? scenarioResponse.scenarios : [];
        initializeDefaultScenarioSelection(state);
        setScenarioStatus(controls, "");
    } catch (error) {
        console.info("Scenario workspace refresh failed.", error);
        setScenarioStatus(
            controls,
            window.SolarSim.format.text("scenarios.status.loadFailed", {}, "Could not load scenarios."),
            "error",
        );
    } finally {
        state.loading = false;
        setScenarioControlsDisabled(controls, false);
        renderScenarioWorkspace(state, controls);
    }
}

function initializeDefaultScenarioSelection(state) {
    if (state.selectedBodyIds.size > 0 || state.bodies.length === 0) {
        return;
    }

    const earth = state.bodies.find((body) => body.id === "earth");
    const defaultBody = earth || state.bodies[0];

    if (defaultBody?.id) {
        state.selectedBodyIds.add(defaultBody.id);
    }
}

function renderScenarioWorkspace(state, controls) {
    renderScenarioList(state, controls);
    renderScenarioBodyGrid(state, controls);
    updateScenarioSummary(state, controls);
}

function renderScenarioList(state, controls) {
    if (!controls.scenarioList) {
        return;
    }

    const fragment = document.createDocumentFragment();

    state.scenarios.forEach((scenario) => {
        fragment.append(createScenarioListItem(scenario, state.router));
    });

    if (state.scenarios.length === 0) {
        const empty = document.createElement("p");

        empty.className = "scenario-status";
        empty.textContent = window.SolarSim.format.text("scenarios.status.noScenarios", {}, "No scenarios available.");
        fragment.append(empty);
    }

    controls.scenarioList.replaceChildren(fragment);
}

function createScenarioListItem(scenario, router) {
    const item = document.createElement("article");
    const title = document.createElement("h3");
    const description = document.createElement("p");
    const startButton = document.createElement("button");

    item.className = "scenario-list-item";
    title.textContent = window.SolarSim.format.scenarioName(scenario);
    description.textContent = window.SolarSim.format.scenarioDescription(scenario);
    startButton.type = "button";
    startButton.className = "scenario-start-button";
    startButton.textContent = window.SolarSim.format.text("scenarios.start", {}, "Start");
    startButton.addEventListener("click", () => {
        launchScenario(scenario.id, router);
    });

    item.append(title, description, startButton);
    return item;
}

function renderScenarioBodyGrid(state, controls) {
    if (!controls.bodyGrid) {
        return;
    }

    const fragment = document.createDocumentFragment();

    state.bodies.forEach((body) => {
        fragment.append(createScenarioBodyOption(body, state, controls));
    });

    controls.bodyGrid.replaceChildren(fragment);
}

function createScenarioBodyOption(body, state, controls) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const swatch = document.createElement("span");
    const text = document.createElement("span");
    const name = document.createElement("span");
    const meta = document.createElement("span");
    const isSelected = state.selectedBodyIds.has(body.id);

    label.className = "scenario-body-option";
    label.classList.toggle("is-selected", isSelected);
    input.type = "checkbox";
    input.value = body.id;
    input.checked = isSelected;
    input.addEventListener("change", () => {
        setScenarioBodySelected(state, body.id, input.checked);
        updateScenarioBodySelection(label, input.checked);
        updateScenarioSummary(state, controls);
    });

    swatch.className = "scenario-body-swatch";
    swatch.style.backgroundColor = body.color || body.visual?.baseColor || "#ffffff";
    text.className = "scenario-body-text";
    name.className = "scenario-body-name";
    name.textContent = window.SolarSim.format.bodyName(body);
    meta.className = "scenario-body-meta";
    meta.textContent = createScenarioBodyMeta(body, state.includeSun);

    text.append(name, meta);
    label.append(input, swatch, text);
    return label;
}

function createScenarioBodyMeta(body, includeSun) {
    const mass = window.SolarSim.format.mass(body.massKg);

    if (!includeSun) {
        const radius = window.SolarSim.format.distance(body.radiusM);

        return window.SolarSim.format.text(
            "scenarios.bodyMetaSunless",
            { radius, mass },
            `${radius} | ${mass}`,
        );
    }

    const orbitDistance = body.orbit?.semiMajorAxisM;
    const distance = Number.isFinite(orbitDistance)
        ? window.SolarSim.format.distance(orbitDistance)
        : "--";

    return window.SolarSim.format.text(
        "scenarios.bodyMeta",
        { distance, mass },
        `${distance} | ${mass}`,
    );
}

function setScenarioBodySelected(state, bodyId, selected) {
    if (!bodyId) {
        return;
    }

    if (selected) {
        state.selectedBodyIds.add(bodyId);
        return;
    }

    state.selectedBodyIds.delete(bodyId);
}

function updateScenarioBodySelection(label, selected) {
    label.classList.toggle("is-selected", selected);
}

function updateScenarioSummary(state, controls) {
    if (!controls.selectedCount) {
        return;
    }

    const count = state.selectedBodyIds.size;
    const includeSun = controls.includeSunToggle?.checked ?? state.includeSun;

    state.includeSun = includeSun;

    controls.selectedCount.textContent = window.SolarSim.format.text(
        "scenarios.selectedCount",
        { count },
        String(count),
    );

    if (controls.centralBody) {
        controls.centralBody.textContent = includeSun
            ? window.SolarSim.format.bodyName({ id: "sun", name: "Sun" })
            : window.SolarSim.format.text("scenarios.none", {}, "None");
    }

    if (controls.createButton) {
        controls.createButton.disabled = state.loading || count === 0;
    }
}

function runScenarioCommand(command, state, controls) {
    const handlers = {
        clear: () => {
            state.selectedBodyIds.clear();
            renderScenarioBodyGrid(state, controls);
            updateScenarioSummary(state, controls);
        },
        "select-all": () => {
            state.bodies.forEach((body) => {
                if (body.id) {
                    state.selectedBodyIds.add(body.id);
                }
            });
            renderScenarioBodyGrid(state, controls);
            updateScenarioSummary(state, controls);
        },
    };

    handlers[command]?.();
}

async function createAndLaunchCustomScenario(state, controls, router) {
    const bodyIds = Array.from(state.selectedBodyIds);

    if (bodyIds.length === 0) {
        setScenarioStatus(
            controls,
            window.SolarSim.format.text("scenarios.status.noSelection", {}, "Select at least one planet."),
            "error",
        );
        return;
    }

    setScenarioControlsDisabled(controls, true);
    setScenarioStatus(controls, window.SolarSim.format.text("scenarios.status.creating", {}, "Creating..."));

    try {
        const response = await window.SolarSim.backend.simulation.createCustomScenario({
            bodyIds,
            includeSun: controls.includeSunToggle?.checked ?? state.includeSun,
            name: controls.nameInput?.value || "",
        });

        if (!response?.ok || !response.scenarioId) {
            setScenarioStatus(
                controls,
                response?.reason || window.SolarSim.format.text("scenarios.status.createFailed", {}, "Could not create scenario."),
                "error",
            );
            return;
        }

        if (controls.nameInput) {
            controls.nameInput.value = "";
        }

        setScenarioStatus(controls, window.SolarSim.format.text("scenarios.status.created", {}, "Scenario created."), "ok");
        launchScenario(response.scenarioId, router);
    } catch (error) {
        console.info("Custom scenario creation failed.", error);
        setScenarioStatus(
            controls,
            window.SolarSim.format.text("scenarios.status.createFailed", {}, "Could not create scenario."),
            "error",
        );
    } finally {
        setScenarioControlsDisabled(controls, false);
        updateScenarioSummary(state, controls);
    }
}

function launchScenario(scenarioId, router) {
    if (!scenarioId) {
        return;
    }

    window.dispatchEvent(
        new CustomEvent("solar-sim:launch-scenario", {
            detail: { scenarioId },
        }),
    );

    if (router) {
        router.goTo("simulation");
        return;
    }

    window.dispatchEvent(
        new CustomEvent("solar-sim:navigate-request", {
            detail: { screenName: "simulation" },
        }),
    );
}

function setScenarioStatus(controls, message, tone = "") {
    if (!controls.status) {
        return;
    }

    controls.status.textContent = message;
    controls.status.dataset.tone = tone;
}

function setScenarioControlsDisabled(controls, disabled) {
    controls.commandButtons.forEach((button) => {
        button.disabled = disabled;
    });

    if (controls.includeSunToggle) {
        controls.includeSunToggle.disabled = disabled;
    }

    if (controls.nameInput) {
        controls.nameInput.disabled = disabled;
    }

    if (controls.createButton) {
        controls.createButton.disabled = disabled;
    }
}
