import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Election forecasts (US 2026 House, next UK general election). A weekly
// GitHub Action re-scrapes the polling sources, reruns the simulation and
// commits public/data/forecast.json with [vercel skip]; this loader reads
// the GitHub raw copy via ISR (remote wins) with the build-time file as
// fallback, so refreshes appear without a Vercel build — the same pattern
// as the conflicts dataset.

// Election dates. `electionDate` + `electionConfidence` come from
// lib/electionHubsMeta.ts through scripts/forecast/hub_dates.py, so the date a
// forecast models is the same date the hub advertises. `electionAssumed` is the
// pre-2026-08-30 key, kept optional so a page rendering an older forecast.json
// during a rollout still finds a date. Read them through forecastDate().
export type ForecastDated = {
  electionDate?: string;
  electionConfidence?: "confirmed" | "assumed";
  electionAssumed?: string;
  election?: string;
};

/** The date a block models, and whether it is officially set. */
export function forecastDate(f: ForecastDated | null | undefined): {
  iso: string | null;
  confirmed: boolean;
} {
  const iso = f?.electionDate ?? f?.election ?? f?.electionAssumed ?? null;
  return { iso, confirmed: f?.electionConfidence === "confirmed" };
}

/** "7 November 2026" for a confirmed date, else "modelled as 2026-11". */
export function forecastDateLabel(f: ForecastDated | null | undefined): string {
  const { iso, confirmed } = forecastDate(f);
  if (!iso) return "date not set";
  if (!confirmed) return `modelled as ${iso.slice(0, 7)}`;
  const [y, m, d] = iso.split("-").map(Number);
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][m - 1];
  return `${d} ${month} ${y}`;
}

export type SeatRange = { median: number; lo: number; hi: number };
export type UkTrendPoint = { date: string; n: number } & Partial<Record<"con" | "lab" | "ld" | "ref" | "grn" | "snp", number>>;
export type UkSim = {
  seats: Record<string, SeatRange>;
  niSeats: number;
  majorityNeeds: number;
  pLargest: Record<string, number>;
  pMajority: Record<string, number>;
  pHung: number;
  monthsOut: number;
  sims: number;
  nat2024: Record<string, number>;
};
export type UkForecast = ForecastDated & {
  average: Record<string, number>;
  pollsters: number;
  latestPollDate: string | null;
  trend: UkTrendPoint[];
  sim: UkSim;
  sources: string[];
};
export type SenateForecast = {
  races: number;
  carryover: { D: number; R: number };
  seatsUp: { D: number; R: number };
  senateNow: { D: number; R: number };
  demSeats: SeatRange;
  pDemControl: number;
  competitive: { state: string; held: string; score: number; retiring: boolean; pDem: number }[];
  sims: number;
  source: string;
};
export type GovernorsForecast = {
  races: number;
  carryover: { D: number; R: number };
  seatsUp: { D: number; R: number };
  governorsNow: { D: number; R: number };
  demSeats: SeatRange;
  pDemMajority: number;
  pRepMajority: number;
  competitive: { state: string; held: string; score: number; retiring: boolean; pDem: number }[];
  sims: number;
  source: string;
};
export type UsForecast = ForecastDated & {
  margin: number;
  sigma: number;
  aggregators: { source: string; dem: number | null; rep: number | null; updated: string | null }[];
  demSeats: SeatRange;
  pDemHouse: number;
  fit: { a: number; b: number; residSd: number; cycles: [number, number, number][] };
  monthsOut: number;
  sims: number;
  sources: string[];
  senate?: SenateForecast | null;
  governors?: GovernorsForecast | null;
};
export type NzForecast = ForecastDated & {
  average: Record<string, number>;
  pollsters: number;
  latestPollDate: string | null;
  seats: Record<string, SeatRange>;
  pRightBloc: number;
  pLeftBloc: number;
  pNeither: number;
  monthsOut: number;
  sims: number;
  sources: string[];
};
export type IlForecast = ForecastDated & {
  parties: { name: string; seats: number }[];
  polls: number;
  pollsters: number;
  latestPollDate: string | null;
  gov: { avg: number | null; pMajority: number | null };
  monthsOut: number;
  sims: number;
  sources: string[];
};
export type Matchup = { a: string; b: string; avgA: number; avgB: number; pA: number; polls: number; latest: string | null };
export type RoundShares = { shares: Record<string, number>; polls: number; latest: string | null };
export type BrForecast = ForecastDated & { firstRound: RoundShares; runoffs: Matchup[]; monthsOut: number; sources: string[] };
export type FrForecast = ForecastDated & { firstRound: RoundShares; runoffs: Matchup[]; monthsOut: number; sources: string[] };
export type ForecastFile = {
  built: string;
  method: string;
  uk: UkForecast;
  us: UsForecast | null;
  nz?: NzForecast | null;
  il?: IlForecast | null;
  br?: BrForecast | null;
  fr?: FrForecast | null;
  history: { date: string; uk: Record<string, number>; us: { margin: number } | null; ukSeats: Record<string, number>; usDemSeats: number | null }[];
};

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/forecast.json";

export async function getForecast(): Promise<ForecastFile | null> {
  let local: ForecastFile | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "forecast.json"), "utf-8"),
    ) as ForecastFile;
  } catch {
    /* no build-time copy */
  }
  try {
    // Tagged so forecast-weekly.yml flushes this right after its Mon/Wed/Fri
    // 06:10 UTC push rather than leaving a fresh forecast unseen for up to 6h.
    // The window stays as the backstop if the ping is skipped or fails.
    const res = await fetch(GH_RAW, {
      next: { revalidate: 21600, tags: ["forecast-weekly"] }, // 6h backstop
    });
    if (res.ok) {
      const remote = (await res.json()) as ForecastFile;
      if (remote?.built && (!local || remote.built >= local.built)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export const FORECAST_COLORS: Record<string, string> = {
  con: "#0087DC", lab: "#E4003B", ld: "#FAA61A", ref: "#12B6CF",
  grn: "#02A95B", snp: "#FDF38E", pc: "#005B54", oth: "#9ca3af", ni: "#6b7280",
  dem: "#5B8DEF", rep: "#E06C75",
};
export const FORECAST_NAMES: Record<string, string> = {
  con: "Conservative", lab: "Labour", ld: "Liberal Democrat", ref: "Reform UK",
  grn: "Green", snp: "SNP", pc: "Plaid Cymru", oth: "Others", ni: "NI parties",
  dem: "Democrats", rep: "Republicans",
};

// New Zealand (display-ready hexes; ACT's yellow and NZ First's black are darkened/greyed for contrast)
export const NZ_COLORS: Record<string, string> = {
  nat: "#00529F", lab: "#D82A20", grn: "#098137", act: "#C9A800",
  nzf: "#3F3F46", tpm: "#EF4A42", top: "#0FA88F",
};
export const NZ_NAMES: Record<string, string> = {
  nat: "National", lab: "Labour", grn: "Green", act: "ACT",
  nzf: "NZ First", tpm: "Te Pāti Māori", top: "TOP",
};
