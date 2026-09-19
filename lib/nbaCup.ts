import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The NBA Cup (In-Season Tournament) championship game, one row per edition.
//
// WHY IT HAS A FILE. The final counts toward neither the regular season nor the
// playoffs in NBA.xlsx, so it sits in the weekly cumulative record and in neither
// season column. That is what made the season standings' derived playoff record a
// game high for the two finalists until 2026-09-19. Ashwin ruled the final counts
// as a POSTSEASON game for standings tracking, which needs its DATE: before it the
// week's record is all regular season, after it the Cup result belongs in the
// playoff column (see recordsAtWeek in app/teams/nba/season/_shared/standingsSort).
//
// Hand-maintained, like the rankings under scripts/data/rankings-manual: one row a
// year, in December. `year` is the season's END year so it keys straight into
// public/data/nba/elo/seasons/<year>.json, and team names are the Elo data's short
// names ("Spurs", "Knicks"), not canonical franchise names.

export type NbaCupFinal = {
  year: number;
  season: string;
  date: string;
  west: string;
  east: string;
  score: string;
  winner: string;
  loser: string;
  mvp: string;
  viewers_m: number | null;
};

let _cache: NbaCupFinal[] | null = null;

export function getNbaCupFinals(): NbaCupFinal[] {
  if (_cache) return _cache;
  try {
    const raw = readFileSync(
      join(process.cwd(), "public", "data", "nba", "cup-finals.json"),
      "utf-8",
    );
    const doc = JSON.parse(raw) as { finals?: NbaCupFinal[] };
    _cache = (doc.finals ?? []).slice().sort((a, b) => b.year - a.year);
  } catch {
    // A missing or malformed file must not take the hub down: no Cup section, and
    // the standings fall back to treating every game as regular season or playoff.
    _cache = [];
  }
  return _cache;
}

/** The edition for one season, by its END year (2026 = the 2025-26 season). */
export function getNbaCupFinalForYear(year: number): NbaCupFinal | null {
  return getNbaCupFinals().find((f) => f.year === year) ?? null;
}

/** What the final did to one team's record that season: a win, a loss, or nothing
 *  because they were not in it. Team names are the Elo data's short names. */
export function cupResultFor(
  final: NbaCupFinal | null,
  teamName: string,
): { date: string; result: [number, number] } | null {
  if (!final) return null;
  if (final.winner === teamName) return { date: final.date, result: [1, 0] };
  if (final.loser === teamName) return { date: final.date, result: [0, 1] };
  return null;
}
