import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  addToQueue,
  type DigestFinding,
  type QueueEntry,
  isAlreadyQueued,
  findingId,
} from "@/lib/missionControl";

export const runtime = "nodejs";

function s(form: FormData, key: string): string {
  return String(form.get(key) ?? "");
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const digestDate = s(form, "digestDate");
  const category = s(form, "category") as DigestFinding["category"];
  const slug = s(form, "slug");
  const pairLabel = s(form, "pairLabel");
  const metroName = s(form, "metroName");
  const country = s(form, "country");
  const storyAngle = s(form, "storyAngle");
  const channel = (s(form, "channel") || "substack") as QueueEntry["channel"];
  const notes = s(form, "notes") || undefined;

  if (!digestDate || !category || !slug || !metroName) {
    return new NextResponse("missing required fields", { status: 400 });
  }

  const sourceId = `${digestDate}::${category}::${slug}::${pairLabel || "obscurity"}`;
  if (!isAlreadyQueued(sourceId)) {
    addToQueue({
      source: {
        digestDate,
        category,
        slug,
        pairLabel: pairLabel || undefined,
      },
      metroName,
      country,
      storyAngle,
      channel,
      notes,
    });
  }
  // Touch findingId to keep the import from being stripped if helpful in future
  void findingId;

  const url = req.nextUrl.clone();
  url.pathname = "/admin";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
