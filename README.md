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
- `BodyVisual`: static renderer-facing visual metadata such as material type, colors, and texture paths.
- `CelestialBody`: static body definition such as name, mass, radius, color, parent, fixed-state flag, and visual metadata.
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

## Frontend

Frontend entrypoint:

- `frontend/index.html`

Main frontend areas:

- `frontend/js/app.js`: initializes settings, router, and screens.
- `frontend/js/ui/screen-router.js`: screen routing.
- `frontend/js/screens/welcome.js`: welcome screen behavior.
- `frontend/js/screens/settings.js`: settings UI.
- `frontend/js/screens/simulation.js`: simulation screen startup/stop behavior.
- `frontend/js/api/backend-api.js`: small JavaScript adapter around PyWebView API calls.
- `frontend/js/rendering/simulation-renderer.js`: Three.js simulation scene and body mesh updates.
- `frontend/js/rendering/materials.js`: material and texture creation.
- `frontend/js/rendering/space-backdrop.js`: Three.js starfield background.

CSS is under `frontend/css`.

The simulation screen uses Three.js loaded directly from a CDN in `frontend/index.html`.

## Backend API Shape

The PyWebView API is exposed through `AppApi`.

Host/window methods:

- `apply_window_settings(settings)`
- `quit_app()`

Simulation methods:

- `list_scenarios()`
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
    "parent": None,
    "visual": {...},
}
```

The renderer caches static metadata and uses dynamic snapshots only to update mesh positions.

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

## Rendering

`frontend/js/rendering/simulation-renderer.js` owns the Three.js simulation scene.

Current rendering behavior:

- Creates a Three.js scene, camera, WebGL renderer, point light, and ambient light.
- Adds a starfield background from `space-backdrop.js`.
- Creates one mesh per simulation body using cached scenario metadata.
- Updates mesh positions from dynamic snapshots.
- Recreates meshes when scenario metadata changes.

Display scaling is renderer-only:

- Position scale: `1 / 1_500_000_000`
- Radius scale: `1 / 25_000_000`
- Minimum rendered radius: `1.2`

Physics remains in SI units in Python.

## Settings

Settings are currently runtime-persistent in memory only.

Settings are defined in:

- `frontend/js/settings/settings-schema.js`

Settings behavior is applied by:

- `frontend/js/settings/settings-store.js`
- `frontend/js/settings/settings-effects.js`

Graphics and debug settings are renderer/UI owned. Physics settings shown in the UI must not directly mutate Python physics state unless an explicit backend API is added for that purpose.

## Development Notes

- The frontend is plain scripts loaded by `index.html`; script order matters.
- New renderer helper files should avoid leaking globals. Existing new renderer modules use `window.SolarSim.rendering` for public exports.
- Avoid placing simulation logic in `HostWindowApi`.
- Avoid sending static visual/material metadata on every simulation step.
- Avoid duplicating body identity or visual data in `SCENARIOS`.

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
