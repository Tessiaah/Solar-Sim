window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

(function initializeSimulationRendererModule() {
window.SolarSim.rendering.createSimulationRenderer = function createSimulationRenderer({
    container,
    timeReadout,
    store,
}) {
    const scene = new THREE.Scene();
    const perspectiveCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
    const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    let camera = perspectiveCamera;
    const materialFactory = window.SolarSim.rendering.createBodyMaterialFactory();
    const bodyMeshes = new Map();
    const bodyRingMeshes = new Map();
    const bodyLabels = new Map();
    const orbitLines = new Map();
    const bodyTrails = new Map();
    const velocityVectorLines = new Map();
    const accelerationVectorLines = new Map();
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
    });
    const scale = createDisplayScale();
    const clock = new THREE.Clock();
    const bodyMetadata = new Map();
    const sceneObjects = setupScene(scene, perspectiveCamera);
    const selectionMarker = createSelectionMarker();
    const barycenterMarker = createBarycenterMarker();
    orthographicCamera.position.copy(perspectiveCamera.position);
    orthographicCamera.quaternion.copy(perspectiveCamera.quaternion);
    orthographicCamera.up.copy(perspectiveCamera.up);
    const cameraController = window.SolarSim.rendering.createFlyCameraController({
        camera,
        domElement: renderer.domElement,
        onFlyInputStart: ensurePerspectiveFlyCamera,
        store,
    });
    const cameraOrbitTarget = new THREE.Vector3();
    const cameraOrbitOffset = new THREE.Vector3();
    const cameraSpherical = new THREE.Spherical();
    const listeners = {
        bodiesChanged: new Set(),
        playbackChanged: new Set(),
        selectionChanged: new Set(),
        snapshot: new Set(),
    };

    let animationFrame = null;
    let running = false;
    let runToken = 0;
    let playbackStepsPerFrame = 4;
    let paused = false;
    let stepRequestInFlight = false;
    let hasSnapshot = false;
    let currentGeometryDetail = 32;
    let lastRenderMs = performance.now();
    let lastSnapshot = null;
    let currentScenarioId = null;
    let simulationStateToken = 0;
    let selectedBodyId = null;
    let labelsVisible = store?.getState()?.debug?.uiToggles?.showLabels ?? true;
    let orbitLinesVisible = store?.getState()?.debug?.uiToggles?.showOrbitLines ?? false;
    let trailsVisible = store?.getState()?.debug?.uiToggles?.showTrails ?? false;
    let velocityVectorsVisible = store?.getState()?.debug?.uiToggles?.showVelocityVectors ?? false;
    let accelerationVectorsVisible = store?.getState()?.debug?.uiToggles?.showAccelerationVectors ?? false;
    let barycenterMarkerVisible = store?.getState()?.debug?.uiToggles?.showBarycenterMarker ?? false;
    let trailSystem = store?.getState()?.simulation?.trailSystem ?? "medium";
    let trackSelectedBody = false;
    let destroyed = false;
    let readoutStartElapsedS = 0;
    let readoutTargetElapsedS = 0;
    let readoutAnimationStartMs = performance.now();
    let orthographicViewSize = 320;
    let lastRenderedFrameMs = 0;
    let lastTrailElapsedS = null;
    let lastStepDurationMs = null;
    let lastStepCount = 0;
    const readoutAnimationDurationMs = 160;

    scene.add(selectionMarker);
    scene.add(barycenterMarker);
    container.appendChild(renderer.domElement);

    function start() {
        if (destroyed || running) {
            return;
        }

        running = true;
        runToken += 1;
        const activeRunToken = runToken;

        lastRenderMs = performance.now();
        cameraController.start();
        resize();
        loadCurrentSnapshot(activeRunToken).finally(() => {
            if (isActiveRun(activeRunToken)) {
                scheduleFrame(activeRunToken);
            }
        });
    }

    function stop() {
        running = false;
        runToken += 1;
        cameraController.stop();

        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    }

    function destroy() {
        if (destroyed) {
            return;
        }

        destroyed = true;
        stop();
        window.removeEventListener("resize", resize);
        window.removeEventListener("solar-sim:graphics-settings-applied", applyGraphicsSettings);
        window.removeEventListener("solar-sim:debug-settings-applied", applyDebugSettings);
        window.removeEventListener("solar-sim:simulation-display-settings-applied", applySimulationDisplaySettings);
        window.removeEventListener("solar-sim:language-changed", handleLanguageChanged);
        cameraController.destroy();
        disposeBodyMeshes();
        disposeSelectionMarker(selectionMarker);
        disposeBarycenterMarker(barycenterMarker);
        sceneObjects.backdrop.dispose();
        materialFactory.dispose();
        renderer.dispose();
        renderer.domElement.remove();
    }

    async function loadCurrentSnapshot(activeRunToken) {
        const requestStateToken = simulationStateToken;

        try {
            await ensureScenarioMetadata(requestStateToken);
            const snapshot = await window.SolarSim.backend.simulation.getSnapshot();

            if (snapshot && isActiveRun(activeRunToken) && requestStateToken === simulationStateToken) {
                setLastSnapshot(snapshot);
            }
        } catch (error) {
            console.info("Simulation snapshot request failed.", error);
        }
    }

    async function loadScenario(scenarioId) {
        simulationStateToken += 1;
        const requestStateToken = simulationStateToken;

        try {
            const response = await window.SolarSim.backend.simulation.loadScenario(scenarioId);

            if (requestStateToken !== simulationStateToken) {
                return { ok: false, reason: "Scenario load superseded by a newer request." };
            }

            if (response?.scenario) {
                applyScenarioMetadata(response.scenario);
            }

            if (response?.snapshot) {
                setLastSnapshot(response.snapshot);
            }

            return response;
        } catch (error) {
            console.info("Scenario load failed.", error);
            return { ok: false, reason: String(error) };
        }
    }

    async function resetScenario() {
        const scenarioId = currentScenarioId || lastSnapshot?.scenarioId || "solar-system";
        return loadScenario(scenarioId);
    }

    function frame(activeRunToken) {
        animationFrame = null;

        if (!isActiveRun(activeRunToken)) {
            return;
        }

        const frameStartMs = performance.now();

        if (shouldThrottleFrame(frameStartMs)) {
            scheduleFrame(activeRunToken);
            return;
        }

        lastRenderedFrameMs = frameStartMs;
        const deltaS = getRenderDeltaS();

        if (!paused && !stepRequestInFlight) {
            requestSimulationStep(activeRunToken, playbackStepsPerFrame);
        }

        renderCurrentFrame(deltaS);

        if (isActiveRun(activeRunToken)) {
            scheduleFrame(activeRunToken);
        }
    }

    async function requestSimulationStep(activeRunToken, steps) {
        if (stepRequestInFlight || destroyed) {
            return { ok: false, reason: "Simulation step already in progress." };
        }

        const requestStateToken = simulationStateToken;
        const stepStartMs = performance.now();

        stepRequestInFlight = true;
        notifyPlaybackChanged();

        try {
            const response = await window.SolarSim.backend.simulation.step(steps);
            const snapshot = response?.snapshot;

            if (snapshot && isActiveRun(activeRunToken) && requestStateToken === simulationStateToken) {
                setLastSnapshot(snapshot);
            }

            return response;
        } catch (error) {
            console.info("Simulation step failed.", error);
            return { ok: false, reason: String(error) };
        } finally {
            lastStepDurationMs = performance.now() - stepStartMs;
            lastStepCount = steps;
            emitRendererMetrics();
            stepRequestInFlight = false;

            if (isActiveRun(activeRunToken)) {
                notifyPlaybackChanged();
            }
        }
    }

    function stepOnce() {
        return requestSimulationStep(runToken, 1);
    }

    function renderSnapshot(snapshot) {
        setLastSnapshot(snapshot);
        renderCurrentFrame(0);
    }

    function renderCurrentFrame(deltaS) {
        if (lastSnapshot) {
            syncBodyMeshes(lastSnapshot.bodies);
            updateBodyPositions(lastSnapshot.bodies);
            updateBodyRingAnimations(deltaS);
            updateDynamicLights(lastSnapshot.bodies);
            updateOrbitLineVisibility();
            updateTrails(lastSnapshot);
            updateDebugVectors(lastSnapshot.bodies);
            updateBarycenterMarker(lastSnapshot);
            updateReadouts(lastSnapshot);
        }

        cameraController.update(deltaS);
        updateTrackedCameraTarget();
        updateSelectionMarker(deltaS);
        updateBodyLabels();
        sceneObjects.backdrop.update(clock.getElapsedTime());
        renderer.render(scene, camera);
        emitRendererMetrics();
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
                disposeBodyRingByBodyId(bodyId);
                disposeOrbitLineByBodyId(bodyId);
                disposeTrailByBodyId(bodyId);
                disposeVectorLineByBodyId(velocityVectorLines, bodyId);
                disposeVectorLineByBodyId(accelerationVectorLines, bodyId);
            }
        });

        bodyLabels.forEach((label, bodyId) => {
            if (!bodyIds.has(bodyId)) {
                scene.remove(label);
                disposeLabelSprite(label);
                bodyLabels.delete(bodyId);
            }
        });

        bodies.forEach((body) => {
            const metadata = getBodyMetadata(body.id);

            if (!bodyMeshes.has(body.id)) {
                const mesh = createBodyMesh(metadata, materialFactory, scale, geometryDetail);
                bodyMeshes.set(body.id, mesh);
                scene.add(mesh);
            }

            if (!bodyRingMeshes.has(body.id)) {
                const rings = createBodyRingGroup(metadata, scale);

                bodyRingMeshes.set(body.id, rings);

                if (rings) {
                    scene.add(rings);
                }
            }

            if (!bodyLabels.has(body.id)) {
                const label = createBodyLabel(metadata);
                bodyLabels.set(body.id, label);
                scene.add(label);
            }
        });
    }

    function updateBodyPositions(bodies) {
        bodies.forEach((body) => {
            const mesh = bodyMeshes.get(body.id);

            if (!mesh) {
                return;
            }

            scale.toScenePosition(body.positionM, mesh.position);

            const rings = bodyRingMeshes.get(body.id);

            if (rings) {
                rings.position.copy(mesh.position);
            }
        });
    }

    function updateBodyRingAnimations(deltaS) {
        if (!deltaS || deltaS <= 0) {
            return;
        }

        bodyRingMeshes.forEach((group) => {
            if (!group) {
                return;
            }

            group.traverse((object) => {
                if (!object.isMesh) {
                    return;
                }

                const texture = object.material?.map;
                const textureScrollRate = object.userData.ringTextureScrollRate || 0;
                const spinRate = object.userData.ringSpinRateRadS || 0;

                if (texture && textureScrollRate) {
                    texture.offset.x = (texture.offset.x + textureScrollRate * deltaS) % 1;
                    texture.needsUpdate = true;
                }

                if (spinRate) {
                    object.rotation.z += spinRate * deltaS;
                }
            });
        });
    }

    function updateDynamicLights(bodies) {
        const lightBody = getPrimaryLightBody(bodies);

        if (!lightBody) {
            sceneObjects.primaryLight.position.set(0, 0, 0);
            return;
        }

        const mesh = bodyMeshes.get(lightBody.id);

        if (mesh) {
            sceneObjects.primaryLight.position.copy(mesh.position);
            return;
        }

        scale.toScenePosition(lightBody.positionM, sceneObjects.primaryLight.position);
    }

    function getPrimaryLightBody(bodies) {
        return bodies.find((body) => body.id === "sun")
            || bodies.find((body) => getBodyMetadata(body.id).visual?.emissive);
    }

    function updateReadouts(snapshot) {
        if (timeReadout) {
            const elapsedS = getAnimatedReadoutElapsedS();
            const elapsedDays = elapsedS / 86400;
            const elapsedYears = elapsedDays / 365.25;
            const days = formatRendererDecimal(elapsedDays, 2);
            const years = formatRendererDecimal(elapsedYears, 3);

            timeReadout.textContent = translateRendererText(
                "simulation.timeReadout",
                { days, years },
                `${days} days (${years} years)`,
            );
        }
    }

    function syncOrbitLines() {
        const activeOrbitIds = new Set();

        bodyMetadata.forEach((metadata) => {
            if (!hasExpectedOrbit(metadata)) {
                return;
            }

            const line = getOrCreateOrbitLine(metadata);
            line.visible = orbitLinesVisible;
            activeOrbitIds.add(metadata.id);
        });

        orbitLines.forEach((line, bodyId) => {
            if (!activeOrbitIds.has(bodyId)) {
                disposeOrbitLine(line);
                orbitLines.delete(bodyId);
            }
        });
    }

    function updateOrbitLineVisibility() {
        orbitLines.forEach((line) => {
            line.visible = orbitLinesVisible;
        });
    }

    function hideOrbitLines() {
        orbitLines.forEach((line) => {
            line.visible = false;
        });
    }

    function getOrCreateOrbitLine(metadata) {
        if (!orbitLines.has(metadata.id)) {
            const line = createOrbitLine(metadata, scale);

            orbitLines.set(metadata.id, line);
            scene.add(line);
        }

        return orbitLines.get(metadata.id);
    }

    function disposeOrbitLineByBodyId(bodyId) {
        const line = orbitLines.get(bodyId);

        if (!line) {
            return;
        }

        disposeOrbitLine(line);
        orbitLines.delete(bodyId);
    }

    function disposeOrbitLines() {
        orbitLines.forEach(disposeOrbitLine);
        orbitLines.clear();
    }

    function updateTrails(snapshot) {
        if (!trailsVisible || !snapshot?.bodies?.length) {
            hideTrails();
            return;
        }

        if (snapshot.elapsedS === lastTrailElapsedS) {
            return;
        }

        lastTrailElapsedS = snapshot.elapsedS;
        const activeBodyIds = new Set(snapshot.bodies.map((body) => body.id));
        const maxPoints = getTrailPointLimit(trailSystem);

        snapshot.bodies.forEach((body) => {
            const trail = getOrCreateTrail(body);
            const point = scale.toScenePosition(body.positionM, new THREE.Vector3());
            const lastPoint = trail.points[trail.points.length - 1];

            if (!lastPoint || lastPoint.distanceToSquared(point) > 0.08) {
                trail.points.push(point);
            }

            if (trail.points.length > maxPoints) {
                trail.points.splice(0, trail.points.length - maxPoints);
            }

            trail.line.geometry.dispose();
            trail.line.geometry = new THREE.BufferGeometry().setFromPoints(trail.points);
            trail.line.visible = trail.points.length > 1;
        });

        bodyTrails.forEach((trail, bodyId) => {
            if (!activeBodyIds.has(bodyId)) {
                disposeTrail(trail);
                bodyTrails.delete(bodyId);
            }
        });
    }

    function getOrCreateTrail(body) {
        if (!bodyTrails.has(body.id)) {
            const metadata = getBodyMetadata(body.id);
            const trail = createTrail(metadata);

            bodyTrails.set(body.id, trail);
            scene.add(trail.line);
        }

        return bodyTrails.get(body.id);
    }

    function hideTrails() {
        bodyTrails.forEach((trail) => {
            trail.line.visible = false;
        });
    }

    function clearTrails() {
        bodyTrails.forEach((trail) => {
            trail.points = [];
            trail.line.geometry.dispose();
            trail.line.geometry = new THREE.BufferGeometry();
            trail.line.visible = false;
        });
        lastTrailElapsedS = null;
    }

    function disposeTrailByBodyId(bodyId) {
        const trail = bodyTrails.get(bodyId);

        if (!trail) {
            return;
        }

        disposeTrail(trail);
        bodyTrails.delete(bodyId);
    }

    function disposeTrails() {
        bodyTrails.forEach(disposeTrail);
        bodyTrails.clear();
    }

    function updateDebugVectors(bodies) {
        updateVectorLineSet({
            bodies,
            lines: velocityVectorLines,
            visible: velocityVectorsVisible,
            valueKey: "velocityMS",
            color: 0x6ee7d8,
            scaleFactor: 0.0014,
            minLength: 6,
            maxLength: 54,
        });
        updateVectorLineSet({
            bodies,
            lines: accelerationVectorLines,
            visible: accelerationVectorsVisible,
            valueKey: "accelerationMS2",
            color: 0xffd36d,
            scaleFactor: 2_200_000,
            minLength: 5,
            maxLength: 46,
        });
    }

    function updateVectorLineSet({ bodies, lines, visible, valueKey, color, scaleFactor, minLength, maxLength }) {
        if (!visible) {
            lines.forEach((line) => {
                line.visible = false;
            });
            return;
        }

        const activeBodyIds = new Set(bodies.map((body) => body.id));

        bodies.forEach((body) => {
            const mesh = bodyMeshes.get(body.id);
            const values = body[valueKey];

            if (!mesh || !Array.isArray(values)) {
                return;
            }

            const vector = vectorMToScene(values, new THREE.Vector3());
            const magnitude = vector.length();
            const line = getOrCreateVectorLine(lines, body.id, color);

            if (magnitude === 0) {
                line.visible = false;
                return;
            }

            const length = clampNumber(magnitude * scaleFactor, minLength, maxLength);
            const end = vector.normalize().multiplyScalar(length).add(mesh.position);

            line.geometry.dispose();
            line.geometry = new THREE.BufferGeometry().setFromPoints([mesh.position.clone(), end]);
            line.visible = true;
        });

        lines.forEach((line, bodyId) => {
            if (!activeBodyIds.has(bodyId)) {
                disposeVectorLine(line);
                lines.delete(bodyId);
            }
        });
    }

    function getOrCreateVectorLine(lines, bodyId, color) {
        if (!lines.has(bodyId)) {
            const line = createVectorLine(color);

            lines.set(bodyId, line);
            scene.add(line);
        }

        return lines.get(bodyId);
    }

    function disposeVectorLineByBodyId(lines, bodyId) {
        const line = lines.get(bodyId);

        if (!line) {
            return;
        }

        disposeVectorLine(line);
        lines.delete(bodyId);
    }

    function disposeVectorLines(lines) {
        lines.forEach(disposeVectorLine);
        lines.clear();
    }

    function updateBarycenterMarker(snapshot) {
        const barycenterM = snapshot?.diagnostics?.barycenterM;

        if (!barycenterMarkerVisible || !Array.isArray(barycenterM)) {
            barycenterMarker.visible = false;
            return;
        }

        scale.toScenePosition(barycenterM, barycenterMarker.position);
        barycenterMarker.rotation.y += 0.02;
        barycenterMarker.visible = true;
    }

    function updateTrackedCameraTarget() {
        if (!trackSelectedBody) {
            return;
        }

        const mesh = bodyMeshes.get(selectedBodyId);

        if (mesh) {
            cameraController.lookAt(mesh.position);
        }
    }

    function updateSelectionMarker(deltaS = 0) {
        const mesh = bodyMeshes.get(selectedBodyId);

        if (!mesh) {
            selectionMarker.visible = false;
            return;
        }

        const radius = getMeshRadius(mesh);

        selectionMarker.position.copy(mesh.position);
        selectionMarker.scale.setScalar(radius * 1.22);
        selectionMarker.rotation.y += deltaS * 0.34;
        selectionMarker.visible = true;
    }

    function updateBodyLabels() {
        bodyLabels.forEach((label, bodyId) => {
            const mesh = bodyMeshes.get(bodyId);

            if (!mesh || !labelsVisible) {
                label.visible = false;
                return;
            }

            const radius = getMeshRadius(mesh);
            const labelHeight = Math.min(10, Math.max(5, radius * 0.42));

            label.position.copy(mesh.position);
            label.position.y += radius + labelHeight * 0.86;
            label.scale.set(labelHeight * label.userData.aspect, labelHeight, 1);
            label.visible = true;
        });
    }

    function refreshBodyLabelTextures() {
        bodyLabels.forEach((label, bodyId) => {
            updateBodyLabelTexture(label, getBodyMetadata(bodyId));
        });
    }

    function resize() {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        const aspect = width / height;

        perspectiveCamera.aspect = aspect;
        perspectiveCamera.updateProjectionMatrix();
        updateOrthographicProjection(aspect);
        renderer.setPixelRatio(getPixelRatio(store));
        renderer.setSize(width, height, false);
    }

    function updateOrthographicProjection(aspect) {
        const halfHeight = orthographicViewSize / 2;
        const halfWidth = halfHeight * aspect;

        orthographicCamera.left = -halfWidth;
        orthographicCamera.right = halfWidth;
        orthographicCamera.top = halfHeight;
        orthographicCamera.bottom = -halfHeight;
        orthographicCamera.updateProjectionMatrix();
    }

    function applyGraphicsSettings(event) {
        const profile = event.detail.renderQualityProfile;

        updateBodyGeometryDetail(profile?.sphereGeometryDetail);
        resize();
    }

    function applyDebugSettings(event) {
        const uiToggles = event.detail?.debug?.uiToggles || {};
        const showLabels = uiToggles.showLabels;
        const showOrbitLines = uiToggles.showOrbitLines;
        const showTrails = uiToggles.showTrails;
        const showVelocityVectors = uiToggles.showVelocityVectors;
        const showAccelerationVectors = uiToggles.showAccelerationVectors;
        const showBarycenterMarker = uiToggles.showBarycenterMarker;

        if (typeof showLabels === "boolean") {
            setLabelsVisible(showLabels);
        }

        if (typeof showOrbitLines === "boolean") {
            setOrbitLinesVisible(showOrbitLines);
        }

        if (typeof showTrails === "boolean") {
            setTrailsVisible(showTrails);
        }

        if (typeof showVelocityVectors === "boolean") {
            setVelocityVectorsVisible(showVelocityVectors);
        }

        if (typeof showAccelerationVectors === "boolean") {
            setAccelerationVectorsVisible(showAccelerationVectors);
        }

        if (typeof showBarycenterMarker === "boolean") {
            setBarycenterMarkerVisible(showBarycenterMarker);
        }
    }

    function applySimulationDisplaySettings(event) {
        if (event.detail?.trailSystem) {
            setTrailSystem(event.detail.trailSystem);
        }
    }

    function handleLanguageChanged() {
        if (lastSnapshot) {
            updateReadouts(lastSnapshot);
        }

        refreshBodyLabelTextures();
        updateBodyLabels();
    }

    window.addEventListener("resize", resize);
    window.addEventListener("solar-sim:graphics-settings-applied", applyGraphicsSettings);
    window.addEventListener("solar-sim:debug-settings-applied", applyDebugSettings);
    window.addEventListener("solar-sim:simulation-display-settings-applied", applySimulationDisplaySettings);
    window.addEventListener("solar-sim:language-changed", handleLanguageChanged);
    resize();

    return {
        destroy,
        focusSelectedBody,
        getCameraOrientation,
        getPlaybackState,
        getSelectedBodyId,
        loadScenario,
        onBodiesChanged,
        onPlaybackChanged,
        onSelectionChanged,
        onSnapshot,
        renderSnapshot,
        resetScenario,
        orbitCamera,
        selectBody,
        setCameraView,
        setFollowSelected,
        setLabelsVisible,
        setOrbitLinesVisible,
        setPaused,
        setPlaybackSpeed,
        start,
        stepOnce,
        stop,
        togglePlayback,
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
            const radius = getMeshRadius(mesh);

            mesh.geometry.dispose();
            mesh.geometry = createSphereGeometry(radius, nextDetail);
        });
    }

    async function ensureScenarioMetadata(requestStateToken = simulationStateToken) {
        if (bodyMetadata.size > 0) {
            return;
        }

        const metadata = await window.SolarSim.backend.simulation.getScenarioMetadata();

        if (requestStateToken === simulationStateToken) {
            applyScenarioMetadata(metadata);
        }
    }

    function applyScenarioMetadata(metadata) {
        if (!metadata?.bodies) {
            return;
        }

        currentScenarioId = metadata.id || currentScenarioId;
        disposeBodyMeshes();
        materialFactory.dispose();
        bodyMetadata.clear();
        metadata.bodies.forEach((body) => {
            bodyMetadata.set(body.id, body);
        });

        syncOrbitLines();
        selectedBodyId = chooseSelectedBodyId(selectedBodyId);
        notifyBodiesChanged();
        notifySelectionChanged();
    }

    function disposeBodyMeshes() {
        bodyMeshes.forEach((mesh) => {
            scene.remove(mesh);
            mesh.geometry.dispose();
            disposeMaterial(mesh.material);
        });
        bodyMeshes.clear();

        disposeBodyRings();

        bodyLabels.forEach((label) => {
            scene.remove(label);
            disposeLabelSprite(label);
        });
        bodyLabels.clear();
        disposeOrbitLines();
        disposeTrails();
        disposeVectorLines(velocityVectorLines);
        disposeVectorLines(accelerationVectorLines);
        selectionMarker.visible = false;
        barycenterMarker.visible = false;
        lastTrailElapsedS = null;
    }

    function disposeBodyRingByBodyId(bodyId) {
        const rings = bodyRingMeshes.get(bodyId);

        if (rings) {
            disposeBodyRingGroup(rings);
        }

        if (!bodyRingMeshes.has(bodyId)) {
            return;
        }

        bodyRingMeshes.delete(bodyId);
    }

    function disposeBodyRings() {
        bodyRingMeshes.forEach((rings) => {
            if (rings) {
                disposeBodyRingGroup(rings);
            }
        });
        bodyRingMeshes.clear();
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

    function chooseSelectedBodyId(previousBodyId) {
        if (previousBodyId && bodyMetadata.has(previousBodyId)) {
            return previousBodyId;
        }

        if (bodyMetadata.has("earth")) {
            return "earth";
        }

        return bodyMetadata.keys().next().value || null;
    }

    function selectBody(bodyId) {
        if (bodyId && !bodyMetadata.has(bodyId)) {
            return false;
        }

        selectedBodyId = bodyId || null;
        updateSelectionMarker();
        notifySelectionChanged();

        return true;
    }

    function getSelectedBodyId() {
        return selectedBodyId;
    }

    function getCameraOrientation() {
        return {
            projection: camera.isOrthographicCamera ? "orthographic" : "perspective",
            quaternion: [
                camera.quaternion.x,
                camera.quaternion.y,
                camera.quaternion.z,
                camera.quaternion.w,
            ],
        };
    }

    function focusSelectedBody() {
        const mesh = bodyMeshes.get(selectedBodyId);

        if (!mesh) {
            return false;
        }

        const radius = getMeshRadius(mesh);
        const distance = Math.max(radius * 8, 34);

        cameraController.focusOn(mesh.position, distance);
        if (camera.isOrthographicCamera) {
            setOrthographicViewSize(Math.max(radius * 18, 80));
        }
        return true;
    }

    function setCameraView(viewName) {
        if (viewName === "perspective") {
            setCameraProjection("perspective");
            return true;
        }

        const view = getCameraViewPreset(viewName);

        if (!view) {
            return false;
        }

        setCameraProjection("orthographic");
        cameraOrbitTarget.copy(getCameraViewTarget());

        const distance = Math.max(camera.position.distanceTo(cameraOrbitTarget), 220);
        const direction = view.direction.clone().normalize();

        camera.up.copy(view.up).normalize();
        camera.position.copy(cameraOrbitTarget).addScaledVector(direction, distance);
        setOrthographicViewSize(Math.max(120, distance * 0.82));
        cameraController.lookAt(cameraOrbitTarget);

        return true;
    }

    function orbitCamera(deltaYaw, deltaPitch) {
        ensurePerspectiveFlyCamera();
        cameraOrbitTarget.copy(getCameraViewTarget());
        cameraOrbitOffset.copy(camera.position).sub(cameraOrbitTarget);

        if (cameraOrbitOffset.lengthSq() === 0) {
            cameraOrbitOffset.set(0, 0, 220);
        }

        cameraSpherical.setFromVector3(cameraOrbitOffset);
        cameraSpherical.theta -= deltaYaw;
        cameraSpherical.phi = clampNumber(cameraSpherical.phi - deltaPitch, 0.04, Math.PI - 0.04);
        cameraOrbitOffset.setFromSpherical(cameraSpherical);

        camera.up.set(0, 1, 0);
        camera.position.copy(cameraOrbitTarget).add(cameraOrbitOffset);
        cameraController.lookAt(cameraOrbitTarget);

        return true;
    }

    function setCameraProjection(mode) {
        const nextCamera = mode === "orthographic" ? orthographicCamera : perspectiveCamera;

        if (camera === nextCamera) {
            return false;
        }

        copyCameraPose(camera, nextCamera);
        camera = nextCamera;
        cameraController.setCamera(camera);
        resize();

        return true;
    }

    function ensurePerspectiveFlyCamera() {
        if (camera.isOrthographicCamera) {
            const flyTarget = getCameraViewTarget().clone();
            const flyPosition = camera.position.clone();

            setCameraProjection("perspective");
            camera.position.copy(flyPosition);
            camera.up.set(0, 1, 0);
            nudgeVerticalFlyCameraPose(camera, flyTarget);
            camera.lookAt(flyTarget);
            cameraController.setCamera(camera);
        }
    }

    function setOrthographicViewSize(size) {
        orthographicViewSize = clampNumber(size, 40, 2400);
        updateOrthographicProjection(container.clientWidth / Math.max(container.clientHeight, 1));
    }

    function getCameraViewTarget() {
        const selectedMesh = bodyMeshes.get(selectedBodyId);

        return selectedMesh?.position || cameraOrbitTarget.set(0, 0, 0);
    }

    function setLabelsVisible(value) {
        labelsVisible = Boolean(value);
        updateBodyLabels();
    }

    function setOrbitLinesVisible(value) {
        orbitLinesVisible = Boolean(value);

        if (!orbitLinesVisible) {
            hideOrbitLines();
            return;
        }

        syncOrbitLines();
    }

    function setVelocityVectorsVisible(value) {
        velocityVectorsVisible = Boolean(value);

        if (!velocityVectorsVisible) {
            velocityVectorLines.forEach((line) => {
                line.visible = false;
            });
        }
    }

    function setAccelerationVectorsVisible(value) {
        accelerationVectorsVisible = Boolean(value);

        if (!accelerationVectorsVisible) {
            accelerationVectorLines.forEach((line) => {
                line.visible = false;
            });
        }
    }

    function setBarycenterMarkerVisible(value) {
        barycenterMarkerVisible = Boolean(value);

        if (!barycenterMarkerVisible) {
            barycenterMarker.visible = false;
        }
    }

    function setTrailsVisible(value) {
        trailsVisible = Boolean(value);

        if (!trailsVisible) {
            clearTrails();
            return;
        }

        clearTrails();
    }

    function setTrailSystem(value) {
        trailSystem = value || "medium";

        clearTrails();
    }

    function setFollowSelected(value) {
        trackSelectedBody = Boolean(value);
        updateTrackedCameraTarget();
    }

    function togglePlayback() {
        setPaused(!paused);
    }

    function setPaused(value) {
        const nextPaused = Boolean(value);

        if (paused === nextPaused) {
            return;
        }

        paused = nextPaused;
        notifyPlaybackChanged();
    }

    function setPlaybackSpeed(stepsPerFrame) {
        const safeStepsPerFrame = clampInteger(stepsPerFrame, 1, 240);

        if (safeStepsPerFrame === playbackStepsPerFrame) {
            return;
        }

        playbackStepsPerFrame = safeStepsPerFrame;
        notifyPlaybackChanged();
    }

    function getPlaybackState() {
        return {
            paused,
            playbackStepsPerFrame,
            stepRequestInFlight,
        };
    }

    function onBodiesChanged(listener) {
        listeners.bodiesChanged.add(listener);
        listener(getBodyListPayload());

        return () => {
            listeners.bodiesChanged.delete(listener);
        };
    }

    function onPlaybackChanged(listener) {
        listeners.playbackChanged.add(listener);
        listener(getPlaybackState());

        return () => {
            listeners.playbackChanged.delete(listener);
        };
    }

    function onSelectionChanged(listener) {
        listeners.selectionChanged.add(listener);
        listener(getSelectionPayload());

        return () => {
            listeners.selectionChanged.delete(listener);
        };
    }

    function onSnapshot(listener) {
        listeners.snapshot.add(listener);

        if (lastSnapshot) {
            listener(lastSnapshot);
        }

        return () => {
            listeners.snapshot.delete(listener);
        };
    }

    function notifyBodiesChanged() {
        notifyListeners(listeners.bodiesChanged, getBodyListPayload());
    }

    function notifyPlaybackChanged() {
        notifyListeners(listeners.playbackChanged, getPlaybackState());
    }

    function notifySelectionChanged() {
        notifyListeners(listeners.selectionChanged, getSelectionPayload());
    }

    function notifySnapshot(snapshot) {
        notifyListeners(listeners.snapshot, snapshot);
    }

    function notifyListeners(listenerSet, payload) {
        listenerSet.forEach((listener) => {
            try {
                listener(payload);
            } catch (error) {
                console.info("Simulation renderer listener failed.", error);
            }
        });
    }

    function getBodyListPayload() {
        return {
            bodies: Array.from(bodyMetadata.values()).map(copyBodyMetadata),
            selectedBodyId,
        };
    }

    function getSelectionPayload() {
        return {
            selectedBodyId,
            selectedBody: selectedBodyId ? copyBodyMetadata(getBodyMetadata(selectedBodyId)) : null,
        };
    }

    function setLastSnapshot(snapshot) {
        lastSnapshot = snapshot;
        currentScenarioId = snapshot.scenarioId || currentScenarioId;
        updateReadoutTarget(snapshot.elapsedS, hasSnapshot);
        hasSnapshot = true;
        emitSimulationMetrics(snapshot);
        notifySnapshot(snapshot);
    }

    function updateReadoutTarget(elapsedS, hasPreviousSnapshot) {
        if (!Number.isFinite(elapsedS)) {
            return;
        }

        const currentElapsedS = getAnimatedReadoutElapsedS();

        if (elapsedS <= currentElapsedS || !hasPreviousSnapshot) {
            readoutStartElapsedS = elapsedS;
            readoutTargetElapsedS = elapsedS;
            readoutAnimationStartMs = performance.now();
            return;
        }

        readoutStartElapsedS = currentElapsedS;
        readoutTargetElapsedS = elapsedS;
        readoutAnimationStartMs = performance.now();
    }

    function getAnimatedReadoutElapsedS() {
        const elapsedMs = performance.now() - readoutAnimationStartMs;
        const progress = clampNumber(elapsedMs / readoutAnimationDurationMs, 0, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        return readoutStartElapsedS
            + (readoutTargetElapsedS - readoutStartElapsedS) * easedProgress;
    }

    function isActiveRun(activeRunToken) {
        return running && activeRunToken === runToken;
    }

    function scheduleFrame(activeRunToken) {
        if (animationFrame) {
            return;
        }

        animationFrame = requestAnimationFrame(() => frame(activeRunToken));
    }

    function shouldThrottleFrame(frameStartMs) {
        const frameIntervalMs = getFrameIntervalMs();

        return frameIntervalMs > 0
            && lastRenderedFrameMs > 0
            && frameStartMs - lastRenderedFrameMs < frameIntervalMs;
    }

    function getRenderDeltaS() {
        const now = performance.now();
        const deltaS = Math.min((now - lastRenderMs) / 1000, 0.05);

        lastRenderMs = now;
        return deltaS;
    }

    function getFrameIntervalMs() {
        const fpsLimit = store?.getState()?.graphics?.fpsLimit || "60";

        if (fpsLimit === "unlimited") {
            return 0;
        }

        const fps = Number(fpsLimit);

        return Number.isFinite(fps) && fps > 0 ? 1000 / fps : 0;
    }

    function emitRendererMetrics() {
        window.dispatchEvent(
            new CustomEvent("solar-sim:renderer-metrics", {
                detail: {
                    fpsLimit: store?.getState()?.graphics?.fpsLimit || "60",
                    pixelRatio: renderer.getPixelRatio(),
                    sphereGeometryDetail: currentGeometryDetail,
                    trailSystem,
                    trailsVisible,
                    trailPointCount: getTrailPointCount(),
                    vectorCount: getVisibleVectorCount(),
                    lastStepDurationMs,
                    lastStepCount,
                },
            }),
        );
    }

    function emitSimulationMetrics(snapshot) {
        window.dispatchEvent(
            new CustomEvent("solar-sim:simulation-metrics", {
                detail: {
                    elapsedS: snapshot.elapsedS,
                    dtS: snapshot.dtS,
                    diagnostics: snapshot.diagnostics || null,
                },
            }),
        );
    }

    function getTrailPointCount() {
        if (!trailsVisible) {
            return 0;
        }

        let pointCount = 0;

        bodyTrails.forEach((trail) => {
            pointCount += trail.points.length;
        });

        return pointCount;
    }

    function getVisibleVectorCount() {
        let vectorCount = 0;

        velocityVectorLines.forEach((line) => {
            vectorCount += line.visible ? 1 : 0;
        });
        accelerationVectorLines.forEach((line) => {
            vectorCount += line.visible ? 1 : 0;
        });

        return vectorCount;
    }
};

function getCameraViewPreset(viewName) {
    const presets = {
        front: {
            direction: new THREE.Vector3(0, 0, 1),
            up: new THREE.Vector3(0, 1, 0),
        },
        back: {
            direction: new THREE.Vector3(0, 0, -1),
            up: new THREE.Vector3(0, 1, 0),
        },
        right: {
            direction: new THREE.Vector3(1, 0, 0),
            up: new THREE.Vector3(0, 1, 0),
        },
        left: {
            direction: new THREE.Vector3(-1, 0, 0),
            up: new THREE.Vector3(0, 1, 0),
        },
        top: {
            direction: new THREE.Vector3(0, 1, 0),
            up: new THREE.Vector3(0, 0, -1),
        },
        bottom: {
            direction: new THREE.Vector3(0, -1, 0),
            up: new THREE.Vector3(0, 0, 1),
        },
    };

    return presets[viewName] || null;
}

function copyCameraPose(sourceCamera, targetCamera) {
    targetCamera.position.copy(sourceCamera.position);
    targetCamera.quaternion.copy(sourceCamera.quaternion);
    targetCamera.up.copy(sourceCamera.up);
    targetCamera.updateMatrixWorld();
}

function nudgeVerticalFlyCameraPose(camera, target) {
    const offset = camera.position.clone().sub(target);

    if (offset.lengthSq() === 0) {
        camera.position.copy(target).add(new THREE.Vector3(0.35, 0.25, 1).normalize().multiplyScalar(220));
        return;
    }

    const direction = offset.normalize();
    const verticalAlignment = Math.abs(direction.dot(new THREE.Vector3(0, 1, 0)));

    if (verticalAlignment > 0.985) {
        const distance = camera.position.distanceTo(target);

        camera.position.x += Math.max(distance * 0.015, 1);
    }
}

function setupScene(scene, camera) {
    camera.position.set(0, 88, 245);
    camera.lookAt(0, 0, 0);

    const sunLight = new THREE.PointLight(0xffffff, 2.8, 0, 1);
    sunLight.position.set(0, 0, 0);

    scene.background = new THREE.Color("#02040a");
    const backdrop = window.SolarSim.rendering.addSpaceBackdrop(scene);
    scene.add(sunLight);
    scene.add(createGlobalFillLight());

    return {
        backdrop,
        primaryLight: sunLight,
    };
}

function createGlobalFillLight() {
    return new THREE.AmbientLight(0xd8e2f0, 0.82);
}

function createBodyMesh(body, materialFactory, scale, geometryDetail) {
    const radius = scale.radiusForBody(body);
    const geometry = createSphereGeometry(radius, geometryDetail);
    const material = materialFactory.createMaterial(body);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.userData.bodyId = body.id;
    return mesh;
}

function createBodyRingGroup(body, scale) {
    const rings = body.visual?.rings;

    if (!Array.isArray(rings) || rings.length === 0) {
        return null;
    }

    const bodyRadiusM = Number(body.radiusM);
    const bodySceneRadius = scale.radiusForBody(body);
    const meterToSceneUnit = Number.isFinite(bodyRadiusM) && bodyRadiusM > 0
        ? bodySceneRadius / bodyRadiusM
        : 0;
    const group = new THREE.Group();

    group.userData.bodyId = body.id;

    rings.forEach((ring) => {
        const mesh = createBodyRingMesh({
            ring,
            meterToSceneUnit,
            bodyId: body.id,
        });

        if (mesh) {
            group.add(mesh);
        }
    });

    return group.children.length > 0 ? group : null;
}

function createBodyRingMesh({ ring, meterToSceneUnit, bodyId }) {
    if (!Number.isFinite(meterToSceneUnit) || meterToSceneUnit <= 0) {
        return null;
    }

    const innerRadiusM = Number(ring.innerRadiusM);
    const outerRadiusM = Number(ring.outerRadiusM);

    if (!Number.isFinite(innerRadiusM) || !Number.isFinite(outerRadiusM) || outerRadiusM <= innerRadiusM) {
        return null;
    }

    const innerRadius = Math.max(0.01, innerRadiusM * meterToSceneUnit);
    const outerRadius = Math.max(innerRadius + 0.18, outerRadiusM * meterToSceneUnit);
    const geometry = createTexturedRingGeometry(
        innerRadius,
        outerRadius,
        clampInteger(Number(ring.radialSegments) || 192, 48, 512),
        32,
    );
    const texture = createProceduralRingTexture(ring);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: true,
        depthWrite: false,
        map: texture,
        opacity: clampNumber(Number(ring.opacity ?? 0.58), 0.05, 0.95),
        side: THREE.DoubleSide,
        transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const animationRateRadS = Number(ring.animationRateRadS) || 0;

    mesh.rotation.x = -Math.PI / 2 + (Number(ring.tiltRad) || 0);
    mesh.renderOrder = 6;
    mesh.userData.bodyId = bodyId;
    mesh.userData.ringTextureScrollRate = animationRateRadS / (Math.PI * 2);
    mesh.userData.ringSpinRateRadS = animationRateRadS * 0.35;
    return mesh;
}

function createTexturedRingGeometry(innerRadius, outerRadius, radialSegments, radialSubdivisions) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let radialIndex = 0; radialIndex <= radialSubdivisions; radialIndex += 1) {
        const radialProgress = radialIndex / radialSubdivisions;
        const radius = innerRadius + (outerRadius - innerRadius) * radialProgress;

        for (let segmentIndex = 0; segmentIndex <= radialSegments; segmentIndex += 1) {
            const segmentProgress = segmentIndex / radialSegments;
            const angle = segmentProgress * Math.PI * 2;

            positions.push(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
                0,
            );
            normals.push(0, 0, 1);
            uvs.push(segmentProgress, radialProgress);
        }
    }

    const stride = radialSegments + 1;

    for (let radialIndex = 0; radialIndex < radialSubdivisions; radialIndex += 1) {
        for (let segmentIndex = 0; segmentIndex < radialSegments; segmentIndex += 1) {
            const a = radialIndex * stride + segmentIndex;
            const b = a + 1;
            const c = (radialIndex + 1) * stride + segmentIndex;
            const d = c + 1;

            indices.push(a, c, b, b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    return geometry;
}

function createProceduralRingTexture(ring) {
    const width = 1024;
    const height = 128;
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    const imageData = context.createImageData(width, height);
    const data = imageData.data;
    const innerRadiusM = Number(ring.innerRadiusM) || 0;
    const outerRadiusM = Number(ring.outerRadiusM) || innerRadiusM + 1;
    const ringWidthM = Math.max(1, outerRadiusM - innerRadiusM);
    const bands = Array.isArray(ring.bands) && ring.bands.length > 0 ? ring.bands : [ring];
    const fallbackColor = parseRendererHexColor(ring.color || "#d8c48e");

    for (let y = 0; y < height; y += 1) {
        const radialProgress = y / (height - 1);
        const radiusM = innerRadiusM + radialProgress * ringWidthM;
        const band = findRingBandAtRadius(bands, radiusM);
        const edgeFade = band ? getRingBandEdgeFade(band, radiusM) : 0;
        const bandColor = band ? parseRendererHexColor(band.color || ring.color || "#d8c48e") : fallbackColor;

        for (let x = 0; x < width; x += 1) {
            const pixelIndex = (y * width + x) * 4;
            const angularNoise = rendererNoise2d(x * 0.035, y * 0.21);
            const fineNoise = rendererNoise2d(x * 0.17 + 91.7, y * 1.47 + 13.4);
            const spokeShade = Math.sin((x / width) * Math.PI * 18 + radialProgress * 9.5) * 0.035;
            const fineLine = Math.sin(radialProgress * Math.PI * 430 + angularNoise * 4.2) * 0.06;
            const brightness = band
                ? clampNumber(0.88 + angularNoise * 0.11 + fineNoise * 0.07 + spokeShade + fineLine, 0.5, 1.16)
                : clampNumber(0.22 + fineNoise * 0.04, 0.08, 0.32);
            const alpha = band
                ? clampNumber(Number(band.opacity ?? ring.opacity ?? 0.52) * edgeFade * (0.82 + fineNoise * 0.16), 0, 0.9)
                : 0.018;

            data[pixelIndex] = clampInteger(bandColor.r * brightness, 0, 255);
            data[pixelIndex + 1] = clampInteger(bandColor.g * brightness, 0, 255);
            data[pixelIndex + 2] = clampInteger(bandColor.b * brightness, 0, 255);
            data[pixelIndex + 3] = clampInteger(alpha * 255, 0, 255);
        }
    }

    context.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    if (THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
        texture.encoding = THREE.sRGBEncoding;
    }

    return texture;
}

function findRingBandAtRadius(bands, radiusM) {
    return bands.find((band) => (
        radiusM >= Number(band.innerRadiusM)
        && radiusM <= Number(band.outerRadiusM)
    )) || null;
}

function getRingBandEdgeFade(band, radiusM) {
    const innerRadiusM = Number(band.innerRadiusM);
    const outerRadiusM = Number(band.outerRadiusM);
    const widthM = Math.max(1, outerRadiusM - innerRadiusM);
    const edgeWidthM = Math.min(widthM * 0.22, 1_800_000);
    const fromInner = smoothStep(0, edgeWidthM, radiusM - innerRadiusM);
    const fromOuter = smoothStep(0, edgeWidthM, outerRadiusM - radiusM);

    return clampNumber(fromInner * fromOuter, 0, 1);
}

function disposeBodyRingGroup(group) {
    group.parent?.remove(group);
    group.traverse((object) => {
        if (!object.isMesh) {
            return;
        }

        object.geometry?.dispose();
        disposeBodyRingMaterial(object.material);
    });
}

function disposeBodyRingMaterial(material) {
    if (Array.isArray(material)) {
        material.forEach(disposeBodyRingMaterial);
        return;
    }

    material.map?.dispose();
    material.dispose();
}

function createSphereGeometry(radius, detail) {
    const geometry = new THREE.SphereGeometry(radius, detail, Math.max(12, Math.floor(detail / 2)));

    if (geometry.attributes.uv && !geometry.attributes.uv2) {
        geometry.setAttribute("uv2", geometry.attributes.uv.clone());
    }

    return geometry;
}

function createSelectionMarker() {
    const geometry = new THREE.SphereGeometry(1, 24, 12);
    const material = new THREE.MeshBasicMaterial({
        color: 0x8fdcd7,
        depthTest: true,
        depthWrite: false,
        opacity: 0.18,
        transparent: true,
        wireframe: true,
    });
    const marker = new THREE.Mesh(geometry, material);

    marker.renderOrder = 30;
    marker.visible = false;
    return marker;
}

function createOrbitLine(metadata, scale) {
    const geometry = createOrbitLineGeometry(metadata.orbit, scale);
    const material = new THREE.LineBasicMaterial({
        color: metadata.color || "#6ee7d8",
        depthWrite: false,
        opacity: 0.24,
        transparent: true,
    });
    const line = new THREE.LineLoop(geometry, material);

    line.renderOrder = 4;
    line.userData.bodyId = metadata.id;
    line.position.copy(getOrbitCenterScene(metadata.orbit, scale));
    return line;
}

function createTrail(metadata) {
    const material = new THREE.LineBasicMaterial({
        color: metadata.color || "#6ee7d8",
        depthWrite: false,
        opacity: 0.34,
        transparent: true,
    });
    const line = new THREE.Line(new THREE.BufferGeometry(), material);

    line.renderOrder = 3;
    line.visible = false;
    return {
        line,
        points: [],
    };
}

function disposeTrail(trail) {
    trail.line.parent?.remove(trail.line);
    trail.line.geometry.dispose();
    trail.line.material.dispose();
}

function getTrailPointLimit(trailSystem) {
    const limits = {
        short: 90,
        medium: 240,
        long: 720,
        infinite: 2400,
    };

    return limits[trailSystem] || limits.medium;
}

function createVectorLine(color) {
    const line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color,
            depthTest: false,
            depthWrite: false,
            opacity: 0.82,
            transparent: true,
        }),
    );

    line.renderOrder = 32;
    line.visible = false;
    return line;
}

function disposeVectorLine(line) {
    line.parent?.remove(line);
    line.geometry.dispose();
    line.material.dispose();
}

function createBarycenterMarker() {
    const geometry = new THREE.SphereGeometry(2.2, 16, 8);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffd36d,
        depthTest: false,
        depthWrite: false,
        opacity: 0.72,
        transparent: true,
        wireframe: true,
    });
    const marker = new THREE.Mesh(geometry, material);

    marker.renderOrder = 34;
    marker.visible = false;
    return marker;
}

function disposeBarycenterMarker(marker) {
    marker.geometry.dispose();
    marker.material.dispose();
}

function vectorMToScene(values, target = new THREE.Vector3()) {
    return target.set(
        Number(values[0]) || 0,
        Number(values[2]) || 0,
        Number(values[1]) || 0,
    );
}

function createOrbitLineGeometry(orbit, scale) {
    const segments = 256;
    const centerM = normalizeVector3M(orbit.centerM);
    const centerScene = scale.toScenePosition(centerM, new THREE.Vector3());
    const points = [];

    for (let index = 0; index < segments; index += 1) {
        const trueAnomalyRad = (index / segments) * Math.PI * 2;
        const pointM = createOrbitPointM(orbit, centerM, trueAnomalyRad);
        const pointScene = scale.toScenePosition(pointM, new THREE.Vector3());

        points.push(pointScene.sub(centerScene));
    }

    return new THREE.BufferGeometry().setFromPoints(points);
}

function getOrbitCenterScene(orbit, scale) {
    return scale.toScenePosition(normalizeVector3M(orbit.centerM), new THREE.Vector3());
}

function createOrbitPointM(orbit, centerM, trueAnomalyRad) {
    const eccentricity = clampNumber(Number(orbit.eccentricity || 0), 0, 0.98);
    const semiMajorAxisM = Math.max(Number(orbit.semiMajorAxisM || 0), 0);
    const radiusM = eccentricity === 0
        ? semiMajorAxisM
        : semiMajorAxisM * (1 - eccentricity * eccentricity)
            / (1 + eccentricity * Math.cos(trueAnomalyRad));
    const orbitalPoint = rotateOrbitPoint(
        [
            radiusM * Math.cos(trueAnomalyRad),
            radiusM * Math.sin(trueAnomalyRad),
            0,
        ],
        orbit,
    );

    return [
        centerM[0] + orbitalPoint[0],
        centerM[1] + orbitalPoint[1],
        centerM[2] + orbitalPoint[2],
    ];
}

function rotateOrbitPoint(point, orbit) {
    const argumentOfPeriapsisRad = Number(orbit.argumentOfPeriapsisRad || 0);
    const inclinationRad = Number(orbit.inclinationRad || 0);
    const longitudeOfAscendingNodeRad = Number(orbit.longitudeOfAscendingNodeRad || 0);

    return rotateAroundZ(
        rotateAroundX(
            rotateAroundZ(point, argumentOfPeriapsisRad),
            inclinationRad,
        ),
        longitudeOfAscendingNodeRad,
    );
}

function rotateAroundX(point, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    return [
        point[0],
        point[1] * cos - point[2] * sin,
        point[1] * sin + point[2] * cos,
    ];
}

function rotateAroundZ(point, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    return [
        point[0] * cos - point[1] * sin,
        point[0] * sin + point[1] * cos,
        point[2],
    ];
}

function createBodyLabel(body) {
    const canvas = document.createElement("canvas");
    const width = 256;
    const height = 80;
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        depthWrite: false,
        opacity: 0.94,
        transparent: true,
    });
    const label = new THREE.Sprite(material);

    canvas.width = width;
    canvas.height = height;

    if (THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
        texture.encoding = THREE.sRGBEncoding;
    }

    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    label.renderOrder = 35;
    label.userData.aspect = width / height;
    label.userData.bodyId = body.id;
    label.userData.fallbackName = body.name || body.id;
    label.userData.canvas = canvas;

    updateBodyLabelTexture(label, body);

    return label;
}

function updateBodyLabelTexture(label, body) {
    const canvas = label.userData.canvas;
    const texture = label.material?.map;

    if (!canvas || !texture) {
        return;
    }

    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const labelText = getRendererBodyDisplayName(body);

    context.clearRect(0, 0, width, height);
    context.font = "700 30px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowBlur = 16;
    context.shadowColor = "rgba(39, 221, 255, 0.78)";
    context.fillStyle = "rgba(255, 255, 255, 0.96)";
    context.fillText(labelText, width / 2, height / 2);
    context.shadowBlur = 0;
    texture.needsUpdate = true;
}

function getRendererBodyDisplayName(body) {
    const bodyId = body?.id;
    const fallback = body?.name || bodyId || "";

    return bodyId
        ? translateRendererText(`bodies.${bodyId}.name`, {}, fallback)
        : fallback;
}

function createDisplayScale() {
    const sunBodyId = "sun";
    const earthRadiusM = 6_371_000;
    const astronomicalUnitM = 149_597_870_700;
    const minPlanetRadius = 4.2;
    const planetRadiusMultiplier = 4.2;
    const maxPlanetRadius = 22;
    const sunRadius = 36;
    const innerSystemSceneUnitsPerAu = 150;
    const outerSystemSceneMultiplier = 105;
    const outerSystemDistanceExponent = 0.5;
    const innerSystemLinearLimitAu = 1;

    return {
        radiusForBody(body) {
            if (body.id === sunBodyId) {
                return sunRadius;
            }

            const earthRadiusRatio = Math.max(body.radiusM / earthRadiusM, 0.01);
            const compressedRadius = minPlanetRadius + Math.sqrt(earthRadiusRatio) * planetRadiusMultiplier;

            return Math.min(maxPlanetRadius, compressedRadius);
        },
        toScenePosition(positionM, target = new THREE.Vector3()) {
            const [x, y, z] = positionM;
            const distanceM = Math.hypot(x, y, z);

            if (distanceM === 0) {
                return target.set(0, 0, 0);
            }

            const distanceAu = distanceM / astronomicalUnitM;
            const sceneDistance = sceneDistanceForAu(distanceAu);

            return target
                .set(x, z, y)
                .multiplyScalar(sceneDistance / distanceM);
        },
    };

    function sceneDistanceForAu(distanceAu) {
        if (distanceAu <= innerSystemLinearLimitAu) {
            return distanceAu * innerSystemSceneUnitsPerAu;
        }

        return innerSystemSceneUnitsPerAu
            + Math.pow(
                distanceAu - innerSystemLinearLimitAu,
                outerSystemDistanceExponent,
            ) * outerSystemSceneMultiplier;
    }
}

function copyBodyMetadata(body) {
    return {
        ...body,
        facts: Array.isArray(body.facts) ? [...body.facts] : [],
        orbit: body.orbit
            ? {
                ...body.orbit,
                centerM: Array.isArray(body.orbit.centerM) ? [...body.orbit.centerM] : undefined,
            }
            : undefined,
        visual: body.visual
            ? {
                ...body.visual,
                textures: {
                    ...(body.visual.textures || {}),
                },
                rings: Array.isArray(body.visual.rings)
                    ? body.visual.rings.map((ring) => ({
                        ...ring,
                        bands: Array.isArray(ring.bands)
                            ? ring.bands.map((band) => ({ ...band }))
                            : [],
                    }))
                    : [],
            }
            : undefined,
    };
}

function hasExpectedOrbit(body) {
    return Boolean(body?.orbit)
        && Number.isFinite(Number(body.orbit.semiMajorAxisM))
        && Number(body.orbit.semiMajorAxisM) > 0;
}

function normalizeVector3M(values) {
    if (!Array.isArray(values) || values.length < 3) {
        return [0, 0, 0];
    }

    return [
        Number(values[0]) || 0,
        Number(values[1]) || 0,
        Number(values[2]) || 0,
    ];
}

function translateRendererText(key, values, fallback) {
    const i18n = window.SolarSim.i18n?.instance;

    if (!i18n) {
        return fallback;
    }

    const translated = i18n.t(key, values);

    return translated === key ? fallback : translated;
}

function formatRendererDecimal(value, fractionDigits) {
    return new Intl.NumberFormat(getRendererNumberLocale(), {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
    }).format(value);
}

function getRendererNumberLocale() {
    const language = window.SolarSim.i18n?.instance?.getLanguage?.();

    return language === "pt" ? "pt-PT" : "en-US";
}

function getMeshRadius(mesh) {
    return mesh.geometry?.parameters?.radius || 1;
}

function disposeOrbitLine(line) {
    line.parent?.remove(line);
    line.geometry.dispose();
    line.material.dispose();
}

function disposeSelectionMarker(marker) {
    marker.geometry.dispose();
    marker.material.dispose();
}

function disposeLabelSprite(label) {
    if (label.material?.map) {
        label.material.map.dispose();
    }

    label.material?.dispose();
}

function disposeMaterial(material) {
    if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
        return;
    }

    material.dispose();
}

function parseRendererHexColor(value) {
    const fallback = { r: 216, g: 196, b: 142 };

    if (typeof value !== "string") {
        return fallback;
    }

    const normalized = value.trim().replace(/^#/, "");
    const hex = normalized.length === 3
        ? normalized.split("").map((item) => item + item).join("")
        : normalized;

    if (!/^[\da-f]{6}$/i.test(hex)) {
        return fallback;
    }

    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
}

function rendererNoise2d(x, y) {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;

    return value - Math.floor(value);
}

function smoothStep(edge0, edge1, value) {
    const t = clampNumber((value - edge0) / (edge1 - edge0 || 1), 0, 1);

    return t * t * (3 - 2 * t);
}

function clampInteger(value, min, max) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
        return min;
    }

    return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }

    return Math.min(max, Math.max(min, value));
}

function getPixelRatio(store) {
    const quality = store?.getState()?.graphics?.renderQuality || "medium";

    if (quality === "low") {
        return 1;
    }

    if (quality === "high") {
        return Math.min(window.devicePixelRatio || 1, 2.5);
    }

    return Math.min(window.devicePixelRatio || 1, 2);
}
})();
