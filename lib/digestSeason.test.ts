import { describe, expect, it } from "vitest";
import { seasonSnapshot } from "./digestSeason";

// Mid-September: the NFL and the European leagues are under way, the AFL and NRL are in
// their finals, and the NBA and NHL are a few weeks out. A snapshot that cannot tell
// those three states apart is not worth putting at the top of the page.
const SEP13 = new Date("2026-09-13T12:00:00Z");
const JUL01 = new Date("2026-07-01T12:00:00Z");

describe("seasonSnapshot", () => {
  const s = seasonSnapshot(SEP13);
  const labels = (list: { label: string }[]) => list.map((e) => e.label);

  it("puts the codes in their finals under playoffs", () => {
    expect(labels(s.playoffs)).toContain("AFL");
    expect(labels(s.playoffs)).toContain("NRL");
  });

  it("puts the running competitions in season", () => {
    // Champions League deliberately NOT here any more: it is a knockout competition and
    // has its own bucket. See the separation test below.
    for (const l of ["NFL", "MLB", "Premier League", "NPB"]) {
      expect(labels(s.inSeason), l).toContain(l);
    }
  });

  it("lists what opens soon, nearest first, with a day count", () => {
    expect(labels(s.startingSoon)).toContain("NHL");
    expect(labels(s.startingSoon)).toContain("NBA");
    const away = s.startingSoon.map((e) => e.daysAway ?? 0);
    expect([...away].sort((a, b) => a - b)).toEqual(away);
    for (const e of s.startingSoon) expect(e.state).toMatch(/^(In \d+ days|Opens today)$/);
  });

  // Several competitions legitimately share a hub (all three club rugby leagues point
  // at /teams/rugby-union/clubs), so the slug is the only unique key.
  it("never lists the same competition twice, or in two buckets", () => {
    const all = [...s.playoffs, ...s.knockouts, ...s.inSeason, ...s.startingSoon].map((e) => e.slug);
    expect(new Set(all).size).toBe(all.length);
  });

  // Ashwin, 2026-09-13: "one that's just playoffs, like the ones that are actually stage
  // playoffs. The other section can be the knockout section." The two must not blur: a
  // knockout competition is one whatever stage it is at, and a playoff is an end-of-season
  // stage of a league.
  it("separates season-long knockouts from end-of-season playoffs", () => {
    const knock = s.knockouts.map((e) => e.label);
    for (const l of ["Champions League", "Europa League", "Copa Libertadores",
                     "League Cup", "UWCL"]) {
      expect(knock, l).toContain(l);
    }
    const playoff = s.playoffs.map((e) => e.label);
    for (const l of ["AFL", "NRL"]) expect(playoff, l).toContain(l);
    // A cup is never a playoff and a league final is never a knockout competition.
    for (const l of knock) expect(playoff).not.toContain(l);
  });

  it("keeps the continental cups out of in season, which is why the list shrank", () => {
    const inSeason = s.inSeason.map((e) => e.label);
    expect(inSeason).not.toContain("Champions League");
    expect(inSeason).toContain("Premier League");
  });

  it("gives every entry its sport's emoji", () => {
    for (const e of [...s.playoffs, ...s.knockouts, ...s.inSeason, ...s.startingSoon]) {
      expect(e.icon, e.label).toBeTruthy();
    }
  });

  it("drops the curated 'Live - ' prefix, since the heading already says it", () => {
    for (const e of [...s.playoffs, ...s.knockouts, ...s.inSeason]) {
      expect(e.state).not.toMatch(/^Live/);
    }
  });

  // The panel has to move with the calendar, not sit on September for ever.
  it("reads differently in July", () => {
    const july = seasonSnapshot(JUL01);
    expect(labels(july.inSeason)).not.toContain("NFL");
    expect(labels(july.inSeason)).toContain("MLB");
  });

  // Ashwin, 2026-09-13: "Anything that has a linkable hub should also be a link. Anything
  // that doesn't have a hub ... should just be blank." So a missing href is allowed; a
  // malformed one is not, because that renders as a dead link rather than as plain text.
  it("gives every entry a group, and a well-formed href or none at all", () => {
    for (const e of [...s.playoffs, ...s.knockouts, ...s.inSeason, ...s.startingSoon]) {
      expect(e.group).toBeTruthy();
      if (e.href !== undefined) expect(e.href.startsWith("/"), e.label).toBe(true);
    }
  });

  // The whole point of the rewrite: the board's competitions, not just the ones with a
  // league-hub row. These four have no curated status anywhere and reach the panel only
  // through their own months.
  it("covers the live standings boards that have no hub status", () => {
    const inSeason = s.inSeason.map((e) => e.label);
    for (const l of ["NPB", "KHL", "URC", "WSL"]) expect(inSeason, l).toContain(l);
  });

  it("uses the board's acronyms rather than full names", () => {
    const all = [...s.playoffs, ...s.inSeason, ...s.startingSoon].map((e) => e.label);
    for (const l of ["NFL", "NBA", "MLB", "NHL", "CBB"]) expect(all, l).toContain(l);
    expect(all).not.toContain("National Football League");
  });

  it("puts both college basketball seasons in starting soon", () => {
    const soon = s.startingSoon.map((e) => e.label);
    expect(soon).toContain("CBB");
    expect(soon).toContain("CBB (W)");
  });
});
