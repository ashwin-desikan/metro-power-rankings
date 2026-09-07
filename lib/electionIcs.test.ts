import { describe, it, expect } from "vitest";
import { foldLine, confirmedHubs, buildHubEvent, buildCalendar } from "./electionIcs";
import type { ElectionHubMeta } from "./electionHubsMeta";

describe("foldLine", () => {
  it("leaves a short line untouched", () => {
    const line = "SUMMARY:United States: 2026 midterms, 3 November";
    expect(foldLine(line)).toBe(line);
  });

  it("folds a line over 75 octets at CRLF + one space, content-preserving", () => {
    const long =
      "DESCRIPTION:" +
      "This is a deliberately long description line meant to exceed the seventy five octet budget RFC 5545 allows on one physical line.";
    const folded = foldLine(long);
    const physicalLines = folded.split("\r\n");
    expect(physicalLines.length).toBeGreaterThan(1);
    // first line <=75 octets, continuation lines (incl. leading space) <=75 octets
    expect(Buffer.byteLength(physicalLines[0], "utf8")).toBeLessThanOrEqual(75);
    for (const l of physicalLines.slice(1)) {
      expect(l.startsWith(" ")).toBe(true);
      expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    }
    // unfolding (strip CRLF + following space) must reconstruct the original text
    const unfolded = folded.replace(/\r\n /g, "");
    expect(unfolded).toBe(long);
  });

  it("never splits a multi-byte UTF-8 character across two folded lines", () => {
    // repeat a 3-byte character enough to force a fold near a boundary
    const long = "SUMMARY:" + "élection ".repeat(20);
    const folded = foldLine(long);
    for (const l of folded.split("\r\n")) {
      // a valid UTF-8 string round-trips through Buffer without replacement chars
      const buf = Buffer.from(l, "utf8");
      expect(buf.toString("utf8")).toBe(l);
      expect(buf.toString("utf8")).not.toContain("�");
    }
    const unfolded = folded.replace(/\r\n /g, "");
    expect(unfolded).toBe(long);
  });
});

const HUB_CONFIRMED: ElectionHubMeta = {
  code: "zz",
  flag: "zz",
  name: "Zzedonia",
  href: "/elections/zz",
  last: "general election, 1 January 2020",
  next: "general election, 1 January 2027",
  nextDate: "2027-01-01",
  nextConfidence: "confirmed",
  governmentType: "parliamentary",
};
const HUB_EXPECTED: ElectionHubMeta = {
  ...HUB_CONFIRMED,
  code: "yy",
  name: "Yylandia",
  nextConfidence: "expected",
};
const HUB_UNSCHEDULED: ElectionHubMeta = {
  ...HUB_CONFIRMED,
  code: "xx",
  name: "Xxistan",
  nextDate: undefined,
  nextConfidence: "unscheduled",
};

describe("confirmedHubs", () => {
  it("keeps only hubs with a confirmed date and drops expected/unscheduled ones", () => {
    const hubs = { zz: HUB_CONFIRMED, yy: HUB_EXPECTED, xx: HUB_UNSCHEDULED };
    const result = confirmedHubs(hubs);
    expect(result.map((h) => h.code)).toEqual(["zz"]);
  });

  it("returns an empty array when nothing is confirmed", () => {
    expect(confirmedHubs({ yy: HUB_EXPECTED, xx: HUB_UNSCHEDULED })).toEqual([]);
  });
});

describe("buildHubEvent / buildCalendar", () => {
  it("produces a VEVENT with the expected UID, DTSTART and no result for an unconfirmed hub", () => {
    const lines = buildHubEvent(HUB_CONFIRMED, "20260101T000000Z");
    expect(lines[0]).toBe("BEGIN:VEVENT");
    expect(lines).toContain("UID:zz-2027-01-01@rankings.citizenofnowhere.org");
    expect(lines).toContain("DTSTART;VALUE=DATE:20270101");
    expect(lines[lines.length - 1]).toBe("END:VEVENT");

    expect(buildHubEvent(HUB_UNSCHEDULED, "20260101T000000Z")).toEqual([]);
  });

  it("builds a valid empty calendar when no hub is confirmed", () => {
    const ics = buildCalendar([], "Test calendar");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("builds a calendar with one event per confirmed hub", () => {
    const ics = buildCalendar([HUB_CONFIRMED], "Test calendar");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect(ics).toContain("SUMMARY:Zzedonia: general election\\, 1 January 2027");
  });
});
