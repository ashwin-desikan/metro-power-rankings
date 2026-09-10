import { describe, it, expect } from "vitest";
import {
  fmtEurM,
  fmtEurSigned,
  isStubSeason,
  seasonMoneyBoard,
  spanMoneyBoard,
  type MoneyCountryFile,
  type MoneySeason,
} from "./footballMoneyShape";

// The PURE half only (lib/footballMoneyShape.ts): no fs, no fetch, no
// "server-only". Same split, same reason, as lib/clubValue.test.ts.

function season(p: Partial<MoneySeason> & { season: string }): MoneySeason {
  return {
    y: Number(p.season.slice(0, 4)),
    spent: 0, received: 0, net: 0, n_in: 0, n_out: 0, nofee_in: 0, nofee_out: 0,
    v_start: null, n_start: null, v_end: null, n_end: null, appreciation: null,
    biggest_in: null, biggest_out: null,
    ...p,
  };
}

function file(country: string, clubs: { club: string; slug: string | null; seasons: MoneySeason[] }[]): MoneyCountryFile {
  return {
    meta: { country, first_season: "2012-13", last_season: "2026-27", data_end: "2026-07-06", source_credit: "", generated_at: "" },
    clubs: clubs.map((c) => ({
      ...c, site_name: null, metro: null, metro_slug: null, first: c.seasons[0].season, last: c.seasons[c.seasons.length - 1].season,
      spent: 0, received: 0, net: 0, appreciation: null, seasons_valued: 0,
    })),
  };
}

describe("formatters", () => {
  it("switches to billions at 1000m and keeps a real minus sign", () => {
    expect(fmtEurM(412)).toBe("€412m");
    expect(fmtEurM(1550.8)).toBe("€1.55b");
    expect(fmtEurSigned(-1550.8)).toBe("−€1.55b");
    expect(fmtEurSigned(401)).toBe("+€401m");
    expect(fmtEurSigned(0)).toBe("€0m");
  });
  it("calls a season a stub when the data ends before its June", () => {
    expect(isStubSeason("2026-27", "2026-07-06")).toBe(true);
    expect(isStubSeason("2025-26", "2026-07-06")).toBe(false);
  });
});

describe("seasonMoneyBoard", () => {
  const eng = file("England", [
    { club: "A", slug: "a", seasons: [season({ season: "2024-25", spent: 300, received: 100, net: -200, v_start: 500, v_end: 560, appreciation: -140 })] },
    { club: "B", slug: "b", seasons: [season({ season: "2024-25", spent: 40, received: 90, net: 50, v_start: 200, v_end: 260, appreciation: 110 })] },
    { club: "C", slug: "c", seasons: [season({ season: "2024-25", spent: 80, received: 0, net: -80, nofee_in: 3 })] },  // unpriced squad
    { club: "D", slug: null, seasons: [season({ season: "2024-25", spent: 999 })] },                                  // no slug: dropped
    { club: "E", slug: "e", seasons: [season({ season: "2023-24", spent: 10 })] },                                    // other season
  ]);
  const esp = file("Spain", [
    { club: "F", slug: "f", seasons: [season({ season: "2024-25", spent: 100, received: 0, net: -100, v_start: 300, v_end: 250, appreciation: -150 })] },
  ]);
  const rows = seasonMoneyBoard([["england", eng], ["spain", esp]], "2024-25");

  it("keeps one row per slugged club with a window that season", () => {
    expect(rows.map((r) => r.slug)).toEqual(["b", "a", "f", "c"]);   // appreciation desc, nulls last
  });
  it("ranks spend and appreciation WITHIN a league, appreciation only among the priced", () => {
    const by = Object.fromEntries(rows.map((r) => [r.slug, r]));
    expect([by.a.spend_rank, by.c.spend_rank, by.b.spend_rank]).toEqual([1, 2, 3]);
    expect([by.b.appreciation_rank, by.a.appreciation_rank, by.c.appreciation_rank]).toEqual([1, 2, null]);
    expect(by.f.spend_rank).toBe(1);   // Spain's own ladder, not fourth behind England
    expect(by.c.nofee).toBe(3);
  });
});

describe("spanMoneyBoard", () => {
  it("sums full seasons only and floors the return ratio at a 50m spend", () => {
    const eng = file("England", [
      { club: "A", slug: "a", seasons: [
        season({ season: "2024-25", spent: 100, received: 20, appreciation: 30 }),
        season({ season: "2025-26", spent: 100, received: 0, appreciation: 10 }),
        season({ season: "2026-27", spent: 500, received: 0 }),      // the stub: excluded
      ] },
      { club: "B", slug: "b", seasons: [season({ season: "2025-26", spent: 8, received: 0, appreciation: 40 })] },
    ]);
    const rows = spanMoneyBoard([["england", eng]]);
    const a = rows.find((r) => r.slug === "a")!;
    expect([a.spent, a.received, a.net, a.appreciation, a.seasons_valued]).toEqual([200, 20, -180, 40, 2]);
    expect(a.last).toBe("2025-26");
    expect(a.return_pct).toBeCloseTo(20);
    expect(rows.find((r) => r.slug === "b")!.return_pct).toBeNull();
  });
});
