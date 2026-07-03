# Solar Sim

Solar Sim is a local desktop solar-system simulation prototype. Python hosts the application through PyWebView and owns the physics simulation. The frontend is plain HTML/CSS/JavaScript and owns rendering, camera behavior, UI, and visual-only runtime settings.

There is currently no frontend build step.

## Current Architecture

The app starts from `main.py`, which calls `launch_app()` in `src/app/launcher.py`.

`src/app/launcher.py`:
- Loads `frontend/index.html` into a PyWebView window.
- Creates a `1920x1080` window with minimum size `1280x720`.
- Exposes `AppApi` to JavaScript through PyWebView.

`src/app/api.py`:
- Provides the PyWebView-facing API surface.
- Delegates host-window behavior to `HostWindowApi`.
- Delegates simulation behavior to `SimulationRuntime`.

`src/app/bridge.py`:
- Contains `HostWindowApi`.
- Handles native window operations such as resolution/fullscreen changes and quitting the app.
- Should remain host-window focused, not simulation focused.

## Responsibility Boundaries

Keep responsibilities separated:

- Python owns physics state, timesteps, integrator execution, forces, scenario loading, and simulation snapshots.
- Frontend owns rendering, Three.js scene objects, camera, UI, and visual-only settings.
- Frontend must not directly mutate physics state.
- Static body/scenario metadata is loaded separately from dynamic simulation state.

## Python Simulation

Simulation types live in `src/simulation/body.py`:

- `BodyState`: dynamic position and velocity vectors.
- `BodyVisual`: static renderer-facing visual metadata such as material type, colors, texture paths, and optional ring definitions.
- `BodyRing` / `BodyRingBand`: static ring metadata in meters. The renderer uses this for visual rings only; it does not affect physics.
- `BodyOrbit`: static expected-orbit metadata for renderer guide lines, such as semi-major axis, eccentricity, inclination, and fixed orbit center.
- `CelestialBody`: static body definition such as name, mass, radius, color, parent, fixed-state flag, visual metadata, and optional body facts.
- `SimBody`: combines a `CelestialBody` definition with a mutable `BodyState`.

Physics lives in `src/simulation/physics.py`:

- `compute_gravitational_acceleration_on_body(...)`
- `compute_accelerations(...)`
- `velocity_verlet(...)`

The integrator uses list-aligned acceleration arrays because `SimBody` is mutable and should not be used as a dictionary key.

Scenario creation lives in `src/simulation/scenario.py`.

Currently implemented scenario:
- `create_sun_earth_system()`
- Sun and Earth are both `isfixed=False`.
- The Sun receives a small opposite Y velocity to approximately balance Earth's momentum.

Additional current scenario:
- `create_solar_system()`
- Includes the Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune.
- Planet positions and velocities are simplified initial conditions based on constants in `src/data/constants.py`, not full astronomical ephemerides.
- Planets start at distributed orbital phases so the initial view is not a single overlapping radial line.
- The Sun receives an initial velocity calculated from the summed planetary momentum so it is not artificially fixed.

Custom scenario support:
- `create_scenario_body_catalog()` exposes the reusable planet catalog for the frontend scenario builder.
- `create_custom_solar_system(planet_names, include_sun=True)` builds either a Sun plus the chosen planets, or a sunless selected-planet system.
- Custom planet choices are submitted as stable body ids from the frontend, then translated back to canonical Python planet names in `src/simulation/scenario.py`.
- When `include_sun` is true, the Sun is included as the central body and receives a momentum-balancing velocity based only on the selected planets.
- When `include_sun` is false, Python reuses the selected planet definitions/materials but removes Sun-parent and orbit-guide metadata. It does not inherit the planets' original Sun-orbit velocities. Instead, it creates planet-only initial conditions: one selected body is placed at rest at the origin, two selected bodies are initialized as a barycentric binary, and larger selections are arranged as a compact barycentric multi-body system with tangential velocities based on the selected masses. This avoids pretending the planets orbit a missing Sun and prevents the system from simply flying forward due to inherited Solar System motion.
- Custom scenario recipes are persisted as JSON under `%APPDATA%\Solar Sim\custom_scenarios.json`.
- Persisted recipes store only the custom scenario id, name, selected body ids, and whether the Sun is included. They do not store sandbox-edited masses, radii, positions, velocities, elapsed time, or live physics state.
- When the app starts, Python loads the saved recipes and recreates runtime scenario factories from those recipes, so every launch/reset starts from the clean default scenario state.

Runtime orchestration lives in `src/simulation/runtime.py`.

`SCENARIOS` is intentionally only a scenario registry:

```python
SCENARIOS = {
    "sun-earth": {
        "id": "sun-earth",
        "name": "Sun and Earth",
        "description": "...",
        "factory": create_sun_earth_system,
    },
}
```

Do not put per-body colors, names, materials, or textures in `SCENARIOS`. Those belong on the body definitions created by the scenario factory.

Custom scenarios are represented in memory by `SimulationRuntime` and persisted as recipes by `CustomScenarioStorage`. Each runtime custom scenario stores a generated id, display name, selected body ids, whether the Sun is included, and a factory closure that recreates a fresh body list when the scenario is loaded or reset. Only the recipe is written to disk; the factory is rebuilt when recipes are loaded.

## Frontend

Frontend entrypoint:

- `frontend/index.html`

Main frontend areas:

- `frontend/js/app.js`: initializes settings, router, and screens.
- `frontend/js/i18n/translations.js`: English and Portuguese translation dictionaries.
- `frontend/js/i18n/i18n.js`: translation service, DOM translation application, and language change events.
- `frontend/js/ui/screen-router.js`: screen routing.
- `frontend/js/screens/welcome.js`: welcome screen behavior.
- `frontend/js/screens/scenarios.js`: scenario list and custom scenario creation screen.
- `frontend/js/screens/settings.js`: settings UI.
- `frontend/js/screens/about.js`: static controls guide screen for simulation controls, keybinds, and camera modes.
- `frontend/js/screens/simulation.js`: simulation screen startup/stop behavior and DOM bindings for playback, selected-body inspection drawer, body facts, sandbox body tuning, quick settings, and time controls.
- `frontend/js/api/backend-api.js`: small JavaScript adapter around PyWebView API calls.
- `frontend/js/utils/display-format.js`: shared frontend formatting and translation helpers for body names, scenario names, units, durations, facts, and vectors.
- `frontend/js/rendering/simulation-renderer.js`: Three.js simulation scene and body mesh updates.
- `frontend/js/rendering/materials.js`: material and texture creation.
- `frontend/js/rendering/space-backdrop.js`: Three.js starfield background.
- `frontend/js/rendering/fly-camera.js`: simulation camera movement, RMB mouse look without browser Pointer Lock, and scroll zoom.
- `frontend/js/rendering/transform-gizmo.js`: renderer-owned Blender-style selected-body transform handles.

CSS is under `frontend/css`.

The simulation screen uses Three.js loaded directly from a CDN in `frontend/index.html`.

### Frontend Screen Lifecycles

Screen changes are routed through `frontend/js/ui/screen-router.js`, which dispatches the `solar-sim:navigate` event after changing the active screen.

Visual systems that run their own animation loop must follow the active screen lifecycle:

- The welcome black-hole/backdrop canvas in `frontend/js/screens/welcome.js` exposes `start()`, `stop()`, and `dispose()`. It starts only while the welcome screen is active, stops when navigating away, and disposes on page unload.
- The welcome animation has its own lightweight render profiles. It caps home-screen frame rate and canvas pixel ratio by skybox quality, caches the static star field into an offscreen canvas on resize, and keeps only a smaller twinkle/black-hole particle layer animated per frame.
- The simulation orientation gizmo in `frontend/js/screens/simulation.js` exposes the same start/stop lifecycle. It runs only while the simulation screen is active and ignores pointer input while inactive.
- The Three.js simulation renderer keeps its own run-token guarded animation loop in `frontend/js/rendering/simulation-renderer.js`; auxiliary screen widgets should not create independent always-on loops that survive navigation.

This matters for performance because hidden canvas or UI animation loops can keep using GPU/CPU time while the simulation renderer is also running.

## Backend API Shape

The PyWebView API is exposed through `AppApi`.

Host/window methods:

- `apply_window_settings(settings)`
- `quit_app()`

Simulation methods:

- `list_scenarios()`
- `list_scenario_bodies()`
- `create_custom_scenario(config)`
- `delete_custom_scenario(scenario_id)`
- `update_body_parameters(body_id, updates)`
- `reset_body(body_id)`
- `load_scenario(scenario_id="sun-earth")`
- `step_simulation(steps=1)`
- `get_simulation_snapshot()`
- `get_scenario_metadata()`

The frontend calls these through `frontend/js/api/backend-api.js`.

## Static Metadata vs Dynamic Snapshots

Static scenario metadata is loaded separately from dynamic simulation state.

`load_scenario(...)` returns:

- `ok`
- `scenarioId`
- `scenario`: static scenario/body metadata
- `snapshot`: initial dynamic state

`step_simulation(...)` returns:

- `ok`
- `snapshot`

Dynamic snapshot bodies intentionally contain only runtime state:

```python
{
    "id": "earth",
    "positionM": [...],
    "velocityMS": [...],
}
```

Static body metadata includes identity, physical constants needed for rendering scale, and visual metadata:

```python
{
    "id": "earth",
    "name": "Earth",
    "massKg": ...,
    "radiusM": ...,
    "color": "#4f85ff",
    "isFixed": False,
    "parent": "Sun",
    "parentId": "sun",
    "facts": ["facts.earth.scaleReference", ...],
    "orbit": {
        "semiMajorAxisM": ...,
        "eccentricity": 0.0,
        "inclinationRad": 0.0,
        "longitudeOfAscendingNodeRad": 0.0,
        "argumentOfPeriapsisRad": 0.0,
        "centerM": [0.0, 0.0, 0.0],
    },
    "visual": {...},
}
```

Scenario metadata also includes:

```python
{
    "id": "custom-1",
    "name": "Inner planets",
    "description": "Custom system with Sun, Mercury, Venus, Earth, Mars.",
    "custom": True,
    "includeSun": True,
    "selectedBodyIds": ["mercury", "venus", "earth", "mars"],
}
```

The renderer caches static metadata and uses dynamic snapshots only to update mesh positions. Body facts are translation keys when they are app-authored facts; user/authored scenarios may still provide plain strings as a fallback.

`update_body_parameters(body_id, updates)` is the backend-owned sandbox mutation path for selected-body tuning. The frontend may request new numeric values for `massKg`, `radiusM`, `distanceM`, `speedMS`, and `positionM`, but it must do so through this API. Python validates the numbers, updates the `SimBody` definition/state, and returns fresh scenario metadata plus a fresh dynamic snapshot. The frontend then refreshes the renderer from that returned data instead of directly changing physics state.

Sandbox scalar values are bounded against the current scenario's clean initial state before Python mutates the live body. Current limits match the UI ranges: mass and radius must stay within `0.1x` to `10x`, while distance and speed must stay within `0x` to `4x`. This prevents typed raw values such as an unrealistic `1e40 kg` Sun from creating timestep-scale numerical blowups.

`reset_body(body_id)` restores one live body from a freshly created copy of the current scenario. It resets that body's definition, position vector, and velocity vector. It does not rewind elapsed time or undo any gravitational effects already propagated to other bodies. Use the system reset path, implemented by reloading the current scenario through `load_scenario(...)`, for a physically clean full reset.

## Visuals and Textures

Per-body visual data is defined on `CelestialBody.visual` using `BodyVisual`.

Example:

```python
visual=BodyVisual(
    kind="standard",
    roughness=0.78,
    textures={
        "map": "./assets/textures/earth/day.jpg",
        "normalMap": "./assets/textures/earth/normal.jpg",
        "roughnessMap": "./assets/textures/earth/roughness.jpg",
        "emissiveMap": "./assets/textures/earth/night.jpg",
    },
)
```

Ringed bodies can define rings on the same visual metadata:

```python
visual=BodyVisual(
    kind="standard",
    textures={"map": "./assets/textures/planets/saturn.jpg"},
    rings=(
        BodyRing(
            inner_radius_m=66_900_000.0,
            outer_radius_m=140_220_000.0,
            tilt_rad=np.deg2rad(26.73),
            bands=(...),
        ),
    ),
)
```

Supported texture keys are defined in `frontend/js/rendering/materials.js`:

- `map`
- `normalMap`
- `roughnessMap`
- `metalnessMap`
- `emissiveMap`
- `bumpMap`
- `alphaMap`
- `displacementMap`
- `aoMap`

Color textures such as `map` and `emissiveMap` are treated as sRGB by the renderer. Data maps such as `normalMap` and `roughnessMap` are left linear.

Texture paths may point to local frontend assets or remote URLs, subject to browser/PyWebView loading and CORS behavior.

Current planet texture assets live in:

- `frontend/assets/textures/planets`

The current `create_solar_system()` and `create_sun_earth_system()` factories assign local texture maps through `BodyVisual.textures`. Keep texture selection on the body definitions, not in `SCENARIOS` and not in renderer conditionals.

Renderer material behavior:

- If a body has a `map` texture, the material color defaults to white so the texture is not tinted by the fallback body color.
- If a body has no `map`, the renderer uses the body color or `visual.baseColor`.
- The sphere rendering setting can switch runtime materials between textured rendering, lit color-only rendering, and basic color rendering. This is renderer-owned and does not change Python body metadata.
- `aoMap` is supported with duplicated sphere UVs through `uv2`.
- Texture maps use repeated horizontal wrapping and linear mipmap filtering for cleaner sphere projection.
- Texture objects are cached by texture type and URL while a scenario is active.
- The material factory exposes `dispose()` so cached textures can be released when scenario metadata is replaced or the renderer is destroyed.

## Rendering

`frontend/js/rendering/simulation-renderer.js` owns the Three.js simulation scene.

Current rendering behavior:

- Creates a Three.js scene, camera, WebGL renderer, point light, and ambient light.
- Adds a layered space backdrop from `space-backdrop.js`, including white pin stars, subtle glow stars, a faint galactic dust band, restrained nebula haze, distant galaxy smudges, star clusters, and soft dust wisps.
- Creates one mesh per simulation body using cached scenario metadata.
- Creates textured ring meshes from `visual.rings` metadata when a body defines rings. Saturn currently uses a renderer-generated procedural ring texture from D/C/B/A/F band metadata, with the Cassini gap represented as transparent texture space. Ring texture scrolling and subtle in-plane spin are visual-only animation.
- Updates mesh positions from dynamic snapshots.
- Updates the primary point light from the simulated Sun position, or from the first emissive body if no `sun` body exists.
- Creates renderer-owned label sprites and a renderer-owned selected-body marker.
- Creates renderer-owned orbit lines with `THREE.LineLoop` when the orbit toggle is enabled.
- Builds orbit lines from static `BodyOrbit` metadata, not from live planet-to-parent snapshot distances.
- Creates renderer-owned body trails only when the `debug.uiToggles.showTrails` setting is enabled. The `simulation.trailSystem` setting controls trail retention length, not whether trails are visible.
- Creates a renderer-owned selected-body transform gizmo through `frontend/js/rendering/transform-gizmo.js`. The gizmo displays axis arrows, two-axis plane squares, and a center free-drag sphere. Dragging previews the selected body position visually in Three.js; releasing commits an absolute `positionM` vector through the backend mutation API.
- Recreates meshes when scenario metadata changes.
- Uses a run-token guarded animation loop so stale async backend calls cannot restart rendering after the simulation screen has stopped.
- Keeps rendering every animation frame while backend step requests run asynchronously, so camera movement and UI rendering stay responsive when paused or waiting on Python.
- Emits renderer and simulation metrics at throttled intervals instead of every rendered frame, so diagnostics UI updates do not compete heavily with scene rendering.
- Exposes a small screen-facing API for selection, labels, camera focus, tracking, playback state, speed, stepping, and scenario reset.
- Exposes `destroy()` for renderer teardown.

Display scaling is renderer-only:

- Orbital positions use an origin-preserving display scale. Distances up to `1 AU` are linear, so small barycentric Sun movement stays visually small instead of being pushed away from the origin.
- Distances beyond `1 AU` are square-root compressed so the outer planets remain usable on screen.
- Rendered radii are intentionally compressed for readability.
- The Sun renders at a fixed visual radius of `36` scene units.
- Planet radii use `4.2 + sqrt(radiusM / EarthRadiusM) * 4.2`, capped at `22` scene units.

Physics remains in SI units in Python.

The renderer centralizes physics-to-scene conversion through its display scale helper. Visual features such as trails, labels, vectors, orbit lines, picking, and camera focus should use the same conversion path instead of repeating the axis swap or square-root distance compression manually.

The transform gizmo uses the inverse of the same display scale. Scene-space handle movement is converted back into an SI position vector before the backend commit, preserving the current nonlinear AU compression while keeping Python as the owner of physics state.

Expected orbit guide lines are static visual references. They are generated when scenario metadata is applied, using `orbit.semiMajorAxisM`, `orbit.eccentricity`, orbital angles, and `orbit.centerM`. They should not be recalculated from the current snapshot each frame.

### Three.js Object Ownership

The renderer owns all Three.js objects it creates:

- body meshes and their geometries/materials;
- the WebGL renderer and canvas;
- the starfield backdrop;
- the primary point light and fill light;
- the fly camera controller;
- body label sprites and the selected-body marker;
- selected-body transform gizmo meshes;
- orbit line objects.

When scenario metadata changes, existing body meshes, labels, and orbit lines are removed and disposed before new meshes are created. The material texture cache is also cleared at that boundary. When the renderer is destroyed, it stops the animation loop, removes event listeners, disposes body meshes, labels, orbit lines, the selection marker, the backdrop, cached textures, the WebGL renderer, and removes the canvas.

### Simulation Screen Controls

The simulation screen has a frontend-owned control layer in `frontend/js/screens/simulation.js`.

Current controls:

- Entering the simulation screen from the welcome/menu flow reloads the current scenario through the backend, so elapsed simulation time starts from zero instead of resuming from a previous visit. Returning from Settings that were opened inside the simulation resumes the existing scene.
- Body selector: selects a body for inspection and visual highlighting.
- Time readout: displays elapsed simulation days and an equivalent year conversion. The renderer smooths only the displayed readout between backend snapshots; Python still owns the actual elapsed simulation time.
- Body stats: displays static mass/radius metadata and dynamic distance/velocity from the latest backend snapshot.
- Inspector drawer: left-side collapsible drawer for selected-body stats, quick settings, body facts, and sandbox controls.
- Facts: opened from the inspector lightbulb button. It displays backend-provided body facts plus derived runtime facts such as parent body, integration status, texture usage, and timestep.
- Sandbox controls: opened from the inspector sliders button. It provides persistent multiplier sliders and raw SI value inputs for selected-body mass, radius, current distance from origin, and current speed. While dragging, radius and distance use renderer-only preview so the stat cards and visible mesh update immediately without mutating Python physics state. Slider release calls backend `update_body_parameters(...)`, custom number fields commit explicit SI values, Reset body calls backend `reset_body(...)`, and Reset system reloads the current scenario through `load_scenario(...)`. The frontend only renders returned metadata/snapshots as authoritative state.
- Move body: toggles the renderer-owned transform gizmo for the selected body. Axis arrows constrain movement to one physical axis, square handles constrain movement to two-axis planes, and the center sphere free-drags in the camera-facing plane. The drag preview is visual-only; releasing the mouse sends `positionM` to Python through `update_body_parameters(...)`.
- Focus: moves the camera near the selected body.
- Labels: toggles renderer-owned label sprites and persists that toggle through the in-memory settings store.
- Orbits: toggles renderer-owned circular orbit guide lines around each body's parent and persists that toggle through the in-memory settings store.
- Track: keeps the camera looking at the selected body.
- Pause/Resume: stops or resumes automatic backend `step_simulation(...)` requests.
- Step: while paused, requests one backend step.
- Reset: reloads the current scenario through `load_scenario(...)`.
- Speed buttons: set how many backend integration steps are requested per rendered frame (`1`, `4`, `16`, or `64`).
- Camera dropdown: exposes quick camera movement speed and mouse sensitivity controls. These write to the same runtime `camera` settings store used by the full Settings screen.
- Orientation gizmo: shows the current camera orientation under the time readout. The screen projects world axes into a small Blender-style overlay instead of rotating DOM labels directly. Axis endpoint buttons snap to orthographic front/back/right/left/top/bottom views. Dragging the gizmo or starting fly-camera movement returns to perspective camera behavior.
- Diagnostics drawer: bottom-right collapsible drawer that is always available in the simulation screen. It shows the full diagnostics/settings snapshot at once when expanded, including FPS, frame time, renderer quality, timestep, trail counts, vector counts, energy, relative energy drift, momentum, and barycenter distance. It is independent from debug overlay toggles.
- Debug overlay: compact simulation overlay driven by debug settings. Enabling FPS, frame-time graph, step-time, energy, momentum, body trails, vectors, or barycenter marker shows the corresponding overlay row or graph. The overlay has a lock button; when unlocked, it can be dragged by its header.
- `Esc`: opens the Settings screen from inside the simulation. When Settings was opened from simulation, the Settings back button returns to the existing simulation session instead of resetting through the welcome screen.

The speed buttons do not change Python's fixed timestep or integrator. They only change the `steps` argument sent to the backend step API. Python still owns the timestep and advances physics with `SimulationRuntime.step(...)`.

### Scenario Screen

The main menu `Scenarios` button opens `frontend/js/screens/scenarios.js`.

Current behavior:

- Lists runnable scenarios from `list_scenarios()`, including built-in scenarios and runtime-created custom scenarios.
- Loads the planet catalog from `list_scenario_bodies()` instead of hardcoding planet choices in JavaScript.
- Lets the user choose a subset of planets and submit a custom scenario name.
- Lets the user choose whether the custom system includes the Sun as the central body.
- Calls `create_custom_scenario({ name, bodyIds, includeSun })`; Python validates the stable body ids, creates and persists a scenario recipe, builds an in-memory scenario factory, loads that scenario, and returns the initial snapshot/metadata.
- Lets the user delete persisted custom scenarios. Built-in scenarios are not deletable.
- Keeps the available scenario list inside its own scrollable panel once enough scenarios exist, so the whole scenarios page does not become the primary scroll area.
- Dispatches `solar-sim:launch-scenario` with the requested scenario id before routing to the simulation screen.
- The simulation screen consumes that event and calls `renderer.loadScenario(scenarioId)`, so the existing renderer lifecycle handles metadata replacement, mesh disposal/recreation, snapshot loading, and playback restart.

The scenario screen does not construct body definitions, positions, velocities, masses, radii, textures, rings, facts, or orbit metadata. Those remain in Python scenario factories.

### About Screen

The main menu `About` button opens `frontend/js/screens/about.js`.

Current behavior:

- Presents a production-facing controls guide for the simulation viewport.
- Documents playback controls, speed buttons, reset behavior, selected-body tools, visual toggles, WASD navigation, Blender-style navigation, orientation gizmo behavior, diagnostics, and the `Esc` Settings flow.
- Uses static HTML with `data-i18n` keys from `frontend/js/i18n/translations.js`; visible About copy should not be hardcoded in JavaScript.
- Keeps control descriptions written from the user's point of view. Avoid implementation terms such as backend APIs, metadata, render frames, or integration steps in visible About text.
- Reuses the shared page background/header styling from the Settings screen and keeps About-specific layout in `frontend/css/components/about.css`. About cards, keycaps, and mode tiles should stay on flat Settings-style dark surfaces instead of decorative gradients.
- Does not start animation loops, load scenarios, call the backend, or mutate renderer/physics state.

### Camera Controls

The simulation viewport now has a frontend-owned fly camera.

Controls:

- Hold the right mouse button on the simulation canvas and move the mouse to look around. The cursor is hidden while RMB is held without using browser Pointer Lock, avoiding the browser's pointer-lock escape hint.
- Scroll the mouse wheel to move forward/back along the current view direction.
- `W` / `S`: move forward/backward.
- `A` / `D`: strafe left/right.
- `Space` or `E`: move up.
- `Ctrl` or `Q`: move down.
- Hold `Shift` to move faster.
- Drag the orientation gizmo to orbit the camera around the current view target. Orbit dragging switches back to perspective projection.

The camera is visual-only. It does not mutate Python physics state, body positions, velocities, forces, or timesteps. Camera movement speed, mouse sensitivity, and min/max zoom distance are renderer-owned settings under the `camera` category in `frontend/js/settings/settings-schema.js`.

## Settings

Settings are currently runtime-persistent in memory only.

Settings are defined in:

- `frontend/js/settings/settings-schema.js`

Settings behavior is applied by:

- `frontend/js/settings/settings-store.js`
- `frontend/js/settings/settings-effects.js`

Graphics and debug settings are renderer/UI owned. Physics settings shown in the UI must not directly mutate Python physics state unless an explicit backend API is added for that purpose.

Currently implemented runtime settings:

- Interface language switches English/Portuguese text through the frontend i18n layer.
- Window resolution and display mode are sent through the host-window API where PyWebView supports them.
- Resolution presets include `1280x720`, `1920x1080`, and `2560x1440`.
- FPS limit throttles the renderer frame loop.
- Skybox detail controls how much Three.js backdrop content is created.
- Skybox detail also controls the welcome-screen animation profile. The welcome screen is intentionally capped separately from the simulation renderer: low runs up to `30 FPS`, medium up to `45 FPS`, and full up to `60 FPS`, with reduced canvas pixel-ratio caps to keep the home screen usable on weaker iGPUs.
- Sphere rendering controls planet material mode, sphere geometry detail, and renderer pixel ratio.
- Lighting controls the simulation scene's primary point light, ambient fill, and rim light intensities.
- Body trails are off by default and can be enabled through the debug UI toggles. The simulation trail system setting controls only the renderer-owned retention length.
- Camera speed, mouse sensitivity, and min/max zoom distance affect the fly-camera controller.
- Labels, orbit lines, velocity vectors, acceleration vectors, and the barycenter marker toggle renderer-owned Three.js objects.
- The diagnostics drawer is always available on the simulation screen and shows all diagnostics rows/graphs when expanded.
- Energy diagnostics display total energy plus relative energy drift, computed as `(E_current - E_initial) / abs(E_initial)`. This is the preferred graph for checking whether the integrator is conserving energy.
- Performance, energy, momentum, trail, vector, and barycenter debug toggles also drive the compact debug overlay.
- Diagnostics values are written to the DOM only when their displayed value changes, and graph canvases are skipped while hidden or collapsed.

Python snapshots now include read-only diagnostics for acceleration, kinetic/potential/total energy, total momentum, and barycenter. The frontend only displays this data; it does not compute or mutate physics forces.

## Language Support

The app supports English and Portuguese through a small frontend i18n layer. There is no build step and no external translation package.

- Translation dictionaries live in `frontend/js/i18n/translations.js`.
- The runtime translation service lives in `frontend/js/i18n/i18n.js`.
- Static HTML uses `data-i18n`, `data-i18n-aria-label`, and `data-i18n-title`.
- Dynamic UI text, such as playback buttons, time readouts, body names, and body facts, calls the i18n service from the relevant screen or renderer module.
- Shared dynamic formatting and translation helpers live in `frontend/js/utils/display-format.js`.
- The language setting is defined in the `interface` category in `frontend/js/settings/settings-schema.js`.
- Applying the interface setting dispatches `solar-sim:language-changed`; screens that render dynamic DOM should listen for that event and refresh their text.
- Body labels in the Three.js scene are translated in the frontend from stable body ids, using keys such as `bodies.saturn.name`. Do not add localized planet names to Python scenario definitions; Python should expose canonical ids/metadata and the frontend chooses display text.

Do not hardcode new visible UI text directly in renderer or screen logic. Add a translation key and use the i18n service. If Python-authored scenario facts are intended to be translated by the app, store fact keys such as `facts.earth.oneAu` in the body definition. If a future custom scenario uses plain fact strings, the frontend displays them as provided.

## Development Notes

- Read this `README.md` before making project changes. Update it after fixes that change architecture, runtime behavior, controls, settings, or debugging expectations.
- The frontend is plain scripts loaded by `index.html`; script order matters.
- New renderer helper files should avoid leaking globals. Existing new renderer modules use `window.SolarSim.rendering` for public exports.
- Avoid placing simulation logic in `HostWindowApi`.
- Avoid sending static visual/material metadata on every simulation step.
- Avoid duplicating body identity or visual data in `SCENARIOS`.
- Avoid hardcoding planet catalogs in frontend screens. Use `list_scenario_bodies()` and stable body ids.
- Keep camera behavior in frontend rendering code. Camera movement must not request or mutate backend physics state.
- New Three.js object systems should provide a disposal path before they are attached to renderer lifecycle.
- New screen-level animations should expose explicit start/stop lifecycle methods and should be tied to `solar-sim:navigate` instead of running for the lifetime of the page.
- New visual systems should use the renderer's scene-position conversion helper rather than repeating meter-to-scene scaling and axis conversion.
- Interactive body-position tools should follow the transform-gizmo pattern: preview in the renderer while dragging, then commit through the backend with validated SI values.
- Orbit guide lines should use static orbit metadata from Python. Do not derive guide-line radius or shape from changing runtime snapshots.
- Keep playback controls separate from graphics quality. Skybox, sphere, and lighting settings are visual-only; simulation speed belongs to the simulation control bar and should not be hidden inside graphics presets.
- Avoid generic top-level helper names in frontend scripts. The app uses classic script tags, so shared names can collide across files.
- Keep translatable UI copy in `frontend/js/i18n/translations.js`; body/scenario factories may choose fact keys, but they should not duplicate translated prose.
- User-facing descriptors should explain what the user can see or do, not how the code is implemented. Reserve implementation terms for README/developer documentation and diagnostics where the technical label is intentional.


## Main Source Files

- `main.py`: app entrypoint.
- `src/app/launcher.py`: PyWebView launch.
- `src/app/api.py`: JavaScript-facing API aggregator.
- `src/app/bridge.py`: host-window API.
- `src/simulation/body.py`: simulation data types.
- `src/simulation/physics.py`: gravity, diagnostics, Velocity Verlet.
- `src/simulation/scenario.py`: built-in and custom scenario body factories.
- `src/simulation/runtime.py`: simulation runtime, stepping, snapshots, mutations, scenario registry.
- `src/data/constants.py`: physical constants and configured body constants.
- `frontend/index.html`: static frontend shell.
- `frontend/js/app.js`: frontend initialization.
- `frontend/js/api/backend-api.js`: JavaScript backend API wrapper.
- `frontend/js/screens/scenarios.js`: scenario builder/list.
- `frontend/js/screens/settings.js`: settings screen.
- `frontend/js/screens/about.js`: controls guide screen.
- `frontend/js/screens/simulation.js`: simulation screen UI bindings.
- `frontend/js/settings/settings-schema.js`: runtime settings schema.
- `frontend/js/settings/settings-store.js`: in-memory settings store.
- `frontend/js/settings/settings-effects.js`: settings effects and diagnostics overlay.
- `frontend/js/i18n/translations.js`: English/Portuguese text.
- `frontend/js/rendering/simulation-renderer.js`: Three.js simulation renderer.
- `frontend/js/rendering/materials.js`: materials and texture handling.
- `frontend/js/rendering/space-backdrop.js`: starfield/space backdrop.
- `frontend/js/rendering/fly-camera.js`: WASD camera mode.
- `frontend/js/rendering/viewport-camera.js`: camera mode controller and Blender-style orbit mode.
- `frontend/js/rendering/transform-gizmo.js`: selected-body move gizmo.
- `frontend/css/components/about.css`: About screen layout and control-reference styling.

## JavaScript Checks

A local portable Node.js install can be kept under `.tools/node` for syntax checks without requiring a system-wide Node installation. The current workspace uses Node `v24.16.0`.

Run frontend syntax checks from the project root:

```powershell
$node = ".\.tools\node\node.exe"
$files = @(
  "frontend\js\api\backend-api.js",
  "frontend\js\i18n\translations.js",
  "frontend\js\i18n\i18n.js",
  "frontend\js\utils\display-format.js",
  "frontend\js\settings\settings-schema.js",
  "frontend\js\settings\settings-store.js",
  "frontend\js\settings\settings-effects.js",
  "frontend\js\ui\screen-router.js",
  "frontend\js\rendering\materials.js",
  "frontend\js\rendering\space-backdrop.js",
  "frontend\js\rendering\fly-camera.js",
  "frontend\js\rendering\transform-gizmo.js",
  "frontend\js\rendering\simulation-renderer.js",
  "frontend\js\screens\welcome.js",
  "frontend\js\screens\scenarios.js",
  "frontend\js\screens\settings.js",
  "frontend\js\screens\about.js",
  "frontend\js\screens\simulation.js",
  "frontend\js\app.js"
)
foreach ($file in $files) {
  & $node --check $file
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

## Install Dependencies

Install NumPy:

```powershell
pip install numpy
```

Install PyWebView:

```powershell
pip install pywebview
```

Or install both together:

```powershell
pip install numpy pywebview
```
