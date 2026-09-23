import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteEntry } from "@/lib/missionControl";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Defence in depth: proxy.ts gates this path too, and this is the
  // second lock. See requireAdmin in lib/adminAuth.ts.
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const form = await req.formData();
  const id = String(form.get("id") ?? "");
  if (!id) return new NextResponse("missing id", { status: 400 });
  await deleteEntry(id);
  const url = req.nextUrl.clone();
  url.pathname = "/admin";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
