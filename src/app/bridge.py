class HostWindowApi:
    def __init__(self) -> None:
        self._window = None
        self._is_fullscreen = False

    def bind_window(self, window) -> None:
        self._window = window

    def apply_window_settings(self, settings: dict) -> dict:
        if self._window is None:
            return {"ok": False, "reason": "Window is not bound"}

        display_mode = settings.get("displayMode", "windowed")
        width = int(settings.get("width", 1920))
        height = int(settings.get("height", 1080))
        should_fullscreen = display_mode in {"fullscreen", "borderlessFullscreen"}

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
