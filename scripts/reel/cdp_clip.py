#!/usr/bin/env python3
"""Record a real interaction on a live page, over the Chrome DevTools Protocol.

Why this exists
---------------
`build_reel.py`'s `shots` step captures one still per segment and pushes a Ken
Burns zoom across it. A still of a table is indistinguishable from a PDF, which
was the whole complaint about the first two release reels: the site is full of
things that move and none of them had ever been shown.

Playwright is deliberately not used -- it is not installed on the reel machine
and an `npx --no-install playwright --version` that prints a version is reading
the npx cache, not an install. This drives plain Chrome over CDP instead. One
dependency: `pip install websocket-client`.

Frames are pulled one at a time with Page.captureScreenshot on a fixed clock,
and the segment's actions fire at their scheduled tick. Single threaded on
purpose: no screencast frame-ack bookkeeping, no race between the action
timeline and the capture loop, and a frame is never half a layout.

THINGS THAT COST AN HOUR EACH, DO NOT REGRESS THEM
  * `--remote-allow-origins=*`. Chrome >=111 rejects a CDP websocket whose
    Origin it does not recognise, with a bare 403 that reads exactly like
    "Chrome never started".
  * Emulation.setDeviceMetricsOverride, not --window-size. --window-size is the
    WINDOW; headless=new gives 540x820 of page for a 540x960 window, and the
    missing 140 CSS px come back as black bars after the pad.
  * The CDP endpoint is on loopback. Any ambient HTTP proxy will reject
    127.0.0.1 and the failure again looks like "Chrome never started", so the
    HTTP call goes through an opener with proxies explicitly disabled.
  * --no-sandbox ONLY when running as root. Chrome refuses to start as root
    without it; never pass it on a normal desktop run.
"""
import base64
import json
import os
import shutil
import socket
import subprocess
import time
import urllib.request

W, H, FPS = 1080, 1920, 30
CAP_FPS = 12                 # capture clock; ffmpeg interpolates up to FPS
NAV_SETTLE = 2.0             # seconds after navigate before the first frame


def find_chrome():
    """macOS, Linux, then Windows. REEL_CHROME overrides everything."""
    env = os.environ.get("REEL_CHROME")
    if env and os.path.exists(env):
        return env
    cands = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for c in cands:
        if os.path.exists(c):
            return c
    for n in ("google-chrome", "chromium", "chromium-browser", "chrome"):
        p = shutil.which(n)
        if p:
            return p
    return None


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Chrome:
    """A headless Chrome with one CDP tab attached."""

    def __init__(self, chrome, scale=2):
        import websocket
        self._ws_mod = websocket
        self.port = _free_port()
        self.profile = os.path.join(
            os.environ.get("TMPDIR", "/tmp"), f"reelclip-{self.port}")
        root = hasattr(os, "geteuid") and os.geteuid() == 0
        self.proc = subprocess.Popen(
            [chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--no-first-run", "--no-default-browser-check", "--mute-audio",
             "--remote-allow-origins=*"]
            + (["--no-sandbox"] if root else []) +
            [f"--user-data-dir={self.profile}",
             f"--force-device-scale-factor={scale}",
             f"--window-size={W // scale},{H // scale}",
             f"--remote-debugging-port={self.port}", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.ws = self._attach()
        self._id = 0

    def _attach(self, timeout=25):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        last = None
        end = time.time() + timeout
        while time.time() < end:
            try:
                raw = opener.open(
                    f"http://127.0.0.1:{self.port}/json/list", timeout=2).read()
                tabs = [t for t in json.loads(raw) if t.get("type") == "page"]
                if tabs:
                    return self._ws_mod.create_connection(
                        tabs[0]["webSocketDebuggerUrl"], timeout=30,
                        max_size=64 * 1024 * 1024)
            except Exception as e:
                last = e
            time.sleep(0.3)
        raise RuntimeError(f"could not attach to Chrome over CDP (last error: {last})")

    def cmd(self, method, **params):
        self._id += 1
        self.ws.send(json.dumps({"id": self._id, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self._id:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def js(self, expr):
        return self.cmd("Runtime.evaluate", expression=expr,
                        awaitPromise=True, returnByValue=True)

    def shot(self):
        r = self.cmd("Page.captureScreenshot", format="png",
                     captureBeyondViewport=False)
        return base64.b64decode(r["data"])

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass
        self.proc.terminate()
        try:
            self.proc.wait(timeout=8)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)


def _js_click(sel):
    # scrollIntoView first: a click on an offscreen node fires but shows nothing
    return (f"(()=>{{const e=document.querySelector({json.dumps(sel)});"
            f"if(!e)return 'miss';e.scrollIntoView({{block:'center'}});"
            f"e.click();return 'ok';}})()")


def run_actions(ch, acts, out_dir, seconds):
    """Play the action timeline while capturing on a fixed clock."""
    os.makedirs(out_dir, exist_ok=True)
    dt = 1.0 / CAP_FPS
    pending = sorted(acts, key=lambda a: a.get("at", 0))
    misses = []
    t0 = time.time()
    for i in range(int(seconds * CAP_FPS)):
        now = i * dt
        while pending and pending[0].get("at", 0) <= now:
            a = pending.pop(0)
            try:
                if "click" in a:
                    r = ch.js(_js_click(a["click"]))
                    if r.get("result", {}).get("value") == "miss":
                        misses.append(a["click"])
                elif "hover" in a:
                    ch.js(f"(()=>{{const e=document.querySelector({json.dumps(a['hover'])});"
                          f"if(e)e.dispatchEvent(new MouseEvent('mouseover',{{bubbles:true}}));"
                          f"else return 'miss';}})()")
                elif "scroll" in a:
                    v = a["scroll"]
                    if isinstance(v, str) and v[0] in "+-":
                        ch.js(f"window.scrollBy({{top:{int(v)},behavior:'instant'}})")
                    else:
                        ch.js(f"window.scrollTo({{top:{int(v)},behavior:'instant'}})")
                elif "eval" in a:
                    ch.js(a["eval"])
            except Exception as e:
                misses.append(f"{a} ({e})")
        with open(os.path.join(out_dir, f"{i:05d}.png"), "wb") as f:
            f.write(ch.shot())
        drift = (t0 + (i + 1) * dt) - time.time()
        if drift > 0:
            time.sleep(drift)
    return misses


def capture_clip(url, acts, seconds, out_mp4, chrome=None, work=None):
    chrome = chrome or find_chrome()
    if not chrome:
        raise RuntimeError("no Chrome found; set REEL_CHROME")
    work = work or os.path.join(os.environ.get("TMPDIR", "/tmp"), "reelframes")
    stem = os.path.splitext(os.path.basename(out_mp4))[0]
    frames = os.path.join(work, stem)
    shutil.rmtree(frames, ignore_errors=True)
    ch = Chrome(chrome)
    try:
        ch.cmd("Page.enable")
        ch.cmd("Runtime.enable")
        ch.cmd("Emulation.setDeviceMetricsOverride",
               width=W // 2, height=H // 2, deviceScaleFactor=2, mobile=False)
        ch.cmd("Page.navigate", url=url)
        time.sleep(NAV_SETTLE)
        # kill smooth-scroll easing so a scripted scroll lands where we asked
        ch.js("document.documentElement.style.scrollBehavior='auto'")
        misses = run_actions(ch, acts, frames, seconds)
    finally:
        ch.close()
    os.makedirs(os.path.dirname(os.path.abspath(out_mp4)), exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-framerate", str(CAP_FPS), "-i",
         os.path.join(frames, "%05d.png"),
         "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
                f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
         "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "19",
         out_mp4],
        capture_output=True, check=True)
    shutil.rmtree(frames, ignore_errors=True)
    return misses
