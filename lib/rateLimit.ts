import { getRedis } from "./kv";

// Rate limiter. In production it uses a fixed-window counter in Upstash Redis
// so the limit holds across the whole serverless fleet. With no Redis store
// configured (local dev) it falls back to a per-instance in-memory counter.

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

// ---- Distributed limiter: fixed window via INCR + EXPIRE ----
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> {
  const redis = getRedis();
  if (!redis) return checkInMemory(key, limit, windowMs);

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
  } catch {
    // On a transient Redis error, fall back rather than lock out real users.
    return checkInMemory(key, limit, windowMs);
  }
}
