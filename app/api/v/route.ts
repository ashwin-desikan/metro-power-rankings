import { NextResponse } from "next/server";

// Same-origin page-view beacon relay. The browser posts here (first-party, so
// content blockers don't treat it as a third-party tracker), and we forward
// server-side to the Supabase track_visit RPC. No PII: just the path.
//
// track_visit is EXECUTE-restricted to service_role (see migration
// lock_down_track_visit_rpc): it used to be callable by the anon role,
// which meant anyone could call the RPC directly with the public anon key,
// bypassing this relay and its rate limiting entirely. SUPABASE_SERVICE_ROLE_KEY
// must be set server-side only (never NEXT_PUBLIC_*) in Vercel + local env;
// with no key configured this silently no-ops rather than erroring, same as
// before.
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
