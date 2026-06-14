window.SolarSim = window.SolarSim || {};
window.SolarSim.screens = window.SolarSim.screens || {};

window.SolarSim.screens.initSettingsScreen = function initSettingsScreen({ root, router, store, schema }) {
    if (!root || !store || !schema) {
        return;
    }

    const categoryNav = root.querySelector("#settings-category-nav");
    const form = root.querySelector("#settings-form");
    const routeButtons = root.querySelectorAll("[data-route]");
    const backButton = root.querySelector(".settings-back-button");
    let activeCategory = "graphics";

    routeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            router.goTo(button.dataset.route);
        });
    });

    window.addEventListener("keydown", (event) => {
        if (!isEscapeKey(event) || !isSettingsScreenActive(root, router)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        router.goTo(getSettingsBackRoute(backButton));
    }, true);

    renderCategoryNav(categoryNav, schema, activeCategory, setActiveCategory);

    renderSettingsForm(form, schema, store);
    showActiveSection(form, activeCategory);

    window.SolarSim.settings.setMomentumStatus = function setMomentumStatus({ magnitude }) {
        const status = root.querySelector("[data-momentum-status]");

        if (!status) {
            return;
        }

        const hasMagnitude = magnitude !== undefined && magnitude !== null && magnitude !== "";

        status.classList.toggle("is-visible", hasMagnitude);
        status.textContent = hasMagnitude
            ? window.SolarSim.format.text(
                "settings.momentumStatus",
                { magnitude },
                `Current total system momentum: ${magnitude}`,
            )
            : "";
    };

    function setActiveCategory(categoryKey) {
        activeCategory = categoryKey;
        renderCategoryNav(categoryNav, schema, activeCategory, setActiveCategory);
        showActiveSection(form, activeCategory);
    }

    window.addEventListener("solar-sim:language-changed", () => {
        renderCategoryNav(categoryNav, schema, activeCategory, setActiveCategory);
        renderSettingsForm(form, schema, store);
        showActiveSection(form, activeCategory);
    });

    window.addEventListener("solar-sim:settings-changed", () => {
        syncSettingsForm(form, schema, store);
    });

    window.addEventListener("solar-sim:settings-reset", () => {
        syncSettingsForm(form, schema, store);
    });

    window.addEventListener("solar-sim:navigate", (event) => {
        if (event.detail?.screenName !== "settings" || !backButton) {
            return;
        }

        backButton.dataset.route = getSettingsReturnRoute(event.detail.previousScreen);
    });
};

function renderCategoryNav(container, schema, activeCategory, onSelect) {
    container.replaceChildren(
        ...Object.entries(schema).map(([categoryKey, category]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "settings-category-button";
            button.classList.toggle("is-active", categoryKey === activeCategory);
            button.dataset.category = categoryKey;
            button.innerHTML = `
                <span>${translateCategory(categoryKey, category, "label")}</span>
                <span>${translateCategory(categoryKey, category, "summary")}</span>
            `;
            button.addEventListener("click", () => onSelect(categoryKey));
            return button;
        }),
    );
}

function renderSettingsForm(form, schema, store) {
    const sections = Object.entries(schema).map(([categoryKey, category]) => {
        const section = document.createElement("section");
        section.className = "settings-section";
        section.dataset.categorySection = categoryKey;

        const header = document.createElement("div");
        header.className = "settings-section-header";
        header.innerHTML = `
            <h2>${translateCategory(categoryKey, category, "label")}</h2>
            <p>${translateCategory(categoryKey, category, "description")}</p>
        `;

        const grid = document.createElement("div");
        grid.className = "settings-grid";

        category.controls.forEach((control) => {
            grid.append(createControl(categoryKey, control, store));
        });

        section.append(header, grid);

        if (categoryKey === "debug") {
            const momentumStatus = document.createElement("p");
            momentumStatus.className = "settings-status";
            momentumStatus.dataset.momentumStatus = "true";
            section.append(momentumStatus);
        }

        return section;
    });

    form.replaceChildren(...sections);
    syncSettingsForm(form, schema, store);
}

function createControl(categoryKey, control, store) {
    const wrapper = document.createElement("fieldset");
    const currentValue = store.getCategory(categoryKey)[control.key];

    wrapper.className = "setting-control";
    wrapper.dataset.setting = `${categoryKey}.${control.key}`;
    wrapper.dataset.readonly = String(control.type === "readonly");

    const title = document.createElement("legend");
    const label = document.createElement("span");
    const owner = document.createElement("span");

    title.className = "setting-label-row";
    label.className = "setting-title";
    label.textContent = translateControl(categoryKey, control, "label");
    owner.className = "setting-owner";
    owner.textContent = translateOwner(control.owner);
    title.append(label, owner);
    wrapper.append(title);

    if (control.description) {
        const description = document.createElement("p");
        description.className = "setting-description";
        description.textContent = translateControl(categoryKey, control, "description");
        wrapper.append(description);
    }

    wrapper.append(createInput(categoryKey, control, currentValue, store));

    return wrapper;
}

function createInput(categoryKey, control, currentValue, store) {
    if (control.type === "select") {
        return createSegmentedControl(categoryKey, control, currentValue, store);
    }

    if (control.type === "boolean") {
        return createBooleanControl(categoryKey, control, currentValue, store);
    }

    if (control.type === "booleanGroup") {
        return createBooleanGroup(categoryKey, control, currentValue, store);
    }

    if (control.type === "range") {
        return createRangeControl(categoryKey, control, currentValue, store);
    }

    if (control.type === "number") {
        return createNumberControl(categoryKey, control, currentValue, store);
    }

    return createReadonlyControl(currentValue);
}

function createSegmentedControl(categoryKey, control, currentValue, store) {
    const group = document.createElement("div");
    group.className = "segmented-control";

    control.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = translateOption(categoryKey, control, option);
        button.classList.toggle("is-selected", option.value === currentValue);
        button.addEventListener("click", () => {
            store.setValue(categoryKey, control.key, option.value);
        });
        button.dataset.value = option.value;
        group.append(button);
    });

    return group;
}

function createBooleanControl(categoryKey, control, currentValue, store) {
    const row = document.createElement("div");
    row.className = "toggle-row";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = translateBooleanState(currentValue);
    button.setAttribute("aria-pressed", String(currentValue));
    button.addEventListener("click", () => {
        const nextValue = button.getAttribute("aria-pressed") !== "true";
        store.setValue(categoryKey, control.key, nextValue);
        button.setAttribute("aria-pressed", String(nextValue));
        button.textContent = translateBooleanState(nextValue);
    });

    row.append(button);
    return row;
}

function createBooleanGroup(categoryKey, control, currentValue, store) {
    const row = document.createElement("div");
    row.className = "toggle-row toggle-grid";

    control.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = translateOption(categoryKey, control, option);
        button.dataset.value = option.value;
        button.setAttribute("aria-pressed", String(Boolean(currentValue[option.value])));
        button.addEventListener("click", () => {
            const nextGroupValue = {
                ...store.getCategory(categoryKey)[control.key],
                [option.value]: button.getAttribute("aria-pressed") !== "true",
            };

            store.setValue(categoryKey, control.key, nextGroupValue);
        });
        row.append(button);
    });

    return row;
}

function createRangeControl(categoryKey, control, currentValue, store) {
    const row = document.createElement("div");
    const input = document.createElement("input");
    const value = document.createElement("output");

    row.className = "range-row";
    input.type = "range";
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = currentValue;
    value.className = "range-value";
    value.textContent = formatSettingNumber(currentValue, control);

    input.addEventListener("input", () => {
        const nextValue = parseSettingNumber(input.value, control);

        input.value = nextValue;
        value.textContent = formatSettingNumber(nextValue, control);
        store.setValue(categoryKey, control.key, nextValue);
    });

    row.append(input, value);
    return row;
}

function createNumberControl(categoryKey, control, currentValue, store) {
    const row = document.createElement("label");
    const input = document.createElement("input");

    row.className = "number-row";
    input.type = "number";
    input.min = control.min;
    input.step = control.step;
    input.value = currentValue;
    input.addEventListener("change", () => {
        const nextValue = parseSettingNumber(input.value, control);

        input.value = nextValue;
        store.setValue(categoryKey, control.key, nextValue);
    });

    row.append(document.createElement("span"), input);
    return row;
}

function createReadonlyControl(currentValue) {
    const value = document.createElement("div");
    value.className = "readonly-value";
    value.textContent = translateReadonlyValue(currentValue);
    return value;
}

function updateSelectedButtons(group, selectedValue) {
    group.querySelectorAll("button").forEach((button) => {
        button.classList.toggle("is-selected", button.dataset.value === selectedValue);
    });
}

function syncSettingsForm(form, schema, store) {
    if (!form || !schema || !store?.getCategory) {
        return;
    }

    Object.entries(schema).forEach(([categoryKey, category]) => {
        const categoryState = store.getCategory(categoryKey);

        category.controls.forEach((control) => {
            const wrapper = findSettingWrapper(form, categoryKey, control.key);

            if (!wrapper) {
                return;
            }

            syncSettingControl(wrapper, control, categoryState?.[control.key]);
        });
    });
}

function findSettingWrapper(form, categoryKey, settingKey) {
    const settingPath = `${categoryKey}.${settingKey}`;

    return Array.from(form.querySelectorAll("[data-setting]"))
        .find((wrapper) => wrapper.dataset.setting === settingPath) || null;
}

function syncSettingControl(wrapper, control, currentValue) {
    if (control.type === "select") {
        updateSelectedButtons(wrapper, currentValue);
        return;
    }

    if (control.type === "boolean") {
        const button = wrapper.querySelector("button");

        if (!button) {
            return;
        }

        button.setAttribute("aria-pressed", String(Boolean(currentValue)));
        button.textContent = translateBooleanState(Boolean(currentValue));
        return;
    }

    if (control.type === "booleanGroup") {
        wrapper.querySelectorAll("button[data-value]").forEach((button) => {
            button.setAttribute("aria-pressed", String(Boolean(currentValue?.[button.dataset.value])));
        });
        return;
    }

    if (control.type === "range") {
        const input = wrapper.querySelector('input[type="range"]');
        const output = wrapper.querySelector("output");
        const value = parseSettingNumber(currentValue, control);

        if (input) {
            input.value = value;
        }

        if (output) {
            output.textContent = formatSettingNumber(value, control);
        }
        return;
    }

    if (control.type === "number") {
        const input = wrapper.querySelector('input[type="number"]');

        if (input) {
            input.value = parseSettingNumber(currentValue, control);
        }
        return;
    }

    if (control.type === "readonly") {
        const value = wrapper.querySelector(".readonly-value");

        if (value) {
            value.textContent = translateReadonlyValue(currentValue);
        }
    }
}

function parseSettingNumber(rawValue, control) {
    const fallback = Number(control.defaultValue) || 0;
    const numberValue = Number(rawValue);
    const safeValue = Number.isFinite(numberValue) ? numberValue : fallback;
    const min = Number.isFinite(control.min) ? control.min : safeValue;
    const max = Number.isFinite(control.max) ? control.max : safeValue;

    return Math.min(max, Math.max(min, safeValue));
}

function formatSettingNumber(value, control) {
    const numberValue = Number(value);
    const safeValue = Number.isFinite(numberValue) ? numberValue : Number(control.defaultValue) || 0;
    const step = Number(control.step);
    const fractionDigits = step > 0 && step < 1
        ? String(step).split(".")[1]?.length || 0
        : 0;

    return safeValue.toFixed(fractionDigits);
}

function showActiveSection(form, categoryKey) {
    form.querySelectorAll("[data-category-section]").forEach((section) => {
        section.classList.toggle("is-active", section.dataset.categorySection === categoryKey);
    });
}

function getSettingsBackRoute(backButton) {
    return backButton?.dataset.route || "welcome";
}

function getSettingsReturnRoute(previousScreen) {
    return previousScreen && previousScreen !== "settings"
        ? previousScreen
        : "welcome";
}

function isEscapeKey(event) {
    return event.key === "Escape"
        || event.key === "Esc"
        || event.code === "Escape"
        || event.keyCode === 27;
}

function isSettingsScreenActive(root, router) {
    return root.classList.contains("screen-active")
        || router?.getCurrentScreen?.() === "settings";
}

function translateCategory(categoryKey, category, fieldName) {
    return translateByKeys([
        category[`${fieldName}Key`],
        `settings.category.${categoryKey}.${fieldName}`,
    ], category[fieldName]);
}

function translateControl(categoryKey, control, fieldName) {
    return translateByKeys([
        control[`${fieldName}Key`],
        `settings.${categoryKey}.${control.key}.${fieldName}`,
    ], control[fieldName]);
}

function translateOption(categoryKey, control, option) {
    return translateByKeys([
        option.labelKey,
        `settings.${categoryKey}.${control.key}.${option.value}`,
        getSharedOptionKey(control.key, option.value),
    ], option.label);
}

function getSharedOptionKey(controlKey, optionValue) {
    if (controlKey === "skyboxQuality" || controlKey === "lightingQuality") {
        return `settings.quality.${optionValue}`;
    }

    if (controlKey === "sphereQuality") {
        return `settings.sphereQuality.${optionValue}`;
    }

    if (controlKey === "trailSystem") {
        return `settings.trail.${optionValue}`;
    }

    if (controlKey === "language") {
        return `settings.language.${optionValue}`;
    }

    if (controlKey === "uiToggles") {
        return `settings.debug.${optionValue}`;
    }

    if (controlKey === "performanceOverlay") {
        return `settings.debug.${optionValue}`;
    }

    return null;
}

function translateOwner(owner) {
    return translateByKeys([`settings.owner.${owner}`], owner);
}

function translateBooleanState(value) {
    return translateByKeys([value ? "common.on" : "common.off"], value ? "On" : "Off");
}

function translateReadonlyValue(value) {
    return value;
}

function translateByKeys(keys, fallback) {
    const i18n = window.SolarSim.i18n?.instance;

    if (!i18n) {
        return fallback || "";
    }

    for (const key of keys.filter(Boolean)) {
        const translated = i18n.t(key);

        if (translated !== key) {
            return translated;
        }
    }

    return fallback || "";
}
