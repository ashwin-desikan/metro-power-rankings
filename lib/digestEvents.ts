import { confirmedNextElections, nextKind } from "./electionHubsMeta";

// "What happens next" for the digest page, in three lenses: Politics and government,
// Sport, and AdTech and media. Ashwin, 2026-09-13, after looking at sportsindustryhub.com:
// "We could be doing something like this on that digest page as well ... We can replicate
// what he's done here across a few different ecosystems, like ad tech, sports, politics,
// and government."
//
// The reference site carries one next-event card and an Events page marked "Coming Soon".
// Two of these three lenses need no new data at all, because the site already computes
// them, which is the whole reason this is cheap to ship.

export type DigestLens = "politics" | "sport" | "adtech";

export type DigestEvent = {
  /** What it is. */
  label: string;
  /** Where or who, one short line. Null when the label says it all. */
  detail: string | null;
  /** ISO date for a fixed day, or a display string for a range. */
  when: string;
  /** Display form, already human-readable. Ranges live here, not in `when`. */
  whenLabel: string;
  href: string | null;
  /** flagcdn country code, for the elections list. Ashwin, 2026-09-13: "always show
   *  the flag when you're showing a country". */
  flag?: string;
  /** Days until it starts, for the nearest-first sort. Negative is past. */
  daysAway: number | null;
};

export type LensBlock = {
  lens: DigestLens;
  title: string;
  events: DigestEvent[];
  /** Shown under the block. Credit and onward link where the data is not ours. */
  credit: { text: string; href: string } | null;
  /** Set when the block is filled in the browser rather than on the server. */
  clientSource?: string;
};

function daysUntil(iso: string, today: Date): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000,
  );
}

const DISPLAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return DISPLAY.format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Politics and government: the elections atlas, confirmed dates only.
 *
 * `confirmedNextElections` already excludes anything expected, unscheduled, dissolved or
 * overdue, so every row here is a date an authority actually set. That distinction is the
 * atlas's own and it matters on a card: printing an expected date as a real one is the
 * failure the confidence field exists to prevent.
 */
// Ashwin, 2026-09-13: "politics and government, you can stick with elections, but I think
// we need a couple more than just four." The atlas carries 16 confirmed dates today, so
// eight fills the card without reaching past the next twelve months into filler.
export function politicsEvents(today: Date = new Date(), limit = 8): DigestEvent[] {
  return confirmedNextElections(today)
    .slice(0, limit)
    .map((e) => ({
      label: e.name,
      detail: nextKind(e.next) || null,
      when: e.date as string,
      whenLabel: formatDay(e.date as string),
      href: e.href,
      flag: e.flag,
      daysAway: e.daysAway,
    }));
}

/**
 * AdTech and media, from the 2026 industry calendar The Digital Voice maintains.
 *
 * 🔴 THIS LIST IS DELIBERATELY SHORT AND MUST STAY THAT WAY. Their sheet holds 428 events
 * across twelve months with region, country, format and vertical on every row. That is a
 * verified compilation representing real investment in assembling it, which is exactly
 * what UK database right protects — the facts are free, the collection is not. A handful
 * of names and dates is not a substantial part; importing the sheet would be.
 *
 * Ashwin's call, 2026-09-13: link to their sheet, copy nothing. So the card credits them,
 * links out for everything, and carries only the next few as a taster.
 *
 * The trade-off, stated rather than hidden: this is hand-maintained and will go stale.
 * That is the cost of not copying, and the onward link is what covers it. If The Digital
 * Voice ever gives permission, replace this array with their feed — do not quietly grow it.
 */
const ADTECH_SHORTLIST: DigestEvent[] = [
  { label: "IBC", detail: "Amsterdam", when: "2026-09-11", whenLabel: "11–14 Sep", href: null, daysAway: null },
  { label: "Digiday Publishing Summit", detail: "Miami", when: "2026-09-14", whenLabel: "14–16 Sep", href: null, daysAway: null },
  { label: "ATS London", detail: "London", when: "2026-09-15", whenLabel: "15 Sep", href: null, daysAway: null },
  { label: "DMEXCO", detail: "Cologne", when: "2026-09-23", whenLabel: "23–24 Sep", href: null, daysAway: null },
  { label: "Big Data London", detail: "London", when: "2026-09-23", whenLabel: "23–24 Sep", href: null, daysAway: null },
  { label: "Programmatic I/O", detail: "New York", when: "2026-09-28", whenLabel: "28–29 Sep", href: null, daysAway: null },
];

/**
 * Sport: the BUSINESS calendar, not fixtures.
 *
 * Ashwin, 2026-09-13, looking at the live page: "I don't really want to track games here.
 * This isn't sports games. It would be more like sports business events that I would want
 * here." The previous build filled this lens from /api/on-today, which is the fixture
 * ticker. That was the wrong reading: the standings page already does games, and a digest
 * about the business of sport wants the conference circuit instead.
 *
 * Source is Summitly, the sports industry's own conference calendar, which Ashwin has
 * used for a year and named on 2026-09-13 as the sport equivalent of The Digital Voice
 * sheet. It carries 450+ events across 60+ cities, so the SAME database-right reasoning
 * applies exactly as it does to the adtech list: a handful of names and dates is not a
 * substantial part, the whole calendar is. Credit and link out, never import.
 *
 * Dates checked 2026-09-13 against summitly.events; the Leaders entries also agree with
 * leadersinsport.com. Hand-maintained, so it will go stale, and the onward link is what
 * covers that. Kept deliberately spread across cities rather than London-only, because
 * the digest is not a London newsletter.
 */
const SPORT_SHORTLIST: DigestEvent[] = [
  { label: "World Football Summit", detail: "Madrid", when: "2026-09-15", whenLabel: "15–16 Sep", href: null, daysAway: null },
  { label: "SportsPro AI", detail: "London", when: "2026-09-29", whenLabel: "29–30 Sep", href: null, daysAway: null },
  { label: "SBC Summit", detail: "Lisbon", when: "2026-09-29", whenLabel: "29 Sep–1 Oct", href: null, daysAway: null },
  { label: "Leaders Sports Awards", detail: "London", when: "2026-10-06", whenLabel: "6 Oct", href: null, daysAway: null },
  { label: "Leaders Week", detail: "Stamford Bridge, London", when: "2026-10-07", whenLabel: "7–8 Oct", href: null, daysAway: null },
  { label: "Sportel", detail: "Monaco", when: "2026-10-19", whenLabel: "19–21 Oct", href: null, daysAway: null },
  { label: "ESSMA Summit", detail: "London", when: "2026-11-01", whenLabel: "1 Nov", href: null, daysAway: null },
  { label: "World Stadiums and Arena Development Summit", detail: "Riyadh", when: "2026-11-24", whenLabel: "24–25 Nov", href: null, daysAway: null },
  { label: "Host City", detail: "Glasgow", when: "2026-12-01", whenLabel: "1–2 Dec", href: null, daysAway: null },
  { label: "SportsPro Media Summit", detail: "Madrid", when: "2026-12-02", whenLabel: "2–3 Dec", href: null, daysAway: null },
];

/** Nearest first, keeping a multi-day event on the card while it is still running. */
function upcoming(list: DigestEvent[], today: Date, limit: number): DigestEvent[] {
  return list
    .map((e) => ({ ...e, daysAway: daysUntil(e.when, today) }))
    // A multi-day event is still on while it runs, so keep it until the day it starts
    // has passed by more than a few days rather than dropping it on the morning of day two.
    .filter((e) => (e.daysAway ?? 0) >= -4)
    .sort((a, b) => (a.daysAway ?? 0) - (b.daysAway ?? 0))
    .slice(0, limit);
}

export function adtechEvents(today: Date = new Date(), limit = 8): DigestEvent[] {
  return upcoming(ADTECH_SHORTLIST, today, limit);
}

export function sportEvents(today: Date = new Date(), limit = 8): DigestEvent[] {
  return upcoming(SPORT_SHORTLIST, today, limit);
}
