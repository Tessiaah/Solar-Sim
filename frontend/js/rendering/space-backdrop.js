window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

(function initializeSpaceBackdropModule() {
window.SolarSim.rendering.addSpaceBackdrop = function addSpaceBackdrop(scene) {
    scene.add(createStarField({
        count: 1800,
        radius: 4200,
        size: 2.1,
        opacity: 0.92,
        colorA: new THREE.Color("#ffffff"),
        colorB: new THREE.Color("#8fb7ff"),
    }));

    scene.add(createStarField({
        count: 700,
        radius: 3600,
        size: 3.8,
        opacity: 0.62,
        colorA: new THREE.Color("#ffe2a8"),
        colorB: new THREE.Color("#c9f7ff"),
    }));

    scene.add(createGlowStars({
        count: 48,
        radius: 3100,
    }));
};

function createStarField({ count, radius, size, opacity, colorA, colorB }) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
        const position = randomPointInShell(radius * 0.46, radius);
        const color = colorA.clone().lerp(colorB, pseudoRandom(index * 41));
        const offset = index * 3;

        positions[offset] = position.x;
        positions[offset + 1] = position.y;
        positions[offset + 2] = position.z;
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size,
        opacity,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(geometry, material);
    stars.renderOrder = -10;

    return stars;
}

function createGlowStars({ count, radius }) {
    const group = new THREE.Group();
    const glowTexture = createGlowTexture();

    for (let index = 0; index < count; index += 1) {
        const position = randomPointInShell(radius * 0.58, radius);
        const color = new THREE.Color("#ffffff").lerp(
            new THREE.Color(index % 3 === 0 ? "#8fb7ff" : "#ffdca0"),
            0.34 + pseudoRandom(index * 29) * 0.36,
        );
        const material = new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            opacity: 0.28 + pseudoRandom(index * 53) * 0.34,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const star = new THREE.Sprite(material);
        const starSize = 14 + pseudoRandom(index * 67) * 38;

        star.position.copy(position);
        star.scale.set(starSize, starSize, 1);
        group.add(star);
    }

    group.renderOrder = -9;

    return group;
}

function createGlowTexture() {
    const canvas = document.createElement("canvas");
    const size = 128;
    const center = size / 2;

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(center, center, 0, center, center, center);

    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.18, "rgba(255, 255, 255, 0.78)");
    gradient.addColorStop(0.44, "rgba(160, 196, 255, 0.28)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);

    if (THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
        texture.encoding = THREE.sRGBEncoding;
    }

    return texture;
}

function randomPointInShell(innerRadius, outerRadius) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos((2 * v) - 1);
    const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
    const sinPhi = Math.sin(phi);

    return new THREE.Vector3(
        radius * sinPhi * Math.cos(theta),
        radius * Math.cos(phi),
        radius * sinPhi * Math.sin(theta),
    );
}

function pseudoRandom(value) {
    const x = Math.sin(value) * 10000;
    return x - Math.floor(x);
}
})();
