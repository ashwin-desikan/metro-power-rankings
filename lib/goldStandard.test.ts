import { describe, it, expect } from "vitest";
import { isGoldStandardLeague, GOLD_STANDARD_LEAGUES_BY_SPORT } from "./goldStandard";

describe("isGoldStandardLeague", () => {
  it("recognizes workbook-driven gold leagues", () => {
    expect(isGoldStandardLeague("Basketball", "NBA")).toBe(true);
    expect(isGoldStandardLeague("Baseball", "MLB")).toBe(true);
    expect(isGoldStandardLeague("Hockey", "NHL")).toBe(true);
  });

  it("returns false for a non-gold league in a known sport", () => {
    expect(isGoldStandardLeague("Basketball", "EuroLeague")).toBe(false);
  });

  it("returns false for an unknown sport", () => {
    expect(isGoldStandardLeague("Curling", "Anything")).toBe(false);
  });

  it("treats the men's Football Big 5 as gold regardless of workbook state", () => {
    for (const league of ["England", "Spain", "Italy", "France", "Germany"]) {
      expect(isGoldStandardLeague("Football", league)).toBe(true);
    }
  });

  it("does not treat a non-Big-5 football league as gold", () => {
    expect(isGoldStandardLeague("Football", "Portugal")).toBe(false);
  });

  it("normalizes 'Soccer' to the Football gold set", () => {
    expect(isGoldStandardLeague("Soccer", "England")).toBe(true);
    expect(isGoldStandardLeague("Soccer", "Portugal")).toBe(false);
  });

  it("merges Big 5 alongside any workbook-provided Football leagues", () => {
    const football = GOLD_STANDARD_LEAGUES_BY_SPORT["Football"];
    expect(football.has("England")).toBe(true);
    expect(football.has("Spain")).toBe(true);
  });
});
