import { describe, it, expect } from "vitest";
import { deltaSince, series } from "./deltas";
import type { SimHistoryFile } from "@/lib/nflSim";

function hist(snaps: { date: string; rows: Record<string, { po: number; xw?: number }> }[]): SimHistoryFile {
  return {
    meta: { league: "nfl", season: 2026, generated_at: "2026-09-03", keep: 180 },
    snapshots: snaps.map((s) => ({
      date: s.date,
      games_played: 0,
      rows: Object.fromEntries(
        Object.entries(s.rows).map(([slug, r]) => [
          slug,
          { xw: r.xw ?? 0, div: 0, po: r.po, conf: 0, title: 0 },
        ]),
      ),
    })),
  };
}

describe("deltaSince", () => {
  it("returns null with fewer than two snapshots", () => {
    expect(deltaSince(hist([{ date: "2026-09-01", rows: { den: { po: 50 } } }]), "den", "po", 7)).toBeNull();
    expect(deltaSince(null, "den", "po", 7)).toBeNull();
  });

  it("finds the snapshot at least N days older than the newest", () => {
    const h = hist([
      { date: "2026-08-20", rows: { den: { po: 40 } } },
      { date: "2026-08-27", rows: { den: { po: 45 } } },
      { date: "2026-09-03", rows: { den: { po: 55 } } },
    ]);
    // 7 days back from 09-03 lands on 08-27, not the oldest 08-20 snapshot.
    expect(deltaSince(h, "den", "po", 7)).toBeCloseTo(10, 5);
  });

  it("falls back to the previous snapshot when nothing is old enough", () => {
    const h = hist([
      { date: "2026-09-01", rows: { den: { po: 50 } } },
      { date: "2026-09-03", rows: { den: { po: 55 } } },
    ]);
    expect(deltaSince(h, "den", "po", 30)).toBeCloseTo(5, 5);
  });

  it("skips a snapshot missing the slug and reaches an older one that has it", () => {
    const h = hist([
      { date: "2026-08-20", rows: { den: { po: 40 } } },
      { date: "2026-08-27", rows: {} }, // no data for den this date
      { date: "2026-09-03", rows: { den: { po: 55 } } },
    ]);
    expect(deltaSince(h, "den", "po", 7)).toBeCloseTo(15, 5);
  });

  it("returns null when the slug never appears in an earlier snapshot", () => {
    const h = hist([
      { date: "2026-08-27", rows: {} },
      { date: "2026-09-03", rows: { den: { po: 55 } } },
    ]);
    expect(deltaSince(h, "den", "po", 7)).toBeNull();
  });

  it("returns null when the newest snapshot lacks the slug", () => {
    const h = hist([
      { date: "2026-08-27", rows: { den: { po: 40 } } },
      { date: "2026-09-03", rows: { kc: { po: 55 } } },
    ]);
    expect(deltaSince(h, "den", "po", 7)).toBeNull();
  });

  it("rounds to one decimal", () => {
    const h = hist([
      { date: "2026-09-01", rows: { den: { po: 50.05 } } },
      { date: "2026-09-03", rows: { den: { po: 55.12 } } },
    ]);
    expect(deltaSince(h, "den", "po", 30)).toBeCloseTo(5.1, 5);
  });
});

describe("series", () => {
  it("collects the values present across snapshots in order", () => {
    const h = hist([
      { date: "2026-08-20", rows: { den: { po: 40 } } },
      { date: "2026-08-27", rows: {} },
      { date: "2026-09-03", rows: { den: { po: 55 } } },
    ]);
    expect(series(h, "den", "po")).toEqual([40, 55]);
  });

  it("returns an empty array for an unknown slug or missing history", () => {
    expect(series(hist([{ date: "2026-09-03", rows: { den: { po: 55 } } }]), "kc", "po")).toEqual([]);
    expect(series(null, "den", "po")).toEqual([]);
  });
});
