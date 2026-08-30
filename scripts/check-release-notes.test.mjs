import { describe, it, expect } from "vitest";
import { auditReleaseNotes, releaseDatesFrom, SKIP_MARKER } from "./check-release-notes.mjs";

const TODAY = "2026-08-31";
const c = (date, subject) => ({ date, subject });

function audit(commits, releaseDates = ["2026-08-29"], today = TODAY) {
  return auditReleaseNotes({ releaseDates, commits, today });
}

describe("releaseDatesFrom", () => {
  it("reads every entry date out of the releases source", () => {
    const src = `
      export const RELEASES = [
        { date: "2026-08-30", headline: "a", items: [] },
        { date: "2026-08-29", headline: "b", items: [] },
      ];
    `;
    expect(releaseDatesFrom(src)).toEqual(["2026-08-30", "2026-08-29"]);
  });

  it("returns nothing for a file with no entries", () => {
    expect(releaseDatesFrom("export const RELEASES = [];")).toEqual([]);
  });
});

describe("the closed-day failure this gate exists for", () => {
  it("fails a past day that shipped with no entry", () => {
    const f = audit([c("2026-08-30", "elections: six new hubs")]);
    expect(f).toHaveLength(1);
    expect(f[0].level).toBe("fail");
    expect(f[0].date).toBe("2026-08-30");
  });

  it("names the commits, so the note can actually be written", () => {
    const f = audit([
      c("2026-08-30", "elections: six new hubs"),
      c("2026-08-30", "rugby: rank pins"),
    ]);
    expect(f[0].subjects).toEqual(["elections: six new hubs", "rugby: rank pins"]);
  });

  it("fails every closed day, not just the most recent", () => {
    const f = audit([c("2026-08-30", "a"), c("2026-08-29", "b")], ["2026-08-28"]);
    expect(f.map((x) => x.date)).toEqual(["2026-08-29", "2026-08-30"]);
    expect(f.every((x) => x.level === "fail")).toBe(true);
  });
});

describe("what must NOT fail", () => {
  it("passes when the day already has an entry", () => {
    expect(audit([c("2026-08-30", "elections: six new hubs")], ["2026-08-30"])).toEqual([]);
  });

  it("passes a day covered by a LATER entry, since notes can lead the log", () => {
    expect(audit([c("2026-08-29", "a")], ["2026-08-30"])).toEqual([]);
  });

  it("ignores commits carrying the skip marker: no build, no release note", () => {
    expect(audit([c("2026-08-30", `data: refresh-schedule.json ${SKIP_MARKER}`)])).toEqual([]);
  });

  it("ignores a skipped commit even on a day that also shipped", () => {
    const f = audit([
      c("2026-08-30", `ops: daily sweep ${SKIP_MARKER}`),
      c("2026-08-30", "rugby: rank pins"),
    ]);
    expect(f[0].subjects).toEqual(["rugby: rank pins"]);
  });

  it("passes an entirely quiet stretch", () => {
    expect(audit([])).toEqual([]);
  });
});

describe("today is a warning, never a failure", () => {
  it("warns rather than failing while the day is still open", () => {
    const f = audit([c(TODAY, "rugby: rank pins")]);
    expect(f).toHaveLength(1);
    expect(f[0].level).toBe("warn");
  });

  it("does not break verify mid-session", () => {
    const f = audit([c(TODAY, "a"), c(TODAY, "b")]);
    expect(f.some((x) => x.level === "fail")).toBe(false);
  });

  it("still fails yesterday even when today is only a warning", () => {
    const f = audit([c("2026-08-30", "a"), c(TODAY, "b")]);
    expect(f.map((x) => x.level)).toEqual(["fail", "warn"]);
  });
});

describe("degenerate input", () => {
  it("fails loudly when there are no releases at all", () => {
    const f = auditReleaseNotes({ releaseDates: [], commits: [], today: TODAY });
    expect(f[0].level).toBe("fail");
  });

  it("uses the newest entry, not the first in file order", () => {
    const f = audit([c("2026-08-30", "a")], ["2026-08-01", "2026-08-30", "2026-08-15"]);
    expect(f).toEqual([]);
  });

  it("survives a subject containing the field separator", () => {
    const f = audit([c("2026-08-30", "elections: hubs\x1fand systems")]);
    expect(f[0].subjects[0]).toContain("and systems");
  });
});
