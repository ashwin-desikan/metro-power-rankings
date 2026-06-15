# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, "app/rankings/[slug]/page.tsx")
c = io.open(P, "r", encoding="utf-8").read()

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:75]))
    c = c.replace(old, new)

# type: add hasStats
sub(
'    seasons: number; pct: number; isTop: boolean; division: string; conference: string;\n  };',
'    seasons: number; pct: number; isTop: boolean; division: string; conference: string; hasStats: boolean;\n  };',
)

# FBS + hoops always have stats
sub('        division: "FBS", conference: cf?.conference ?? "",\n      };',
    '        division: "FBS", conference: cf?.conference ?? "", hasStats: true,\n      };')
sub('        division: "", conference: cb.conference ?? "",\n      };',
    '        division: "", conference: cb.conference ?? "", hasStats: true,\n      };')

# FCS builder: fall back to CBB for the circle color when not in the CFB data;
# hide stats (no football history available) and skip the conference rather than
# show the basketball conference.
sub(
'''    .map((t): MajorCollegeCard => {
      const cf = getCfbTeamForName(t.team);
      return {
        key: "fcs-" + t.team, sport: "football", name: cf?.name ?? t.team,
        href: cf ? `/teams/cfb/${cf.slug}` : null, color: cf?.color || "#444",
        mono: cfbMonogram(cf?.name ?? t.team), titles: cf?.nat_champ_count ?? 0,
        secondLabel: "Conf", secondVal: cf?.conf_titles ?? 0,
        seasons: cf?.maj_seasons || cf?.seasons || 0, pct: cf?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "FCS", conference: cf?.conference ?? "",
      };
    })''',
'''    .map((t): MajorCollegeCard => {
      const cf = getCfbTeamForName(t.team);
      const cb = cf ? null : cbbForName(t.team);
      return {
        key: "fcs-" + t.team, sport: "football", name: cf?.name ?? cb?.name ?? t.team,
        href: cf ? `/teams/cfb/${cf.slug}` : null, color: cf?.color || cb?.color || "#444",
        mono: cfbMonogram(cf?.name ?? cb?.name ?? t.team), titles: cf?.nat_champ_count ?? 0,
        secondLabel: "Conf", secondVal: cf?.conf_titles ?? 0,
        seasons: cf?.maj_seasons || cf?.seasons || 0, pct: cf?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "FCS", conference: cf?.conference ?? "", hasStats: !!cf,
      };
    })''',
)

# renderCollegeCard: only show the stat-chip row when the card has stats
sub(
'        <div className="flex gap-1.5 mt-2 flex-wrap">\n          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: m.titles > 0',
'        {m.hasStats && (<div className="flex gap-1.5 mt-2 flex-wrap">\n          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: m.titles > 0',
)
sub(
'          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage">{m.pct.toFixed(3)} W%</span>\n        </div>\n      </>',
'          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage">{m.pct.toFixed(3)} W%</span>\n        </div>)}\n      </>',
)

io.open(P, "w", encoding="utf-8").write(c)
print("OK FCS color fallback to CBB + stat-chips gated on hasStats")
