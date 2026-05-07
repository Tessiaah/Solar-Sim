window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

(function initializeSimulationRendererModule() {
window.SolarSim.rendering.createSimulationRenderer = function createSimulationRenderer({
    container,
    timeReadout,
    store,
}) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
    const materialFactory = window.SolarSim.rendering.createBodyMaterialFactory();
    const bodyMeshes = new Map();
    const renderer = new THREE.WebGLRenderer({
        antialias: store?.getState().graphics.antiAliasing ?? true,
    });
    const scale = createDisplayScale();
    const bodyMetadata = new Map();

    let animationFrame = null;
    let running = false;
    let stepsPerFrame = 4;
    let hasSnapshot = false;
    let currentGeometryDetail = 32;

    setupScene(scene, camera);
    container.appendChild(renderer.domElement);

    function start() {
        if (running) {
            return;
        }

        running = true;
        resize();
        loadCurrentSnapshot().finally(() => {
            if (running && !animationFrame) {
                animationFrame = requestAnimationFrame(frame);
            }
        });
    }

    function stop() {
        running = false;

        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    }

    async function loadCurrentSnapshot() {
        try {
            await ensureScenarioMetadata();
            const snapshot = await window.SolarSim.backend.simulation.getSnapshot();

            if (snapshot && running) {
                renderSnapshot(snapshot);
            }
        } catch (error) {
            console.info("Simulation snapshot request failed.", error);
        }
    }

    async function loadScenario(scenarioId) {
        try {
            const response = await window.SolarSim.backend.simulation.loadScenario(scenarioId);
            applyScenarioMetadata(response?.scenario);
            const snapshot = response?.snapshot;

            if (snapshot) {
                renderSnapshot(snapshot);
            }

            return response;
        } catch (error) {
            console.info("Scenario load failed.", error);
            return { ok: false, reason: String(error) };
        }
    }

    async function frame() {
        if (!running) {
            return;
        }

        try {
            const response = await window.SolarSim.backend.simulation.step(stepsPerFrame);
            const snapshot = response?.snapshot;

            if (snapshot) {
                renderSnapshot(snapshot);
            }
        } catch (error) {
            console.info("Simulation step failed.", error);
        }

        animationFrame = requestAnimationFrame(frame);
    }

    function renderSnapshot(snapshot) {
        syncBodyMeshes(snapshot.bodies);
        updateBodyPositions(snapshot.bodies);
        updateReadouts(snapshot);
        renderer.render(scene, camera);
        hasSnapshot = true;
    }

    function syncBodyMeshes(bodies) {
        const bodyIds = new Set(bodies.map((body) => body.id));
        const geometryDetail = getSphereGeometryDetail();

        currentGeometryDetail = geometryDetail;

        bodyMeshes.forEach((mesh, bodyId) => {
            if (!bodyIds.has(bodyId)) {
                scene.remove(mesh);
                mesh.geometry.dispose();
                disposeMaterial(mesh.material);
                bodyMeshes.delete(bodyId);
            }
        });

        bodies.forEach((body) => {
            if (!bodyMeshes.has(body.id)) {
                const metadata = getBodyMetadata(body.id);
                const mesh = createBodyMesh(metadata, materialFactory, scale, geometryDetail);
                bodyMeshes.set(body.id, mesh);
                scene.add(mesh);
                return;
            }
        });
    }

    function updateBodyPositions(bodies) {
        bodies.forEach((body) => {
            const mesh = bodyMeshes.get(body.id);

            if (!mesh) {
                return;
            }

            const [x, y, z] = body.positionM;
            mesh.position.set(
                x * scale.position,
                z * scale.position,
                y * scale.position,
            );
        });
    }

    function updateReadouts(snapshot) {
        if (timeReadout) {
            timeReadout.textContent = `${(snapshot.elapsedS / 86400).toFixed(2)} days`;
        }
    }

    function resize() {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(getPixelRatio(store));
        renderer.setSize(width, height, false);
    }

    function applyGraphicsSettings(event) {
        const profile = event.detail.renderQualityProfile;
        stepsPerFrame = profile?.simulationStepsPerFrame || stepsPerFrame;
        updateBodyGeometryDetail(profile?.sphereGeometryDetail);
        resize();
    }

    window.addEventListener("resize", resize);
    window.addEventListener("solar-sim:graphics-settings-applied", applyGraphicsSettings);
    resize();

    return {
        loadScenario,
        start,
        stop,
        renderSnapshot,
    };

    function getSphereGeometryDetail() {
        const profile = window.SolarSim.settings?.runtime?.getRenderQualityProfile?.();
        return profile?.sphereGeometryDetail || 32;
    }

    function updateBodyGeometryDetail(nextDetail) {
        if (!hasSnapshot || !nextDetail || nextDetail === currentGeometryDetail) {
            return;
        }

        currentGeometryDetail = nextDetail;

        bodyMeshes.forEach((mesh) => {
            const radius = mesh.geometry.parameters.radius;
            mesh.geometry.dispose();
            mesh.geometry = createSphereGeometry(radius, nextDetail);
        });
    }

    async function ensureScenarioMetadata() {
        if (bodyMetadata.size > 0) {
            return;
        }

        const metadata = await window.SolarSim.backend.simulation.getScenarioMetadata();
        applyScenarioMetadata(metadata);
    }

    function applyScenarioMetadata(metadata) {
        if (!metadata?.bodies) {
            return;
        }

        bodyMetadata.clear();
        metadata.bodies.forEach((body) => {
            bodyMetadata.set(body.id, body);
        });
        disposeBodyMeshes();
    }

    function disposeBodyMeshes() {
        bodyMeshes.forEach((mesh) => {
            scene.remove(mesh);
            mesh.geometry.dispose();
            disposeMaterial(mesh.material);
        });
        bodyMeshes.clear();
    }

    function getBodyMetadata(bodyId) {
        return bodyMetadata.get(bodyId) || {
            id: bodyId,
            name: bodyId,
            radiusM: 1,
            color: "#d7deea",
            visual: {
                kind: "standard",
                baseColor: "#d7deea",
            },
        };
    }
};

function setupScene(scene, camera) {
    camera.position.set(0, 88, 245);
    camera.lookAt(0, 0, 0);

    const sunLight = new THREE.PointLight(0xffffff, 2.8, 0, 1);
    sunLight.position.set(0, 0, 0);

    scene.background = new THREE.Color("#02040a");
    window.SolarSim.rendering.addSpaceBackdrop(scene);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x7a8797, 0.34));
}

function createBodyMesh(body, materialFactory, scale, geometryDetail) {
    const radius = Math.max(scale.minRadius, body.radiusM * scale.radius);
    const geometry = createSphereGeometry(radius, geometryDetail);
    const material = materialFactory.createMaterial(body);
    const mesh = new THREE.Mesh(geometry, material);

    return mesh;
}

function createSphereGeometry(radius, detail) {
    return new THREE.SphereGeometry(radius, detail, Math.max(12, Math.floor(detail / 2)));
}

function createDisplayScale() {
    return {
        position: 1 / 1_500_000_000,
        radius: 1 / 25_000_000,
        minRadius: 1.2,
    };
}

function disposeMaterial(material) {
    if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
        return;
    }

    material.dispose();
}

function getPixelRatio(store) {
    const quality = store?.getState().graphics.renderQuality || "medium";

    if (quality === "low") {
        return 1;
    }

    if (quality === "high") {
        return Math.min(window.devicePixelRatio || 1, 2.5);
    }

    return Math.min(window.devicePixelRatio || 1, 2);
}
})();
