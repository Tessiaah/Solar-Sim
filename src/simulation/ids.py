def body_id_from_name(name: str) -> str:
    return name.lower().replace(" ", "-")


def normalize_body_ids(value) -> list[str]:
    if not isinstance(value, list):
        return []

    normalized_ids = []

    for item in value:
        if not isinstance(item, str):
            continue

        body_id = item.strip().lower()

        if body_id and body_id not in normalized_ids:
            normalized_ids.append(body_id)

    return normalized_ids
