import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteEntry } from "@/lib/missionControl";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = String(form.get("id") ?? "");
  if (!id) return new NextResponse("missing id", { status: 400 });
  deleteEntry(id);
  const url = req.nextUrl.clone();
  url.pathname = "/admin";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
