# Solar Sim Features and Physics Concepts

This file lists what a user can currently do and see in Solar Sim, plus the physics and math concepts represented by the simulation.

## User-Facing Features

### Home Screen

- View the Solar Sim welcome screen.
- Start the current/default simulation.
- Open the scenario selection and custom scenario screen.
- Open Settings.
- Open About.
- Quit the app.

### Scenario Screen

- View the available runnable scenarios.
- Start the built-in Sun and Earth scenario.
- Start the built-in Solar System scenario.
- View runtime-created custom scenarios during the current session.
- Create a custom scenario.
- Select individual planets for a custom scenario:
  - Mercury;
  - Venus;
  - Earth;
  - Mars;
  - Jupiter;
  - Saturn;
  - Uranus;
  - Neptune.
- Select all available planets.
- Clear the current planet selection.
- Choose whether the custom scenario includes the Sun.
- Create a sunless custom scenario.
- Enter a custom scenario name.
- See how many planets are currently selected.
- See the central body choice for the custom scenario.
- See basic body information while choosing planets, such as mass, radius, or orbital distance depending on scenario mode.
- Launch the newly created custom scenario directly into the simulation screen.

### Simulation View

- View a 3D solar-system scene.
- See textured planets.
- See the Sun as an emissive/light-source body.
- See Saturn with rings.
- See a layered space backdrop with stars, glowing stars, dust, haze, clusters, and distant galaxy-like shapes.
- See planets move over simulated time.
- See the Sun move when physics gives it motion.
- See the current elapsed simulation time in days.
- See the current elapsed simulation time converted to years.
- Select a body from a dropdown.
- See the selected body highlighted.
- See translated body labels when labels are enabled.
- See static orbit guide lines when orbit lines are enabled.
- See optional body trails when trails are enabled in debug settings.
- See optional velocity vector helpers.
- See optional acceleration vector helpers.
- See an optional barycenter marker.
- Track the selected body with the camera.
- Toggle selected-body tracking with `F`.

### Simulation Playback Controls

- Pause the simulation.
- Resume the simulation.
- Advance the simulation by one step while paused.
- Reset the whole current scenario.
- Change simulation playback rate with buttons:
  - `1x`;
  - `4x`;
  - `16x`;
  - `64x`.

The speed buttons change how many fixed physics steps are requested per rendered frame. They do not change the one-hour physics timestep.

### Body Inspector

- Open and collapse the body inspector drawer.
- Select which body is being inspected.
- See selected-body mass.
- See selected-body radius.
- See selected-body distance from the simulation origin.
- See selected-body speed magnitude.
- Toggle body labels.
- Toggle orbit guide lines.
- Toggle selected-body tracking.
- Open the facts panel with the lightbulb icon.
- Open the sandbox/edit panel with the sliders icon.
- Toggle the move-body transform gizmo.

### Body Facts Panel

- View facts for the selected body.
- View body facts in the active language when translations exist.
- View selected-body context such as parent/relationship information where available.

### Sandbox Body Controls

- Change the selected body's mass.
- Change the selected body's radius.
- Change the selected body's distance from the origin.
- Change the selected body's speed magnitude.
- Use multiplier sliders for quick changes.
- Type exact numeric values into raw value fields.
- See body radius changes reflected visually while dragging.
- See distance changes reflected visually while dragging.
- Reset only the selected body.
- Reset the whole system.

### Move-Body Transform Gizmo

- Show or hide the selected-body transform gizmo.
- Drag the selected body along one axis with arrow handles.
- Drag the selected body along two-axis planes with square handles.
- Free-drag the selected body with the center handle.
- Preview movement while dragging.
- Commit the new body position when the drag is released.

### Camera Controls

- Choose between `WASD` camera mode and `Blender` camera mode in Settings.
- Adjust camera movement speed.
- Adjust mouse sensitivity.
- Adjust minimum zoom distance.
- Adjust maximum zoom distance.
- Use the quick camera dropdown in the simulation screen to adjust:
  - camera speed;
  - mouse sensitivity.
- Use the orientation gizmo under the time counter.
- Click orientation gizmo axis endpoints to snap to orthographic views:
  - front;
  - back;
  - right;
  - left;
  - top;
  - bottom.
- Return to normal perspective movement after leaving orthographic view through normal camera movement.

WASD mode:

- Hold right mouse button and move the mouse to look around.
- Hide the cursor while right mouse camera-look is active.
- Scroll the mouse wheel to move forward or backward.
- Press `W` / `S` to move forward/back.
- Press `A` / `D` to move left/right.
- Press `Space` or `E` to move up.
- Press `Ctrl` or `Q` to move down.
- Hold `Shift` to move faster.

Blender mode:

- Middle mouse drag to orbit around the current view target.
- Shift + middle mouse drag to pan the view.
- Mouse wheel to zoom toward or away from the target.
- Mouse wheel zoom also works in orthographic view by changing camera zoom.

### Diagnostics Drawer

- Open and collapse the bottom-right diagnostics drawer.
- View renderer and simulation diagnostic values.
- View FPS.
- View frame time.
- View renderer quality information.
- View current timestep.
- View body trail point count.
- View vector helper count.
- View total system energy.
- View relative energy change.
- View total momentum magnitude.
- View barycenter distance from origin.
- View camera speed.
- View camera sensitivity.
- View an energy graph when energy diagnostics are enabled.

### Debug Overlay

- Enable a compact debug overlay from Settings.
- Show FPS in the overlay.
- Show frame time in the overlay.
- Show a frame-time graph.
- Show simulation step timing.
- Show energy values.
- Show the energy-change graph.
- Show momentum.
- Show trail counts.
- Show vector counts.
- Show barycenter information.
- Lock the overlay in place.
- Unlock the overlay.
- Drag the overlay around the simulation UI when unlocked.

### Settings Screen

- Open Settings from the main menu.
- Open Settings from inside the simulation with `Esc`.
- Return from Settings back to the simulation when Settings was opened from the simulation.
- Change settings at runtime.
- Use settings categories:
  - Interface;
  - Graphics;
  - Simulation;
  - Camera;
  - Debug.

### Interface Settings

- Switch application language:
  - English;
  - Portuguese.

### Graphics Settings

- Choose resolution:
  - `1280x720`;
  - `1920x1080`;
  - `2560x1440`.
- Choose display mode:
  - Windowed;
  - Borderless fullscreen;
  - Fullscreen.
- Choose FPS limit:
  - 30;
  - 60;
  - 120;
  - Unlimited.
- Choose skybox detail:
  - Low;
  - Medium;
  - Full.
- Choose sphere rendering:
  - No texture;
  - Basic color;
  - Textured.
- Choose lighting quality:
  - Low;
  - Medium;
  - High.

### Simulation Settings

- View the selected physics integrator option:
  - Velocity Verlet.
- Choose visual trail retention:
  - Short;
  - Medium;
  - Long;
  - Infinite.

### Camera Settings

- Choose navigation mode:
  - WASD;
  - Blender.
- Adjust movement speed.
- Adjust mouse sensitivity.
- Adjust minimum zoom distance.
- Adjust maximum zoom distance.

### Debug Settings

- Toggle labels.
- Toggle orbit lines.
- Toggle body trails.
- Toggle velocity vectors.
- Toggle acceleration vectors.
- Toggle barycenter marker.
- Toggle FPS counter.
- Toggle frame-time graph.
- Toggle simulation step time.
- Toggle energy stability display.
- Toggle momentum display.

### Language-Visible Content

- The UI can appear in English.
- The UI can appear in Portuguese.
- Planet names in labels and selectors follow the selected language.
- Body facts follow the selected language where translated.

### Visual Content Currently Present

- Sun.
- Mercury.
- Venus.
- Earth.
- Mars.
- Jupiter.
- Saturn.
- Uranus.
- Neptune.
- Planet textures.
- Saturn rings.
- Space backdrop.
- Body labels.
- Orbit guide lines.
- Selection marker.
- Transform gizmo.
- Optional trails.
- Optional velocity vectors.
- Optional acceleration vectors.
- Optional barycenter marker.

## Physics and Math Concepts

### SI Units

Concept group: classical mechanics units.

Python uses:

```text
position:      r = [x, y, z] in meters
velocity:      v = [vx, vy, vz] in meters/second
acceleration:  a = [ax, ay, az] in meters/second^2
mass:          m in kilograms
time:          t in seconds
energy:        joules
momentum:      kg*m/s
```

The renderer converts meters into scene units only for display.

### Newtonian Gravity

Concept group: Newtonian gravitation, point-mass N-body dynamics.

For a target body `i`, acceleration caused by all other bodies is:

```text
a_i = sum(j != i) G * m_j * (r_j - r_i) / |r_j - r_i|^3
```

Where:

- `a_i` is acceleration of body `i`;
- `G` is the gravitational constant;
- `m_j` is the source body's mass;
- `r_i` is target position;
- `r_j` is source position;
- `|r_j - r_i|` is distance between bodies.

Important implementation detail:

- The acceleration formula divides by `distance^3` because `(r_j - r_i)` is already a direction vector with length `distance`.
- Bodies with zero separation are skipped to avoid division by zero.
- `isfixed` bodies are still gravity sources, but their own position/velocity integration is skipped.

### N-Body Simulation

Concept group: multi-body gravitational interaction.

Every non-self pair contributes to each body's acceleration. This means bodies are not just orbiting a hardcoded Sun; every body can gravitationally affect every other body.

The simulation calculates acceleration for each body from the current positions and masses of all other bodies.

### Fixed Timestep

Concept group: numerical simulation time discretization.

The backend timestep is:

```text
dt = DAY_S / 24
dt = 86400 / 24
dt = 3600 seconds
```

So one physics step equals one simulated hour.

The frontend speed buttons request more or fewer backend steps per rendered frame, but they do not change `dt`.

### Velocity Verlet Integration

Concept group: symplectic numerical integration for mechanics.

The integrator updates positions using old acceleration:

```text
r(t + dt) = r(t) + v(t) * dt + 0.5 * a(t) * dt^2
```

Then it recomputes acceleration from the new positions:

```text
a(t + dt) = gravity_acceleration_from_new_positions
```

Then it updates velocity using the average of old and new acceleration:

```text
v(t + dt) = v(t) + 0.5 * (a(t) + a(t + dt)) * dt
```

Velocity Verlet is used because it generally conserves orbital energy better than simple Euler integration for gravitational systems.

### Initial Circular-Orbit Approximation

Concept group: orbital initial conditions.

For planets with a configured orbital distance and phase angle:

```text
r = [R * cos(theta), R * sin(theta), 0]
```

The initial velocity is tangent to the radius vector:

```text
v = [-speed * sin(theta), speed * cos(theta), 0]
```

Where:

- `R` is the configured distance from the Sun;
- `theta` is the configured starting phase angle;
- `speed` is the configured orbital speed.

This gives each planet an approximate circular orbit start.

Current phases are stable app-defined angles, not live ephemeris data.

### Momentum

Concept group: linear momentum and conservation.

Single-body momentum:

```text
p_i = m_i * v_i
```

Total system momentum:

```text
P = sum(m_i * v_i)
```

Momentum magnitude:

```text
|P| = sqrt(P_x^2 + P_y^2 + P_z^2)
```

The diagnostics display total momentum magnitude. In an isolated physical system, total momentum should remain approximately constant. Numerical error and user edits can change the displayed behavior.

### Momentum-Balanced Sun Velocity

Concept group: center-of-mass frame setup.

When a scenario includes the Sun, the Sun receives an initial velocity that approximately balances the selected planets' total starting momentum:

```text
v_sun = -sum(m_planet * v_planet) / M_sun
```

This prevents the Sun from being artificially fixed at the origin and gives the system a more physically consistent starting frame.

### Barycenter

Concept group: center of mass.

The barycenter position is:

```text
R_cm = sum(m_i * r_i) / sum(m_i)
```

The center-of-mass velocity is:

```text
V_cm = sum(m_i * v_i) / sum(m_i)
```

The backend uses the barycenter for diagnostics. Sunless systems are recentered by subtracting `R_cm` from positions and `V_cm` from velocities.

### Sunless Barycentric Recenter

Concept group: barycentric reference frame.

For sunless scenarios:

```text
r_i' = r_i - R_cm
v_i' = v_i - V_cm
```

This removes the inherited solar-system bulk motion and places the selected planet-only system in its own center-of-mass frame.

### Kinetic Energy

Concept group: mechanical energy.

For each body:

```text
K_i = 0.5 * m_i * |v_i|^2
```

Total kinetic energy:

```text
K = sum(0.5 * m_i * |v_i|^2)
```

### Gravitational Potential Energy

Concept group: Newtonian gravitational potential energy.

For each unique body pair:

```text
U_ij = -G * m_i * m_j / |r_j - r_i|
```

Total potential energy:

```text
U = -sum(i < j) G * m_i * m_j / |r_j - r_i|
```

Pairs are counted once with `i < j`.

### Total Mechanical Energy

Concept group: orbital energy conservation.

Total energy:

```text
E = K + U
```

The frontend energy graph displays relative energy change from a baseline:

```text
relative_energy_change = (E_current - E_baseline) / abs(E_baseline)
```

The baseline is the first finite total energy seen by the frontend, or a new baseline after elapsed simulation time moves backward after reset.

For a stable isolated gravitational simulation, total energy should remain nearly constant. Small oscillations are normal. Large drift usually means the timestep is too large for the system state, the system has been strongly edited, or a body has been pushed into a numerically difficult close encounter.

### Speed Magnitude Editing

Concept group: vector magnitude scaling.

The sandbox speed control changes the magnitude of the velocity vector, not its direction:

```text
v_new = normalize(v_old) * requested_speed
```

If the current velocity is zero, Python uses a fallback tangent direction based on current position:

```text
tangent = [-y, x, 0]
```

If the position also cannot provide a tangent, Python falls back to `[0, 1, 0]`.

### Distance Magnitude Editing

Concept group: vector magnitude scaling.

The sandbox distance control changes the magnitude of the position vector from the origin:

```text
r_new = normalize(r_old) * requested_distance
```

If the current position is zero, Python falls back to `[1, 0, 0]`.

### Direct Position Editing

Concept group: validated state mutation through backend authority.

The transform gizmo commits absolute position vectors:

```text
positionM = [x, y, z]
```

Python validates the vector and stores it in meters. The frontend only previews movement before commit.

### Static Orbit Guide Geometry

Concept group: conic section orbit visualization.

Orbit lines are display guides, not live physics paths.

For an orbit with semi-major axis `a`, eccentricity `e`, and true anomaly `nu`, the guide radius is:

```text
radius = a * (1 - e^2) / (1 + e * cos(nu))
```

For circular guides where `e = 0`:

```text
radius = a
```

The local orbital-plane point is:

```text
point = [radius * cos(nu), radius * sin(nu), 0]
```

The renderer can rotate the point by:

```text
Rz(longitude_of_ascending_node) * Rx(inclination) * Rz(argument_of_periapsis)
```

Then the orbit center is added.

Current planet metadata uses circular orbit guides unless future metadata supplies nonzero eccentricity/inclination values.

### Render Display Scaling

Concept group: visual coordinate transformation, not physics.

The backend sends meters. The renderer converts meters to scene units.

Axis mapping:

```text
Python meters: [x, y, z]
Three.js:      [x, z, y]
```

Distance in astronomical units:

```text
distance_au = distance_m / AU_M
```

For distances up to 1 AU:

```text
scene_distance = distance_au * 150
```

For distances beyond 1 AU:

```text
scene_distance = 150 + sqrt(distance_au - 1) * 105
```

The inverse conversion is used by the transform gizmo before committing positions back to Python.

### Render Radius Scaling

Concept group: visual readability scaling, not physics.

Sun visual radius:

```text
sun_scene_radius = clamp(36 * sqrt(radius_m / SUN_RADIUS_M), 4.2, 140)
```

Planet visual radius:

```text
planet_scene_radius = min(22, 4.2 + sqrt(radius_m / EARTH_RADIUS_M) * 4.2)
```

Rendered sizes are intentionally compressed so planets remain visible. These values do not affect mass, gravity, collision, or orbital dynamics.

### Vector Diagnostics Display Scaling

Concept group: visual vector normalization, not physics.

Velocity and acceleration vectors are drawn as renderer-owned line helpers.

- Velocity vectors use snapshot `velocityMS`.
- Acceleration vectors use snapshot `accelerationMS2`.
- The renderer clamps drawn vector lengths to keep arrows visible and usable.

These helpers do not feed back into Python.

## Current Physical Scope and Limitations

- The simulation is Newtonian, not relativistic.
- Bodies are point masses for gravity.
- Body radius affects rendering and sandbox metadata, not collision.
- No collision detection or merging is currently implemented.
- No atmospheric drag.
- No radiation pressure.
- No thrust/propulsion model.
- No tidal forces.
- No rigid-body rotation physics.
- No live NASA/JPL ephemeris import.
- Initial Solar System positions are simplified configured phases.
- Saturn's rings are visual-only.
- Orbit guide lines are expected/static visual guides, not predictions from the current live state.
- Frontend display scaling is intentionally non-realistic so the system is usable on screen.
