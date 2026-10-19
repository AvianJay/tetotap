"""Stage only Tetotap's runtime files for GitHub Pages. No external dependencies."""

import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "_site"
FILES = [
    "index.html", "icon.png", "favicon.svg", "favicon.ico",
    "assets/teto.svg", "assets/teto-mark.svg",
    "css/css.css", "css/tetotap.css",
    "js/pixi.min.js", "js/gsap.min.js", "js/tetotap.js",
    "data/main/main.json", "data/track/track.json",
]
FILES += [p.relative_to(ROOT).as_posix() for p in sorted((ROOT / "fonts").glob("*.woff2"))]

for group, expected in [("main", 32), ("track", 11)]:
    clips = json.loads((ROOT / f"data/{group}/{group}.json").read_text(encoding="utf-8"))
    assert set(clips) == {f"{i}.mp3" for i in range(expected)}, f"Invalid {group} sounds"
    assert all(value.startswith("data:audio/mp3;base64,") for value in clips.values())

for relative in FILES:
    source = ROOT / relative
    target = DESTINATION / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)

(DESTINATION / ".nojekyll").write_text("", encoding="utf-8")
print(f"Staged {len(FILES)} runtime files in _site; all 43 audio clips validated.")
