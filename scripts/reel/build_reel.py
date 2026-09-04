#!/usr/bin/env python3
"""build_reel.py -- the vertical release-highlights reel, end to end.

Turns a segment list (JSON) into a 1080x1920 mp4: a screenshot of the live
site per segment, ElevenLabs narration over it, a burnt-in caption, a slow
Ken Burns push, an instrumental bed, and a mobile-safe final encode.

    python3 scripts/reel/build_reel.py all --script scripts/reel/reel-2026-09.json

Steps run in order and are individually re-runnable, which matters because
narration and music cost money:

    shots     capture one screenshot per segment      (network, free)
    narrate   ElevenLabs TTS, one clip per segment    (network, COSTS)
    captions  render caption PNGs with Pillow         (local, free)
    music     ElevenLabs music bed                    (network, COSTS)
    assemble  ffmpeg: segments -> concat -> mix -> mobile encode
    all       every step above

Work lands in --workdir (default reel-build/, gitignored). Nothing is written
inside the repo tree except by your own choice of --workdir.

SCRIPT FILE: a JSON list of
    {"n": 1, "slug": "01-hook", "url": "https://...", "caption": "...", "vo": "..."}
`vo` is what gets spoken -- spell numbers out ("eighteen seventy-one"), the
TTS reads digits inconsistently. `caption` is the on-screen text.

CREDENTIALS: ELEVENLABS_API_KEY from the environment, else read out of
~/.claude.json (mcpServers.elevenlabs.env). Needs the sk_ secret, not the key
ID, with Text to Speech + Voices scopes; music additionally needs Music.

WHY THINGS ARE THE WAY THEY ARE -- all of these were learned the hard way, see
the releases-reel-pipeline memory:

  * Chrome headless, not Playwright. Playwright is not installed here; an
    `npx --no-install playwright --version` that prints a version is reading
    the npx cache, not an install.
  * --window-size=540,960 with --force-device-scale-factor=2 gives EXACTLY
    1080x1920, so nothing is ever rescaled.
  * Captions are PNG overlays because this ffmpeg build has NEITHER drawtext
    NOR subtitles. Check `ffmpeg -filters` before assuming either exists.
  * ZOOM_MAX is 1.03, not the 1.10 an earlier version used: a 10% push crops
    ~5% off each edge and clips words on text-dense page captures.
  * The final encode sets +faststart. Without it moov lands after mdat and
    nothing plays until the whole file has downloaded.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

from cdp_clip import capture_clip, capture_shot, find_chrome

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

VOICE_ID = "TX3LPaxmHKxFdv7VOQHJ"
TTS_MODEL = "eleven_multilingual_v2"
VOICE_SETTINGS = {"stability": 0.45, "similarity_boost": 0.75,
                  "style": 0.0, "use_speaker_boost": True, "speed": 1.02}
W, H, FPS = 1080, 1920, 30
ZOOM_MAX = 1.03
TAIL = 0.45          # silence after each clip so cuts do not clip the last word
MUSIC_VOL = 0.16
# Resolved at run time across macOS/Linux/Windows; REEL_CHROME overrides.
# The old hardcoded /Applications path meant this file only ever ran on the Mac.
CHROME = find_chrome() or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
MUSIC_PROMPT = ("Calm, understated instrumental bed for a data-journalism product tour. "
                "Warm analog synth pads, soft muted piano, gentle pulse, no drums after "
                "the intro, no vocals. Restrained and confident, sits under a narrator.")


# ----------------------------------------------------------------- helpers

def die(msg):
    sys.exit(f"build_reel: {msg}")


def api_key():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        return key
    # Fall back to the MCP server's configured key. Note a running stdio MCP
    # server holds the value it launched with, so editing this file does not
    # affect the tool until the connection restarts -- but reading it here is
    # always current.
    try:
        with open(os.path.expanduser("~/.claude.json"), encoding="utf-8") as f:
            cfg = json.load(f)
    except OSError:
        die("no ELEVENLABS_API_KEY and ~/.claude.json unreadable")

    def find(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.lower() == "elevenlabs" and isinstance(v, dict):
                    return v
                r = find(v)
                if r:
                    return r
        elif isinstance(o, list):
            for v in o:
                r = find(v)
                if r:
                    return r
        return None

    srv = find(cfg) or {}
    key = (srv.get("env") or {}).get("ELEVENLABS_API_KEY", "")
    if not key:
        die("no ELEVENLABS_API_KEY in env or ~/.claude.json")
    if not key.startswith("sk_"):
        die("the configured ElevenLabs key is not an sk_ secret (looks like a key ID)")
    return key


def load_script(path):
    with open(path, encoding="utf-8") as f:
        segs = json.load(f)
    seen = set()
    for s in segs:
        for field in ("n", "slug", "url", "caption", "vo"):
            if field not in s:
                die(f"segment {s.get('n', '?')} is missing '{field}'")
        if s["n"] in seen:
            die(f"duplicate segment number {s['n']}")
        seen.add(s["n"])
    return sorted(segs, key=lambda s: s["n"])


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", path],
                         capture_output=True, text=True).stdout.strip()
    return float(out or 0)


def need(binary, hint):
    if not shutil.which(binary) and not os.path.exists(binary):
        die(f"{binary} not found -- {hint}")


def paths(work, seg):
    return {
        "shot": f"{work}/shots/{seg['slug']}.png",
        "audio": f"{work}/audio/{seg['n']:02d}.mp3",
        "caption": f"{work}/seg/{seg['n']:02d}_caption.png",
        "clip": f"{work}/clips/{seg['slug']}.mp4",
        "video": f"{work}/seg/{seg['n']:02d}.mp4",
    }


# ------------------------------------------------------------------ steps

def step_shots(segs, work, force=False):
    """One still per segment, at EXACTLY 1080x1920, captured over CDP.

    🔴 This used to shell out to `chrome --headless --screenshot` with
    --window-size=540,960 and trust it to produce 1080x1920. It does not any
    more: --window-size sizes the WINDOW, and headless=new (what plain
    --headless became in Chrome 132) leaves 540x820 of page, so the still
    arrived at 1080x1640 and the render step's scale+pad added black bars.
    The clips step was fixed for this in cdp_clip.py and the stills path was
    not, so the two capture paths disagreed and only one of them said so.
    Both now go through Emulation.setDeviceMetricsOverride, which sizes the
    PAGE. Costs this step the websocket-client dependency the clips step
    already had.
    """
    need(CHROME, "install Google Chrome, or point CHROME at another Chromium")
    try:
        import websocket  # noqa: F401
    except ImportError:
        die("pip install websocket-client (the stills are captured over CDP too "
            "since 2026-09-04 -- see step_shots for why)")
    for s in segs:
        out = paths(work, s)["shot"]
        if os.path.exists(out) and not force:
            print(f"  {s['slug']:18} skip (exists)")
            continue
        try:
            w, h = capture_shot(s["url"], out, chrome=CHROME)
        except Exception as e:
            die(f"screenshot failed for {s['url']}: {e}")
        if (w, h) != (W, H):
            # Never pad silently. A wrong size here is a black bar in the
            # finished reel, which is exactly what nobody noticed for a month.
            die(f"{s['slug']}: captured {w}x{h}, expected {W}x{H} -- the "
                f"viewport override did not take; do not render this")
        print(f"  {s['slug']:18} {os.path.getsize(out) // 1024:5d} KB  {w}x{h}  {s['url']}")


def step_clips(segs, work, force=False):
    """Record a real interaction for every segment that declares `act`.

    A still of a table is indistinguishable from a PDF. A segment with an
    `act` list is driven over CDP and recorded instead: the board actually
    re-sorts, the filter actually redraws. Segments with no `act` fall through
    to `shots` and the Ken Burns push, unchanged, so this step is additive.

    Segment fields:
        "act":    [{"at": 1.0, "click": "#sort"}, {"at": 3.2, "scroll": "+400"}]
        "clip_s": clip length in seconds. Defaults to the narration length once
                  `narrate` has run, else 6.0. Run narrate first and you get a
                  clip that matches its own voiceover exactly.

    Verbs: click / hover (css selector), scroll (absolute y, or "+N"/"-N"),
    eval (raw js). `at` is seconds from the start of the clip.
    """
    todo = [s for s in segs if s.get("act")]
    if not todo:
        print("  no segment declares `act` -- nothing to record")
        return
    if not find_chrome():
        die("no Chrome found -- set REEL_CHROME to the binary")
    try:
        import websocket  # noqa: F401
    except ImportError:
        die("pip install websocket-client (needed only by the clips step)")
    for s in todo:
        out = paths(work, s)["clip"]
        if os.path.exists(out) and not force:
            print(f"  {s['slug']:18} skip (exists)")
            continue
        secs = s.get("clip_s")
        if secs is None:
            audio = paths(work, s)["audio"]
            secs = round(duration(audio) + TAIL, 2) if os.path.exists(audio) else 6.0
        misses = capture_clip(s["url"], s["act"], secs, out,
                              work=os.path.join(work, "frames"))
        print(f"  {s['slug']:18} {secs:5.2f}s  {os.path.getsize(out) // 1024:5d} KB"
              + (f"  MISSED {misses}" if misses else ""))
        if misses:
            print("    ^ that selector matched nothing. The clip recorded, but the "
                  "interaction did not happen. Fix it and rerun with --force.")


def step_narrate(segs, work, force=False):
    key = api_key()
    for s in segs:
        out = paths(work, s)["audio"]
        if os.path.exists(out) and not force:
            print(f"  {s['n']:02d} skip (exists)  {duration(out):5.1f}s")
            continue
        body = json.dumps({"text": s["vo"], "model_id": TTS_MODEL,
                           "voice_settings": VOICE_SETTINGS}).encode()
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
            f"?output_format=mp3_44100_128",
            data=body, headers={"xi-api-key": key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                with open(out, "wb") as f:
                    f.write(r.read())
        except urllib.error.HTTPError as e:
            die(f"TTS failed on segment {s['n']}: {e.code} "
                f"{e.read(300).decode('utf-8', 'replace')[:200]}")
        print(f"  {s['n']:02d}  {duration(out):5.1f}s  {s['caption']}")


def step_captions(segs, work, force=False):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        die("Pillow not installed -- pip install Pillow")
    for s in segs:
        out = paths(work, s)["caption"]
        if os.path.exists(out) and not force:
            print(f"  {s['n']:02d} skip (exists)")
            continue
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        text = s["caption"]
        size = 78 if len(text) <= 22 else 60
        font = ImageFont.truetype(FONT, size)
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if d.textlength(t, font=font) <= W - 140:
                cur = t
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
        lh = size + 16
        y0 = H - 300 - lh * len(lines)
        pad = 34
        d.rounded_rectangle([60, y0 - pad, W - 60, y0 + lh * len(lines) + pad],
                            radius=28, fill=(0, 0, 0, 168))
        for i, ln in enumerate(lines):
            x = (W - d.textlength(ln, font=font)) / 2
            y = y0 + i * lh
            for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3),
                           (-2, -2), (2, 2), (-2, 2), (2, -2)):
                d.text((x + dx, y + dy), ln, font=font, fill=(0, 0, 0, 255))
            d.text((x, y), ln, font=font, fill=(255, 255, 255, 255))
        img.save(out)
        print(f"  {s['n']:02d}  {len(lines)} line(s) @ {size}px  {text}")


def step_music(segs, work, force=False):
    out = f"{work}/music.mp3"
    if os.path.exists(out) and not force:
        print(f"  skip (exists)  {duration(out):.1f}s")
        return
    total = sum(duration(paths(work, s)["audio"]) + TAIL for s in segs)
    if not total:
        die("no narration found -- run the narrate step first")
    body = json.dumps({"prompt": MUSIC_PROMPT,
                       "music_length_ms": int((total + 1) * 1000),
                       "force_instrumental": True}).encode()
    req = urllib.request.Request("https://api.elevenlabs.io/v1/music", data=body,
                                 headers={"xi-api-key": api_key(),
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            with open(out, "wb") as f:
                f.write(r.read())
    except urllib.error.HTTPError as e:
        die(f"music failed: {e.code} {e.read(300).decode('utf-8', 'replace')[:200]} "
            f"(the key may lack the Music scope)")
    print(f"  music {duration(out):.1f}s  {os.path.getsize(out) // 1024} KB")


def step_assemble(segs, work, force=False):
    need("ffmpeg", "brew install ffmpeg")
    filters = subprocess.run(["ffmpeg", "-hide_banner", "-filters"],
                             capture_output=True, text=True).stdout
    for f in ("zoompan", "overlay", "amix", "afade"):
        if f" {f} " not in filters:
            die(f"ffmpeg is missing the '{f}' filter")

    listing = []
    for s in segs:
        p = paths(work, s)
        clip = p["clip"] if os.path.exists(p["clip"]) else None
        for k in (("audio", "caption") if clip else ("shot", "audio", "caption")):
            if not os.path.exists(p[k]):
                die(f"segment {s['n']}: missing {k} -- run that step first")
        d = duration(p["audio"]) + TAIL
        if clip:
            # Recorded motion. Hold the last frame if the clip is short of the
            # narration and trim if it runs long, so audio stays authoritative.
            vf = (f"[0:v]tpad=stop_mode=clone:stop_duration=30,"
                  f"trim=0:{d:.3f},setpts=PTS-STARTPTS,fps={FPS},"
                  f"scale={W}:{H},format=yuv420p[bg];"
                  f"[bg][2:v]overlay=0:0:format=auto,format=yuv420p")
            src = ["-i", clip]
        else:
            frames = max(int(d * FPS), 1)
            rate = (ZOOM_MAX - 1.0) / frames
            vf = (f"scale={W * 2}:-2,"
                  f"zoompan=z='min(zoom+{rate:.6f},{ZOOM_MAX})':d={frames}"
                  f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},"
                  f"format=yuv420p[bg];[bg][2:v]overlay=0:0:format=auto,format=yuv420p")
            src = ["-loop", "1", "-t", f"{d:.3f}", "-i", p["shot"]]
        subprocess.run(["ffmpeg", "-y"] + src +
                       ["-i", p["audio"], "-i", p["caption"], "-filter_complex", vf,
                        "-map", "1:a", "-c:a", "aac", "-b:a", "192k",
                        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                        "-r", str(FPS), "-t", f"{d:.3f}", p["video"]],
                       capture_output=True, check=True)
        listing.append(f"file '{os.path.abspath(p['video'])}'")
        print(f"  {s['n']:02d}  {d:5.2f}s  {'MOTION' if clip else 'still '}  {s['caption']}")

    concat = f"{work}/concat.txt"
    with open(concat, "w", encoding="utf-8") as f:
        f.write("\n".join(listing) + "\n")
    silent = f"{work}/reel_nomusic.mp4"
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat,
                    "-c", "copy", silent], capture_output=True, check=True)

    total = duration(silent)
    music = f"{work}/music.mp3"
    mixed = f"{work}/reel_mixed.mp4"
    if os.path.exists(music):
        fade = max(total - 2.2, 0.1)
        mix = (f"[1:a]volume={MUSIC_VOL},afade=t=in:st=0:d=1.5,"
               f"afade=t=out:st={fade:.2f}:d=2[music];"
               f"[0:a][music]amix=inputs=2:duration=first:dropout_transition=0[aout]")
        subprocess.run(["ffmpeg", "-y", "-i", silent, "-i", music,
                        "-filter_complex", mix, "-map", "0:v", "-map", "[aout]",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", mixed],
                       capture_output=True, check=True)
    else:
        print("  no music.mp3 -- assembling narration only")
        mixed = silent

    final = f"{work}/reel_final.mp4"
    subprocess.run(["ffmpeg", "-y", "-i", mixed,
                    "-c:v", "libx264", "-profile:v", "main", "-level", "4.0",
                    "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "slow",
                    "-maxrate", "4M", "-bufsize", "8M", "-g", "60",
                    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                    "-movflags", "+faststart", final], capture_output=True, check=True)
    print(f"\n  FINAL {final}")
    print(f"  {duration(final):.1f}s  {os.path.getsize(final) // (1024 * 1024)} MB  "
          f"{W}x{H}  faststart")


STEPS = {"shots": step_shots, "narrate": step_narrate, "clips": step_clips,
         "captions": step_captions, "music": step_music, "assemble": step_assemble}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=list(STEPS) + ["all"])
    ap.add_argument("--script", required=True, help="segment list JSON")
    ap.add_argument("--workdir", default=os.path.join(ROOT, "reel-build"))
    ap.add_argument("--force", action="store_true",
                    help="redo work that already exists (re-spends on narrate/music)")
    a = ap.parse_args()

    segs = load_script(a.script)
    for sub in ("shots", "audio", "seg", "clips", "frames"):
        os.makedirs(os.path.join(a.workdir, sub), exist_ok=True)

    order = list(STEPS) if a.step == "all" else [a.step]
    for name in order:
        print(f"\n== {name} ==")
        STEPS[name](segs, a.workdir, a.force)


if __name__ == "__main__":
    main()
