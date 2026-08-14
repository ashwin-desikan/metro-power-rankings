import "server-only";

// The Heartbreak Index, as a SHARED TEAM-PAGE FEATURE.
//
// SINGLE SOURCE OF TRUTH: scripts/heartbreak/build_heartbreak.py writes
// public/data/sports/heartbreak.json (every scored club) and reads the curated
// pang ledger public/data/sports/agony-events.json. The board at
// /sports/heartbreak and the per-team pill and panel all read those two files;
// nothing here recomputes a score.
//
// HOW A TEAM PAGE FINDS ITSELF IN THE BOARD: by its own href. The board links
// OUT to team pages through the sitewide resolveTeamLink, so this module runs
// exactly that resolution once over every club and keys the result by the
// resulting href. A team page then asks for "/teams/nhl/maple-leafs" and gets
// its row, or null. That way the outbound links on the board and the inbound
// pills on team pages can never disagree: they are the same resolution.
//
// Server-only. Registered in scripts/check-client-imports.mjs.

import { readFileSync } from "fs";
import { join } from "path";
import { resolveTeamLink } from "@/lib/teamLinks";

export type HeartbreakLonging = {
  honour: string;
  since: number;
  points: number;
  effective_years?: number;
};

export type HeartbreakWound = {
  kind: string;
  year: number;
  points: number;
  name?: string;
};

export type HeartbreakPang = {
  year: number;
  name: string;
  pangs: number;
  note?: string;
};

export type HeartbreakEntry = {
  slug: string;
  name: string;
  sport: string;
  country?: string;
  total: number;
  agony: number;
  despair: number;
  quadrant?: string;
  lastWon: number | null;
  rank: number;
  outOf: number;
  sportRank: number;
  sportOutOf: number;
  longing: HeartbreakLonging[];
  wounds: HeartbreakWound[];
  pangs: HeartbreakPang[];
  href: string;
};

type ClubRow = {
  slug: string;
  name: string;
  sport: string;
  country?: string;
  total: number;
  agony: number;
  despair: number;
  quadrant?: string;
  last_won?: number | null;
  longing?: HeartbreakLonging[];
  wounds?: HeartbreakWound[];
};

type AgonyEvent = {
  sport: string;
  slug: string;
  year: number;
  name: string;
  pangs: number;
  note?: string;
};

// The board's sport labels -> resolveTeamLink(sport, name, leagueHint) inputs.
// Kept identical to LINK_ARGS in app/sports/heartbreak/page.tsx: NPB routes
// through the "Baseball" branch (MLB miss -> NPB fallback), CBB needs the
// "CBB" hint to avoid colliding with the NBA.
const LINK_ARGS: Record<string, [string, string]> = {
  NFL: ["NFL", "NFL"],
  NBA: ["NBA", "NBA"],
  MLB: ["MLB", "MLB"],
  NHL: ["NHL", "NHL"],
  Football: ["Football", ""],
  CFL: ["Canadian Football", "CFL"],
  AFL: ["AFL", "AFL"],
  NRL: ["NRL", "NRL"],
  NPB: ["Baseball", ""],
  CFB: ["CFB", "CFB"],
  CBB: ["Basketball", "CBB"],
};

let _byHref: Map<string, HeartbreakEntry> | null = null;

function build(): Map<string, HeartbreakEntry> {
  const p = join(process.cwd(), "public", "data", "sports", "heartbreak.json");
  const raw = JSON.parse(readFileSync(p, "utf-8")) as { clubs?: ClubRow[] };
  const clubs = (raw.clubs ?? []).filter((c) => c.total > 0);

  let events: AgonyEvent[] = [];
  try {
    const e = join(process.cwd(), "public", "data", "sports", "agony-events.json");
    events = (JSON.parse(readFileSync(e, "utf-8")) as { events?: AgonyEvent[] }).events ?? [];
  } catch {
    // The pang ledger is curated and optional: a club with no named event is
    // the normal case, so a missing file degrades the panel, never breaks it.
    events = [];
  }
  const pangsBySlug = new Map<string, HeartbreakPang[]>();
  for (const ev of events) {
    const list = pangsBySlug.get(ev.slug) ?? [];
    list.push({ year: ev.year, name: ev.name, pangs: ev.pangs, note: ev.note });
    pangsBySlug.set(ev.slug, list);
  }

  // The file is already sorted by total, descending, so file order IS world
  // rank. Sport rank is the same order restricted to one sport.
  const sportSeen = new Map<string, number>();
  const sportTotals = new Map<string, number>();
  for (const c of clubs) sportTotals.set(c.sport, (sportTotals.get(c.sport) ?? 0) + 1);

  const map = new Map<string, HeartbreakEntry>();
  clubs.forEach((c, i) => {
    const n = (sportSeen.get(c.sport) ?? 0) + 1;
    sportSeen.set(c.sport, n);
    const a = LINK_ARGS[c.sport];
    const href = a ? resolveTeamLink(a[0], c.name, a[1])?.href : undefined;
    if (!href) return; // a club with no team page simply has no pill
    map.set(href, {
      slug: c.slug,
      name: c.name,
      sport: c.sport,
      country: c.country,
      total: c.total,
      agony: c.agony,
      despair: c.despair,
      quadrant: c.quadrant,
      lastWon: c.last_won ?? null,
      rank: i + 1,
      outOf: clubs.length,
      sportRank: n,
      sportOutOf: sportTotals.get(c.sport) ?? n,
      longing: c.longing ?? [],
      wounds: c.wounds ?? [],
      pangs: (pangsBySlug.get(c.slug) ?? []).sort((x, y) => y.pangs - x.pangs),
      href,
    });
  });
  return map;
}

function index(): Map<string, HeartbreakEntry> {
  if (!_byHref) _byHref = build();
  return _byHref;
}

/** The heartbreak row for a team page href, or null if the club does not score. */
export function getHeartbreakByHref(href: string): HeartbreakEntry | null {
  return index().get(href) ?? null;
}

/**
 * The heartbreak row for a team page, or null. `league` is the TeamLink
 * discriminator the page already knows about itself; NPB pages live one level
 * deeper, which is why the href is built here rather than assumed.
 */
export function getHeartbreak(league: string, slug: string): HeartbreakEntry | null {
  const href = league === "npb" ? `/teams/baseball/npb/${slug}` : `/teams/${league}/${slug}`;
  return getHeartbreakByHref(href);
}

const HONOUR_LABEL: Record<string, string> = {
  league: "league title",
  "champions-league": "European Cup",
  "major trophy": "major trophy",
  "major final appearance": "major final",
};

/** "NHL title, 1967" / "never won it, founded 1969" — the one-line ache. */
export function longingLine(e: HeartbreakEntry): string {
  const l = e.longing[0];
  if (!l) return e.lastWon ? `Won it in ${e.lastWon}` : "Never won it";
  if (l.honour.startsWith("first ")) return `Never won it, waiting since ${l.since}`;
  const honour = HONOUR_LABEL[l.honour] ?? l.honour;
  return `${honour[0].toUpperCase()}${honour.slice(1)}, ${l.since}`;
}

export const WOUND_LABEL: Record<string, string> = {
  final_lost: "lost the final",
  conf_final_exit: "fell one round short",
  relegation_top: "relegated from the top flight",
  relegation_l2: "relegated from the second tier",
  relegation_scare: "survived a relegation scare",
  playoff_final_lost: "lost the playoff final",
  runner_up: "league runner-up",
  fa_cup_final_lost: "lost the FA Cup final",
  league_cup_final_lost: "lost the League Cup final",
  major_cup_final_lost: "lost the national cup final",
  minor_cup_final_lost: "lost the league cup final",
  early_exit: "playoff run died early",
  "champions-league_final_lost": "lost the European Cup final",
  "europa-league_final_lost": "lost the Europa League final",
  "cup-winners-cup_final_lost": "lost the Cup Winners' Cup final",
  "inter-cities-fairs-cup_final_lost": "lost the Fairs Cup final",
  "conference-league_final_lost": "lost the Conference League final",
};

/** One wound, in plain language. Named pang events keep their own name. */
export function woundText(w: HeartbreakWound): string {
  if (w.kind === "agony_event" && w.name) return `${w.name}, ${w.year}`;
  return `${WOUND_LABEL[w.kind] ?? w.kind.replace(/_/g, " ")}, ${w.year}`;
}
