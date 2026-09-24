import { getRedis } from "./kv";

// Rate limiter. In production it uses a fixed-window counter in Upstash Redis
// so the limit holds across the whole serverless fleet. With no Redis store
// configured (local dev) it falls back to a per-instance in-memory counter.
//
// 🔴 THE FALLBACK USED TO BE COMPLETELY SILENT, AND THAT WAS THE REAL BUG.
// Filed on the Silent failure register, 2026-09-24. Eight call sites across six
// routes share this function: banter per-caller and daily, feedback per-IP and
// per-user, /activity login, admin login, revalidate, and the public MCP
// endpoint. Two of those are a spend cap and a brute-force limit. When the
// shared store is missing or erroring, every one of them silently degrades to a
// per-instance speed bump, and nothing anywhere said so. Centralising the guard
// centralised its failure mode.
//
// The fallback BEHAVIOUR is deliberately unchanged: locking real users out
// because Redis blinked is worse than a looser limit for a few seconds. What is
// new is that the degraded state is now reportable. See limiterHealth() and
// app/api/health/limiter/route.ts.

export type RateResult = { ok: boolean; retryAfter: number };

// ---- In-memory fallback (per-instance; a speed bump, not a guarantee) ----
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}

function checkInMemory(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, retryAfter: 0 };
}

// ---- Degradation record ----------------------------------------------------
// 🔴 THIS COUNTER IS PER INSTANCE, WHICH IS THE SAME LIMITATION THE BUG WAS
// ABOUT, SO IT IS NOT THE LOAD-BEARING SIGNAL. An instance that never fell back
// reports zero however badly its neighbours are doing, so a monitor that only
// read this could see a healthy instance and conclude the fleet was fine. It is
// kept for forensics: once you know there IS a problem, a non-zero count with a
// timestamp tells you it is live traffic rather than a stale config.
//
// The load-bearing signal is limiterHealth(), which PROBES the store on the
// request rather than counting past failures. A probe answers the same way on
// every instance, so one call is enough to know.
export type FallbackReason = "no-store-configured" | "store-error";

let fallbacks = 0;
let lastFallbackAt: number | null = null;
let lastReason: FallbackReason | null = null;
const warned = new Set<FallbackReason>();
const bootedAt = Date.now();

function noteFallback(reason: FallbackReason, detail?: string): void {
  fallbacks += 1;
  lastFallbackAt = Date.now();
  lastReason = reason;
  // Once per reason per instance. A per-request log on a hot route is noise
  // nobody reads, which is how the original fault stayed invisible.
  if (!warned.has(reason)) {
    warned.add(reason);
    console.warn(
      `[rateLimit] DEGRADED to per-instance counters: ${reason}${detail ? ` (${detail})` : ""}. ` +
        `Limits no longer hold across the fleet. See /api/health/limiter.`,
    );
  }
}

/** The slice of the Redis client this module uses. Declared structurally so a
 *  test can pass a plain object, and so the no-store path is exercised by
 *  passing `() => null` rather than by mocking a module. Same shape of seam as
 *  `fetch=None` on the detectors in mac-mini-jobs/detect_issues.py. */
export type LimiterStore = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  ping(): Promise<unknown>;
};

export type LimiterHealth = {
  store: "redis" | "memory";
  shared: boolean;
  reason: FallbackReason | null;
  probeMs: number | null;
  detail: string | null;
  /** Per-instance, since this instance booted. Forensics only, see above. */
  fallbacksThisInstance: number;
  lastFallbackAt: string | null;
  instanceBootedAt: string;
};

/** Probe the shared store. `shared: false` is the condition worth alerting on:
 *  it means every limit above is a per-instance speed bump right now. */
export async function limiterHealth(
  getStore: () => LimiterStore | null = getRedis,
): Promise<LimiterHealth> {
  const base = {
    fallbacksThisInstance: fallbacks,
    lastFallbackAt: lastFallbackAt ? new Date(lastFallbackAt).toISOString() : null,
    instanceBootedAt: new Date(bootedAt).toISOString(),
  };
  const redis = getStore();
  if (!redis) {
    return {
      ...base, store: "memory", shared: false,
      reason: "no-store-configured", probeMs: null,
      detail: "neither UPSTASH_REDIS_REST_URL/TOKEN nor KV_REST_API_URL/TOKEN is set",
    };
  }
  const t0 = Date.now();
  try {
    await redis.ping();
    return {
      ...base, store: "redis", shared: true,
      reason: lastReason, probeMs: Date.now() - t0, detail: null,
    };
  } catch (ex) {
    return {
      ...base, store: "memory", shared: false,
      reason: "store-error", probeMs: Date.now() - t0,
      detail: ex instanceof Error ? ex.message.slice(0, 200) : "unknown error",
    };
  }
}

// ---- Distributed limiter: fixed window via INCR + EXPIRE ----
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  getStore: () => LimiterStore | null = getRedis,
): Promise<RateResult> {
  const redis = getStore();
  if (!redis) {
    noteFallback("no-store-configured");
    return checkInMemory(key, limit, windowMs);
  }

  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const rlKey = `ratelimit:${key}`;
  try {
    const count = await redis.incr(rlKey);
    // Set the TTL only on the first hit of a window.
    if (count === 1) {
      await redis.expire(rlKey, windowSec);
    }
    if (count > limit) {
      const ttl = await redis.ttl(rlKey);
      return { ok: false, retryAfter: ttl > 0 ? ttl : windowSec };
    }
    return { ok: true, retryAfter: 0 };
  } catch (ex) {
    // On a transient Redis error, fall back rather than lock out real users.
    // Unchanged behaviour, but no longer unrecorded.
    noteFallback("store-error", ex instanceof Error ? ex.message.slice(0, 120) : undefined);
    return checkInMemory(key, limit, windowMs);
  }
}

/** Exported for lib/rateLimit.test.ts only. */
export const __testing = {
  reset(): void {
    buckets.clear();
    fallbacks = 0;
    lastFallbackAt = null;
    lastReason = null;
    warned.clear();
  },
  get fallbacks(): number {
    return fallbacks;
  },
};
