import { readFileSync } from "fs";
import { join } from "path";
import "server-only";
import { getFranchiseByCanonical, getHistoricalFranchises, nflSlugForCanonical } from "@/lib/nfl";

// One season's individual honours, sliced from the workbook's award-winners
// file, which is keyed by TEAM (canonical franchise name) then by award
// label, not by year. This reader flattens it back to "everyone who won
// anything in year Y" so a season page can show it.
//
// build-nfl-data.py also emits pro-bowl-counts.json, but that file is a
// per-franchise CAREER total with no year field at all, so it cannot be
// sliced by season and is deliberately not read here. See the Backlog note
// this file was built against: guessing a per-season Pro Bowl list from a
// career count would be inventing data the workbook does not have.
//
// The literal path below is read only here, in one place, per
// scripts/DATA-READS-RECIPE.md: every segment under public/data is a string
// literal, so the Vercel file tracer scopes this route to this one file
// rather than globbing all of public/data.

export type NflSeasonAward = {
  /** The workbook's own label, e.g. "AP NFL MVP", "All-Pro". */
  award: string;
  player: string;
  position: string | null;
  /** The workbook's canonical franchise key, so a season page can swap in the
   *  name the club carried THAT YEAR (the 1980 Oilers, not the Titans). */
  canonical: string;
  /** Display name of the winner's team TODAY, e.g. "Green Bay Packers". A
   *  caller that knows the season should override it with the era name. */
  team: string | null;
  /** The site slug for the team, or null when it resolves to no page. */
  slug: string | null;
};

type RawAwardEntry = { year: number; player: string; position: string | null };
type RawAwardWinners = Record<string, Record<string, RawAwardEntry[]>>;

let _raw: RawAwardWinners | null = null;
function readAwardWinners(): RawAwardWinners {
  if (_raw) return _raw;
  _raw = JSON.parse(
    readFileSync(
      join(process.cwd(), "public", "data", "nfl", "award-winners.json"),
      "utf-8",
    ),
  ) as RawAwardWinners;
  return _raw;
}

let _historicalNameByCanonical: Map<string, string> | null = null;
function historicalDisplayName(canonical: string): string | null {
  if (!_historicalNameByCanonical) {
    _historicalNameByCanonical = new Map();
    for (const h of getHistoricalFranchises()) {
      _historicalNameByCanonical.set(h.canonical, h.display_name || h.name);
    }
  }
  return _historicalNameByCanonical.get(canonical) ?? null;
}

function teamDisplayName(canonical: string): string | null {
  return (
    getFranchiseByCanonical(canonical)?.name ??
    historicalDisplayName(canonical) ??
    canonical
  );
}

/** Every award winner for one season, across every franchise, current or defunct. */
export function getNflSeasonAwards(year: number): NflSeasonAward[] {
  const raw = readAwardWinners();
  const out: NflSeasonAward[] = [];
  for (const [canonical, awardsByLabel] of Object.entries(raw)) {
    for (const [award, entries] of Object.entries(awardsByLabel)) {
      for (const e of entries) {
        if (e.year !== year) continue;
        out.push({
          award,
          canonical,
          player: e.player,
          position: e.position || null,
          team: teamDisplayName(canonical),
          slug: nflSlugForCanonical(canonical),
        });
      }
    }
  }
  return out;
}
