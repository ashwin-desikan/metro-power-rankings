import { describe, it, expect } from "vitest";
import { aggregateBloc, pathAt, PROPOSED_BLOCS, type Pop2100IndexRow } from "./population2100Shape";

// The pure half only (lib/population2100Shape.ts): no fs, no "server-only".

function row(slug: string, path: number[]): Pop2100IndexRow {
  return {
    slug, iso3: slug.toUpperCase(), name: slug, path,
    peak: { year: 2025, value: path[0], past: false }, base: { year: 2025, value: path[0] },
    y2050: { med: path[25] ?? path[path.length - 1], lo80: null, hi80: null, lo95: null, hi95: null },
    y2100: { med: path[path.length - 1], lo80: null, hi80: null, lo95: null, hi95: null },
    multiple2100: null, declineFrom: null, naturalDeclineFrom: null,
  };
}

describe("aggregateBloc", () => {
  const n = 76;
  const a = row("a", Array.from({ length: n }, (_, k) => 100 + k));          // grows 100 to 175
  const b = row("b", Array.from({ length: n }, (_, k) => 200 - 2 * k));      // falls 200 to 50
  const def = { key: "x", name: "X", kind: "org" as const, note: "", href: null, members: ["a", "b", "ghost"] };
  const bloc = aggregateBloc([a, b], { pathStart: 2025, baseYear: 2025, lastEstimate: 2023 }, def)!;

  it("sums the median year by year and lists members it could not find", () => {
    expect(bloc.path[0]).toBe(300);
    expect(bloc.path[n - 1]).toBe(225);
    expect(bloc.members).toEqual(["a", "b"]);
    expect(bloc.missing).toEqual(["ghost"]);
    expect(bloc.base).toBe(300);
    expect(bloc.y2100).toBe(225);
    expect(bloc.multiple2100).toBeCloseTo(0.75, 3);
  });
  it("reads the peak and the decline off the summed path", () => {
    expect(bloc.peak).toEqual({ year: 2025, value: 300, past: false });  // 300, 299, 298 ... falling from the start, and 2025 is projected
    expect(bloc.declineFrom).toBe(2026);
  });
  it("returns null when no member has a row", () => {
    expect(aggregateBloc([a], { pathStart: 2025, baseYear: 2025, lastEstimate: 2023 }, { ...def, members: ["ghost"] })).toBeNull();
  });
  it("takes base and multiple from the base year when the path starts earlier", () => {
    const c = row("c", [50, 60, 80, 100, 120]);      // 2021..2025
    const bl = aggregateBloc([c], { pathStart: 2021, baseYear: 2024, lastEstimate: 2023 }, { ...def, members: ["c"] })!;
    expect(bl.base).toBe(100);
    expect(bl.multiple2100).toBeCloseTo(1.2, 3);     // at(2100) clamps to the last value
    expect(bl.peak).toEqual({ year: 2025, value: 120, past: false });
  });
  it("carries the proposed East African Federation on the eight EAC states", () => {
    const eaf = PROPOSED_BLOCS.find((p) => p.key === "east-african-federation")!;
    expect(eaf.members).toHaveLength(8);
    expect(eaf.members).toContain("somalia");
  });
});

describe("pathAt", () => {
  it("indexes from the base year and refuses years outside the path", () => {
    const r = row("a", [1, 2, 3]);
    expect(pathAt(r, 2025, 2027)).toBe(3);
    expect(pathAt(r, 2025, 2028)).toBeNull();
    expect(pathAt(r, 2025, 2024)).toBeNull();
  });
});
