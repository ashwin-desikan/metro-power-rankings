import { describe, expect, it } from "vitest";
import {
  computeLeaderboard,
  eventKey,
  gradeRadar,
  gradeSlate,
  isLocked,
  lockTime,
  pickIsValid,
  pickProb,
  radarGames,
  radarVerdict,
  type LedgerEntry,
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
  it("keys NFL on event_id and PL on date:home_slug", () => {
    expect(eventKey("nfl", nflGame())).toBe("401872656");
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
  it("reads three-way PL and two-way NFL probabilities", () => {
    expect(pickProb("pl", plGame(), "D")).toBeCloseTo(0.2897);
    expect(pickProb("nfl", nflGame(), "A")).toBeCloseTo(0.408);
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
        nfl,
      );
    expect(rp("model").points).toBe(25);
    expect(rp("market").points).toBe(0);
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
      nfl,
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
});
