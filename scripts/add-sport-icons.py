#!/usr/bin/env python3
r"""
Sport icons on every metro team card (and defunct/relocated cards).
Adds sportIcon()/leagueIcon() to lib/sportLabels.ts and renders the icon in
front of the sport label on app/rankings/[slug]/page.tsx team cards. Women's
("W ...") variants reuse the base sport's icon.

Run from repo root:  python scripts/add-sport-icons.py
Idempotent; anchor-asserted. Optional argv[1] = repo base dir (for testing).
"""
import os, sys, shutil

BASE = sys.argv[1] if len(sys.argv) > 1 else "."
LABELS = os.path.join(BASE, "lib", "sportLabels.ts")
PAGE = os.path.join(BASE, "app", "rankings", "[slug]", "page.tsx")

LABELS_EDIT = (
    'export function uniqueDisplaySports(rawSports: Iterable<string>): string[] {\n'
    '  const set = new Set<string>();\n'
    '  for (const s of rawSports) {\n'
    '    if (s) set.add(normalizeSport(s));\n'
    '  }\n'
    '  return Array.from(set).sort((a, b) => a.localeCompare(b));\n'
    '}',
    'export function uniqueDisplaySports(rawSports: Iterable<string>): string[] {\n'
    '  const set = new Set<string>();\n'
    '  for (const s of rawSports) {\n'
    '    if (s) set.add(normalizeSport(s));\n'
    '  }\n'
    '  return Array.from(set).sort((a, b) => a.localeCompare(b));\n'
    '}\n'
    '\n'
    '// Emoji icon per sport for team-card meta lines. Women\'s ("W ...") variants\n'
    '// reuse the base sport. Returns "" when there is no good match.\n'
    'const SPORT_ICONS: Record<string, string> = {\n'
    '  "Basketball": "\U0001F3C0", "Hockey": "\U0001F3D2", "American Football": "\U0001F3C8",\n'
    '  "Canadian Football": "\U0001F3C8", "Baseball": "⚾", "Football": "⚽", "Soccer": "⚽",\n'
    '  "Rugby Union": "\U0001F3C9", "Rugby League": "\U0001F3C9", "Rugby": "\U0001F3C9",\n'
    '  "Aussie Rules": "\U0001F998", "T20 Cricket": "\U0001F3CF", "Test Cricket": "\U0001F3CF", "Cricket": "\U0001F3CF",\n'
    '  "Volleyball": "\U0001F3D0", "Auto Racing": "\U0001F3CE️", "Motor Racing": "\U0001F3CE️", "Speedway": "\U0001F3C1",\n'
    '  "Powerboat Racing": "\U0001F6A4", "Handball": "\U0001F93E", "Golf": "⛳", "Field Hockey": "\U0001F3D1",\n'
    '  "Tennis": "\U0001F3BE", "Table Tennis": "\U0001F3D3", "Badminton": "\U0001F3F8",\n'
    '  "Athletics": "\U0001F3C3", "Olympics/Athletics": "\U0001F3C3", "Track & Field": "\U0001F3C3",\n'
    '  "Horse Racing": "\U0001F407", "Lacrosse": "\U0001F94D", "Combat Sports": "\U0001F94A",\n'
    '  "Wrestling": "\U0001F93C", "Sailing": "⛵", "Surfing": "\U0001F3C4", "Esports": "\U0001F3AE",\n'
    '  "Swimming": "\U0001F3CA", "Cycling": "\U0001F6B4", "Skiing": "⛷️", "Softball": "\U0001F94E",\n'
    '  "Gymnastics": "\U0001F938", "Water Polo": "\U0001F93D",\n'
    '  // No natural emoji; closest-guess (pending review):\n'
    '  "Netball": "\U0001F3D0", "Kabaddi": "\U0001F93C", "Irish Sports": "☘️",\n'
    '  "Japanese Sports": "\U0001F94B", "Rifle": "\U0001F3AF", "Hall of Fame": "\U0001F3C6",\n'
    '};\n'
    'export function sportIcon(sport: string | undefined): string {\n'
    '  if (!sport) return "";\n'
    '  let s = sport.trim();\n'
    '  if (s.startsWith("W ")) s = s.slice(2).trim();\n'
    '  if (s === "Soccer" || s === "Football") return "⚽";\n'
    '  return SPORT_ICONS[s] ?? "";\n'
    '}\n'
    '\n'
    '// Icon for a league code (used by defunct/relocated cards keyed on league).\n'
    'export function leagueIcon(league: string | undefined): string {\n'
    '  switch ((league || "").toLowerCase()) {\n'
    '    case "nfl": case "cfl": case "cfb": return "\U0001F3C8";\n'
    '    case "nba": case "wnba": return "\U0001F3C0";\n'
    '    case "nhl": return "\U0001F3D2";\n'
    '    case "mlb": return "⚾";\n'
    '    case "afl": return "\U0001F998";\n'
    '    case "nrl": return "\U0001F3C9";\n'
    '    case "football": case "mls": return "⚽";\n'
    '    default: return "";\n'
    '  }\n'
    '}',
)

PAGE_EDITS = [
    (
        'import { normalizeSport } from "@/lib/sportLabels";',
        'import { normalizeSport, sportIcon, leagueIcon } from "@/lib/sportLabels";',
    ),
    # main team-card meta line: icon for every sport (replaces the CFB-only football icon)
    (
        '        {cfbTeam && <span aria-hidden className="mr-1">\U0001F3C8</span>}',
        '        {sportIcon(team.sport) && <span aria-hidden className="mr-1">{sportIcon(team.sport)}</span>}',
    ),
    # defunct/relocated card meta line: league icon
    (
        '                        {r.sport}{[r.relocated ? "Relocated" : null, r.defunct ? "Defunct" : null].filter(Boolean).map((t) => " \\u2022 " + t).join("")}',
        '                        {leagueIcon(r.league) ? <span aria-hidden className="mr-1">{leagueIcon(r.league)}</span> : null}{r.sport}{[r.relocated ? "Relocated" : null, r.defunct ? "Defunct" : null].filter(Boolean).map((t) => " \\u2022 " + t).join("")}',
    ),
]

def patch(path, edits, marker):
    if not os.path.isfile(path):
        print("ABORTED: missing " + path); raise SystemExit(1)
    s = open(path, encoding="utf-8").read()
    if marker in s:
        print("Already patched: " + path); return
    for i,(old, new) in enumerate(edits,1):
        n = s.count(old)
        if n != 1:
            print("ABORTED %s edit %d: anchor matched %d times (expected 1):\n%s" % (path, i, n, old[:140])); raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(path, path + ".sporticons.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + path)

RELEASES = os.path.join(BASE, "lib", "releases.ts")
RELEASE_EDIT = (
    '      "Metro pages now list former major programs (no longer FBS or FCS) in the Defunct Teams section, and pre-1900 games finally show their dates.",',
    '      "Metro team cards now carry a per-sport icon; metro pages list former major programs (no longer FBS or FCS) under Defunct Teams; pre-1900 games show dates.",',
)

def soft_patch(path, edit, marker):
    if not os.path.isfile(path):
        print("SKIP (missing): " + path); return
    s = open(path, encoding="utf-8").read()
    if marker in s:
        print("Already amended: " + path); return
    old, new = edit
    if s.count(old) != 1:
        print("SKIP release note (anchor not found once in %s); add the icon mention by hand if you like." % path); return
    s = s.replace(old, new, 1)
    shutil.copyfile(path, path + ".sporticons.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(s)
    print("Amended " + path)

def main():
    patch(LABELS, [LABELS_EDIT], "export function sportIcon(")
    patch(PAGE, PAGE_EDITS, "sportIcon(team.sport)")

if __name__ == "__main__":
    main()
