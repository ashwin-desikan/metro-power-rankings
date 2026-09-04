# Release-highlights reel

A vertical 1080x1920 video summarising recent `/updates` releases: one live-site
screenshot per segment, narrated, captioned, with a slow Ken Burns push and an
instrumental bed. Built for phone-shaped social placements.

```bash
# everything, from a segment list
python3 scripts/reel/build_reel.py all --script scripts/reel/reel-2026-09.json

# or one step at a time -- each is independently re-runnable
python3 scripts/reel/build_reel.py shots    --script scripts/reel/reel-2026-09.json
python3 scripts/reel/build_reel.py narrate  --script ...   # COSTS (ElevenLabs)
python3 scripts/reel/build_reel.py clips    --script ...   # motion, see below
python3 scripts/reel/build_reel.py captions --script ...
python3 scripts/reel/build_reel.py music    --script ...   # COSTS (ElevenLabs)
python3 scripts/reel/build_reel.py assemble --script ...
```

## Motion: the `clips` step

The first two reels were stills with a Ken Burns push, and the note back was
that they "just took screenshots". A still of a table is indistinguishable from
a PDF. The `clips` step records a real interaction instead: the board actually
re-sorts, the filter actually redraws, the year actually steps.

Add an `act` list to any segment and it gets recorded rather than stilled.
Segments with no `act` fall through to `shots` unchanged, so this is additive
and a mixed reel is fine.

```json
{"n": 5, "slug": "05-ledger", "url": "https://rankings.citizenofnowhere.org/predictions/scoreboard",
 "caption": "Every forecast, graded", "vo": "...",
 "act": [{"at": 1.2, "scroll": "+520"},
         {"at": 3.0, "click": "th[data-sort='skill']"},
         {"at": 5.0, "scroll": 0}]}
```

Verbs, each with `at` in seconds from the start of the clip:

| verb | value | note |
|---|---|---|
| `scroll` | `900`, or `"+520"` / `"-300"` | absolute or relative. Always works, needs no selector. |
| `click` | css selector | scrolled into view first, then clicked |
| `hover` | css selector | dispatches `mouseover`, for tooltip reveals |
| `eval` | raw javascript | escape hatch |

`clip_s` sets the clip length. Leave it out and it defaults to the narration
length once `narrate` has run, which is what you usually want: **run `narrate`
before `clips`** and each clip matches its own voiceover exactly.

If a selector matches nothing the step prints `MISSED` and names it. The clip
still records, the interaction just did not happen, so fix the selector and
rerun that segment with `--force`.

Start with `scroll` on every segment. It needs no selector, it cannot miss, and
scrolling a real board already reads as a product rather than a document. Add
`click` once you have the selector in front of you from devtools.

Needs `pip install websocket-client`. Nothing else; Playwright is still not
used and still not installed.

### Motion gotchas, each of which cost an hour

* **`--remote-allow-origins=*`.** Chrome >= 111 rejects a CDP websocket whose
  Origin it does not recognise, with a bare 403 that reads exactly like
  "Chrome never started".
* **`Emulation.setDeviceMetricsOverride`, not `--window-size`.** `--window-size`
  is the WINDOW. Headless gives 540x820 of *page* for a 540x960 window, and the
  missing 140 CSS px come back as black bars top and bottom after the pad.
  Verified: the capture is 1080x1640 without the override, 1080x1920 with it.
* **The CDP endpoint is on loopback.** Any ambient HTTP proxy will happily
  reject 127.0.0.1, and that failure also looks like "Chrome never started".
  The HTTP call goes through an opener with proxies explicitly disabled.
* **Chrome is no longer hardcoded to the macOS path.** `find_chrome()` resolves
  macOS, Linux and Windows; `REEL_CHROME` overrides. The old constant meant
  this file only ever ran on the Mac.

Output lands in `reel-build/` (gitignored); the deliverable is
`reel-build/reel_final.mp4`. Steps skip work that already exists — pass
`--force` to redo, which **re-spends** on `narrate` and `music`.

## Writing the script file

A JSON list, one object per segment — see `reel-2026-09.json`:

```json
{"n": 1, "slug": "01-hook", "url": "https://rankings.citizenofnowhere.org/",
 "caption": "One month of releases",
 "vo": "One month at Citizen of Nowhere. Thirty releases. Here is what shipped."}
```

- `vo` is spoken. **Spell numbers out** ("eighteen seventy-one", "one and a
  half percent") — the TTS reads digits inconsistently.
- `caption` is burnt in at the bottom. Keep it under ~22 characters for the
  large size; longer drops to a smaller face and wraps.
- Budget roughly **2.6 words per second**. Ten segments of 15-25 words lands
  around 85s.

Source the content from `lib/releases.ts` (`{date, headline, items[]}`) and
pick the strongest 7-10 entries.

> **Check every number against the screenshot, not the release note.** Two
> claims in the first 2026-09 draft were wrong and only the captured page
> caught them: "half are gone within forty years" (the page says **14**) and
> "the market beat us by 1.5%" (true when the note was written; the live
> Ledger had since drifted to **1.75%**). Release notes go stale and get
> truncated in extraction — the rendered page is the source of truth.

## Credentials

`ELEVENLABS_API_KEY` from the environment, else read from `~/.claude.json`
(`mcpServers.elevenlabs.env`). It must be the **`sk_` secret**, not the key ID
that the dashboard keeps showing you — the ID is what gets pasted by mistake,
and the API rejects it with `api_key_id_used_as_api_key`.

Scopes: **Text to Speech** + **Voices** for narration, plus **Music** for the
bed. Nothing else is touched.

A running stdio MCP server holds the env it launched with, so editing
`~/.claude.json` does not affect the ElevenLabs *MCP tool* until the connection
restarts. This script reads the file directly and is always current, which is
why it works when the tool does not.

## Environment notes

These are all measured on the mini, and each one cost time to discover:

- **Chrome headless, not Playwright.** Playwright is not installed; an
  `npx --no-install playwright --version` that prints a version is reading the
  npx cache. `--window-size=540,960` with `--force-device-scale-factor=2`
  yields exactly 1080x1920, so nothing is ever rescaled.
- **Captions are PNG overlays.** This ffmpeg build has neither `drawtext` nor
  `subtitles` (no libfreetype), so text is rendered with Pillow and composited
  via `overlay`. Check `ffmpeg -filters` before assuming otherwise.
- **The Ken Burns zoom is 1.03, not 1.10.** A 10% push crops ~5% off each edge,
  which clips words on text-dense page captures.
- **The final encode sets `+faststart`.** Without it `moov` lands after `mdat`
  and nothing plays until the whole file has downloaded — the single most
  important mobile setting here.
- **Higgsfield does not do the music here.** Its `generate_audio` refuses
  general music and its `video_to_music` needs the finished video uploaded
  first; the original 2026-08 reel used the latter. This script uses
  ElevenLabs' music endpoint instead.
