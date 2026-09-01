import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SB_URL, STATUSES } from "@/lib/feedback";

// Status/note updates for a feedback row. Reachable only behind the /admin
// gate in proxy.ts (path prefix /api/admin), which returns a clean 401 for an
// unauthenticated call before this handler ever runs.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });

  let id = 0;
  let status = "";
  let note: string | null = null;
  try {
    const json = await req.json();
    id = Number(json?.id);
    if (typeof json?.status === "string") status = json.status;
    if (typeof json?.admin_note === "string") note = json.admin_note.slice(0, 2000);
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (status) {
    if (!STATUSES.includes(status as never)) {
      return NextResponse.json({ ok: false, error: "bad status" }, { status: 400 });
    }
    patch.status = status;
  }
  if (note !== null) patch.admin_note = note;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
  }

  try {
    const res = await fetch(`${SB_URL}/rest/v1/feedback?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
  } catch {
    return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
