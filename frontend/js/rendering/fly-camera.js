window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

(function initializeFlyCameraModule() {
window.SolarSim.rendering.createFlyCameraController = function createFlyCameraController({
    camera: initialCamera,
    domElement,
    onFlyInputStart,
    store,
}) {
    let camera = initialCamera;
    const pressedKeys = new Set();
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();

    let enabled = false;
    let looking = false;

    camera.rotation.reorder("YXZ");

    let yaw = camera.rotation.y;
    let pitch = camera.rotation.x;

    function start() {
        if (enabled) {
            return;
        }

        enabled = true;
        domElement.tabIndex = 0;
        domElement.addEventListener("contextmenu", preventContextMenu);
        domElement.addEventListener("mousedown", handleMouseDown);
        domElement.addEventListener("wheel", handleWheel, { passive: false });
        document.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
    }

    function stop() {
        if (!enabled) {
            return;
        }

        enabled = false;
        looking = false;
        pressedKeys.clear();
        domElement.removeEventListener("contextmenu", preventContextMenu);
        domElement.removeEventListener("mousedown", handleMouseDown);
        domElement.removeEventListener("wheel", handleWheel);
        document.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        applyLookState();
    }

    function destroy() {
        stop();
    }

    function focusOn(target, distance) {
        direction.copy(camera.position).sub(target);

        if (direction.lengthSq() === 0) {
            direction.set(0.35, 0.25, 1);
        }

        direction.normalize();
        camera.position.copy(target).addScaledVector(direction, clampZoomDistance(distance));
        lookAt(target);
    }

    function lookAt(target) {
        camera.lookAt(target);
        syncAnglesFromCamera();
    }

    function setCamera(nextCamera) {
        camera = nextCamera;
        camera.rotation.reorder("YXZ");
        syncAnglesFromCamera();
    }

    function syncAnglesFromCamera() {
        yaw = camera.rotation.y;
        pitch = camera.rotation.x;
    }

    function update(deltaS) {
        if (!enabled || deltaS <= 0) {
            return;
        }

        const movement = getMovementVector();

        if (movement.lengthSq() === 0) {
            return;
        }

        movement.normalize().multiplyScalar(getMoveSpeed() * deltaS);
        camera.position.add(movement);
    }

    function handleMouseDown(event) {
        if (!enabled || event.button !== 2) {
            return;
        }

        requestFlyInputStart();
        looking = true;
        domElement.focus({ preventScroll: true });
        applyLookState();
        event.preventDefault();
    }

    function handleMouseUp(event) {
        if (event.button !== 2) {
            return;
        }

        looking = false;
        applyLookState();
    }

    function handleWheel(event) {
        if (!enabled) {
            return;
        }

        requestFlyInputStart();

        if (camera.isOrthographicCamera) {
            camera.zoom = clamp(
                camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1),
                0.1,
                8,
            );
            camera.updateProjectionMatrix();
            event.preventDefault();
            return;
        }

        camera.getWorldDirection(direction);
        camera.position.addScaledVector(direction, getScrollZoomDistance(event.deltaY));
        clampCameraDistanceFromOrigin();
        event.preventDefault();
    }

    function handleMouseMove(event) {
        if (!enabled || !looking) {
            return;
        }

        const sensitivity = getMouseSensitivity();

        yaw -= event.movementX * sensitivity;
        pitch -= event.movementY * sensitivity;
        pitch = clamp(pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);

        camera.rotation.set(pitch, yaw, 0);
    }

    function preventContextMenu(event) {
        event.preventDefault();
    }

    function applyLookState() {
        domElement.classList.toggle("is-camera-looking", looking);
        document.body.classList.toggle("is-simulation-camera-looking", looking);
    }

    function handleKeyDown(event) {
        if (!enabled || shouldIgnoreKeyboardEvent(event)) {
            return;
        }

        if (isMovementKey(event.code)) {
            requestFlyInputStart();
        }

        pressedKeys.add(event.code);
        preventCameraKeyScroll(event);
    }

    function handleKeyUp(event) {
        pressedKeys.delete(event.code);
    }

    function getMovementVector() {
        velocity.set(0, 0, 0);

        camera.updateMatrixWorld();
        camera.getWorldDirection(direction);
        right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

        if (pressedKeys.has("KeyW")) {
            velocity.add(direction);
        }

        if (pressedKeys.has("KeyS")) {
            velocity.sub(direction);
        }

        if (pressedKeys.has("KeyD")) {
            velocity.add(right);
        }

        if (pressedKeys.has("KeyA")) {
            velocity.sub(right);
        }

        if (pressedKeys.has("Space") || pressedKeys.has("KeyE")) {
            velocity.add(up);
        }

        if (pressedKeys.has("ControlLeft") || pressedKeys.has("ControlRight") || pressedKeys.has("KeyQ")) {
            velocity.sub(up);
        }

        return velocity;
    }

    function getMoveSpeed() {
        const fastMultiplier = pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight") ? 3.2 : 1;
        const configuredSpeed = store?.getState().camera.moveSpeed ?? 135;

        return clamp(configuredSpeed, 20, 420) * fastMultiplier;
    }

    function getScrollZoomDistance(deltaY) {
        const clampedDelta = clamp(deltaY, -240, 240);
        return -clampedDelta * 0.62;
    }

    function getMouseSensitivity() {
        const sensitivity = store?.getState().camera.mouseSensitivity ?? 1;
        return 0.0025 * sensitivity;
    }

    function clampCameraDistanceFromOrigin() {
        const distance = camera.position.length();

        if (distance === 0) {
            camera.position.set(0, 0, getMinZoomDistance());
            return;
        }

        const clampedDistance = clampZoomDistance(distance);

        if (clampedDistance !== distance) {
            camera.position.multiplyScalar(clampedDistance / distance);
        }
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

    function shouldIgnoreKeyboardEvent(event) {
        const tagName = event.target?.tagName?.toLowerCase();

        if (isMovementKey(event.code) && event.target?.closest?.("[data-orientation-gizmo]")) {
            return false;
        }

        return tagName === "input"
            || tagName === "textarea"
            || tagName === "select"
            || tagName === "button"
            || tagName === "summary"
            || Boolean(event.target?.closest?.("[data-camera-menu]"))
            || event.target?.isContentEditable;
    }

    function preventCameraKeyScroll(event) {
        if (
            isMovementKey(event.code)
        ) {
            event.preventDefault();
        }
    }

    function isMovementKey(code) {
        return code === "Space"
            || code === "KeyW"
            || code === "KeyA"
            || code === "KeyS"
            || code === "KeyD"
            || code === "KeyQ"
            || code === "KeyE";
    }

    function requestFlyInputStart() {
        if (typeof onFlyInputStart === "function") {
            onFlyInputStart();
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
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

})();
