import { describe, it, expect } from "vitest";
import {
  seasonToMonths,
  seasonValue,
  computeValueSurplusJoin,
  type ClubValueRecord,
  type ValueSurplusCandidate,
} from "./clubValueShape";

// Tests the PURE half (lib/clubValueShape.ts) directly: no fs, no fetch, no
// "server-only" import, so nothing here touches the network or the real
// public/data payloads. lib/clubValue.ts is the thin IO wrapper around this
// module — see its own header comment for why the split exists (the real
// "server-only" npm package throws when resolved outside a bundler's
// react-server condition, which is exactly what plain Node/Vitest does).

function club(slug: string, series: { m: string; v: number | null; n: number }[]): ClubValueRecord {
  return {
    club: slug,
    slug,
    metro: null,
    metro_slug: null,
    first: series[0]?.m ?? "",
    last: series[series.length - 1]?.m ?? "",
    months: series.length,
    peak: Math.max(0, ...series.map((s) => s.v ?? 0)),
    series,
  };
}

describe("seasonToMonths", () => {
  it("maps a season label to July through June, oldest first", () => {
    expect(seasonToMonths("2024-25")).toEqual([
      "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12",
      "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
    ]);
  });

  it("rolls the year forward across the turn", () => {
    const months = seasonToMonths("1999-00");
    expect(months[0]).toBe("1999-07");
    expect(months[months.length - 1]).toBe("2000-06");
  });

  it("returns twelve months for any well-formed season", () => {
    expect(seasonToMonths("2012-13")).toHaveLength(12);
  });

  it("returns [] for a malformed label rather than guessing", () => {
    expect(seasonToMonths("2024")).toEqual([]);
    expect(seasonToMonths("")).toEqual([]);
    expect(seasonToMonths("not-a-season")).toEqual([]);
  });
});

describe("seasonValue", () => {
  it("reads the start (July) and end (June) of the season, and the season's own peak", () => {
    // Nottingham Forest's real 2024-25 shape (the scoping note's worked
    // example): flat, then a step up in Oct, Dec, Mar and May.
    const c = club("nottingham-forest", [
      { m: "2024-07", v: 379.3, n: 34 },
      { m: "2024-09", v: 379.3, n: 34 },
      { m: "2024-10", v: 402.1, n: 32 },
      { m: "2024-12", v: 447.8, n: 34 },
      { m: "2025-03", v: 454.9, n: 27 },
      { m: "2025-06", v: 461.6, n: 28 },
    ]);
    const s = seasonValue(c, "2024-25");
    expect(s).not.toBeNull();
    expect(s!.start).toBe(379.3);
    expect(s!.end).toBe(461.6);
    expect(s!.peak).toBe(461.6);
    expect(s!.n_min).toBe(27);
  });

  it("returns null when the season's window has no series rows at all", () => {
    const c = club("test-fc", [{ m: "2030-01", v: 100, n: 20 }]);
    expect(seasonValue(c, "2010-11")).toBeNull();
  });

  it("returns all-null fields when every row in the window is unvalued (below the 15-player floor)", () => {
    const c = club("test-fc", [
      { m: "2024-07", v: null, n: 10 },
      { m: "2024-08", v: null, n: 11 },
    ]);
    const s = seasonValue(c, "2024-25");
    expect(s).toEqual({ start: null, end: null, peak: null, n_min: null });
  });

  it("is null for a malformed season, via seasonToMonths returning []", () => {
    const c = club("test-fc", [{ m: "2024-07", v: 100, n: 20 }]);
    expect(seasonValue(c, "bad")).toBeNull();
  });
});

describe("computeValueSurplusJoin", () => {
  const endMonth = "2025-06";

  function candidate(over: Partial<ValueSurplusCandidate> & { slug: string }): ValueSurplusCandidate {
    return { club: over.slug, country: "Spain", league: "Primera División", surplus: 0, ...over };
  }

  it("joins on slug and drops a candidate with no priced squad at all", () => {
    const candidates = [candidate({ slug: "real-madrid", surplus: 1 }), candidate({ slug: "no-value-data", surplus: -1 })];
    const values = new Map([
      ["real-madrid", club("real-madrid", [{ m: endMonth, v: 1220.5, n: 24 }])],
    ]);
    const rows = computeValueSurplusJoin(candidates, values, endMonth);
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("real-madrid");
    expect(rows[0].value_eur_m).toBe(1220.5);
  });

  it("drops a club whose end-month value is null (unpriced, or below the squad floor)", () => {
    const candidates = [candidate({ slug: "thin-squad" })];
    const values = new Map([["thin-squad", club("thin-squad", [{ m: endMonth, v: null, n: 9 }])]]);
    expect(computeValueSurplusJoin(candidates, values, endMonth)).toEqual([]);
  });

  it("ranks value and surplus WITHIN a league, never across two", () => {
    const candidates = [
      candidate({ slug: "a", league: "Primera División", surplus: 5 }),
      candidate({ slug: "b", league: "Primera División", surplus: -2 }),
      // A richer, worse-surplus club in a DIFFERENT league must not shift
      // either Spanish club's rank.
      candidate({ slug: "c", league: "Serie A", surplus: 10 }),
    ];
    const values = new Map([
      ["a", club("a", [{ m: endMonth, v: 100, n: 20 }])],
      ["b", club("b", [{ m: endMonth, v: 500, n: 20 }])],
      ["c", club("c", [{ m: endMonth, v: 9000, n: 20 }])],
    ]);
    const rows = computeValueSurplusJoin(candidates, values, endMonth);
    const byLeague = new Map(rows.map((r) => [r.slug, r]));
    expect(byLeague.get("a")!.value_rank).toBe(2); // 100 < 500 within Spain
    expect(byLeague.get("b")!.value_rank).toBe(1);
    expect(byLeague.get("c")!.value_rank).toBe(1); // alone in its own league
    expect(byLeague.get("a")!.surplus_rank_in_league).toBe(1); // 5 > -2 within Spain
    expect(byLeague.get("b")!.surplus_rank_in_league).toBe(2);
  });

  it("reproduces the scoping note's Girona worked example", () => {
    // Real 2023-24 -> 2024-25 shape: best-ever Spanish surplus, then a big
    // squad-value season with a heavily negative surplus.
    const candidates = [candidate({ slug: "girona-fc", league: "Primera División", surplus: -5.933 })];
    const values = new Map([
      ["girona-fc", club("girona-fc", [{ m: endMonth, v: 148.0, n: 25 }])],
    ]);
    const rows = computeValueSurplusJoin(candidates, values, endMonth);
    expect(rows[0].surplus).toBeCloseTo(-5.933, 3);
    expect(rows[0].value_eur_m).toBe(148.0);
  });

  it("sorts the overall output by value descending", () => {
    const candidates = [candidate({ slug: "small" }), candidate({ slug: "big" })];
    const values = new Map([
      ["small", club("small", [{ m: endMonth, v: 10, n: 20 }])],
      ["big", club("big", [{ m: endMonth, v: 900, n: 20 }])],
    ]);
    const rows = computeValueSurplusJoin(candidates, values, endMonth);
    expect(rows.map((r) => r.slug)).toEqual(["big", "small"]);
  });
});
