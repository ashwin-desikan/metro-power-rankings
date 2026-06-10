#!/usr/bin/env python3
r"""
Item #7: list former major college-football programs (were major, now neither
FBS nor FCS) as cards inside each metro's Defunct/Relocated Teams section,
tagged "Former FBS", with the same title / conference / season / record chips
used elsewhere.

Run from repo root:  python scripts/fix-cfb-metro-defunct.py
Run AFTER fix-cfb-lib.py (needs getFormerMajorCfbForMetro). Idempotent;
anchor-asserted.
"""
import os, sys, shutil

TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join("app", "rankings", "[slug]", "page.tsx")

EDITS = [
    # import the accessor + type
    (
        'import { getCfbTeamForName, cfbMonogram } from "@/lib/cfb";',
        'import { getCfbTeamForName, cfbMonogram, getFormerMajorCfbForMetro, type FormerCfbCard } from "@/lib/cfb";',
    ),
    # pass into TeamsSection
    (
        '<TeamsSection teams={detail.teams || []} topTeamPick={topTeamPick} relocations={getRelocationsForMetro(slug)} />',
        '<TeamsSection teams={detail.teams || []} topTeamPick={topTeamPick} relocations={getRelocationsForMetro(slug)} formerCfb={getFormerMajorCfbForMetro(slug)} />',
    ),
    # destructure prop
    (
        'function TeamsSection({\n'
        '  teams,\n'
        '  topTeamPick,\n'
        '  relocations = [],\n'
        '}: {',
        'function TeamsSection({\n'
        '  teams,\n'
        '  topTeamPick,\n'
        '  relocations = [],\n'
        '  formerCfb = [],\n'
        '}: {',
    ),
    # prop type
    (
        '  relocations?: import("@/lib/data").RelocationCard[];\n'
        '}) {',
        '  relocations?: import("@/lib/data").RelocationCard[];\n'
        '  formerCfb?: FormerCfbCard[];\n'
        '}) {',
    ),
    # outer "Other Teams" render guard
    (
        '      {(otherFbs.length > 0 || otherFootball.length > 0 || otherCollege.length > 0 || otherMen.length > 0 || otherWomen.length > 0 || relocations.length > 0) && (',
        '      {(otherFbs.length > 0 || otherFootball.length > 0 || otherCollege.length > 0 || otherMen.length > 0 || otherWomen.length > 0 || relocations.length > 0 || formerCfb.length > 0) && (',
    ),
    # Defunct block guard
    (
        '            {relocations.length > 0 && (\n'
        '              <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group">',
        '            {(relocations.length > 0 || formerCfb.length > 0) && (\n'
        '              <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group">',
    ),
    # Defunct count (relocations + formerCfb)
    (
        '                  <span className="text-sm text-[var(--text-muted)]">\n'
        '                    {relocations.length} team{relocations.length !== 1 ? "s" : ""}\n'
        '                  </span>',
        '                  <span className="text-sm text-[var(--text-muted)]">\n'
        '                    {relocations.length + formerCfb.length} team{relocations.length + formerCfb.length !== 1 ? "s" : ""}\n'
        '                  </span>',
    ),
    # append former-CFB cards after the relocations map (anchor on the unique
    # Continental-trophies tail of the relocations football block)
    (
        '                          {(r.stats.cont_trophies ?? 0) > 0 && (\n'
        '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Continental trophies">\n'
        '                              {r.stats.cont_trophies} Cont.\n'
        '                            </span>\n'
        '                          )}\n'
        '                        </div>\n'
        '                      )}\n'
        '                    </Link>\n'
        '                  ))}\n'
        '                </div>\n'
        '              </details>',
        '                          {(r.stats.cont_trophies ?? 0) > 0 && (\n'
        '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Continental trophies">\n'
        '                              {r.stats.cont_trophies} Cont.\n'
        '                            </span>\n'
        '                          )}\n'
        '                        </div>\n'
        '                      )}\n'
        '                    </Link>\n'
        '                  ))}\n'
        '                  {formerCfb.map((f) => (\n'
        '                    <Link key={f.slug} href={f.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">\n'
        '                      <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">\U0001F3C8</span>College Football &bull; Former FBS</p>\n'
        '                      <div className="flex items-center gap-2">\n'
        '                        <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: f.color, width: 24, height: 24 }} aria-hidden>{f.mono}</span>\n'
        '                        <p className="font-semibold text-[var(--text)]">{f.name}</p>\n'
        '                      </div>\n'
        '                      {f.years && <p className="text-xs text-[var(--text-dim)] mt-1">{f.years}</p>}\n'
        '                      <div className="flex gap-1.5 mt-2 flex-wrap">\n'
        '                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: f.nat_champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: f.nat_champ > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships won as a major program">\n'
        '                          {f.nat_champ === 0 ? "No titles" : `${f.nat_champ} Natl Champ${f.nat_champ === 1 ? "" : "s"}`}\n'
        '                        </span>\n'
        '                        {f.conf > 0 && (\n'
        '                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Major conference championships">\n'
        '                            {f.conf} Conf\n'
        '                          </span>\n'
        '                        )}\n'
        '                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Major (top-division) seasons">\n'
        '                          {f.maj_seasons} maj season{f.maj_seasons === 1 ? "" : "s"}\n'
        '                        </span>\n'
        '                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage as a major program">\n'
        '                          {f.pct.toFixed(3)} W%\n'
        '                        </span>\n'
        '                      </div>\n'
        '                    </Link>\n'
        '                  ))}\n'
        '                </div>\n'
        '              </details>',
    ),
]

def main():
    if not os.path.isfile(TARGET):
        print("ABORTED: missing " + TARGET + " (run from repo root)."); raise SystemExit(1)
    s = open(TARGET, encoding="utf-8").read()
    if "getFormerMajorCfbForMetro" in s and "Former FBS" in s:
        print("Already patched; nothing to do."); return
    for i, (old, new) in enumerate(EDITS, 1):
        n = s.count(old)
        if n != 1:
            print("ABORTED at edit %d: anchor matched %d times (expected 1):\n%s" % (i, n, old[:160])); raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(TARGET, TARGET + ".cfbdefunct.bak")
    open(TARGET, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + TARGET)

if __name__ == "__main__":
    main()
