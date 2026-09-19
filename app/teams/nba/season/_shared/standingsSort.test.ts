import { describe, it, expect } from "vitest";
import { winPct, pctKey, confKey, divKey, recordsAtWeek } from "./standingsSort";

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
  // The 2026 Spurs, from public/data/nba/elo/seasons/2026.json: reg 62-20,
  // post 13-10, weekly rec running 0-0 -> 38-17 (wk 17) -> 75-31 (final).
  const REG: [number, number] = [62, 20];
  const POST: [number, number] = [13, 10];

  it("mid regular season: the week's record IS the regular season, no playoffs yet", () => {
    const at = recordsAtWeek(REG, POST, [38, 17]);
    expect(at.reg).toEqual([38, 17]);
    expect(at.total).toEqual([38, 17]);
    // 🔴 Blank, not 0-0. 0-0 would claim they played the playoffs and lost none.
    expect(at.post).toBeNull();
  });

  it("past the regular season: regular fixed, playoffs are the difference", () => {
    const at = recordsAtWeek(REG, POST, [68, 24]);
    expect(at.reg).toEqual(REG);
    expect(at.post).toEqual([6, 4]);
    expect(at.total).toEqual([68, 24]);
  });

  // 🔴 REGRESSION. This returned `post` (13-10) at a week where no playoff game
  // had been played, because rec == reg falls past the "still in the regular
  // season" test and the zero difference was treated as "unusable" and fell back
  // to the season record. Blank is the only honest answer here.
  it("at the exact end of the regular season there are still no playoffs", () => {
    const at = recordsAtWeek(REG, POST, [62, 20]);
    expect(at.reg).toEqual(REG);
    expect(at.post).toBeNull();
    expect(at.total).toEqual([62, 20]);
  });

  // Ashwin, 2026-09-19: "play-in are postseason", so the subtraction applies at
  // the final week too and is not special-cased back to `post`. For the Spurs
  // that means 13-11 rather than the workbook's 13-10, a known one-game
  // disagreement between the weekly series and the season totals.
  it("derives the final week too, play-in included", () => {
    const at = recordsAtWeek(REG, POST, [75, 31]);
    expect(at.reg).toEqual(REG);
    expect(at.post).toEqual([13, 11]);
    expect(at.total).toEqual([75, 31]);
  });

  it("a team that missed the playoffs never grows a playoff record", () => {
    const at = recordsAtWeek([30, 52], null, [30, 52]);
    expect(at.reg).toEqual([30, 52]);
    expect(at.post).toBeNull();
    expect(at.total).toEqual([30, 52]);
  });

  it("no weekly record (an upcoming shell) leaves the season row untouched", () => {
    const at = recordsAtWeek(REG, POST, null);
    expect(at.reg).toEqual(REG);
    expect(at.post).toEqual(POST);
    expect(at.total).toEqual([75, 30]);
  });

  it("no regular-season total: the week is all there is, none of it called playoffs", () => {
    const at = recordsAtWeek(null, null, [12, 4]);
    expect(at.reg).toEqual([12, 4]);
    expect(at.post).toBeNull();
    expect(at.total).toEqual([12, 4]);
  });

  // The 2024 Mavericks are the disagreement in the other direction: rec 63-41
  // against reg+post 63-42. Both components of the subtraction are still
  // non-negative, so the rule applies and the derived playoff record is 13-9, one
  // loss fewer than the workbook's 13-10. Asserted as the rule's real output, not
  // as a fallback: an earlier version of this test expected 13-10 and was simply
  // wrong about what the code does.
  it("derives 13-9 for the 2024 Mavericks, one loss off the workbook", () => {
    const at = recordsAtWeek([50, 32], [13, 10], [63, 41]);
    expect(at.reg).toEqual([50, 32]);
    expect(at.post).toEqual([13, 9]);
    expect(at.total).toEqual([63, 41]);
  });

  // A constructed case, because no real season exhibits it: if the weekly series
  // ever ran BEHIND the regular-season total in a component, the subtraction would
  // print a negative record. Blank instead, and never `post`.
  it("shows no playoff record rather than a negative one", () => {
    const at = recordsAtWeek([50, 32], [13, 10], [63, 30]);
    expect(at.post).toBeNull();
    expect(at.total).toEqual([63, 30]);
  });
});
