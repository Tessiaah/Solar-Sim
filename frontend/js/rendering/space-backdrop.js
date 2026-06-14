window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

(function initializeSpaceBackdropModule() {
window.SolarSim.rendering.addSpaceBackdrop = function addSpaceBackdrop(scene, initialQuality = "full") {
    let backdrop = createBackdrop(initialQuality);
    let currentQuality = normalizeBackdropQuality(initialQuality);

    scene.add(backdrop.group);

    return {
        applyQuality(nextQuality) {
            const safeQuality = normalizeBackdropQuality(nextQuality);

            if (safeQuality === currentQuality) {
                return;
            }

            scene.remove(backdrop.group);
            disposeBackdrop(backdrop);
            backdrop = createBackdrop(safeQuality);
            currentQuality = safeQuality;
            scene.add(backdrop.group);
        },
        dispose() {
            scene.remove(backdrop.group);
            disposeBackdrop(backdrop);
        },
        update(elapsedS) {
            updateBackdrop(backdrop, elapsedS);
        },
    };
};

const STAR_FIELD_CONFIGS = [
    {
        count: 6200,
        radius: 4600,
        size: 1.95,
        opacity: 1,
        colors: ["#ffffff", "#edf5ff", "#fff7df"],
        rotationSpeed: { x: 0.0018, y: 0.0036, z: -0.0012 },
    },
    {
        count: 2600,
        radius: 4100,
        size: 2.45,
        opacity: 0.92,
        colors: ["#d8f4ff", "#ffe2b8", "#f0e8ff"],
        rotationSpeed: { x: -0.0024, y: 0.0051, z: 0.0021 },
    },
    {
        count: 900,
        radius: 3500,
        size: 3.25,
        opacity: 0.52,
        colors: ["#bceeff", "#ffd2ea", "#fff0a8"],
        rotationSpeed: { x: 0.0033, y: -0.0033, z: 0.0027 },
    },
];

const DUST_BAND_CONFIG = {
    count: 3600,
    radius: 4400,
    size: 4.8,
    opacity: 0.2,
    colors: ["#a9c8ff", "#fff1cf", "#d9e7ff", "#f7cfbd"],
    rotation: { x: 0.36, y: -0.48, z: 0.18 },
    rotationSpeed: { x: 0.0006, y: 0.0011, z: -0.0004 },
};

const NEBULA_GLOW_CONFIGS = [
    {
        positionSeed: 19,
        direction: [-0.34, 0.3, -1],
        color: "#385f9c",
        opacity: 0.16,
        size: 840,
    },
    {
        positionSeed: 43,
        direction: [0.52, -0.18, -1],
        color: "#8463a8",
        opacity: 0.13,
        size: 700,
    },
    {
        positionSeed: 71,
        direction: [-0.08, -0.42, -1],
        color: "#8d6f45",
        opacity: 0.11,
        size: 620,
    },
];

const DISTANT_GALAXY_CONFIGS = [
    {
        positionSeed: 101,
        direction: [-0.5, 0.46, -1],
        color: "#dbe8ff",
        opacity: 0.24,
        size: { x: 300, y: 78 },
    },
    {
        positionSeed: 149,
        direction: [0.62, 0.34, -1],
        color: "#ffe4bd",
        opacity: 0.2,
        size: { x: 235, y: 62 },
    },
    {
        positionSeed: 211,
        direction: [0.1, -0.55, -1],
        color: "#c9d8ff",
        opacity: 0.18,
        size: { x: 195, y: 52 },
    },
];

const STAR_CLUSTER_CONFIGS = [
    {
        positionSeed: 307,
        direction: [0.34, 0.54, -1],
        color: "#eef6ff",
        opacity: 0.36,
        size: 170,
    },
    {
        positionSeed: 359,
        direction: [-0.72, -0.2, -1],
        color: "#fff2cf",
        opacity: 0.31,
        size: 145,
    },
];

const DUST_WISP_CONFIGS = [
    {
        positionSeed: 421,
        direction: [0.18, 0.12, -1],
        color: "#6f8fbd",
        opacity: 0.14,
        size: { x: 650, y: 160 },
    },
    {
        positionSeed: 463,
        direction: [-0.48, -0.48, -1],
        color: "#9b7eaa",
        opacity: 0.12,
        size: { x: 540, y: 138 },
    },
];

const ZERO_ROTATION = { x: 0, y: 0, z: 0 };

const BACKDROP_QUALITY_PROFILES = {
    low: {
        starLayerCount: 1,
        starCountScale: 0.42,
        dustBand: false,
        nebula: false,
        galaxies: false,
        clusters: false,
        wisps: false,
        glowStars: false,
    },
    medium: {
        starLayerCount: 2,
        starCountScale: 0.68,
        dustBand: true,
        nebula: true,
        galaxies: false,
        clusters: true,
        wisps: false,
        glowStars: true,
        glowStarScale: 0.56,
    },
    full: {
        starLayerCount: 3,
        starCountScale: 1,
        dustBand: true,
        nebula: true,
        galaxies: true,
        clusters: true,
        wisps: true,
        glowStars: true,
        glowStarScale: 1,
    },
};

function createBackdrop(quality) {
    const profile = getBackdropQualityProfile(quality);
    const group = new THREE.Group();
    const pointTexture = createPointStarTexture();
    const dustTexture = createDustTexture();
    const glowTexture = createGlowTexture();
    const galaxyTexture = createDistantGalaxyTexture();
    const clusterTexture = createStarClusterTexture();
    const wispTexture = createDustWispTexture();
    const layers = STAR_FIELD_CONFIGS
        .slice(0, profile.starLayerCount)
        .map((config) => createStarField({
            ...scaleBackdropCountConfig(config, profile.starCountScale),
            pointTexture,
        }));
    const dustBand = profile.dustBand
        ? createGalacticDustBand({
            ...scaleBackdropCountConfig(DUST_BAND_CONFIG, profile.starCountScale),
            dustTexture,
        })
        : null;
    const nebulaGlows = profile.nebula
        ? createNebulaGlows({
            glowTexture,
            configs: NEBULA_GLOW_CONFIGS,
            radius: 3900,
        })
        : null;
    const distantGalaxies = profile.galaxies
        ? createDistantGalaxies({
            configs: DISTANT_GALAXY_CONFIGS,
            galaxyTexture,
            radius: 4300,
        })
        : null;
    const starClusters = profile.clusters
        ? createStarClusters({
            clusterTexture,
            configs: STAR_CLUSTER_CONFIGS,
            radius: 4200,
        })
        : null;
    const dustWisps = profile.wisps
        ? createDustWisps({
            configs: DUST_WISP_CONFIGS,
            radius: 4050,
            wispTexture,
        })
        : null;
    const glowStars = profile.glowStars
        ? createGlowStars({
            count: Math.max(18, Math.round(120 * (profile.glowStarScale || 1))),
            radius: 3300,
            glowTexture,
            rotationSpeed: { x: -0.0042, y: 0.006, z: 0.003 },
        })
        : null;

    layers.forEach((layer) => group.add(layer));
    [
        dustBand,
        nebulaGlows?.group,
        distantGalaxies?.group,
        starClusters?.group,
        dustWisps?.group,
        glowStars?.group,
    ].filter(Boolean).forEach((layer) => group.add(layer));
    group.renderOrder = -10;

    return {
        group,
        layers: [
            ...layers,
            dustBand,
            nebulaGlows?.group,
            distantGalaxies?.group,
            starClusters?.group,
            dustWisps?.group,
            glowStars?.group,
        ].filter(Boolean),
        textures: [pointTexture, dustTexture, glowTexture, galaxyTexture, clusterTexture, wispTexture],
    };
}

function getBackdropQualityProfile(quality) {
    return BACKDROP_QUALITY_PROFILES[normalizeBackdropQuality(quality)] || BACKDROP_QUALITY_PROFILES.full;
}

function normalizeBackdropQuality(quality) {
    return ["low", "medium", "full"].includes(quality) ? quality : "full";
}

function scaleBackdropCountConfig(config, scale) {
    return {
        ...config,
        count: Math.max(1, Math.round(config.count * scale)),
    };
}

function updateBackdrop(backdrop, elapsedS) {
    backdrop.layers.forEach((layer) => {
        const speed = layer.userData.rotationSpeed;
        const base = layer.userData.baseRotation || ZERO_ROTATION;

        layer.rotation.set(
            base.x + elapsedS * speed.x,
            base.y + elapsedS * speed.y,
            base.z + elapsedS * speed.z,
        );
    });
}

function createStarField({ count, radius, size, opacity, colors, rotationSpeed, pointTexture }) {
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
        map: pointTexture,
        size,
        opacity,
        transparent: true,
        alphaTest: 0.001,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(geometry, material);
    stars.renderOrder = -10;
    stars.userData.baseRotation = ZERO_ROTATION;
    stars.userData.rotationSpeed = rotationSpeed;

    return stars;
}

function createGalacticDustBand({ count, radius, size, opacity, colors, rotation, rotationSpeed, dustTexture }) {
    const positions = new Float32Array(count * 3);
    const vertexColors = new Float32Array(count * 3);
    const palette = colors.map((color) => new THREE.Color(color));

    for (let index = 0; index < count; index += 1) {
        const longitude = pseudoRandom(index * 23) * Math.PI * 2;
        const latitude = bellRandom(index * 37) * 0.22;
        const localRadius = radius * (0.72 + pseudoRandom(index * 41) * 0.28);
        const sinPhi = Math.cos(latitude);
        const position = new THREE.Vector3(
            localRadius * sinPhi * Math.cos(longitude),
            localRadius * Math.sin(latitude),
            localRadius * sinPhi * Math.sin(longitude),
        );
        const color = pickPaletteColor(palette, index).lerp(new THREE.Color("#ffffff"), 0.32);
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
        map: dustTexture,
        size,
        opacity,
        transparent: true,
        alphaTest: 0.001,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
    });

    const dustBand = new THREE.Points(geometry, material);
    dustBand.rotation.set(rotation.x, rotation.y, rotation.z);
    dustBand.renderOrder = -11;
    dustBand.userData.baseRotation = rotation;
    dustBand.userData.rotationSpeed = rotationSpeed;

    return dustBand;
}

function createNebulaGlows({ configs, glowTexture, radius }) {
    const group = new THREE.Group();

    configs.forEach((config) => {
        const material = new THREE.SpriteMaterial({
            map: glowTexture,
            color: new THREE.Color(config.color),
            opacity: config.opacity,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const glow = new THREE.Sprite(material);
        const position = getBackdropFeaturePosition(config, radius);

        glow.position.copy(position);
        glow.scale.set(config.size, config.size, 1);
        group.add(glow);
    });

    group.renderOrder = -12;
    group.userData.baseRotation = ZERO_ROTATION;
    group.userData.rotationSpeed = { x: 0.0003, y: -0.0008, z: 0.0002 };

    return {
        group,
    };
}

function createDistantGalaxies({ configs, galaxyTexture, radius }) {
    const group = new THREE.Group();

    configs.forEach((config) => {
        const material = new THREE.SpriteMaterial({
            map: galaxyTexture,
            color: new THREE.Color(config.color),
            opacity: config.opacity,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const galaxy = new THREE.Sprite(material);
        const position = getBackdropFeaturePosition(config, radius);
        const scaleMultiplier = 0.84 + pseudoRandom(config.positionSeed * 7) * 0.34;

        galaxy.position.copy(position);
        galaxy.scale.set(config.size.x * scaleMultiplier, config.size.y * scaleMultiplier, 1);
        group.add(galaxy);
    });

    group.renderOrder = -13;
    group.userData.baseRotation = ZERO_ROTATION;
    group.userData.rotationSpeed = { x: -0.0002, y: 0.0005, z: 0.0001 };

    return {
        group,
    };
}

function createStarClusters({ configs, clusterTexture, radius }) {
    const group = new THREE.Group();

    configs.forEach((config) => {
        const material = new THREE.SpriteMaterial({
            map: clusterTexture,
            color: new THREE.Color(config.color),
            opacity: config.opacity,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const cluster = new THREE.Sprite(material);
        const position = getBackdropFeaturePosition(config, radius);

        cluster.position.copy(position);
        cluster.scale.set(config.size, config.size, 1);
        group.add(cluster);
    });

    group.renderOrder = -8;
    group.userData.baseRotation = ZERO_ROTATION;
    group.userData.rotationSpeed = { x: 0.0008, y: -0.0003, z: 0.0004 };

    return {
        group,
    };
}

function createDustWisps({ configs, radius, wispTexture }) {
    const group = new THREE.Group();

    configs.forEach((config) => {
        const material = new THREE.SpriteMaterial({
            map: wispTexture,
            color: new THREE.Color(config.color),
            opacity: config.opacity,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const wisp = new THREE.Sprite(material);
        const position = getBackdropFeaturePosition(config, radius);
        const scaleMultiplier = 0.88 + pseudoRandom(config.positionSeed * 5) * 0.26;

        wisp.position.copy(position);
        wisp.scale.set(config.size.x * scaleMultiplier, config.size.y * scaleMultiplier, 1);
        group.add(wisp);
    });

    group.renderOrder = -14;
    group.userData.baseRotation = ZERO_ROTATION;
    group.userData.rotationSpeed = { x: 0.0004, y: 0.0002, z: -0.0005 };

    return {
        group,
    };
}

function createGlowStars({ count, radius, glowTexture, rotationSpeed }) {
    const group = new THREE.Group();
    const palette = [
        new THREE.Color("#b8ecff"),
        new THREE.Color("#ffe6c4"),
        new THREE.Color("#ffd36d"),
        new THREE.Color("#cfc5ff"),
    ];

    for (let index = 0; index < count; index += 1) {
        const position = randomPointInShell(radius * 0.58, radius);
        const color = pickPaletteColor(palette, index * 3).lerp(new THREE.Color("#ffffff"), 0.18);
        const material = new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            opacity: 0.18 + pseudoRandom(index * 53) * 0.24,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const star = new THREE.Sprite(material);
        const starSize = 22 + pseudoRandom(index * 67) * 54;

        star.position.copy(position);
        star.scale.set(starSize, starSize, 1);
        group.add(star);
    }

    group.renderOrder = -9;
    group.userData.baseRotation = ZERO_ROTATION;
    group.userData.rotationSpeed = rotationSpeed;

    return {
        group,
    };
}

function createPointStarTexture() {
    const canvas = document.createElement("canvas");
    const size = 64;
    const center = size / 2;

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(center, center, 0, center, center, center);

    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.16, "rgba(255, 255, 255, 0.96)");
    gradient.addColorStop(0.46, "rgba(255, 255, 255, 0.56)");
    gradient.addColorStop(0.78, "rgba(255, 255, 255, 0.18)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    return createCanvasTexture(canvas);
}

function createDustTexture() {
    const canvas = document.createElement("canvas");
    const size = 96;
    const center = size / 2;

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(center, center, 0, center, center, center);

    gradient.addColorStop(0, "rgba(255, 255, 255, 0.62)");
    gradient.addColorStop(0.28, "rgba(255, 255, 255, 0.22)");
    gradient.addColorStop(0.72, "rgba(255, 255, 255, 0.06)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    return createCanvasTexture(canvas);
}

function createDistantGalaxyTexture() {
    const canvas = document.createElement("canvas");
    const width = 256;
    const height = 96;
    const centerX = width / 2;
    const centerY = height / 2;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    const halo = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.46);

    halo.addColorStop(0, "rgba(255, 255, 255, 0.82)");
    halo.addColorStop(0.16, "rgba(255, 255, 255, 0.36)");
    halo.addColorStop(0.46, "rgba(255, 255, 255, 0.13)");
    halo.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.save();
    context.translate(centerX, centerY);
    context.scale(1, 0.27);
    context.fillStyle = halo;
    context.fillRect(-centerX, -height, width, height * 2);
    context.restore();

    const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.12);

    core.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    core.addColorStop(0.34, "rgba(255, 255, 255, 0.42)");
    core.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = core;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(centerX, centerY);
    context.rotate(-0.16);
    context.fillStyle = "rgba(255, 255, 255, 0.18)";
    context.fillRect(-width * 0.38, -1, width * 0.76, 2);
    context.restore();

    return createCanvasTexture(canvas);
}

function createStarClusterTexture() {
    const canvas = document.createElement("canvas");
    const size = 128;
    const center = size / 2;

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    const haze = context.createRadialGradient(center, center, 0, center, center, center);

    haze.addColorStop(0, "rgba(255, 255, 255, 0.28)");
    haze.addColorStop(0.34, "rgba(255, 255, 255, 0.08)");
    haze.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = haze;
    context.fillRect(0, 0, size, size);

    for (let index = 0; index < 44; index += 1) {
        const angle = pseudoRandom(index * 19) * Math.PI * 2;
        const distance = Math.pow(pseudoRandom(index * 31), 1.8) * center * 0.82;
        const x = center + Math.cos(angle) * distance;
        const y = center + Math.sin(angle) * distance;
        const radius = 0.7 + pseudoRandom(index * 47) * 1.3;

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${0.42 + pseudoRandom(index * 53) * 0.48})`;
        context.fill();
    }

    return createCanvasTexture(canvas);
}

function createDustWispTexture() {
    const canvas = document.createElement("canvas");
    const width = 256;
    const height = 96;
    const centerX = width / 2;
    const centerY = height / 2;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    for (let index = 0; index < 7; index += 1) {
        const offsetX = (pseudoRandom(index * 17) - 0.5) * width * 0.48;
        const offsetY = (pseudoRandom(index * 23) - 0.5) * height * 0.34;
        const radiusX = width * (0.18 + pseudoRandom(index * 29) * 0.18);
        const radiusY = height * (0.16 + pseudoRandom(index * 31) * 0.16);
        const gradient = context.createRadialGradient(
            centerX + offsetX,
            centerY + offsetY,
            0,
            centerX + offsetX,
            centerY + offsetY,
            Math.max(radiusX, radiusY),
        );

        gradient.addColorStop(0, "rgba(255, 255, 255, 0.18)");
        gradient.addColorStop(0.42, "rgba(255, 255, 255, 0.07)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        context.save();
        context.translate(centerX + offsetX, centerY + offsetY);
        context.scale(radiusX / Math.max(radiusX, radiusY), radiusY / Math.max(radiusX, radiusY));
        context.fillStyle = gradient;
        context.fillRect(-width, -height, width * 2, height * 2);
        context.restore();
    }

    return createCanvasTexture(canvas);
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

    return createCanvasTexture(canvas);
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

function seededPointInShell(innerRadius, outerRadius, seed) {
    const u = pseudoRandom(seed * 11);
    const v = pseudoRandom(seed * 17);
    const theta = u * Math.PI * 2;
    const phi = Math.acos((2 * v) - 1);
    const radius = innerRadius + pseudoRandom(seed * 29) * (outerRadius - innerRadius);
    const sinPhi = Math.sin(phi);

    return new THREE.Vector3(
        radius * sinPhi * Math.cos(theta),
        radius * Math.cos(phi),
        radius * sinPhi * Math.sin(theta),
    );
}

function getBackdropFeaturePosition(config, radius) {
    if (Array.isArray(config.direction) && config.direction.length >= 3) {
        return new THREE.Vector3(
            Number(config.direction[0]) || 0,
            Number(config.direction[1]) || 0,
            Number(config.direction[2]) || -1,
        ).normalize().multiplyScalar(radius);
    }

    return seededPointInShell(radius * 0.78, radius, config.positionSeed);
}

function pickPaletteColor(palette, index) {
    const firstIndex = Math.floor(pseudoRandom(index * 17) * palette.length);
    const secondIndex = (firstIndex + 1 + Math.floor(pseudoRandom(index * 31) * (palette.length - 1))) % palette.length;

    return palette[firstIndex].clone().lerp(palette[secondIndex], pseudoRandom(index * 43));
}

function bellRandom(seed) {
    return (
        pseudoRandom(seed)
        + pseudoRandom(seed + 13)
        + pseudoRandom(seed + 29)
        - 1.5
    ) / 1.5;
}

function createCanvasTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);

    if (THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
        texture.encoding = THREE.sRGBEncoding;
    }

    return texture;
}

function pseudoRandom(value) {
    const x = Math.sin(value) * 10000;
    return x - Math.floor(x);
}

function disposeBackdrop(backdrop) {
    const textures = new Set(backdrop.textures || []);

    backdrop.group.traverse((object) => {
        if (object.geometry) {
            object.geometry.dispose();
        }

        disposeMaterial(object.material, textures);
    });

    textures.forEach((texture) => {
        texture.dispose();
    });
}

function disposeMaterial(material, textures) {
    if (!material) {
        return;
    }

    if (Array.isArray(material)) {
        material.forEach((item) => disposeMaterial(item, textures));
        return;
    }

    collectMaterialTextures(material, textures);
    material.dispose();
}

function collectMaterialTextures(material, textures) {
    Object.keys(material).forEach((key) => {
        const value = material[key];

        if (value && value.isTexture) {
            textures.add(value);
        }
    });
}
})();
