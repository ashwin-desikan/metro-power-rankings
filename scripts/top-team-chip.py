#!/usr/bin/env python3
"""
Top Team designation, slice 1: shared TopTeamChip + wire into IPL and Club
Football (the leagues most affected). Run from the repo root:

    python scripts/top-team-chip.py

- app/teams/TopTeamChip.tsx (new): resolves the page's team (name candidates +
  metro) against the Team That Wins the City picks via findTopTeamForName and
  renders an amber "Top Team" badge linking back to that metro's slot on
  /top-teams, or nothing. Mirrors the inline badge already on NFL/MLB/NBA/NHL.
- app/teams/ipl/[slug]/page.tsx + app/teams/football/[slug]/page.tsx: import the
  chip and drop it in the hero next to the title.

Idempotent (skips files already wired); backs up patched pages to *.v9.bak.
page.tsx etc. untouched. Nothing committed.
"""
import os, sys, shutil

CHIP = os.path.join("app", "teams", "TopTeamChip.tsx")
IPL = os.path.join("app", "teams", "ipl", "[slug]", "page.tsx")
FB = os.path.join("app", "teams", "football", "[slug]", "page.tsx")

CHIP_TSX = r'''import Link from "next/link";
import { findTopTeamForName, topTeamAnchorId } from "@/lib/topTeams";

// Shared "Top Team" badge for per-franchise/club pages. Resolves the page's
// team (by name candidates + metro) against the Team That Wins the City picks
// and, when it is a metro's named pick, renders an amber badge linking back to
// that metro's slot on /top-teams. Renders nothing otherwise. Mirrors the
// inline badge on the NFL/MLB/NBA/NHL pages so every league reads the same.

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

IPL_IMPORT_OLD = 'import { BASE_URL, SITE_NAME } from "@/lib/seo";'
IPL_IMPORT_NEW = IPL_IMPORT_OLD + '\nimport TopTeamChip from "@/app/teams/TopTeamChip";'
IPL_HERO_OLD = '            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{f.name}</h1>'
IPL_HERO_NEW = IPL_HERO_OLD + '\n            <TopTeamChip names={[f.name]} metro={f.city} />'

FB_IMPORT_OLD = 'import GhostFranchiseTag from "@/app/teams/GhostFranchiseTag";'
FB_IMPORT_NEW = FB_IMPORT_OLD + '\nimport TopTeamChip from "@/app/teams/TopTeamChip";'
FB_HERO_OLD = '          <GhostFranchiseTag league="football" slug={club.slug} className="ml-1" />'
FB_HERO_NEW = FB_HERO_OLD + '\n          <TopTeamChip names={[club.cur_name]} metro={club.metro} className="ml-1" />'


def fail(m): print("ABORTED: " + m); sys.exit(1)

def write_new(path, content, label):
    if os.path.isfile(path) and open(path, encoding="utf-8").read() == content:
        print("  skip    " + path + " (unchanged)"); return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8", newline="\n").write(content)
    print("  wrote   " + path + " (" + label + ")")

def wire(path, edits):
    if not os.path.isfile(path): fail(path + " not found. Run from the repo root.")
    src = open(path, encoding="utf-8").read()
    if "TopTeamChip" in src:
        print("  skip    " + path + " (already wired)"); return
    for label, old, new in edits:
        if old not in src: fail("anchor not found in " + path + ": " + label + ". Send me the current file.")
        src = src.replace(old, new, 1)
    shutil.copyfile(path, path + ".v9.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(src)
    print("  patched " + path)

def main():
    write_new(CHIP, CHIP_TSX, "shared Top Team badge")
    wire(IPL, [("import", IPL_IMPORT_OLD, IPL_IMPORT_NEW), ("hero", IPL_HERO_OLD, IPL_HERO_NEW)])
    wire(FB, [("import", FB_IMPORT_OLD, FB_IMPORT_NEW), ("hero", FB_HERO_OLD, FB_HERO_NEW)])
    print()
    print("Done. Run your TS type check, then preview an IPL + a Club Football page before committing.")

if __name__ == "__main__":
    main()
