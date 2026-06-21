#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix Gold Standard badges, MLB region, and competition hub links on
/sports/champions after the workbook's competition renames. Run on Windows:
      python scripts/patch-champions-gold.py
ATOMIC + idempotent (two independently-guarded blocks; writes once at the end).
"""
import os, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fp = os.path.join(ROOT, "lib", "championsHub.ts")
s = io.open(fp, encoding="utf-8").read()
orig = s
def repl(old, new, label):
    global s
    if s.count(old) != 1:
        raise SystemExit(f"ABORT [{label}]: expected 1 anchor, found {s.count(old)}. No write.")
    s = s.replace(old, new)

# Block A: MLB rename fixes + F1/golf/tennis apexes + their hub links
if "World Drivers' Championship" in s:
    print("skip block A (MLB/F1/golf/tennis already applied)")
else:
    repl('  "World Series": "United States",', '  "MLB": "United States",', "COMP_GEO MLB")
    repl('  "World Series": ["/teams/mlb", "MLB"],', '  "MLB": ["/teams/mlb", "MLB"],', "DIRECT_HUB MLB")
    repl('  "NFL",\n  "World Series",\n  "NBA",', '  "NFL",\n  "NBA",', "GOLD drop World Series")
    repl(
        '  "Rugby World Cup",\n  "Cricket World Cup",\n]);',
        '  "Rugby World Cup",\n  "Cricket World Cup",\n'
        '  // Baseball apex + individual-sport apexes (2026-06-21)\n'
        '  "MLB",\n  "World Drivers\' Championship",\n'
        '  "Masters Tournament",\n  "PGA Championship",\n  "US Open Championship",\n  "The Open Championship",\n'
        '  "Australian Open Men\'s",\n  "Australian Open Women\'s",\n  "French Open Men\'s",\n  "French Open Women\'s",\n'
        '  "Wimbledon Men\'s",\n  "Wimbledon Women\'s",\n  "US Open Men\'s",\n  "US Open Women\'s",\n]);',
        "GOLD additions")
    repl(
        '    default:\n      return { href: null, label: c.competition };',
        '    case "F1":\n      return { href: "/teams/f1", label: "Formula 1" };\n'
        '    case "Golf":\n      return { href: "/teams/golf", label: "Golf" };\n'
        '    case "Tennis":\n      return { href: "/teams/tennis", label: "Tennis" };\n'
        '    default:\n      return { href: null, label: c.competition };',
        "leagueHub F1/Golf/Tennis")

# Block B: Olympics apex (independent guard so it applies even if Block A ran earlier)
if '"Summer Olympics Top Medalist"' in s:
    print("skip block B (Olympics already applied)")
else:
    repl('  "US Open Women\'s",\n]);',
         '  "US Open Women\'s",\n  "Summer Olympics Top Medalist",\n  "Winter Olympics Top Medalist",\n]);',
         "GOLD Olympics")
    repl('    case "F1":\n      return { href: "/teams/f1", label: "Formula 1" };',
         '    case "Olympics":\n      return { href: "/teams/olympics", label: "Olympics" };\n'
         '    case "F1":\n      return { href: "/teams/f1", label: "Formula 1" };',
         "leagueHub Olympics")

if s != orig:
    io.open(fp, "w", encoding="utf-8", newline="\n").write(s)
    print("PATCH OK: championsHub.ts updated")
else:
    print("nothing to do (all applied)")
