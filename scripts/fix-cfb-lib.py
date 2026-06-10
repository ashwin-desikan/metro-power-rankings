#!/usr/bin/env python3
r"""
lib/cfb.ts additions:
  Item #7  getFormerMajorCfbForMetro + FormerCfbCard: programs that were major
           but are now neither FBS nor FCS, grouped by metro (metro Defunct section).
  Req  #2  getCfbNationalChampions + types, reading data.json["national_champions"]
           for the National Champions table on the hub.

Run from repo root:  python scripts/fix-cfb-lib.py  (after the builder rebuild)
Idempotent; anchor-asserted.
"""
import os, sys, shutil

TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join("lib", "cfb.ts")

EDITS = [
    # value import of cfbMonogram (the top re-export is not a usable local binding)
    (
        'import type { CfbTeam, CfbSeason, CfbGame, CfbAward, CfbRivalry } from "./cfbShared";',
        'import type { CfbTeam, CfbSeason, CfbGame, CfbAward, CfbRivalry } from "./cfbShared";\n'
        'import { cfbMonogram as monogram } from "./cfbShared";',
    ),
    # DataFile gains national_champions
    (
        'type DataFile = {\n'
        '  teams: CfbTeam[]; seasons_by_team: Record<string, CfbSeason[]>;\n'
        '  awards_by_team: Record<string, CfbAward[]>; rivalries_by_team: Record<string, CfbRivalry[]>;\n'
        '};',
        'type DataFile = {\n'
        '  teams: CfbTeam[]; seasons_by_team: Record<string, CfbSeason[]>;\n'
        '  awards_by_team: Record<string, CfbAward[]>; rivalries_by_team: Record<string, CfbRivalry[]>;\n'
        '  national_champions?: CfbNatChamp[];\n'
        '};',
    ),
    # accessors appended after getCfbTeamForName
    (
        'export function getCfbTeamForName(name: string): CfbTeam | null {\n'
        '  if (!_byName) { _byName = new Map(); for (const t of d().teams) _byName.set(nameKey(t.name), t); }\n'
        '  return _byName.get(nameKey(name)) ?? null;\n'
        '}',
        'export function getCfbTeamForName(name: string): CfbTeam | null {\n'
        '  if (!_byName) { _byName = new Map(); for (const t of d().teams) _byName.set(nameKey(t.name), t); }\n'
        '  return _byName.get(nameKey(name)) ?? null;\n'
        '}\n'
        '\n'
        '// Former major programs: were major at some point, now neither FBS nor FCS.\n'
        '// Grouped by metro slug for the Defunct Teams section on metro pages.\n'
        'export type FormerCfbCard = {\n'
        '  slug: string; name: string; href: string; color: string; mono: string; years: string;\n'
        '  nat_champ: number; conf: number; maj_seasons: number; pct: number; w: number; l: number; t: number;\n'
        '};\n'
        'let _formerByMetro: Map<string, FormerCfbCard[]> | null = null;\n'
        'export function getFormerMajorCfbForMetro(metroSlug: string): FormerCfbCard[] {\n'
        '  if (!_formerByMetro) {\n'
        '    _formerByMetro = new Map();\n'
        '    const seasonsByTeam = d().seasons_by_team;\n'
        '    for (const t of d().teams) {\n'
        '      if (t.current_fbs) continue;\n'
        '      if ((t.fbs_fcs || "").toUpperCase() === "FCS") continue;\n'
        '      if (t.maj_seasons <= 0 || !t.metro_slug) continue;\n'
        '      const yrs = (seasonsByTeam[t.slug] ?? []).map((s) => s.year).filter((y) => y > 0);\n'
        '      const years = yrs.length\n'
        '        ? (Math.min(...yrs) === Math.max(...yrs) ? `${Math.min(...yrs)}` : `${Math.min(...yrs)}\\u2013${Math.max(...yrs)}`)\n'
        '        : "";\n'
        '      const card: FormerCfbCard = {\n'
        '        slug: t.slug, name: t.name, href: `/teams/cfb/${t.slug}`, color: t.color || "#444",\n'
        '        mono: monogram(t.name), years, nat_champ: t.nat_champ_count, conf: t.maj_conf_champ,\n'
        '        maj_seasons: t.maj_seasons, pct: t.pct, w: t.w, l: t.l, t: t.tie,\n'
        '      };\n'
        '      const arr = _formerByMetro.get(t.metro_slug);\n'
        '      if (arr) arr.push(card); else _formerByMetro.set(t.metro_slug, [card]);\n'
        '    }\n'
        '    for (const arr of _formerByMetro.values())\n'
        '      arr.sort((a, b) => b.nat_champ - a.nat_champ || b.maj_seasons - a.maj_seasons || a.name.localeCompare(b.name));\n'
        '  }\n'
        '  return _formerByMetro.get(metroSlug) ?? [];\n'
        '}\n'
        '\n'
        '// National champions by year (curated). Each school carries its CFB slug\n'
        '// (or null if it is not a tracked program) plus the selectors (AP, CFP, ...).\n'
        'export type CfbNatChampSchool = { name: string; slug: string | null; sel: string };\n'
        'export type CfbNatChamp = { year: number; heisman: string; champs: CfbNatChampSchool[] };\n'
        'export function getCfbNationalChampions(): CfbNatChamp[] { return d().national_champions ?? []; }',
    ),
]

def main():
    if not os.path.isfile(TARGET):
        print("ABORTED: missing " + TARGET + " (run from repo root)."); raise SystemExit(1)
    s = open(TARGET, encoding="utf-8").read()
    if "getFormerMajorCfbForMetro" in s:
        print("Already patched; nothing to do."); return
    for i,(old, new) in enumerate(EDITS,1):
        n = s.count(old)
        if n != 1:
            print("ABORTED at edit %d: anchor matched %d times (expected 1):\n%s" % (i,n, old[:140])); raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(TARGET, TARGET + ".cfbfix.bak")
    open(TARGET, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + TARGET)

if __name__ == "__main__":
    main()
