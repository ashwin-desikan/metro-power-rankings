import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The electoral-systems layer: the Gallagher index of disproportionality for
// every legislative election the atlas holds vote shares for, plus a curated
// table of what system each chamber actually uses.
//
// Built by scripts/elections/build_systems.py from public/data/*-elections.json.
// Read at build time like the rest of the election data, because the source is
// the hub JSON rather than a scheduled scrape: a rebuild only matters when a
// hub gains an election, which needs a deploy anyway.

export type SystemElection = {
  id: string;
  year: number;
  label: string;
  lsq: number;
  coverage: number;
  turnout: number | null;
  unfree: "partial" | "unfree" | null;
  caveat: boolean;
};
export type TurnoutPoint = { year: number; turnout: number; unfree?: string | null };
export type TurnoutStats = {
  n: number;
  latest: TurnoutPoint;
  median: number | null;
  medianPost1945: number | null;
  high: TurnoutPoint;
  low: TurnoutPoint;
};
export type SystemHub = {
  code: string;
  seriesKind: "legislative" | "presidential";
  turnout: TurnoutStats | null;
  family: string;
  familyLabel: string;
  chamber: string;
  threshold: string | null;
  note: string | null;
  scored: number;
  skipped: number;
  skippedSample: { id: string; year: number; why: string }[];
  noVoteShares: number;
  notSeatBased: number;
  gapReason: string | null;
  median: number | null;
  latest: SystemElection | null;
  worst: SystemElection | null;
  best: SystemElection | null;
  series: SystemElection[];
};
export type ElectionSystemsFile = {
  built: string;
  method: string;
  families: Record<string, string>;
  hubs: SystemHub[];
};

let _cache: ElectionSystemsFile | null = null;

export function getElectionSystems(): ElectionSystemsFile {
  return (_cache ??= JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "election-systems.json"), "utf-8"),
  ) as ElectionSystemsFile);
}

/**
 * Where an index sits on the scale readers actually care about. The bands are
 * conventional in the literature rather than invented here: under 2 is the
 * pure-PR territory of the Netherlands and post-apartheid South Africa, and
 * over 15 is the range where a plurality system has stopped tracking votes.
 */
export function band(lsq: number): { label: string; color: string } {
  if (lsq < 2) return { label: "seats track votes", color: "#4ECDC4" };
  if (lsq < 5) return { label: "mildly disproportional", color: "#5B8DEF" };
  if (lsq < 10) return { label: "clearly disproportional", color: "#D97706" };
  if (lsq < 15) return { label: "heavily disproportional", color: "#E2628B" };
  return { label: "seats barely track votes", color: "#8E1B1B" };
}
