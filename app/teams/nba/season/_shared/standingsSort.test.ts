import { describe, it, expect } from "vitest";
import { winPct, pctKey, confKey, divKey, recordsAtWeek, type CupFinal } from "./standingsSort";

// The property under test is an ORDERING, so the tests sort real-shaped data
// and assert the sequence. Asserting the key strings alone would pass on a key
// that is stable and wrong.

const asc = (xs: string[]) => [...xs].sort();

describe("winPct", () => {
  it("is wins over games", () => {
    expect(winPct([62, 20])).toBeCloseTo(0.7561, 4);
    expect(winPct([41, 41])).toBe(0.5);
  });
  it("is null when there is no record, not zero", () => {
    // 0-0 is "played nothing", which must not rank as the worst team.
    expect(winPct(null)).toBeNull();
    expect(winPct([0, 0])).toBeNull();
  });
});

describe("pctKey inverts, so ascending puts the best record first", () => {
  it("a better record sorts before a worse one", () => {
    const best = pctKey([62, 20]);
    const mid = pctKey([41, 41]);
    const worst = pctKey([20, 62]);
    expect(asc([worst, best, mid])).toEqual([best, mid, worst]);
  });

  it("teams with no record sort last", () => {
    const none = pctKey(null);
    const worst = pctKey([1, 81]);
    expect(asc([none, worst])).toEqual([worst, none]);
  });

  it("🔴 compares ERAS on the same scale, because it is a percentage", () => {
    // A 1953 team on 46-25 (.648) is better than a modern 50-32 (.610),
    // despite four fewer wins. Sorting on wins would invert them.
    const y1953 = pctKey([46, 25]);
    const modern = pctKey([50, 32]);
    expect(asc([modern, y1953])).toEqual([y1953, modern]);
  });

  it("is fixed width, so string order is numeric order", () => {
    // Without the pad, "95" sorts before "100" and a .050 team leapfrogs a
    // .900 one. Every key is four characters.
    for (const r of [[82, 0], [41, 41], [0, 82], [1, 81]] as [number, number][]) {
      expect(pctKey(r)).toHaveLength(4);
    }
  });
});

describe("grouped sorts keep the group together and order within it", () => {
  const teams = [
    { name: "Celtics", conf: "Eastern", div: "Atlantic", reg: [41, 41] as [number, number] },
    { name: "Knicks", conf: "Eastern", div: "Atlantic", reg: [53, 29] as [number, number] },
    { name: "Bulls", conf: "Eastern", div: "Central", reg: [60, 22] as [number, number] },
    { name: "Nuggets", conf: "Western", div: "Northwest", reg: [30, 52] as [number, number] },
    { name: "Spurs", conf: "Western", div: "Southwest", reg: [62, 20] as [number, number] },
  ];

  const order = (key: (t: (typeof teams)[number]) => string) =>
    [...teams].sort((a, b) => key(a).localeCompare(key(b))).map((t) => t.name);

  it("by conference: East before West, best record first inside each", () => {
    expect(order((t) => confKey(t.conf, t.reg))).toEqual([
      "Bulls", "Knicks", "Celtics",   // Eastern, .732 / .646 / .500
      "Spurs", "Nuggets",             // Western, .756 / .366
    ]);
  });

  it("🔴 by division: conference first, THEN division, THEN record", () => {
    // Not a flat alphabet. A naive division sort would put Atlantic, Central,
    // Northwest, Southwest in that order and interleave the conferences.
    expect(order((t) => divKey(t.conf, t.div, t.reg))).toEqual([
      "Knicks", "Celtics",  // Eastern Atlantic, .646 then .500
      "Bulls",              // Eastern Central
      "Nuggets",            // Western Northwest
      "Spurs",              // Western Southwest
    ]);
  });

  it("the best record in the league does not float to the top of a grouped sort", () => {
    // The Spurs are the best team here and must still sit under Western.
    const byConf = order((t) => confKey(t.conf, t.reg));
    expect(byConf[0]).toBe("Bulls");
    expect(byConf.indexOf("Spurs")).toBeGreaterThan(byConf.indexOf("Celtics"));
  });
});

describe("recordsAtWeek splits a week's cumulative record", () => {
  // The 2026 Spurs, from public/data/nba/elo/seasons/2026.json: reg 62-20, post
  // 13-10, weekly rec 0-0 -> 18-7 (wk 8, ending 12-14) -> 21-8 (wk 9, ending
  // 12-21) -> 75-31 (final). They LOST the 2025 NBA Cup final on 2025-12-16,
  // which is inside week 9 and counts toward neither season column.
  const REG: [number, number] = [62, 20];
  const POST: [number, number] = [13, 10];
  const CUP: CupFinal = { date: "2025-12-16", result: [0, 1] };

  it("before the Cup final the week's record is all regular season", () => {
    const at = recordsAtWeek(REG, POST, [18, 7], { weekDate: "2025-12-14", cup: CUP });
    expect(at.reg).toEqual([18, 7]);
    // 🔴 Blank, not 0-0. 0-0 would claim they played the playoffs and lost none.
    expect(at.post).toBeNull();
    expect(at.total).toEqual([18, 7]);
  });

  // 🔴 THE FIX, per Ashwin 2026-09-19: "after those dates you would show the
  // regular season totals as expected and the extra cup final games in the
  // playoffs section". Week 9's 21-8 is a 21-7 regular season plus the Cup loss.
  it("from the Cup final the regular column drops it and the playoff column carries it", () => {
    const at = recordsAtWeek(REG, POST, [21, 8], { weekDate: "2025-12-21", cup: CUP });
    expect(at.reg).toEqual([21, 7]);
    expect(at.post).toEqual([0, 1]);
    expect(at.total).toEqual([21, 8]);
  });

  it("a Cup winner carries it as a win", () => {
    const at = recordsAtWeek([53, 29], [16, 3], [22, 5],
      { weekDate: "2025-12-21", cup: { date: "2025-12-16", result: [1, 0] } });
    expect(at.reg).toEqual([21, 5]);
    expect(at.post).toEqual([1, 0]);
  });

  it("at the end of the regular season the Cup game alone sits in Playoffs", () => {
    const at = recordsAtWeek(REG, POST, [62, 21], { weekDate: "2026-04-12", cup: CUP });
    expect(at.reg).toEqual(REG);
    expect(at.post).toEqual([0, 1]);
  });

  it("the final week is the official postseason plus the Cup game", () => {
    const at = recordsAtWeek(REG, POST, [75, 31], { weekDate: "2026-06-14", cup: CUP });
    expect(at.reg).toEqual(REG);
    expect(at.post).toEqual([13, 11]);
    expect(at.total).toEqual([75, 31]);
  });

  it("a team with no Cup final splits on reg alone", () => {
    const at = recordsAtWeek([41, 41], [4, 8], [45, 49], { weekDate: "2026-06-01", cup: null });
    expect(at.reg).toEqual([41, 41]);
    expect(at.post).toEqual([4, 8]);
  });

  it("mid regular season, no Cup team: the week's record is the regular season", () => {
    const at = recordsAtWeek(REG, POST, [38, 17], { weekDate: "2026-02-15", cup: null });
    expect(at.reg).toEqual([38, 17]);
    expect(at.post).toBeNull();
  });

  it("a team that missed the playoffs never grows a playoff record", () => {
    const at = recordsAtWeek([30, 52], null, [30, 52], { weekDate: "2026-04-12" });
    expect(at.reg).toEqual([30, 52]);
    expect(at.post).toBeNull();
  });

  it("no weekly record (an upcoming shell) leaves the season row untouched", () => {
    const at = recordsAtWeek(REG, POST, null);
    expect(at.reg).toEqual(REG);
    expect(at.post).toEqual(POST);
    expect(at.total).toEqual([75, 30]);
  });

  it("no regular-season total: the week is all there is, none of it called playoffs", () => {
    const at = recordsAtWeek(null, null, [12, 4], { weekDate: "2026-01-01" });
    expect(at.reg).toEqual([12, 4]);
    expect(at.post).toBeNull();
    expect(at.total).toEqual([12, 4]);
  });

  // 2024 has two teams the Cup does not explain (the Mavericks are a loss DOWN,
  // where one final can only put one team up). Fall back to the workbook rather
  // than print a negative record. Backlog row filed.
  it("falls back to post when a week cannot support the split", () => {
    const at = recordsAtWeek([50, 32], [13, 10], [63, 30], { weekDate: "2024-06-01", cup: null });
    expect(at.post).toEqual([13, 10]);
  });
});
