import { describe, it, expect, vi, afterEach } from "vitest";
import { shapeStandings } from "./standingsShape";

// The 2026 shape of ESPN's NFL standings payload, trimmed to what the shaper
// reads. The important part is what is NOT here: `season.type`. ESPN stopped
// sending it, every branch of pickSeasonType missed, and the season type fell
// back to "are all the records zero" -- which preseason records are not. So the
// site presented a 3-0 preseason table as the 2026 season for the whole of
// August 2026. These cases exist so that cannot happen quietly again.
function payload(opts: {
  year?: number;
  wins?: number;
  losses?: number;
  types?: { id: string; startDate: string; endDate: string }[];
}) {
  const year = opts.year ?? 2026;
  return {
    season: { year, startDate: "2026-08-06T07:00Z", endDate: "2027-02-16T07:59Z", displayName: String(year) },
    seasons: [
      {
        year,
        types: opts.types ?? [
          { id: "1", name: "Preseason", startDate: "2026-08-06T07:00Z", endDate: "2026-09-06T06:59Z" },
          { id: "2", name: "Regular Season", startDate: "2026-09-06T07:00Z", endDate: "2027-01-13T07:59Z" },
          { id: "3", name: "Postseason", startDate: "2027-01-13T08:00Z", endDate: "2027-02-16T07:59Z" },
          { id: "4", name: "Off Season", startDate: "2027-02-16T08:00Z", endDate: "2027-08-01T06:59Z" },
        ],
      },
    ],
    children: [
      {
        abbreviation: "AFC",
        standings: {
          entries: [
            {
              team: { id: "2", name: "Bills", displayName: "Buffalo Bills", abbreviation: "BUF" },
              stats: [
                { name: "wins", value: opts.wins ?? 0, displayValue: String(opts.wins ?? 0) },
                { name: "losses", value: opts.losses ?? 0, displayValue: String(opts.losses ?? 0) },
                { name: "ties", value: 0, displayValue: "0" },
                { name: "pointsFor", value: 88 },
                { name: "pointsAgainst", value: 48 },
              ],
            },
          ],
        },
      },
    ],
  };
}

const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

afterEach(() => {
  vi.useRealTimers();
});

describe("shapeStandings season type", () => {
  it("reads the season type from ESPN's own calendar when season.type is absent", () => {
    at("2026-09-04T10:00:00Z");
    expect(shapeStandings(payload({})).season_type).toBe("preseason");
  });

  it("is the regular season once the calendar says so", () => {
    at("2026-09-10T00:00:00Z");
    expect(shapeStandings(payload({})).season_type).toBe("regular");
  });

  it("is the postseason in January and the offseason in March", () => {
    at("2027-01-20T00:00:00Z");
    expect(shapeStandings(payload({})).season_type).toBe("postseason");
    at("2027-03-01T00:00:00Z");
    expect(shapeStandings(payload({})).season_type).toBe("offseason");
  });

  it("🔴 calls a 3-0 preseason table preseason, which the old zero-records fallback could not", () => {
    at("2026-09-04T10:00:00Z");
    const s = shapeStandings(payload({ wins: 3, losses: 0 }));
    expect(s.season_type).toBe("preseason");
    expect(s.is_preseason).toBe(true);
  });

  it("ignores a calendar that belongs to another season year", () => {
    // Measured 2026-09-04: NBA, NHL and MLB all returned a 2027 season id
    // carrying 2025-26 windows. Matching on the year is what makes reading
    // this array safe rather than a second guess.
    at("2026-09-04T10:00:00Z");
    const p = payload({});
    p.seasons[0].year = 2019;
    expect(shapeStandings(p).season_type).toBe("unknown");
  });

  it("survives a payload with no calendar at all", () => {
    at("2026-09-04T10:00:00Z");
    const p = payload({});
    (p as { seasons?: unknown }).seasons = undefined;
    expect(shapeStandings(p).season_type).toBe("unknown");
  });
});

describe("shapeStandings label", () => {
  it("names the table the regular season and says when it opens", () => {
    at("2026-09-04T10:00:00Z");
    const s = shapeStandings(payload({}));
    // "Sept", not "Sep": that is Node's en-GB short month for September, and
    // pinning the real output beats pinning what it looks like it should be.
    expect(s.source_label).toBe("2026 Regular Season · opens 6 Sept");
    expect(s.regular_season_start).toBe("2026-09-06T07:00:00.000Z");
  });

  it("describes the table, not the calendar, once the postseason starts", () => {
    // ESPN reports hasStandings=false for the postseason, so what comes back
    // then is the completed regular-season table.
    at("2027-01-20T00:00:00Z");
    expect(shapeStandings(payload({ wins: 14, losses: 3 })).source_label)
      .toBe("2026 Regular Season · final");
  });

  it("carries the week once the season is running", () => {
    at("2026-10-10T00:00:00Z");
    // pickWeek reads root.week.number; the other two candidates it tries hang
    // off season.type, which this payload no longer has at all.
    const p = { ...payload({ wins: 4, losses: 1 }), week: { number: 5 } };
    expect(shapeStandings(p).source_label).toBe("2026 Regular Season · Week 5");
  });
});

describe("shapeStandings records", () => {
  it("reads a team's record and derives games played and point difference", () => {
    at("2026-09-10T00:00:00Z");
    const s = shapeStandings(payload({ wins: 3, losses: 0 })).by_canonical["Bills"];
    expect(s.wins).toBe(3);
    expect(s.games_played).toBe(3);
    expect(s.point_diff).toBe(40);
    expect(s.conference).toBe("AFC");
  });

  it("returns an empty snapshot rather than throwing on rubbish", () => {
    expect(shapeStandings(null).by_canonical).toEqual({});
    expect(shapeStandings("nonsense").source_label).toBe("");
  });
});
