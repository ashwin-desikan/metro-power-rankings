import { describe, it, expect } from "vitest";
import { instantOf, parseGames, parseFixtures } from "./cflSchedule";

// Rows copied from api.stats.cfl.ca/fixtures/2026 on 2026-09-13.
const PLAYED = {
  ID: 6701, season_id: 75, home_team_id: 19, away_team_id: 13, week: 15,
  start_at: "2026-09-12T17:00:00+00:00", start_at_local: "2026-09-12T13:00:00",
  home_team_score: 26, away_team_score: 23,
};
const UPCOMING = {
  ID: 6712, season_id: 75, home_team_id: 8, away_team_id: 11, week: 16,
  start_at: "2026-09-18T23:30:00+00:00", start_at_local: "2026-09-18T19:30:00",
  home_team_score: null, away_team_score: null,
};
// The playoff placeholders come back NAIVE, with no offset at all.
const SEMI_PLACEHOLDER = {
  ID: 6799, home_team_id: 0, away_team_id: 0, week: 21,
  start_at: "2026-10-31T15:00:00", home_team_score: null, away_team_score: null,
};
const GREY_CUP = {
  ID: 6803, home_team_id: 11, away_team_id: 1, week: 23,
  start_at: "2026-11-15T22:00:00+00:00", home_team_score: null, away_team_score: null,
};

describe("instantOf", () => {
  it("accepts an offset-bearing timestamp", () => {
    expect(instantOf("2026-09-12T17:00:00+00:00")).toBe("2026-09-12T17:00:00.000Z");
    expect(instantOf("2026-09-12T17:00:00Z")).toBe("2026-09-12T17:00:00.000Z");
  });

  // The whole point: a naive string is ambiguous, and guessing puts a playoff game on
  // the page at the wrong hour for every reader.
  it("refuses a naive timestamp rather than assuming a zone", () => {
    expect(instantOf("2026-10-31T15:00:00")).toBeNull();
    expect(instantOf("")).toBeNull();
    expect(instantOf(undefined)).toBeNull();
    expect(instantOf("not a date+00:00")).toBeNull();
  });
});

describe("parseGames", () => {
  it("reads a finished game, away side first as gridiron labels do", () => {
    const [g] = parseGames([PLAYED], "regular");
    expect(g).toMatchObject({
      fixtureId: 6701, week: 15, stage: "regular",
      home: { slug: "toronto-argonauts" }, away: { slug: "ottawa-redblacks" },
      homeScore: 26, awayScore: 23, completed: true,
    });
    expect(g.kickoff).toBe("2026-09-12T17:00:00.000Z");
  });

  it("marks an unplayed game incomplete, not zero-zero", () => {
    const [g] = parseGames([UPCOMING], "regular");
    expect(g.completed).toBe(false);
    expect(g.homeScore).toBeNull();
    expect(g.awayScore).toBeNull();
  });

  it("drops a playoff placeholder with no fixed time and no teams", () => {
    expect(parseGames([SEMI_PLACEHOLDER], "semi-final")).toEqual([]);
  });

  it("keeps a playoff game once it has a real instant and both sides", () => {
    const [g] = parseGames([GREY_CUP], "final");
    expect(g.stage).toBe("final");
    expect(g.away.slug).toBe("bc-lions");
  });

  it("drops a team id it does not know rather than rendering a blank side", () => {
    expect(parseGames([{ ...PLAYED, away_team_id: 99 }], "regular")).toEqual([]);
  });

  it("survives a missing or non-array list", () => {
    expect(parseGames(undefined, "regular")).toEqual([]);
    expect(parseGames({}, "regular")).toEqual([]);
  });
});

describe("parseFixtures", () => {
  it("takes season, semi-finals and finals in kick-off order, and leaves preseason out", () => {
    const doc = {
      preseason: [{ ...PLAYED, ID: 6582, start_at: "2026-05-18T19:00:00+00:00" }],
      season: [UPCOMING, PLAYED],
      semiFinals: [SEMI_PLACEHOLDER],
      finals: [GREY_CUP],
    };
    const out = parseFixtures(doc);
    expect(out.map((g) => g.fixtureId)).toEqual([6701, 6712, 6803]);
    expect(out.some((g) => g.fixtureId === 6582)).toBe(false);
  });

  it("returns nothing for a document that is not the expected shape", () => {
    expect(parseFixtures(null)).toEqual([]);
    expect(parseFixtures({ season: "nope" })).toEqual([]);
  });
});
