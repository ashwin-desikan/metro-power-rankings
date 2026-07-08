import { describe, it, expect } from "vitest";
import { TIERS, computeTier, tierName, tierAnchor } from "./tiers";

describe("computeTier", () => {
  it("resolves a score to the correct tier by lower bound", () => {
    expect(computeTier(150).slug).toBe("global-capital");
    expect(computeTier(100).slug).toBe("global-capital");
    expect(computeTier(75).slug).toBe("world-city");
    expect(computeTier(50).slug).toBe("world-city");
    expect(computeTier(30).slug).toBe("major-metro");
    expect(computeTier(15).slug).toBe("regional-hub");
    expect(computeTier(7).slug).toBe("established-city");
    expect(computeTier(2).slug).toBe("emerging-city");
  });

  it("falls back to the lowest tier for 0 and negative scores", () => {
    expect(computeTier(0).slug).toBe("local-city");
    expect(computeTier(-5).slug).toBe("local-city");
  });

  it("is exact at every tier's lower boundary", () => {
    for (const tier of TIERS) {
      expect(computeTier(tier.lowerBound).slug).toBe(tier.slug);
    }
  });

  it("resolves the value just below a boundary to the next tier down", () => {
    for (let i = 0; i < TIERS.length - 1; i++) {
      const boundary = TIERS[i].lowerBound;
      expect(computeTier(boundary - 0.01).slug).not.toBe(TIERS[i].slug);
    }
  });

  it("always returns a tier, never undefined", () => {
    expect(computeTier(Number.NEGATIVE_INFINITY)).toBeDefined();
    expect(computeTier(Number.POSITIVE_INFINITY)).toBeDefined();
  });
});

describe("tierName", () => {
  it("returns the reader-facing name for a score", () => {
    expect(tierName(100)).toBe("Global Capital");
    expect(tierName(0)).toBe("Local Metro");
  });
});

describe("tierAnchor", () => {
  it("returns a stable methodology anchor for a score", () => {
    expect(tierAnchor(100)).toBe("tier-global-capital");
    expect(tierAnchor(0)).toBe("tier-local-city");
  });
});
