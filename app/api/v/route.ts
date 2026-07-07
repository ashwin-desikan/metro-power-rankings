import { NextResponse } from "next/server";

// Same-origin page-view beacon relay. The browser posts here (first-party, so
// content blockers don't treat it as a third-party tracker), and we forward
// server-side to the Supabase track_visit RPC. No PII: just the path.
//
// NOTE: NEXT_PUBLIC_* vars are inlined into the CLIENT bundle only; under
// Turbopack they are NOT reliably present in a route handler's runtime
// process.env, so reading them here yields undefined and the relay silently
// no-ops. These are the PUBLIC anon URL + key (already shipped in every
// browser via the client bundle), so embedding them as a fallback is safe.
// Prefer real env if a server-side var is ever set; if the anon key is
// rotated, update the fallback or set SUPABASE_URL / SUPABASE_ANON_KEY.
const SB_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://nmprqkmymrdknffwnuur.supabase.co";
const SB_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM";

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
