import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def patch(rel, edits):
    p = os.path.join(ROOT, rel)
    c = io.open(p, "r", encoding="utf-8").read()
    for old, new in edits:
        if c.count(old) != 1:
            sys.exit("ANCHOR FAIL in %s (%d): %r" % (rel, c.count(old), old[:70]))
        c = c.replace(old, new)
    io.open(p, "w", encoding="utf-8").write(c)
    print("OK", rel)

# ---- lib/cbb.ts ----
patch("lib/cbb.ts", [
    (
        'export type CbbNatChamp = { year: number; champs: CbbNatChampSchool[] };',
        'export type CbbNatChampPair = { name: string; slug: string | null };\n'
        'export type CbbNatChamp = { year: number; champs: CbbNatChampSchool[]; runner_up?: CbbNatChampPair[]; final_four?: CbbNatChampPair[] };',
    ),
    (
        '  slug: string; name: string; href: string; color: string; mono: string; years: string; lastYear: number;\n'
        '  titles: number; final4: number; tour_app: number; pct: number; w: number; l: number;\n'
        '};',
        '  slug: string; name: string; href: string; color: string; mono: string; years: string; lastYear: number;\n'
        '  titles: number; final4: number; tour_app: number; pct: number; w: number; l: number; seasons: number;\n'
        '};',
    ),
    (
        '        titles: t.titles, final4: t.final4, tour_app: t.tour_app, pct: t.pct, w: t.w, l: t.l,',
        '        titles: t.titles, final4: t.final4, tour_app: t.tour_app, pct: t.pct, w: t.w, l: t.l, seasons: t.seasons,',
    ),
])

# ---- app/teams/cbb/page.tsx : champions table ----
patch("app/teams/cbb/page.tsx", [
    (
        '<p className="text-xs text-[var(--text-muted)] mb-4">NCAA tournament champions from 1939, with the retroactive pre-tournament selections (Helms, Premo-Porretta) labeled. Tap a school to open its program page.</p>',
        '<p className="text-xs text-[var(--text-muted)] mb-4">NCAA tournament champions from 1939, with the retroactive pre-tournament selections (Helms, Premo-Porretta) labeled. Each row also shows the title-game runner-up and the other two Final Four teams. Tap a school to open its program page.</p>',
    ),
    (
        '                  <th className="px-3 py-2 w-16">Year</th>\n'
        '                  <th className="px-3 py-2">National champion</th>',
        '                  <th className="px-3 py-2 w-16">Year</th>\n'
        '                  <th className="px-3 py-2">National champion</th>\n'
        '                  <th className="px-3 py-2">Runner-up</th>\n'
        '                  <th className="px-3 py-2">Final Four</th>',
    ),
    (
        '                          {c.sel ? <span className="text-[10px] text-[var(--text-dim)]"> ({c.sel})</span> : null}\n'
        '                        </span>\n'
        '                      ))}\n'
        '                    </td>\n'
        '                  </tr>',
        '                          {c.sel ? <span className="text-[10px] text-[var(--text-dim)]"> ({c.sel})</span> : null}\n'
        '                        </span>\n'
        '                      ))}\n'
        '                    </td>\n'
        '                    <td className="px-3 py-1.5">\n'
        '                      {(nc.runner_up ?? []).length === 0 ? <span className="text-[var(--text-dim)]">\\u2014</span> : (nc.runner_up ?? []).map((r, i) => (\n'
        '                        <span key={i}>\n'
        '                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}\n'
        '                          {r.slug ? <Link href={`/teams/cbb/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link> : <span>{r.name}</span>}\n'
        '                        </span>\n'
        '                      ))}\n'
        '                    </td>\n'
        '                    <td className="px-3 py-1.5 text-[var(--text-muted)]">\n'
        '                      {(nc.final_four ?? []).length === 0 ? <span className="text-[var(--text-dim)]">\\u2014</span> : (nc.final_four ?? []).map((f, i) => (\n'
        '                        <span key={i}>\n'
        '                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}\n'
        '                          {f.slug ? <Link href={`/teams/cbb/${f.slug}`} className="hover:text-[var(--accent)]">{f.name}</Link> : <span>{f.name}</span>}\n'
        '                        </span>\n'
        '                      ))}\n'
        '                    </td>\n'
        '                  </tr>',
    ),
])
print("DONE frontend-a")
