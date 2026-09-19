import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { seedsAtWeek, KNOWN_SEED_MISMATCHES, MIN_GAMES_FOR_SEEDS, type SeedTeam } from "./weeklySeeds";

// GOLDEN TEST: every season shard, both conferences, checked against the
// FINAL stored seed. `recAt = (t) => t.reg` feeds the function the FINAL
// regular-season record, i.e. asks "what would this engine have printed on
// the last day of the regular season", which must equal the stored seed for
// every season-conference not in KNOWN_SEED_MISMATCHES.
describe("seedsAtWeek golden test against every stored final seed", () => {
  const DIR = join(process.cwd(), "public/data/nba/elo/seasons");
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

  const mismatchKey = (season: number, conf: string) => `${season}|${conf}`;
  const knownMismatches = new Set(
    KNOWN_SEED_MISMATCHES.map((m) => mismatchKey(m.season, m.conf)),
  );

  let checked = 0;
  let matched = 0;
  const failures: string[] = [];

  for (const f of files) {
    const season = Number(f.replace(".json", ""));
    const data = JSON.parse(readFileSync(join(DIR, f), "utf8")) as {
      teams: SeedTeam[];
    };
    const teams = data.teams.filter((t) => t.reg != null);
    const byConf = new Map<string, SeedTeam[]>();
    for (const t of teams) {
      const c = t.conf ?? "";
      const list = byConf.get(c);
      if (list) list.push(t);
      else byConf.set(c, [t]);
    }
    for (const [conf, group] of byConf) {
      const stored = new Map(
        group.filter((t) => t.seed != null).map((t) => [t.name, t.seed as number]),
      );
      if (stored.size === 0) continue; // no final seeds this conference/season
      if (knownMismatches.has(mismatchKey(season, conf))) continue;

      checked++;
      const got = seedsAtWeek(group, season, (t) => t.reg);
      const ok =
        got.size === stored.size &&
        [...stored].every(([name, seed]) => got.get(name) === seed);
      if (ok) matched++;
      else failures.push(`${season} ${conf}: got=${JSON.stringify([...got])} want=${JSON.stringify([...stored])}`);
    }
  }

  it(`reproduces the stored final seed for every season-conference not in KNOWN_SEED_MISMATCHES (${matched}/${checked})`, () => {
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.log(failures.slice(0, 10).join("\n"));
    }
    expect(matched).toBe(checked);
    expect(checked).toBeGreaterThan(100); // sanity: the golden test actually ran
  });
});

describe("seedsAtWeek unit cases", () => {
  const t = (
    name: string,
    conf: string,
    div: string,
    reg: [number, number],
    seed: number | null,
  ): SeedTeam => ({ name, conf, div, reg, seed });

  it("under divTop, a division leader with a worse record outranks a better non-leader", () => {
    const teams = [
      // Atlantic has one team, so it trivially leads with a .667 record.
      t("LeaderWorse", "East", "Atlantic", [40, 20], 2),
      // Central's actual leader, better than both other teams here.
      t("CentralLeader", "East", "Central", [50, 10], 1),
      // Central's non-leader: a BETTER record than the Atlantic leader (.75
      // vs .667), but divTop still seats the leader ahead of it.
      t("NonLeaderBetter", "East", "Central", [45, 15], 3),
    ];
    const got = seedsAtWeek(teams, 1990, (x) => x.reg); // 1990 -> divTop era
    expect(got.get("LeaderWorse")).toBeLessThan(got.get("NonLeaderBetter")!);
  });

  it("the same data under record ignores division leadership", () => {
    const teams = [
      t("LeaderWorse", "East", "Atlantic", [40, 20], 2),
      t("NonLeaderBetter", "East", "Central", [45, 15], 1),
      t("OtherLeader", "East", "Central", [30, 30], null),
    ];
    const got = seedsAtWeek(teams, 2022, (x) => x.reg); // 2022 -> record era
    expect(got.get("NonLeaderBetter")).toBe(1);
    expect(got.get("LeaderWorse")).toBe(2);
  });

  it("divTop4 guarantees the division leaders plus the best non-leader a top-four spot", () => {
    const teams = [
      t("AtlanticLeader", "East", "Atlantic", [50, 10], 1), // .833, Atlantic's best
      t("BestNonLeader", "East", "Atlantic", [45, 15], 2),  // .75, Atlantic's 2nd
      t("CentralLeader", "East", "Central", [35, 25], 3),   // .583, Central's best
      t("WorseNonLeader", "East", "Central", [30, 30], 5),  // .5, Central's 2nd
      t("PacificLeader", "East", "Pacific", [28, 32], 4),   // .467, Pacific's only team
    ];
    const got = seedsAtWeek(teams, 2012, (x) => x.reg); // 2012 -> divTop4 era
    // The three division leaders plus the single best non-leader occupy 1-4.
    const top4 = new Set(["AtlanticLeader", "CentralLeader", "PacificLeader", "BestNonLeader"]);
    for (const name of top4) expect(got.get(name)).toBeLessThanOrEqual(4);
    expect(got.get("WorseNonLeader")).toBe(5);
  });

  it("a tie in win percentage is broken by the better final seed", () => {
    const teams = [
      t("BetterFinalSeed", "East", "Atlantic", [41, 41], 3),
      t("WorseFinalSeed", "East", "Central", [41, 41], 5),
    ];
    const got = seedsAtWeek(teams, 2022, (x) => x.reg);
    expect(got.get("BetterFinalSeed")).toBe(1);
    expect(got.get("WorseFinalSeed")).toBe(2);
  });

  it("a team outside that conference's field size gets no seed", () => {
    const teams = [
      t("In", "East", "Atlantic", [50, 10], 1),
      t("AlsoOut", "East", "Central", [20, 40], null),
    ];
    const got = seedsAtWeek(teams, 2022, (x) => x.reg);
    expect(got.get("In")).toBe(1);
    expect(got.has("AlsoOut")).toBe(false);
  });

  it("a conference with no final seeds this season returns nothing for it", () => {
    const teams = [
      t("A", "East", "Atlantic", [30, 30], null),
      t("B", "East", "Central", [25, 35], null),
    ];
    const got = seedsAtWeek(teams, 1971, (x) => x.reg);
    expect(got.size).toBe(0);
  });

  it("a week with 0 games played returns no seeds, even though final seeds exist", () => {
    const teams = [
      t("A", "East", "Atlantic", [50, 10], 1),
      t("B", "East", "Central", [30, 30], 2),
    ];
    // recAt returns null for everyone: nobody has played yet.
    const got = seedsAtWeek(teams, 2022, () => null);
    expect(got.size).toBe(0);
  });
});

describe("seeds wait until every team has played enough games", () => {
  const mk = (name: string, rec: [number, number], seed: number | null) =>
    ({ name, conf: "East", div: "Atlantic", reg: [50, 32] as [number, number], seed, rec });

  it("returns nothing while ANY team is short of the minimum, even one", () => {
    const teams = [mk("A", [6, 0], 1), mk("B", [4, 2], 2), mk("C", [MIN_GAMES_FOR_SEEDS - 1, 0], null)];
    expect(seedsAtWeek(teams, 2001, (t) => t.rec).size).toBe(0);
  });

  it("switches on in the week the last team reaches the minimum", () => {
    const teams = [mk("A", [6, 0], 1), mk("B", [4, 2], 2), mk("C", [0, MIN_GAMES_FOR_SEEDS], null)];
    const got = seedsAtWeek(teams, 2001, (t) => t.rec);
    expect([...got]).toEqual([["A", 1], ["B", 2]]);
  });
});
