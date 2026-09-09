import { describe, expect, it } from "vitest";
import { eraAbbr } from "./nflEra";

// The season-page label is the abbreviation of that season, not the
// franchise's. Ashwin's ask (2026-09-09): the 1999 Rams read LAR on a page
// whose every other label said St. Louis.

describe("eraAbbr", () => {
  it("uses the era code when the shard's city + team names a past era", () => {
    expect(eraAbbr("St. Louis", "Rams", "LAR")).toBe("STL");
    expect(eraAbbr("Houston", "Oilers", "TEN")).toBe("HOU");
    expect(eraAbbr("Tennessee", "Oilers", "TEN")).toBe("TEN");
    expect(eraAbbr("San Diego", "Chargers", "LAC")).toBe("SD");
    expect(eraAbbr("Baltimore", "Colts", "IND")).toBe("BAL");
    expect(eraAbbr("Phoenix", "Cardinals", "ARI")).toBe("PHX");
  });

  it("keeps the two Los Angeles clubs of 1982 to 1994 apart", () => {
    expect(eraAbbr("Los Angeles", "Raiders", "LV")).toBe("RAI");
    expect(eraAbbr("Los Angeles", "Rams", "LAR")).toBe("LAR");
    expect(eraAbbr("Oakland", "Raiders", "LV")).toBe("OAK");
  });

  it("falls through to the franchise monogram for the current era", () => {
    expect(eraAbbr("Kansas City", "Chiefs", "KC")).toBe("KC");
    expect(eraAbbr("Las Vegas", "Raiders", "LV")).toBe("LV");
  });

  it("tolerates the doubled space some shard rows carry", () => {
    expect(eraAbbr("Baltimore ", " Colts", "IND")).toBe("BAL");
    expect(eraAbbr("Cincinnati ", " Bengals", "CIN")).toBe("CIN");
  });

  it("uses the city for a defunct club with no franchise code", () => {
    expect(eraAbbr("Pottsville", "Maroons", null)).toBe("POT");
    expect(eraAbbr("Canton", "Bulldogs", null)).toBe("CAN");
    expect(eraAbbr(null, null, null)).toBe("NFL");
  });
});
