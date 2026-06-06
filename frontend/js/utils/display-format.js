window.SolarSim = window.SolarSim || {};
window.SolarSim.format = window.SolarSim.format || {};

window.SolarSim.format = (function createDisplayFormatModule() {
    function text(key, values = {}, fallback = key) {
        return window.SolarSim.i18n?.instance?.t(key, values) || fallback;
    }

    function bodyName(body) {
        if (!body) {
            return "";
        }

        const bodyId = body.id || bodyIdFromBodyName(body.name);
        const translatedName = text(`bodies.${bodyId}.name`, {}, body.name || bodyId);

        return translatedName === `bodies.${bodyId}.name`
            ? body.name || bodyId
            : translatedName;
    }

    function metadataFact(factKey) {
        return text(factKey, {}, factKey);
    }

    function scenarioName(scenario) {
        const scenarioId = scenario?.id;

        if (!scenarioId || scenario?.custom) {
            return scenario?.name || "";
        }

        const key = `scenarios.${scenarioId}.name`;
        const translatedName = text(key, {}, scenario.name || scenarioId);

        return translatedName === key
            ? scenario.name || scenarioId
            : translatedName;
    }

    function scenarioDescription(scenario) {
        const scenarioId = scenario?.id;

        if (!scenarioId || scenario?.custom) {
            return scenario?.description || "";
        }

        const key = `scenarios.${scenarioId}.description`;
        const translatedDescription = text(key, {}, scenario.description || "");

        return translatedDescription === key
            ? scenario.description || ""
            : translatedDescription;
    }

    function mass(valueKg) {
        if (!Number.isFinite(valueKg)) {
            return "--";
        }

        return `${valueKg.toExponential(3)} kg`;
    }

    function distance(valueM) {
        if (!Number.isFinite(valueM)) {
            return "--";
        }

        const auM = 149_597_870_700;

        if (Math.abs(valueM) >= auM * 0.08) {
            return `${(valueM / auM).toFixed(3)} AU`;
        }

        return `${compactNumber(valueM / 1000)} km`;
    }

    function velocity(valueMS) {
        if (!Number.isFinite(valueMS)) {
            return "--";
        }

        return `${(valueMS / 1000).toFixed(2)} km/s`;
    }

    function duration(valueS) {
        if (!Number.isFinite(valueS)) {
            return "--";
        }

        if (valueS >= 3600) {
            const value = compactNumber(valueS / 3600);

            return text("common.hoursShort", { value }, `${value} h`);
        }

        if (valueS >= 60) {
            const value = compactNumber(valueS / 60);

            return text("common.minutesShort", { value }, `${value} min`);
        }

        const value = compactNumber(valueS);

        return text("common.secondsShort", { value }, `${value} s`);
    }

    function vectorMagnitude(values) {
        if (!Array.isArray(values) || values.length < 3) {
            return NaN;
        }

        return Math.hypot(values[0], values[1], values[2]);
    }

    function compactNumber(value) {
        return new Intl.NumberFormat(numberLocale(), {
            maximumFractionDigits: value >= 1000 ? 0 : 2,
        }).format(value);
    }

    function bodyIdFromBodyName(name) {
        return String(name || "").toLowerCase().replace(/\s+/g, "-");
    }

    function numberLocale() {
        return window.SolarSim.i18n?.instance?.getLanguage?.() === "pt"
            ? "pt-PT"
            : "en-US";
    }

    return {
        bodyIdFromBodyName,
        bodyName,
        compactNumber,
        distance,
        duration,
        mass,
        metadataFact,
        scenarioDescription,
        scenarioName,
        text,
        vectorMagnitude,
        velocity,
    };
})();
