import { describe, it, expect } from "vitest";
import { adtechEvents, sportEvents, politicsEvents, formatDay } from "./digestEvents";
import { nextElections } from "./electionHubsMeta";

const SEP13 = new Date("2026-09-13T12:00:00Z");

describe("formatDay", () => {
  it("formats in UTC, so the card does not shift a day with the reader's clock", () => {
    expect(formatDay("2026-09-23")).toBe("23 Sept");
    expect(formatDay("2026-01-01")).toBe("1 Jan");
  });
});

describe("politicsEvents", () => {
  it("returns only dates an authority actually set", () => {
    const rows = politicsEvents(SEP13, 50);
    expect(rows.length).toBeGreaterThan(0);
    // Every row must trace back to a hub marked confirmed and not overdue. Printing an
    // expected date as a real one is the exact failure the confidence field prevents.
    const byDate = new Map(nextElections(SEP13).map((e) => [e.name, e]));
    for (const r of rows) {
      const hub = byDate.get(r.label);
      expect(hub?.confidence).toBe("confirmed");
      expect(hub?.overdue).toBe(false);
    }
  });

  it("is soonest first and never in the past", () => {
    const rows = politicsEvents(SEP13, 50);
    const days = rows.map((r) => r.daysAway ?? 0);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(Math.min(...days)).toBeGreaterThanOrEqual(0);
  });

  it("honours the limit", () => {
    expect(politicsEvents(SEP13, 2)).toHaveLength(2);
  });
});

describe("adtechEvents", () => {
  it("is soonest first", () => {
    const rows = adtechEvents(SEP13, 10);
    const days = rows.map((r) => r.daysAway ?? 0);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it("keeps a multi-day event while it is still running", () => {
    // IBC runs 11–14 September. On the 13th it is on, not over.
    const labels = adtechEvents(SEP13, 10).map((e) => e.label);
    expect(labels).toContain("IBC");
  });

  it("drops events once they are properly past", () => {
    const nov = new Date("2026-11-01T12:00:00Z");
    expect(adtechEvents(nov, 10)).toHaveLength(0);
  });

  // 🔴 The guard that matters. Each shortlist is a taster under someone else's database
  // right, not a copy of their calendar. The Digital Voice's sheet holds 428 events and
  // Summitly 450+. If a future change grows either list, this fails.
  it("stays a shortlist rather than becoming an import", () => {
    const JAN = new Date("2026-01-01T00:00:00Z");
    expect(adtechEvents(JAN, 1000).length).toBeLessThanOrEqual(12);
    expect(sportEvents(JAN, 1000).length).toBeLessThanOrEqual(12);
  });
});

// Ashwin, 2026-09-13: "I don't really want to track games here ... It would be more like
// sports business events." The regression to guard is a future change wiring this back to
// the fixture ticker, which is what the sport lens used to be.
describe("sportEvents", () => {
  it("carries dated business events, nearest first", () => {
    const rows = sportEvents(SEP13, 10);
    expect(rows.length).toBeGreaterThan(0);
    const away = rows.map((e) => e.daysAway ?? 0);
    expect([...away].sort((a, b) => a - b)).toEqual(away);
  });

  it("names conferences rather than fixtures", () => {
    const labels = sportEvents(SEP13, 10).map((e) => e.label);
    expect(labels).toContain("Leaders Week");
    expect(labels.some((l) => / v /.test(l))).toBe(false);
  });
});
