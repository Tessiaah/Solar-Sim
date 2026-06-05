import numpy as np
from src.data.constants import G
from src.simulation.body import SimBody


#we use the n-body equation for acceleration (check my documentation to see which one)
def compute_gravitational_acceleration_on_body(
    target_body: SimBody,
    source_bodies: list[SimBody],
) -> np.ndarray:

    total_acceleration = np.zeros(3, dtype=np.float64)

    for source_body in source_bodies:
        if source_body is target_body:
            continue

        displacement = source_body.state.position_m - target_body.state.position_m
        distance = np.linalg.norm(displacement)

        if distance == 0.0:
            continue

        total_acceleration += (
            G * source_body.definition.mass_kg * displacement / distance**3
        )

    return total_acceleration

def compute_accelerations(bodies: list[SimBody]) -> list[np.ndarray]:
    return [
        compute_gravitational_acceleration_on_body(body, bodies)
        for body in bodies
    ]


def compute_system_diagnostics(bodies: list[SimBody]) -> dict:
    accelerations = compute_accelerations(bodies)
    kinetic_energy_j = 0.0
    potential_energy_j = 0.0
    total_mass_kg = 0.0
    weighted_position_m = np.zeros(3, dtype=np.float64)
    total_momentum_kgms = np.zeros(3, dtype=np.float64)

    for body in bodies:
        mass_kg = body.definition.mass_kg
        velocity_ms = body.state.velocity_ms

        kinetic_energy_j += 0.5 * mass_kg * float(np.dot(velocity_ms, velocity_ms))
        total_mass_kg += mass_kg
        weighted_position_m += body.state.position_m * mass_kg
        total_momentum_kgms += velocity_ms * mass_kg

    for target_index, target_body in enumerate(bodies):
        for source_body in bodies[target_index + 1:]:
            displacement = source_body.state.position_m - target_body.state.position_m
            distance_m = float(np.linalg.norm(displacement))

            if distance_m == 0.0:
                continue

            potential_energy_j -= (
                G
                * target_body.definition.mass_kg
                * source_body.definition.mass_kg
                / distance_m
            )

    barycenter_m = (
        weighted_position_m / total_mass_kg
        if total_mass_kg > 0
        else np.zeros(3, dtype=np.float64)
    )

    return {
        "accelerations": accelerations,
        "kineticEnergyJ": kinetic_energy_j,
        "potentialEnergyJ": potential_energy_j,
        "totalEnergyJ": kinetic_energy_j + potential_energy_j,
        "momentumKgMS": total_momentum_kgms,
        "momentumMagnitudeKgMS": float(np.linalg.norm(total_momentum_kgms)),
        "barycenterM": barycenter_m,
    }


def velocity_verlet(bodies: list[SimBody], dt: float ) -> None:
    old_accelerations = compute_accelerations(bodies)

    for i, body in enumerate(bodies):
        if body.definition.isfixed:
            continue

        body.state.position_m = (body.state.position_m + body.state.velocity_ms * dt
                                 + 0.5 * old_accelerations[i] * dt ** 2
        )

    new_accelerations = compute_accelerations(bodies)

    for i, body in enumerate(bodies):
        if body.definition.isfixed:
            continue

        body.state.velocity_ms = (body.state.velocity_ms
                                  + 0.5 * (old_accelerations[i] + new_accelerations[i]) * dt
        )




