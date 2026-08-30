// Central metadata for the election hubs: flag code, display name, route and
// the next major election (a known date where one is set, otherwise the most
// likely year given the term running). Used by the /elections landing page
// and by every hub header. Update `next` after each contest — one line here
// updates the landing card and the hub page together.
// `note` marks polities whose national votes are not free contests — the
// landing card and hub title carry it as a visible badge.

export type ElectionHubMeta = {
  code: string; // hub route segment
  flag: string; // flagcdn code
  name: string;
  href: string;
  last: string; // "presidential, 5 November 2024" — the last major election held
  next: string; // "2026 midterms, 3 November" | "general election, expected 2029"
  note?: string; // "Managed elections" — non-democratic systems
  noteTone?: "neutral"; // neutral badge for descriptive notes (e.g. the Vatican's
  // "Electoral monarchy") — amber remains the default and means "not free votes"
  // --- structured next-election date -------------------------------------
  // `next` above is the prose the cards show. These two fields are what code
  // sorts, counts down and audits on, so a date lives in exactly ONE place.
  //   confirmed  - officially set by the authority that sets it (decree,
  //                proclamation, statute-fixed day). Safe to print as a date.
  //   expected   - no date set. `nextDate` is then the LATEST PERMISSIBLE
  //                polling day under that polity's own rules, used purely as
  //                a sort key. Never print it as a date: print `next`.
  //   unscheduled- no date exists (Ukraine under martial law, a conclave).
  //                `nextDate` is absent and the hub sorts last.
  nextDate?: string;                                       // ISO yyyy-mm-dd
  nextConfidence?: "confirmed" | "expected" | "unscheduled";
  tier?: "compact"; // compact hubs appear on the landing page as name links only
  // and stay out of its map/timeline/charts; absence means a full featured card.
  // This is the scaling pattern: new hubs join as compact by default, and a hub
  // is promoted to featured by removing the flag (plus writing its card).
};

// Capital-metro links: joins each hub to the metro rankings. Slugs verified
// against public/data/metros.json.
export const HUB_CAPITALS: Record<string, { slug: string; name: string }> = {
  us: { slug: "washington-baltimore", name: "Washington" },
  uk: { slug: "london", name: "London" },
  ca: { slug: "ottawa", name: "Ottawa" },
  eu: { slug: "brussels", name: "Brussels" },
  mx: { slug: "mexico-city", name: "Mexico City" },
  br: { slug: "brasilia", name: "Brasília" },
  ar: { slug: "buenos-aires", name: "Buenos Aires" },
  de: { slug: "berlin", name: "Berlin" },
  fr: { slug: "paris", name: "Paris" },
  it: { slug: "rome", name: "Rome" },
  es: { slug: "madrid", name: "Madrid" },
  pl: { slug: "warsaw", name: "Warsaw" },
  nl: { slug: "rotterdam-the-hague", name: "The Hague" },
  ru: { slug: "moscow", name: "Moscow" },
  il: { slug: "jerusalem", name: "Jerusalem" },
  za: { slug: "johannesburg", name: "Johannesburg" },
  ng: { slug: "abuja", name: "Abuja" },
  tr: { slug: "ankara", name: "Ankara" },
  in: { slug: "delhi", name: "Delhi" },
  jp: { slug: "tokyo", name: "Tokyo" },
  au: { slug: "canberra", name: "Canberra" },
  nz: { slug: "wellington", name: "Wellington" },
  kr: { slug: "seoul", name: "Seoul" },
  id: { slug: "jakarta", name: "Jakarta" },
  tw: { slug: "taipei", name: "Taipei" },
  cn: { slug: "beijing", name: "Beijing" },
  ua: { slug: "kyiv", name: "Kyiv" },
  iq: { slug: "baghdad", name: "Baghdad" },
  ps: { slug: "ramallah", name: "Ramallah" },
  va: { slug: "rome", name: "Rome" }, // the Vatican sits inside Rome's metro
  sg: { slug: "singapore", name: "Singapore" },
  my: { slug: "kuala-lumpur", name: "Kuala Lumpur" },
  ch: { slug: "bern", name: "Bern" },
  be: { slug: "brussels", name: "Brussels" },
  dk: { slug: "copenhagen", name: "Copenhagen" },
  gr: { slug: "athens", name: "Athens" },
  at: { slug: "vienna", name: "Vienna" },
  pt: { slug: "lisbon", name: "Lisbon" },
  ie: { slug: "dublin", name: "Dublin" },
  ph: { slug: "manila", name: "Manila" },
  eg: { slug: "cairo", name: "Cairo" },
};


// Region per hub. The landing page groups its cards by hand into four columns;
// this is the same grouping as data, so the A-Z index and anything else that
// needs "where is this" does not have to re-derive it from the card arrays.
export const HUB_REGION: Record<string, string> = {
  uk: "Europe", eu: "Europe", de: "Europe", fr: "Europe", it: "Europe",
  es: "Europe", pl: "Europe", nl: "Europe", ru: "Europe", ua: "Europe",
  ch: "Europe", be: "Europe", dk: "Europe", va: "Europe",
  gr: "Europe", at: "Europe", pt: "Europe", ie: "Europe",
  in: "Asia & Oceania", jp: "Asia & Oceania", au: "Asia & Oceania",
  nz: "Asia & Oceania", kr: "Asia & Oceania", id: "Asia & Oceania",
  tw: "Asia & Oceania", cn: "Asia & Oceania", sg: "Asia & Oceania",
  my: "Asia & Oceania", ph: "Asia & Oceania",
  il: "Middle East & Africa", za: "Middle East & Africa",
  ng: "Middle East & Africa", tr: "Middle East & Africa",
  iq: "Middle East & Africa", ps: "Middle East & Africa",
  eg: "Middle East & Africa",
  us: "The Americas", ca: "The Americas", mx: "The Americas",
  br: "The Americas", ar: "The Americas",
};

export const ELECTION_HUBS: Record<string, ElectionHubMeta> = {
  us: { code: "us", flag: "us", name: "United States", href: "/elections/us", last: "presidential, 5 November 2024", next: "2026 midterms, 3 November", nextDate: "2026-11-03", nextConfidence: "confirmed" },
  uk: { code: "uk", flag: "gb", name: "United Kingdom", href: "/elections/uk", last: "general election, 4 July 2024", next: "general election, expected 2029", nextDate: "2029-08-15", nextConfidence: "expected" },
  ca: { code: "ca", flag: "ca", name: "Canada", href: "/elections/ca", last: "federal election, 28 April 2025", next: "federal election, expected 2029", nextDate: "2029-10-15", nextConfidence: "expected" },
  eu: { code: "eu", flag: "eu", name: "European Union", href: "/elections/eu", last: "European Parliament, June 2024", next: "European Parliament, June 2029", nextDate: "2029-06-07", nextConfidence: "expected" },
  mx: { code: "mx", flag: "mx", name: "Mexico", href: "/elections/mx", last: "general election, 2 June 2024", next: "midterms, June 2027", nextDate: "2027-06-06", nextConfidence: "confirmed" },
  br: { code: "br", flag: "br", name: "Brazil", href: "/elections/br", last: "general election, October 2022", next: "general election, 4 October 2026", nextDate: "2026-10-04", nextConfidence: "confirmed" },
  ar: { code: "ar", flag: "ar", name: "Argentina", href: "/elections/ar", last: "general election, October–November 2023", next: "general election, October 2027", nextDate: "2027-10-24", nextConfidence: "confirmed" },
  de: { code: "de", flag: "de", name: "Germany", href: "/elections/de", last: "federal election, 23 February 2025", next: "federal election, expected 2029", nextDate: "2029-03-25", nextConfidence: "expected" },
  fr: { code: "fr", flag: "fr", name: "France", href: "/elections/fr", last: "legislative, June–July 2024", next: "presidential, April 2027", nextDate: "2027-04-11", nextConfidence: "expected" },
  it: { code: "it", flag: "it", name: "Italy", href: "/elections/it", last: "general election, 25 September 2022", next: "general election, expected 2027", nextDate: "2027-12-22", nextConfidence: "expected" },
  es: { code: "es", flag: "es", name: "Spain", href: "/elections/es", last: "general election, 23 July 2023", next: "general election, expected 2027", nextDate: "2027-08-22", nextConfidence: "expected" },
  pl: { code: "pl", flag: "pl", name: "Poland", href: "/elections/pl", last: "presidential runoff, 1 June 2025", next: "parliamentary, autumn 2027", nextDate: "2027-11-07", nextConfidence: "expected" },
  nl: { code: "nl", flag: "nl", name: "Netherlands", href: "/elections/nl", last: "general election, 29 October 2025", next: "general election, expected 2029", nextDate: "2029-10-31", nextConfidence: "expected" },
  ru: { code: "ru", flag: "ru", name: "Russia", href: "/elections/ru", last: "presidential, March 2024 (managed)", next: "Duma election, 20 September 2026", nextDate: "2026-09-20", nextConfidence: "confirmed", note: "Managed elections" },
  il: { code: "il", flag: "il", name: "Israel", href: "/elections/il", last: "Knesset election, 1 November 2022", next: "Knesset election, 27 October 2026", nextDate: "2026-10-27", nextConfidence: "confirmed" },
  za: { code: "za", flag: "za", name: "South Africa", href: "/elections/za", last: "general election, 29 May 2024", next: "general election, expected 2029", nextDate: "2029-07-31", nextConfidence: "expected" },
  ng: { code: "ng", flag: "ng", name: "Nigeria", href: "/elections/ng", last: "general election, 25 February 2023", next: "presidential & National Assembly, 16 January 2027", nextDate: "2027-01-16", nextConfidence: "confirmed" },
  tr: { code: "tr", flag: "tr", name: "Turkey", href: "/elections/tr", last: "presidential & parliamentary, May 2023", next: "presidential & parliamentary, expected 2028", nextDate: "2028-05-14", nextConfidence: "expected" },
  in: { code: "in", flag: "in", name: "India", href: "/elections/in", last: "general election, April–June 2024", next: "general election, expected 2029", nextDate: "2029-06-16", nextConfidence: "expected" },
  jp: { code: "jp", flag: "jp", name: "Japan", href: "/elections/jp", last: "general election, 8 February 2026", next: "general election, due by 2030", nextDate: "2030-02-08", nextConfidence: "expected" },
  au: { code: "au", flag: "au", name: "Australia", href: "/elections/au", last: "federal election, 3 May 2025", next: "federal election, expected 2028", nextDate: "2028-09-30", nextConfidence: "expected" },
  nz: { code: "nz", flag: "nz", name: "New Zealand", href: "/elections/nz", last: "general election, 14 October 2023", next: "general election, 7 November 2026", nextDate: "2026-11-07", nextConfidence: "confirmed" },
  kr: { code: "kr", flag: "kr", name: "South Korea", href: "/elections/kr", last: "presidential, 3 June 2025", next: "Assembly election, April 2028", nextDate: "2028-04-12", nextConfidence: "confirmed" },
  id: { code: "id", flag: "id", name: "Indonesia", href: "/elections/id", last: "general election, 14 February 2024", next: "general election, February 2029", nextDate: "2029-02-14", nextConfidence: "expected" },
  tw: { code: "tw", flag: "tw", name: "Taiwan", href: "/elections/tw", last: "presidential & legislative, 13 January 2024", next: "presidential & legislative, January 2028", nextDate: "2028-01-08", nextConfidence: "expected" },
  cn: { code: "cn", flag: "cn", name: "China", href: "/elections/cn", last: "14th NPC convened, March 2023", next: "15th NPC convenes, March 2028", nextDate: "2028-03-05", nextConfidence: "expected", note: "No competitive elections" },
  ua: { code: "ua", flag: "ua", name: "Ukraine", href: "/elections/ua", last: "presidential & Rada, spring–summer 2019", next: "suspended under martial law — after the war", nextConfidence: "unscheduled" },
  iq: { code: "iq", flag: "iq", name: "Iraq", href: "/elections/iq", last: "parliamentary, 11 November 2025", next: "parliamentary, expected 2029", nextDate: "2029-11-11", nextConfidence: "expected" },
  ps: { code: "ps", flag: "ps", name: "Palestine", href: "/elections/ps", last: "legislative, 25 January 2006", next: "PLC election, 28 November 2026", nextDate: "2026-11-28", nextConfidence: "confirmed" },
  va: { code: "va", flag: "va", name: "Vatican City", href: "/elections/va", last: "conclave, 7–8 May 2025 (Leo XIV)", next: "on the death or resignation of the pope", nextConfidence: "unscheduled", note: "Electoral monarchy", noteTone: "neutral" },
  sg: { code: "sg", flag: "sg", name: "Singapore", href: "/elections/sg", last: "general election, 3 May 2025", next: "general election, due by 2030", nextDate: "2030-12-31", nextConfidence: "expected", tier: "compact" },
  my: { code: "my", flag: "my", name: "Malaysia", href: "/elections/my", last: "general election, 19 November 2022", next: "general election, due by early 2028", nextDate: "2028-02-29", nextConfidence: "expected", tier: "compact" },
  ch: { code: "ch", flag: "ch", name: "Switzerland", href: "/elections/ch", last: "federal election, 22 October 2023", next: "federal election, October 2027", nextDate: "2027-10-24", nextConfidence: "confirmed", tier: "compact" },
  be: { code: "be", flag: "be", name: "Belgium", href: "/elections/be", last: "federal election, 9 June 2024", next: "federal election, expected 2029", nextDate: "2029-06-10", nextConfidence: "expected", tier: "compact" },
  dk: { code: "dk", flag: "dk", name: "Denmark", href: "/elections/dk", last: "general election, 24 March 2026", next: "general election, due by 2030", nextDate: "2030-03-24", nextConfidence: "expected", tier: "compact" },
  gr: { code: "gr", flag: "gr", name: "Greece", href: "/elections/gr", last: "parliamentary, 25 June 2023", next: "parliamentary, expected 2027", nextDate: "2027-07-04", nextConfidence: "expected", tier: "compact" },
  at: { code: "at", flag: "at", name: "Austria", href: "/elections/at", last: "legislative, 29 September 2024", next: "legislative, expected 2029", nextDate: "2029-09-30", nextConfidence: "expected", tier: "compact" },
  pt: { code: "pt", flag: "pt", name: "Portugal", href: "/elections/pt", last: "legislative, 18 May 2025", next: "legislative, expected 2029", nextDate: "2029-05-31", nextConfidence: "expected", tier: "compact" },
  ie: { code: "ie", flag: "ie", name: "Ireland", href: "/elections/ie", last: "general election, 29 November 2024", next: "general election, due by 2030", nextDate: "2030-02-28", nextConfidence: "expected", tier: "compact" },
  ph: { code: "ph", flag: "ph", name: "Philippines", href: "/elections/ph", last: "presidential, 9 May 2022", next: "presidential, May 2028", nextDate: "2028-05-08", nextConfidence: "expected", tier: "compact" },
  eg: { code: "eg", flag: "eg", name: "Egypt", href: "/elections/eg", last: "presidential, 10-12 December 2023", next: "presidential, expected 2030", nextDate: "2030-12-31", nextConfidence: "expected", note: "Managed elections", tier: "compact" },
};

// ---------------------------------------------------------------------------
// Next-election board.
//
// One source of truth for "when does this polity vote next". The forecast
// pipeline reads the same table (scripts/forecast/hub_dates.py) instead of
// carrying its own hardcoded dates, which is how the New Zealand forecast came
// to model 17 October 2026 for months after the Prime Minister had announced
// 7 November. Two dates in one repo is one date too many.

export type NextElection = {
  code: string;
  name: string;
  flag: string;
  href: string;
  next: string;                 // the prose to display
  date: string | null;          // ISO, null when unscheduled
  confidence: "confirmed" | "expected" | "unscheduled";
  daysAway: number | null;      // negative once the date has passed
  overdue: boolean;             // a date that has passed with no result filed
  note?: string;
  noteTone?: "neutral";
  tier?: "compact";
};

// Day-resolution difference in UTC, so the board does not flicker by one day
// with the viewer's timezone.
function daysBetween(fromIso: string, to: Date): number {
  const [y, m, d] = fromIso.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((target - now) / 86400000);
}

/** Every hub as a next-election row, soonest first; unscheduled hubs last. */
export function nextElections(today: Date = new Date()): NextElection[] {
  const rows = Object.values(ELECTION_HUBS).map((h) => {
    const confidence = h.nextConfidence ?? "expected";
    const date = h.nextDate ?? null;
    const daysAway = date ? daysBetween(date, today) : null;
    return {
      code: h.code,
      name: h.name,
      flag: h.flag,
      href: h.href,
      next: h.next,
      date,
      confidence,
      daysAway,
      overdue: daysAway !== null && daysAway < 0,
      note: h.note,
      noteTone: h.noteTone,
      tier: h.tier,
    } as NextElection;
  });
  rows.sort((a, b) => {
    if (a.date === null && b.date === null) return a.name.localeCompare(b.name);
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1;
  });
  return rows;
}

/**
 * Hubs whose next date has passed. A non-empty result means somebody has to
 * file a result and roll the hub forward: the same staleness discipline the
 * champions ledger applies to next-title dates. Flag it, never auto-roll it.
 */
export function overdueElections(today: Date = new Date()): NextElection[] {
  return nextElections(today).filter((r) => r.overdue);
}

/** Confirmed dates only. What a countdown may safely print as a real date. */
export function confirmedNextElections(today: Date = new Date()): NextElection[] {
  return nextElections(today).filter((r) => r.confidence === "confirmed" && !r.overdue);
}
