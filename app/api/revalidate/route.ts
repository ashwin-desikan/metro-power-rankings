import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "crypto";
import { checkRateLimit } from "@/lib/rateLimit";

import { clientIp } from "@/lib/clientIp";
// On-demand ISR revalidation, pinged by the data-refresh workflows right
// after they push a [vercel skip] data commit. lib/business.ts tags every
// GitHub-raw fetch with "business-daily", so one call here flushes the data
// cache AND the route cache of every page built from it (/business landing,
// Markets, Currencies, the 20 currency history pages) without spending a
// build. The 21600s time-based revalidate on those fetches stays as the
// backstop: if the secret is unset or the ping fails, pages still refresh
// within 6 hours, exactly as before this route existed.
//
// REVALIDATE_SECRET lives in TWO places: the Vercel project env (read here)
// and the GitHub repo's Actions secrets (sent by the workflow). With no
// secret configured this returns 503 and does nothing, the same
// degrade-silently posture as /api/v.

// One tag per data-refresh workflow. "predictions-daily" covers BOTH sim
// loaders (lib/plSim.ts, lib/nflSim.ts) because predictions-refresh.yml writes
// both models in one run, so a single flush is enough.
const ALLOWED_TAGS = new Set([
  "business-daily",     // business-daily-refresh.yml, 05:50 UTC daily
  "predictions-daily",  // predictions-refresh.yml, Tue 06:40 + Fri 11:40 UTC
  "forecast-weekly",    // forecast-weekly.yml, 06:10 UTC Mon/Wed/Fri
  "economy-rates",      // economy-rates.sh (mac-mini-jobs), Fridays 07:30 UTC
  "economy-housing",    // economy-housing.sh (mac-mini-jobs), Saturdays 07:30 UTC
  "economy-prices",     // economy-prices.sh (mac-mini-jobs), Sundays 07:30 UTC
  "nfl-elo",            // nfl-elo.sh (mac-mini-jobs), 08:00 UTC daily in season: lib/nflElo.ts
  // lib/nbaElo.ts tags every season shard "nba-elo" and is GitHub-raw-first on
  // a 24h ISR, but the tag was never listed here, so there was no way to flush
  // it and an NBA data correction waited out the full day. Found 2026-09-19
  // pushing the 2024 Mavericks/Clippers fix, when the flush returned "unknown
  // tag" while its NFL twin above worked.
  "nba-elo",            // NBA season shards rebuilt from the workbook: lib/nbaElo.ts
  "nfl-playoffs",       // nfl-elo.sh, January and February: lib/nflPlayoffs.ts
  "owners",             // run-owners-weekly.sh (mac-mini-jobs), Mondays 08:30 UTC: lib/teamOwners.ts
  "majors",             // majors-ingest.yml, 05:30 UTC daily: lib/majors.ts
  "champions",          // majors-ingest.yml and footy-refresh.yml: lib/championsCurrent.ts
  // The seven below were tagged in lib/ and never listed, the nba-elo fault
  // again: GitHub-raw reads on a 15 minute to 24h ISR that no flush could reach.
  // Found by scripts/check-cache-tags.mjs the day it was written (2026-09-19),
  // which now fails the build gate on the next one. Listing a tag only makes
  // it flushable; a job still has to ping it after its commit lands.
  "club-value",         // lib/clubValue.ts
  "club-money",         // lib/footballMoney.ts
  "expectation",        // lib/expectation.ts
  "nfl-expectation",    // lib/nflExpectation.ts
  "pl-expectation",     // lib/plExpectation.ts
  "intl-expectation",   // lib/intlExpectation.ts
  "footy-finals",       // lib/footyFinals.ts, 15 minute ISR during the AFL and NRL finals
  "playoff-series",     // lib/playoffSeries.ts, 15 minute ISR during the MLB and WNBA postseasons
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }

  // Secret-guarded, but still rate-limited (same lib as /api/mcp) so a
  // leaked URL can't hammer the cache or brute-force the header from one IP.
  // The trusted hop, not the first entry of a client-appendable header. See
  // lib/clientIp: taking [0] let a caller mint a fresh bucket per request.
  const ip = clientIp(req);
  const rate = await checkRateLimit(`revalidate:${ip}`, 10, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const provided = req.headers.get("x-revalidate-secret") ?? "";
  if (!provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tag = new URL(req.url).searchParams.get("tag") ?? "business-daily";
  if (!ALLOWED_TAGS.has(tag)) {
    return NextResponse.json({ ok: false, error: "unknown tag" }, { status: 400 });
  }

  // Next 16 signature: the profile argument is required; "max" hard-expires
  // the tag for all readers (the direct migration of the old 1-arg call).
  revalidateTag(tag, "max");
  return NextResponse.json({ ok: true, tag });
}
