from pathlib import Path

import webview

from src.app.api import AppApi


APP_TITLE = "Solar Sim"
DEFAULT_WIDTH = 1920
DEFAULT_HEIGHT = 1080


def get_frontend_entrypoint() -> Path:
    project_root = Path(__file__).resolve().parents[2]
    return project_root / "frontend" / "index.html"


def launch_app() -> None:
    entrypoint = get_frontend_entrypoint()

    if not entrypoint.exists():
        raise FileNotFoundError(f"Frontend entrypoint not found: {entrypoint}")

    api = AppApi()
    window = webview.create_window(
        APP_TITLE,
        entrypoint.as_uri(),
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        min_size=(1280, 720),
        text_select=False,
        js_api=api,
    )
    api.bind_window(window)
    webview.start()
