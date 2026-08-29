import { describe, expect, it } from "vitest";
import { deriveCompBracket, deriveLeaguePhaseGroups, stageIndexOf, stageLabel } from "./euroCompDerive";
import type { LiveComp, LiveFixture, LiveTeamRef } from "./clubFootballLive";

const T = (id: number, name: string): LiveTeamRef => ({ team_id: id, name, lookup: name, country: null });
const TBD: LiveTeamRef = { team_id: null, name: null, lookup: null, country: null };

let fid = 0;
const fx = (round: string, home: LiveTeamRef, away: LiveTeamRef,
  hg: number | null = null, ag: number | null = null, status: string | null = null): LiveFixture =>
  ({ fixture_id: ++fid, round, kickoff: null, home, away, home_goals: hg, away_goals: ag, status });

const comp = (fixtures: LiveFixture[], groups: LiveComp["groups"] = []): LiveComp =>
  ({ league_id: 2, name: "UEFA Champions League", groups, fixtures });

describe("stageIndexOf", () => {
  it("orders the UEFA round names shallow to deep", () => {
    const order = ["1st Qualifying Round", "Play-offs", "Group Stage",
      "Knockout Round Play-offs", "Round of 16", "Quarter-finals", "Semi-finals", "Final"]
      .map(stageIndexOf);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });
  it("keeps the knockout play-offs distinct from the August qualifying play-offs", () => {
    expect(stageIndexOf("Knockout Round Play-offs")).toBeGreaterThan(stageIndexOf("Play-offs"));
    expect(stageIndexOf("Group Stage")).toBe(stageIndexOf("League Phase - 3"));
  });
  it("returns -1 for unknown rounds", () => {
    expect(stageIndexOf(null)).toBe(-1);
    expect(stageIndexOf("Relegation Round")).toBe(-1);
  });
});

describe("deriveLeaguePhaseGroups", () => {
  it("passes real standings through untouched", () => {
    const real = [{ group_label: "League phase", rows: [] }];
    expect(deriveLeaguePhaseGroups(comp([], real))).toEqual({ groups: real, computed: false });
  });
  it("builds a zeros table from drawn, unplayed league-phase fixtures", () => {
    const c = comp([
      fx("Group Stage", T(1, "Arsenal"), T(2, "Bayern Munich")),
      fx("Group Stage", T(3, "Real Madrid"), T(1, "Arsenal")),
      fx("1st Qualifying Round", T(9, "Linfield"), T(10, "Shelbourne"), 1, 0, "FT"), // ignored
    ]);
    const { groups, computed } = deriveLeaguePhaseGroups(c);
    expect(computed).toBe(true);
    expect(groups).toHaveLength(1);
    const rows = groups[0].rows;
    expect(rows.map((r) => r.name)).toEqual(["Arsenal", "Bayern Munich", "Real Madrid"]);
    expect(rows.every((r) => r.played === 0 && r.points === 0 && r.gd === 0)).toBe(true);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
  it("computes W/D/L, GD and 3-1-0 points from finished fixtures only", () => {
    const c = comp([
      fx("Group Stage", T(1, "Arsenal"), T(2, "Bayern Munich"), 3, 1, "FT"),
      fx("Group Stage", T(3, "Real Madrid"), T(1, "Arsenal"), 2, 2, "FT"),
      fx("Group Stage", T(2, "Bayern Munich"), T(3, "Real Madrid")), // unplayed
    ]);
    const rows = deriveLeaguePhaseGroups(c).groups[0].rows;
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by["Arsenal"]).toMatchObject({ played: 2, win: 1, draw: 1, lose: 0, gf: 5, ga: 3, gd: 2, points: 4, rank: 1 });
    expect(by["Real Madrid"]).toMatchObject({ played: 1, points: 1, rank: 2 });
    expect(by["Bayern Munich"]).toMatchObject({ played: 1, points: 0, gd: -2, rank: 3 });
  });
  it("returns no groups before the league phase is drawn", () => {
    const c = comp([fx("2nd Qualifying Round", T(9, "Linfield"), T(10, "Shelbourne"), 0, 2, "FT")]);
    expect(deriveLeaguePhaseGroups(c).groups).toHaveLength(0);
  });
});

describe("deriveCompBracket", () => {
  it("marks qualifying losers eliminated and league-phase teams alive (Aug 2026 shape)", () => {
    const b = deriveCompBracket(comp([
      fx("1st Qualifying Round", T(9, "Linfield"), T(10, "Shelbourne"), 1, 3, "FT"),
      fx("Play-offs", T(10, "Shelbourne"), T(11, "Rangers"), 0, 2, "FT"),
      fx("Group Stage", T(11, "Rangers"), T(1, "Arsenal")),
      fx("Group Stage", T(2, "Bayern Munich"), T(11, "Rangers")),
    ]))!;
    expect(b.totalCount).toBe(5);
    expect(b.aliveCount).toBe(3); // Rangers, Arsenal, Bayern in the league phase
    const byLabel = Object.fromEntries(b.stages.map((s) => [s.label, s]));
    expect(byLabel["Qualifying"].eliminated.map((e) => e.name)).toEqual(["Linfield"]);
    expect(byLabel["Qualifying play-offs"].eliminated.map((e) => e.name)).toEqual(["Shelbourne"]);
    expect(byLabel["League phase"].alive).toHaveLength(3);
    expect(b.champion).toBeNull();
  });
  it("ignores TBD placeholder fixtures when computing the frontier", () => {
    const b = deriveCompBracket(comp([
      fx("Group Stage", T(1, "Arsenal"), T(2, "Bayern Munich"), 2, 0, "FT"),
      fx("Knockout Round Play-offs", TBD, TBD),
    ]))!;
    expect(b.stages.at(-1)!.label).toBe("League phase");
    expect(b.aliveCount).toBe(2);
  });
  it("keeps league-phase top-8 byes alive while the knockout play-offs run", () => {
    const ranked = [{ group_label: "League phase", rows: [
      { ...T(1, "Arsenal"), rank: 1, played: 8, win: 8, draw: 0, lose: 0, gf: 20, ga: 2, gd: 18, points: 24, form: null },
      { ...T(2, "Bayern Munich"), rank: 9, played: 8, win: 5, draw: 1, lose: 2, gf: 15, ga: 8, gd: 7, points: 16, form: null },
      { ...T(3, "Real Madrid"), rank: 30, played: 8, win: 1, draw: 1, lose: 6, gf: 5, ga: 15, gd: -10, points: 4, form: null },
    ] }];
    const b = deriveCompBracket(comp([
      fx("Group Stage", T(1, "Arsenal"), T(2, "Bayern Munich"), 1, 0, "FT"),
      fx("Group Stage", T(3, "Real Madrid"), T(1, "Arsenal"), 0, 1, "FT"),
      fx("Knockout Round Play-offs", T(2, "Bayern Munich"), T(4, "Benfica")),
    ]), ranked)!;
    const names = (list: { name: string | null }[]) => list.map((e) => e.name);
    const byLabel = Object.fromEntries(b.stages.map((s) => [s.label, s]));
    expect(names(byLabel["League phase"].alive)).toEqual(["Arsenal"]);      // rank 1 bye
    expect(names(byLabel["League phase"].eliminated)).toEqual(["Real Madrid"]); // rank 30, out
    expect(names(byLabel["Knockout play-offs"].alive).sort()).toEqual(["Bayern Munich", "Benfica"]);
  });
  it("crowns a champion from a decisive final and demotes the runner-up", () => {
    const b = deriveCompBracket(comp([
      fx("Semi-finals", T(1, "Arsenal"), T(3, "Real Madrid"), 2, 1, "FT"),
      fx("Semi-finals", T(2, "Bayern Munich"), T(4, "Benfica"), 3, 0, "FT"),
      fx("Final", T(1, "Arsenal"), T(2, "Bayern Munich"), 2, 0, "FT"),
    ]))!;
    expect(b.champion?.name).toBe("Arsenal");
    const final = b.stages.at(-1)!;
    expect(final.label).toBe("Final");
    expect(final.alive.map((e) => e.name)).toEqual(["Arsenal"]);
    expect(final.eliminated.map((e) => e.name)).toEqual(["Bayern Munich"]);
  });
  it("leaves a level shoot-out final undecided rather than guessing", () => {
    const b = deriveCompBracket(comp([
      fx("Final", T(1, "Arsenal"), T(2, "Bayern Munich"), 1, 1, "PEN"),
    ]))!;
    expect(b.champion).toBeNull();
    expect(b.aliveCount).toBe(2);
  });
  it("returns null when nothing is derivable", () => {
    expect(deriveCompBracket(comp([]))).toBeNull();
    expect(deriveCompBracket(comp([fx("Group Stage", TBD, TBD)]))).toBeNull();
  });
  it("labels every stage it emits", () => {
    const b = deriveCompBracket(comp([fx("Quarter-finals", T(1, "A"), T(2, "B"), 1, 0, "FT")]))!;
    expect(b.stages.every((s) => stageLabel(s.index) === s.label)).toBe(true);
  });
});
