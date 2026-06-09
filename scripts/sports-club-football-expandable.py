#!/usr/bin/env python3
"""
Club Football expandable row + competition/league season status.

Follow-up to the /sports console redesign. Run from the repo root:

    python scripts/sports-club-football-expandable.py

What it does:
  1. lib/leagueStatus.tsx: adds season-status entries for the 5 Club Football
     competitions (Champions / Europa / Conference League, Club World Cup, Copa
     Libertadores) and the 9 league hubs (PL, La Liga, Serie A, Bundesliga,
     Ligue 1, Eredivisie, Primeira Liga, Scottish Premiership, MLS); plus
     CLUB_FOOTBALL_CHILDREN and clubFootballStatus() (aggregate = live if any
     child is in season). States are current as of June 2026.
  2. app/sports/ClubFootballRow.tsx: new client component, an expandable row
     listing those children (grouped Competitions / Leagues) with per-row
     status dots + labels.
  3. app/sports/SportsConsole.tsx: renders Club Football via ClubFootballRow and
     uses clubFootballStatus() so it sorts into In-season whenever any child is
     live (MLS is, right now).

Safety: idempotent (skips inserts already present); backs up touched files to
*.v3.bak. page.tsx untouched. Nothing committed.
"""

import os
import sys
import shutil

CONSOLE = os.path.join("app", "sports", "SportsConsole.tsx")
CLUBROW = os.path.join("app", "sports", "ClubFootballRow.tsx")
LEAGUESTATUS = os.path.join("lib", "leagueStatus.tsx")

LS_CHILD_ANCHOR = '  "/teams/nrl":        { label: "Live - Regular Season", tone: "regular" },'
LS_CHILD_INSERT = LS_CHILD_ANCHOR + "\n" + """  // Club football competitions (seasonal - update each year)
  "/teams/football/tournaments/champions-league":  { label: "Offseason", tone: "offseason" },
  "/teams/football/tournaments/europa-league":     { label: "Offseason", tone: "offseason" },
  "/teams/football/tournaments/conference-league": { label: "Offseason", tone: "offseason" },
  "/teams/football/tournaments/club-world-cup":    { label: "Offseason", tone: "offseason" },
  "/teams/football/tournaments/copa-libertadores": { label: "R16 in Aug", tone: "offseason" },
  // Club football domestic leagues (seasonal)
  "/teams/football/leagues/premier-league":        { label: "Offseason", tone: "offseason" },
  "/teams/football/leagues/la-liga":               { label: "Offseason", tone: "offseason" },
  "/teams/football/leagues/serie-a":               { label: "Offseason", tone: "offseason" },
  "/teams/football/leagues/bundesliga":            { label: "Offseason", tone: "offseason" },
  "/teams/football/leagues/ligue-1":               { label: "Offseason", tone: "offseason" },
  "/teams/football/leagues/eredivisie":            { label: "Offseason", tone: "offseason" },
  "/teams/football/leagues/primeira-liga":         { label: "Offseason", tone: "offseason" },
  "/teams/football/leagues/scottish-premiership":  { label: "Offseason", tone: "offseason" },
  "/teams/football/leagues/mls":                   { label: "Live - Regular Season", tone: "regular" },"""

LS_EXPORT_ANCHOR = "  return STATUS_BY_PAGE[page] ?? null;\n}"
LS_EXPORT_INSERT = LS_EXPORT_ANCHOR + "\n" + '''
export type ClubFootballChild = { section: "Competitions" | "Leagues"; label: string; href: string };

// Children surfaced under the expandable Club Football row in the /sports
// console. Each child's status comes from STATUS_BY_PAGE above.
export const CLUB_FOOTBALL_CHILDREN: ClubFootballChild[] = [
  { section: "Competitions", label: "Champions League", href: "/teams/football/tournaments/champions-league" },
  { section: "Competitions", label: "Europa League", href: "/teams/football/tournaments/europa-league" },
  { section: "Competitions", label: "Conference League", href: "/teams/football/tournaments/conference-league" },
  { section: "Competitions", label: "Club World Cup", href: "/teams/football/tournaments/club-world-cup" },
  { section: "Competitions", label: "Copa Libertadores", href: "/teams/football/tournaments/copa-libertadores" },
  { section: "Leagues", label: "Premier League", href: "/teams/football/leagues/premier-league" },
  { section: "Leagues", label: "La Liga", href: "/teams/football/leagues/la-liga" },
  { section: "Leagues", label: "Serie A", href: "/teams/football/leagues/serie-a" },
  { section: "Leagues", label: "Bundesliga", href: "/teams/football/leagues/bundesliga" },
  { section: "Leagues", label: "Ligue 1", href: "/teams/football/leagues/ligue-1" },
  { section: "Leagues", label: "Eredivisie", href: "/teams/football/leagues/eredivisie" },
  { section: "Leagues", label: "Primeira Liga", href: "/teams/football/leagues/primeira-liga" },
  { section: "Leagues", label: "Scottish Premiership", href: "/teams/football/leagues/scottish-premiership" },
  { section: "Leagues", label: "MLS", href: "/teams/football/leagues/mls" },
];

// Aggregate status for the Club Football parent row: live if any child is in
// season, labelled with the live count. Lets /sports lift Club Football into
// the In-season group whenever any competition or league is active.
export function clubFootballStatus(): LeagueStatus {
  const liveTones = CLUB_FOOTBALL_CHILDREN
    .map((c) => leagueStatusFor(c.href))
    .filter((s): s is LeagueStatus => !!s && s.tone !== "offseason")
    .map((s) => s.tone);
  if (liveTones.length === 0) return { label: "Offseason", tone: "offseason" };
  const order: LeagueStatusTone[] = ["worldcup", "playoffs", "regular"];
  const tone = order.find((t) => liveTones.includes(t)) ?? "regular";
  return { label: liveTones.length + " live", tone };
}'''

CLUBROW_TSX = r'''"use client";

import { useState } from "react";
import Link from "next/link";
import { leagueStatusFor, clubFootballStatus, CLUB_FOOTBALL_CHILDREN } from "@/lib/leagueStatus";

// Expandable Club Football row for the /sports console. The parent shows an
// aggregate status (live if any competition or league is in season); expanding
// reveals the competitions and league hubs, each with its own season status.
// Client component because of the open/close toggle.

const TONE_COLOR: Record<string, string> = {
  regular: "#10b981",
  playoffs: "#f59e0b",
  worldcup: "#a855f7",
  offseason: "#55556A",
};

function shortStatus(label: string): string {
  return label.replace(/^Live\s*-\s*/, "");
}

const SECTIONS = ["Competitions", "Leagues"] as const;

export default function ClubFootballRow({
  href,
  label,
  dim = false,
}: {
  href: string;
  label: string;
  dim?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = clubFootballStatus();
  const color = TONE_COLOR[status.tone];

  return (
    <div className="border-t" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] transition-colors hover:bg-[var(--bg-card-hover)]"
        style={{ color: dim ? "var(--text-muted)" : "var(--text)" }}
      >
        <span
          className="inline-block rounded-full flex-shrink-0"
          style={{ width: 7, height: 7, background: color }}
          aria-hidden="true"
        />
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="text-[10px] whitespace-nowrap" style={{ color }}>
          {status.label}
        </span>
        <span
          className="text-[var(--text-dim)] transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none", fontSize: "10px" }}
          aria-hidden="true"
        >
          &#9656;
        </span>
      </button>

      {open && (
        <div style={{ background: "var(--bg)" }}>
          {SECTIONS.map((sec) => (
            <div key={sec}>
              <div
                className="pl-6 pr-2.5 py-1 text-[9px] tracking-widest uppercase"
                style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
              >
                {sec}
              </div>
              {CLUB_FOOTBALL_CHILDREN.filter((c) => c.section === sec).map((c) => {
                const s = leagueStatusFor(c.href);
                const tone = s?.tone ?? "offseason";
                const dot = TONE_COLOR[tone];
                const live = !!s && tone !== "offseason";
                return (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="flex items-center gap-2 pl-6 pr-2.5 py-1.5 text-[12px] transition-colors hover:bg-[var(--bg-card-hover)]"
                    style={{ color: live ? "var(--text)" : "var(--text-muted)" }}
                  >
                    <span
                      className="inline-block rounded-full flex-shrink-0"
                      style={{ width: 6, height: 6, background: dot }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{c.label}</span>
                    {s && (
                      <span className="text-[10px] whitespace-nowrap" style={{ color: dot }}>
                        {shortStatus(s.label)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
'''

CONSOLE_TSX = r'''import Link from "next/link";
import { leagueStatusFor, clubFootballStatus, type LeagueStatus } from "@/lib/leagueStatus";
import ClubFootballRow from "./ClubFootballRow";

// Sticky sidebar for /sports, the cross-sport analogue of app/HomeSidebar.
// Lives beside the map at lg+ (col-span-4) and stacks below on mobile.
//   1. League hubs - dense list of every live hub, grouped into "In season"
//      (regular / playoffs / world cup) and "Offseason", each row carrying a
//      color-coded dot + short live-status label from lib/leagueStatus. The
//      Club Football row is expandable (ClubFootballRow) and uses an aggregate
//      status so it sorts into In-season whenever any competition or league is
//      active.
//   2. Deep-dives  - the cross-sport feature pages.
//   3. Methodology / What's new CTAs.
// Server component. Hub data is passed in from page.tsx (no new fetch).

const CLUB_FOOTBALL_HREF = "/teams/football";

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

function statusFor(href: string): LeagueStatus | null {
  return href === CLUB_FOOTBALL_HREF ? clubFootballStatus() : leagueStatusFor(href);
}

export default function SportsConsole({
  hubs,
  deepDives,
}: {
  hubs: ConsoleHub[];
  deepDives: ConsoleDeepDive[];
}) {
  const ranked: RankedHub[] = hubs.map((h) => ({ ...h, status: statusFor(h.href) }));
  const inSeason = ranked
    .filter((h) => h.status && h.status.tone !== "offseason")
    .sort((a, b) => TONE_RANK[a.status!.tone] - TONE_RANK[b.status!.tone] || a.label.localeCompare(b.label));
  const offseason = ranked
    .filter((h) => !h.status || h.status.tone === "offseason")
    .sort((a, b) => a.label.localeCompare(b.label));

  const renderRow = (h: RankedHub, dim: boolean) =>
    h.href === CLUB_FOOTBALL_HREF ? (
      <ClubFootballRow key={h.href} href={h.href} label={h.label} dim={dim} />
    ) : (
      <HubRow key={h.href} hub={h} dim={dim} />
    );

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
          {inSeason.map((h) => renderRow(h, false))}
          {offseason.length > 0 && <GroupLabel>Offseason &middot; {offseason.length}</GroupLabel>}
          {offseason.map((h) => renderRow(h, true))}
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


def patch_leaguestatus():
    if not os.path.isfile(LEAGUESTATUS):
        fail(LEAGUESTATUS + " not found. Run from the repo root.")
    with open(LEAGUESTATUS, "r", encoding="utf-8") as f:
        ls = f.read()
    orig = ls
    backed = False
    if "tournaments/champions-league" not in ls:
        if LS_CHILD_ANCHOR not in ls:
            fail("child anchor (the /teams/nrl line) not found in " + LEAGUESTATUS + ". Run the console redesign first.")
        ls = ls.replace(LS_CHILD_ANCHOR, LS_CHILD_INSERT, 1)
    if "CLUB_FOOTBALL_CHILDREN" not in ls:
        if LS_EXPORT_ANCHOR not in ls:
            fail("export anchor (end of leagueStatusFor) not found in " + LEAGUESTATUS + ".")
        ls = ls.replace(LS_EXPORT_ANCHOR, LS_EXPORT_INSERT, 1)
    if ls != orig:
        shutil.copyfile(LEAGUESTATUS, LEAGUESTATUS + ".v3.bak")
        with open(LEAGUESTATUS, "w", encoding="utf-8", newline="\n") as f:
            f.write(ls)
        print("  patched " + LEAGUESTATUS + " (+ 14 child statuses, CLUB_FOOTBALL_CHILDREN, clubFootballStatus)")
    else:
        print("  skip    " + LEAGUESTATUS + " (already has Club Football children)")


def write_file(path, content, label):
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            if f.read() == content:
                print("  skip    " + path + " (unchanged)")
                return
        shutil.copyfile(path, path + ".v3.bak")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("  wrote   " + path + " (" + label + ")")


def main():
    if not os.path.isfile(CONSOLE):
        fail(CONSOLE + " not found. Run the console redesign first, from the repo root.")
    patch_leaguestatus()
    write_file(CLUBROW, CLUBROW_TSX, "expandable Club Football row")
    write_file(CONSOLE, CONSOLE_TSX, "Club Football via ClubFootballRow + aggregate status")
    print()
    print("Done. Run your TS type check, then preview /sports before committing.")


if __name__ == "__main__":
    main()
