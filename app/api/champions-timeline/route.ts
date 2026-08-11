import { NextResponse } from "next/server";
import { getChampionsTimeline } from "@/lib/championsTimeline";

// Static JSON for the /sports/champions Time Machine. Built once at build time
// and fetched lazily by the client, so the champions page's own payload is
// unchanged — same pattern as /data/power-history.json on /leaders.
export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
  // The CDN may hold this for a day, but the BROWSER must revalidate every load.
  // A long max-age here is a trap: when the payload shape changes, a returning
  // visitor keeps replaying the old document from disk cache for the whole
  // window and the board silently renders empty. Revalidation is a cheap 304.
  return NextResponse.json(getChampionsTimeline(), {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
