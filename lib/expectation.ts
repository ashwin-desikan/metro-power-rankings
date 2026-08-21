import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The cross-sport expectation layer: one home-advantage series per sport, on a
// single scale, built by scripts/expectation/build_home_advantage.py from the
// two shipped ledgers.
//
// 🔴 The measure is Elo points, not home-win share, because home-win share is
// NOT comparable between a sport with draws and one without. See the builder's
// docstring; the page says it in plain words too.

export type HomeAdvantageRow = {
  /** "1888-89" for football, "1921" for the NFL. */
  season: string;
  /** The calendar year the season ended, for the x axis. */
  year: number;
  games: number;
  window_games: number;
  home: number;
  draw: number;
  away: number;
  /** Elo points a home side is effectively spotted, five-season window. */
  hfa: number;
  season_home: number | null;
};

export type HomeAdvantageSeries = {
  key: string;
  label: string;
  accent: string;
  draws: boolean;
  rows: HomeAdvantageRow[];
};

export type HomeAdvantage = {
  meta: {
    generated_at: string;
    window: number;
    measure: string;
    unit: string;
    method: string;
    counted: string;
    sources: string[];
    football_ledger_generated_at: string;
  };
  series: HomeAdvantageSeries[];
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

async function load<T>(file: string, isNewer: (remote: T, local: T | null) => boolean): Promise<T | null> {
  let local: T | null = null;
  try {
    local = JSON.parse(readFileSync(join(process.cwd(), "public", "data", file), "utf-8")) as T;
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 86400, tags: ["expectation"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (isNewer(remote, local)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getHomeAdvantage(): Promise<HomeAdvantage | null> {
  return load<HomeAdvantage>("expectation/home-advantage.json", (remote, local) =>
    Boolean(
      remote?.meta?.generated_at &&
        (!local || remote.meta.generated_at >= local.meta.generated_at),
    ),
  );
}

/** First and last point of a series, plus its peak. The page's three numbers. */
export function seriesShape(s: HomeAdvantageSeries) {
  if (s.rows.length === 0) return null;
  const first = s.rows[0];
  const last = s.rows[s.rows.length - 1];
  const peak = s.rows.reduce((a, b) => (b.hfa > a.hfa ? b : a), s.rows[0]);
  return { first, last, peak, fall: peak.hfa - last.hfa };
}
