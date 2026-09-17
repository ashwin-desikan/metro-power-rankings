import { describe, it, expect } from "vitest";
import { winPct, pctKey, confKey, divKey } from "./standingsSort";

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
