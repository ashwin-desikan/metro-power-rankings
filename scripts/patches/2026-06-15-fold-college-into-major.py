# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, "app/rankings/[slug]/page.tsx")
c = io.open(P, "r", encoding="utf-8").read()

FB = "\U0001F3C8"
BB = "\U0001F3C0"

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:70]))
    c = c.replace(old, new)

# A) remove the entire "Major College Teams" <details> block from Other Teams
start_marker = '            {majorCollegeCards.length > 0 && (\n              <details'
end_marker = '            {otherFootball.length > 0 && collapsible("Football/Soccer Teams", otherFootball)}'
si = c.find(start_marker)
ei = c.find(end_marker)
if si == -1 or ei == -1 or si >= ei:
    sys.exit("FAIL locating Major College block: si=%d ei=%d" % (si, ei))
c = c[:si] + c[ei:]
print("removed Major College Teams block (%d chars)" % (ei - si))

# B) fold college cards into the Major League Teams/Venues grid
old_grid = (
'          {majorTeamsOnly.length > 0 && (\n'
'            <div className={`${majorVenues.length > 0 ? "mb-3" : ""} ${gridClass}`}>\n'
'              {majorTeamsOnly.map((team, idx) => (\n'
'                <TeamCard key={idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} />\n'
'              ))}\n'
'            </div>\n'
'          )}'
)
new_grid = (
'          {(majorTeamsOnly.length > 0 || majorCollegeCards.length > 0) && (\n'
'            <div className={`${majorVenues.length > 0 ? "mb-3" : ""} ${gridClass}`}>\n'
'              {majorTeamsOnly.map((team, idx) => (\n'
'                <TeamCard key={"m" + idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} />\n'
'              ))}\n'
'              {majorCollegeCards.map((m) => {\n'
'                const body = (\n'
'                  <>\n'
'                    <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">{m.sport === "football" ? "__FB__" : "__BB__"}</span>{m.sport === "football" ? "College Football" : "College Basketball"}{m.isTop ? <span className="text-[var(--accent)]"> &bull; Top Team</span> : null}</p>\n'
'                    <div className="flex items-center gap-2">\n'
'                      <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: m.color, width: 24, height: 24 }} aria-hidden>{m.mono}</span>\n'
'                      <p className="font-semibold text-[var(--text)]">{m.name}</p>\n'
'                    </div>\n'
'                    <div className="flex gap-1.5 mt-2 flex-wrap">\n'
'                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: m.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: m.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships">{m.titles === 0 ? "No titles" : `${m.titles} Nat\'l Champ${m.titles === 1 ? "" : "s"}`}</span>\n'
'                      {m.secondVal > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title={m.sport === "football" ? "Conference titles" : "Final Four appearances"}>{m.secondVal} {m.secondLabel}{m.sport === "football" ? "" : (m.secondVal === 1 ? "" : "s")}</span>)}\n'
'                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Seasons">{m.seasons} season{m.seasons === 1 ? "" : "s"}</span>\n'
'                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage">{m.pct.toFixed(3)} W%</span>\n'
'                    </div>\n'
'                  </>\n'
'                );\n'
'                return m.href ? (\n'
'                  <Link key={m.key} href={m.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">{body}</Link>\n'
'                ) : (\n'
'                  <div key={m.key} className="border rounded-lg p-4 bg-[var(--bg-card)] border-[var(--border)]">{body}</div>\n'
'                );\n'
'              })}\n'
'            </div>\n'
'          )}'
)
new_grid = new_grid.replace("__FB__", FB).replace("__BB__", BB)
sub(old_grid, new_grid)

# C) section visibility includes college cards
sub('{(majorTeamsOnly.length > 0 || majorVenues.length > 0 || historicVenuesRaw.length > 0) && (',
    '{(majorTeamsOnly.length > 0 || majorCollegeCards.length > 0 || majorVenues.length > 0 || historicVenuesRaw.length > 0) && (')

# D) Other Teams condition no longer needs otherFbs (now shown up top)
sub('{(otherFbs.length > 0 || otherFootball.length > 0 || otherCollege.length > 0',
    '{(otherFootball.length > 0 || otherCollege.length > 0')

io.open(P, "w", encoding="utf-8").write(c)
print("OK folded college teams into Major League Teams/Venues")
