// Real-terms deflation for /business/markets. Pure functions, no imports, so
// the same code runs in the server page (which states the real annualised
// return in prose) and in the two client charts (which toggle between nominal
// and real). One implementation means the sentence under the chart can never
// disagree with the line above it.
//
// THE DATA IS ANNUAL, THE SERIES IS DAILY. country_cpi holds one index level a
// year, so a naive lookup would deflate every day in 1974 by the same number
// and put a visible step at each 1 January that no price actually made. Each
// annual average is therefore anchored at 1 July, the middle of the period it
// describes, and interpolated linearly between anchors. That is the standard
// treatment and it produces a smooth deflator without inventing precision the
// source does not have.
//
// OUTSIDE THE CPI RANGE. Before the first CPI year the series is CLAMPED AWAY,
// not extrapolated. Holding the earliest index level flat backwards would
// assert zero inflation for a period that had plenty of both inflation and
// deflation, and because the deflator would then be a constant the chart would
// look perfectly plausible while being wrong. Dropping those points is visible
// and honest: the Dow's real view starts in 1913 because that is when the US
// CPI series starts, and the page says so.
//
// After the last CPI year the deflator is held flat, which is unavoidable: the
// index for the current year does not exist yet. The effect is that the most
// recent months are treated as already being in base-year money, which
// understates inflation by at most one year's worth. The base year is always
// stated so a reader can see how stale it is.

export type MarketCpi = {
  iso3: string;
  country: string | null;
  /** why this CPI is the right one, e.g. that a USD contract uses the US CPI */
  basis: string;
  first: number;
  base: number;
  /** [year, index level]; the level's own base year is arbitrary and cancels in the ratio */
  series: [number, number][];
};

export type Deflator = {
  /** the money real values are expressed in */
  baseYear: number;
  /** earliest year with a usable CPI; points before it are dropped */
  minYear: number;
  /** nominal -> real, for an ISO date string */
  at: (date: string, value: number) => number;
};

const MID_YEAR_MONTH = 6; // July, zero-indexed

export function makeDeflator(cpi: MarketCpi | null | undefined): Deflator | null {
  if (!cpi || !cpi.series || cpi.series.length < 2) return null;
  const pts = cpi.series
    .filter(([y, v]) => Number.isFinite(y) && Number.isFinite(v) && v > 0.01)
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;

  const ts = pts.map(([y]) => Date.UTC(y, MID_YEAR_MONTH, 1));
  const vs = pts.map(([, v]) => v);
  const base = vs[vs.length - 1];

  function level(t: number): number {
    if (t <= ts[0]) return vs[0];
    if (t >= ts[ts.length - 1]) return vs[vs.length - 1];
    let a = 0;
    let b = ts.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (ts[m] <= t) a = m;
      else b = m;
    }
    const f = (t - ts[a]) / (ts[b] - ts[a]);
    return vs[a] + f * (vs[b] - vs[a]);
  }

  return {
    baseYear: pts[pts.length - 1][0],
    minYear: pts[0][0],
    at: (date, value) => (value * base) / level(Date.parse(`${date}T00:00:00Z`)),
  };
}

/** Deflate a dated series, dropping anything earlier than the CPI itself. */
export function deflateSeries(series: [string, number][], d: Deflator): [string, number][] {
  const out: [string, number][] = [];
  for (const [date, v] of series) {
    if (Number(date.slice(0, 4)) < d.minYear) continue;
    out.push([date, d.at(date, v)]);
  }
  return out;
}

/** Compound annual growth between the ends of a series, as a percentage. */
export function cagrPct(series: [string, number][]): number | null {
  if (series.length < 2) return null;
  const first = series[0][1];
  const last = series[series.length - 1][1];
  const years =
    (Date.parse(`${series[series.length - 1][0]}T00:00:00Z`) -
      Date.parse(`${series[0][0]}T00:00:00Z`)) /
    31557600000;
  if (!(first > 0) || years <= 1) return null;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}
