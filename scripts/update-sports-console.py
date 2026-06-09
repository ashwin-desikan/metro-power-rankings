#!/usr/bin/env python3
"""
Sports console redesign + CFL/AFL/NRL season status.

Follow-up to phase1-sports-layout.py (already applied). Run from the repo root:

    python scripts/update-sports-console.py

What it does:
  1. Replaces app/sports/SportsConsole.tsx "Jump to a hub" big buttons with a
     dense list grouped into "In season" / "Offseason", each row showing a
     color-coded dot + short live-status label from lib/leagueStatus.
  2. Inserts CFL / AFL / NRL entries into lib/leagueStatus.tsx (all in regular
     season as of June 2026) so their hub rows show live detail.

page.tsx is NOT touched: it already mounts <SportsConsole hubs deepDives /> and
the prop interface is unchanged.

Safety:
  - Skips the console rewrite if it already contains "In season" (already done).
  - Skips the leagueStatus insert if /teams/cfl is already present.
  - Asserts the /teams/ipl anchor exists in leagueStatus before inserting.
  - Backs up touched files to *.v2.bak. Nothing is committed.
"""

import os
import sys
import shutil

CONSOLE = os.path.join("app", "sports", "SportsConsole.tsx")
LEAGUESTATUS = os.path.join("lib", "leagueStatus.tsx")

LS_ANCHOR = '  "/teams/ipl":        { label: "Offseason", tone: "offseason" },'
LS_INSERT = (
    LS_ANCHOR + "\n"
    + '  "/teams/cfl":        { label: "Live - Regular Season", tone: "regular" },\n'
    + '  "/teams/afl":        { label: "Live - Regular Season", tone: "regular" },\n'
    + '  "/teams/nrl":        { label: "Live - Regular Season", tone: "regular" },'
)

CONSOLE_TSX = r'''import Link from "next/link";
import { leagueStatusFor, type LeagueStatus } from "@/lib/leagueStatus";

// Sticky sidebar for /sports, the cross-sport analogue of app/HomeSidebar.
// Lives beside the map at lg+ (col-span-4) and stacks below on mobile.
//   1. League hubs - dense list of every live hub, grouped into "In season"
//      (regular / playoffs / world cup) and "Offseason", each row carrying a
//      color-coded dot + short live-status label from lib/leagueStatus.
//   2. Deep-dives  - the cross-sport feature pages.
//   3. Methodology / What's new CTAs.
// Server component. Hub data is passed in from page.tsx (no new fetch);
// season status is derived from the shared leagueStatusFor map.

export type ConsoleHub = { label: string; sport: string; href: string };
export type ConsoleDeepDive = { href: string; title: string; tag: string; desc: string };

type RankedHub = ConsoleHub & { status: LeagueStatus | null };

const TONE_COLOR: Record<string, string> = {
  regular: "#10b981",
  playoffs: "#f59e0b",
  worldcup: "#a855f7",
  offseason: "#55556A",
};
const TONE_RANK: Record<string, number> = { worldcup: 0, playoffs: 1, regular: 2, offseason: 3 };

function shortStatus(s: LeagueStatus): string {
  return s.label.replace(/^Live\s*-\s*/, "");
}

export default function SportsConsole({
  hubs,
  deepDives,
}: {
  hubs: ConsoleHub[];
  deepDives: ConsoleDeepDive[];
}) {
  const ranked: RankedHub[] = hubs.map((h) => ({ ...h, status: leagueStatusFor(h.href) }));
  const inSeason = ranked
    .filter((h) => h.status && h.status.tone !== "offseason")
    .sort((a, b) => TONE_RANK[a.status!.tone] - TONE_RANK[b.status!.tone] || a.label.localeCompare(b.label));
  const offseason = ranked
    .filter((h) => !h.status || h.status.tone === "offseason")
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <aside
      id="console"
      className="space-y-5 lg:sticky lg:top-20 scroll-mt-20"
      style={{ alignSelf: "start" }}
    >
      <div>
        <div
          className="text-[10px] tracking-widest uppercase mb-2"
          style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          League hubs
        </div>
        <div
          className="rounded-lg border overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <GroupLabel>In season &middot; {inSeason.length}</GroupLabel>
          {inSeason.map((h) => (
            <HubRow key={h.href} hub={h} />
          ))}
          {offseason.length > 0 && <GroupLabel>Offseason &middot; {offseason.length}</GroupLabel>}
          {offseason.map((h) => (
            <HubRow key={h.href} hub={h} dim />
          ))}
        </div>
      </div>

      <div>
        <div
          className="text-[10px] tracking-widest uppercase mb-2"
          style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Deep-dives
        </div>
        <ul className="space-y-2">
          {deepDives.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="group block rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div
                    className="text-sm font-medium group-hover:text-[var(--accent)]"
                    style={{ color: "var(--text)" }}
                  >
                    {d.title}
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] whitespace-nowrap">
                    {d.tag}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-2 text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <Link
          href="/methodology"
          className="flex-1 text-center rounded-md border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Methodology &rarr;
        </Link>
        <Link
          href="/updates"
          className="flex-1 text-center rounded-md border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          What&apos;s new &rarr;
        </Link>
      </div>
    </aside>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-2.5 py-1.5 text-[9px] tracking-widest uppercase border-t first:border-t-0"
      style={{ background: "var(--bg)", color: "var(--text-dim)", borderColor: "var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
    >
      {children}
    </div>
  );
}

function HubRow({ hub, dim = false }: { hub: RankedHub; dim?: boolean }) {
  const tone = hub.status?.tone ?? "offseason";
  const color = TONE_COLOR[tone];
  return (
    <Link
      href={hub.href}
      className="flex items-center gap-2 px-2.5 py-1.5 border-t text-[13px] transition-colors hover:bg-[var(--bg-card-hover)]"
      style={{ borderColor: "var(--border)", color: dim ? "var(--text-muted)" : "var(--text)" }}
    >
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 7, height: 7, background: color }}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{hub.label}</span>
      {hub.status && (
        <span className="text-[10px] whitespace-nowrap" style={{ color }}>
          {shortStatus(hub.status)}
        </span>
      )}
    </Link>
  );
}
'''


def fail(msg):
    print("ABORTED: " + msg)
    sys.exit(1)


def update_console():
    if not os.path.isfile(CONSOLE):
        fail(CONSOLE + " not found. Run phase1-sports-layout.py first, from the repo root.")
    with open(CONSOLE, "r", encoding="utf-8") as f:
        cur = f.read()
    if "In season" in cur:
        print("  skip    " + CONSOLE + " (already the redesigned version)")
        return
    shutil.copyfile(CONSOLE, CONSOLE + ".v2.bak")
    with open(CONSOLE, "w", encoding="utf-8", newline="\n") as f:
        f.write(CONSOLE_TSX)
    print("  rewrote " + CONSOLE + " (dense status-grouped hub list)")


def patch_leaguestatus():
    if not os.path.isfile(LEAGUESTATUS):
        fail(LEAGUESTATUS + " not found. Run from the repo root.")
    with open(LEAGUESTATUS, "r", encoding="utf-8") as f:
        ls = f.read()
    if '"/teams/cfl"' in ls:
        print("  skip    " + LEAGUESTATUS + " (CFL/AFL/NRL already present)")
        return
    if LS_ANCHOR not in ls:
        fail("anchor not found in " + LEAGUESTATUS + " (the /teams/ipl line). Send me the current file.")
    shutil.copyfile(LEAGUESTATUS, LEAGUESTATUS + ".v2.bak")
    ls = ls.replace(LS_ANCHOR, LS_INSERT, 1)
    with open(LEAGUESTATUS, "w", encoding="utf-8", newline="\n") as f:
        f.write(ls)
    print("  patched " + LEAGUESTATUS + " (+ CFL / AFL / NRL = regular season)")


def main():
    update_console()
    patch_leaguestatus()
    print()
    print("Done. Run your TS type check, then preview /sports before committing.")


if __name__ == "__main__":
    main()
