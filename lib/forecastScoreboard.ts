import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The election ledger: every forecast this site published, scored against the
// result once the count is final. Built by scripts/forecast/score_forecasts.py
// from the pre-election snapshots build_forecast.py freezes automatically.
//
// Committed with [vercel skip] by the same job that refreshes the forecast, so
// this reads the GitHub raw copy through ISR (remote wins) exactly like
// lib/forecast.ts. It shares the "forecast-weekly" tag, because it is the same
// job doing the pushing.

export type ScoredBinary = {
  key: string;
  label: string;
  p: number;
  outcome: 0 | 1;
  brier: number;
  marketP?: number;
  marketBrier?: number;
};
export type ScoredInterval = {
  key: string;
  label: string;
  median: number;
  lo: number | null;
  hi: number | null;
  actual: number;
  err: number;
  inside?: boolean;
};
export type ScoreSummary = {
  binaries: number;
  intervals: number;
  brier?: number;
  correct?: number;
  picks?: number;
  marketBrier?: number;
  pricedBrier?: number;
  priced?: number;
  skill?: number | null;
  mae?: number;
  coverage?: number;
  banded?: number;
  races?: number;
};
export type ResolvedRace = {
  code: string;
  country: string;
  election: string;
  forecastFrom: string;
  daysBefore: number | null;
  note?: string | null;
  sources: string[];
  binaries: ScoredBinary[];
  intervals: ScoredInterval[];
  summary: ScoreSummary;
};
export type PendingRace = {
  code: string;
  country: string;
  election: string;
  daysAway: number | null;
  forecastFrom: string;
  awaitingResult: boolean;
};
export type CalibrationRow = {
  lo: number;
  hi: number;
  n: number;
  said: number | null;
  happened: number | null;
};
export type ForecastScoreboard = {
  built: string;
  resolved: ResolvedRace[];
  pending: PendingRace[];
  totals: ScoreSummary;
  calibration: CalibrationRow[];
};

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/forecast-scoreboard.json";

export async function getForecastScoreboard(): Promise<ForecastScoreboard | null> {
  let local: ForecastScoreboard | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "forecast-scoreboard.json"), "utf-8"),
    ) as ForecastScoreboard;
  } catch {
    /* no build-time copy: the ledger is allowed not to exist yet */
  }
  try {
    const res = await fetch(GH_RAW, {
      next: { revalidate: 21600, tags: ["forecast-weekly"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as ForecastScoreboard;
      if (remote?.built && (!local || remote.built >= local.built)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

/** The next race to settle, for the "nothing graded yet" copy. */
export function nextToSettle(sb: ForecastScoreboard | null): PendingRace | null {
  if (!sb?.pending?.length) return null;
  return sb.pending.find((p) => !p.awaitingResult) ?? sb.pending[0];
}

/** Races that have voted with no result filed. A visible to-do, not an error. */
export function awaitingResults(sb: ForecastScoreboard | null): PendingRace[] {
  return (sb?.pending ?? []).filter((p) => p.awaitingResult);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
