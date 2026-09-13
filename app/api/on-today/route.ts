import { NextResponse } from "next/server";
import { loadLiveStandings } from "@/app/sports/standings/liveData";

// Today's scheduled fixtures, exactly as the "On today" strip on /sports/standings
// lists them (same loader, same window, same five-hour rule for unscored games), for
// the homepage ticker under the Live standings link (Ashwin, 2026-09-13).
//
// A separate cached route rather than a call from the homepage itself: building "On
// today" runs every league block on the standings page, and folding that into the
// homepage would pull the homepage's ISR window down to the shortest of those fetches
// and its function bundle up to the standings page's. The ticker fetches this after
// hydration instead, and the route regenerates at most every five minutes.
export const revalidate = 300;

export async function GET() {
  try {
    const { today } = await loadLiveStandings();
    const items = today.upcoming.map((e) => ({
      sport: e.sport,
      league: e.league,
      label: e.label,
      when: e.when,
      href: e.href,
    }));
    return NextResponse.json({ generated_at: new Date().toISOString(), items });
  } catch {
    return NextResponse.json({ generated_at: new Date().toISOString(), items: [] }, { status: 200 });
  }
}
