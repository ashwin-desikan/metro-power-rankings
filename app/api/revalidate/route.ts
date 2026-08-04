import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "crypto";
import { checkRateLimit } from "@/lib/rateLimit";

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

const ALLOWED_TAGS = new Set(["business-daily"]);

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
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
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
