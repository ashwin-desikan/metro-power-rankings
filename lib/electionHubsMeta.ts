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
};

export const ELECTION_HUBS: Record<string, ElectionHubMeta> = {
  us: { code: "us", flag: "us", name: "United States", href: "/elections/us", last: "presidential, 5 November 2024", next: "2026 midterms, 3 November" },
  uk: { code: "uk", flag: "gb", name: "United Kingdom", href: "/elections/uk", last: "general election, 4 July 2024", next: "general election, expected 2029" },
  ca: { code: "ca", flag: "ca", name: "Canada", href: "/elections/ca", last: "federal election, 28 April 2025", next: "federal election, expected 2029" },
  eu: { code: "eu", flag: "eu", name: "European Union", href: "/elections/eu", last: "European Parliament, June 2024", next: "European Parliament, June 2029" },
  mx: { code: "mx", flag: "mx", name: "Mexico", href: "/elections/mx", last: "general election, 2 June 2024", next: "midterms, June 2027" },
  br: { code: "br", flag: "br", name: "Brazil", href: "/elections/br", last: "general election, October 2022", next: "general election, 4 October 2026" },
  ar: { code: "ar", flag: "ar", name: "Argentina", href: "/elections/ar", last: "general election, October–November 2023", next: "general election, October 2027" },
  de: { code: "de", flag: "de", name: "Germany", href: "/elections/de", last: "federal election, 23 February 2025", next: "federal election, expected 2029" },
  fr: { code: "fr", flag: "fr", name: "France", href: "/elections/fr", last: "legislative, June–July 2024", next: "presidential, April 2027" },
  it: { code: "it", flag: "it", name: "Italy", href: "/elections/it", last: "general election, 25 September 2022", next: "general election, expected 2027" },
  es: { code: "es", flag: "es", name: "Spain", href: "/elections/es", last: "general election, 23 July 2023", next: "general election, expected 2027" },
  pl: { code: "pl", flag: "pl", name: "Poland", href: "/elections/pl", last: "presidential runoff, 1 June 2025", next: "parliamentary, autumn 2027" },
  nl: { code: "nl", flag: "nl", name: "Netherlands", href: "/elections/nl", last: "general election, 29 October 2025", next: "general election, expected 2029" },
  ru: { code: "ru", flag: "ru", name: "Russia", href: "/elections/ru", last: "presidential, March 2024 (managed)", next: "Duma election, September 2026", note: "Managed elections" },
  il: { code: "il", flag: "il", name: "Israel", href: "/elections/il", last: "Knesset election, 1 November 2022", next: "Knesset election, due 2026" },
  za: { code: "za", flag: "za", name: "South Africa", href: "/elections/za", last: "general election, 29 May 2024", next: "general election, expected 2029" },
  ng: { code: "ng", flag: "ng", name: "Nigeria", href: "/elections/ng", last: "general election, 25 February 2023", next: "general election, February 2027" },
  tr: { code: "tr", flag: "tr", name: "Turkey", href: "/elections/tr", last: "presidential & parliamentary, May 2023", next: "presidential & parliamentary, expected 2028" },
  in: { code: "in", flag: "in", name: "India", href: "/elections/in", last: "general election, April–June 2024", next: "general election, expected 2029" },
  jp: { code: "jp", flag: "jp", name: "Japan", href: "/elections/jp", last: "general election, 8 February 2026", next: "general election, due by 2030" },
  au: { code: "au", flag: "au", name: "Australia", href: "/elections/au", last: "federal election, 3 May 2025", next: "federal election, expected 2028" },
  nz: { code: "nz", flag: "nz", name: "New Zealand", href: "/elections/nz", last: "general election, 14 October 2023", next: "general election, 7 November 2026" },
  kr: { code: "kr", flag: "kr", name: "South Korea", href: "/elections/kr", last: "presidential, 3 June 2025", next: "Assembly election, April 2028" },
  id: { code: "id", flag: "id", name: "Indonesia", href: "/elections/id", last: "general election, 14 February 2024", next: "general election, February 2029" },
  tw: { code: "tw", flag: "tw", name: "Taiwan", href: "/elections/tw", last: "presidential & legislative, 13 January 2024", next: "presidential & legislative, January 2028" },
  cn: { code: "cn", flag: "cn", name: "China", href: "/elections/cn", last: "14th NPC convened, March 2023", next: "15th NPC convenes, March 2028", note: "No competitive elections" },
  ua: { code: "ua", flag: "ua", name: "Ukraine", href: "/elections/ua", last: "presidential & Rada, spring–summer 2019", next: "suspended under martial law — after the war" },
  iq: { code: "iq", flag: "iq", name: "Iraq", href: "/elections/iq", last: "parliamentary, 11 November 2025", next: "parliamentary, expected 2029" },
  ps: { code: "ps", flag: "ps", name: "Palestine", href: "/elections/ps", last: "legislative, 25 January 2006", next: "PLC election, 28 November 2026" },
  va: { code: "va", flag: "va", name: "Vatican City", href: "/elections/va", last: "conclave, 7–8 May 2025 (Leo XIV)", next: "on the death or resignation of the pope", note: "Electoral monarchy", noteTone: "neutral" },
  sg: { code: "sg", flag: "sg", name: "Singapore", href: "/elections/sg", last: "general election, 3 May 2025", next: "general election, due by 2030", tier: "compact" },
  my: { code: "my", flag: "my", name: "Malaysia", href: "/elections/my", last: "general election, 19 November 2022", next: "general election, due by early 2028", tier: "compact" },
  ch: { code: "ch", flag: "ch", name: "Switzerland", href: "/elections/ch", last: "federal election, 22 October 2023", next: "federal election, October 2027", tier: "compact" },
  be: { code: "be", flag: "be", name: "Belgium", href: "/elections/be", last: "federal election, 9 June 2024", next: "federal election, expected 2029", tier: "compact" },
  dk: { code: "dk", flag: "dk", name: "Denmark", href: "/elections/dk", last: "general election, 24 March 2026", next: "general election, due by 2030", tier: "compact" },
};
