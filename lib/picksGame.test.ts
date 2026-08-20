import { describe, expect, it } from "vitest";
import {
  SERIES_POINTS,
  computeLeaderboard,
  eventKey,
  gradeRadar,
  gradeSeries,
  gradeSlate,
  isLocked,
  ledgerBrier,
  lockTime,
  pickIsValid,
  pickProb,
  radarBoard,
  radarGames,
  radarVerdict,
  seriesKey,
  seriesLockTime,
  userPicksBrier,
  type LedgerEntry,
  type SeriesEntry,
  type StoredPick,
} from "./picksGame";

const plGame = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  date: "2026-08-22",
  home: "Everton",
  away: "Crystal Palace",
  home_slug: "everton",
  away_slug: "crystal-palace",
  model: { pH: 0.4138, pD: 0.2897, pA: 0.2965 },
  pick: "H",
  ...over,
});

const nflGame = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  event_id: "401872656",
  date: "2026-09-10",
  home: "Seattle Seahawks",
  away: "New England Patriots",
  home_slug: "seattle-seahawks",
  away_slug: "new-england-patriots",
  model: { pH: 0.592 },
  market: { pH: 0.603 },
  pick: "H",
  ...over,
});

const cfbGame = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  event_id: "401856766",
  date: "2026-08-29",
  home: "TCU",
  away: "North Carolina",
  home_slug: "tcu-cfb",
  away_slug: "north-carolina-cfb",
  ap: { home: 14, away: null },
  neutral: true,
  model: { pH: 0.55 },
  market: { pH: 0.71 },
  pick: "H",
  ...over,
});

const pick = (over: Partial<StoredPick> = {}): StoredPick => ({
  league: "pl",
  season: "2026-27",
  event_key: "2026-08-22:everton",
  mode: "slate",
  pick: "H",
  confidence: null,
  picked_at: "2026-08-20T10:00:00Z",
  ...over,
});

describe("eventKey / locking", () => {
  it("keys NFL and CFB on event_id and PL on date:home_slug", () => {
    expect(eventKey("nfl", nflGame())).toBe("401872656");
    expect(eventKey("cfb", cfbGame())).toBe("401856766");
    expect(eventKey("pl", plGame())).toBe("2026-08-22:everton");
  });

  it("locks at 00:00 UTC on match day when the entry carries no kickoff", () => {
    const e = plGame();
    expect(lockTime(e)).toBe(Date.parse("2026-08-22T00:00:00Z"));
    expect(isLocked(e, Date.parse("2026-08-21T23:59:59Z"))).toBe(false);
    expect(isLocked(e, Date.parse("2026-08-22T00:00:00Z"))).toBe(true);
  });

  it("locks at kickoff when the entry carries one", () => {
    const e = plGame({ kickoff: "2026-08-22T16:30:00Z" });
    expect(lockTime(e)).toBe(Date.parse("2026-08-22T16:30:00Z"));
    expect(isLocked(e, Date.parse("2026-08-22T12:00:00Z"))).toBe(false);
    expect(isLocked(e, Date.parse("2026-08-22T16:30:00Z"))).toBe(true);
    // a pre-kickoff, same-day pick is now valid
    expect(pickIsValid(pick({ picked_at: "2026-08-22T09:00:00Z" }), e)).toBe(true);
  });

  it("falls back to the date when the kickoff string is malformed", () => {
    const e = plGame({ kickoff: "not-a-time" });
    expect(lockTime(e)).toBe(Date.parse("2026-08-22T00:00:00Z"));
  });

  it("discards picks stamped on or after lock", () => {
    expect(pickIsValid(pick(), plGame())).toBe(true);
    expect(pickIsValid(pick({ picked_at: "2026-08-22T00:00:00Z" }), plGame())).toBe(false);
  });
});

describe("pickProb", () => {
  it("reads three-way PL and two-way NFL/CFB probabilities", () => {
    expect(pickProb("pl", plGame(), "D")).toBeCloseTo(0.2897);
    expect(pickProb("nfl", nflGame(), "A")).toBeCloseTo(0.408);
    expect(pickProb("cfb", cfbGame(), "A")).toBeCloseTo(0.45);
  });
});

describe("gradeSlate", () => {
  it("scores 10 per correct call, draws included as first-class picks", () => {
    const ledgers = { pl: [plGame({ result: "D", score: "1–1" })] };
    const g = gradeSlate([pick({ pick: "D" })], ledgers);
    expect(g.points).toBe(10);
    expect(g.wins).toBe(1);
    // model picked H and missed
    expect(g.modelLosses).toBe(1);
  });

  it("adds the confidence slot as a bonus only when the pick lands", () => {
    const ledgers = { pl: [plGame({ result: "H", score: "2–0" })] };
    expect(gradeSlate([pick({ confidence: 7 })], ledgers).points).toBe(17);
    const miss = gradeSlate([pick({ pick: "A", confidence: 7 })], ledgers);
    expect(miss.points).toBe(0);
    expect(miss.losses).toBe(1);
  });

  it("ignores ungraded games and post-lock picks", () => {
    const ledgers = { pl: [plGame(), plGame({ home_slug: "fulham", home: "Fulham", date: "2026-08-24", result: "H" })] };
    const late = pick({ event_key: "2026-08-24:fulham", picked_at: "2026-08-24T12:00:00Z" });
    const g = gradeSlate([pick(), late], ledgers);
    expect(g.graded).toBe(0);
    expect(g.points).toBe(0);
  });

  it("grades CFB slate picks like NFL, keyed on event_id", () => {
    const ledgers = { cfb: [cfbGame({ result: "A", score: "24-27" })] };
    const g = gradeSlate(
      [pick({ league: "cfb", season: "2026", event_key: "401856766", pick: "A", picked_at: "2026-08-28T10:00:00Z" })],
      ledgers,
    );
    expect(g.points).toBe(10);
    expect(g.wins).toBe(1);
    expect(g.modelLosses).toBe(1); // the model took TCU
  });

  it("tracks streaks across leagues in kickoff order and NFL ties break nobody's streak but grade as a miss", () => {
    const ledgers = {
      pl: [plGame({ result: "H" })],
      nfl: [nflGame({ result: "T", score: "20–20" })],
    };
    const g = gradeSlate(
      [pick(), pick({ league: "nfl", season: "2026", event_key: "401872656", picked_at: "2026-09-09T10:00:00Z" })],
      ledgers,
    );
    expect(g.wins).toBe(1);
    expect(g.losses).toBe(1); // the tie
    expect(g.bestStreak).toBe(1);
  });
});

describe("radar", () => {
  it("ranks by model-market gap and sizes to five", () => {
    const games = Array.from({ length: 8 }, (_, i) =>
      nflGame({ event_id: `e${i}`, market: { pH: 0.5 + i * 0.02 }, model: { pH: 0.5 } }),
    );
    const top = radarGames(games);
    expect(top).toHaveLength(5);
    expect(top[0].event_id).toBe("e7");
  });

  it("verdict goes to the lower Brier and pushes score nothing", () => {
    expect(radarVerdict(nflGame({ result: "H", model: { pH: 0.7 }, market: { pH: 0.6 } }))).toBe("model");
    expect(radarVerdict(nflGame({ result: "A", model: { pH: 0.7 }, market: { pH: 0.6 } }))).toBe("market");
    expect(radarVerdict(nflGame({ result: "T" }))).toBe(null);
  });

  it("pays 25 for the right side", () => {
    const nfl = [nflGame({ result: "H", model: { pH: 0.7 }, market: { pH: 0.6 } })];
    const rp = (side: "model" | "market") =>
      gradeRadar(
        [{ league: "nfl", season: "2026", event_key: "401872656", mode: "radar", pick: side, confidence: null, picked_at: "2026-09-09T10:00:00Z" }],
        { nfl },
      );
    expect(rp("model").points).toBe(25);
    expect(rp("market").points).toBe(0);
  });

  it("grades CFB radar picks and merges both leagues onto one board by gap", () => {
    const nfl = [nflGame({ model: { pH: 0.55 }, market: { pH: 0.6 } })];
    const cfb = [cfbGame({ result: "H" })];
    const board = radarBoard({ nfl, cfb });
    expect(board).toHaveLength(2);
    expect(board[0].league).toBe("cfb"); // a 16-point gap beats a 5-point one
    const g = gradeRadar(
      [{ league: "cfb", season: "2026", event_key: "401856766", mode: "radar", pick: "market", confidence: null, picked_at: "2026-08-28T10:00:00Z" }],
      { nfl, cfb },
    );
    expect(g).toEqual({ points: 25, wins: 1, losses: 0 });
  });

  it("still grades a pick whose game later dropped out of the top five", () => {
    // Seven market-carrying games; the picked game's gap is now the smallest,
    // so radarGames excludes it, but the stored pick must still grade.
    const nfl = [
      nflGame({ event_id: "picked", result: "H", model: { pH: 0.62 }, market: { pH: 0.6 } }),
      ...Array.from({ length: 6 }, (_, i) =>
        nflGame({ event_id: `wide${i}`, model: { pH: 0.5 }, market: { pH: 0.8 } }),
      ),
    ];
    expect(radarGames(nfl).some((e) => e.event_id === "picked")).toBe(false);
    const g = gradeRadar(
      [{ league: "nfl", season: "2026", event_key: "picked", mode: "radar", pick: "model", confidence: null, picked_at: "2026-09-09T10:00:00Z" }],
      { nfl },
    );
    expect(g).toEqual({ points: 25, wins: 1, losses: 0 });
  });
});

describe("computeLeaderboard", () => {
  it("grades per user, names via profiles, sorts by points", () => {
    const ledgers = { pl: [plGame({ result: "H" })] };
    const rows = [
      { ...pick(), user_id: "u1" },
      { ...pick({ pick: "A" }), user_id: "u2" },
    ];
    const names = new Map([["u1", "Ash"]]);
    const lb = computeLeaderboard(rows, names, ledgers);
    expect(lb[0]).toMatchObject({ userId: "u1", name: "Ash", points: 10 });
    expect(lb[1]).toMatchObject({ userId: "u2", name: "Anonymous", points: 0 });
  });

  it("counts series points when a series map is supplied", () => {
    const lb = computeLeaderboard(
      [{ ...pick({ league: "mlb", mode: "series", event_key: "series:WS:2026-ws-a-b", pick: "H", picked_at: "2026-10-20T10:00:00Z" }), user_id: "u1" }],
      new Map(),
      {},
      { mlb: [mlbSeries({ result: "H" })] },
    );
    expect(lb[0]).toMatchObject({ points: SERIES_POINTS, wins: 1 });
  });
});

// --- MLB postseason series --------------------------------------------------

const mlbSeries = (over: Partial<SeriesEntry> = {}): SeriesEntry => ({
  series_id: "2026-ws-a-b",
  round: "WS",
  date: "2026-10-23",
  kickoff: "2026-10-24T00:08:00Z",
  home: "Athletics",
  away: "Braves",
  home_slug: "athletics",
  away_slug: "atlanta-braves",
  model: { pH: 0.58 },
  ...over,
});

describe("series picks", () => {
  it("keys as series:<round>:<id> and locks at Game 1 first pitch", () => {
    const s = mlbSeries();
    expect(seriesKey(s)).toBe("series:WS:2026-ws-a-b");
    expect(seriesLockTime(s)).toBe(Date.parse("2026-10-24T00:08:00Z"));
    expect(seriesLockTime(mlbSeries({ kickoff: undefined }))).toBe(
      Date.parse("2026-10-23T00:00:00Z"),
    );
  });

  it("pays SERIES_POINTS for a correct pre-lock call and discards late picks", () => {
    const s = mlbSeries({ result: "H" });
    const base: StoredPick = pick({
      league: "mlb", mode: "series", event_key: seriesKey(s), pick: "H",
      picked_at: "2026-10-20T10:00:00Z",
    });
    expect(gradeSeries([base], { mlb: [s] })).toEqual({ points: SERIES_POINTS, wins: 1, losses: 0 });
    expect(gradeSeries([{ ...base, pick: "A" }], { mlb: [s] })).toEqual({ points: 0, wins: 0, losses: 1 });
    const late = { ...base, picked_at: "2026-10-24T01:00:00Z" };
    expect(gradeSeries([late], { mlb: [s] })).toEqual({ points: 0, wins: 0, losses: 0 });
    // an unfinished series grades nothing
    expect(gradeSeries([base], { mlb: [mlbSeries()] })).toEqual({ points: 0, wins: 0, losses: 0 });
  });
});

describe("the Brier axis", () => {
  it("scores a ledger source over graded games, ties at 0.5", () => {
    const nfl = [
      nflGame({ result: "H" }), // model .592 -> (0.592-1)^2
      nflGame({ event_id: "2", result: "T" }), // (0.592-0.5)^2
      nflGame({ event_id: "3" }), // ungraded, skipped
    ];
    const m = ledgerBrier(nfl, "model");
    expect(m.games).toBe(2);
    expect(m.brier).toBeCloseTo(((0.592 - 1) ** 2 + (0.592 - 0.5) ** 2) / 2, 10);
    expect(ledgerBrier([nflGame()], "market").games).toBe(0);
  });

  it("scores a reader's hard picks as 0/1 with 0.25 on a tie", () => {
    const nfl = [
      nflGame({ result: "H" }),
      nflGame({ event_id: "2", result: "A" }),
      nflGame({ event_id: "3", result: "T" }),
    ];
    const picks: StoredPick[] = [
      pick({ league: "nfl", event_key: "401872656", pick: "H", picked_at: "2026-09-09T10:00:00Z" }),
      pick({ league: "nfl", event_key: "2", pick: "H", picked_at: "2026-09-09T10:00:00Z" }),
      pick({ league: "nfl", event_key: "3", pick: "A", picked_at: "2026-09-09T10:00:00Z" }),
    ];
    const b = userPicksBrier(picks, { nfl }, "nfl");
    expect(b.games).toBe(3);
    expect(b.brier).toBeCloseTo((0 + 1 + 0.25) / 3, 10);
    // league filter: PL picks do not leak into the NFL line
    expect(userPicksBrier(picks, { nfl }, "pl").games).toBe(0);
  });
});
