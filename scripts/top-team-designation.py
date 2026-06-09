#!/usr/bin/env python3
"""
Top Team designation, complete. Run from the repo root:

    python scripts/top-team-designation.py

Reverse badge (team page -> /top-teams#anchor), via the shared TopTeamChip
(findTopTeamForName is already contested-aware), wired into every league that
lacked it: IPL, Club Football, WNBA, CFL, and Women's Football clubs. AFL/NRL
already compute the match in FootyTeam; their badge is turned into a link.
Forward links on /top-teams split co-equal "A / B" picks so each named team
links to its page (lower-country clubs with no page stay plain text).

Self-contained and idempotent (safe whether or not top-team-chip.py was run):
creates TopTeamChip if missing, skips files already wired. Backs up patched
files to *.v10.bak. Nothing committed.
"""
import os, sys, shutil

CHIP = os.path.join("app", "teams", "TopTeamChip.tsx")

CHIP_TSX = r'''import Link from "next/link";
import { findTopTeamForName, topTeamAnchorId } from "@/lib/topTeams";

// Shared "Top Team" badge for per-franchise/club pages. Resolves the page's
// team (by name candidates + metro) against the Team That Wins the City picks
// and, when it is a metro's named pick, renders an amber badge linking back to
// that metro's slot on /top-teams. Renders nothing otherwise. findTopTeamForName
// is contested-aware (splits "A / B" picks), so co-equal teams both match.

export default function TopTeamChip({
  names,
  metro,
  className = "",
}: {
  names: string[];
  metro: string | null;
  className?: string;
}) {
  const pick = findTopTeamForName(names, metro ?? "");
  if (!pick) return null;
  return (
    <Link
      href={`/top-teams#${topTeamAnchorId(pick.metro)}`}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors text-xs font-medium ${className}`}
      title="This team is the metro's named Top Team pick on The Team That Wins the City"
    >
      <span className="text-amber-400 text-base leading-none" aria-hidden>&#9812;</span>
      <span className="font-semibold tracking-wide">Top Team</span>
      <span className="opacity-80">{pick.metro}</span>
    </Link>
  );
}
'''

# (file, [(label, old, new), ...], guard)
PAGE_EDITS = [
    (
        os.path.join("app", "teams", "ipl", "[slug]", "page.tsx"),
        [
            ("import", 'import { BASE_URL, SITE_NAME } from "@/lib/seo";',
             'import { BASE_URL, SITE_NAME } from "@/lib/seo";\nimport TopTeamChip from "@/app/teams/TopTeamChip";'),
            ("hero", '            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{f.name}</h1>',
             '            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{f.name}</h1>\n            <TopTeamChip names={[f.name]} metro={f.city} />'),
        ],
        "TopTeamChip",
    ),
    (
        os.path.join("app", "teams", "football", "[slug]", "page.tsx"),
        [
            ("import", 'import GhostFranchiseTag from "@/app/teams/GhostFranchiseTag";',
             'import GhostFranchiseTag from "@/app/teams/GhostFranchiseTag";\nimport TopTeamChip from "@/app/teams/TopTeamChip";'),
            ("hero", '          <GhostFranchiseTag league="football" slug={club.slug} className="ml-1" />',
             '          <GhostFranchiseTag league="football" slug={club.slug} className="ml-1" />\n          <TopTeamChip names={[club.cur_name]} metro={club.metro} className="ml-1" />'),
        ],
        "TopTeamChip",
    ),
    (
        os.path.join("app", "teams", "wnba", "[slug]", "page.tsx"),
        [
            ("import", 'import { BASE_URL, SITE_NAME } from "@/lib/seo";',
             'import { BASE_URL, SITE_NAME } from "@/lib/seo";\nimport TopTeamChip from "@/app/teams/TopTeamChip";'),
            ("hero", '            <h1 className="text-3xl font-bold tracking-tight">{f.name}</h1>',
             '            <h1 className="text-3xl font-bold tracking-tight">{f.name}</h1>\n            <TopTeamChip names={[f.name]} metro={f.city} />'),
        ],
        "TopTeamChip",
    ),
    (
        os.path.join("app", "teams", "cfl", "[slug]", "page.tsx"),
        [
            ("import", 'import { BASE_URL, SITE_NAME } from "@/lib/seo";',
             'import { BASE_URL, SITE_NAME } from "@/lib/seo";\nimport TopTeamChip from "@/app/teams/TopTeamChip";'),
            ("hero", '            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{f.name}</h1>',
             '            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{f.name}</h1>\n            <TopTeamChip names={[f.name]} metro={null} />'),
        ],
        "TopTeamChip",
    ),
    (
        os.path.join("app", "teams", "wfootball", "clubs", "[slug]", "page.tsx"),
        [
            ("import", 'import { BASE_URL, SITE_NAME } from "@/lib/seo";',
             'import { BASE_URL, SITE_NAME } from "@/lib/seo";\nimport TopTeamChip from "@/app/teams/TopTeamChip";'),
            ("hero", '          <h1 className="text-3xl font-semibold tracking-tight">{club.name}</h1>',
             '          <h1 className="text-3xl font-semibold tracking-tight">{club.name}</h1>\n          <TopTeamChip names={[club.name]} metro={club.metro} />'),
        ],
        "TopTeamChip",
    ),
]

FOOTY = os.path.join("app", "teams", "_footy", "FootyTeam.tsx")
FOOTY_IMPORT_OLD = 'import { TOP_TEAMS } from "@/lib/topTeams";'
FOOTY_IMPORT_NEW = 'import { TOP_TEAMS, topTeamAnchorId } from "@/lib/topTeams";'
FOOTY_BADGE_OLD = '''            {topMetro && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24" }} title={`Top sporting team of ${topMetro}`}>
                <span aria-hidden>{"\\u2654"}</span> Top Team · {topMetro}
              </span>
            )}'''
FOOTY_BADGE_NEW = '''            {topMetro && (
              <Link href={`/top-teams#${topTeamAnchorId(topMetro)}`} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded hover:brightness-110 transition" style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24" }} title={`Top sporting team of ${topMetro} — see The Team That Wins the City`}>
                <span aria-hidden>{"\\u2654"}</span> Top Team · {topMetro}
              </Link>
            )}'''

TOPTEAMS = os.path.join("app", "top-teams", "page.tsx")
TT_OLD = '''                        {(() => {
                          // resolveTeamLink returns null for sports that have no team-page
                          // wired up yet (NBA/NHL/MLB today), or for co-equal "A / B" rows
                          // we have not split. In those cases we fall back to plain text.
                          const link = resolveTeamLink(t.sport, t.team);
                          if (!link) {
                            return (
                              <span style={{ color: "var(--text)" }} className="font-semibold">
                                {t.team}
                              </span>
                            );
                          }
                          return (
                            <Link
                              href={link.href}
                              className="inline-flex items-center gap-2 font-semibold hover:text-[var(--accent)] transition-colors"
                              style={{ color: "var(--text)" }}
                            >
                              {link.logoUrl ? (
                                <img
                                  src={link.logoUrl}
                                  alt=""
                                  width={20}
                                  height={20}
                                  className="inline-block flex-shrink-0 object-contain"
                                  aria-hidden
                                />
                              ) : null}
                              <span>{t.team}</span>
                            </Link>
                          );
                        })()}'''
TT_NEW = '''                        {(() => {
                          // Split co-equal "A / B" picks so each named team links to
                          // its own page. The sport is split in parallel for cross-sport
                          // split cities (e.g. "Basketball / Baseball" -> Lakers, Dodgers);
                          // a single sport applies to every part otherwise. resolveTeamLink
                          // returns null where no page exists, so those parts stay text.
                          const teamParts = t.team.split("/").map((p) => p.trim()).filter(Boolean);
                          const sportParts = t.sport.split("/").map((s) => s.trim()).filter(Boolean);
                          return (
                            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 font-semibold" style={{ color: "var(--text)" }}>
                              {teamParts.map((part, idx) => {
                                const partSport = sportParts.length === teamParts.length ? sportParts[idx] : (sportParts[0] ?? t.sport);
                                const link = resolveTeamLink(partSport, part);
                                return (
                                  <span key={part} className="inline-flex items-center gap-1.5">
                                    {idx > 0 ? <span className="text-[var(--text-dim)]">/</span> : null}
                                    {link ? (
                                      <Link
                                        href={link.href}
                                        className="inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity"
                                        style={{ color: "var(--accent)" }}
                                      >
                                        {link.logoUrl ? (
                                          <img src={link.logoUrl} alt="" width={18} height={18} className="inline-block flex-shrink-0 object-contain" aria-hidden />
                                        ) : null}
                                        <span>{part}</span>
                                      </Link>
                                    ) : (
                                      <span style={{ color: "var(--text)" }}>{part}</span>
                                    )}
                                  </span>
                                );
                              })}
                            </span>
                          );
                        })()}'''


def fail(m): print("ABORTED: " + m); sys.exit(1)

def write_new(path, content, label):
    if os.path.isfile(path) and open(path, encoding="utf-8").read() == content:
        print("  skip    " + path + " (unchanged)"); return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.isfile(path): shutil.copyfile(path, path + ".v10.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(content)
    print("  wrote   " + path + " (" + label + ")")

def patch(path, edits, guard):
    if not os.path.isfile(path): fail(path + " not found. Run from the repo root.")
    src = open(path, encoding="utf-8").read()
    if guard in src:
        print("  skip    " + path + " (already done)"); return
    for label, old, new in edits:
        if old not in src: fail("anchor not found in " + path + ": " + label + ". Send me the current file.")
        src = src.replace(old, new, 1)
    shutil.copyfile(path, path + ".v10.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(src)
    print("  patched " + path)

def main():
    write_new(CHIP, CHIP_TSX, "shared Top Team badge")
    for path, edits, guard in PAGE_EDITS:
        patch(path, edits, guard)
    patch(FOOTY, [("import", FOOTY_IMPORT_OLD, FOOTY_IMPORT_NEW), ("badge", FOOTY_BADGE_OLD, FOOTY_BADGE_NEW)], "topTeamAnchorId")
    patch(TOPTEAMS, [("forward split", TT_OLD, TT_NEW)], 'const sportParts = t.sport.split("/")')
    print()
    print("Done. Run your TS type check, then preview an IPL, a club, a WNBA/CFL/women's page, an AFL/NRL page, and /top-teams (incl. a contested row) before committing.")

if __name__ == "__main__":
    main()
