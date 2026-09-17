import { describe, it, expect } from "vitest";
import { isLeagueLive, inSeasonFromGames, GAMES_PER_SEASON } from "./seasonWindows";

// 🔴 WHY THIS FILE EXISTS: raising the NHL from 82 to 84 games is correct, and
// it removed a guard that nobody knew was load-bearing.
//
// The liveness test is `max(games) > 0 && min(games) < fullSeason`. With the
// old 82, a completed 82-game season read min(82) < 82 = FALSE, so the board
// closed itself. That was the RIGHT answer for the wrong reason: the season
// was over, and the test happened to notice because the numbers collided.
//
// With 84, a completed 2025-26 table reads min(82) < 84 = TRUE. So if ESPN is
// still serving last season once the October window opens, the board goes LIVE
// showing a finished table as the current one. That is not hypothetical:
// measured on 2026-09-17, twelve days before the opener, ESPN was still
// serving the completed 2025-26 season as seasonType 2.
//
// The season WINDOW is what saves it today (1 Oct to 30 Jun), and the window
// alone is a thin guard: it is a calendar, not a fact about the data.

const nhlGames = (n: number) => Array.from({ length: 32 }, () => n);

describe("NHL games per season", () => {
  it("is 84 from 2026-27, not 82", () => {
    expect(GAMES_PER_SEASON.nhl).toBe(84);
    // The NBA did NOT change. These must not be collapsed into one constant.
    expect(GAMES_PER_SEASON.nba).toBe(82);
  });

  it("no longer ends the season two games early", () => {
    // Every club on 82 of 84: two games left, the board must stay open.
    expect(inSeasonFromGames(nhlGames(82), GAMES_PER_SEASON.nhl)).toBe(true);
    // The old constant is what closed it. Pinned so the regression is named.
    expect(inSeasonFromGames(nhlGames(82), 82)).toBe(false);
  });

  it("closes only when every club has played all 84", () => {
    expect(inSeasonFromGames(nhlGames(84), GAMES_PER_SEASON.nhl)).toBe(false);
    expect(inSeasonFromGames(nhlGames(83), GAMES_PER_SEASON.nhl)).toBe(true);
  });
});

describe("the calendar window is the only thing separating last season from this one", () => {
  const finished2526 = nhlGames(82);

  it("keeps a finished table shut in September, before the window opens", () => {
    expect(isLeagueLive("nhl", finished2526, GAMES_PER_SEASON.nhl,
      new Date("2026-09-17T12:00:00Z"))).toBe(false);
  });

  it("🔴 would show a FINISHED table as live on 2 October, if ESPN lags", () => {
    // This is the exposure, asserted rather than hoped away. The window is
    // open, the stale rows say 82 of 84, and nothing else disagrees. The real
    // 2026-27 season opens 29 Sep so ESPN should have rolled over by now, but
    // "should have" is not a guard. If this ever bites, the fix is to gate on
    // the payload's own season year matching the current one, not to put 82
    // back: 82 is simply wrong for this season.
    expect(isLeagueLive("nhl", finished2526, GAMES_PER_SEASON.nhl,
      new Date("2026-10-02T12:00:00Z"))).toBe(true);
  });

  it("a real new season reads live once a game has been played", () => {
    const opened = nhlGames(0);
    opened[0] = 1;
    opened[1] = 1;
    expect(isLeagueLive("nhl", opened, GAMES_PER_SEASON.nhl,
      new Date("2026-10-02T12:00:00Z"))).toBe(true);
    // And stays shut before any puck is dropped.
    expect(isLeagueLive("nhl", nhlGames(0), GAMES_PER_SEASON.nhl,
      new Date("2026-10-02T12:00:00Z"))).toBe(false);
  });
});
