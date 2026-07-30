# Mac mini — Rebuild Runbook

How to rebuild the mini's automation from scratch (e.g. after an SSD failure or a
fresh macOS install). **The durable data is already safe in the cloud** — git
(`public/data/**`) and Supabase (project `nmprqkmymrdknffwnuur`). This runbook
restores the *worker*: the scheduler, scripts, venv, and credentials. Budget ~30 min.

> What is NOT in git and must be restored from backup / re-issued:
> - **Secrets** (see §5) — never committed. Re-paste each.
> - **`~/newsletter-podcast/`** — the newsletter pipeline (its own `SETUP.md` lives inside it). Not in this repo; keep a separate backup (the original zip).
> - **Auth tokens** — Claude login, `save-to-spotify` token, the SSH deploy key.

---

## What the mini runs (19 launchd agents)

| Agent | Wrapper | Schedule (local) |
|---|---|---|
| com.newsletter.daily | ~/newsletter-podcast/run-daily.sh | 08:00 daily |
| com.newsletter.weekly | ~/newsletter-podcast/run-weekly.sh | Sun 09:00 |
| com.newsletter.watchdog | ~/newsletter-podcast/watchdog.sh | 09:30 daily |
| com.newsletter.retention | ~/newsletter-podcast/retention-spotify.sh | 12:00 daily |
| com.citizenofnowhere.substack-daily | run-scraper-refresh.sh substack | 07:00 daily |
| com.citizenofnowhere.rugby-weekly | run-scraper-refresh.sh rugby | Tue 08:05 |
| com.citizenofnowhere.fiba-weekly | run-scraper-refresh.sh fiba | Wed 08:10 |
| com.citizenofnowhere.conflicts-monthly | run-scraper-refresh.sh conflicts | 1st @ 08:15 |
| com.citizenofnowhere.feed-monitor | feed_shape_monitor.py | 08:20 daily |
| com.citizenofnowhere.sound-weekly | run-sound-weekly.sh | Wed 08:30 |
| com.citizenofnowhere.egress-refresh | metro-mini-refresh.sh | Sun 10:00 |
| com.citizenofnowhere.cricket-weekly | run-cricket-weekly.sh | Tue 10:00 |
| com.citizenofnowhere.cricket-monthly | run-cricket-monthly.sh | 1st @ 11:00 |
| com.citizenofnowhere.screen-number-ones | mac-mini-jobs/run-screen-number-ones.sh (repo) | Tue 14:00 |
| com.citizenofnowhere.euro-comps | run-euro-comps.sh | 04:00 daily |
| com.citizenofnowhere.football-standings | mac-mini-jobs/run-football-standings.sh (repo) | 05:00 UTC daily |
| com.citizenofnowhere.gap-league-watch | mac-mini-jobs/run-gap-league-watch.sh (repo) | 05:00 UTC daily |
| com.citizenofnowhere.f1-weekly | run-f1-weekly.sh | hourly (round-gated; syncs ~1h post-race) |
| com.citizenofnowhere.heartbeat | run-heartbeat.sh | every 15 min |

Most jobs run their wrapper from `~/metro-mini-jobs/`, where each `run-*.sh` is a
**symlink to the repo copy** in `mac-mini-jobs/` (so the live copy can never drift
from canonical — see §7). The three newer jobs (**football-standings**,
**gap-league-watch**, **screen-number-ones**) run the repo copy directly from their
plist (no symlink needed). The `newsletter` agents come from `~/newsletter-podcast/` (see
its `SETUP.md`). Every scheduled job also reports to healthchecks.io via `hc-run.sh`
(slug = the agent's short name), except `heartbeat` which pings the `mac-mini` check.

---

## 1. Toolchain
Follow `~/newsletter-podcast/SETUP.md` Phase 2, or in short:
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
brew install ffmpeg python node
npm install -g @anthropic-ai/claude-code
# save-to-spotify CLI:
curl -fsSL https://saveto.spotify.com/install.sh | bash -s -- --dir ~/.local/bin
ln -sf "$HOME/.local/bin/save-to-spotify" /opt/homebrew/bin/save-to-spotify
```

## 2. System settings (always-on)
Timezone `Europe/London`; `sudo pmset -a sleep 0 disksleep 0 autorestart 1`;
FileVault **OFF**; Users & Groups → auto-login. (Details in newsletter `SETUP.md` Phase 1.)

## 3. Repo clone + push access (SSH deploy key)
```
ssh-keygen -t ed25519 -N "" -C "metro-mini-deploy" -f ~/.ssh/metro_deploy_ed25519
# add the .pub as a Deploy Key WITH WRITE ACCESS on github.com/ashwin-desikan/metro-power-rankings
cat >> ~/.ssh/config <<'CFG'
Host github-metro
    HostName github.com
    User git
    IdentityFile ~/.ssh/metro_deploy_ed25519
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
CFG
git clone git@github-metro:ashwin-desikan/metro-power-rankings.git "$HOME/Projects/Metro Area Project"
# `internal/` is gitignored so it never arrives with a clone, but the Zone Zero Cup
# step writes internal/zzc-v1-output.md and dies with FileNotFoundError without it:
mkdir -p "$HOME/Projects/Metro Area Project/internal"
```

## 4. Python venv (pinned)
```
cd "$HOME/Projects/Metro Area Project"
python3 -m venv .venv
./.venv/bin/pip install -r mac-mini-jobs/metro-venv-requirements.txt
```

## 5. Credentials (re-paste each — none are in git)
`~/.config/newsletter-podcast/env` (chmod 600): `OPENAI_API_KEY`, `NTFY_TOPIC` (newsletter's ntfy topic).
`~/.config/metro-supabase/env` (chmod 600):
- `SUPABASE_URL=https://nmprqkmymrdknffwnuur.supabase.co`
- `SUPABASE_SERVICE_KEY` — Supabase dashboard → Settings → API → `sb_secret_…` (bypasses RLS)
- `NTFY_TOPIC` — the Metro-jobs ntfy topic (subscribe on phone to receive alerts)
- `APISPORTS_KEY` — api-sports.io dashboard (`x-apisports-key`)
- `HEALTHCHECK_URL` — healthchecks.io "mac-mini" check ping URL (dead-man's switch)

`~/.config/mini-hc.env` (chmod 600) — per-job health dashboard (via `hc-run.sh`):
- `HC_PING_KEY` — healthchecks.io project Ping Key (each job pings `hc-ping.com/<key>/<slug>`)
- `HC_API_KEY` — healthchecks.io Management API key (only needed to create/retune checks, not for pings)

Also: run `claude` once to log in; `save-to-spotify auth login` once. Cricket/F1/WC
need nothing else (Supabase is already seeded).

## 6. F1 Data folder
```
mkdir -p "$HOME/Projects/F1 Data/data/_incoming"
cp mac-mini-jobs/f1-data/*.py mac-mini-jobs/f1-data/schedule_2026.csv "$HOME/Projects/F1 Data/"
mv "$HOME/Projects/F1 Data/schedule_2026.csv" "$HOME/Projects/F1 Data/data/"
```
(No CSVs needed — Supabase is the F1 source of truth.)

## 7. Wrappers + launchd agents
```
REPO="$HOME/Projects/Metro Area Project"
mkdir -p "$HOME/metro-mini-jobs/logs"
# Helpers (hc-run.sh, notify.py, feed_shape_monitor.py, config example) are copied.
cp "$REPO"/mac-mini-jobs/hc-run.sh "$REPO"/mac-mini-jobs/*.py "$REPO"/mac-mini-jobs/config.env.example "$HOME/metro-mini-jobs/"
cp "$HOME/metro-mini-jobs/config.env.example" "$HOME/metro-mini-jobs/config.env"   # set NTFY_TOPIC, LOG_DIR
# Wrappers are SYMLINKED to the repo copies, NOT copied. A copy can silently drift
# from canonical (this bit us repeatedly in 2026-07: rugby-results, cabinet/forecast,
# etc. edited in the repo but never re-copied, so they never ran). A symlink makes a
# repo edit instantly live. $DIR-relative deps (config.env, notify.py) still resolve
# because $DIR = the symlink's own dir (~/metro-mini-jobs), not the link target.
for w in metro-mini-refresh run-cricket-weekly run-cricket-monthly run-f1-weekly \
         run-sound-weekly run-scraper-refresh run-euro-comps run-heartbeat; do
  ln -sf "$REPO/mac-mini-jobs/$w.sh" "$HOME/metro-mini-jobs/$w.sh"
done
chmod +x "$REPO"/mac-mini-jobs/*.sh "$HOME/metro-mini-jobs/hc-run.sh" "$HOME/metro-mini-jobs/"*.py
# load ALL citizenofnowhere agents (the two apifootball plists run the repo copy directly):
cp "$REPO"/mac-mini-jobs/launchd/com.citizenofnowhere.*.plist "$HOME/Library/LaunchAgents/"
for p in "$HOME/Library/LaunchAgents/com.citizenofnowhere."*.plist; do
  launchctl bootstrap gui/$(id -u) "$p"
done
```
For the `com.newsletter.*` agents, follow `~/newsletter-podcast/SETUP.md` Phase 5.

**Healthchecks tiles:** each job pings a check named by its slug. On a rebuild, either
restore the checks from the healthchecks.io project or recreate them via the Management
API (`HC_API_KEY`) — one per agent slug above (+ `mac-mini` for the heartbeat).

## 8. Smoke test each
```
DRY_RUN=1 bash ~/metro-mini-jobs/run-cricket-weekly.sh
DRY_RUN=1 bash ~/metro-mini-jobs/run-f1-weekly.sh
DRY_RUN=1 bash ~/metro-mini-jobs/run-wc2026-daily.sh
bash ~/metro-mini-jobs/run-heartbeat.sh   # then check the healthchecks check goes green
```

---

## Notes
- **Timezone matters** — every schedule above is mini-local; verify TZ before trusting cron slots.
- **The dead-man's switch** (`heartbeat`) is what tells you the mini itself is down; make sure its healthchecks notification channel reaches you.
- **One-runner rule** — the GitHub Actions `civic-data-refresh`, `f1-refresh`, `wc2026-daily` crons are disabled in-file because the mini owns those. If you ever retire the mini, re-enable them.
- **Coordination log** — cross-machine decisions live in `HANDOFF.md` at the repo root.

## Retired agents
`mac-mini-jobs/retired/` holds wrappers + plists for jobs whose event is over, kept for
reference but NOT loaded by §7 (the bootstrap glob only reads `launchd/`). Do not re-load
them without a reason.
- **wc2026-daily** — retired 2026-07-29, ~10 days after the World Cup 2026 final (2026-07-19).
  Its GitHub Action cron stays disabled; the WC data files remain committed as the record.
