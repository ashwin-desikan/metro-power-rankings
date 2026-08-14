import { NextResponse } from "next/server";
import { getCountryTimeline } from "@/lib/countryTimeMachine";

// Static JSON for the /countries Time Machine. Built once at build time and
// fetched lazily by the client, so the /countries payload is unchanged - the
// same pattern as /api/champions-timeline and /data/power-history.json.
export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
  // The CDN may hold this for a day, but the BROWSER must revalidate every
  // load. A long max-age here is a trap this repo has already paid for once:
  // when the payload shape changed on the champions timeline, returning
  // visitors replayed the old document from disk cache for the whole window
  // and the board silently rendered empty. Revalidation is a cheap 304.
  return NextResponse.json(getCountryTimeline(), {
    headers: {
      "Cache-Control":
        "public, max-age=0, must-revalidate, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
