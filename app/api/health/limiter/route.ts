import { NextResponse } from "next/server";
import { limiterHealth } from "@/lib/rateLimit";
import { timingSafeEqual } from "@/lib/adminAuth";

// Is the rate limiter actually holding across the fleet, right now?
//
// WHY THIS EXISTS. lib/rateLimit.ts falls back to a per-instance in-memory
// counter when no shared store is configured or when Redis errors, and until
// 2026-09-24 it did so in total silence. Eight limits across six routes share
// that function, two of them a spend cap and a brute-force limit, so one
// missing environment variable quietly turns all eight into speed bumps. Filed
// on the Silent failure register. The register's own standing lesson is the
// reason for this route: "a guard that fails open must say so where someone
// looks", and the same-day build cap is the precedent for what happens when it
// only says so in a log line.
//
// 🔴 IT PROBES, IT DOES NOT COUNT. `shared` comes from pinging the store on
// this request, so every instance answers the same way and one call is enough.
// The fallback COUNTER in lib/rateLimit.ts is per instance, which is the very
// limitation the bug was about: an instance that never fell back reports zero
// however badly its neighbours are doing. The counter is forensics; the probe
// is the signal. A monitor must read `shared`.
//
// Secret-gated with REVALIDATE_SECRET rather than given its own credential,
// because the mini already holds that secret for revalidate_ping and a second
// secret is a second thing to rotate and forget. Infrastructure state is not
// public: an open endpoint would tell an attacker exactly when the login
// brute-force limit is not holding.
//
// The consumer is find_limiter_degraded() in mac-mini-jobs/detect_issues.py,
// which turns `shared: false` into a finding that reaches the daily ops sweep
// and ntfy.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    // Fail closed. Without the secret this cannot authenticate a caller, and
    // reporting infrastructure state to an unauthenticated one is worse than
    // reporting nothing.
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }
  const provided = req.headers.get("x-revalidate-secret") ?? "";
  if (!provided || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const health = await limiterHealth();
  return NextResponse.json(
    { ok: true, ...health },
    { headers: { "Cache-Control": "no-store" } },
  );
}
