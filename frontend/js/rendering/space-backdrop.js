window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

(function initializeSpaceBackdropModule() {
window.SolarSim.rendering.addSpaceBackdrop = function addSpaceBackdrop(scene) {
    const backdrop = createBackdrop();

    scene.add(backdrop.group);

    return {
        update(elapsedS) {
            updateBackdrop(backdrop, elapsedS);
        },
    };
};

const STAR_FIELD_CONFIGS = [
    {
        count: 3600,
        radius: 4600,
        size: 3.2,
        opacity: 0.98,
        colors: ["#ffffff", "#9cc7ff", "#fff0bd"],
        rotationSpeed: { x: 0.0018, y: 0.0036, z: -0.0012 },
    },
    {
        count: 1900,
        radius: 4100,
        size: 5.6,
        opacity: 0.76,
        colors: ["#7fe7ff", "#ffb86f", "#d39bff"],
        rotationSpeed: { x: -0.0024, y: 0.0051, z: 0.0021 },
    },
    {
        count: 850,
        radius: 3500,
        size: 8.8,
        opacity: 0.48,
        colors: ["#4de1ff", "#ff5fd2", "#ffe16b"],
        rotationSpeed: { x: 0.0033, y: -0.0033, z: 0.0027 },
    },
];

function createBackdrop() {
    const group = new THREE.Group();
    const layers = STAR_FIELD_CONFIGS.map(createStarField);
    const glowStars = createGlowStars({
        count: 120,
        radius: 3300,
        rotationSpeed: { x: -0.0042, y: 0.006, z: 0.003 },
    });

    layers.forEach((layer) => group.add(layer));
    group.add(glowStars);
    group.renderOrder = -10;

    return {
        group,
        layers: [...layers, glowStars],
    };
}

function updateBackdrop(backdrop, elapsedS) {
    backdrop.layers.forEach((layer) => {
        const speed = layer.userData.rotationSpeed;

        layer.rotation.set(
            elapsedS * speed.x,
            elapsedS * speed.y,
            elapsedS * speed.z,
        );
    });
}

function createStarField({ count, radius, size, opacity, colors, rotationSpeed }) {
    const positions = new Float32Array(count * 3);
    const vertexColors = new Float32Array(count * 3);
    const palette = colors.map((color) => new THREE.Color(color));

    for (let index = 0; index < count; index += 1) {
        const position = randomPointInShell(radius * 0.46, radius);
        const color = pickPaletteColor(palette, index);
        const offset = index * 3;

        positions[offset] = position.x;
        positions[offset + 1] = position.y;
        positions[offset + 2] = position.z;
        vertexColors[offset] = color.r;
        vertexColors[offset + 1] = color.g;
        vertexColors[offset + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));

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
    stars.userData.rotationSpeed = rotationSpeed;

    return stars;
}

function createGlowStars({ count, radius, rotationSpeed }) {
    const group = new THREE.Group();
    const glowTexture = createGlowTexture();
    const palette = [
        new THREE.Color("#62e4ff"),
        new THREE.Color("#ff6edb"),
        new THREE.Color("#ffd36d"),
        new THREE.Color("#9e8cff"),
    ];

    for (let index = 0; index < count; index += 1) {
        const position = randomPointInShell(radius * 0.58, radius);
        const color = pickPaletteColor(palette, index * 3).lerp(new THREE.Color("#ffffff"), 0.18);
        const material = new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            opacity: 0.36 + pseudoRandom(index * 53) * 0.4,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const star = new THREE.Sprite(material);
        const starSize = 30 + pseudoRandom(index * 67) * 82;

        star.position.copy(position);
        star.scale.set(starSize, starSize, 1);
        group.add(star);
    }

    group.renderOrder = -9;
    group.userData.rotationSpeed = rotationSpeed;

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

function pickPaletteColor(palette, index) {
    const firstIndex = Math.floor(pseudoRandom(index * 17) * palette.length);
    const secondIndex = (firstIndex + 1 + Math.floor(pseudoRandom(index * 31) * (palette.length - 1))) % palette.length;

    return palette[firstIndex].clone().lerp(palette[secondIndex], pseudoRandom(index * 43));
}

function pseudoRandom(value) {
    const x = Math.sin(value) * 10000;
    return x - Math.floor(x);
}
})();
