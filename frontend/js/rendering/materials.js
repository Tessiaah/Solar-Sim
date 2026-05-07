window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

window.SolarSim.rendering.createBodyMaterialFactory = function createBodyMaterialFactory() {
    const textureLoader = typeof THREE !== "undefined" ? new THREE.TextureLoader() : null;
    const textureCache = new Map();
    const colorTextureTypes = new Set(["map", "emissiveMap"]);
    const supportedTextureTypes = new Set([
        "map",
        "normalMap",
        "roughnessMap",
        "metalnessMap",
        "emissiveMap",
        "bumpMap",
        "alphaMap",
        "displacementMap",
        "aoMap",
    ]);
    const visualDefaults = {
        kind: "standard",
        color: "#d7deea",
        emissive: null,
        emissiveIntensity: 0,
        roughness: 0.7,
        metalness: 0,
        clearcoat: 0,
        textures: {},
    };

    if (textureLoader?.setCrossOrigin) {
        textureLoader.setCrossOrigin("anonymous");
    }

    function createMaterial(body) {
        const visual = resolveBodyVisual(body);
        const textures = loadTextures(visual.textures);
        const options = createMaterialOptions(visual, textures);

        return createThreeMaterial(visual.kind, options);
    }

    function resolveBodyVisual(body) {
        const visual = body.visual || {};

        return {
            kind: visual.kind || visualDefaults.kind,
            color: visual.baseColor || body.color || visualDefaults.color,
            emissive: visual.emissive || visualDefaults.emissive,
            emissiveIntensity: visual.emissiveIntensity ?? visualDefaults.emissiveIntensity,
            roughness: visual.roughness ?? visualDefaults.roughness,
            metalness: visual.metalness ?? visualDefaults.metalness,
            clearcoat: visual.clearcoat ?? visualDefaults.clearcoat,
            textures: normalizeTextures(visual),
        };
    }

    function createMaterialOptions(visual, textures) {
        const options = {
            color: visual.color,
            roughness: visual.roughness,
            metalness: visual.metalness,
            ...textures,
        };

        if (visual.emissive) {
            options.emissive = visual.emissive;
            options.emissiveIntensity = visual.emissiveIntensity;
        }

        if (visual.clearcoat) {
            options.clearcoat = visual.clearcoat;
        }

        return options;
    }

    function createThreeMaterial(kind, options) {
        if (kind === "basic") {
            return new THREE.MeshBasicMaterial(filterMaterialOptions(options, ["color", "map", "alphaMap"]));
        }

        if (kind === "physical") {
            return new THREE.MeshPhysicalMaterial(options);
        }

        return new THREE.MeshStandardMaterial(options);
    }

    function filterMaterialOptions(options, keys) {
        return Object.fromEntries(
            keys
                .filter((key) => options[key] !== undefined)
                .map((key) => [key, options[key]]),
        );
    }

    function normalizeTextures(visual) {
        if (visual.textures) {
            return visual.textures;
        }

        return visualDefaults.textures;
    }

    function loadTextures(textureUrls) {
        return Object.fromEntries(
            Object.entries(textureUrls)
                .filter(([textureType, textureUrl]) => supportedTextureTypes.has(textureType) && Boolean(textureUrl))
                .map(([textureType, textureUrl]) => [textureType, loadTexture(textureUrl, textureType)]),
        );
    }

    function loadTexture(textureUrl, textureType) {
        if (!textureLoader) {
            return null;
        }

        const cacheKey = `${textureType}:${textureUrl}`;

        if (!textureCache.has(cacheKey)) {
            const texture = textureLoader.load(textureUrl);
            applyTextureColorSpace(texture, textureType);
            textureCache.set(cacheKey, texture);
        }

        return textureCache.get(cacheKey);
    }

    function applyTextureColorSpace(texture, textureType) {
        if (!colorTextureTypes.has(textureType)) {
            return;
        }

        if (THREE.SRGBColorSpace) {
            texture.colorSpace = THREE.SRGBColorSpace;
            return;
        }

        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }
    }

    return {
        createMaterial,
    };
};
