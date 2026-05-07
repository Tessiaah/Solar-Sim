window.SolarSim = window.SolarSim || {};
window.SolarSim.settings = window.SolarSim.settings || {};

window.SolarSim.settings.createStore = function createStore(schema) {
    let state = createDefaultState(schema);

    function getState() {
        return structuredCloneSafe(state);
    }

    function getCategory(categoryKey) {
        return structuredCloneSafe(state[categoryKey]);
    }

    function setValue(categoryKey, settingKey, value) {
        if (!schema[categoryKey]) {
            throw new Error(`Unknown settings category: ${categoryKey}`);
        }

        const control = schema[categoryKey].controls.find((item) => item.key === settingKey);

        if (!control) {
            throw new Error(`Unknown setting: ${categoryKey}.${settingKey}`);
        }

        if (control.type === "readonly") {
            return;
        }

        state = {
            ...state,
            [categoryKey]: {
                ...state[categoryKey],
                [settingKey]: structuredCloneSafe(value),
            },
        };

        window.dispatchEvent(
            new CustomEvent("solar-sim:settings-changed", {
                detail: {
                    categoryKey,
                    settingKey,
                    value: structuredCloneSafe(value),
                    state: getState(),
                },
            }),
        );
    }

    function resetCategory(categoryKey) {
        if (!schema[categoryKey]) {
            throw new Error(`Unknown settings category: ${categoryKey}`);
        }

        state = {
            ...state,
            [categoryKey]: createDefaultCategoryState(schema[categoryKey]),
        };

        window.dispatchEvent(
            new CustomEvent("solar-sim:settings-reset", {
                detail: {
                    categoryKey,
                    state: getState(),
                },
            }),
        );
    }

    return {
        getCategory,
        getState,
        resetCategory,
        setValue,
    };
};

function createDefaultState(schema) {
    return Object.fromEntries(
        Object.entries(schema).map(([categoryKey, category]) => [
            categoryKey,
            createDefaultCategoryState(category),
        ]),
    );
}

function createDefaultCategoryState(category) {
    return Object.fromEntries(
        category.controls.map((control) => [
            control.key,
            structuredCloneSafe(control.defaultValue),
        ]),
    );
}

function structuredCloneSafe(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}
