import { describe, it, expect } from "vitest";
import {
  inSeasonWindow, inSeasonFromGames, isLeagueLive, tournamentIsCurrent,
  SEASON_WINDOWS, type SeasonKey,
} from "./seasonWindows";

const utc = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 12));

describe("inSeasonWindow", () => {
  it("handles a normal (non-wrapping) window", () => {
    expect(inSeasonWindow("mlb", utc(3, 14))).toBe(false); // day before
    expect(inSeasonWindow("mlb", utc(3, 15))).toBe(true);  // first day
    expect(inSeasonWindow("mlb", utc(8, 6))).toBe(true);   // mid-season
    expect(inSeasonWindow("mlb", utc(11, 10))).toBe(true); // last day
    expect(inSeasonWindow("mlb", utc(11, 11))).toBe(false);
    expect(inSeasonWindow("mlb", utc(1, 15))).toBe(false); // deep offseason
  });

  it("handles a wrapping window across new year", () => {
    expect(inSeasonWindow("nfl", utc(8, 31))).toBe(false);
    expect(inSeasonWindow("nfl", utc(9, 1))).toBe(true);
    expect(inSeasonWindow("nfl", utc(12, 25))).toBe(true); // after new year side
    expect(inSeasonWindow("nfl", utc(1, 20))).toBe(true);  // playoffs
    expect(inSeasonWindow("nfl", utc(2, 20))).toBe(true);  // last day
    expect(inSeasonWindow("nfl", utc(2, 21))).toBe(false);
    expect(inSeasonWindow("nfl", utc(6, 1))).toBe(false);  // deep offseason
  });

  it("closes the leagues Ashwin listed as wrongly-open, in deep winter", () => {
    const jan = utc(1, 10);
    for (const k of ["cfl", "wnba", "mlb", "npb", "nrl", "afl", "f1"] as SeasonKey[]) {
      expect(inSeasonWindow(k, jan), `${k} should be closed in January`).toBe(false);
    }
  });

  it("opens NFL, NBA and NHL once their seasons are under way", () => {
    expect(inSeasonWindow("nfl", utc(9, 15))).toBe(true);
    expect(inSeasonWindow("nba", utc(11, 15))).toBe(true);
    expect(inSeasonWindow("nhl", utc(11, 15))).toBe(true);
    // and keeps them shut in high summer
    expect(inSeasonWindow("nfl", utc(7, 15))).toBe(false);
    expect(inSeasonWindow("nba", utc(8, 15))).toBe(false);
    expect(inSeasonWindow("nhl", utc(8, 15))).toBe(false);
  });

  it("leaves an unknown key open rather than hiding a board on our account", () => {
    expect(inSeasonWindow("nope" as SeasonKey, utc(1, 1))).toBe(true);
  });

  it("every window is internally consistent", () => {
    for (const [key, w] of Object.entries(SEASON_WINDOWS)) {
      const s = w.start[0] * 100 + w.start[1];
      const e = w.end[0] * 100 + w.end[1];
      if (w.wraps) expect(s, `${key} wraps so start must be after end`).toBeGreaterThan(e);
      else expect(s, `${key} does not wrap so start must precede end`).toBeLessThan(e);
    }
  });
});

describe("inSeasonFromGames", () => {
  it("is false with no teams", () => {
    expect(inSeasonFromGames([], 162)).toBe(false);
  });
  it("is false before a ball is bowled", () => {
    expect(inSeasonFromGames([0, 0, 0], 162)).toBe(false);
  });
  it("is true mid-season", () => {
    expect(inSeasonFromGames([90, 92, 95], 162)).toBe(true);
  });
  it("is false at a clean finish", () => {
    expect(inSeasonFromGames([162, 162, 162], 162)).toBe(false);
  });
  // THE BUG THIS MODULE EXISTS FOR: one team short of a full card leaves the
  // games test true forever, because nothing will increment it again.
  it("stays wrongly true when a team finishes a game short", () => {
    expect(inSeasonFromGames([162, 162, 161], 162)).toBe(true);
  });
});

describe("isLeagueLive", () => {
  it("needs BOTH the window and the games to agree", () => {
    // mid-season, games running -> live
    expect(isLeagueLive("mlb", [90, 92], 162, utc(8, 6))).toBe(true);
    // the 161-of-162 case that never closes on games alone, in deep winter
    expect(isLeagueLive("mlb", [162, 161], 162, utc(1, 10))).toBe(false);
    // inside the window but not a ball played yet -> shut
    expect(isLeagueLive("mlb", [0, 0], 162, utc(3, 16))).toBe(false);
  });
});

describe("tournamentIsCurrent", () => {
  const now = new Date(Date.UTC(2026, 7, 6, 12));
  const iso = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

  it("is true while a match is in play", () => {
    expect(tournamentIsCurrent({ hasLive: true }, now)).toBe(true);
  });
  it("is true once group games have been played", () => {
    expect(tournamentIsCurrent({ hasLive: false, hasPlayedGroupGames: true }, now)).toBe(true);
  });
  it("is true just before kickoff", () => {
    expect(tournamentIsCurrent({ hasLive: false, nextKickoff: iso(3) }, now)).toBe(true);
  });
  it("is FALSE for a tournament five months out (the Asian Cup case)", () => {
    expect(tournamentIsCurrent({ hasLive: false, nextKickoff: iso(154) }, now)).toBe(false);
  });
  it("is true just after a match finished", () => {
    expect(tournamentIsCurrent({ hasLive: false, lastFinished: iso(-4) }, now)).toBe(true);
  });
  it("is false long after the last match", () => {
    expect(tournamentIsCurrent({ hasLive: false, lastFinished: iso(-90) }, now)).toBe(false);
  });
  it("is false with nothing at all", () => {
    expect(tournamentIsCurrent({ hasLive: false }, now)).toBe(false);
  });
  it("ignores unparseable dates rather than throwing", () => {
    expect(tournamentIsCurrent({ hasLive: false, nextKickoff: "not a date" }, now)).toBe(false);
  });
});
