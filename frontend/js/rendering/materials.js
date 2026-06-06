window.SolarSim = window.SolarSim || {};
window.SolarSim.rendering = window.SolarSim.rendering || {};

window.SolarSim.rendering.createBodyMaterialFactory = function createBodyMaterialFactory({ store } = {}) {
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

    function createMaterial(body) {
        const visual = resolveBodyVisual(body);
        const textures = loadTextures(visual.textures);
        const options = createMaterialOptions(visual);
        const material = createThreeMaterial(visual.kind, options);

        applyTexturesAfterLoad(material, textures, visual.kind);

        return material;
    }

    function resolveBodyVisual(body) {
        const visual = body.visual || {};
        const sphereProfile = getSphereQualityProfile(store);
        const materialMode = sphereProfile?.materialMode || "textured";
        const preserveEmissiveBasic = visual.kind === "basic" && materialMode !== "basicColor";

        return {
            kind: materialMode === "basicColor" && !preserveEmissiveBasic
                ? "basic"
                : visual.kind || visualDefaults.kind,
            color: visual.baseColor || body.color || visualDefaults.color,
            emissive: visual.emissive || visualDefaults.emissive,
            emissiveIntensity: visual.emissiveIntensity ?? visualDefaults.emissiveIntensity,
            roughness: visual.roughness ?? visualDefaults.roughness,
            metalness: visual.metalness ?? visualDefaults.metalness,
            clearcoat: visual.clearcoat ?? visualDefaults.clearcoat,
            textures: materialMode === "textured" ? normalizeTextures(visual) : {},
        };
    }

    function createMaterialOptions(visual) {
        const options = {
            color: visual.color,
            roughness: visual.roughness,
            metalness: visual.metalness,
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
            configureTextureLoader(textureUrl);
            const texture = textureLoader.load(textureUrl, markTextureLoaded);
            const textureState = getTextureState(texture);

            textureState.solarSimLoaded = false;
            textureState.solarSimLoadCallbacks = [];
            applyTextureSampling(texture);
            applyTextureColorSpace(texture, textureType);
            textureCache.set(cacheKey, texture);
        }

        return textureCache.get(cacheKey);
    }

    function configureTextureLoader(textureUrl) {
        if (!textureLoader?.setCrossOrigin) {
            return;
        }

        textureLoader.setCrossOrigin(isRemoteTextureUrl(textureUrl) ? "anonymous" : "");
    }

    function isRemoteTextureUrl(textureUrl) {
        return /^https?:\/\//i.test(textureUrl);
    }

    function markTextureLoaded(texture) {
        const textureState = getTextureState(texture);

        textureState.solarSimLoaded = true;
        textureState.solarSimLoadCallbacks.forEach((callback) => callback());
        textureState.solarSimLoadCallbacks = [];
    }

    function applyTexturesAfterLoad(material, textures, kind) {
        const supportedTypes = getSupportedTextureTypesForMaterial(kind);

        Object.entries(textures)
            .filter(([textureType]) => supportedTypes.has(textureType))
            .forEach(([textureType, texture]) => {
                runAfterTextureLoad(texture, () => {
                    material[textureType] = texture;

                    if (textureType === "map") {
                        material.color?.set("#ffffff");
                    }

                    material.needsUpdate = true;
                });
            });
    }

    function runAfterTextureLoad(texture, callback) {
        const textureState = getTextureState(texture);

        if (textureState.solarSimLoaded) {
            callback();
            return;
        }

        textureState.solarSimLoadCallbacks.push(callback);
    }

    function getSupportedTextureTypesForMaterial(kind) {
        if (kind === "basic") {
            return new Set(["map", "alphaMap"]);
        }

        return supportedTextureTypes;
    }

    function getTextureState(texture) {
        texture.userData = texture.userData || {};
        texture.userData.solarSimLoadCallbacks = texture.userData.solarSimLoadCallbacks || [];

        return texture.userData;
    }

    function applyTextureSampling(texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = 4;

        if (THREE.LinearMipmapLinearFilter) {
            texture.minFilter = THREE.LinearMipmapLinearFilter;
        }

        if (THREE.LinearFilter) {
            texture.magFilter = THREE.LinearFilter;
        }
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
        dispose,
    };

    function dispose() {
        textureCache.forEach((texture) => {
            texture.dispose();
        });
        textureCache.clear();
    }
};

function getSphereQualityProfile(store) {
    const sphereQuality = store?.getState?.()?.graphics?.sphereQuality || "textured";

    return window.SolarSim.settings?.getControlProfile?.("graphics", "sphereQuality", sphereQuality)
        || { materialMode: "textured", sphereGeometryDetail: 32 };
}
