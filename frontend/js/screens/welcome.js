const TWO_PI = Math.PI * 2;
const WELCOME_RENDER_PROFILES = {
    low: {
        accretionBandCount: 7,
        blackHoleParticleCount: 36,
        highlightCount: 3,
        maxFps: 30,
        orbitCount: 5,
        pixelRatioCap: 0.85,
        rippleCount: 4,
        staticStarMax: 320,
        staticStarMin: 150,
        staticStarSpacing: 5.2,
        twinkleStarCount: 18,
        glowScale: 0.55,
    },
    medium: {
        accretionBandCount: 11,
        blackHoleParticleCount: 58,
        highlightCount: 5,
        maxFps: 45,
        orbitCount: 7,
        pixelRatioCap: 1,
        rippleCount: 6,
        staticStarMax: 460,
        staticStarMin: 210,
        staticStarSpacing: 4.2,
        twinkleStarCount: 30,
        glowScale: 0.72,
    },
    full: {
        accretionBandCount: 15,
        blackHoleParticleCount: 82,
        highlightCount: 6,
        maxFps: 60,
        orbitCount: 8,
        pixelRatioCap: 1.25,
        rippleCount: 7,
        staticStarMax: 560,
        staticStarMin: 260,
        staticStarSpacing: 3.6,
        twinkleStarCount: 42,
        glowScale: 0.86,
    },
};

window.SolarSim = window.SolarSim || {};
window.SolarSim.screens = window.SolarSim.screens || {};

window.SolarSim.screens.initWelcomeScreen = function initWelcomeScreen({ root, router, store }) {
    if (!root) {
        return;
    }

    const canvas = root.querySelector("#welcome-orbits");
    const actionButtons = root.querySelectorAll("[data-route]");
    const commandButtons = root.querySelectorAll("[data-app-command]");

    actionButtons.forEach((button) => {
        button.addEventListener("click", () => {
            router.goTo(button.dataset.route);
        });
    });

    commandButtons.forEach((button) => {
        button.addEventListener("click", () => {
            if (button.dataset.appCommand === "quit") {
                quitApplication();
            }
        });
    });

    if (canvas) {
        const backdrop = createOrbitBackdrop(canvas, store ? store.getState().graphics : null);

        const handleNavigation = (event) => {
            const screenName = event.detail?.screenName;
            root.dataset.pendingRoute = screenName;

            if (screenName === "welcome") {
                backdrop.start();
                return;
            }

            backdrop.stop();
        };
        const handleGraphicsSettings = (event) => {
            backdrop.applySettings(event.detail?.graphics);
        };

        window.addEventListener("solar-sim:navigate", handleNavigation);
        window.addEventListener("solar-sim:graphics-settings-applied", handleGraphicsSettings);
        window.addEventListener("beforeunload", () => backdrop.dispose(), { once: true });

        backdrop.start();

        return;
    }

    window.addEventListener("solar-sim:navigate", (event) => {
        root.dataset.pendingRoute = event.detail?.screenName;
    });
};

function quitApplication() {
    if (window.SolarSim?.backend?.isAvailable()) {
        const request = window.SolarSim.backend.host.quit();

        if (request && typeof request.catch === "function") {
            request.catch((error) => {
                console.info("Quit request was rejected by the host.", error);
            });
        }

        return;
    }

    window.close();
}

function createOrbitBackdrop(canvas, initialGraphicsSettings) {
    const context = canvas.getContext("2d");
    const initialRenderQuality = getWelcomeBackdropQuality(initialGraphicsSettings);
    let animationFrame = null;
    let running = false;
    let disposed = false;
    const state = {
        frameIntervalMs: getFrameInterval(initialGraphicsSettings),
        lastFrameTime: 0,
        renderQuality: initialRenderQuality,
        profile: getWelcomeRenderProfile(initialRenderQuality),
        imageSmoothingEnabled: true,
        visualEffects: createWelcomeVisualEffectsDefaults(),
        width: 0,
        height: 0,
        pixelRatio: 1,
        staticStarLayer: null,
        particles: [],
        blackHoleParticles: [],
    };

    function start() {
        if (disposed || running) {
            return;
        }

        running = true;
        state.lastFrameTime = 0;
        resize();
        window.addEventListener("resize", resize);
        scheduleNextFrame();
    }

    function stop() {
        if (!running) {
            return;
        }

        running = false;
        window.removeEventListener("resize", resize);

        if (animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    }

    function dispose() {
        if (disposed) {
            return;
        }

        stop();
        disposed = true;
        state.staticStarLayer = null;
        state.particles = [];
        state.blackHoleParticles = [];
    }

    function scheduleNextFrame() {
        if (!running || animationFrame !== null) {
            return;
        }

        animationFrame = requestAnimationFrame(draw);
    }

    function resize() {
        if (disposed) {
            return;
        }

        state.profile = getWelcomeRenderProfile(state.renderQuality);
        state.pixelRatio = getPixelRatioForQuality(state.profile);
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        canvas.width = Math.floor(state.width * state.pixelRatio);
        canvas.height = Math.floor(state.height * state.pixelRatio);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
        context.imageSmoothingEnabled = state.imageSmoothingEnabled;

        state.staticStarLayer = createStaticStarLayer(
            state.width,
            state.height,
            state.pixelRatio,
            state.profile,
        );
        state.particles = createParticles(state.width, state.height, state.profile);
        state.blackHoleParticles = createBlackHoleParticles(state.profile);
    }

    function draw(time) {
        animationFrame = null;

        if (!running || disposed) {
            return;
        }

        if (time - state.lastFrameTime < state.frameIntervalMs) {
            scheduleNextFrame();
            return;
        }

        state.lastFrameTime = time;

        const elapsed = time * 0.0001;
        const centerX = state.width * 0.72;
        const centerY = state.height * 0.48;

        clearBackdrop(context, state);
        drawStars(context, state.particles, elapsed, state);
        drawOrbits(context, centerX, centerY, state.width, elapsed, state);
        drawBlackHole(context, centerX, centerY, state.width, state.height, time * 0.001, state);

        scheduleNextFrame();
    }

    return {
        start,
        stop,
        dispose,
        applySettings(graphicsSettings) {
            const nextQuality = getWelcomeBackdropQuality(graphicsSettings);

            state.renderQuality = nextQuality;
            state.profile = getWelcomeRenderProfile(nextQuality);
            state.frameIntervalMs = getFrameInterval(graphicsSettings);

            if (running) {
                resize();
            }
        },
    };
}

function createWelcomeVisualEffectsDefaults() {
    return {
        bloom: false,
        motionBlur: false,
        depthOfField: false,
    };
}

function createStaticStarLayer(width, height, pixelRatio, profile) {
    const layer = document.createElement("canvas");
    const layerContext = layer.getContext("2d");

    if (!layerContext) {
        return null;
    }

    layer.width = Math.floor(width * pixelRatio);
    layer.height = Math.floor(height * pixelRatio);
    layerContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const count = Math.round(
        Math.min(Math.max(width / profile.staticStarSpacing, profile.staticStarMin), profile.staticStarMax),
    );

    for (let index = 0; index < count; index += 1) {
        drawStaticStar(layerContext, width, height, index, profile);
    }

    return layer;
}

function drawStaticStar(context, width, height, index, profile) {
    const seed = index + 1;
    const x = pseudoRandom(seed * 19) * width;
    const y = pseudoRandom(seed * 37) * height;
    const radius = 0.45 + pseudoRandom(seed * 53) * 1.15;
    const alpha = 0.38 + pseudoRandom(seed * 71) * 0.52;
    const isGlowStar = pseudoRandom(seed * 89) > 0.86;

    if (isGlowStar) {
        const glowRadius = radius * (5.2 + profile.glowScale * 2.4);
        const gradient = context.createRadialGradient(x, y, 0, x, y, glowRadius);

        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        gradient.addColorStop(0.22, `rgba(255, 255, 255, ${alpha * 0.36})`);
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, glowRadius, 0, TWO_PI);
        context.fill();
        return;
    }

    context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, TWO_PI);
    context.fill();
}

function createParticles(width, height, profile) {
    const count = profile.twinkleStarCount;

    return Array.from({ length: count }, (_, index) => {
        const seed = index + 1;
        const orbitalLayer = pseudoRandom(seed * 89);

        return {
            x: pseudoRandom(seed * 19) * width,
            y: pseudoRandom(seed * 37) * height,
            radius: 0.7 + pseudoRandom(seed * 53) * 1.65,
            alpha: 0.42 + pseudoRandom(seed * 71) * 0.54,
            orbitRadius: 90 + pseudoRandom(seed * 97) * Math.max(width, height) * 0.52,
            orbitSpeed: 0.06 + pseudoRandom(seed * 113) * 0.16,
            orbitAngle: pseudoRandom(seed * 131) * TWO_PI,
            layer: orbitalLayer,
        };
    });
}

function createBlackHoleParticles(profile) {
    const count = profile.blackHoleParticleCount;

    return Array.from({ length: count }, (_, index) => {
        const seed = index + 1;

        return {
            angle: pseudoRandom(seed * 149) * TWO_PI,
            alpha: 0.16 + pseudoRandom(seed * 181) * 0.48,
            distance: pseudoRandom(seed * 163),
            lane: pseudoRandom(seed * 211),
            radius: 0.35 + pseudoRandom(seed * 197) * 1.15,
            speed: 0.18 + pseudoRandom(seed * 229) * 0.56,
        };
    });
}

function clearBackdrop(context, state) {
    if (state.visualEffects.motionBlur) {
        context.fillStyle = "rgba(7, 9, 13, 0.32)";
        context.fillRect(0, 0, state.width, state.height);
        return;
    }

    context.clearRect(0, 0, state.width, state.height);
}

function drawStars(context, particles, elapsed, state) {
    if (state.staticStarLayer) {
        context.drawImage(state.staticStarLayer, 0, 0, state.width, state.height);
    }

    const pixelRatio = state.pixelRatio || 1;
    const driftCenterX = context.canvas.width / pixelRatio * 0.74;
    const driftCenterY = context.canvas.height / pixelRatio * 0.5;

    particles.forEach((particle, index) => {
        const pulse = Math.sin(elapsed * 22 + index) * 0.18;
        const orbitInfluence = particle.layer > 0.62 ? 1 : 0;
        const depthScale = state.visualEffects.depthOfField && particle.layer < 0.28 ? 0.48 : 1;
        const angle = particle.orbitAngle + elapsed * particle.orbitSpeed;
        const orbitX = Math.cos(angle) * particle.orbitRadius * 0.18 * orbitInfluence;
        const orbitY = Math.sin(angle) * particle.orbitRadius * 0.08 * orbitInfluence;
        const x = particle.x + orbitX + (driftCenterX - particle.x) * 0.015 * orbitInfluence;
        const y = particle.y + orbitY + (driftCenterY - particle.y) * 0.015 * orbitInfluence;
        const alpha = Math.max(0.22, Math.min(1, particle.alpha + pulse)) * depthScale;
        const bloomScale = state.visualEffects.bloom ? 8 : 4.5;

        context.beginPath();
        context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        context.shadowColor = "rgba(255, 255, 255, 0.72)";
        context.shadowBlur = particle.radius * bloomScale * state.profile.glowScale;
        context.arc(x, y, particle.radius, 0, TWO_PI);
        context.fill();
        context.shadowBlur = 0;
    });
}

function drawOrbits(context, centerX, centerY, width, elapsed, state) {
    const orbitCount = state.profile.orbitCount;
    const baseRadius = Math.max(120, width * 0.11);

    for (let index = 0; index < orbitCount; index += 1) {
        const radius = baseRadius + index * 58;
        const tilt = 0.24 + index * 0.055;
        const alpha = 0.34 - index * 0.018;

        context.save();
        context.translate(centerX, centerY);
        context.rotate(-tilt);
        context.scale(1, 0.46);
        context.beginPath();
        context.strokeStyle = `rgba(205, 212, 224, ${alpha})`;
        context.lineWidth = 1;
        context.arc(0, 0, radius, 0, TWO_PI);
        context.stroke();
        context.restore();

        drawBodyOnOrbit(context, centerX, centerY, radius, tilt, elapsed, index, state);
    }
}

function drawBodyOnOrbit(context, centerX, centerY, radius, tilt, elapsed, index, state) {
    const angle = elapsed * (0.52 + index * 0.07) + index * 0.9;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.46;
    const rotatedX = x * Math.cos(-tilt) - y * Math.sin(-tilt);
    const rotatedY = x * Math.sin(-tilt) + y * Math.cos(-tilt);
    const bodyRadius = index === 0 ? 5 : 2.5 + index * 0.45;

    context.beginPath();
    context.shadowColor = "rgba(255, 255, 255, 0.82)";
    context.shadowBlur = bodyRadius * (state.visualEffects.bloom ? 8 : 4) * state.profile.glowScale;
    context.fillStyle = index === 0 ? "#ffffff" : "rgba(255, 255, 255, 0.92)";
    context.arc(centerX + rotatedX, centerY + rotatedY, bodyRadius, 0, TWO_PI);
    context.fill();
    context.shadowBlur = 0;
}

function drawBlackHole(context, centerX, centerY, width, height, elapsed, state) {
    const radius = getBlackHoleRadius(width, height);
    const rotation = -0.27;

    drawBlackHoleHalo(context, centerX, centerY, radius, state);
    drawAccretionDisk(context, centerX, centerY, radius, rotation, elapsed, state);
    drawAccretionParticles(context, centerX, centerY, radius, rotation, elapsed, state);
    drawEventHorizon(context, centerX, centerY, radius, elapsed, state);
}

function drawBlackHoleHalo(context, centerX, centerY, radius, state) {
    const haloRadius = radius * (state.visualEffects.bloom ? 5.2 : 4.5) * (0.78 + state.profile.glowScale * 0.22);
    const gradient = context.createRadialGradient(
        centerX,
        centerY,
        radius * 0.72,
        centerX,
        centerY,
        haloRadius,
    );

    gradient.addColorStop(0, "rgba(255, 255, 255, 0.36)");
    gradient.addColorStop(0.16, "rgba(255, 255, 255, 0.16)");
    gradient.addColorStop(0.44, "rgba(185, 197, 214, 0.06)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.save();
    context.globalCompositeOperation = "screen";
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, haloRadius, 0, TWO_PI);
    context.fill();
    context.restore();
}

function drawAccretionDisk(context, centerX, centerY, radius, rotation, elapsed, state) {
    const bandCount = state.profile.accretionBandCount;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(rotation);
    context.scale(1, 0.36);
    context.globalCompositeOperation = "screen";
    context.lineCap = "round";

    for (let index = 0; index < bandCount; index += 1) {
        const lane = index / Math.max(1, bandCount - 1);
        const bandRadius = radius * (1.1 + lane * 2.15);
        const alpha = 0.055 + (1 - lane) * 0.16;
        const lineWidth = radius * (0.012 + (1 - lane) * 0.018);
        const sweep = TWO_PI * (0.44 + lane * 0.18);
        const start = elapsed * (0.18 + lane * 0.16) + index * 0.72;

        context.beginPath();
        context.strokeStyle = `rgba(245, 248, 255, ${alpha})`;
        context.lineWidth = lineWidth;
        context.shadowColor = "rgba(255, 255, 255, 0.7)";
        context.shadowBlur = radius * (state.visualEffects.bloom ? 0.18 : 0.09) * state.profile.glowScale;
        context.arc(0, 0, bandRadius, start, start + sweep);
        context.stroke();

        context.beginPath();
        context.strokeStyle = `rgba(140, 150, 168, ${alpha * 0.45})`;
        context.lineWidth = Math.max(0.7, lineWidth * 0.7);
        context.arc(0, 0, bandRadius * 1.012, start + Math.PI, start + Math.PI + sweep * 0.65);
        context.stroke();
    }

    drawAccretionHighlights(context, radius, elapsed, state);
    context.restore();
    context.shadowBlur = 0;
}

function drawAccretionHighlights(context, radius, elapsed, state) {
    const highlightCount = state.profile.highlightCount;

    for (let index = 0; index < highlightCount; index += 1) {
        const lane = index / Math.max(1, highlightCount - 1);
        const bandRadius = radius * (1.35 + lane * 1.95);
        const start = elapsed * (0.22 + lane * 0.09) + index * 0.94;
        const sweep = TWO_PI * (0.18 + lane * 0.08);

        context.beginPath();
        context.strokeStyle = `rgba(255, 255, 255, ${0.11 + (1 - lane) * 0.09})`;
        context.lineWidth = Math.max(1, radius * (0.012 + (1 - lane) * 0.018));
        context.shadowColor = "rgba(255, 255, 255, 0.88)";
        context.shadowBlur = radius * (state.visualEffects.bloom ? 0.42 : 0.24) * state.profile.glowScale;
        context.arc(0, 0, bandRadius, start, start + sweep);
        context.stroke();
    }
}

function drawAccretionParticles(context, centerX, centerY, radius, rotation, elapsed, state) {
    context.save();
    context.globalCompositeOperation = "screen";

    state.blackHoleParticles.forEach((particle) => {
        const angle = particle.angle + elapsed * particle.speed;
        const laneRadius = radius * (1.38 + particle.distance * 2.55);
        const localX = Math.cos(angle) * laneRadius;
        const localY = Math.sin(angle) * laneRadius * (0.34 + particle.lane * 0.08);
        const rotatedX = localX * Math.cos(rotation) - localY * Math.sin(rotation);
        const rotatedY = localX * Math.sin(rotation) + localY * Math.cos(rotation);
        const depth = 0.48 + Math.max(0, Math.sin(angle)) * 0.52;
        const alpha = particle.alpha * depth;
        const particleRadius = particle.radius * (0.8 + depth * 0.45);

        context.beginPath();
        context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        context.shadowColor = "rgba(255, 255, 255, 0.75)";
        context.shadowBlur = particleRadius * (state.visualEffects.bloom ? 8 : 4.5) * state.profile.glowScale;
        context.arc(centerX + rotatedX, centerY + rotatedY, particleRadius, 0, TWO_PI);
        context.fill();
    });

    context.restore();
    context.shadowBlur = 0;
}

function drawEventHorizon(context, centerX, centerY, radius, elapsed, state) {
    context.save();
    context.globalCompositeOperation = "source-over";

    drawEventHorizonRim(context, centerX, centerY, radius, elapsed, state);

    context.beginPath();
    context.shadowColor = "rgba(255, 255, 255, 0.38)";
    context.shadowBlur = radius * 0.24;
    context.fillStyle = "#000000";
    context.arc(centerX, centerY, radius * 0.78, 0, TWO_PI);
    context.fill();

    const innerGradient = context.createRadialGradient(
        centerX - radius * 0.16,
        centerY - radius * 0.2,
        radius * 0.1,
        centerX,
        centerY,
        radius * 0.78,
    );

    innerGradient.addColorStop(0, "rgba(8, 10, 15, 0.4)");
    innerGradient.addColorStop(0.52, "rgba(0, 0, 0, 0.95)");
    innerGradient.addColorStop(1, "rgba(0, 0, 0, 1)");

    context.shadowBlur = 0;
    context.fillStyle = innerGradient;
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.78, 0, TWO_PI);
    context.fill();

    drawEventHorizonSurfaceContrast(context, centerX, centerY, radius, elapsed);
    drawEventHorizonRipples(context, centerX, centerY, radius, elapsed, state);

    context.restore();
}

function drawEventHorizonRim(context, centerX, centerY, radius, elapsed, state) {
    const pulse = 0.88 + Math.sin(elapsed * 0.62) * 0.12;
    const rimGradient = context.createLinearGradient(
        centerX - radius,
        centerY - radius * 0.85,
        centerX + radius,
        centerY + radius * 0.85,
    );

    rimGradient.addColorStop(0, "rgba(105, 111, 124, 0.62)");
    rimGradient.addColorStop(0.22, `rgba(245, 247, 252, ${0.9 * pulse})`);
    rimGradient.addColorStop(0.48, "rgba(180, 187, 199, 0.7)");
    rimGradient.addColorStop(0.68, "rgba(92, 98, 112, 0.44)");
    rimGradient.addColorStop(1, "rgba(225, 229, 238, 0.78)");

    context.save();
    context.lineCap = "round";
    context.shadowColor = "rgba(255, 255, 255, 0.84)";
    context.shadowBlur = radius * (state.visualEffects.bloom ? 0.72 : 0.44) * state.profile.glowScale;
    context.strokeStyle = rimGradient;
    context.lineWidth = Math.max(3.5, radius * 0.064);
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.82, 0, TWO_PI);
    context.stroke();

    const innerGradient = context.createLinearGradient(
        centerX + radius * 0.55,
        centerY - radius * 0.75,
        centerX - radius * 0.75,
        centerY + radius * 0.72,
    );

    innerGradient.addColorStop(0, "rgba(255, 255, 255, 0.58)");
    innerGradient.addColorStop(0.38, "rgba(150, 158, 172, 0.18)");
    innerGradient.addColorStop(1, "rgba(255, 255, 255, 0.04)");

    context.shadowBlur = radius * 0.16;
    context.strokeStyle = innerGradient;
    context.lineWidth = Math.max(0.9, radius * 0.013);
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.764, 0, TWO_PI);
    context.stroke();
    context.restore();
}

function drawEventHorizonSurfaceContrast(context, centerX, centerY, radius, elapsed) {
    const horizonRadius = radius * 0.76;
    const drift = Math.sin(elapsed * 0.38) * radius * 0.05;

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, horizonRadius, 0, TWO_PI);
    context.clip();
    context.globalCompositeOperation = "screen";

    const upperSheen = context.createRadialGradient(
        centerX - radius * 0.26 + drift,
        centerY - radius * 0.34,
        radius * 0.06,
        centerX,
        centerY,
        horizonRadius,
    );

    upperSheen.addColorStop(0, "rgba(180, 190, 205, 0.16)");
    upperSheen.addColorStop(0.42, "rgba(92, 101, 115, 0.07)");
    upperSheen.addColorStop(1, "rgba(0, 0, 0, 0)");

    context.fillStyle = upperSheen;
    context.beginPath();
    context.arc(centerX, centerY, horizonRadius, 0, TWO_PI);
    context.fill();

    const lowerShade = context.createRadialGradient(
        centerX + radius * 0.22,
        centerY + radius * 0.34,
        radius * 0.04,
        centerX,
        centerY,
        horizonRadius * 1.1,
    );

    lowerShade.addColorStop(0, "rgba(95, 103, 118, 0.1)");
    lowerShade.addColorStop(0.5, "rgba(48, 54, 64, 0.045)");
    lowerShade.addColorStop(1, "rgba(0, 0, 0, 0)");

    context.fillStyle = lowerShade;
    context.beginPath();
    context.arc(centerX, centerY, horizonRadius, 0, TWO_PI);
    context.fill();

    context.restore();
}

function drawEventHorizonRipples(context, centerX, centerY, radius, elapsed, state) {
    const horizonRadius = radius * 0.76;
    const rippleCount = state.profile.rippleCount;

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, horizonRadius, 0, TWO_PI);
    context.clip();
    context.globalCompositeOperation = "screen";
    context.lineCap = "round";

    for (let index = 0; index < rippleCount; index += 1) {
        const lane = index / Math.max(1, rippleCount - 1);
        const wave = Math.sin(elapsed * (0.48 + lane * 0.22) + index * 1.7);
        const y = centerY + (lane - 0.5) * horizonRadius * 1.55 + wave * radius * 0.035;
        const xRadius = horizonRadius * (0.45 + lane * 0.5);
        const yRadius = horizonRadius * (0.1 + lane * 0.08);
        const alpha = 0.045 + (1 - Math.abs(lane - 0.5) * 2) * 0.08;

        context.save();
        context.translate(centerX, y);
        context.rotate(-0.24 + wave * 0.035);
        context.scale(1, 0.28 + lane * 0.08);
        context.beginPath();
        context.strokeStyle = `rgba(205, 214, 226, ${alpha})`;
        context.lineWidth = Math.max(0.8, radius * 0.012);
        context.arc(0, 0, xRadius, Math.PI * 0.04, Math.PI * 0.96);
        context.stroke();
        context.restore();

        context.save();
        context.translate(centerX, y + yRadius * 0.65);
        context.rotate(-0.18 - wave * 0.025);
        context.scale(1, 0.2 + lane * 0.05);
        context.beginPath();
        context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.72})`;
        context.lineWidth = Math.max(0.6, radius * 0.007);
        context.arc(0, 0, xRadius * 0.78, Math.PI * 0.12, Math.PI * 0.88);
        context.stroke();
        context.restore();
    }

    const sheen = context.createLinearGradient(
        centerX - horizonRadius,
        centerY - horizonRadius,
        centerX + horizonRadius,
        centerY + horizonRadius,
    );

    sheen.addColorStop(0, "rgba(255, 255, 255, 0.11)");
    sheen.addColorStop(0.34, "rgba(255, 255, 255, 0.026)");
    sheen.addColorStop(0.72, "rgba(255, 255, 255, 0)");

    context.fillStyle = sheen;
    context.beginPath();
    context.arc(centerX, centerY, horizonRadius, 0, TWO_PI);
    context.fill();

    context.restore();
}

function getBlackHoleRadius(width, height) {
    return clampNumber(Math.min(width, height) * 0.073, 46, 92);
}

function pseudoRandom(value) {
    const x = Math.sin(value) * 10000;
    return x - Math.floor(x);
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getFrameInterval(graphicsSettings) {
    const fpsLimit = graphicsSettings?.fpsLimit || "60";
    const profile = getWelcomeRenderProfile(getWelcomeBackdropQuality(graphicsSettings));
    const requestedFps = fpsLimit === "unlimited"
        ? profile.maxFps
        : Number(fpsLimit);

    if (!Number.isFinite(requestedFps) || requestedFps <= 0) {
        return 1000 / profile.maxFps;
    }

    return 1000 / Math.min(requestedFps, profile.maxFps);
}

function getPixelRatioForQuality(profile) {
    return Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap);
}

function getWelcomeBackdropQuality(graphicsSettings) {
    return graphicsSettings?.skyboxQuality
        || (graphicsSettings?.renderQuality === "high" ? "full" : graphicsSettings?.renderQuality)
        || "full";
}

function getWelcomeRenderProfile(renderQuality) {
    return WELCOME_RENDER_PROFILES[renderQuality] || WELCOME_RENDER_PROFILES.full;
}
