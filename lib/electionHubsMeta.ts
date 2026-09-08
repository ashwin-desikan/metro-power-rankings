// Central metadata for the election hubs: flag code, display name, route and
// the next major election (a known date where one is set, otherwise the most
// likely year given the term running). Used by the /elections landing page
// and by every hub header. Update `next` after each contest — one line here
// updates the landing card and the hub page together.
// `note` marks polities whose national votes are not free contests — the
// landing card and hub title carry it as a visible badge.

export type GovernmentType = "parliamentary" | "presidential" | "semi-presidential" | "other";

export const GOVERNMENT_TYPE_LABELS: Record<GovernmentType, string> = {
  parliamentary: "Parliamentary",
  presidential: "Presidential",
  "semi-presidential": "Semi-presidential",
  other: "Other",
};

// The four states a hub's next election can be in. `dissolved` is the polity
// that no longer exists (East Germany, South Vietnam): it keeps every contest
// it ever held and every page, and drops out of the map, the countdown and
// the calendar feeds, because nothing is coming.
export type NextConfidence = "confirmed" | "expected" | "unscheduled" | "dissolved";

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
  //   dissolved  - the polity no longer exists. `nextDate` is absent, `next`
  //                says when it ended, and `dissolved` carries the date.
  nextDate?: string;                                       // ISO yyyy-mm-dd
  nextConfidence?: NextConfidence;
  // --- defunct polities ---------------------------------------------------
  // A hub for a state that has ceased to exist. The directory, the census,
  // the timeline, the systems table and the CSV keep it in full; the map,
  // the countdown, "next to vote" and the calendar feeds leave it out. The
  // landing card and the hub title carry "Dissolved <year>" as a neutral
  // badge. Add more with the same three fields; nothing else needs to know.
  status?: "defunct";
  dissolved?: string; // "3 October 1990"
  tier?: "compact"; // compact hubs appear on the landing page as name links only,
  // with no featured card; their ballots still count on the map, the timeline
  // and the freedom charts (since 2026-09-07). Absence means a featured card.
  // This is the scaling pattern: new hubs join as compact by default, and a hub
  // is promoted to featured by removing the flag (plus writing its card).
  // --- system of government --------------------------------------------------
  // Who makes the government: a legislature (parliamentary), a directly elected
  // executive (presidential), or both with real powers (semi-presidential).
  // `other` covers the cases a three-way split misdescribes, and then
  // `governmentLabel` says what it is instead. Classification is by how the
  // head of government is actually chosen, not by the constitution's own name
  // for itself: Austria has a directly elected president and is filed as
  // parliamentary; Turkey has been presidential since the 2018 switch.
  governmentType: GovernmentType;
  governmentLabel?: string;
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
  hu: { slug: "budapest", name: "Budapest" },
  no: { slug: "oslo", name: "Oslo" },
  se: { slug: "stockholm", name: "Stockholm" },
  co: { slug: "bogota", name: "Bogota" },
  cd: { slug: "kinshasa", name: "Kinshasa" },
  cl: { slug: "santiago", name: "Santiago" },
  ir: { slug: "tehran", name: "Tehran" },
  pk: { slug: "islamabad", name: "Islamabad" },
  // Wave 5 (2026-09-08).
  pe: { slug: "lima", name: "Lima" },
  ke: { slug: "nairobi", name: "Nairobi" },
  bd: { slug: "dhaka", name: "Dhaka" },
  et: { slug: "addis-ababa", name: "Addis Ababa" },
  vn: { slug: "hanoi", name: "Hanoi" },
  ae: { slug: "abu-dhabi", name: "Abu Dhabi" },
  dd: { slug: "berlin", name: "East Berlin" },
  vd: { slug: "ho-chi-minh-city", name: "Saigon" },
  cz: { slug: "prague", name: "Prague" },
  sk: { slug: "bratislava", name: "Bratislava" },
  ro: { slug: "bucharest", name: "Bucharest" },
  fi: { slug: "helsinki", name: "Helsinki" },
  th: { slug: "bangkok", name: "Bangkok" },
  ve: { slug: "caracas", name: "Caracas" },
};


// Region per hub. The landing page groups its cards by hand into four columns;
// this is the same grouping as data, so the A-Z index and anything else that
// needs "where is this" does not have to re-derive it from the card arrays.
export const HUB_REGION: Record<string, string> = {
  uk: "Europe", eu: "Europe", de: "Europe", fr: "Europe", it: "Europe",
  es: "Europe", pl: "Europe", nl: "Europe", ru: "Europe", ua: "Europe",
  ch: "Europe", be: "Europe", dk: "Europe", va: "Europe",
  gr: "Europe", at: "Europe", pt: "Europe", ie: "Europe",
  hu: "Europe", no: "Europe", se: "Europe",
  in: "Asia & Oceania", jp: "Asia & Oceania", au: "Asia & Oceania",
  nz: "Asia & Oceania", kr: "Asia & Oceania", id: "Asia & Oceania",
  tw: "Asia & Oceania", cn: "Asia & Oceania", sg: "Asia & Oceania",
  my: "Asia & Oceania", ph: "Asia & Oceania", pk: "Asia & Oceania",
  bd: "Asia & Oceania", vn: "Asia & Oceania", vd: "Asia & Oceania",
  dd: "Europe", cz: "Europe", sk: "Europe", ro: "Europe", fi: "Europe",
  th: "Asia & Oceania", ve: "The Americas",
  il: "Middle East & Africa", za: "Middle East & Africa",
  ng: "Middle East & Africa", tr: "Middle East & Africa",
  iq: "Middle East & Africa", ps: "Middle East & Africa",
  eg: "Middle East & Africa", cd: "Middle East & Africa",
  ir: "Middle East & Africa", ke: "Middle East & Africa",
  et: "Middle East & Africa", ae: "Middle East & Africa",
  us: "The Americas", pe: "The Americas", ca: "The Americas", mx: "The Americas",
  br: "The Americas", ar: "The Americas", co: "The Americas",
  cl: "The Americas",
};

export const ELECTION_HUBS: Record<string, ElectionHubMeta> = {
  us: { code: "us", flag: "us", name: "United States", href: "/elections/us", last: "presidential, 5 November 2024", next: "midterm elections, 3 November 2026", nextDate: "2026-11-03", nextConfidence: "confirmed", governmentType: "presidential" },
  uk: { code: "uk", flag: "gb", name: "United Kingdom", href: "/elections/uk", last: "general election, 4 July 2024", next: "general election, expected 2029", nextDate: "2029-08-15", nextConfidence: "expected", governmentType: "parliamentary" },
  ca: { code: "ca", flag: "ca", name: "Canada", href: "/elections/ca", last: "federal election, 28 April 2025", next: "federal election, expected 2029", nextDate: "2029-10-15", nextConfidence: "expected", governmentType: "parliamentary" },
  eu: { code: "eu", flag: "eu", name: "European Union", href: "/elections/eu", last: "European Parliament, June 2024", next: "European Parliament, June 2029", nextDate: "2029-06-07", nextConfidence: "expected", governmentType: "other", governmentLabel: "Supranational parliament" },
  mx: { code: "mx", flag: "mx", name: "Mexico", href: "/elections/mx", last: "general election, 2 June 2024", next: "midterm elections, June 2027", nextDate: "2027-06-06", nextConfidence: "confirmed", governmentType: "presidential" },
  br: { code: "br", flag: "br", name: "Brazil", href: "/elections/br", last: "general election, October 2022", next: "general election, 4 October 2026", nextDate: "2026-10-04", nextConfidence: "confirmed", governmentType: "presidential" },
  ar: { code: "ar", flag: "ar", name: "Argentina", href: "/elections/ar", last: "general election, October–November 2023", next: "general election, October 2027", nextDate: "2027-10-24", nextConfidence: "confirmed", governmentType: "presidential" },
  de: { code: "de", flag: "de", name: "Germany", href: "/elections/de", last: "federal election, 23 February 2025", next: "presidential election by the Federal Convention, 30 January 2027; federal election expected 2029", nextDate: "2027-01-30", nextConfidence: "confirmed", governmentType: "parliamentary" },
  fr: { code: "fr", flag: "fr", name: "France", href: "/elections/fr", last: "legislative, June–July 2024", next: "presidential, April 2027", nextDate: "2027-04-11", nextConfidence: "expected", governmentType: "semi-presidential" },
  it: { code: "it", flag: "it", name: "Italy", href: "/elections/it", last: "general election, 25 September 2022", next: "general election, expected 2027", nextDate: "2027-12-22", nextConfidence: "expected", governmentType: "parliamentary" },
  es: { code: "es", flag: "es", name: "Spain", href: "/elections/es", last: "general election, 23 July 2023", next: "general election, expected 2027", nextDate: "2027-08-22", nextConfidence: "expected", governmentType: "parliamentary" },
  pl: { code: "pl", flag: "pl", name: "Poland", href: "/elections/pl", last: "presidential runoff, 1 June 2025", next: "parliamentary, autumn 2027", nextDate: "2027-11-07", nextConfidence: "expected", governmentType: "semi-presidential" },
  nl: { code: "nl", flag: "nl", name: "Netherlands", href: "/elections/nl", last: "general election, 29 October 2025", next: "general election, expected 2029", nextDate: "2029-10-31", nextConfidence: "expected", governmentType: "parliamentary" },
  ru: { code: "ru", flag: "ru", name: "Russia", href: "/elections/ru", last: "presidential, March 2024 (managed)", next: "Duma election, 20 September 2026", nextDate: "2026-09-20", nextConfidence: "confirmed", note: "Managed elections", governmentType: "semi-presidential" },
  il: { code: "il", flag: "il", name: "Israel", href: "/elections/il", last: "Knesset election, 1 November 2022", next: "Knesset election, 27 October 2026", nextDate: "2026-10-27", nextConfidence: "confirmed", governmentType: "parliamentary" },
  za: { code: "za", flag: "za", name: "South Africa", href: "/elections/za", last: "general election, 29 May 2024", next: "general election, expected 2029", nextDate: "2029-07-31", nextConfidence: "expected", governmentType: "parliamentary" },
  ng: { code: "ng", flag: "ng", name: "Nigeria", href: "/elections/ng", last: "general election, 25 February 2023", next: "presidential & National Assembly, 16 January 2027", nextDate: "2027-01-16", nextConfidence: "confirmed", governmentType: "presidential" },
  tr: { code: "tr", flag: "tr", name: "Turkey", href: "/elections/tr", last: "presidential & parliamentary, May 2023", next: "presidential & parliamentary, expected 2028", nextDate: "2028-05-14", nextConfidence: "expected", governmentType: "presidential" },
  in: { code: "in", flag: "in", name: "India", href: "/elections/in", last: "general election, April–June 2024", next: "general election, expected 2029", nextDate: "2029-06-16", nextConfidence: "expected", governmentType: "parliamentary" },
  jp: { code: "jp", flag: "jp", name: "Japan", href: "/elections/jp", last: "general election, 8 February 2026", next: "general election, due by 2030", nextDate: "2030-02-08", nextConfidence: "expected", governmentType: "parliamentary" },
  au: { code: "au", flag: "au", name: "Australia", href: "/elections/au", last: "federal election, 3 May 2025", next: "federal election, expected 2028", nextDate: "2028-09-30", nextConfidence: "expected", governmentType: "parliamentary" },
  nz: { code: "nz", flag: "nz", name: "New Zealand", href: "/elections/nz", last: "general election, 14 October 2023", next: "general election, 7 November 2026", nextDate: "2026-11-07", nextConfidence: "confirmed", governmentType: "parliamentary" },
  kr: { code: "kr", flag: "kr", name: "South Korea", href: "/elections/kr", last: "presidential, 3 June 2025", next: "Assembly election, April 2028", nextDate: "2028-04-12", nextConfidence: "confirmed", governmentType: "presidential" },
  id: { code: "id", flag: "id", name: "Indonesia", href: "/elections/id", last: "general election, 14 February 2024", next: "general election, February 2029", nextDate: "2029-02-14", nextConfidence: "expected", governmentType: "presidential" },
  tw: { code: "tw", flag: "tw", name: "Taiwan", href: "/elections/tw", last: "presidential & legislative, 13 January 2024", next: "presidential & legislative, January 2028", nextDate: "2028-01-08", nextConfidence: "expected", governmentType: "semi-presidential" },
  cn: { code: "cn", flag: "cn", name: "China", href: "/elections/cn", last: "14th NPC convened, March 2023", next: "15th NPC convenes, March 2028", nextDate: "2028-03-05", nextConfidence: "expected", note: "No competitive elections", governmentType: "other", governmentLabel: "One-party state" },
  ua: { code: "ua", flag: "ua", name: "Ukraine", href: "/elections/ua", last: "presidential & Rada, spring–summer 2019", next: "suspended under martial law, after the war", nextConfidence: "unscheduled", governmentType: "semi-presidential" },
  iq: { code: "iq", flag: "iq", name: "Iraq", href: "/elections/iq", last: "parliamentary, 11 November 2025", next: "parliamentary, expected 2029", nextDate: "2029-11-11", nextConfidence: "expected", governmentType: "parliamentary" },
  ps: { code: "ps", flag: "ps", name: "Palestine", href: "/elections/ps", last: "legislative, 25 January 2006", next: "PLC election, 28 November 2026", nextDate: "2026-11-28", nextConfidence: "confirmed", governmentType: "semi-presidential" },
  va: { code: "va", flag: "va", name: "Vatican City", href: "/elections/va", last: "conclave, 7–8 May 2025 (Leo XIV)", next: "on the death or resignation of the pope", nextConfidence: "unscheduled", note: "Electoral monarchy", noteTone: "neutral", governmentType: "other", governmentLabel: "Electoral monarchy" },
  sg: { code: "sg", flag: "sg", name: "Singapore", href: "/elections/sg", last: "general election, 3 May 2025", next: "general election, due by 2030", nextDate: "2030-12-31", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  my: { code: "my", flag: "my", name: "Malaysia", href: "/elections/my", last: "general election, 19 November 2022", next: "general election, due by early 2028", nextDate: "2028-02-29", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  ch: { code: "ch", flag: "ch", name: "Switzerland", href: "/elections/ch", last: "federal election, 22 October 2023", next: "federal election, October 2027", nextDate: "2027-10-24", nextConfidence: "confirmed", tier: "compact", governmentType: "other", governmentLabel: "Collegial executive" },
  be: { code: "be", flag: "be", name: "Belgium", href: "/elections/be", last: "federal election, 9 June 2024", next: "federal election, expected 2029", nextDate: "2029-06-10", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  dk: { code: "dk", flag: "dk", name: "Denmark", href: "/elections/dk", last: "general election, 24 March 2026", next: "general election, due by 2030", nextDate: "2030-03-24", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  gr: { code: "gr", flag: "gr", name: "Greece", href: "/elections/gr", last: "parliamentary, 25 June 2023", next: "parliamentary, expected 2027", nextDate: "2027-07-04", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  at: { code: "at", flag: "at", name: "Austria", href: "/elections/at", last: "legislative, 29 September 2024", next: "legislative, expected 2029", nextDate: "2029-09-30", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  pt: { code: "pt", flag: "pt", name: "Portugal", href: "/elections/pt", last: "legislative, 18 May 2025", next: "legislative, expected 2029", nextDate: "2029-05-31", nextConfidence: "expected", tier: "compact", governmentType: "semi-presidential" },
  ie: { code: "ie", flag: "ie", name: "Ireland", href: "/elections/ie", last: "general election, 29 November 2024", next: "general election, due by 2030", nextDate: "2030-02-28", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  ph: { code: "ph", flag: "ph", name: "Philippines", href: "/elections/ph", last: "presidential, 9 May 2022", next: "presidential, May 2028", nextDate: "2028-05-08", nextConfidence: "expected", tier: "compact", governmentType: "presidential" },
  eg: { code: "eg", flag: "eg", name: "Egypt", href: "/elections/eg", last: "presidential, 10-12 December 2023", next: "presidential, expected 2030", nextDate: "2030-12-31", nextConfidence: "expected", note: "Managed elections", tier: "compact", governmentType: "presidential" },
  hu: { code: "hu", flag: "hu", name: "Hungary", href: "/elections/hu", last: "parliamentary, 12 April 2026", next: "parliamentary, expected 2030", nextDate: "2030-04-30", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  // Norway's polling day is fixed by statute to a Monday in September; the 2029
  // day itself is not named in the source, so it sorts as expected.
  no: { code: "no", flag: "no", name: "Norway", href: "/elections/no", last: "parliamentary, 8 September 2025", next: "parliamentary, September 2029", nextDate: "2029-09-10", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  // Sweden votes on the second Sunday of September every fourth year, which the
  // 2022 article states outright. For 2026 that is 13 September.
  se: { code: "se", flag: "se", name: "Sweden", href: "/elections/se", last: "general election, 11 September 2022", next: "general election, 13 September 2026", nextDate: "2026-09-13", nextConfidence: "confirmed", tier: "compact", governmentType: "parliamentary" },
  co: { code: "co", flag: "co", name: "Colombia", href: "/elections/co", last: "presidential runoff, 21 June 2026", next: "congressional and presidential, expected 2030", nextDate: "2030-03-10", nextConfidence: "expected", tier: "compact", governmentType: "presidential" },
  cd: { code: "cd", flag: "cd", name: "DR Congo", href: "/elections/cd", last: "general election, 20 December 2023", next: "general election, expected December 2028", nextDate: "2028-12-20", nextConfidence: "expected", tier: "compact", governmentType: "semi-presidential" },
  cl: { code: "cl", flag: "cl", name: "Chile", href: "/elections/cl", last: "presidential runoff, 14 December 2025", next: "general election, expected 2029", nextDate: "2029-11-18", nextConfidence: "expected", tier: "compact", governmentType: "presidential" },
  // Iran is filed as `other` rather than presidential. The president is
  // directly elected and there is no prime minister, which looks presidential,
  // but the executive answers to an unelected Supreme Leader who commands the
  // armed forces and appoints half the council that vets every candidate.
  // Calling it presidential would name who runs the ministries, not who governs.
  ir: { code: "ir", flag: "ir", name: "Iran", href: "/elections/ir", last: "presidential snap election, 5 July 2024", next: "Majlis election, expected 2028", nextDate: "2028-03-01", nextConfidence: "expected", note: "Vetted candidates", tier: "compact", governmentType: "other", governmentLabel: "Islamic republic, vetted candidates" },
  // Five years from the Assembly's first sitting (29 February 2024), so the
  // latest permissible polling day is early 2029; no date is set.
  pk: { code: "pk", flag: "pk", name: "Pakistan", href: "/elections/pk", last: "general election, 8 February 2024", next: "general election, expected 2029", nextDate: "2029-04-30", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  // Wave 5 (2026-09-08): eight hubs, two of them for states that no longer exist.
  pe: { code: "pe", flag: "pe", name: "Peru", href: "/elections/pe", last: "general election, 12 April and 7 June 2026", next: "general election, expected April 2031", nextDate: "2031-04-13", nextConfidence: "expected", tier: "compact", governmentType: "presidential" },
  ke: { code: "ke", flag: "ke", name: "Kenya", href: "/elections/ke", last: "general election, 9 August 2022", next: "general election, 10 August 2027", nextDate: "2027-08-10", nextConfidence: "confirmed", tier: "compact", governmentType: "presidential" },
  bd: { code: "bd", flag: "bd", name: "Bangladesh", href: "/elections/bd", last: "general election, 12 February 2026", next: "general election, expected 2031", nextDate: "2031-02-28", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  et: { code: "et", flag: "et", name: "Ethiopia", href: "/elections/et", last: "general election, 1 June 2026", next: "general election, expected 2031", nextDate: "2031-06-30", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  vn: { code: "vn", flag: "vn", name: "Vietnam", href: "/elections/vn", last: "National Assembly, 15 March 2026", next: "National Assembly, expected 2031", nextDate: "2031-05-31", nextConfidence: "expected", note: "One-party elections", tier: "compact", governmentType: "other", governmentLabel: "One-party state" },
  ae: { code: "ae", flag: "ae", name: "United Arab Emirates", href: "/elections/ae", last: "Federal National Council, 7 October 2023", next: "Federal National Council, expected 2027", nextDate: "2027-12-31", nextConfidence: "expected", note: "Appointed electorate", tier: "compact", governmentType: "other", governmentLabel: "Federal monarchy" },
  dd: { code: "dd", flag: "dd", name: "East Germany", href: "/elections/dd", last: "Volkskammer, 18 March 1990", next: "none: dissolved 3 October 1990", nextConfidence: "dissolved", status: "defunct", dissolved: "3 October 1990", note: "Dissolved 1990", noteTone: "neutral", tier: "compact", governmentType: "other", governmentLabel: "One-party state to 1990" },
  vd: { code: "vd", flag: "vd", name: "South Vietnam", href: "/elections/vd", last: "presidential, 2 October 1971", next: "none: dissolved 30 April 1975", nextConfidence: "dissolved", status: "defunct", dissolved: "30 April 1975", note: "Dissolved 1975", noteTone: "neutral", tier: "compact", governmentType: "presidential" },
  // Czechoslovakia's federal record (1918-1992) is carried on the Czech hub as
  // its predecessor (Ashwin, 2026-09-08); Slovakia's own assemblies from 1928
  // are on the Slovak hub. Neither is a defunct hub.
  cz: { code: "cz", flag: "cz", name: "Czech Republic", href: "/elections/cz", last: "parliamentary, 3 and 4 October 2025", next: "presidential, expected January 2028", nextDate: "2028-01-31", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  sk: { code: "sk", flag: "sk", name: "Slovakia", href: "/elections/sk", last: "presidential, 23 March and 6 April 2024", next: "parliamentary, expected by September 2027", nextDate: "2027-09-30", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  ro: { code: "ro", flag: "ro", name: "Romania", href: "/elections/ro", last: "presidential, 4 and 18 May 2025", next: "parliamentary, expected December 2028", nextDate: "2028-12-31", nextConfidence: "expected", tier: "compact", governmentType: "semi-presidential" },
  // Finland's Election Act fixes the parliamentary poll on the third Sunday of April every fourth year, so the day is set by statute.
  fi: { code: "fi", flag: "fi", name: "Finland", href: "/elections/fi", last: "presidential, 28 January and 11 February 2024", next: "parliamentary election, 18 April 2027", nextDate: "2027-04-18", nextConfidence: "confirmed", tier: "compact", governmentType: "parliamentary" },
  th: { code: "th", flag: "th", name: "Thailand", href: "/elections/th", last: "general election, 8 February 2026", next: "general election, expected 2030", nextDate: "2030-03-31", nextConfidence: "expected", tier: "compact", governmentType: "parliamentary" },
  ve: { code: "ve", flag: "ve", name: "Venezuela", href: "/elections/ve", last: "parliamentary, 25 May 2025", next: "presidential, expected 2030", nextDate: "2030-12-31", nextConfidence: "expected", tier: "compact", governmentType: "presidential" },
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
  confidence: NextConfidence;
  daysAway: number | null;      // negative once the date has passed
  overdue: boolean;             // a date that has passed with no result filed
  note?: string;
  noteTone?: "neutral";
  tier?: "compact";
};

/** The kind of contest a hub votes in next, read off the `next` prose: the
 *  clause before the first comma ("midterm elections", "Duma election",
 *  "presidential election by the Federal Convention"), capitalised. The
 *  countdown prints it beside a Set date so a reader does not have to know
 *  that the United States in 2026 means the midterms (Ashwin, 2026-09-08). */
export function nextKind(next: string): string {
  const head = next.split(/[,;]/)[0].trim();
  return head ? head.charAt(0).toUpperCase() + head.slice(1) : "";
}

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
  // A dissolved polity comes back with confidence "dissolved" and no date,
  // sorted last, so the directory still lists it; the countdown on the
  // landing page drops it, because nothing is coming.
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
