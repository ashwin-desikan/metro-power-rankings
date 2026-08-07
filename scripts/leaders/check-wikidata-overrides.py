#!/usr/bin/env python3
"""
check-wikidata-overrides.py - weekly reconciliation of curated leader overrides.

CURATED_OVERRIDES (in refresh-current-leaders.py) hardcode a country's head of
government because Wikidata is wrong/stale for it. Unlike the validator PINS -
which fail LOUD (a real change makes the scrape disagree and the sanity gate HOLDs
the commit) - an override silently AUTO-APPLIES its value every run. So if a real
leadership change happens in an overridden country, we would keep serving the old
leader and never notice. This check closes that gap.

For each override it compares what Wikidata returns for the head of government NOW
against (a) the name we force and (b) the known-wrong value Wikidata returned when
the override was created (WD_SEEN):

  * WD now == our forced name    -> Wikidata FIXED: override redundant, remove it
    (and we can trust WD for this country again).           [ntfy, low priority]
  * WD now == the known-wrong value -> unchanged; override still needed.  [silent]
  * WD now == anything else      -> Wikidata CHANGED to a NEW value: a possible
    REAL leadership change we are masking (or fresh vandalism). REVIEW. [ntfy, high]

Best-effort monitor: always exits 0, never blocks the weekly job. (india/israel are
PINNED but not overridden, so a real change there is already caught loud by the gate.)
"""
import importlib.util, os, urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RL = os.path.join(REPO, "scripts", "leaders", "refresh-current-leaders.py")

# What Wikidata (wrongly) returned for the head of government when each override was
# created. The check stays silent while WD keeps returning this; it alerts the moment
# WD returns anything else. Keep this in sync with CURATED_OVERRIDES.
WD_SEEN = {
    "saudi-arabia": "Salman bin Abdulaziz Al Saud",  # the King, mislabeled PM
    "bulgaria":     "Kiril Petkov",                  # stale (2021)
    "kuwait":       "Sabah Al-Khalid Al-Sabah",      # stale (left PM role 2022)
}

def _load_rl():
    spec = importlib.util.spec_from_file_location("rl", RL)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m

def _ntfy(title, body, priority="default"):
    topic = os.environ.get("NTFY_TOPIC")
    if not topic:
        print(f"[ntfy skipped: NTFY_TOPIC unset] {title}: {body}"); return
    server = os.environ.get("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
    try:
        req = urllib.request.Request(
            f"{server}/{topic}", data=body.encode("utf-8"),
            headers={"Title": title, "Priority": priority, "Tags": "crown,warning"})
        tok = os.environ.get("NTFY_TOKEN")
        if tok:
            req.add_header("Authorization", f"Bearer {tok}")
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:
        print(f"[ntfy failed: {e}] {title}: {body}")

def main():
    rl = _load_rl()
    slug_iso = rl.load_slug_iso()
    try:
        wd = rl.query_wikidata()
    except Exception as e:
        print(f"wikidata query failed ({e}); skipping override audit (no-op)")
        return
    fixed, changed, unchanged = [], [], []
    for slug, ov in rl.CURATED_OVERRIDES.items():
        forced = rl.bare(ov["name"])
        iso = slug_iso.get(slug)
        info = wd.get(iso, {}) if iso else {}
        wd_now = (info.get("hog") or info.get("hos") or "").strip()
        seen = WD_SEEN.get(slug, "")
        if wd_now and rl.bare(wd_now) == forced:
            fixed.append((slug, wd_now))
        elif (not wd_now) or wd_now == seen:
            unchanged.append(slug)
        else:
            changed.append((slug, seen, wd_now, forced))

    for slug, name in fixed:
        print(f"FIXED   {slug}: Wikidata now returns {name!r} (== our override) -- override redundant, remove it")
    for slug, seen, now, forced in changed:
        print(f"CHANGED {slug}: Wikidata now {now!r} (was {seen!r}; we force {forced!r}) -- POSSIBLE REAL CHANGE, review")
    for slug in unchanged:
        print(f"ok      {slug}: Wikidata still the known-wrong value; override still needed")

    if fixed:
        _ntfy("Leaders: Wikidata caught up - remove override(s)",
              "\n".join(f"{s}: WD now = {n} (matches our override)" for s, n in fixed),
              "default")
    if changed:
        _ntfy("Leaders: Wikidata CHANGED - possible real handover we're masking",
              "\n".join(f"{s}: WD now '{now}' but we force '{f}' - REVIEW: real change or vandalism?"
                        for s, _, now, f in changed),
              "high")
    print(f"override audit: {len(fixed)} fixed, {len(changed)} changed, {len(unchanged)} unchanged")

if __name__ == "__main__":
    main()
