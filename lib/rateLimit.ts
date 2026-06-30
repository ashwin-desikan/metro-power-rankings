// Best-effort in-memory rate limiter.
//
// Scope caveat: this map lives in a single server instance's memory. On
// Vercel's serverless/edge fleet, requests can land on different instances,
// so this is a speed bump that raises the cost of online guessing, not a
// hard guarantee. For real throttling, back this with Vercel KV / Upstash
// Redis using the same key and window.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
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
