import { NextResponse } from "next/server";
import { confirmedHubs, buildCalendar } from "@/lib/electionIcs";

// The site-wide election calendar feed: one VEVENT per hub with an officially
// confirmed next-election date. Static: rebuilt on deploy, exactly like the
// calendar it subscribes readers to.
export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
  const body = buildCalendar(confirmedHubs(), "Elections: Citizen of Nowhere");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=\"elections.ics\"",
      "Cache-Control": "public, max-age=0, must-revalidate, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
