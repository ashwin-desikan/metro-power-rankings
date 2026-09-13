import { describe, it, expect } from "vitest";
import { parseDivision } from "./cflStandings";

// Rows copied from api.stats.cfl.ca/standings/2026 on 2026-09-13, trimmed to the fields
// the parser reads. `flags` is present on some rows and absent on others, which is the
// kind of thing a schema assumption gets wrong.
const EAST = [
  { division_name: "east", place: 1, abbreviation: "MTL", games_played: 13, wins: 10, losses: 3, ties: 0, points: 20, points_for: 461, points_against: 385, flags: "x" },
  { division_name: "east", place: 2, abbreviation: "TOR", games_played: 13, wins: 7, losses: 6, ties: 0, points: 14, points_for: 391, points_against: 384 },
  { division_name: "east", place: 3, abbreviation: "HAM", games_played: 13, wins: 4, losses: 9, ties: 0, points: 8, points_for: 302, points_against: 384 },
  { division_name: "east", place: 4, abbreviation: "OTT", games_played: 12, wins: 0, losses: 12, ties: 0, points: 0, points_for: 270, points_against: 439 },
];
const WEST = [
  { division_name: "west", place: 1, abbreviation: "EDM", games_played: 13, wins: 10, losses: 3, ties: 0, points: 20, points_for: 414, points_against: 323, flags: "x" },
  { division_name: "west", place: 2, abbreviation: "SSK", games_played: 13, wins: 8, losses: 5, ties: 0, points: 16, points_for: 375, points_against: 340 },
  { division_name: "west", place: 3, abbreviation: "BC", games_played: 13, wins: 7, losses: 6, ties: 0, points: 14, points_for: 397, points_against: 357 },
  { division_name: "west", place: 4, abbreviation: "WPG", games_played: 13, wins: 7, losses: 6, ties: 0, points: 14, points_for: 345, points_against: 352 },
  { division_name: "west", place: 5, abbreviation: "CGY", games_played: 13, wins: 5, losses: 8, ties: 0, points: 10, points_for: 450, points_against: 441 },
];

describe("parseDivision", () => {
  it("maps every real 2026 abbreviation to a franchise", () => {
    expect(parseDivision(EAST, "East")).toHaveLength(4);
    expect(parseDivision(WEST, "West")).toHaveLength(5);
  });

  it("reads a row's numbers straight through", () => {
    const mtl = parseDivision(EAST, "East")[0];
    expect(mtl).toMatchObject({
      slug: "montreal-alouettes", division: "East",
      gp: 13, w: 10, l: 3, t: 0, pts: 20, pf: 461, pa: 385,
    });
    expect(mtl.pct).toBeCloseTo(0.769, 3);
  });

  // The document also serves a `unified` table of all nine teams. Passing it to a
  // division parser must not produce a nine-row East, which is what a parser that
  // trusted the caller instead of each row's own division would do.
  it("filters by the asked-for division, so the unified table cannot double a team", () => {
    const unified = [...EAST, ...WEST];
    expect(parseDivision(unified, "East").map((r) => r.slug)).toEqual(
      parseDivision(EAST, "East").map((r) => r.slug));
    expect(parseDivision(unified, "West")).toHaveLength(5);
  });

  it("drops an abbreviation it does not know rather than guessing", () => {
    const rows = [...EAST, { abbreviation: "QUE", games_played: 1, wins: 1, losses: 0, ties: 0, points: 2 }];
    expect(parseDivision(rows, "East")).toHaveLength(4);
  });

  it("computes points when the field is missing, rather than showing zero", () => {
    expect(parseDivision([{ abbreviation: "TOR", games_played: 3, wins: 2, losses: 0, ties: 1 }], "East")[0].pts)
      .toBe(5);
  });

  it("survives a payload that is not an array", () => {
    expect(parseDivision(undefined, "East")).toEqual([]);
    expect(parseDivision({ standings: [] }, "East")).toEqual([]);
  });

  it("ignores a duplicated row", () => {
    expect(parseDivision([EAST[0], EAST[0]], "East")).toHaveLength(1);
  });
});
