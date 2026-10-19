"""Capture a README GIF with Playwright and Pillow, without a local web server.

Install: python -m pip install playwright pillow
         python -m playwright install chromium
Run:     python tools/render_preview.py
"""

import io
import mimetypes
from pathlib import Path
import time
from urllib.parse import unquote, urlparse

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://tetotap.test/tetotap/"
FRAME_SIZE = (960, 675)


def render():
    frames = []
    allowed = {
        "index.html", "icon.png", "favicon.ico",
        "css/css.css", "css/mikutap.css", "shared/sp/css/common.css",
        "js/jquery.min.js", "js/pixi.min.js", "js/gsap.min.js", "js/mikutap.js",
        "shared/js/common-2.min.js", "data/main/main.json",
        "data/track/track.json",
    }
    allowed.update(p.relative_to(ROOT).as_posix() for p in (ROOT / "fonts").glob("*.woff2"))

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=playwright.chromium.executable_path,
            headless=True,
        )
        context = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=1)

        def local_asset(route):
            url = urlparse(route.request.url)
            relative = unquote(url.path).removeprefix("/tetotap/") or "index.html"
            if url.hostname != "tetotap.test" or relative not in allowed:
                route.fulfill(status=404, body="Not found")
                return
            mime = mimetypes.guess_type(relative)[0] or "application/octet-stream"
            route.fulfill(status=200, body=(ROOT / relative).read_bytes(), content_type=mime)

        context.route("**/*", local_asset)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("""let seed = 401; Math.random = () => {
          seed = (seed * 16807) % 2147483647;
          return (seed - 1) / 2147483646;
        };""")
        page.goto(ORIGIN)
        page.locator("#bt_start a").wait_for(state="visible")
        page.evaluate("document.fonts.ready")
        page.mouse.move(12, 12)

        def capture():
            screenshot = page.screenshot(type="png", animations="allow")
            frame = Image.open(io.BytesIO(screenshot)).convert("RGB")
            frames.append(frame.resize(FRAME_SIZE, Image.Resampling.LANCZOS))

        # A short introduction, a real keyboard performance, then back to the title.
        for _ in range(14):
            capture()
            page.wait_for_timeout(65)
        page.locator("#bt_start a").click()
        page.locator("#scene_main").wait_for(state="visible")
        keys = ["a", "k", "s", "0", "b", "r", "4", "g", "w", "d", "2", "m", "f", "z", "c", "x"]
        for i in range(60):
            if i % 3 == 0:
                page.keyboard.press(keys[(i // 3) % len(keys)])
            capture()
            page.wait_for_timeout(65)
        page.locator("#bt_back").wait_for(state="visible")
        page.locator("#bt_back").click()
        page.evaluate("document.activeElement.blur()")
        page.mouse.move(12, 12)
        for _ in range(14):
            capture()
            page.wait_for_timeout(65)
        browser.close()
        if errors:
            raise RuntimeError("Preview encountered a page error: " + errors[0])

    output = ROOT / "assets/tetotap-preview.gif"
    # A fixed palette keeps the cream background and red theme consistent across frames.
    swatches = Image.new("RGB", (FRAME_SIZE[0] * 3, FRAME_SIZE[1]))
    for i, index in enumerate((0, 30, 55)):
        swatches.paste(frames[index], (FRAME_SIZE[0] * i, 0))
    palette = swatches.quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    quantized = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    quantized[0].save(
        output, save_all=True, append_images=quantized[1:], duration=100,
        loop=0, optimize=True, disposal=1,
    )
    print(f"Rendered {len(frames)} frames, {FRAME_SIZE[0]}x{FRAME_SIZE[1]}, {output.stat().st_size:,} bytes: {output.relative_to(ROOT)}")


if __name__ == "__main__":
    started = time.monotonic()
    render()
    print(f"Finished in {time.monotonic() - started:.1f}s. No local server was started.")
