#!/usr/bin/env python3
"""
Build the Site Activity feed (public/data/activity-feed.json) from git history.

Why git history: every mini job commits when it refreshes data, every manual hub
edit is a commit, and every new hub is a new app/<route>/page.tsx. So the commit
log already IS the changelog — this turns it into a clean, one-sentence-per-line
public feed, with no new logging discipline to maintain.

Complements /updates (lib/releases.ts), which is a *curated* release log and
deliberately omits data refreshes and small edits. This feed is the granular layer.

Rules (see constants below):
  - Only commits touching site-visible paths (app/, public/data/, lib/, components/).
  - Category: new-hub | data | hub | fix.
  - Same-day DATA refreshes collapse into ONE line ("Data refreshed — football, cricket").
  - One-sentence text = a `Feed:` commit trailer if present, else the cleaned subject.
  - `[no-feed]` in a commit message suppresses it. Its own chore(activity) commits are skipped.

Usage:  python3 scripts/build-activity-feed.py [--limit N] [--print]
Run from the repo root.
"""
from __future__ import annotations
import json, re, subprocess, sys, os
from collections import OrderedDict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "public", "data", "activity-feed.json")
MAX_ENTRIES = 600  # plenty for an archive page; keeps the JSON small

# --- what counts as a site-visible change ---
SITE_PREFIXES = ("app/", "public/data/", "lib/", "components/")
# a change touching ONLY these is internal plumbing, never user-facing
INTERNAL_ONLY = ("scripts/", "mac-mini-jobs/", "internal/", ".github/", ".claude/")

# commits we never surface (matched against the subject, case-insensitive)
SKIP_SUBJECT = re.compile(
    r"^(chore\(activity\)|docs?\(|handoff|runbook|pipeline:|merge\b)", re.I
)

# The grouped daily DATA line names clean, recognizable TOPICS (never raw data-dir
# slugs). A rule mapping to None DROPS that source from the feed (internal snapshots,
# tiny banner metadata). Rules match either a data-dir name or the commit subject.
DROP = "__drop__"
TOPIC_RULES = [
    (r"substack|feed-snapshot|^audience$|^details$|^_", DROP),  # internal
    (r"champions|honours|gold-standard|country-orgs|country-facts|country-indicators", DROP),
    (r"wnba|\bnba\b|fiba|basketball|^cbb", "Basketball"),
    (r"uefa|champions.?league|club.competition|^football|live.bundles|standings|women|^international", "Football"),
    (r"cricket|\bipl\b", "Cricket"),
    (r"\bf1\b|formula", "F1"),
    (r"\bafl\b", "AFL"),
    (r"\bcfl\b", "Canadian football"), (r"\bcfb\b|college.football", "College football"),
    (r"\bnfl\b", "NFL"),
    (r"rugby", "Rugby"), (r"hockey", "Hockey"), (r"baseball", "Baseball"),
    (r"handball", "Handball"), (r"majors|tennis", "Tennis"),
    (r"sound.of.the.metros|^sound", "Sound of the Metros"),
    (r"number.?ones|^screen|box.office|film", "Screen of the Metros"),
    (r"leader|mayor|governor", "Leaders"),
    (r"election", "Elections"), (r"conflict", "Conflicts"),
    (r"billionaire", "Billionaires"),
    (r"population|citypopulation|conurbation|boundaries|neighborhood", "Populations"),
    (r"^countries$|country-", "Countries"),
    (r"corporate-power|finance-capital|culture-capital|gateway|capital\.csv|power-atlas", "Power Atlas"),
]
# marquee-first ordering for the grouped line
TOPIC_ORDER = ["Football", "Basketball", "Cricket", "F1", "Elections", "Leaders",
               "Sound of the Metros", "Screen of the Metros", "Conflicts",
               "Billionaires", "Countries", "Populations", "Power Atlas", "Tennis",
               "Rugby", "Hockey", "Baseball", "AFL", "NFL", "College football",
               "Canadian football", "Handball"]

def match_topic(text: str):
    """Return a clean topic, DROP, or None (no match) for a dir name or subject."""
    low = text.lower()
    for pat, topic in TOPIC_RULES:
        if re.search(pat, low):
            return topic
    return None

# app/<route> -> friendly hub name (fallback: titleized slug)
HUB_NAMES = {
    "billionaires": "Billionaires", "conflicts": "Conflicts", "countries": "Countries",
    "elections": "Elections", "governors": "Governors", "mayors": "Mayors",
    "leaders": "Leaders", "sound": "Sound of the Metros", "screen": "Screen of the Metros",
    "sports": "Sports", "power-atlas": "Power Atlas", "deep-dives": "Deep Dives",
    "neighborhoods": "Neighborhoods", "orgs": "Organizations", "teams": "Teams",
    "rankings": "Rankings", "geography": "Geography", "states": "States",
    "uk-political-leadership": "UK Political Leadership", "matchups": "Matchups",
    "compare": "Compare", "top-teams": "Top Teams", "teams": "Club Football",
    "us-political-leadership": "US Political Leadership", "power": "Power Rankings",
    "activity": "Site Activity", "updates": "Release Notes",
}

def sh(args):
    return subprocess.run(args, cwd=REPO, capture_output=True, text=True, check=True).stdout

def titleize(slug: str) -> str:
    return HUB_NAMES.get(slug, slug.replace("-", " ").title())

def clean_subject(subject: str) -> str:
    s = re.sub(r"\s*\[vercel skip\]\s*$", "", subject).strip()
    s = re.sub(r"\s*\[no-feed\]\s*", "", s, flags=re.I).strip()
    # strip a leading "word:" or "word(scope):" conventional prefix
    s = re.sub(r"^[a-z0-9][\w.-]*(\([^)]*\))?:\s*", "", s)
    if s:
        s = s[0].upper() + s[1:]
    s = s.rstrip(". ").strip()
    return s + "." if s else s

def first_sentence(text: str, cap: int = 140) -> str:
    # keep it to one sentence / a hard cap so the feed stays scannable
    m = re.search(r"^(.*?[.!?])(\s|$)", text)
    s = m.group(1) if m else text
    if len(s) > cap:
        s = s[: cap - 1].rstrip() + "…"
    return s

def commit_topics(subject: str, data_dirs: list[str]) -> list[str]:
    """Clean topics for a data commit, from its changed data dirs (+ subject).
    Silently drops internal snapshots; unmapped sources are dropped too so the
    feed never shows a cryptic slug."""
    topics = []
    for src in data_dirs + [subject]:
        t = match_topic(src)
        if t and t != DROP and t not in topics:
            topics.append(t)
    return topics

def feed_trailer(body: str) -> str | None:
    m = re.search(r"^Feed:\s*(.+)$", body, re.M)
    return m.group(1).strip() if m else None

def top_data_dirs(files: list[str]) -> list[str]:
    dirs = []
    for f in files:
        if f.startswith("public/data/"):
            rest = f[len("public/data/"):]
            top = rest.split("/")[0]
            top = re.sub(r"\.(json|csv|js|ts)$", "", top)  # file-level datum
            if top and top not in dirs:
                dirs.append(top)
    return dirs

def app_routes(files: list[str]) -> list[str]:
    routes = []
    for f in files:
        m = re.match(r"app/([^/]+)/", f)
        if m and m.group(1) not in routes:
            # ignore framework/route-group folders
            if not m.group(1).startswith(("_", "(")):
                routes.append(m.group(1))
    return routes

def main():
    limit = None
    do_print = "--print" in sys.argv
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    # commits that ADDED a top-level hub page => "new hub" born there
    born = {}  # hash -> route
    add_log = sh(["git", "log", "--diff-filter=A", "--pretty=%H", "--name-only",
                  "--", "app/*/page.tsx"])
    cur = None
    for line in add_log.splitlines():
        if re.fullmatch(r"[0-9a-f]{7,40}", line):
            cur = line
        else:
            m = re.fullmatch(r"app/([^/]+)/page\.tsx", line)
            if m and cur:
                born.setdefault(cur, m.group(1))

    # Full log, newest first. Records are separated by \x1e; within a record the
    # fields are \x1f-separated: H, isodate, subject, body, then the --name-only
    # file list. A trailing \x1f after %b is what lets the (multi-line) body be
    # split cleanly from the file list — without it, later body lines leak into
    # the file list and Feed: trailers are lost.
    raw = sh(["git", "log", "--no-merges", "--date=short",
              "--pretty=format:%x1e%H%x1f%ad%x1f%s%x1f%b%x1f", "--name-only"])
    commits = []
    for rec in raw.split("\x1e"):
        if not rec.strip():
            continue
        fields = rec.split("\x1f")
        if len(fields) < 5:
            continue
        h, date, subject, body, fileblock = (
            fields[0].strip(), fields[1].strip(), fields[2], fields[3], fields[4])
        files = [ln for ln in fileblock.splitlines() if ln.strip()]
        commits.append((h, date, subject, body, files))

    entries = []
    for h, date, subject, body, files in commits:
        if "[no-feed]" in (subject + body).lower():
            continue
        if SKIP_SUBJECT.search(subject):
            continue
        site = [f for f in files if f.startswith(SITE_PREFIXES)]
        if not site:
            continue  # touched nothing user-facing

        touched_app = any(f.startswith(("app/", "components/", "lib/")) for f in site)
        data_dirs = top_data_dirs(site)
        trailer = feed_trailer(body)

        if h in born:
            route = born[h]
            text = trailer or f"New hub: {titleize(route)}."
            entries.append({"date": date, "category": "new-hub",
                            "hub": titleize(route), "text": first_sentence(text),
                            "commit": h[:9]})
            continue

        data_only = bool(data_dirs) and not touched_app
        if data_only:
            topics = commit_topics(subject, data_dirs)
            if not topics:
                continue  # all sources were internal/unmapped -> not feed-worthy
            entries.append({"date": date, "category": "data",
                            "topics": topics, "commit": h[:9]})
            continue

        routes = app_routes(site)
        hub = titleize(routes[0]) if routes else None
        cat = "fix" if re.search(r"\bfix(es|ed)?\b", subject, re.I) else "hub"
        text = trailer or clean_subject(subject)
        if not text:
            continue
        entries.append({"date": date, "category": cat, "hub": hub,
                        "text": first_sentence(text), "commit": h[:9]})

    # collapse same-day DATA entries into one grouped line of clean topics
    grouped = []
    seen_data_day = OrderedDict()  # date -> {"topics":set, "commit":first}
    for e in entries:
        if e["category"] == "data":
            slot = seen_data_day.setdefault(e["date"], {"topics": [], "commit": e["commit"]})
            for t in e["topics"]:
                if t not in slot["topics"]:
                    slot["topics"].append(t)
        else:
            grouped.append(e)
    for date, slot in seen_data_day.items():
        topics = sorted(slot["topics"],
                        key=lambda t: (TOPIC_ORDER.index(t) if t in TOPIC_ORDER else 99, t))
        shown = topics[:4]
        more = len(topics) - len(shown)
        tail = ", ".join(shown) + (f", and {more} more" if more > 0 else "")
        grouped.append({"date": date, "category": "data", "hub": None,
                        "text": f"Data refreshed — {tail}.", "commit": slot["commit"]})

    # newest first (git gave newest-first; stable re-sort by date desc, keep order within day)
    order = {e["commit"]: i for i, e in enumerate(entries)}
    grouped.sort(key=lambda e: (e["date"], -order.get(e["commit"], 0)), reverse=True)

    if limit:
        grouped = grouped[:limit]
    grouped = grouped[:MAX_ENTRIES]

    payload = {"generatedAt": sh(["git", "log", "-1", "--date=short",
                                  "--pretty=%ad"]).strip(),
               "count": len(grouped), "entries": grouped}
    if do_print:
        for e in grouped[:60]:
            hub = f" [{e['hub']}]" if e.get("hub") else ""
            print(f"{e['date']}  {e['category']:8}{hub}  {e['text']}")
        print(f"\n({len(grouped)} entries total)")
    else:
        with open(OUT, "w") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        print(f"wrote {OUT}  ({len(grouped)} entries)")

if __name__ == "__main__":
    main()
