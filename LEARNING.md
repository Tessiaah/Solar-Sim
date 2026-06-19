# Solar Sim App Flow

This document explains how the app is put together from launch to rendering, including when the frontend calls Python, where snapshots are stored, and how backend physics state becomes visible in Three.js.

## 1. Core Rule

The project has a strict ownership split:

- Python owns physics state, timesteps, integrator execution, forces, scenario creation, and snapshots.
- The frontend owns rendering, camera, UI, labels, overlays, and visual previews.
- Python physics uses SI units: meters, seconds, kilograms, m/s, m/s², joules, and kg m/s.
- Three.js uses compressed scene units only for display.
- The frontend never directly mutates Python physics state. It requests changes through backend API calls.

## 2. Program Launch

The desktop app starts from Python:

```text
main.py
    -> src/app/launcher.py
    -> opens frontend/index.html in PyWebView
    -> exposes AppApi as window.pywebview.api
```

When `index.html` loads, frontend scripts initialize:

```text
frontend/js/app.js
    -> settings store
    -> screen router
    -> welcome screen
    -> scenarios screen
    -> settings screen
    -> simulation screen
```

The app initially shows the welcome screen.

Important: opening the program does not start backend physics stepping.

## 3. Frontend Backend Wrapper

All JavaScript-to-Python calls go through:

```js
// frontend/js/api/backend-api.js
function call(methodName, ...args) {
    const api = window.pywebview?.api || null;
    const method = api?.[methodName];

    if (typeof method !== "function") {
        return Promise.resolve(null);
    }

    return Promise.resolve(method(...args));
}
```

The simulation wrapper maps frontend method names to Python/PyWebView method names:

```js
simulation: {
    updateBodyParameters(bodyId, updates) {
        return call("update_body_parameters", bodyId, updates);
    },
    resetBody(bodyId) {
        return call("reset_body", bodyId);
    },
    loadScenario(scenarioId) {
        return call("load_scenario", scenarioId);
    },
    step(steps) {
        return call("step_simulation", steps);
    },
    getSnapshot() {
        return call("get_simulation_snapshot");
    },
    getScenarioMetadata() {
        return call("get_scenario_metadata");
    },
}
```

Python receives those calls in `src/app/api.py` and delegates to `SimulationRuntime`.

## 4. Entering The Simulation Screen

The simulation does not run until the app navigates to the simulation screen.

The key event handler is:

```js
// frontend/js/screens/simulation.js
window.addEventListener("solar-sim:navigate", (event) => {
    if (event.detail.screenName === "simulation") {
        renderer.stop();

        const scenarioRequest = scenarioIdToLoad
            ? renderer.loadScenario(scenarioIdToLoad)
            : renderer.resetScenario();

        scenarioRequest.finally(() => {
            renderer.setPaused(false);
            renderer.start();
        });
        return;
    }

    renderer.stop();
});
```

This means:

```text
user enters simulation screen
    -> stop any previous renderer loop
    -> load requested scenario or reset current/default scenario
    -> unpause simulation
    -> start renderer loop
```

Returning from Settings can resume an existing simulation instead of resetting it, but entering from the main menu loads or resets a scenario.

## 5. Starting The Renderer Loop

`renderer.start()` does not immediately call `step_simulation(...)`. It first asks Python for the current snapshot.

```js
// frontend/js/rendering/simulation-renderer.js
function start() {
    if (destroyed || running) {
        return;
    }

    running = true;
    runToken += 1;

    cameraController.start();
    resize();

    loadCurrentSnapshot(activeRunToken).finally(() => {
        if (isActiveRun(activeRunToken)) {
            scheduleFrame(activeRunToken);
        }
    });
}
```

The first backend state read is:

```js
async function loadCurrentSnapshot(activeRunToken) {
    await ensureScenarioMetadata(requestStateToken);
    const snapshot = await window.SolarSim.backend.simulation.getSnapshot();

    if (snapshot && isActiveRun(activeRunToken)) {
        setLastSnapshot(snapshot);
    }
}
```

Then the renderer schedules the first browser frame:

```js
function scheduleFrame(activeRunToken) {
    if (animationFrame) {
        return;
    }

    animationFrame = requestAnimationFrame(() => frame(activeRunToken));
}
```

`requestAnimationFrame(...)` is a browser API. It tells the browser to call `frame(...)` before the next visual repaint.

## 6. The Frame Loop

The main renderer loop is:

```js
function frame(activeRunToken) {
    animationFrame = null;

    if (!isActiveRun(activeRunToken)) {
        return;
    }

    const deltaS = getRenderDeltaS();

    if (!paused && !stepRequestInFlight) {
        requestSimulationStep(activeRunToken, playbackStepsPerFrame);
    }

    renderCurrentFrame(deltaS);

    if (isActiveRun(activeRunToken)) {
        scheduleFrame(activeRunToken);
    }
}
```

Each frame does two separate things:

1. If simulation is unpaused and Python is not already stepping, it starts a backend step request.
2. It renders the latest snapshot currently available.

The frame does not `await` the backend step. Rendering continues while Python works.

## 7. Backend Physics Step

The frontend asks Python for new physics state here:

```js
async function requestSimulationStep(activeRunToken, steps) {
    if (stepRequestInFlight || destroyed) {
        return { ok: false, reason: "Simulation step already in progress." };
    }

    stepRequestInFlight = true;

    try {
        const response = await window.SolarSim.backend.simulation.step(steps);
        const snapshot = response?.snapshot;

        if (snapshot && isActiveRun(activeRunToken) && requestStateToken === simulationStateToken) {
            setLastSnapshot(snapshot);
        }

        return response;
    } finally {
        stepRequestInFlight = false;
    }
}
```

This maps to Python:

```python
# src/app/api.py
def step_simulation(self, steps: int = 1) -> dict:
    return self.simulation.step(steps)
```

Then the runtime advances the system:

```python
# src/simulation/runtime.py
def step(self, steps: int = 1) -> dict:
    safe_steps = max(1, min(int(steps), 240))

    for _ in range(safe_steps):
        velocity_verlet(self._bodies, self._dt_s)
        self._elapsed_s += self._dt_s

    return {
        "ok": True,
        "snapshot": self.get_snapshot(),
    }
```

So the speed buttons do not change the timestep. They change how many fixed backend steps are requested per frontend frame.

## 8. Snapshot Creation

Python returns dynamic state with `get_snapshot()`:

```python
def get_snapshot(self) -> dict:
    diagnostics = compute_system_diagnostics(self._bodies)

    return {
        "scenarioId": self._scenario_id,
        "elapsedS": self._elapsed_s,
        "dtS": self._dt_s,
        "bodies": [
            serialize_body_state(body, diagnostics["accelerations"][index])
            for index, body in enumerate(self._bodies)
        ],
        "diagnostics": serialize_diagnostics(diagnostics),
    }
```

Snapshot shape:

```js
{
  scenarioId: "solar-system",
  elapsedS: 123456.0,
  dtS: 3600.0,
  bodies: [
    {
      id: "earth",
      positionM: [x, y, z],
      velocityMS: [vx, vy, vz],
      accelerationMS2: [ax, ay, az]
    }
  ],
  diagnostics: {
    kineticEnergyJ: ...,
    potentialEnergyJ: ...,
    totalEnergyJ: ...,
    momentumKgMS: [px, py, pz],
    momentumMagnitudeKgMS: ...,
    barycenterM: [x, y, z]
  }
}
```

This snapshot does not contain Three.js mesh positions, scaled scene coordinates, camera state, UI state, or settings.

## 9. Where Snapshots Enter The Frontend

Every backend response that contains a snapshot calls:

```js
function setLastSnapshot(snapshot) {
    lastSnapshot = snapshot;
    currentScenarioId = snapshot.scenarioId || currentScenarioId;
    updateReadoutTarget(snapshot.elapsedS, hasSnapshot);
    hasSnapshot = true;
    emitSimulationMetrics(snapshot);
    notifySnapshot(snapshot);
}
```

This function stores the latest backend truth in:

```js
lastSnapshot
```

The renderer does not immediately mutate every mesh in `setLastSnapshot(...)`. It stores the data and notifies listeners. The actual visual application happens in `renderCurrentFrame(...)`.

## 10. Where Snapshots Become Three.js Objects

The central render function is:

```js
function renderCurrentFrame(deltaS) {
    if (lastSnapshot) {
        syncBodyMeshes(lastSnapshot.bodies);
        updateBodyPositions(lastSnapshot.bodies);
        updateBodyRingAnimations(deltaS);
        updateDynamicLights(lastSnapshot.bodies);
        updateOrbitLineVisibility();
        updateTrails(lastSnapshot);
        updateDebugVectors(lastSnapshot.bodies);
        updateBarycenterMarker(lastSnapshot);
        updateReadouts(lastSnapshot);
    }

    cameraController.update(deltaS);
    updateTrackedCameraTarget();
    updateSelectionMarker(deltaS);
    transformGizmo.update();
    updateBodyLabels();
    sceneObjects.backdrop.update(clock.getElapsedTime());
    renderer.render(scene, camera);
    emitRendererMetrics();
}
```

The most important snapshot-to-render function is:

```js
function updateBodyPositions(bodies) {
    bodies.forEach((body) => {
        const mesh = bodyMeshes.get(body.id);

        if (!mesh) {
            return;
        }

        scale.toScenePosition(getBodyRenderPositionM(body), mesh.position);

        const rings = bodyRingMeshes.get(body.id);

        if (rings) {
            rings.position.copy(mesh.position);
        }
    });
}
```

This is the exact conversion:

```text
snapshot body.positionM, in meters
    -> getBodyRenderPositionM(body)
    -> scale.toScenePosition(...)
    -> mesh.position, in Three.js scene units
```

Then Three.js draws:

```js
renderer.render(scene, camera);
```

## 11. Snapshot Data In The UI

The simulation screen listens for snapshots:

```js
renderer.onSnapshot((snapshot) => {
    uiState.latestSnapshot = snapshot;
    updateSelectedBodyStats(controls.stats, uiState, controls.tuning);
    syncBodyTuningControls(controls.tuning, uiState);
});
```

Selected body stats read from `uiState.latestSnapshot`:

```js
const snapshotBody = selectedBodyId
    ? uiState.latestSnapshot?.bodies?.find((body) => body.id === selectedBodyId)
    : null;
```

Distance uses:

```js
snapshotBody.positionM
```

Velocity uses:

```js
snapshotBody.velocityMS
```

So the UI displays the same SI-unit truth that the renderer received from Python.

## 12. Full Simulation Flow Summary

End-to-end:

```text
program opens
    -> PyWebView loads frontend
    -> app starts on welcome screen
    -> no physics stepping yet

user enters simulation screen
    -> simulation screen handles solar-sim:navigate
    -> renderer.loadScenario(...) or renderer.resetScenario(...)
    -> Python returns scenario metadata + initial snapshot
    -> setLastSnapshot(initialSnapshot)
    -> renderer.start()
    -> loadCurrentSnapshot()
    -> setLastSnapshot(snapshot)
    -> scheduleFrame()

browser calls frame()
    -> if not paused and no step in flight:
        -> requestSimulationStep(...)
        -> frontend calls backend step_simulation(steps)
        -> Python runs velocity_verlet(...) for fixed dt
        -> Python returns snapshot
        -> frontend setLastSnapshot(newSnapshot)

same frame, and every frame:
    -> renderCurrentFrame()
    -> syncBodyMeshes(lastSnapshot.bodies)
    -> updateBodyPositions(lastSnapshot.bodies)
    -> scale meters into Three.js scene units
    -> update labels, lights, trails, vectors, readouts
    -> renderer.render(scene, camera)
    -> schedule next frame
```

The backend is the source of truth. The frontend renders the latest truth it has.

## 13. Sync vs Async

Async from the frontend perspective:

- `loadCurrentSnapshot(...)`
- `loadScenario(...)`
- `updateBodyParameters(...)`
- `resetBody(...)`
- `requestSimulationStep(...)`
- `createAndLaunchCustomScenario(...)`

These are async because they call Python through PyWebView.

Synchronous frontend operations:

- `renderCurrentFrame(...)`
- `syncBodyMeshes(...)`
- `updateBodyPositions(...)`
- `updateBodyLabels(...)`
- `previewBodyParameters(...)`
- `selectBody(...)`
- `setPaused(...)`

Python simulation methods are synchronous. For example, `SimulationRuntime.step(...)` runs the integrator immediately and returns a dict. JavaScript sees that call as promise-based because of the PyWebView bridge.

## 14. Scenario Metadata vs Snapshots

Scenario metadata is mostly static:

- body ids
- body names
- mass
- radius
- colors
- visual metadata
- texture metadata
- ring metadata
- static orbit-guide metadata
- body facts

Snapshots are dynamic:

- current position
- current velocity
- current acceleration
- elapsed time
- diagnostics

The renderer uses both:

```text
scenario metadata
    -> create meshes/materials/rings/labels/orbit guides

snapshot
    -> update positions, lights, vectors, trails, diagnostics, readouts
```

## 15. Initial Planet Positions

Initial positions are decided in Python, not in Three.js.

The physical constants live in:

```text
src/data/constants.py
```

For example, each planet has a real distance from the Sun in meters:

```python
EARTH_DISTANCE_FROM_SUN_M = 1.496e11
VENUS_DISTANCE_FROM_SUN_M = 1.082e11
```

The scenario module then gives each planet a fixed starting angle:

```python
# src/simulation/scenario.py
PLANET_INITIAL_PHASES_RAD = {
    "Mercury": np.deg2rad(20.0),
    "Venus": np.deg2rad(78.0),
    "Earth": np.deg2rad(142.0),
    "Mars": np.deg2rad(215.0),
    "Jupiter": np.deg2rad(305.0),
    "Saturn": np.deg2rad(35.0),
    "Uranus": np.deg2rad(168.0),
    "Neptune": np.deg2rad(260.0),
}
```

Those angles are not live NASA ephemeris data. They are stable starting phases used to spread the planets around the Sun instead of placing every planet on the same line.

Planet creation happens through:

```python
def create_planet(name: str, phase_rad: float = 0.0) -> SimBody:
    spec = PLANET_SPECS[name]
    position_m = circular_orbit_position(spec["distance_m"], phase_rad)
    velocity_ms = circular_orbit_velocity(spec["orbital_speed_ms"], phase_rad)
```

The initial position formula is:

```python
def circular_orbit_position(distance_m: float, phase_rad: float) -> np.ndarray:
    return np.array([
        distance_m * np.cos(phase_rad),
        distance_m * np.sin(phase_rad),
        0.0,
    ], dtype=np.float64)
```

So every planet starts on the `X/Y` orbital plane:

```text
x = orbital_distance_m * cos(start_angle)
y = orbital_distance_m * sin(start_angle)
z = 0
```

The initial velocity is built from the same angle:

```python
def circular_orbit_velocity(speed_ms: float, phase_rad: float) -> np.ndarray:
    return np.array([
        -speed_ms * np.sin(phase_rad),
        speed_ms * np.cos(phase_rad),
        0.0,
    ], dtype=np.float64)
```

That velocity is perpendicular to the radius vector, which gives the body an initial circular-orbit approximation.

The full solar system uses all configured planet phases:

```python
def create_solar_system() -> list[SimBody]:
    planets = [
        create_planet(name, PLANET_INITIAL_PHASES_RAD[name])
        for name in PLANET_ORDER
    ]
```

Custom scenarios use only the selected planets, but keep the same per-planet phase values:

```python
def create_planets_for_names(planet_names: tuple[str, ...]) -> list[SimBody]:
    return [
        create_planet(name, PLANET_INITIAL_PHASES_RAD[name])
        for name in planet_names
    ]
```

The simple Sun-Earth scenario is a special case:

```python
def create_sun_earth_system() -> list[SimBody]:
    return [
        create_sun(np.array([0.0, sun_velocity_y, 0.0], dtype=np.float64)),
        create_planet("Earth"),
    ]
```

Because `create_planet("Earth")` does not pass a phase, Earth uses the default `phase_rad = 0.0`. That places Earth at:

```text
[EARTH_DISTANCE_FROM_SUN_M, 0, 0]
```

The Sun always starts at the origin:

```python
position_m=np.array([0.0, 0.0, 0.0], dtype=np.float64)
```

For scenarios with a Sun, the Sun is then given a small velocity that balances the total starting momentum of the planets:

```python
def calculate_momentum_balancing_sun_velocity(planets: list[SimBody]) -> np.ndarray:
    planet_momentum = np.zeros(3, dtype=np.float64)

    for planet in planets:
        planet_momentum += planet.definition.mass_kg * planet.state.velocity_ms

    return -planet_momentum / SUN_MASS_KG
```

For sunless systems, planets are first created from their normal Sun-based positions, then the selected system is recentered around its own barycenter:

```python
def create_sunless_planet_system(planets: list[SimBody]) -> list[SimBody]:
    sunless_planets = [
        remove_solar_parent_metadata(planet)
        for planet in planets
    ]

    return recenter_system_to_barycentric_frame(sunless_planets)
```

That means a sunless system does not keep the Sun as a hidden body. It genuinely removes the solar parent metadata and recenters the selected bodies in their own mass-weighted frame.

## 16. Custom Scenario Flow

The frontend sends selected stable ids:

```js
{
  bodyIds: ["venus", "earth", "mars"],
  includeSun: true,
  name: "My Custom System"
}
```

Python validates those ids:

```python
selected_body_ids = normalize_body_ids(safe_config.get("bodyIds"))
selected_planet_names = tuple(
    get_planet_name_from_id(body_id)
    for body_id in selected_body_ids
)
```

Then it creates a runtime scenario entry:

```python
scenario = create_custom_scenario_entry(
    scenario_id,
    scenario_name,
    selected_body_ids,
    include_sun,
)
```

That entry still contains a factory:

```python
{
    "id": scenario_id,
    "name": scenario_name,
    "description": build_custom_scenario_description(selected_names, include_sun),
    "factory": (
        lambda selected_names=selected_names, include_sun=include_sun:
            create_custom_solar_system(selected_names, include_sun)
    ),
    "custom": True,
    "includeSun": include_sun,
    "selectedBodyIds": selected_ids,
}
```

It stores a factory instead of live body objects, so every load/reset creates fresh `SimBody` instances.

The app also persists the recipe for custom scenarios:

```json
{
  "version": 1,
  "lastCustomScenarioCounter": 1,
  "scenarios": [
    {
      "id": "custom-1",
      "name": "My Custom System",
      "selectedBodyIds": ["venus", "earth", "mars"],
      "includeSun": true
    }
  ]
}
```

This file is stored under:

```text
%APPDATA%\Solar Sim\custom_scenarios.json
```

Only the scenario recipe is saved. Python does not save sandbox-edited masses, radii, positions, velocities, elapsed time, snapshots, or live `SimBody` objects.

When the app starts, `SimulationRuntime` loads the saved recipes and calls the same scenario-entry builder to recreate the in-memory factory. That keeps scenario loading/reset behavior clean: a saved custom scenario always starts from its default generated state.

Then it immediately loads the new scenario:

```python
return self.load_scenario(scenario_id)
```

Deleting a custom scenario removes the recipe from memory and rewrites the JSON file. Built-in scenarios are not deletable.

## 17. Physics Units vs Render Units

Backend state stays in SI units.

Frontend display uses compressed render scale:

```js
scale.toScenePosition(positionM, mesh.position);
```

The transform gizmo performs the reverse conversion before committing:

```js
const positionM = scale.fromScenePosition(nextScenePosition);
commitPositionM(bodyId, positionM);
```

So:

```text
Python -> frontend:
    meters
    -> scale.toScenePosition
    -> Three.js scene units

frontend drag -> Python:
    Three.js scene units
    -> scale.fromScenePosition
    -> meters
    -> update_body_parameters(..., { positionM })
```

The backend stores literal meters. `[150, 0, 0]` means 150 meters, not one AU and not 150 render units.
