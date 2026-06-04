import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveTeamLink, type TeamLink } from "./teamLinks";

// Cross-sport team valuations. Source rows are produced by
// scripts/build-valuations-data.py from the "Team Valuations" sheet of
// OtherLeagues.xlsx (a curated, non-exhaustive latest-value-per-team set:
// Forbes for US leagues, Sportico for global football). Canonical /teams links
// are resolved here via the shared resolveTeamLink() so routing stays DRY.

type RawRow = {
  year: number | null;
  team: string;
  league: string; // sheet value: NFL/NBA/MLB/NHL, or a country for football
  value_m: number;
  source: string;
};

export type ValuationRow = {
  team: string; // name as it appears in the sheet
  displayName: string; // canonical name when matched, else the sheet name
  league: string; // sheet league/country label (shown verbatim)
  leagueHref: string; // link to the league hub (US) or football country hub
  sport: "NFL" | "NBA" | "NHL" | "MLB" | "Football";
  valueM: number;
  valueLabel: string;
  year: number | null;
  source: string;
  href: string | null; // canonical team page, when matched
  leagueKey: TeamLink["league"] | null;
  slug: string | null;
  anchor: string; // stable row id for deep-links from team pages
};

const US_LEAGUES: Record<string, string> = {
  NFL: "/teams/nfl",
  NBA: "/teams/nba",
  MLB: "/teams/mlb",
  NHL: "/teams/nhl",
};

// Football country -> league-hub slug under /teams/football/leagues/. The first
// eight exist today; Liga MX (Mexico) is not built yet but we still link to its
// canonical hub URL so the link is consistent and ready when the hub ships.
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
  Mexico: "liga-mx",
};

function leagueHrefFor(sheetLeague: string, isUs: boolean): string {
  if (isUs) return US_LEAGUES[sheetLeague] ?? "/sports";
  const slug = FOOTBALL_COUNTRY_HUB[sheetLeague];
  return slug ? `/teams/football/leagues/${slug}` : "/teams/football";
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
    const isUs = Object.prototype.hasOwnProperty.call(US_LEAGUES, r.league);
    const sport = (isUs ? r.league : "Football") as ValuationRow["sport"];
    const link = isUs
      ? resolveTeamLink(r.league, r.team, r.league)
      : resolveTeamLink("Football", r.team);
    return {
      team: r.team,
      displayName: link?.displayName ?? r.team,
      league: r.league,
      leagueHref: leagueHrefFor(r.league, isUs),
      sport,
      valueM: r.value_m,
      valueLabel: formatValuationM(r.value_m),
      year: r.year,
      source: r.source,
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
