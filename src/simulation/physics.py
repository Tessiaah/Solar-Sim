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




