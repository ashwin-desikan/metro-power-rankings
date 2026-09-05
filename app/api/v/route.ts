import { NextResponse } from "next/server";

// Same-origin page-view beacon relay. The browser posts here (first-party, so
// content blockers don't treat it as a third-party tracker), and we forward
// server-side to the Supabase track_visit RPC. No PII: just the path.
//
// 🔴 STALE COMMENT CORRECTED 2026-09-05. This route is NOT the live path and
// track_visit is NOT locked to service_role. Both halves of what stood here
// were wrong, and acting on them breaks the site's analytics:
//
//   - Nothing posts to /api/v. app/VisitBeacon.tsx, mounted in app/layout.tsx,
//     calls /rest/v1/rpc/track_visit BROWSER-DIRECT with the public anon key.
//     This relay is a spare that never got wired up.
//   - migration lock_down_track_visit_rpc (2026-08-02) did revoke anon EXECUTE,
//     which silently killed the beacon -- its .catch(){} swallowed every
//     rejection and page_visits recorded NOTHING for four days before anyone
//     noticed. restore_anon_execute_on_track_visit (2026-08-06) put the grant
//     back, deliberately, and it is still there.
//
// So the two `anon can execute a SECURITY DEFINER function` warnings in the
// Supabase security advisor are accepted, not outstanding. Do not "fix" them
// without first moving VisitBeacon onto this relay. The function is safe to
// expose: SECURITY DEFINER with search_path pinned, rejects null and >512-char
// input, and only increments a counter keyed on (path, day).
//
// If this relay is ever adopted, SUPABASE_SERVICE_ROLE_KEY must be set
// server-side only (never NEXT_PUBLIC_*) in Vercel + local env; with no key
// configured this silently no-ops rather than erroring.
const SB_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://nmprqkmymrdknffwnuur.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!SB_URL || !SB_KEY) return new NextResponse(null, { status: 204 });
  let path = "";
  try {
    const body = await req.json();
    if (body && typeof body.path === "string") path = body.path.slice(0, 512);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (!path) return new NextResponse(null, { status: 204 });
  try {
    await fetch(`${SB_URL}/rest/v1/rpc/track_visit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify({ p_path: path }),
    });
  } catch {
    /* ignore: never let analytics break */
  }
  return new NextResponse(null, { status: 204 });
}
