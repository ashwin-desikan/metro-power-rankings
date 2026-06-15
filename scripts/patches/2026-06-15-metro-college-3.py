# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REL = "app/rankings/[slug]/page.tsx"
P = os.path.join(ROOT, REL)
c = io.open(P, "r", encoding="utf-8").read()

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:75]))
    c = c.replace(old, new)

FB = "\U0001F3C8"
BB = "\U0001F3C0"

# 1) replace the FBS collapsible with the merged Major College Teams block
render = '''            {majorCollegeCards.length > 0 && (
              <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none">
                  <span className="font-semibold text-[var(--text)]">Major College Teams</span>
                  <span className="text-sm text-[var(--text-muted)]">{majorCollegeCards.length} team{majorCollegeCards.length !== 1 ? "s" : ""}</span>
                </summary>
                <div className={`border-t border-[var(--border)] px-4 py-3 ${gridClass}`}>
                  {majorCollegeCards.map((m) => {
                    const body = (
                      <>
                        <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">{m.sport === "football" ? "__FB__" : "__BB__"}</span>{m.sport === "football" ? "College Football" : "College Basketball"}{m.isTop ? <span className="text-[var(--accent)]"> &bull; Top Team</span> : null}</p>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: m.color, width: 24, height: 24 }} aria-hidden>{m.mono}</span>
                          <p className="font-semibold text-[var(--text)]">{m.name}</p>
                        </div>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: m.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: m.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships">{m.titles === 0 ? "No titles" : `${m.titles} Nat'l Champ${m.titles === 1 ? "" : "s"}`}</span>
                          {m.secondVal > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title={m.sport === "football" ? "Conference titles" : "Final Four appearances"}>{m.secondVal} {m.secondLabel}{m.sport === "football" ? "" : (m.secondVal === 1 ? "" : "s")}</span>)}
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Seasons">{m.seasons} season{m.seasons === 1 ? "" : "s"}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage">{m.pct.toFixed(3)} W%</span>
                        </div>
                      </>
                    );
                    return m.href ? (
                      <Link key={m.key} href={m.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">{body}</Link>
                    ) : (
                      <div key={m.key} className="border rounded-lg p-4 bg-[var(--bg-card)] border-[var(--border)]">{body}</div>
                    );
                  })}
                </div>
              </details>
            )}'''
render = render.replace("__FB__", FB).replace("__BB__", BB)
sub('            {otherFbs.length > 0 && collapsible("College Football (FBS)", otherFbs)}', render)

# 2) rename Other College Teams
sub('{otherCollege.length > 0 && collapsible("College/University Teams", otherCollege)}',
    '{otherCollege.length > 0 && collapsible("Other College Teams", otherCollege)}')

# 3) former CBB card: title label -> Nat'l Champ
sub(
'''title="NCAA championships won">
                          {f.titles === 0 ? "No titles" : `${f.titles} Title${f.titles === 1 ? "" : "s"}`}''',
'''title="National championships">
                          {f.titles === 0 ? "No titles" : `${f.titles} Nat'l Champ${f.titles === 1 ? "" : "s"}`}''',
)

# 4) former CBB card: swap the two conditional chips for Final Four (always) + seasons (always)
sub(
'''                        {f.final4 > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Final Four appearances">
                            {f.final4} Final Four{f.final4 === 1 ? "" : "s"}
                          </span>
                        )}
                        {f.tour_app > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="NCAA Tournament appearances">
                            {f.tour_app} NCAA app{f.tour_app === 1 ? "" : "s"}
                          </span>
                        )}''',
'''                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Final Four appearances">
                          {f.final4} Final Four{f.final4 === 1 ? "" : "s"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Seasons as a Division I program">
                          {f.seasons} season{f.seasons === 1 ? "" : "s"}
                        </span>''',
)

io.open(P, "w", encoding="utf-8").write(c)
print("PART2b ok (render + rename + former-card stats)")
