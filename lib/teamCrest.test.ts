import { describe, expect, it } from "vitest";
import { getCrest, _womensAliasTargets } from "./teamCrest";
import wlive from "../public/data/football/wlive-2026.json";

type LiveRow = { name?: string };
type LiveGroup = { rows?: LiveRow[] };
type LiveLeague = { name?: string; groups?: LiveGroup[] };

describe("getCrest", () => {
  it("resolves a plain club name", () => {
    expect(getCrest("Arsenal")).not.toBeNull();
  });

  it("returns null rather than guessing", () => {
    expect(getCrest("Not A Real Club 1899")).toBeNull();
  });

  // Every alias must point at a club that actually carries a badge. Without
  // this, a typo in the map fails silently as a monogram on the live page.
  it("every women's alias target has a badge", () => {
    const broken = _womensAliasTargets.filter((t) => getCrest(t) === null);
    expect(broken).toEqual([]);
  });

  // A bare-name fallback would resolve these to the men's crest, which is the
  // specific mistake the explicit map exists to prevent.
  it("women's rows do not borrow the men's crest", () => {
    expect(getCrest("Barcelona W")!.src).not.toBe(getCrest("FC Barcelona")?.src);
    expect(getCrest("Arsenal W")!.src).not.toBe(getCrest("Arsenal")!.src);
  });
});

// The live women's standings are the reason the alias map exists. If
// api-football renames a club, or a promoted side arrives without a badge,
// this fails here rather than rendering a monogram in production.
describe("women's live standings crest coverage", () => {
  const leagues = (wlive as { leagues?: LiveLeague[] }).leagues ?? [];

  it("has leagues to check", () => {
    expect(leagues.length).toBeGreaterThan(0);
  });

  for (const lg of leagues) {
    it(`${lg.name}: every row resolves a crest`, () => {
      const rows = (lg.groups ?? []).flatMap((g) => g.rows ?? []);
      expect(rows.length).toBeGreaterThan(0);
      const missing = rows
        .map((r) => r.name ?? "")
        .filter((n) => n && getCrest(n) === null);
      expect(missing).toEqual([]);
    });
  }
});
