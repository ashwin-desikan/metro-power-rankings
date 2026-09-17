import { describe, it, expect } from "vitest";
import {
  seasonDisplayNameFromGroups,
  seasonTypeFromCalendar,
  seasonTypeFromGroups,
} from "./standingsShape";

// 🔴 THE SHAPE BELOW IS MEASURED, NOT ASSUMED.
//
// Fetched live from
//   https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings
//   https://site.api.espn.com/apis/v2/sports/basketball/nba/standings
// on 2026-09-17. BOTH returned, byte for byte, the same trio nested once per
// conference under children[].standings and nowhere else:
//
//   "season":2026,"seasonType":2,"seasonDisplayName":"2025-26"
//
// and carried NO top-level `season` object, NO `seasons[]` array, NO
// `types[]`, and no startDate/endDate anywhere in 98KB of payload. The first
// version of this fix read a `seasons[].types[]` calendar and would have
// resolved nothing for either league. Measure before fixing.

/** The NBA/NHL standings payload, trimmed to what the readers touch. */
function groupsPayload(opts: {
  seasonType?: number;
  displayName?: string;
  season?: number;
  omitStandings?: boolean;
}) {
  const standings = {
    id: "0",
    name: "overall",
    season: opts.season ?? 2026,
    seasonType: opts.seasonType ?? 2,
    seasonDisplayName: opts.displayName ?? "2025-26",
    entries: [],
  };
  return {
    uid: "s:70~l:90~g:9",
    name: "National Hockey League",
    children: [
      opts.omitStandings ? { uid: "g:7", id: "7" } : { uid: "g:7", id: "7", standings },
      opts.omitStandings ? { uid: "g:8", id: "8" } : { uid: "g:8", id: "8", standings },
    ],
  };
}

describe("seasonTypeFromGroups, the field the payload actually has", () => {
  it("🔴 reads seasonType from children[].standings, where NBA and NHL put it", () => {
    expect(seasonTypeFromGroups(groupsPayload({ seasonType: 2 }))).toBe("regular");
    expect(seasonTypeFromGroups(groupsPayload({ seasonType: 1 }))).toBe("preseason");
    expect(seasonTypeFromGroups(groupsPayload({ seasonType: 3 }))).toBe("postseason");
    expect(seasonTypeFromGroups(groupsPayload({ seasonType: 4 }))).toBe("offseason");
  });

  it("🔴 a preseason table resolves to preseason even with non-zero records", () => {
    // The whole failure mode: the old fallback asked "are all the records
    // zero", preseason records are not zero, so it said regular season.
    expect(seasonTypeFromGroups(groupsPayload({ seasonType: 1 }))).toBe("preseason");
  });

  it("returns unknown rather than guessing when no group carries the field", () => {
    expect(seasonTypeFromGroups(groupsPayload({ omitStandings: true }))).toBe("unknown");
    expect(seasonTypeFromGroups({})).toBe("unknown");
    expect(seasonTypeFromGroups({ children: [] })).toBe("unknown");
  });

  it("ignores an out-of-range seasonType instead of coercing it", () => {
    expect(seasonTypeFromGroups(groupsPayload({ seasonType: 0 }))).toBe("unknown");
    expect(seasonTypeFromGroups(groupsPayload({ seasonType: 9 }))).toBe("unknown");
  });
});

describe("seasonDisplayNameFromGroups", () => {
  it("returns ESPN's two-year label so a heading cannot read '2026 Season'", () => {
    expect(seasonDisplayNameFromGroups(groupsPayload({ displayName: "2025-26" }))).toBe("2025-26");
    expect(seasonDisplayNameFromGroups(groupsPayload({ displayName: "2026-27" }))).toBe("2026-27");
  });

  it("returns empty, not a guess, when the label is missing", () => {
    expect(seasonDisplayNameFromGroups(groupsPayload({ displayName: "" }))).toBe("");
    expect(seasonDisplayNameFromGroups({})).toBe("");
  });
});

// 🔴 WHY THIS FILE EXISTS.
//
// lib/nhl-standings.ts and lib/nba-standings.ts each keep a PRIVATE copy of
// the shaping logic rather than importing lib/standingsShape.ts. So when the
// 2026-09-04 fix landed -- ESPN stopped sending `season.type`, and the reader
// has to fall back to the payload's own type calendar -- only the NFL/MLB
// path got it. Both league adapters still ended their ladder with
// `return "unknown"`, which meant:
//
//   NHL: `is_preseason` fell through to "are all the records zero". Preseason
//        records are not zero, so a preseason table would have rendered under
//        a "2026 Season" heading, exactly the NFL bug, from ~20 Sep 2026.
//   NBA: `is_offseason` is `type === "offseason" || type === "unknown"`, so it
//        was permanently true.
//
// Both now call seasonTypeFromGroups first and seasonTypeFromCalendar second.
// These cases pin both readers so a future edit cannot quietly return them to
// a guess. The adapters' own wiring is covered by the typecheck and by a live
// measurement against ESPN, not by this file: they import "server-only",
// which a vitest run cannot resolve.
//
// ⚠️ STILL UNVERIFIED, and it cannot be verified before ~20 Sep 2026: whether
// ESPN actually flips seasonType to 1 once NHL preseason games are played. On
// 2026-09-17 both leagues served seasonType 2 for the COMPLETED 2025-26
// season, so seasonType describes which TABLE came back, not where the
// calendar has got to. Liveness still belongs to isLeagueLive's games-played
// test. If ESPN turns out to serve preseason rows under seasonType 2, this
// fix does not catch it and the guard has to move to the games-played side.
// Check the NHL board between 20 and 28 Sep and record what it did.

/** A standings payload carrying only what the calendar reader looks at. */
function withCalendar(
  year: number,
  types: { id: string; startDate: string; endDate: string }[],
) {
  return { season: { year, displayName: String(year) }, seasons: [{ year, types }] };
}

// Source: NHL.com, 2026-27 regular season opens Tue 29 Sep 2026.
const NHL_2027 = withCalendar(2027, [
  { id: "1", startDate: "2026-09-20T04:00Z", endDate: "2026-09-29T03:59Z" },
  { id: "2", startDate: "2026-09-29T04:00Z", endDate: "2027-04-17T03:59Z" },
  { id: "3", startDate: "2027-04-17T04:00Z", endDate: "2027-06-25T03:59Z" },
  { id: "4", startDate: "2027-06-25T04:00Z", endDate: "2027-09-19T03:59Z" },
]);

// Source: NBA.com, 2026-27 regular season opens Tue 20 Oct 2026.
const NBA_2027 = withCalendar(2027, [
  { id: "1", startDate: "2026-10-02T04:00Z", endDate: "2026-10-20T03:59Z" },
  { id: "2", startDate: "2026-10-20T04:00Z", endDate: "2027-04-13T03:59Z" },
  { id: "3", startDate: "2027-04-13T04:00Z", endDate: "2027-06-23T03:59Z" },
  { id: "4", startDate: "2027-06-23T04:00Z", endDate: "2027-09-30T03:59Z" },
]);

const on = (iso: string) => Date.parse(iso);

describe("seasonTypeFromCalendar, NHL 2026-27", () => {
  it("🔴 calls the week before the opener PRESEASON, not the regular season", () => {
    // The whole point. On this date the standings carry non-zero preseason
    // records, so the old zero-records fallback said "regular season".
    expect(seasonTypeFromCalendar(NHL_2027, 2027, on("2026-09-24T12:00Z"))).toBe("preseason");
  });

  it("flips to regular on opening night, 29 Sep 2026", () => {
    expect(seasonTypeFromCalendar(NHL_2027, 2027, on("2026-09-28T23:00Z"))).toBe("preseason");
    expect(seasonTypeFromCalendar(NHL_2027, 2027, on("2026-09-29T12:00Z"))).toBe("regular");
  });

  it("is postseason in May and offseason in July", () => {
    expect(seasonTypeFromCalendar(NHL_2027, 2027, on("2027-05-10T12:00Z"))).toBe("postseason");
    expect(seasonTypeFromCalendar(NHL_2027, 2027, on("2027-07-10T12:00Z"))).toBe("offseason");
  });
});

describe("seasonTypeFromCalendar, NBA 2026-27", () => {
  it("🔴 calls early October PRESEASON, so is_offseason cannot latch on", () => {
    expect(seasonTypeFromCalendar(NBA_2027, 2027, on("2026-10-08T12:00Z"))).toBe("preseason");
  });

  it("flips to regular on opening night, 20 Oct 2026", () => {
    expect(seasonTypeFromCalendar(NBA_2027, 2027, on("2026-10-19T23:00Z"))).toBe("preseason");
    expect(seasonTypeFromCalendar(NBA_2027, 2027, on("2026-10-20T12:00Z"))).toBe("regular");
  });

  it("is still the regular season in the new calendar year", () => {
    expect(seasonTypeFromCalendar(NBA_2027, 2027, on("2027-01-15T12:00Z"))).toBe("regular");
  });
});

describe("seasonTypeFromCalendar refuses to guess", () => {
  it("ignores a calendar belonging to a different season year", () => {
    // Measured 2026-09-04: NBA, NHL and MLB all returned a 2027 season id
    // carrying 2025-26 windows. Reading index 0 blindly would have been wrong
    // for all three.
    expect(seasonTypeFromCalendar(NHL_2027, 2026, on("2026-09-24T12:00Z"))).toBe("unknown");
  });

  it("returns unknown rather than a default when there is no calendar at all", () => {
    expect(seasonTypeFromCalendar({ season: { year: 2027 } }, 2027, on("2026-09-24T12:00Z")))
      .toBe("unknown");
    expect(seasonTypeFromCalendar({}, 0, on("2026-09-24T12:00Z"))).toBe("unknown");
  });

  it("returns unknown in a gap between windows rather than picking the nearest", () => {
    const gapped = withCalendar(2027, [
      { id: "1", startDate: "2026-09-20T04:00Z", endDate: "2026-09-25T03:59Z" },
      { id: "2", startDate: "2026-09-29T04:00Z", endDate: "2027-04-17T03:59Z" },
    ]);
    expect(seasonTypeFromCalendar(gapped, 2027, on("2026-09-27T12:00Z"))).toBe("unknown");
  });
});
