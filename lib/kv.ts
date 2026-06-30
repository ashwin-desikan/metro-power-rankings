import "server-only";
import { Redis } from "@upstash/redis";

// Single source for the Upstash Redis connection used by server-side state
// (the mission-control queue and the login rate limiter). Returns null when
// no store is configured, so callers can fall back to a local strategy and
// local dev needs no external service. In production the Upstash integration
// (Vercel Marketplace) supplies the connection via env vars.
let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    cached = Redis.fromEnv();
  } else if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    cached = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  } else {
    cached = null;
  }
  return cached;
}
