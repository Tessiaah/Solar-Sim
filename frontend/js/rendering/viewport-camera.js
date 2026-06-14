window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

(function initializeViewportCameraModule() {
window.SolarSim.rendering.createViewportCameraController = function createViewportCameraController({
    camera,
    domElement,
    onFlyInputStart,
    store,
}) {
    const flyController = window.SolarSim.rendering.createFlyCameraController({
        camera,
        domElement,
        onFlyInputStart,
        store,
    });
    const orbitController = createOrbitCameraController({
        camera,
        domElement,
        store,
    });
    let running = false;
    let activeMode = getNavigationMode(store);

    function start() {
        if (running) {
            return;
        }

        running = true;
        activeMode = getNavigationMode(store);
        getActiveController().start();
        window.addEventListener("solar-sim:camera-settings-applied", handleCameraSettingsApplied);
    }

    function stop() {
        if (!running) {
            return;
        }

        running = false;
        flyController.stop();
        orbitController.stop();
        window.removeEventListener("solar-sim:camera-settings-applied", handleCameraSettingsApplied);
    }

    function destroy() {
        stop();
        flyController.destroy();
        orbitController.destroy();
    }

    function focusOn(target, distance) {
        flyController.focusOn(target, distance);
        orbitController.focusOn(target, distance);
    }

    function lookAt(target) {
        flyController.lookAt(target);
        orbitController.lookAt(target);
    }

    function setCamera(nextCamera) {
        flyController.setCamera(nextCamera);
        orbitController.setCamera(nextCamera);
    }

    function update(deltaS) {
        getActiveController().update(deltaS);
    }

    function handleCameraSettingsApplied(event) {
        const nextMode = normalizeNavigationMode(event.detail?.camera?.navigationMode);

        if (nextMode === activeMode) {
            return;
        }

        getActiveController().stop();
        activeMode = nextMode;

        if (running) {
            getActiveController().start();
        }
    }

    function getActiveController() {
        return activeMode === "orbit"
            ? orbitController
            : flyController;
    }

    return {
        destroy,
        focusOn,
        lookAt,
        setCamera,
        start,
        stop,
        update,
    };
};

function createOrbitCameraController({
    camera: initialCamera,
    domElement,
    store,
}) {
    let camera = initialCamera;
    const target = new THREE.Vector3(0, 0, 0);
    const offset = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const pan = new THREE.Vector3();
    const spherical = new THREE.Spherical();

    let enabled = false;
    let dragging = false;
    let lastClientX = 0;
    let lastClientY = 0;
    let hasLastClientPosition = false;

    function start() {
        if (enabled) {
            return;
        }

        enabled = true;
        domElement.tabIndex = 0;
        domElement.addEventListener("mousedown", handleMouseDown);
        domElement.addEventListener("auxclick", preventAuxClick);
        domElement.addEventListener("wheel", handleWheel, { passive: false });
        document.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    }

    function stop() {
        if (!enabled) {
            return;
        }

        enabled = false;
        dragging = false;
        hasLastClientPosition = false;
        domElement.removeEventListener("mousedown", handleMouseDown);
        domElement.removeEventListener("auxclick", preventAuxClick);
        domElement.removeEventListener("wheel", handleWheel);
        document.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
    }

    function destroy() {
        stop();
    }

    function focusOn(nextTarget, distance) {
        target.copy(nextTarget);
        offset.copy(camera.position).sub(target);

        if (offset.lengthSq() === 0) {
            offset.set(0.35, 0.25, 1);
        }

        offset.normalize();
        camera.position.copy(target).addScaledVector(offset, clampZoomDistance(distance));
        lookAt(target);
    }

    function lookAt(nextTarget) {
        target.copy(nextTarget);
        camera.lookAt(target);
    }

    function setCamera(nextCamera) {
        camera = nextCamera;
    }

    function update() {
    }

    function handleMouseDown(event) {
        if (!enabled || event.button !== 1) {
            return;
        }

        dragging = true;
        lastClientX = event.clientX;
        lastClientY = event.clientY;
        hasLastClientPosition = true;
        domElement.focus({ preventScroll: true });
        event.preventDefault();
    }

    function handleMouseUp(event) {
        if (event.button !== 1) {
            return;
        }

        dragging = false;
        hasLastClientPosition = false;
        event.preventDefault();
    }

    function handleMouseMove(event) {
        if (!enabled || !dragging) {
            return;
        }

        const pointerDelta = getPointerDelta(event);

        if (pointerDelta.x === 0 && pointerDelta.y === 0) {
            return;
        }

        if (event.shiftKey) {
            panBy(pointerDelta.x, pointerDelta.y);
        } else {
            orbitBy(pointerDelta.x, pointerDelta.y);
        }

        event.preventDefault();
    }

    function handleWheel(event) {
        if (!enabled) {
            return;
        }

        zoomBy(event.deltaY);
        event.preventDefault();
    }

    function orbitBy(deltaX, deltaY) {
        offset.copy(camera.position).sub(target);

        if (offset.lengthSq() === 0) {
            offset.set(0, 0, clampZoomDistance(220));
        }

        spherical.setFromVector3(offset);
        spherical.theta -= deltaX * getOrbitSensitivity();
        spherical.phi = clamp(
            spherical.phi - deltaY * getOrbitSensitivity(),
            0.04,
            Math.PI - 0.04,
        );
        offset.setFromSpherical(spherical);
        camera.up.set(0, 1, 0);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
    }

    function panBy(deltaX, deltaY) {
        camera.updateMatrixWorld();
        right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

        const panScale = getPanScale();

        pan.copy(right)
            .multiplyScalar(-deltaX * panScale)
            .addScaledVector(up, deltaY * panScale);
        target.add(pan);
        camera.position.add(pan);
    }

    function zoomBy(deltaY) {
        if (camera.isOrthographicCamera) {
            const factor = deltaY > 0 ? 0.9 : 1.1;

            camera.zoom = clamp(camera.zoom * factor, 0.1, 10);
            camera.updateProjectionMatrix();
            return;
        }

        offset.copy(camera.position).sub(target);

        if (offset.lengthSq() === 0) {
            offset.set(0, 0, clampZoomDistance(220));
        }

        const currentDistance = offset.length();
        const nextDistance = clampZoomDistance(currentDistance * getZoomFactor(deltaY));

        offset.normalize().multiplyScalar(nextDistance);
        camera.position.copy(target).add(offset);
    }

    function getPointerDelta(event) {
        const movementX = Number(event.movementX);
        const movementY = Number(event.movementY);
        const fallbackX = hasLastClientPosition ? event.clientX - lastClientX : 0;
        const fallbackY = hasLastClientPosition ? event.clientY - lastClientY : 0;

        lastClientX = event.clientX;
        lastClientY = event.clientY;
        hasLastClientPosition = true;

        return {
            x: Number.isFinite(movementX) && movementX !== 0 ? movementX : fallbackX,
            y: Number.isFinite(movementY) && movementY !== 0 ? movementY : fallbackY,
        };
    }

    function getOrbitSensitivity() {
        const sensitivity = store?.getState().camera.mouseSensitivity ?? 1;

        return 0.0045 * clamp(Number(sensitivity) || 1, 0.1, 3);
    }

    function getPanScale() {
        const distance = Math.max(camera.position.distanceTo(target), 1);
        const sensitivity = store?.getState().camera.mouseSensitivity ?? 1;

        if (camera.isOrthographicCamera) {
            return distance * 0.0012 * clamp(Number(sensitivity) || 1, 0.1, 3);
        }

        return distance * 0.0016 * clamp(Number(sensitivity) || 1, 0.1, 3);
    }

    function getZoomFactor(deltaY) {
        return Math.exp(clamp(deltaY, -240, 240) * 0.0022);
    }

    function clampZoomDistance(distance) {
        return clamp(distance, getMinZoomDistance(), getMaxZoomDistance());
    }

    function getMinZoomDistance() {
        const value = store?.getState().camera.minZoomDistance ?? 5;

        return clamp(Number(value) || 5, 0.1, 1000);
    }

    function getMaxZoomDistance() {
        const value = store?.getState().camera.maxZoomDistance ?? 12000;

        return Math.max(getMinZoomDistance(), Number(value) || 12000);
    }

    function preventAuxClick(event) {
        if (event.button === 1) {
            event.preventDefault();
        }
    }

    return {
        destroy,
        focusOn,
        lookAt,
        setCamera,
        start,
        stop,
        update,
    };
}

function getNavigationMode(store) {
    return normalizeNavigationMode(store?.getState?.()?.camera?.navigationMode);
}

function normalizeNavigationMode(mode) {
    return mode === "orbit" ? "orbit" : "fly";
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

})();
