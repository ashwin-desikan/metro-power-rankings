import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, limiterHealth, __testing, type LimiterStore } from "./rateLimit";

// The fallback in checkRateLimit was silent until 2026-09-24, and silence was
// the bug: eight limits across six routes share this function, two of them a
// spend cap and a brute-force limit, so one missing environment variable turned
// all eight into per-instance speed bumps with nothing saying so.
//
// The store is injected rather than module-mocked, matching detect_issues.py's
// `fetch=None` seam. `() => null` is the no-store case, with no sentinel.

const none = () => null;

function workingStore(): LimiterStore {
  let n = 0;
  return {
    incr: async () => ++n,
    expire: async () => 1,
    ttl: async () => 30,
    ping: async () => "PONG",
  };
}

function brokenStore(message = "ECONNREFUSED"): LimiterStore {
  return {
    incr: async () => { throw new Error(message); },
    expire: async () => 1,
    ttl: async () => 30,
    ping: async () => { throw new Error(message); },
  };
}

describe("checkRateLimit", () => {
  beforeEach(() => { __testing.reset(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("still enforces the limit with no store, because a speed bump beats nothing", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit("k", 3, 60_000, none));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
  });

  it("counts a fallback when no store is configured", async () => {
    await checkRateLimit("k", 3, 60_000, none);
    expect(__testing.fallbacks).toBe(1);
  });

  it("warns ONCE per instance, not once per request", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("k", 99, 60_000, none);
    expect(__testing.fallbacks).toBe(5);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("does not count a fallback when the store works", async () => {
    const store = workingStore();
    await checkRateLimit("k", 3, 60_000, () => store);
    expect(__testing.fallbacks).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("falls back rather than locking users out when the store throws", async () => {
    const store = brokenStore();
    const r = await checkRateLimit("k", 3, 60_000, () => store);
    expect(r.ok).toBe(true);               // behaviour deliberately unchanged
    expect(__testing.fallbacks).toBe(1);   // but no longer unrecorded
  });

  it("refuses over the limit even while degraded, so a broken store is not an open door", async () => {
    const store = brokenStore();
    const out = [];
    for (let i = 0; i < 4; i++) out.push(await checkRateLimit("k2", 3, 60_000, () => store));
    expect(out.map((r) => r.ok)).toEqual([true, true, true, false]);
  });
});

describe("limiterHealth", () => {
  beforeEach(() => { __testing.reset(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("reports shared:false and names the reason when nothing is configured", async () => {
    const h = await limiterHealth(none);
    expect(h.shared).toBe(false);
    expect(h.store).toBe("memory");
    expect(h.reason).toBe("no-store-configured");
    expect(h.detail).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("reports shared:true and a probe time when the store answers", async () => {
    const store = workingStore();
    const h = await limiterHealth(() => store);
    expect(h.shared).toBe(true);
    expect(h.store).toBe("redis");
    expect(typeof h.probeMs).toBe("number");
  });

  it("PROBES rather than trusting the counter: a healthy instance still reports a broken store", async () => {
    // The whole point. fallbacksThisInstance is 0 here because this instance has
    // served no traffic, and a monitor reading only that number would conclude
    // the fleet was fine. `shared` is what tells the truth.
    const store = brokenStore("connection reset");
    const h = await limiterHealth(() => store);
    expect(h.fallbacksThisInstance).toBe(0);
    expect(h.shared).toBe(false);
    expect(h.reason).toBe("store-error");
    expect(h.detail).toContain("connection reset");
  });

  it("carries the per-instance forensics once traffic has degraded", async () => {
    await checkRateLimit("k", 1, 60_000, none);
    const h = await limiterHealth(none);
    expect(h.fallbacksThisInstance).toBe(1);
    expect(h.lastFallbackAt).toBeTypeOf("string");
    expect(h.instanceBootedAt).toBeTypeOf("string");
  });
});
