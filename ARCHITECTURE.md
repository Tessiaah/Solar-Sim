# Solaris Engine Architecture Guide

This document explains the current architecture of Solaris Engine in a way that is useful for a project presentation. It focuses on how data moves through the application, where state is stored, how the frontend and backend communicate, and how physics state is kept separate from rendering and interface state.

## 1. High-Level Architecture

Solaris Engine is a local desktop application built from two main layers:

- **Python backend**: owns the simulation state, physics calculations, scenario factories, saved custom scenario recipes, timestep, integrator, and diagnostics.
- **HTML/CSS/JavaScript frontend**: owns the interface, screen routing, settings UI, camera controls, Three.js rendering, labels, orbit guide lines, visual effects, and display scaling.

The application is hosted through **PyWebView**. Python opens a native desktop window and loads `frontend/index.html` inside it. JavaScript communicates with Python through the PyWebView `js_api`, exposed by `src/app/api.py`.

The most important design rule in the project is that the frontend does not directly mutate physics state. If the user changes a body's mass, radius, speed, or position, the frontend sends a request to Python. Python validates and applies the change, then returns fresh metadata and a fresh simulation snapshot. The frontend then renders the returned state.

## 2. Main Runtime Layers

The application starts in `main.py`, which calls `launch_app()` from `src/app/launcher.py`.

`src/app/launcher.py` is responsible for the desktop host:

- resolves `frontend/index.html`;
- creates a PyWebView window;
- sets the window title, size, minimum size, icon, and Windows AppUserModelID;
- creates one `AppApi` instance and exposes it to JavaScript.

`src/app/api.py` is the bridge object exposed to the frontend. It contains:

- `HostWindowApi`, which handles native window actions;
- `SimulationRuntime`, which handles all simulation actions.

The frontend starts from `frontend/index.html`. Scripts are loaded directly with `<script defer>`, with no build step. Public JavaScript modules are attached to `window.SolarSim`, so script order matters.

The frontend entrypoint is `frontend/js/app.js`. It creates:

- the settings store;
- the i18n translation service;
- the screen router;
- the welcome, scenarios, settings, about, and simulation screens;
- runtime settings effects.

## 3. Backend In-Memory State

The main simulation object is `SimulationRuntime` in `src/simulation/runtime.py`.

At runtime it stores:

```python
self._bodies
self._scenario_id
self._custom_scenarios
self._custom_scenario_counter
self._scenario_storage
self._elapsed_s
self._dt_s
```

The meaning of those fields is:

- `_bodies`: the current live list of simulated bodies.
- `_scenario_id`: the id of the scenario currently loaded.
- `_custom_scenarios`: in-memory registry of saved custom scenario entries.
- `_custom_scenario_counter`: counter used to generate stable ids such as `custom-1`.
- `_scenario_storage`: persistence helper for custom scenario JSON.
- `_elapsed_s`: elapsed simulation time in seconds.
- `_dt_s`: physics timestep in seconds. It is currently `DAY_S / 24.0`, which means one physics step represents one simulated hour.

The body model is defined in `src/simulation/body.py`:

- `BodyState`: mutable position and velocity vectors.
- `CelestialBody`: mostly static physical and visual definition.
- `SimBody`: combines a `CelestialBody` definition with a mutable `BodyState`.
- `BodyVisual`: renderer-facing material, texture, emissive, and ring metadata.
- `BodyOrbit`: static expected-orbit guide metadata.
- `BodyRing` and `BodyRingBand`: visual ring metadata for planets such as Saturn.

This split matters because the app keeps long-lived physical identity separate from fast-changing movement state. A body's mass, radius, texture, facts, and ring data belong to the definition. Its position and velocity belong to the state.

## 4. Persistent JSON Storage

Most runtime state is not persisted. Physics state, elapsed time, selected body, camera position, settings, and sandbox-edited body values are in memory only.

The project currently persists only custom scenario recipes. They are saved by `CustomScenarioStorage` in `src/simulation/scenario_storage.py`.

The storage path is:

```text
%APPDATA%\Solar Sim\custom_scenarios.json
```

The JSON file stores a version number, the last custom scenario counter, and the scenario recipes. A realistic saved file looks like this:

```json
{
  "lastCustomScenarioCounter": 2,
  "scenarios": [
    {
      "id": "custom-1",
      "includeSun": true,
      "name": "Inner Planets",
      "selectedBodyIds": ["mercury", "venus", "earth", "mars"]
    },
    {
      "id": "custom-2",
      "includeSun": false,
      "name": "Gas Giants Only",
      "selectedBodyIds": ["jupiter", "saturn", "uranus", "neptune"]
    }
  ],
  "version": 1
}
```

This file deliberately stores only the recipe needed to recreate a clean scenario:

- scenario id;
- scenario name;
- selected body ids;
- whether the Sun is included.

It does not store live positions, live velocities, elapsed time, altered masses, altered radii, camera state, or temporary UI state. On startup, Python reads the recipes and rebuilds the in-memory scenario factories from them.

The save operation writes to a temporary file first and then replaces the real JSON file. If the JSON is missing, invalid, or contains malformed entries, the loader ignores invalid data and starts with the valid recipes it can parse.

## 5. Scenario Architecture

Built-in scenarios are registered in `SCENARIOS` in `src/simulation/runtime.py`.

The registry stores scenario-level information:

```python
SCENARIOS = {
    "solar-system": {
        "id": "solar-system",
        "name": "Solar System",
        "description": "Full Solar System",
        "factory": create_solar_system,
    },
}
```

The registry does not duplicate planet colors, textures, masses, names, facts, or orbit data. That information belongs to the body definitions created by the scenario factory in `src/simulation/scenario.py`.

The main scenario factories are:

- `create_sun_earth_system()`;
- `create_solar_system()`;
- `create_custom_solar_system(planet_names, include_sun=True)`;
- `create_scenario_body_catalog()`.

The scenario screen does not hardcode planet data in JavaScript. It asks Python for the catalog through `list_scenario_bodies()`. The frontend receives stable body ids such as `earth`, `mars`, and `jupiter`, then uses those ids for display and translation.

When a custom scenario is created, the frontend sends:

```json
{
  "name": "Inner Planets",
  "bodyIds": ["mercury", "venus", "earth", "mars"],
  "includeSun": true
}
```

Python validates the ids, converts them back to canonical planet names, creates a scenario entry, saves the recipe to JSON, registers an in-memory factory closure, and loads the new scenario.

The factory closure is not written to JSON. It exists only in memory because functions cannot be safely or usefully serialized. The JSON stores the recipe, and the factory is rebuilt from that recipe when the app starts.

## 6. Backend API

The PyWebView API surface is exposed by `AppApi` in `src/app/api.py`.

Host-window methods:

- `apply_window_settings(settings)`;
- `quit_app()`.

Simulation methods:

- `list_scenarios()`;
- `list_scenario_bodies()`;
- `create_custom_scenario(config)`;
- `delete_custom_scenario(scenario_id)`;
- `update_body_parameters(body_id, updates)`;
- `reset_body(body_id)`;
- `load_scenario(scenario_id="sun-earth")`;
- `step_simulation(steps=1)`;
- `get_simulation_snapshot()`;
- `get_scenario_metadata()`.

The frontend calls these methods through `frontend/js/api/backend-api.js`. That file is intentionally small. It wraps `window.pywebview.api`, calls methods by name, and always returns a Promise-like result to the frontend.

From the frontend point of view, backend calls are asynchronous:

```js
window.SolarSim.backend.simulation.step(steps)
window.SolarSim.backend.simulation.loadScenario(scenarioId)
window.SolarSim.backend.simulation.updateBodyParameters(bodyId, updates)
```

From the Python side, the API methods are normal synchronous Python methods returning JSON-serializable dictionaries. PyWebView handles the boundary between JavaScript and Python.

## 7. Static Metadata and Dynamic Snapshots

The app separates static scenario metadata from dynamic simulation snapshots.

Static metadata describes what exists:

```json
{
  "id": "earth",
  "name": "Earth",
  "massKg": 5.972e24,
  "radiusM": 6371000,
  "color": "#4f85ff",
  "isFixed": false,
  "parent": "Sun",
  "parentId": "sun",
  "facts": ["facts.earth.life", "facts.earth.surfaceWater"],
  "visual": {
    "kind": "standard",
    "baseColor": "#4f85ff",
    "textures": {
      "map": "./assets/textures/planets/earth.jpg"
    }
  },
  "orbit": {
    "semiMajorAxisM": 149597870700,
    "eccentricity": 0.0,
    "inclinationRad": 0.0,
    "longitudeOfAscendingNodeRad": 0.0,
    "argumentOfPeriapsisRad": 0.0,
    "centerM": [0.0, 0.0, 0.0]
  }
}
```

Dynamic snapshots describe where things are right now:

```json
{
  "scenarioId": "solar-system",
  "elapsedS": 3600.0,
  "dtS": 3600.0,
  "bodies": [
    {
      "id": "earth",
      "positionM": [149597870700.0, 0.0, 0.0],
      "velocityMS": [0.0, 29780.0, 0.0],
      "accelerationMS2": [-0.00593, 0.0, 0.0]
    }
  ],
  "diagnostics": {
    "kineticEnergyJ": 0.0,
    "potentialEnergyJ": 0.0,
    "totalEnergyJ": 0.0,
    "momentumKgMS": [0.0, 0.0, 0.0],
    "momentumMagnitudeKgMS": 0.0,
    "barycenterM": [0.0, 0.0, 0.0]
  }
}
```

The renderer caches metadata in a `Map` keyed by body id. It stores the latest dynamic snapshot in `lastSnapshot`. Static metadata is not resent on every physics step. This avoids repeated material and texture data on every frame.

## 8. Physics and Integrator

Physics is implemented in `src/simulation/physics.py`.

All physics calculations use SI units:

- position in meters;
- velocity in meters per second;
- acceleration in meters per second squared;
- mass in kilograms;
- time in seconds;
- energy in joules.

The gravitational acceleration on a body is computed with the N-body acceleration equation:

```text
a_i = sum(G * m_j * (r_j - r_i) / |r_j - r_i|^3)
```

The code computes acceleration directly rather than force, because the target body's mass cancels out when using Newton's second law. Every non-fixed body is affected by every other body.

The integrator is Velocity Verlet. For each physics step:

1. Compute the old accelerations from the current positions.
2. Update positions using current velocity and old acceleration.
3. Compute new accelerations from the updated positions.
4. Update velocities using the average of old and new acceleration.

The equations are:

```text
r(t + dt) = r(t) + v(t)dt + 0.5a(t)dt^2
v(t + dt) = v(t) + 0.5(a(t) + a(t + dt))dt
```

`SimulationRuntime.step(steps)` runs this integrator in a loop. Each loop advances the simulation by `_dt_s`, currently one simulated hour. The frontend speed buttons do not change the timestep. They only change how many one-hour steps are requested per accepted rendered frame.

For example:

- `1x` requests 1 physics step per frame;
- `4x` requests 4 physics steps per frame;
- `16x` requests 16 physics steps per frame;
- `64x` requests 64 physics steps per frame.

The backend clamps the requested number of steps using `MAX_INTEGRATION_STEPS`, currently `240`, so one request cannot ask Python to run an unbounded amount of physics work.

Physics diagnostics are recalculated when snapshots are created:

- acceleration for each body;
- kinetic energy;
- gravitational potential energy;
- total energy;
- total momentum;
- barycenter.

The frontend displays those diagnostics, but it does not compute forces or update physics from them.

## 9. Frontend Runtime State

The frontend has several independent state holders:

- `settingsStore`: runtime settings, currently memory-only.
- `i18n`: current language and translation function.
- `router`: current screen.
- `simulation.js` UI state: selected body metadata, latest snapshot, panel state, tuning previews.
- `simulation-renderer.js` renderer state: Three.js scene, camera, meshes, labels, orbit lines, trails, vectors, material cache, latest snapshot.

The frontend does not have a framework. Instead, it uses small modules attached to `window.SolarSim`.

The main screen router toggles the active screen by setting the `screen-active` class on elements with `data-screen`. After every route change, it dispatches:

```js
new CustomEvent("solar-sim:navigate", {
    detail: { screenName, previousScreen },
})
```

Screens use that event to start or stop work. The simulation renderer starts only on the simulation screen. The welcome animation starts only on the welcome screen.

## 10. Frame Loop

The simulation renderer owns the main Three.js frame loop in `frontend/js/rendering/simulation-renderer.js`.

The important functions are:

- `start()`;
- `loadCurrentSnapshot()`;
- `scheduleFrame()`;
- `frame()`;
- `requestSimulationStep()`;
- `setLastSnapshot()`;
- `renderCurrentFrame()`;
- `stop()`.

The call order is:

1. `start()` marks the renderer as running, starts the camera controller, resizes the canvas, and loads the current snapshot.
2. `loadCurrentSnapshot()` ensures scenario metadata exists, calls `get_simulation_snapshot()`, and stores the returned snapshot.
3. `scheduleFrame()` asks the browser to call `frame()` through `requestAnimationFrame`.
4. `frame()` checks the FPS limiter, optionally starts one backend physics request, renders the current scene, and schedules the next frame.
5. `requestSimulationStep()` calls `step_simulation(steps)` asynchronously.
6. When Python returns, `setLastSnapshot()` stores the new snapshot, updates the time readout target, emits diagnostics metrics, and notifies UI listeners.
7. `renderCurrentFrame()` renders the latest available snapshot, updates camera controls, labels, backdrop animation, gizmos, and then calls `renderer.render(scene, camera)`.

The backend does not push frames and does not know the target FPS. The browser owns the render timing through `requestAnimationFrame`, and the frontend decides when to request simulation steps.

This is why camera movement can still feel smooth while the planets update more slowly on weak hardware. The camera and UI render from the latest available snapshot every frame, but planets only move to new physics positions after Python returns a newer snapshot.

The renderer uses two token systems:

- `runToken` prevents old animation frames from continuing after the renderer has stopped.
- `simulationStateToken` prevents old async backend responses from overwriting newer scenario or body state.

## 11. UI Updates Versus Three.js Body Updates

The simulation screen and the Three.js renderer have separate responsibilities.

`frontend/js/screens/simulation.js` owns DOM elements:

- selected body dropdown;
- pause, step, reset, and speed buttons;
- labels, orbit, and track toggles;
- body stat cards;
- facts panel;
- sandbox controls;
- camera quick settings menu;
- inspector drawer;
- orientation gizmo DOM controls.

`frontend/js/rendering/simulation-renderer.js` owns Three.js objects:

- scene;
- camera;
- WebGL renderer;
- body meshes;
- ring meshes;
- label sprites;
- selected-body marker;
- orbit guide lines;
- trail lines;
- velocity and acceleration vectors;
- barycenter marker;
- transform gizmo;
- space backdrop;
- lights and materials.

The screen listens to renderer events:

- `onBodiesChanged(...)`;
- `onSelectionChanged(...)`;
- `onSnapshot(...)`;
- `onPlaybackChanged(...)`.

When scenario metadata changes, the renderer calls `notifyBodiesChanged()`. The screen rebuilds the body selector and updates the selected-body panels from that metadata.

When a new snapshot arrives, the renderer calls `notifySnapshot(snapshot)`. The screen stores it as `uiState.latestSnapshot` and updates the selected body's displayed distance and velocity.

The Three.js bodies are updated separately in `renderCurrentFrame()`:

- `syncBodyMeshes(lastSnapshot.bodies)` creates or removes meshes to match the snapshot body list;
- `updateBodyPositions(lastSnapshot.bodies)` moves each mesh to the latest position;
- `updateDynamicLights(lastSnapshot.bodies)` moves the main light to the Sun or another emissive body;
- `updateOrbitLineVisibility()`, `updateTrails()`, `updateDebugVectors()`, and `updateBarycenterMarker()` update optional visual helpers;
- `updateBodyLabels()` moves label sprites above their bodies.

The DOM never edits a Three.js mesh directly. It asks the renderer to perform renderer-owned actions such as selecting a body, toggling orbit lines, or previewing a radius change.

## 12. Display Scaling

Python physics remains in real SI units. Three.js uses renderer-only scene units.

The conversion is centralized in `createDisplayScale()` in `frontend/js/rendering/simulation-renderer.js`.

For positions:

- real distances up to `1 AU` are rendered linearly;
- `1 AU` maps to `150` scene units;
- distances beyond `1 AU` are square-root compressed;
- Python's `[x, y, z]` is mapped to Three.js as `[x, z, y]` so the orbital plane appears as the horizontal scene plane.

For radii:

- the Sun uses a special compressed visual radius;
- planets use a square-root radius scale based on Earth radius;
- planet visual radii are capped so the simulation remains readable.

This scaling is visual only. It does not change masses, positions, velocities, accelerations, orbital calculations, or diagnostics in Python.

The transform gizmo uses the inverse conversion when committing a dragged scene position back to Python. The renderer previews the drag visually, then sends a real `positionM` vector to `update_body_parameters()`.

## 13. Settings Architecture

Settings are defined in `frontend/js/settings/settings-schema.js`.

The settings categories are:

- `interface`;
- `graphics`;
- `simulation`;
- `camera`;
- `debug`.

Each setting has a key, label, type, default value, owner, and sometimes options or a `mapsTo` profile. The owner field is used as documentation of responsibility. For example, graphics settings are renderer-owned, while the listed physics integrator is Python-owned.

`frontend/js/settings/settings-store.js` creates the runtime store. It keeps settings in memory and dispatches events:

- `solar-sim:settings-changed`;
- `solar-sim:settings-reset`.

`frontend/js/settings/settings-effects.js` listens to those events and applies side effects:

- interface settings update the i18n language;
- graphics settings update document datasets, host window settings, renderer quality events, and FPS limiter state;
- simulation display settings update trail retention and integrator display;
- camera settings update CSS variables and dispatch camera settings events;
- debug settings update document datasets and dispatch debug settings events.

Quick controls inside the simulation screen use the same store for shared toggles such as labels and orbit lines. That keeps the simulation controls and Settings screen synchronized.

## 14. Translations

Translations are frontend-owned.

The dictionaries live in:

```text
frontend/js/i18n/translations.js
```

The runtime translation service lives in:

```text
frontend/js/i18n/i18n.js
```

Static HTML uses attributes such as:

```html
<span data-i18n="simulation.pause">Pause</span>
```

When the language changes, `i18n.applyDocument()` updates all matching DOM nodes.

Dynamic text uses helper functions in `frontend/js/utils/display-format.js`, such as:

- `bodyName(body)`;
- `scenarioName(scenario)`;
- `scenarioDescription(scenario)`;
- `metadataFact(factKey)`;
- `distance(valueM)`;
- `velocity(valueMS)`;
- `duration(valueS)`.

Body names are not translated in Python. Python sends stable ids such as `earth` and `saturn`. The frontend displays localized names through keys such as:

```text
bodies.earth.name
bodies.saturn.name
```

Body facts are stored on Python body definitions as translation keys, for example:

```text
facts.earth.life
facts.jupiter.largestPlanet
```

The frontend translates those keys when rendering the facts panel. This keeps scientific body definitions centralized in Python while keeping visible language in the frontend translation layer.

## 15. Materials, Textures, and Visual Metadata

Visual metadata is defined on Python bodies using `BodyVisual`.

Example:

```python
visual=BodyVisual(
    kind="standard",
    roughness=0.78,
    textures={
        "map": "./assets/textures/planets/earth.jpg",
    },
)
```

The renderer receives this metadata and creates Three.js materials through `frontend/js/rendering/materials.js`.

Supported texture keys include:

- `map`;
- `normalMap`;
- `roughnessMap`;
- `metalnessMap`;
- `emissiveMap`;
- `bumpMap`;
- `alphaMap`;
- `displacementMap`;
- `aoMap`.

The material factory caches loaded textures while a scenario is active. When scenario metadata is replaced, the renderer disposes meshes and clears the material cache so old texture resources are not kept unnecessarily.

Saturn's rings are defined as Python visual metadata using `BodyRing` and `BodyRingBand`. The renderer turns that metadata into ring geometry and a procedural ring texture. The rings are visual-only and do not affect gravitational calculations.

## 16. Body Mesh Creation Cycle

A body mesh begins as Python scenario data and becomes a Three.js object only after the frontend receives scenario metadata and a dynamic snapshot.

The cycle starts in `src/simulation/scenario.py`. A scenario factory creates `SimBody` objects. For a planet, `create_planet(...)` builds both the physical body definition and the initial dynamic state:

```python
def create_planet(name: str, phase_rad: float = 0.0) -> SimBody:
    spec = PLANET_SPECS[name]
    position_m = circular_orbit_position(spec["distance_m"], phase_rad)
    velocity_ms = circular_orbit_velocity(spec["orbital_speed_ms"], phase_rad)

    return SimBody(
        definition=CelestialBody(
            name=name,
            mass_kg=spec["mass_kg"],
            radius_m=spec["radius_m"],
            color=spec["color"],
            parent="Sun",
            visual=create_planet_visual(name, spec["roughness"]),
            orbit=BodyOrbit(semi_major_axis_m=spec["distance_m"]),
            facts=BODY_FACTS[name],
        ),
        state=BodyState(
            position_m=position_m,
            velocity_ms=velocity_ms,
        ),
    )
```

The texture is attached before the frontend is involved. `create_planet_visual(...)` looks up the correct image path in `BODY_TEXTURES` and stores it in `BodyVisual.textures`:

```python
BODY_TEXTURES = {
    "Earth": "./assets/textures/planets/earth.jpg",
}

def create_planet_visual(name: str, roughness: float) -> BodyVisual:
    return BodyVisual(
        kind="standard",
        roughness=roughness,
        textures={
            "map": BODY_TEXTURES[name],
        },
        rings=BODY_RINGS.get(name, ()),
    )
```

When the frontend loads a scenario, Python serializes the live `SimBody` definitions into JSON-compatible metadata through `serialize_body_metadata(...)` in `src/simulation/runtime.py`. The body id is generated from the canonical body name:

```python
def serialize_body_metadata(body) -> dict:
    definition = body.definition
    body_id = body_id_from_name(definition.name)

    return {
        "id": body_id,
        "name": definition.name,
        "massKg": definition.mass_kg,
        "radiusM": definition.radius_m,
        "color": definition.color,
        "visual": serialize_body_visual(definition),
    }
```

For Earth, the frontend receives metadata with an id such as `earth` and visual texture metadata such as:

```json
{
  "id": "earth",
  "name": "Earth",
  "radiusM": 6371000.0,
  "color": "#4f85ff",
  "visual": {
    "kind": "standard",
    "baseColor": "#4f85ff",
    "textures": {
      "map": "./assets/textures/planets/earth.jpg"
    }
  }
}
```

The renderer stores this metadata in `bodyMetadata`, a JavaScript `Map` keyed by body id. This happens in `applyScenarioMetadata(...)` in `frontend/js/rendering/simulation-renderer.js`:

```js
function applyScenarioMetadata(metadata) {
    currentScenarioId = metadata.id || currentScenarioId;
    disposeBodyMeshes();
    materialFactory.dispose();
    bodyMetadata.clear();

    metadata.bodies.forEach((body) => {
        bodyMetadata.set(body.id, body);
    });

    syncOrbitLines();
    selectedBodyId = chooseSelectedBodyId(selectedBodyId);
    notifyBodiesChanged();
    notifySelectionChanged();
}
```

No mesh is created by Python. Python only sends metadata and snapshots. The actual Three.js mesh is created during rendering, when `renderCurrentFrame(...)` calls `syncBodyMeshes(lastSnapshot.bodies)`.

`syncBodyMeshes(...)` compares the snapshot body ids with the existing `bodyMeshes` map. If a mesh for that id does not exist yet, it creates one and adds it to the Three.js scene:

```js
if (!bodyMeshes.has(body.id)) {
    const mesh = createBodyMesh(metadata, materialFactory, scale, geometryDetail);

    bodyMeshes.set(body.id, mesh);
    scene.add(mesh);
}
```

The id is not a Three.js id and is not generated by the renderer. It is the stable body id from Python, such as `sun`, `earth`, or `jupiter`. The renderer uses that id as the lookup key in maps such as:

```js
bodyMeshes
bodyRingMeshes
bodyLabels
orbitLines
bodyTrails
velocityVectorLines
accelerationVectorLines
```

`createBodyMesh(...)` builds the actual Three.js sphere. It uses the centralized display scale to choose a visual radius, creates a sphere geometry, asks the material factory for a material, and stores the body id in `mesh.userData` for renderer-side identification:

```js
function createBodyMesh(body, materialFactory, scale, geometryDetail) {
    const radius = scale.radiusForBody(body);
    const geometry = createSphereGeometry(radius, geometryDetail);
    const material = materialFactory.createMaterial(body);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.userData.bodyId = body.id;
    return mesh;
}
```

The material factory in `frontend/js/rendering/materials.js` reads `body.visual.textures`, loads the texture with `THREE.TextureLoader`, caches it, and applies it to the material after the image finishes loading:

```js
function createMaterial(body) {
    const visual = resolveBodyVisual(body);
    const textures = loadTextures(visual.textures);
    const options = createMaterialOptions(visual);
    const material = createThreeMaterial(visual.kind, options);

    applyTexturesAfterLoad(material, textures, visual.kind);
    return material;
}
```

After the mesh exists, its position is updated from the dynamic snapshot, not from metadata. `updateBodyPositions(...)` uses the same body id to find the existing mesh and move it:

```js
function updateBodyPositions(bodies) {
    bodies.forEach((body) => {
        const mesh = bodyMeshes.get(body.id);

        if (!mesh) {
            return;
        }

        scale.toScenePosition(getBodyRenderPositionM(body), mesh.position);
    });
}
```

The full chain is therefore:

1. `create_planet(...)` creates a `SimBody` with physical definition, visual metadata, and initial state.
2. `create_planet_visual(...)` attaches the texture path through `BodyVisual`.
3. `SimulationRuntime.load_scenario(...)` creates the live body list.
4. `serialize_body_metadata(...)` sends static body metadata to the frontend.
5. `get_snapshot()` or `step(...)` sends dynamic position and velocity snapshots.
6. `applyScenarioMetadata(...)` caches body metadata by stable id.
7. `syncBodyMeshes(...)` creates a Three.js mesh if that id has no mesh yet.
8. `createBodyMesh(...)` creates the sphere geometry and material.
9. `materialFactory.createMaterial(...)` loads and applies the texture from metadata.
10. `scene.add(mesh)` inserts the mesh into the Three.js scene.
11. `updateBodyPositions(...)` moves the existing mesh from each new snapshot.

This is why the same body id can safely connect Python physics, metadata, texture selection, UI labels, body selection, orbit guides, trails, vectors, and the actual Three.js mesh without duplicating body definitions in the frontend.

## 17. Custom Scenario Flow

When the user opens the Scenarios screen:

1. `scenarios.js` calls `list_scenario_bodies()` and `list_scenarios()`.
2. Python returns the body catalog and available scenarios.
3. The screen renders scenario cards and selectable body options.
4. The user selects planet ids and chooses whether to include the Sun.

When the user creates a custom scenario:

1. The frontend sends `{ name, bodyIds, includeSun }` to `create_custom_scenario()`.
2. Python normalizes and validates the ids.
3. Python creates a scenario id such as `custom-3`.
4. Python creates an in-memory scenario entry with a factory closure.
5. Python writes the recipe to `%APPDATA%\Solar Sim\custom_scenarios.json`.
6. Python immediately loads the new scenario and returns metadata plus snapshot.
7. The scenario screen dispatches `solar-sim:launch-scenario`.
8. The router opens the simulation screen.
9. The simulation screen asks the renderer to load the selected scenario.

When the user deletes a custom scenario, Python removes it from `_custom_scenarios`, rewrites the JSON file, and returns the updated scenario list. Built-in scenarios are not deletable.

## 18. Sandbox and Body Editing Flow

The sandbox controls allow the user to change selected-body values, but the backend remains authoritative.

There are two phases:

1. **Preview phase**: while dragging some controls, the frontend previews radius and distance changes visually. This affects rendered mesh size or displayed distance immediately, but it does not mutate Python physics.
2. **Commit phase**: when the value is committed, the frontend calls `update_body_parameters(body_id, updates)`.

Python accepts these update keys:

- `massKg`;
- `radiusM`;
- `distanceM`;
- `positionM`;
- `speedMS`.

Python validates values, clamps unsafe extremes, updates the body definition or state, and returns:

```json
{
  "ok": true,
  "scenario": {
    "id": "solar-system",
    "bodies": []
  },
  "snapshot": {
    "scenarioId": "solar-system",
    "elapsedS": 3600.0,
    "bodies": []
  }
}
```

The renderer applies the returned metadata and snapshot. If Python clamps a value, the frontend updates its fields to the accepted value and shows a short notification.

The body transform gizmo follows the same rule. Dragging is visual. Releasing the drag sends a real SI `positionM` vector to Python.

## 19. Diagnostics and Overlays

There are two diagnostics surfaces:

- the diagnostics drawer;
- the compact debug overlay.

The renderer emits render metrics through:

```js
solar-sim:renderer-metrics
```

Those metrics include FPS, frame time, pixel ratio, sphere detail, skybox quality, lighting quality, trail count, vector count, and backend step duration.

The renderer emits simulation metrics through:

```js
solar-sim:simulation-metrics
```

Those metrics include elapsed time, timestep, total energy, energy drift baseline, momentum, and barycenter.

The diagnostics drawer is always available on the simulation screen. The compact debug overlay appears only when enabled debug settings require it.

## 20. Screen and Object Lifecycle

The screen router dispatches `solar-sim:navigate` whenever the active screen changes.

The simulation screen responds by:

- starting the renderer when entering the simulation screen;
- stopping the renderer when leaving it;
- starting/stopping the orientation gizmo with the same lifecycle;
- preserving the active simulation only when returning from Settings to Simulation;
- resetting/reloading the scenario when starting from the main menu.

The renderer's `destroy()` method cleans up:

- event listeners;
- camera controller;
- body meshes;
- ring meshes;
- labels;
- orbit lines;
- trails;
- vector lines;
- transform gizmo;
- selection marker;
- barycenter marker;
- backdrop;
- material texture cache;
- WebGL renderer and canvas.

This is important because Three.js objects allocate GPU resources. Replacing a scenario should dispose old objects before creating new ones.

## 21. Typical Call Orders

### App Startup

1. `main.py` calls `launch_app()`.
2. PyWebView creates the native window and exposes `AppApi`.
3. `SimulationRuntime` loads custom scenario recipes and starts with the Solar System scenario.
4. `frontend/index.html` loads scripts.
5. `app.js` creates settings, i18n, router, screens, and runtime effects.
6. The welcome screen is active. The backend is ready, but the simulation does not start stepping yet.

### Start Simulation

1. User clicks Start Simulation.
2. Router switches to the simulation screen.
3. `simulation.js` receives `solar-sim:navigate`.
4. The renderer resets or loads the requested scenario.
5. Python returns scenario metadata and an initial snapshot.
6. The renderer caches metadata, stores the snapshot, and starts the frame loop.
7. Each frame renders the latest snapshot and may request new physics steps.

### One Running Frame

1. Browser calls `frame()` through `requestAnimationFrame`.
2. Renderer checks FPS limit.
3. If not paused and no backend step is in flight, renderer requests `step_simulation(playbackStepsPerFrame)`.
4. Renderer draws the latest known snapshot immediately.
5. Python eventually returns a new snapshot.
6. `setLastSnapshot()` stores it and notifies DOM listeners.
7. Next rendered frame uses the newer positions.

### Change Language

1. User changes the language setting.
2. Settings store dispatches `solar-sim:settings-changed`.
3. Runtime effects call `i18n.setLanguage(...)`.
4. Static DOM is updated through `data-i18n`.
5. Dynamic screens listen to `solar-sim:language-changed` and rebuild labels, body selector text, facts, scenario descriptions, and playback labels.
6. Three.js label sprites are redrawn with localized body names.

### Edit a Body

1. User selects a body.
2. UI panels read metadata and latest snapshot for that body.
3. User adjusts a sandbox value.
4. Renderer may preview visible radius or distance.
5. On commit, frontend calls `update_body_parameters(...)`.
6. Python validates and mutates the real simulation state.
7. Python returns updated metadata and snapshot.
8. Renderer and UI both refresh from the returned authoritative data.

## 22. Extension Guidelines

To add a new planet or body:

1. Add constants in `src/data/constants.py`.
2. Add the body specification in `src/simulation/scenario.py`.
3. Add texture paths and visual metadata through `BodyVisual`.
4. Add fact keys to the body definition if needed.
5. Add translations for the body name and facts in `frontend/js/i18n/translations.js`.
6. Avoid hardcoding the body in frontend screens.

To add a new setting:

1. Add it to `frontend/js/settings/settings-schema.js`.
2. Add translations for visible labels.
3. Apply behavior in `settings-effects.js`, a renderer listener, or a screen listener depending on ownership.
4. Keep physics-changing settings behind a backend API if they affect simulation state.

To add a new backend operation:

1. Implement it in `SimulationRuntime` or the appropriate backend service.
2. Expose it through `AppApi`.
3. Add a wrapper in `frontend/js/api/backend-api.js`.
4. Call it from a screen or renderer module.
5. Return JSON-serializable dictionaries with stable ids and clear `ok` status.

## 23. Core Design Summary

Solaris Engine is structured around one central idea: Python is the source of truth for the simulated universe, and the frontend is the source of truth for how that universe is displayed and controlled.

Python stores and advances real physical state in SI units. JavaScript stores interface state, camera state, and renderer state. The API between them is intentionally narrow and uses stable ids, scenario metadata, and dynamic snapshots.

The result is an application where rendering can evolve without rewriting physics, and physics can become more advanced without turning the frontend into a second simulation engine.
