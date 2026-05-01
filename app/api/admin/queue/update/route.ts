import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateEntry, type QueueEntry, type QueueStatus } from "@/lib/missionControl";

export const runtime = "nodejs";

const VALID_STATUSES: QueueStatus[] = ["draft", "shipped", "skipped"];
const VALID_CHANNELS: QueueEntry["channel"][] = [
  "substack",
  "linkedin",
  "reddit",
  "notes",
  "other",
];

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = String(form.get("id") ?? "");
  if (!id) return new NextResponse("missing id", { status: 400 });

  const patch: Partial<
    Pick<QueueEntry, "status" | "channel" | "notes" | "statusReason">
  > = {};

  const rawStatus = form.get("status");
  if (typeof rawStatus === "string" && rawStatus) {
    if (!VALID_STATUSES.includes(rawStatus as QueueStatus)) {
      return new NextResponse("invalid status", { status: 400 });
    }
    patch.status = rawStatus as QueueStatus;
  }

  const rawChannel = form.get("channel");
  if (typeof rawChannel === "string" && rawChannel) {
    if (!VALID_CHANNELS.includes(rawChannel as QueueEntry["channel"])) {
      return new NextResponse("invalid channel", { status: 400 });
    }
    patch.channel = rawChannel as QueueEntry["channel"];
  }

  const rawNotes = form.get("notes");
  if (typeof rawNotes === "string") {
    patch.notes = rawNotes || undefined;
  }

  const rawReason = form.get("statusReason");
  if (typeof rawReason === "string") {
    patch.statusReason = rawReason || undefined;
  }

  // Skipped status requires a reason
  if (patch.status === "skipped" && !patch.statusReason) {
    return new NextResponse("skipped status requires statusReason", {
      status: 400,
    });
  }

  const updated = updateEntry(id, patch);
  if (!updated) return new NextResponse("not found", { status: 404 });

  const url = req.nextUrl.clone();
  url.pathname = "/admin";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
