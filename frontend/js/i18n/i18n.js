window.SolarSim = window.SolarSim || {};
window.SolarSim.i18n = window.SolarSim.i18n || {};

window.SolarSim.i18n.createI18n = function createI18n({
    defaultLanguage = "en",
    translations,
}) {
    const languageCodes = Object.keys(translations);
    const listeners = new Set();
    let language = languageCodes.includes(defaultLanguage) ? defaultLanguage : "en";

    function t(key, values = {}) {
        const template = translations[language]?.[key]
            ?? translations.en?.[key]
            ?? key;

        return interpolate(template, values);
    }

    function setLanguage(nextLanguage) {
        const safeLanguage = languageCodes.includes(nextLanguage) ? nextLanguage : "en";

        if (language === safeLanguage) {
            applyDocument();
            return;
        }

        language = safeLanguage;
        applyDocument();
        window.dispatchEvent(
            new CustomEvent("solar-sim:language-changed", {
                detail: {
                    language,
                    translate: t,
                },
            }),
        );
        listeners.forEach((listener) => listener(language));
    }

    function getLanguage() {
        return language;
    }

    function applyDocument(root = document) {
        document.documentElement.lang = language === "pt" ? "pt-PT" : "en";

        root.querySelectorAll("[data-i18n]").forEach((element) => {
            element.textContent = t(element.dataset.i18n);
        });

        root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
            element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
        });

        root.querySelectorAll("[data-i18n-title]").forEach((element) => {
            element.setAttribute("title", t(element.dataset.i18nTitle));
        });
    }

    function onChange(listener) {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    }

    return {
        applyDocument,
        getLanguage,
        onChange,
        setLanguage,
        t,
    };
};

function interpolate(template, values) {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
    ));
}
