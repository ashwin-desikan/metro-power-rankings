import { NextResponse } from "next/server";

// Same-origin page-view beacon relay. The browser posts here (first-party, so
// content blockers and privacy browsers don't treat it as a third-party
// tracker the way a direct *.supabase.co call gets dropped), and we forward
// server-side to the Supabase track_visit RPC. No PII: just the path.
// Always answers 204 so analytics can never surface an error to the page.
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
