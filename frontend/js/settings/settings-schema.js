window.SolarSim = window.SolarSim || {};
window.SolarSim.settings = window.SolarSim.settings || {};

window.SolarSim.settings.schema = {
    interface: {
        label: "Interface",
        summary: "Language and application text.",
        description: "Change how the interface is displayed.",
        controls: [
            {
                key: "language",
                label: "Language",
                type: "select",
                defaultValue: "en",
                owner: "interface",
                description: "Controls visible application text.",
                options: [
                    { value: "en", label: "English" },
                    { value: "pt", label: "Portuguese" },
                ],
            },
        ],
    },
    graphics: {
        label: "Graphics",
        summary: "Renderer, display, and frame pacing.",
        description: "Tune the renderer, visual detail, and frame pacing.",
        controls: [
            {
                key: "resolution",
                label: "Resolution",
                type: "select",
                defaultValue: "1920x1080",
                owner: "renderer",
                options: [
                    { value: "1280x720", label: "1280x720", description: "Performance preset" },
                    { value: "1920x1080", label: "1920x1080", description: "Default" },
                    { value: "2560x1440", label: "2560x1440", description: "2K" },
                ],
            },
            {
                key: "displayMode",
                label: "Display mode",
                type: "select",
                defaultValue: "windowed",
                owner: "renderer",
                options: [
                    { value: "windowed", label: "Windowed" },
                    { value: "borderlessFullscreen", label: "Borderless fullscreen" },
                    { value: "fullscreen", label: "Fullscreen" },
                ],
            },
            {
                key: "fpsLimit",
                label: "FPS limit",
                type: "select",
                defaultValue: "60",
                owner: "renderer",
                options: [
                    { value: "30", label: "30" },
                    { value: "60", label: "60" },
                    { value: "120", label: "120" },
                    { value: "unlimited", label: "Unlimited" },
                ],
            },
            {
                key: "skyboxQuality",
                label: "Skybox detail",
                type: "select",
                defaultValue: "full",
                owner: "renderer",
                description: "Controls starfield and deep-space backdrop density.",
                options: [
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "full", label: "Full" },
                ],
                mapsTo: {
                    low: { backdropDetail: "low" },
                    medium: { backdropDetail: "medium" },
                    full: { backdropDetail: "full" },
                },
            },
            {
                key: "sphereQuality",
                label: "Sphere rendering",
                type: "select",
                defaultValue: "textured",
                owner: "renderer",
                description: "Controls planet materials and sphere mesh detail.",
                options: [
                    { value: "noTexture", label: "No texture" },
                    { value: "basicColor", label: "Basic color" },
                    { value: "textured", label: "Textured" },
                ],
                mapsTo: {
                    noTexture: {
                        materialMode: "noTexture",
                        sphereGeometryDetail: 16,
                    },
                    basicColor: {
                        materialMode: "basicColor",
                        sphereGeometryDetail: 24,
                    },
                    textured: {
                        materialMode: "textured",
                        sphereGeometryDetail: 32,
                    },
                },
            },
            {
                key: "lightingQuality",
                label: "Lighting",
                type: "select",
                defaultValue: "medium",
                owner: "renderer",
                description: "Controls scene light balance and fill lighting.",
                options: [
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                ],
                mapsTo: {
                    low: {
                        ambientIntensity: 1.05,
                        primaryIntensity: 1.45,
                        rimIntensity: 0.0,
                    },
                    medium: {
                        ambientIntensity: 0.82,
                        primaryIntensity: 2.8,
                        rimIntensity: 0.18,
                    },
                    high: {
                        ambientIntensity: 0.58,
                        primaryIntensity: 3.4,
                        rimIntensity: 0.34,
                    },
                },
            },
        ],
    },
    simulation: {
        label: "Simulation",
        summary: "Backend-owned physics configuration.",
        description: "Inspect backend simulation controls and visual simulation aids.",
        controls: [
            {
                key: "physicsIntegrator",
                label: "Physics integrator",
                type: "select",
                defaultValue: "velocityVerlet",
                owner: "python",
                options: [
                    { value: "velocityVerlet", label: "Velocity Verlet" },
                ],
            },
            {
                key: "trailSystem",
                label: "Trail system",
                type: "select",
                defaultValue: "medium",
                owner: "renderer",
                description: "Controls visual trail retention when body trails are enabled.",
                options: [
                    { value: "short", label: "Short" },
                    { value: "medium", label: "Medium" },
                    { value: "long", label: "Long" },
                    { value: "infinite", label: "Infinite" },
                ],
            },
        ],
    },
    camera: {
        label: "Camera",
        summary: "Mouse input and camera distance limits.",
        description: "Mouse speed and camera configuration.",
        controls: [
            {
                key: "navigationMode",
                label: "Navigation mode",
                type: "select",
                defaultValue: "fly",
                owner: "camera",
                description: "Chooses the active viewport navigation style.",
                options: [
                    { value: "fly", label: "WASD" },
                    { value: "orbit", label: "Blender" },
                ],
            },
            {
                key: "moveSpeed",
                label: "Movement speed",
                type: "range",
                defaultValue: 135,
                owner: "camera",
                min: 20,
                max: 420,
                step: 5,
            },
            {
                key: "mouseSensitivity",
                label: "Mouse sensitivity",
                type: "range",
                defaultValue: 1,
                owner: "camera",
                min: 0.1,
                max: 3,
                step: 0.1,
            },
            {
                key: "minZoomDistance",
                label: "Minimum zoom distance",
                type: "range",
                defaultValue: 5,
                owner: "camera",
                min: 0.5,
                max: 100,
                step: 0.5,
            },
            {
                key: "maxZoomDistance",
                label: "Maximum zoom distance",
                type: "range",
                defaultValue: 12000,
                owner: "camera",
                min: 1000,
                max: 25000,
                step: 250,
            },
        ],
    },
    debug: {
        label: "Debug",
        summary: "Labels, vectors, overlays, energy, and momentum diagnostics.",
        description: "Choose which diagnostics and visual helpers are visible while simulating.",
        controls: [
            {
                key: "uiToggles",
                label: "UI toggles",
                type: "booleanGroup",
                defaultValue: {
                    showLabels: true,
                    showOrbitLines: false,
                    showTrails: false,
                    showVelocityVectors: false,
                    showAccelerationVectors: false,
                    showBarycenterMarker: false,
                },
                owner: "renderer",
                options: [
                    { value: "showLabels", label: "Show labels" },
                    { value: "showOrbitLines", label: "Orbit lines" },
                    { value: "showTrails", label: "Body trails" },
                    { value: "showVelocityVectors", label: "Velocity vectors" },
                    { value: "showAccelerationVectors", label: "Acceleration vectors" },
                    { value: "showBarycenterMarker", label: "Barycenter marker" },
                ],
            },
            {
                key: "performanceOverlay",
                label: "Performance overlay",
                type: "booleanGroup",
                defaultValue: {
                    fpsCounter: false,
                    frameTimeGraph: false,
                    simulationStepTime: false,
                },
                owner: "renderer",
                options: [
                    { value: "fpsCounter", label: "FPS counter" },
                    { value: "frameTimeGraph", label: "Frame time graph" },
                    { value: "simulationStepTime", label: "Simulation step time" },
                ],
            },
            {
                key: "showEnergyGraph",
                label: "Energy tracking",
                type: "boolean",
                defaultValue: false,
                owner: "python",
                description: "Shows how steadily the simulation conserves total orbital energy over time.",
            },
            {
                key: "momentumCheck",
                label: "Momentum display",
                type: "boolean",
                defaultValue: false,
                owner: "python",
                description: "Shows the current total system momentum as an informational diagnostic.",
            },
        ],
    },
};

window.SolarSim.settings.getControlProfile = function getControlProfile(categoryKey, settingKey, value) {
    const control = window.SolarSim.settings.schema?.[categoryKey]?.controls
        ?.find((item) => item.key === settingKey);

    return control?.mapsTo?.[value] || null;
};
