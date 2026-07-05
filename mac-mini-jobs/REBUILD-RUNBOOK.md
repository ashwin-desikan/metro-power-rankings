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

## What the mini runs (10 launchd agents)

| Agent | Wrapper | Schedule (local) |
|---|---|---|
| com.newsletter.daily | ~/newsletter-podcast/run-daily.sh | 08:00 daily |
| com.citizenofnowhere.feed-monitor | feed_shape_monitor.py | 08:20 daily |
| com.newsletter.weekly | ~/newsletter-podcast/run-weekly.sh | Sun 09:00 |
| com.newsletter.watchdog | ~/newsletter-podcast/watchdog.sh | 09:30 daily |
| com.citizenofnowhere.egress-refresh | metro-mini-refresh.sh | Sun 10:00 |
| com.citizenofnowhere.cricket-weekly | run-cricket-weekly.sh | Tue 10:00 |
| com.citizenofnowhere.cricket-monthly | run-cricket-monthly.sh | 1st @ 11:00 |
| com.citizenofnowhere.f1-weekly | run-f1-weekly.sh | Mon 10:30 |
| com.citizenofnowhere.wc2026-daily | run-wc2026-daily.sh | 07:30 daily |
| com.citizenofnowhere.heartbeat | run-heartbeat.sh | every 15 min |

Wrappers + plists for the `citizenofnowhere` agents live in this folder
(`mac-mini-jobs/` and `mac-mini-jobs/launchd/`). The `newsletter` agents come
from `~/newsletter-podcast/` (see its `SETUP.md`).

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
- `HEALTHCHECK_URL` — healthchecks.io check ping URL (dead-man's switch)

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
mkdir -p "$HOME/metro-mini-jobs/logs"
cp mac-mini-jobs/*.sh mac-mini-jobs/*.py mac-mini-jobs/config.env.example "$HOME/metro-mini-jobs/"
cp "$HOME/metro-mini-jobs/config.env.example" "$HOME/metro-mini-jobs/config.env"   # set NTFY_TOPIC, LOG_DIR
chmod +x "$HOME/metro-mini-jobs/"*.sh "$HOME/metro-mini-jobs/"*.py
# load the citizenofnowhere agents:
cp mac-mini-jobs/launchd/com.citizenofnowhere.*.plist "$HOME/Library/LaunchAgents/"
for p in "$HOME/Library/LaunchAgents/com.citizenofnowhere."*.plist; do
  launchctl bootstrap gui/$(id -u) "$p"
done
```
For the `com.newsletter.*` agents, follow `~/newsletter-podcast/SETUP.md` Phase 5.

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
