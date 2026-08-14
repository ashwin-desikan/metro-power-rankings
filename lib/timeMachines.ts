// The Time Machine registry — the single declaration of every board on this
// site where the reader picks a moment and sees the world at it.
//
// WHY A REGISTRY AND NOT A HAND-WRITTEN PAGE. Six of these existed before the
// hub did, built one at a time over three months, and the only thing tying
// them together was that each had copied the previous one's year-input idiom.
// Nothing listed them, no nav entry anywhere contained the words "time
// machine", and two of them shipped deep links (`/countries?year=1985`,
// `/sports/champions?asof=1990-07`) that were parsed, written back to the URL,
// and linked from precisely nowhere. A reader could only find one by landing
// on its parent page and noticing a tab.
//
// So this file is the contract: a new time machine adds an entry here and
// appears on the hub, in the year-jump list and in the cross-section, without
// anyone editing a page. That is the whole point of building the hub rather
// than a list.
//
// 🔴 `deepLink` IS A PROMISE ABOUT ANOTHER PAGE. Only set it where the target
// genuinely reads a year off the URL, verified by reading that page's code. A
// deep link that silently drops its parameter is worse than no deep link: the
// reader asks for 1912, lands on a board showing 1985, and has no way to tell
// that the site ignored them. Everything else gets `deepLink: undefined` and
// the hub says "opens at its own default year" rather than pretending.

export type TimeMachineDomain = "The world" | "Sport" | "Culture" | "Money" | "Play";

/**
 * How fine a moment the board actually lets you pick.
 *
 * WHY THIS IS A FIELD AND NOT PARSED OUT OF `picks`. `picks` is prose written
 * for the reader ("a range, then any day on the chart") and it is going to
 * keep being edited for tone. Deriving the grain from it by string-matching
 * would mean a copy edit silently re-labels a board. So the grain is declared
 * once, next to the prose it summarises, and the two are allowed to disagree
 * in wording but not in meaning.
 *
 * The order below is finest-first, which is the order the legend renders in.
 * `edition` sits with `season` rather than with `year` on purpose: a Games or
 * a ceremony is a numbered event that happens to fall in a year, and calling
 * it "yearly" would imply you can ask for 1943 and get something back.
 */
export type TimeGrain = "day" | "month" | "season" | "edition" | "year";

export const GRAIN_ORDER: TimeGrain[] = ["day", "month", "season", "edition", "year"];

export const GRAIN_META: Record<TimeGrain, { label: string; glyph: string; note: string }> = {
  day: { label: "Any day", glyph: "📅", note: "An exact date." },
  month: { label: "Month", glyph: "🗓️", note: "A month within a year." },
  season: { label: "Season", glyph: "🔄", note: "A season, which may straddle two years." },
  edition: { label: "Edition", glyph: "🎟️", note: "A numbered event: a Games, a ceremony." },
  year: { label: "Year", glyph: "🕰️", note: "A single calendar year." },
};

export type TimeMachine = {
  key: string;
  /**
   * 🔴 NEVER A FLAG EMOJI. Windows ships no glyphs for regional-indicator
   * pairs, so 🇺🇸 renders as the letters "US" in a box and 🇬🇧 as "GB" — which
   * is exactly what shipped here and what Ashwin saw. It is a standing
   * site-wide rule and this file broke it on its first day. A country needs
   * `flag` below; `emoji` is for the pictographs, which render fine.
   */
  emoji: string;
  /** Country slug, rendered as a flagCdnUrl image in place of the emoji. */
  flag?: string;
  name: string;
  /** Where the reader lands. */
  href: string;
  domain: TimeMachineDomain;
  /** Named when the machine is a TAB or mode on a bigger page, not its own route. */
  tab?: string;
  /** What the reader actually picks: the granularity, in plain words. */
  picks: string;
  /** The same thing as a machine-readable grain. See TimeGrain above. */
  grain: TimeGrain;
  /** Earliest year the board covers. */
  from: number;
  /** Latest year, or null for "up to today". */
  to: number | null;
  blurb: string;
  /** Set ONLY where the target page reads the year from the URL. See above. */
  deepLink?: (year: number) => string;
};

const NOW = () => new Date().getUTCFullYear();

export const TIME_MACHINES: TimeMachine[] = [
  // --- The world ---------------------------------------------------------
  {
    key: "countries",
    emoji: "🌍",
    name: "Countries",
    href: "/countries",
    tab: "Time Machine",
    domain: "The world",
    picks: "a year",
    grain: "year",
    from: 1800,
    // `null`, not a literal, since the population loader's ceiling now tracks
    // the calendar (load_population_series TO_YEAR). A hardcoded 2025 here was
    // correct for about eight months and then quietly understated the board.
    to: null,
    blurb:
      "Who held every territory on earth, and how many people lived in it.",
    deepLink: (y) => `/countries?year=${y}`,
  },
  {
    key: "leaders",
    emoji: "👑",
    name: "World Leaders",
    href: "/leaders",
    tab: "Time machine",
    domain: "The world",
    picks: "a month and year, BC or AD",
    grain: "month",
    from: -9999,
    to: null,
    blurb:
      "Who ruled where, on any month in recorded history. The deepest board here by a distance.",
  },
  {
    key: "power-atlas",
    emoji: "⚖️",
    name: "The Power Atlas",
    href: "/power-atlas",
    domain: "The world",
    picks: "a year",
    grain: "year",
    from: 1500,
    to: 2026,
    blurb:
      "The balance of power across five centuries, ranked from superpower down.",
    deepLink: (y) => `/power-atlas?year=${y}`,
  },
  {
    key: "us-politics",
    emoji: "🏛️",
    flag: "united-states",
    name: "A Day in American History",
    href: "/us-political-leadership/time-machine",
    domain: "The world",
    picks: "an exact date",
    grain: "day",
    from: 1789,
    to: null,
    blurb:
      "Any day since Washington: the President, the Cabinet, the Court, both chambers, every governor.",
  },
  {
    key: "uk-politics",
    emoji: "🏛️",
    flag: "united-kingdom",
    name: "A Day in British Political History",
    href: "/uk-political-leadership/time-machine",
    domain: "The world",
    picks: "an exact date",
    grain: "day",
    from: 1707,
    to: null,
    blurb:
      "Any day since the Union: the Sovereign, the PM, the great offices, both Houses.",
  },

  // --- Sport -------------------------------------------------------------
  {
    key: "champions",
    emoji: "🏆",
    name: "Champions",
    href: "/sports/champions",
    tab: "Time Machine",
    domain: "Sport",
    picks: "a month and year",
    grain: "month",
    from: 1860,
    to: null,
    blurb:
      "Every reigning champion on earth in the same month, under the names they had then.",
    deepLink: (y) => `/sports/champions?asof=${y}-01`,
  },
  {
    key: "olympics",
    emoji: "🥇",
    name: "Olympic Games",
    href: "/teams/olympics",
    domain: "Sport",
    picks: "a Games edition",
    grain: "edition",
    from: 1896,
    to: 2026,
    blurb:
      "Every Games from Athens 1896 to Milano-Cortina 2026.",
  },
  {
    key: "football-map",
    emoji: "⚽",
    name: "The club football map, by season",
    href: "/teams/football",
    domain: "Sport",
    picks: "a season",
    grain: "season",
    from: 1870,
    to: null,
    blurb:
      "Slide through the seasons and watch the clubs appear, move and fold.",
  },

  // --- Culture -----------------------------------------------------------
  {
    key: "screen-years",
    emoji: "🎬",
    name: "Film, year by year",
    href: "/screen/years",
    domain: "Culture",
    picks: "a year",
    grain: "year",
    from: 1920,
    to: 2025,
    blurb:
      "What a year at the cinema looked like: the money, and the Academy.",
    deepLink: (y) => `/screen/years?year=${y}`,
  },
  {
    key: "screen-number-ones",
    emoji: "🍿",
    name: "US Number Ones",
    href: "/screen/number-ones",
    domain: "Culture",
    picks: "a year",
    grain: "year",
    from: 1946,
    to: 2026,
    blurb: "Week by week, the film on top of the American box office.",
  },
  {
    key: "screen-oscars",
    emoji: "🏅",
    name: "The Academy Awards",
    href: "/screen/oscars",
    domain: "Culture",
    picks: "a ceremony",
    grain: "edition",
    from: 1929,
    to: 2026,
    blurb: "All ninety-eight ceremonies, winners and the field they beat.",
  },
  {
    key: "screen-canon",
    emoji: "🎞️",
    name: "The 500 Greatest Films",
    href: "/screen/canon",
    domain: "Culture",
    picks: "a decade, then a year",
    grain: "year",
    from: 1888,
    to: 2022,
    blurb: "The canon laid out along the century that made it.",
  },
  {
    key: "sound-grammys",
    emoji: "🎵",
    name: "Awards History",
    href: "/sound/grammys",
    domain: "Culture",
    picks: "a ceremony year",
    grain: "edition",
    from: 1959,
    to: 2026,
    blurb: "Sixty-eight ceremonies deciding what the year sounded like.",
  },

  // --- Money -------------------------------------------------------------
  {
    key: "markets",
    emoji: "📈",
    name: "Markets, all the way back",
    href: "/business/markets",
    domain: "Money",
    picks: "a range, then any day on the chart",
    grain: "day",
    from: 1885,
    to: null,
    blurb:
      "Daily closes back to 1885. Real terms or nominal, any eight series on one axis.",
  },
  {
    key: "currencies",
    emoji: "💱",
    name: "Currencies",
    href: "/business/currencies",
    domain: "Money",
    picks: "a range, then any day on the chart",
    grain: "day",
    from: 1960,
    to: null,
    blurb: "What a currency was worth, day by day, against the dollar.",
  },

  // --- Play --------------------------------------------------------------
  {
    key: "leader-game",
    emoji: "🎲",
    name: "Leader Time Machine",
    href: "/play/games/leader-time-machine.html",
    domain: "Play",
    picks: "a year the game deals you",
    grain: "year",
    from: 1789,
    to: null,
    blurb:
      "It spins a year, you say who was in charge.",
  },
];

export const DOMAIN_ORDER: TimeMachineDomain[] = [
  "The world", "Sport", "Culture", "Money", "Play",
];

/** Human span, e.g. "1800-2025" or "1789 to today" or "9999 BC to today". */
export function spanLabel(m: TimeMachine): string {
  const from = m.from < 0 ? `${Math.abs(m.from)} BC` : String(m.from);
  return m.to === null ? `${from} to today` : `${from}–${m.to}`;
}

/** Does this machine's span contain the given year? */
export function covers(m: TimeMachine, year: number): boolean {
  return year >= m.from && year <= (m.to ?? NOW());
}

/** The earliest year any machine covers, ignoring the BC outlier. */
export const EARLIEST_AD = 1500;
