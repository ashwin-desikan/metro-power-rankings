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
python3 scripts/reel/build_reel.py captions --script ...
python3 scripts/reel/build_reel.py music    --script ...   # COSTS (ElevenLabs)
python3 scripts/reel/build_reel.py assemble --script ...
```

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
