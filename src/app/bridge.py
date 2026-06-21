DEFAULT_WINDOW_WIDTH = 1920
DEFAULT_WINDOW_HEIGHT = 1080
MIN_WINDOW_WIDTH = 1280
MIN_WINDOW_HEIGHT = 720
MAX_WINDOW_WIDTH = 7680
MAX_WINDOW_HEIGHT = 4320
FULLSCREEN_DISPLAY_MODES = {"fullscreen", "borderlessFullscreen"}
SUPPORTED_DISPLAY_MODES = {"windowed", *FULLSCREEN_DISPLAY_MODES}


class HostWindowApi:
    def __init__(self) -> None:
        self._window = None
        self._is_fullscreen = False

    def bind_window(self, window) -> None:
        self._window = window

    def apply_window_settings(self, settings: dict | None) -> dict:
        if self._window is None:
            return {"ok": False, "reason": "Window is not bound"}

        safe_settings = settings if isinstance(settings, dict) else {}
        display_mode = normalize_display_mode(safe_settings.get("displayMode"))
        width = normalize_window_dimension(
            safe_settings.get("width"),
            DEFAULT_WINDOW_WIDTH,
            MIN_WINDOW_WIDTH,
            MAX_WINDOW_WIDTH,
        )
        height = normalize_window_dimension(
            safe_settings.get("height"),
            DEFAULT_WINDOW_HEIGHT,
            MIN_WINDOW_HEIGHT,
            MAX_WINDOW_HEIGHT,
        )
        should_fullscreen = display_mode in FULLSCREEN_DISPLAY_MODES

        if should_fullscreen != self._is_fullscreen:
            self._window.toggle_fullscreen()
            self._is_fullscreen = should_fullscreen

        if not should_fullscreen:
            self._window.resize(width, height)

        return {
            "ok": True,
            "displayMode": display_mode,
            "width": width,
            "height": height,
            "fullscreen": self._is_fullscreen,
        }

    def quit_app(self) -> dict:
        if self._window is None:
            return {"ok": False, "reason": "Window is not bound"}

        self._window.destroy()
        return {"ok": True}


def normalize_display_mode(value) -> str:
    display_mode = str(value or "windowed").strip()

    return display_mode if display_mode in SUPPORTED_DISPLAY_MODES else "windowed"


def normalize_window_dimension(value, fallback: int, minimum: int, maximum: int) -> int:
    try:
        dimension = int(float(value))
    except (TypeError, ValueError, OverflowError):
        dimension = fallback

    return min(maximum, max(minimum, dimension))
