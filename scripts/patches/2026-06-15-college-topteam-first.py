# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, "app/rankings/[slug]/page.tsx")
c = io.open(P, "r", encoding="utf-8").read()
FB = "\U0001F3C8"; BB = "\U0001F3C0"

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:70]))
    c = c.replace(old, new)

# 1) helper + split (college Top Team leads; the rest trail the pro teams)
helper = (
'  ].sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));\n'
'  const renderCollegeCard = (m: MajorCollegeCard) => {\n'
'    const body = (\n'
'      <>\n'
'        <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">{m.sport === "football" ? "__FB__" : "__BB__"}</span>{m.sport === "football" ? "College Football" : "College Basketball"}{m.isTop ? <span className="text-[var(--accent)]"> &bull; Top Team</span> : null}</p>\n'
'        <div className="flex items-center gap-2">\n'
'          <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: m.color, width: 24, height: 24 }} aria-hidden>{m.mono}</span>\n'
'          <p className="font-semibold text-[var(--text)]">{m.name}</p>\n'
'        </div>\n'
'        <div className="flex gap-1.5 mt-2 flex-wrap">\n'
'          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: m.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: m.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships">{m.titles === 0 ? "No titles" : `${m.titles} Nat\'l Champ${m.titles === 1 ? "" : "s"}`}</span>\n'
'          {m.secondVal > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title={m.sport === "football" ? "Conference titles" : "Final Four appearances"}>{m.secondVal} {m.secondLabel}{m.sport === "football" ? "" : (m.secondVal === 1 ? "" : "s")}</span>)}\n'
'          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Seasons">{m.seasons} season{m.seasons === 1 ? "" : "s"}</span>\n'
'          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage">{m.pct.toFixed(3)} W%</span>\n'
'        </div>\n'
'      </>\n'
'    );\n'
'    return m.href ? (\n'
'      <Link key={m.key} href={m.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">{body}</Link>\n'
'    ) : (\n'
'      <div key={m.key} className="border rounded-lg p-4 bg-[var(--bg-card)] border-[var(--border)]">{body}</div>\n'
'    );\n'
'  };\n'
'  // A college program that is the metro Top Team leads the whole grid, ahead\n'
'  // of the pro major-league teams; the rest of the college programs trail them.\n'
'  const topCollegeCards = majorCollegeCards.filter((m) => m.isTop);\n'
'  const restCollegeCards = majorCollegeCards.filter((m) => !m.isTop);'
)
helper = helper.replace("__FB__", FB).replace("__BB__", BB)
sub('  ].sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));', helper)

# 2) replace the grid children (pro map + inline college map) with the ordered trio
start = c.find('              {majorTeamsOnly.map((team, idx) => (')
end_anchor = '            </div>\n          )}\n          {majorVenues.length > 0 && (() => {'
end = c.find(end_anchor)
if start == -1 or end == -1 or start >= end:
    sys.exit("FAIL locating grid children: start=%d end=%d" % (start, end))
new_children = (
'              {topCollegeCards.map(renderCollegeCard)}\n'
'              {majorTeamsOnly.map((team, idx) => (\n'
'                <TeamCard key={"m" + idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} />\n'
'              ))}\n'
'              {restCollegeCards.map(renderCollegeCard)}\n'
)
c = c[:start] + new_children + c[end:]

io.open(P, "w", encoding="utf-8").write(c)
print("OK college Top Team now leads the Major League Teams/Venues grid")
