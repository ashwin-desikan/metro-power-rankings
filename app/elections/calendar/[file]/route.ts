import { NextResponse } from "next/server";
import { ELECTION_HUBS } from "@/lib/electionHubsMeta";
import { buildCalendar } from "@/lib/electionIcs";

// Per-hub election calendar feed. Static, one file per hub in ELECTION_HUBS.
//
// A hub with no confirmed date still returns a 200 with a valid, empty
// VCALENDAR rather than a 404: a subscription (webcal://…) is a standing
// promise, and a reader who subscribed to a hub before its date was set
// should not have their calendar app quietly break. When the hub later gets
// a confirmed date, the next scheduled deploy fills the event in.
export const dynamic = "force-static";
export const revalidate = false;

// The segment is `[file]`, not `[code].ics`: Next only treats a WHOLE
// segment as dynamic, so the param carries the extension and the static
// params are "uk.ics", "us.ics" and so on. That is what keeps the URL ending
// in .ics, which is what calendar apps key on.
export function generateStaticParams() {
  return Object.keys(ELECTION_HUBS).map((code) => ({ file: `${code}.ics` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const code = file.replace(/\.ics$/, "");
  const hub = ELECTION_HUBS[code];
  const hubs = hub && hub.nextConfidence === "confirmed" && hub.nextDate ? [hub] : [];
  const calName = hub ? `${hub.name} elections: Citizen of Nowhere` : "Elections: Citizen of Nowhere";
  const body = buildCalendar(hubs, calName);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${code}.ics"`,
      "Cache-Control": "public, max-age=0, must-revalidate, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
