import { describe, it, expect } from "vitest";
import { AWARD_ORDER, orderSeasonAwards } from "./seasonAwardOrder";

type Entry = { award: string; player: string };

const e = (award: string, player: string): Entry => ({ award, player });

describe("orderSeasonAwards", () => {
  it("puts known awards in AWARD_ORDER, not input order", () => {
    const input = [
      e("Bert Bell Award", "A"),
      e("AP NFL MVP", "B"),
      e("Super Bowl MVP", "C"),
    ];
    const out = orderSeasonAwards(input).map((x) => x.award);
    expect(out).toEqual(["AP NFL MVP", "Super Bowl MVP", "Bert Bell Award"]);
  });

  it("never drops a label AWARD_ORDER does not name", () => {
    const input = [
      e("AP NFL MVP", "B"),
      e("Some New Award Nobody Named Yet", "Z"),
    ];
    const out = orderSeasonAwards(input);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.player)).toContain("Z");
  });

  it("puts unknown labels after every named award", () => {
    const input = [
      e("A Made-Up Award", "Z"),
      e("Bert Bell Award", "A"),
      e("AP NFL MVP", "B"),
    ];
    const out = orderSeasonAwards(input).map((x) => x.player);
    expect(out).toEqual(["B", "A", "Z"]);
  });

  it("keeps entries with the same label in their original order", () => {
    const input = [
      e("All-Pro", "first"),
      e("All-Pro", "second"),
      e("All-Pro", "third"),
    ];
    const out = orderSeasonAwards(input).map((x) => x.player);
    expect(out).toEqual(["first", "second", "third"]);
  });

  it("keeps multiple unknown labels in the order they were first seen", () => {
    const input = [
      e("Unknown One", "u1"),
      e("Unknown Two", "u2"),
      e("AP NFL MVP", "mvp"),
    ];
    const out = orderSeasonAwards(input).map((x) => x.player);
    expect(out).toEqual(["mvp", "u1", "u2"]);
  });

  it("AWARD_ORDER carries the sheet's own labels, not a paraphrase", () => {
    // Guards the exact trap that dropped MVP on the NBA honours section:
    // asserting the literal strings here means a rename shows up as a
    // failing test, not a silently empty award section.
    expect(AWARD_ORDER).toContain("AP NFL MVP");
    expect(AWARD_ORDER).not.toContain("MVP");
  });
});
