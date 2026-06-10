#!/usr/bin/env python3
r"""
Req #2: National Champions table on the CFB hub (app/teams/cfb/page.tsx).
Adds a "National champions" HubNav item and a season-by-season table of
recognized national champions (selectors + Heisman), each school linking to
its program page. Data from getCfbNationalChampions().

Run from repo root:  python scripts/fix-cfb-hub-champions.py  (after fix-cfb-lib.py)
Idempotent; anchor-asserted.
"""
import os, sys, shutil

TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join("app", "teams", "cfb", "page.tsx")

EDITS = [
    (
        'import { getAllCfbTeams, getAllCfbSlugs, getCfbTopGames, getCfbGamesByDecade, type CfbTeam } from "@/lib/cfb";',
        'import { getAllCfbTeams, getAllCfbSlugs, getCfbTopGames, getCfbGamesByDecade, getCfbNationalChampions, type CfbTeam } from "@/lib/cfb";',
    ),
    (
        '  const byDecade = getCfbGamesByDecade();',
        '  const byDecade = getCfbGamesByDecade();\n  const natChamps = getCfbNationalChampions();',
    ),
    (
        '      <HubNav items={[{ label: "All-time", href: "#all-time" }, { label: "Greatest games", href: "#games" }, { label: "AP polls", href: "#polls" }]} />',
        '      <HubNav items={[{ label: "All-time", href: "#all-time" }, { label: "National champions", href: "#champions" }, { label: "Greatest games", href: "#games" }, { label: "AP polls", href: "#polls" }]} />',
    ),
    (
        '      <section id="games" className="mb-12 scroll-mt-20">\n'
        '        <h2 className="text-lg font-semibold mb-1">The greatest games</h2>',
        '      {natChamps.length > 0 && (\n'
        '        <section id="champions" className="mb-12 scroll-mt-20">\n'
        '          <h2 className="text-lg font-semibold mb-1">National champions</h2>\n'
        '          <p className="text-xs text-[var(--text-muted)] mb-4">Recognized national champions by season, with the selectors in parentheses and the Heisman winner. Tap a school to open its program page.</p>\n'
        '          <div className="max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>\n'
        '            <table className="w-full text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">\n'
        '              <thead>\n'
        '                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>\n'
        '                  <th className="px-3 py-2 w-16">Year</th>\n'
        '                  <th className="px-3 py-2">National champion</th>\n'
        '                  <th className="px-3 py-2 hidden sm:table-cell">Heisman</th>\n'
        '                </tr>\n'
        '              </thead>\n'
        '              <tbody>\n'
        '                {natChamps.map((nc) => (\n'
        '                  <tr key={nc.year} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>\n'
        '                    <td className="px-3 py-1.5 tabular-nums text-[var(--text-muted)]"><a href={`https://www.sports-reference.com/cfb/years/${nc.year}.html`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] hover:underline" title={`${nc.year} season on Sports Reference`}>{nc.year}</a></td>\n'
        '                    <td className="px-3 py-1.5">\n'
        '                      {nc.champs.map((c, i) => (\n'
        '                        <span key={i}>\n'
        '                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}\n'
        '                          {c.slug ? <Link href={`/teams/cfb/${c.slug}`} className="font-medium hover:text-[var(--accent)]">{c.name}</Link> : <span className="font-medium">{c.name}</span>}\n'
        '                          {c.sel ? <span className="text-[10px] text-[var(--text-dim)]"> ({c.sel})</span> : null}\n'
        '                        </span>\n'
        '                      ))}\n'
        '                    </td>\n'
        '                    <td className="px-3 py-1.5 text-[var(--text-muted)] hidden sm:table-cell">{nc.heisman}</td>\n'
        '                  </tr>\n'
        '                ))}\n'
        '              </tbody>\n'
        '            </table>\n'
        '          </div>\n'
        '        </section>\n'
        '      )}\n'
        '\n'
        '      <section id="games" className="mb-12 scroll-mt-20">\n'
        '        <h2 className="text-lg font-semibold mb-1">The greatest games</h2>',
    ),
]

def main():
    if not os.path.isfile(TARGET):
        print("ABORTED: missing " + TARGET + " (run from repo root)."); raise SystemExit(1)
    s = open(TARGET, encoding="utf-8").read()
    if 'id="champions"' in s:
        print("Already patched; nothing to do."); return
    for i,(old, new) in enumerate(EDITS,1):
        n = s.count(old)
        if n != 1:
            print("ABORTED at edit %d: anchor matched %d times (expected 1):\n%s" % (i,n, old[:140])); raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(TARGET, TARGET + ".cfbchamps.bak")
    open(TARGET, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + TARGET)

if __name__ == "__main__":
    main()
