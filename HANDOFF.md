# Mac mini ↔ Windows Claude — Handoff Log

Shared async channel between the two Claude Code instances working for Ashwin
(one on the Windows box, one on the Mac mini). Not real-time — each reads this
when invoked. **Protocol:**

1. **Before editing:** `git pull --ff-only` on `main` of this repo (github.com/ashwin-desikan/metro-power-rankings).
2. **Append** a new entry under a dated `## YYYY-MM-DD — <from> → <to>` heading. Don't rewrite others' entries; add yours below.
3. **After editing:** commit with `[vercel skip]` in the message, then push. (Site is unaffected — ISR reads only `public/data`.)
4. Keep the **most recent open questions** near the bottom so they're easy to find.

> Note: the mini's weekly egress-refresh does `git merge --ff-only origin/main` before its own commits, so keep history linear — always pull --ff-only before you push here.

---

## 2026-07-02 — mini → windows (status)

**Newsletter-podcast migration — done & live on the mini:**
- Daily digest auto-publishing to Spotify; Jun 30 & Jul 1 episodes both reached READY. Daily is fully off Windows.
- Weekly Metro Power Rankings track built & validated — test run produced a real episode *"The Nowhere 100"* (echo voice, blueprint cover), waiting for **manual upload** to Spotify for Creators. The ledger had a gap after Jun 17, so that post was an unnarrated catch-up from the Windows-breakage weeks. Weekly runs Sun 09:00.
- Watchdog hardened: verifies the episode actually reached READY on Spotify (not just that local audio built), and alerts via **ntfy** — the Claude Gmail connector on the mini can only *draft*, not send, so email-based alerting doesn't work headlessly here.

**Metro mini-jobs bundle — set up & live:**
- Feed-shape monitor: daily 08:20, exits clean. The ATP scoreboard "missing competitions" flag was a false alarm — tennis nests matches under `events[].groupings[].competitions` (per `lib/tennisDraw.ts`), unlike soccer/golf; added a tennis-specific validator.
- Egress refresh: Sunday 10:00, `DRY_RUN=0`. Deploy key + clone + venv (requests/openpyxl) all set. Added a per-step `timeout` wrapper (macOS has no `timeout` binary) so an upstream outage can't hang the unattended job.
- Not yet fully validated: Wikidata Query Service was in an active outage (1 req/min throttle) on 2026-07-01, so the `mayors` SPARQL step couldn't complete. First real run is Sunday 10:00; defensive design (abort-without-writing) means worst case is a clean skip, never bad data.
- Ashwin has disabled the overlapping GitHub Actions (`civic-data-refresh`, `leaders-refresh`, `billionaires-refresh`) and subscribed to the alerts topic.

**Schedule in use on the mini (no collisions):** 08:00 daily digest · 08:20 feed monitor · Sun 09:00 weekly · 09:30 watchdog · Sun 10:00 egress refresh.

### Open questions for Windows Claude
1. Is the Windows `Metro Power Rankings Weekly` scheduled task disabled now? The mini's weekly is live; leaving Windows on risks double-publishing.
2. Does the Windows watchdog / any Windows job rely on the Gmail connector to *send* email? If so, note it's draft-only in this environment — consider ntfy.
3. Anything you want the mini to take over, verify, or stop doing?

---

<!-- Windows Claude: append your entry below this line -->
