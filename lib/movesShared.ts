// Client-safe types + helpers for the moves ledger (public/data/sports/
// moves.json). Split out of lib/moves.ts because that file is `server-only`
// (it reads from disk) and these are imported by client components too
// (the sortable ledger table, the decade chart's category labels).

export type MoveEnd = {
  city: string;
  metro: string;
  metro_slug: string | null;
  name: string;
};

export type Move = {
  league: string;
  sport: string;
  franchise_slug: string;
  franchise_now: string;
  href: string;
  from: MoveEnd;
  to: MoveEnd;
  year: number;
  decade: string;
  same_metro: boolean;
  distance_km: number | null;
  seasons_before: number | null;
  titles_before: number | null;
  titles_after: number | null;
  returned: boolean;
  replaced_by: { name: string; year: number } | null;
};

export type MetroTally = {
  metro_slug: string;
  departures: number;
  arrivals: number;
  net: number;
};

export type MoveSummaryEntry = {
  franchise: string;
  league: string;
  from: string;
  to: string;
  year: number;
  distance_km: number;
};

export type MovesSummary = {
  by_league: Record<string, number>;
  by_decade: Record<string, number>;
  by_sport: Record<string, number>;
  top_losing_metros: MetroTally[];
  top_gaining_metros: MetroTally[];
  longest: MoveSummaryEntry[];
  shortest: MoveSummaryEntry[];
  busiest_decade_by_league: Record<string, string | null>;
  returns: number;
  total_moves: number;
};

export type MovesData = {
  as_of: string;
  count: number;
  moves: Move[];
  summary: MovesSummary;
};

export const LEAGUE_LABEL: Record<string, string> = {
  nfl: "NFL", nba: "NBA", nhl: "NHL", mlb: "MLB", wnba: "WNBA", ipl: "IPL",
  football: "Football", cfl: "CFL", afl: "AFL", nrl: "NRL",
  "rugby-union": "Rugby Union", npb: "NPB", "cricket-t20": "T20",
};

export function leagueLabel(lg: string): string {
  return LEAGUE_LABEL[lg] ?? lg.toUpperCase();
}
