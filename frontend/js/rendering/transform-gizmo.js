window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

(function initializeTransformGizmoModule() {
window.SolarSim.rendering.createTransformGizmoController = function createTransformGizmoController({
    commitPositionM,
    domElement,
    getBodyMesh,
    getCamera,
    getSelectedBodyId,
    onPositionPreview,
    previewBodyParameters,
    scale,
    scene,
}) {
    const gizmo = createTransformGizmo();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane();
    const hitPoint = new THREE.Vector3();
    const dragDelta = new THREE.Vector3();

    let visible = false;
    let drag = null;

    scene.add(gizmo.root);
    domElement.addEventListener("pointerdown", handlePointerDown);
    domElement.addEventListener("pointermove", handlePointerMove);
    domElement.addEventListener("pointerup", handlePointerUp);
    domElement.addEventListener("pointercancel", handlePointerCancel);

    function destroy() {
        clearDrag();
        domElement.removeEventListener("pointerdown", handlePointerDown);
        domElement.removeEventListener("pointermove", handlePointerMove);
        domElement.removeEventListener("pointerup", handlePointerUp);
        domElement.removeEventListener("pointercancel", handlePointerCancel);
        disposeTransformGizmo(gizmo);
    }

    function setVisible(value) {
        visible = Boolean(value);
        update();
    }

    function update() {
        const mesh = getActiveBodyMesh();

        if (!visible || !mesh) {
            gizmo.root.visible = false;
            return;
        }

        const camera = getCamera();
        const radius = getMeshRadius(mesh);
        const cameraDistance = Math.max(camera.position.distanceTo(mesh.position), 1);
        const gizmoScale = clampTransformNumber(Math.max(radius * 1.75, cameraDistance * 0.065), 10, 92);

        gizmo.root.position.copy(mesh.position);
        gizmo.root.quaternion.identity();
        gizmo.root.scale.setScalar(gizmoScale);
        gizmo.root.visible = true;
    }

    function clearDrag() {
        if (drag?.bodyId) {
            previewBodyParameters?.(drag.bodyId, null);
            emitPositionPreview(drag.bodyId, null);
        }

        drag = null;
        domElement.classList.remove("is-transform-dragging");
    }

    function handlePointerDown(event) {
        if (event.button !== 0 || drag || !visible) {
            return;
        }

        const bodyId = getSelectedBodyId?.();
        const mesh = bodyId ? getBodyMesh?.(bodyId) : null;
        const handle = pickHandle(event);

        if (!bodyId || !mesh || !handle) {
            return;
        }

        const nextDrag = createDrag(event, bodyId, handle, mesh.position);

        if (!nextDrag) {
            return;
        }

        drag = nextDrag;
        domElement.classList.add("is-transform-dragging");
        capturePointer(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    }

    function handlePointerMove(event) {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        const hit = getPlaneHit(event, drag.plane);

        if (!hit) {
            return;
        }

        const nextScenePosition = getDragScenePosition(drag, hit);
        const positionM = scale.fromScenePosition(nextScenePosition);

        drag.lastPositionM = positionM;
        previewBodyParameters?.(drag.bodyId, { positionM });
        emitPositionPreview(drag.bodyId, positionM);
        update();
        event.preventDefault();
        event.stopPropagation();
    }

    function handlePointerUp(event) {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        finishDrag(event, true);
    }

    function handlePointerCancel(event) {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        finishDrag(event, false);
    }

    function finishDrag(event, shouldCommit) {
        const completedDrag = drag;

        drag = null;
        domElement.classList.remove("is-transform-dragging");
        releasePointer(event.pointerId);
        event.preventDefault();
        event.stopPropagation();

        if (shouldCommit && completedDrag?.lastPositionM) {
            commitDragPosition(completedDrag.bodyId, completedDrag.lastPositionM);
            return;
        }

        if (completedDrag?.bodyId) {
            previewBodyParameters?.(completedDrag.bodyId, null);
            emitPositionPreview(completedDrag.bodyId, null);
        }
    }

    async function commitDragPosition(bodyId, positionM) {
        if (!bodyId || !Array.isArray(positionM)) {
            return;
        }

        const response = await commitPositionM?.(bodyId, positionM);

        if (!response?.ok) {
            previewBodyParameters?.(bodyId, null);
        }

        emitPositionPreview(bodyId, null);
    }

    function pickHandle(event) {
        const camera = getCamera();

        updatePointer(event);
        raycaster.setFromCamera(pointer, camera);

        const intersections = raycaster.intersectObjects(gizmo.handles, true);

        for (const intersection of intersections) {
            const handle = getTransformHandleData(intersection.object);

            if (handle) {
                return handle;
            }
        }

        return null;
    }

    function createDrag(event, bodyId, handle, bodyScenePosition) {
        const axes = handle.axes.map(getTransformSceneAxisVector);
        const normal = getDragPlaneNormal(handle.mode, axes);

        if (!normal || normal.lengthSq() === 0) {
            return null;
        }

        dragPlane.setFromNormalAndCoplanarPoint(normal, bodyScenePosition);

        const startHit = getPlaneHit(event, dragPlane);

        if (!startHit) {
            return null;
        }

        return {
            axes,
            bodyId,
            currentScenePosition: new THREE.Vector3(),
            handle,
            lastPositionM: scale.fromScenePosition(bodyScenePosition.clone()),
            mode: handle.mode,
            plane: dragPlane.clone(),
            pointerId: event.pointerId,
            startHit: startHit.clone(),
            startScenePosition: bodyScenePosition.clone(),
        };
    }

    function getPlaneHit(event, plane) {
        const camera = getCamera();

        updatePointer(event);
        raycaster.setFromCamera(pointer, camera);

        return raycaster.ray.intersectPlane(plane, hitPoint);
    }

    function getDragScenePosition(activeDrag, hit) {
        dragDelta.copy(hit).sub(activeDrag.startHit);
        activeDrag.currentScenePosition.copy(activeDrag.startScenePosition);

        if (activeDrag.mode === "axis") {
            const axis = activeDrag.axes[0];

            activeDrag.currentScenePosition.addScaledVector(axis, dragDelta.dot(axis));
            return activeDrag.currentScenePosition;
        }

        if (activeDrag.mode === "plane") {
            activeDrag.axes.forEach((axis) => {
                activeDrag.currentScenePosition.addScaledVector(axis, dragDelta.dot(axis));
            });
            return activeDrag.currentScenePosition;
        }

        activeDrag.currentScenePosition.add(dragDelta);
        return activeDrag.currentScenePosition;
    }

    function getDragPlaneNormal(mode, axes) {
        const camera = getCamera();
        const normal = new THREE.Vector3();

        if (mode === "axis") {
            const axis = axes[0];
            const viewDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();

            normal.copy(axis).cross(viewDirection).cross(axis);

            if (normal.lengthSq() < 0.000001) {
                const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
                normal.copy(axis).cross(cameraUp).cross(axis);
            }

            return normal.lengthSq() > 0 ? normal.normalize() : getAnyPerpendicularVector(axis);
        }

        if (mode === "plane") {
            normal.copy(axes[0]).cross(axes[1]);

            return normal.lengthSq() > 0 ? normal.normalize() : null;
        }

        return camera.getWorldDirection(normal).normalize();
    }

    function updatePointer(event) {
        const rect = domElement.getBoundingClientRect();
        const width = Math.max(rect.width, 1);
        const height = Math.max(rect.height, 1);

        pointer.set(
            ((event.clientX - rect.left) / width) * 2 - 1,
            -(((event.clientY - rect.top) / height) * 2 - 1),
        );
    }

    function getActiveBodyMesh() {
        const bodyId = getSelectedBodyId?.();

        return bodyId ? getBodyMesh?.(bodyId) : null;
    }

    function emitPositionPreview(bodyId, positionM) {
        if (typeof onPositionPreview === "function") {
            onPositionPreview(bodyId, Array.isArray(positionM) ? [...positionM] : null);
        }
    }

    function capturePointer(pointerId) {
        try {
            domElement.setPointerCapture(pointerId);
        } catch (_error) {
            // Pointer capture is best-effort in embedded browser engines.
        }
    }

    function releasePointer(pointerId) {
        try {
            domElement.releasePointerCapture(pointerId);
        } catch (_error) {
            // Some WebView engines release capture automatically.
        }
    }

    return {
        clearDrag,
        destroy,
        setVisible,
        update,
    };
};

function createTransformGizmo() {
    const root = new THREE.Group();
    const handles = [];

    root.visible = false;

    [
        ["x", 0xf05262],
        ["y", 0x78d24f],
        ["z", 0x4a94ff],
    ].forEach(([axisName, color]) => {
        root.add(createTransformAxisHandle(axisName, color, handles));
    });

    [
        ["x", "y", 0xf0c84b],
        ["x", "z", 0xd673ff],
        ["y", "z", 0x59d8ff],
    ].forEach(([axisA, axisB, color]) => {
        root.add(createTransformPlaneHandle(axisA, axisB, color, handles));
    });

    const centerHandle = {
        axes: [],
        mode: "free",
    };
    const center = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 24, 12),
        createTransformMaterial(0xf7fbff, 0.88),
    );

    center.renderOrder = 58;
    center.userData.transformHandle = centerHandle;
    handles.push(center);
    root.add(center);

    return {
        handles,
        root,
    };
}

function createTransformAxisHandle(axisName, color, handles) {
    const axis = getTransformSceneAxisVector(axisName);
    const group = new THREE.Group();
    const handle = {
        axes: [axisName],
        mode: "axis",
    };
    const material = createTransformMaterial(color, 0.9);
    const pickerMaterial = createTransformPickerMaterial();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.74, 14), material);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 18), material);
    const picker = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.08, 10), pickerMaterial);

    shaft.position.copy(axis).multiplyScalar(0.42);
    cone.position.copy(axis).multiplyScalar(0.88);
    picker.position.copy(axis).multiplyScalar(0.5);
    alignTransformObjectToAxis(shaft, axis);
    alignTransformObjectToAxis(cone, axis);
    alignTransformObjectToAxis(picker, axis);

    [shaft, cone, picker].forEach((mesh) => {
        mesh.renderOrder = 56;
        mesh.userData.transformHandle = handle;
        handles.push(mesh);
        group.add(mesh);
    });

    return group;
}

function createTransformPlaneHandle(axisAName, axisBName, color, handles) {
    const axisA = getTransformSceneAxisVector(axisAName);
    const axisB = getTransformSceneAxisVector(axisBName);
    const handle = {
        axes: [axisAName, axisBName],
        mode: "plane",
    };
    const start = 0.2;
    const size = 0.24;
    const points = [
        axisA.clone().multiplyScalar(start).addScaledVector(axisB, start),
        axisA.clone().multiplyScalar(start + size).addScaledVector(axisB, start),
        axisA.clone().multiplyScalar(start + size).addScaledVector(axisB, start + size),
        axisA.clone().multiplyScalar(start).addScaledVector(axisB, start + size),
    ];
    const geometry = new THREE.BufferGeometry();
    const material = createTransformMaterial(color, 0.24);
    const mesh = new THREE.Mesh(geometry, material);

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(points.flatMap((point) => [point.x, point.y, point.z]), 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    material.side = THREE.DoubleSide;

    mesh.renderOrder = 54;
    mesh.userData.transformHandle = handle;
    handles.push(mesh);

    return mesh;
}

function createTransformMaterial(color, opacity) {
    return new THREE.MeshBasicMaterial({
        color,
        depthTest: false,
        depthWrite: false,
        opacity,
        toneMapped: false,
        transparent: opacity < 1,
    });
}

function createTransformPickerMaterial() {
    return new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        depthWrite: false,
        opacity: 0.001,
        transparent: true,
    });
}

function alignTransformObjectToAxis(object, axis) {
    object.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        axis.clone().normalize(),
    );
}

function getTransformHandleData(object) {
    let current = object;

    while (current) {
        if (current.userData?.transformHandle) {
            return current.userData.transformHandle;
        }

        current = current.parent;
    }

    return null;
}

function getTransformSceneAxisVector(axisName) {
    if (axisName === "x") {
        return new THREE.Vector3(1, 0, 0);
    }

    if (axisName === "y") {
        return new THREE.Vector3(0, 0, 1);
    }

    if (axisName === "z") {
        return new THREE.Vector3(0, 1, 0);
    }

    return new THREE.Vector3(0, 0, 0);
}

function getAnyPerpendicularVector(axis) {
    const fallback = Math.abs(axis.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);

    fallback.addScaledVector(axis, -fallback.dot(axis));

    return fallback.lengthSq() > 0 ? fallback.normalize() : new THREE.Vector3(1, 0, 0);
}

function disposeTransformGizmo(gizmo) {
    gizmo.root.parent?.remove(gizmo.root);
    gizmo.root.traverse((object) => {
        if (!object.isMesh) {
            return;
        }

        object.geometry?.dispose();
        disposeTransformMaterial(object.material);
    });
    gizmo.handles.length = 0;
}

function disposeTransformMaterial(material) {
    if (Array.isArray(material)) {
        material.forEach(disposeTransformMaterial);
        return;
    }

    material?.dispose();
}

function clampTransformNumber(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }

    return Math.min(max, Math.max(min, value));
}

function getMeshRadius(mesh) {
    return mesh.geometry?.parameters?.radius || 1;
}
})();
