import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveTeamLink, type TeamLink } from "./teamLinks";

// Cross-sport team valuations. Source rows are produced by
// scripts/build-valuations-data.py from the "Team Valuations" sheet of
// OtherLeagues.xlsx. Since 2026-08-18 the whole board is Sportico: the page
// sorts every row into ONE column, and a Forbes NFL figure above a Sportico
// football figure is not a ranking, it is two rankings interleaved. Sportico's
// 2026 list covers all 124 North American big-four clubs, so the board could
// move to one house and one vintage without losing a row. Canonical /teams
// links are resolved here via the shared resolveTeamLink() so routing stays DRY.

type RawRow = {
  year: number | null;
  team: string;
  league: string; // sheet value: a named league (NFL/NBA/MLB/NHL/F1/WNBA/NWSL),
                  // or a COUNTRY for men's football
  value_m: number;
  source: string;
  // Added 2026-09-24 alongside scripts/fans/valuations_extended.csv. Optional:
  // the Supabase team_valuations table only has these columns once the
  // pending migration in scripts/fans/pending/valuations_upsert.sql is
  // applied, and older rows loaded before that will simply omit them.
  method?: "published" | "transaction" | "speculative" | null;
  confidence?: "high" | "medium" | "low" | null;
  source_url?: string | null;
};

export type ValuationRow = {
  team: string; // name as it appears in the sheet
  displayName: string; // canonical name when matched, else the sheet name
  league: string; // sheet league/country label (shown verbatim)
  leagueHref: string; // link to the league hub (US) or football country hub
  sport: "NFL" | "NBA" | "NHL" | "MLB" | "Football" | "F1" | "WNBA" | "NWSL" | "AFL" | "NRL"
    | "CFL" | "NPB" | "Rugby" | "Handball" | "Volleyball" | "Basketball" | "College";
  valueM: number;
  valueLabel: string;
  year: number | null;
  source: string;
  /** Short provenance tag for the row, shown next to the figure. The board now
      takes the HIGHER of the published valuations it holds per team, so which
      house a figure came from is part of the number, not a footnote. */
  sourceTag: "Sportico" | "Football Benchmark";
  /** How the figure was derived, when the source row carries it (added
      2026-09-24 for scripts/fans/valuations_extended.csv rows): a formal
      annual valuation exercise ("published") vs. inferred from a real sale
      price ("transaction"). Null for older rows that predate this field. */
  method: RawRow["method"];
  /** Confidence in the figure, when the source row carries it. */
  confidence: RawRow["confidence"];
  /** Direct link to the source article, when the row carries one. */
  sourceUrl: string | null;
  href: string | null; // canonical team page, when matched
  leagueKey: TeamLink["league"] | null;
  slug: string | null;
  anchor: string; // stable row id for deep-links from team pages
};

// Sheet League values that name a LEAGUE rather than a football country. Each
// carries the hub its label links to, the sport chip it files under, and the
// (sport, leagueHint) pair resolveTeamLink() needs. A null resolver means the
// site has no per-team page for that league yet, so the row renders unlinked
// rather than pointing somewhere that only looks right.
type LeagueRoute = {
  hub: string;
  sport: ValuationRow["sport"];
  resolve: [sport: string, hint: string] | null;
};

const NAMED_LEAGUES: Record<string, LeagueRoute> = {
  NFL: { hub: "/teams/nfl", sport: "NFL", resolve: ["NFL", "NFL"] },
  NBA: { hub: "/teams/nba", sport: "NBA", resolve: ["NBA", "NBA"] },
  MLB: { hub: "/teams/mlb", sport: "MLB", resolve: ["MLB", "MLB"] },
  NHL: { hub: "/teams/nhl", sport: "NHL", resolve: ["NHL", "NHL"] },
  WNBA: { hub: "/teams/wnba", sport: "WNBA", resolve: ["WNBA", "WNBA"] },
  // NWSL clubs live in the women's football portal, which keys on the distinct
  // "W Football" sport label, not the men's "Football" one.
  NWSL: { hub: "/teams/wfootball", sport: "NWSL", resolve: ["W Football", "W Football"] },
  // Constructor pages shipped 2026-08-18 at /teams/f1/constructors/[slug], so
  // these rows link now. /teams/f1/[slug] is still CIRCUITS; the resolver goes
  // through teamLinks, which knows the difference.
  F1: { hub: "/teams/f1/constructors", sport: "F1", resolve: ["F1", "F1"] },
  // Added 2026-09-24 alongside scripts/fans/valuations_speculative.csv's AFL
  // and NRL rows. Team pages and resolution already existed (app/teams/afl,
  // app/teams/nrl, lib/teamLinks.ts's isAfl()/isNrl()); only the valuations
  // board's own league table was missing these two.
  AFL: { hub: "/teams/afl", sport: "AFL", resolve: ["AFL", "AFL"] },
  NRL: { hub: "/teams/nrl", sport: "NRL", resolve: ["NRL", "NRL"] },
  // Added 2026-09-24 alongside scripts/fans/pending/valuations_round2_supabase.csv.
  CFL: { hub: "/teams/cfl", sport: "CFL", resolve: ["CFL", "CFL"] },
  // NPB clubs share MLB's resolver pair -- isMlb() falls through to the NPB
  // lookup (/teams/baseball/npb) when no MLB franchise name matches, so this
  // reuses that path rather than adding a new isNpb().
  NPB: { hub: "/teams/baseball/npb", sport: "NPB", resolve: ["MLB", "MLB"] },
  // No per-team resolver exists yet for these hubs, so resolve stays null:
  // the league chip links to a real /teams hub, individual rows render
  // unlinked rather than guessing a slug that 404s.
  "Top 14": { hub: "/teams/rugby-union", sport: "Rugby", resolve: null },
  "Handball-Bundesliga": { hub: "/teams/handball", sport: "Handball", resolve: null },
  SuperLega: { hub: "/teams/volleyball", sport: "Volleyball", resolve: null },
  EuroLeague: { hub: "/teams/basketball/euroleague", sport: "Basketball", resolve: null },
  // WSL rides the same women's-football hub and resolver as NWSL -- both are
  // the "NWSL" sport tag on purpose so the existing women's-football chip,
  // filter and hub handling cover WSL rows without a new sport bucket.
  WSL: { hub: "/teams/wfootball", sport: "NWSL", resolve: ["W Football", "W Football"] },
  // College rows (scripts/fans/pending's CNBC/EADA athletic-department
  // figures) cover both football and basketball programs under one row, so
  // there is no single per-team hub to resolve into; the chip still links to
  // the CFB hub as the closest real page.
  College: { hub: "/teams/cfb", sport: "College", resolve: null },
};

// Football country -> league-hub slug under /teams/football/leagues/.
// 🔴 EVERY SLUG HERE MUST BE A HUB THAT IS ACTUALLY BUILT. Mexico used to map to
// "liga-mx" on the reasoning that the link would be "ready when the hub ships";
// the hub never shipped, `dynamicParams` is false on that route, and so the
// three Liga MX rows linked to a 404 for as long as the entry stood. A country
// with no hub is better served by the /teams/football fallback below, which is
// a real page. Turkey (added with Galatasaray, 2026-08-18) is in that position.
const FOOTBALL_COUNTRY_HUB: Record<string, string> = {
  England: "premier-league",
  Spain: "la-liga",
  Italy: "serie-a",
  Germany: "bundesliga",
  France: "ligue-1",
  Netherlands: "eredivisie",
  Portugal: "primeira-liga",
  Scotland: "scottish-premiership",
  "United States": "mls",
};

function footballCountryHref(country: string): string {
  const slug = FOOTBALL_COUNTRY_HUB[country];
  return slug ? `/teams/football/leagues/${slug}` : "/teams/football";
}

// Provenance, derived from the source string the sheet carries. Matched on a
// distinctive substring rather than the whole label, because the label carries
// a report title and a date that change with each edition while the house does
// not. An unrecognised source reads as Sportico, which is the board's default
// house; if a third source ever lands, add it here or every row of it will be
// mislabelled silently.
function sourceTagFor(source: string): ValuationRow["sourceTag"] {
  return /football benchmark/i.test(source) ? "Football Benchmark" : "Sportico";
}

export function formatValuationM(m: number): string {
  if (m >= 1000) {
    const b = m / 1000;
    const s = b.toFixed(2).replace(/\.?0+$/, "");
    return `$${s}B`;
  }
  return `$${Math.round(m)}M`;
}

function loadRaw(): RawRow[] {
  const file = join(process.cwd(), "public", "data", "valuations", "valuations.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { rows: RawRow[] };
  return parsed.rows ?? [];
}

let _rows: ValuationRow[] | null = null;
let _index: Map<string, ValuationRow> | null = null;

function build(): { rows: ValuationRow[]; index: Map<string, ValuationRow> } {
  if (_rows && _index) return { rows: _rows, index: _index };
  const raw = loadRaw();
  const rows: ValuationRow[] = raw.map((r) => {
    const route = NAMED_LEAGUES[r.league];
    const sport: ValuationRow["sport"] = route ? route.sport : "Football";
    const link = route
      ? route.resolve
        ? resolveTeamLink(route.resolve[0], r.team, route.resolve[1])
        : null
      : resolveTeamLink("Football", r.team);
    return {
      team: r.team,
      displayName: link?.displayName ?? r.team,
      league: r.league,
      leagueHref: route ? route.hub : footballCountryHref(r.league),
      sport,
      valueM: r.value_m,
      valueLabel: formatValuationM(r.value_m),
      year: r.year,
      source: r.source,
      sourceTag: sourceTagFor(r.source),
      method: r.method ?? null,
      confidence: r.confidence ?? null,
      sourceUrl: r.source_url ?? null,
      href: link?.href ?? null,
      leagueKey: link?.league ?? null,
      slug: link?.slug ?? null,
      anchor: link ? `${link.league}-${link.slug}` : `row-${r.team.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    };
  });
  const index = new Map<string, ValuationRow>();
  for (const row of rows) {
    if (row.leagueKey && row.slug) {
      const key = `${row.leagueKey}:${row.slug}`;
      const prev = index.get(key);
      if (!prev || row.valueM > prev.valueM) index.set(key, row);
    }
  }
  _rows = rows;
  _index = index;
  return { rows, index };
}

export function getAllValuations(): ValuationRow[] {
  return build().rows;
}

export type TeamValuation = {
  valueM: number;
  valueLabel: string;
  year: number | null;
  anchor: string;
};

export function getTeamValuation(
  leagueKey: TeamLink["league"],
  slug: string,
): TeamValuation | null {
  const row = build().index.get(`${leagueKey}:${slug}`);
  if (!row) return null;
  return { valueM: row.valueM, valueLabel: row.valueLabel, year: row.year, anchor: row.anchor };
}
