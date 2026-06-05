const TWO_PI = Math.PI * 2;

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

    window.addEventListener("solar-sim:navigate", (event) => {
        root.dataset.pendingRoute = event.detail.screenName;
    });

    if (canvas) {
        const backdrop = createOrbitBackdrop(canvas, store ? store.getState().graphics : null);

        window.addEventListener("solar-sim:graphics-settings-applied", (event) => {
            backdrop.applySettings(event.detail.graphics);
        });
    }
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
    const state = {
        frameIntervalMs: getFrameInterval(initialGraphicsSettings),
        lastFrameTime: 0,
        renderQuality: initialGraphicsSettings?.renderQuality || "medium",
        imageSmoothingEnabled: true,
        visualEffects: createWelcomeVisualEffectsDefaults(),
        width: 0,
        height: 0,
        pixelRatio: 1,
        particles: [],
        orbitCount: 8,
    };

    function resize() {
        state.pixelRatio = getPixelRatioForQuality(state.renderQuality);
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        canvas.width = Math.floor(state.width * state.pixelRatio);
        canvas.height = Math.floor(state.height * state.pixelRatio);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
        context.imageSmoothingEnabled = state.imageSmoothingEnabled;

        state.particles = createParticles(state.width, state.height, state.renderQuality);
        state.orbitCount = getOrbitCountForQuality(state.renderQuality);
    }

    function draw(time) {
        if (time - state.lastFrameTime < state.frameIntervalMs) {
            requestAnimationFrame(draw);
            return;
        }

        state.lastFrameTime = time;

        const elapsed = time * 0.0001;
        const centerX = state.width * 0.72;
        const centerY = state.height * 0.48;

        clearBackdrop(context, state);
        drawStars(context, state.particles, elapsed, state);
        drawOrbits(context, centerX, centerY, state.width, elapsed, state);

        requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(draw);

    return {
        applySettings(graphicsSettings) {
            state.frameIntervalMs = getFrameInterval(graphicsSettings);
            state.renderQuality = graphicsSettings.renderQuality;
            resize();
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

function createParticles(width, height, renderQuality) {
    const qualityMultipliers = {
        low: 0.58,
        medium: 1,
        high: 1.45,
    };
    const multiplier = qualityMultipliers[renderQuality] || qualityMultipliers.medium;
    const count = Math.round(Math.min(Math.max(width / 3.6, 220), 620) * multiplier);

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

function clearBackdrop(context, state) {
    if (state.visualEffects.motionBlur) {
        context.fillStyle = "rgba(7, 9, 13, 0.32)";
        context.fillRect(0, 0, state.width, state.height);
        return;
    }

    context.clearRect(0, 0, state.width, state.height);
}

function drawStars(context, particles, elapsed, state) {
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
        context.shadowBlur = particle.radius * bloomScale;
        context.arc(x, y, particle.radius, 0, TWO_PI);
        context.fill();
        context.shadowBlur = 0;
    });
}

function drawOrbits(context, centerX, centerY, width, elapsed, state) {
    const orbitCount = state.orbitCount;
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
    context.shadowBlur = bodyRadius * (state.visualEffects.bloom ? 8 : 4);
    context.fillStyle = index === 0 ? "#ffffff" : "rgba(255, 255, 255, 0.92)";
    context.arc(centerX + rotatedX, centerY + rotatedY, bodyRadius, 0, TWO_PI);
    context.fill();
    context.shadowBlur = 0;
}

function pseudoRandom(value) {
    const x = Math.sin(value) * 10000;
    return x - Math.floor(x);
}

function getFrameInterval(graphicsSettings) {
    const fpsLimit = graphicsSettings?.fpsLimit || "60";

    if (fpsLimit === "unlimited") {
        return 0;
    }

    return 1000 / Number(fpsLimit);
}

function getPixelRatioForQuality(renderQuality) {
    if (renderQuality === "low") {
        return 1;
    }

    if (renderQuality === "high") {
        return Math.min(window.devicePixelRatio || 1, 2.5);
    }

    return Math.min(window.devicePixelRatio || 1, 2);
}

function getOrbitCountForQuality(renderQuality) {
    if (renderQuality === "low") {
        return 5;
    }

    if (renderQuality === "high") {
        return 10;
    }

    return 8;
}
