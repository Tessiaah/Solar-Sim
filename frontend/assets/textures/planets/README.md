# Planet Texture Assets

These files are equirectangular 2:1 texture maps consumed by `BodyVisual.textures.map`.

Current files:

- `sun.jpg`: Solar System Scope texture mirrored on Wikimedia Commons, downloaded from `https://upload.wikimedia.org/wikipedia/commons/c/cb/Solarsystemscope_texture_2k_sun.jpg`.
- `mercury.jpg`: Solar System Scope 2K Mercury texture mirrored on Wikimedia Commons, downloaded through `https://commons.wikimedia.org/wiki/Special:Redirect/file/Solarsystemscope_texture_2k_mercury.jpg`.
- `venus.jpg`: Solar System Scope Venus surface texture, downloaded from `https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg`.
- `earth.jpg`: Solar System Scope Earth day map, downloaded from `https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg`.
- `mars.jpg`: Solar System Scope Mars texture, downloaded from `https://www.solarsystemscope.com/textures/download/2k_mars.jpg`.
- `jupiter.jpg`: Solar System Scope Jupiter texture, downloaded from `https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg`.
- `saturn.jpg`: Solar System Scope Saturn texture, downloaded from `https://www.solarsystemscope.com/textures/download/2k_saturn.jpg`.
- `uranus.jpg`: Locally generated 2K equirectangular Uranus atmosphere texture with subtle cyan banding, replacing the previous nearly flat color map.
- `neptune.jpg`: Solar System Scope Neptune texture, downloaded from `https://www.solarsystemscope.com/textures/download/2k_neptune.jpg`.

Use 2:1 equirectangular maps for sphere bodies. Replace or add files here, then update the body visual metadata in `src/simulation/scenario.py`.
