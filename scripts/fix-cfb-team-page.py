#!/usr/bin/env python3
r"""
CFB team-page fixes (app/teams/cfb/[slug]/page.tsx):
  #1 Heisman stat counts WINNERS only (was counting Heisman Finalist rows too).
  #3+#4 Season "Maj Bowl" column becomes "Bowl": the bowl (or a check if a team
        made one), a "Major" tag, and an era tag (BC / BA / BCS / CFP) by year,
        in a non-gold colour.
  #5 NATL column shows a gold "National" champion tag instead of a star.
  #6 Award winners table gets a sticky header.
  Req#1 Each season's Year links to its Sports Reference season page.

Run from repo root:  python scripts/fix-cfb-team-page.py
Idempotent; anchor-asserted.
"""
import os, sys, shutil

TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join("app", "teams", "cfb", "[slug]", "page.tsx")

EDITS = [
    # #1 stat-card Heisman count: winners only
    (
        '  const heismanCount = awards.filter((a) => /heisman/i.test(a.award)).length;',
        '  const heismanCount = awards.filter((a) => /^\\s*heisman trophy\\s*$/i.test(a.award)).length;',
    ),
    # era helpers, inserted above Stat()
    (
        'function Stat({ k, v }: { k: string; v: string | number }) {',
        'function bowlEra(year: number): string | null {\n'
        '  if (year >= 2014) return "CFP";\n'
        '  if (year >= 1998) return "BCS";\n'
        '  if (year >= 1995) return "BA";\n'
        '  if (year >= 1992) return "BC";\n'
        '  return null;\n'
        '}\n'
        'function bowlEraName(year: number): string {\n'
        '  if (year >= 2014) return "College Football Playoff era";\n'
        '  if (year >= 1998) return "Bowl Championship Series era";\n'
        '  if (year >= 1995) return "Bowl Alliance era";\n'
        '  if (year >= 1992) return "Bowl Coalition era";\n'
        '  return "";\n'
        '}\n'
        'function Stat({ k, v }: { k: string; v: string | number }) {',
    ),
    # Req#1 season Year -> Sports Reference season page
    (
        '                  <td className="px-2 py-1.5">{sn.year}</td>',
        '                  <td className="px-2 py-1.5"><a href={`https://www.sports-reference.com/cfb/years/${sn.year}.html`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] hover:underline" title={`${sn.year} college football season on Sports Reference`}>{sn.year}</a></td>',
    ),
    # #3+#4 header: drop separate "Bowl" name col + "Maj Bowl"; one "Bowl" col
    (
        '<th className="px-2 py-2 hidden md:table-cell">Bowl</th><th className="px-2 py-2 text-center">Maj Bowl</th><th className="px-2 py-2 text-center">Natl</th>',
        '<th className="px-2 py-2">Bowl</th><th className="px-2 py-2 text-center">Natl</th>',
    ),
    # #3+#4+#5 body cells
    (
        '                  <td className="px-2 py-1.5 text-[var(--text-muted)] hidden md:table-cell">{sn.bowl}{sn.bowl_res ? ` (${sn.bowl_res})` : ""}</td>\n'
        '                  <td className="px-2 py-1.5 text-center">{sn.major_bowl ? <span className={sn.playoff ? "text-amber-300" : "text-[var(--text-muted)]"} title={sn.playoff ? "Playoff" : "Major bowl"}>{sn.playoff ? "CFP" : "✓"}</span> : ""}</td>\n'
        '                  <td className="px-2 py-1.5 text-center">{sn.nat_champ ? <span className="text-[var(--accent)] font-semibold">★</span> : ""}</td>',
        '                  <td className="px-2 py-1.5">\n'
        '                    {(sn.bowl || sn.major_bowl) ? (\n'
        '                      <span className="inline-flex items-center gap-1.5 flex-wrap">\n'
        '                        {sn.bowl\n'
        '                          ? <span className="text-[var(--text-muted)]">{sn.bowl}{sn.bowl_res ? ` (${sn.bowl_res})` : ""}</span>\n'
        '                          : <span className="text-[var(--accent)]" title="Made a bowl game">✓</span>}\n'
        '                        {sn.major_bowl && <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}>Major</span>}\n'
        '                        {sn.major_bowl && bowlEra(sn.year) && <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded font-semibold" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title={bowlEraName(sn.year)}>{bowlEra(sn.year)}</span>}\n'
        '                      </span>\n'
        '                    ) : ""}\n'
        '                  </td>\n'
        '                  <td className="px-2 py-1.5 text-center">{sn.nat_champ ? <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}>National</span> : ""}</td>',
    ),
    # #6 awards table: sticky header
    (
        '          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>\n'
        '            <table className="w-full text-sm">',
        '          <div className="max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>\n'
        '            <table className="w-full text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">',
    ),
    # #1 awards-table star: winners only + gold
    (
        '<td className="px-2 py-1.5 text-[var(--text-muted)]">{a.award}{/heisman/i.test(a.award) ? <span className="ml-1 text-[var(--accent)]">★</span> : null}</td>',
        '<td className="px-2 py-1.5 text-[var(--text-muted)]">{a.award}{/^\\s*heisman trophy\\s*$/i.test(a.award) ? <span className="ml-1" style={{ color: "#d4af37" }} title="Heisman winner">★</span> : null}</td>',
    ),
]

def main():
    if not os.path.isfile(TARGET):
        print("ABORTED: missing " + TARGET + " (run from repo root)."); raise SystemExit(1)
    s = open(TARGET, encoding="utf-8").read()
    if "function bowlEra(" in s:
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
