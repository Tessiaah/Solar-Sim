import platform
from pathlib import Path

import webview

from src.app.api import AppApi


APP_TITLE = "Solaris Engine"
DEFAULT_WIDTH = 1920
DEFAULT_HEIGHT = 1080
APP_ICON_RELATIVE_PATH = Path("frontend") / "assets" / "app" / "solar-sim.ico"
WINDOWS_APP_USER_MODEL_ID = "SolarSim.Desktop"


def get_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def get_frontend_entrypoint() -> Path:
    return get_project_root() / "frontend" / "index.html"


def get_app_icon_path() -> Path | None:
    icon_path = get_project_root() / APP_ICON_RELATIVE_PATH
    return icon_path if icon_path.exists() else None


def configure_platform_window_identity() -> None:
    if platform.system() != "Windows":
        return

    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
            WINDOWS_APP_USER_MODEL_ID
        )
    except (AttributeError, OSError):
        return


def launch_app() -> None:
    configure_platform_window_identity()

    entrypoint = get_frontend_entrypoint()
    icon_path = get_app_icon_path()

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
    webview.start(icon=str(icon_path) if icon_path else None)
