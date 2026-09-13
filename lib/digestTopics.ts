// Four high-level topics for the digest, so the page can carry a filter rail like the
// one on sportsindustryhub.com.
//
// Ashwin, 2026-09-13: "I thought you were going to tag all of the different articles with
// these high-level topics ... You can do it at the source level. You don't have to go into
// the articles themselves." Plus, on the general-interest outlets, a fourth bucket:
// Business and tech.
//
// WHY THIS IS NOT A DATABASE COLUMN. Tagging by source needs no per-story data, so a map
// in the repo does the whole job: no migration, no backfill, and re-tagging a publication
// is a one-line edit that takes effect on the next build. If a story ever needs a topic
// its source cannot give it, that is the moment to add a column, and not before.

export type TopicKey = "politics" | "sport" | "adtech" | "business";

export const TOPIC_LABEL: Record<TopicKey, string> = {
  politics: "Politics and government",
  sport: "Sport",
  adtech: "AdTech and media",
  business: "Business and tech",
};

export const TOPIC_ORDER: TopicKey[] = ["politics", "sport", "adtech", "business"];

/** Lowercase, punctuation to spaces, space-padded, so needles can match on word edges. */
export function normSource(s: string): string {
  return ` ${(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------
//
// Keyed on a needle matched against the normalized source string, NOT on exact equality.
// Measured 2026-09-13: 247 distinct source strings cover about 120 real publications. The
// rest are editions and joint attributions the archive records verbatim, such as
// "WaPo 5-Minute Fix", "The Athletic FC", "Front Office Sports — Morning Edition",
// "Washington Post / Politico". Substring matching absorbs all of those for free; an
// exact-match table would need an entry for each and would rot on the next new edition.
//
// `specialist` means the publication only covers this topic, so the label is safe on any
// story it files. Everything else is `general`: the source supplies a default, and the
// story's own theme tags override it when they resolve. That split is the whole point.
// Tagging The Washington Post as politics and stopping there files its sports desk under
// politics; letting theme:college-sports win fixes exactly that case and nothing else.

type Pub = { needle: string; topic: TopicKey; specialist: boolean };

const P = (needle: string, topic: TopicKey): Pub => ({ needle, topic, specialist: true });
const G = (needle: string, topic: TopicKey): Pub => ({ needle, topic, specialist: false });

export const PUBLICATIONS: Pub[] = [
  // --- Sport ---------------------------------------------------------------
  P("the athletic", "sport"), P("front office sports", "sport"), P("fos", "sport"),
  P("sports business journal", "sport"), P("sbj", "sport"), P("sportbusiness", "sport"),
  P("men in blazers", "sport"), P("espn", "sport"), P("sportico", "sport"),
  P("vetted sports", "sport"), P("sport and story", "sport"), P("offball", "sport"),
  P("off the pitch", "sport"), P("the stadium business", "sport"),
  P("johnwallstreet", "sport"), P("the 4th quarter", "sport"),
  P("the fourth quarter", "sport"), P("awful announcing", "sport"),
  P("nfl com", "sport"), P("nbc sports", "sport"), P("sky sports", "sport"),
  P("yahoo sports", "sport"), P("fox sports", "sport"), P("mls", "sport"),
  P("liverpool fc", "sport"), P("global game hq", "sport"),
  P("sports marketing mavericks", "sport"), P("sbc americas", "sport"),
  P("pwhl", "sport"), P("soccer brew", "sport"), P("wunderfan", "sport"),
  // Ashwin identified these, 2026-09-13. They were the only source strings in the whole
  // archive the map could not place. "A guy with a scarf" is Carlo De Marchis.
  P("the lineup", "sport"), P("a guy with a scarf", "sport"),

  // --- AdTech and media ----------------------------------------------------
  P("digiday", "adtech"), P("adexchanger", "adtech"), P("marketecture", "adtech"),
  P("status", "adtech"), P("stratechery", "adtech"), P("platformer", "adtech"),
  P("marketing brew", "adtech"), P("the rebooting", "adtech"), P("adweek", "adtech"),
  P("marketing dive", "adtech"), P("nieman lab", "adtech"),
  P("search engine journal", "adtech"), P("chiefmartec", "adtech"),
  P("the current", "adtech"), P("fouanalytics", "adtech"),
  // Classified from its own stories, 2026-09-13: Nielsen, The Trade Desk, Spotify,
  // Netflix ad transparency, Comcast. Confirmed by Ashwin after the headlines
  // contradicted a first read of it as a sport title.
  P("the refresh", "adtech"),
  P("where s your ed at", "adtech"), P("ed zitron", "adtech"),
  P("the hollywood reporter", "adtech"), P("variety", "adtech"),
  P("deadline", "adtech"), P("the wrap", "adtech"),
  P("ai marketers", "adtech"), P("the ai commerce brief", "adtech"),

  // --- Politics and government ---------------------------------------------
  P("politico", "politics"), P("democracy docket", "politics"), P("notus", "politics"),
  P("the hill", "politics"), P("c span", "politics"), P("stateline", "politics"),
  P("gzero", "politics"), P("bellingcat", "politics"),
  P("pew research", "politics"), P("gallup", "politics"),
  P("senate disclosure", "politics"), P("alaska beacon", "politics"),
  P("north dakota monitor", "politics"), P("bloomberg law", "politics"),
  P("the intercept", "politics"), P("snopes", "politics"),
  P("florida politics", "politics"), P("on politics", "politics"),
  P("5 minute fix", "politics"), P("politics alert", "politics"),

  // --- Business and tech ---------------------------------------------------
  P("cnbc", "business"), P("techcrunch", "business"), P("wired", "business"),
  P("sifted", "business"), P("tech eu", "business"), P("built in", "business"),
  P("semianalysis", "business"), P("fast company", "business"),
  P("trends vc", "business"), P("robinhood snacks", "business"),
  P("sherwood", "business"), P("snacks", "business"),
  P("yahoo finance", "business"), P("wsj", "business"),
  P("financial times", "business"), P("financial review", "business"),
  P("njbiz", "business"), P("washington business journal", "business"),
  P("juggernaut capital", "business"), P("dwarkesh patel", "business"),
  P("benedict evans", "business"), P("benedict s newsletter", "business"),
  P("gatesnotes", "business"), P("openai", "business"), P("anthropic", "business"),
  P("ultrathink", "business"), P("refacto ai", "business"), P("ai secret", "business"),
  P("uktn", "business"), P("uk startup roundup", "business"),
  P("gary s guide", "business"), P("pathfounders", "business"),
  P("one percent improvements", "business"), P("alex and books", "business"),
  P("the pomp letter", "business"), P("comparitech", "business"),
  P("tnw", "business"), P("black hat", "business"), P("greg kahn", "business"),
  P("ajit jaokar", "business"), P("angie s gazette", "business"),
  P("dru s notes", "business"), P("techbible", "business"),
  P("apollo", "business"), P("the london scoop", "business"),

  // --- General interest: default topic, themes may override ----------------
  G("washington post", "politics"), G("wapo", "politics"),
  G("new york times", "politics"), G("nyt", "politics"),
  G("the guardian", "politics"), G("bbc", "politics"), G("cnn", "politics"),
  G("cbs news", "politics"), G("nbc news", "politics"), G("npr", "politics"),
  G("reuters", "politics"), G("ap", "politics"), G("axios", "politics"),
  G("euronews", "politics"), G("cbc", "politics"), G("the times", "politics"),
  G("new york post", "politics"), G("the globe and mail", "politics"),
  G("observer", "politics"), G("the seattle times", "politics"),
  G("philadelphia inquirer", "politics"), G("the kansas city star", "politics"),
  G("charlotte observer", "politics"), G("oregon live", "politics"),
  G("the baltimore banner", "politics"), G("ktla", "politics"),
  G("nbc chicago", "politics"), G("vox", "politics"),
  G("puck", "adtech"),
  G("semafor", "business"), G("business insider", "business"),
  G("morning brew", "business"), G("bloomberg", "business"),
  G("the economist", "business"), G("forbes", "business"),
  G("defector", "sport"),
  // Health and science titles that turn up occasionally; no topic of ours fits well,
  // so they lean on the story's themes and fall back to politics (policy coverage).
  G("medpage today", "politics"), G("bmj", "politics"),
  G("vanity fair", "adtech"), G("the juggernaut", "adtech"),
];

// ---------------------------------------------------------------------------
// Theme rollup
// ---------------------------------------------------------------------------
//
// scripts/digest/build_topics.py assigns 35 themes on keyword evidence. Most of them sit
// squarely inside one of the four topics, so they can decide the topic for a story whose
// source cannot.
//
// 🔴 DELIBERATELY INCOMPLETE. A theme that could belong to two topics is LEFT OUT rather
// than assigned, because an entry here OVERRIDES the source on general-interest outlets
// and a wrong one is worse than none. antitrust is the clearest case: a Google ad-exchange
// ruling is adtech, a grocery merger is business, a DOJ filing is politics. Same for
// streaming-rights (sport or media), labour, tariffs and art-market. Those stay with
// whatever their source says.
//
// energy joined that list on 2026-09-13, for the same reason and on a specific complaint.
// Ashwin: "you have Washington Post articles about Trump labeled 'business and tech' when
// those should be 'politics and government' ... they're about the ranchers or the $5,000
// dividend that he's talking about." Both stories carried theme:energy, caught on a
// section summary that mentioned rising oil prices, and energy pulled them into business.
// Energy splits policy from industry exactly like climate and housing do, and on a
// general-news desk it lands on the policy half nearly every time.
//
// climate, housing and public-health were mapped to politics on the first pass and taken
// back out after measuring, 2026-09-13. Each one splits policy from market or science,
// and the override fired on the wrong half: a Business Insider piece on cancer research
// filed under politics and government, a Sun Belt housing-market read did the same, and a
// Defector column on the Tour de France went to politics on theme:climate. A policy story
// from these sources already lands on politics through the source default, so the entries
// bought nothing and cost precision.
const THEME_TOPIC: Record<string, TopicKey> = {
  // Politics and government
  elections: "politics", immigration: "politics",
  transit: "politics", regulation: "politics",
  "press-freedom": "politics", surveillance: "politics",
  // Sport
  "stadium-financing": "sport", "sports-betting": "sport", "women-sports": "sport",
  "college-sports": "sport", "combat-sports": "sport",
  // AdTech and media
  advertising: "adtech", "retail-media": "adtech", "film-tv": "adtech",
  "music-industry": "adtech",
  // Business and tech
  ai: "business", "data-centres": "business", "private-equity": "business",
  "venture-capital": "business", crypto: "business", ipo: "business",
  "m-and-a": "business", robotics: "business", aviation: "business",
  space: "business", semiconductors: "business",
};

/** The publication whose name appears earliest in the source string, longest needle wins a tie. */
export function publicationFor(sourceName: string): Pub | null {
  const s = normSource(sourceName);
  let best: Pub | null = null;
  let bestAt = Infinity;
  for (const p of PUBLICATIONS) {
    const at = s.indexOf(` ${p.needle} `);
    if (at === -1) continue;
    // Leftmost wins: "Washington Post / Politico" is primarily a Washington Post story.
    if (at < bestAt || (at === bestAt && p.needle.length > (best?.needle.length ?? 0))) {
      best = p;
      bestAt = at;
    }
  }
  return best;
}

/** One tag as build_topics.py writes it: {id, type, label}. */
export type StoryTag = { id?: string; type?: string; label?: string };

/** Every topic this story's themes map to, in declared order. Usually none or one. */
export function themeTopics(topics: StoryTag[] | null | undefined): TopicKey[] {
  if (!Array.isArray(topics) || topics.length === 0) return [];
  const found = new Set<TopicKey>();
  for (const t of topics) {
    // Only type:"theme" counts. The same array carries company, person, club, league
    // and market tags, and those are a place taxonomy, not a subject one.
    if (!t || t.type !== "theme" || !t.id) continue;
    const mapped = THEME_TOPIC[t.id];
    if (mapped) found.add(mapped);
  }
  return TOPIC_ORDER.filter((t) => found.has(t));
}

/**
 * The single topic every mapped theme agrees on, or null if they disagree or none map.
 * Still the rule for choosing ONE label, which is what topicFor needs; the full set is
 * topicsFor's business.
 */
export function themeTopic(topics: StoryTag[] | null | undefined): TopicKey | null {
  const found = themeTopics(topics);
  // Two topics disagreeing is not evidence. Only an unambiguous read may override.
  return found.length === 1 ? found[0] : null;
}

// ---------------------------------------------------------------------------
// The business corroboration test
// ---------------------------------------------------------------------------
//
// Ashwin, 2026-09-13: "By default, things like Washington Post, New York Times, Guardian,
// and BBC News etc will be political and government unless you can find business and tech
// within the headline or within the story."
//
// theme:ai and theme:data-centres fire on any story that so much as mentions a model or a
// server farm, and a single mapped theme was enough to override a newspaper's politics
// default. Measured on the archive that day, 34 general-news stories were claimed this
// way, among them a Senate race decided by a faked audio clip, an ICE operation at
// airports, and a strike on an Iranian island. So the pull now has to be earned.

/** A company the tagger named: the strongest evidence a story is really about business. */
function namesCompany(topics?: StoryTag[] | null): boolean {
  return Array.isArray(topics) && topics.some((t) => t?.type === "company");
}

const BUSINESS_WORDS =
  /\b(earnings|revenue|profits?|ipo|mergers?|acquisitions?|acquires?|buyout|valuation|funding|investors?|shares?|stock|nasdaq|market cap|layoffs|start-?ups?|venture|chips?|semiconductors?|data cent(?:er|re)s?|cloud|software|chatbots?|crypto|bitcoin)\b/i;

/**
 * A headline that names who holds power is a politics headline, whatever else it mentions.
 * "Trump champions data centers as Republicans turn against them" is the case in point:
 * the tech word is real, and the story is still about the Republican party.
 *
 * 🔴 "ICE" is NOT in here despite being the clearest case in the archive. Case-insensitive
 * it also matches ice hockey and ice storms, and the one story it would have caught flips
 * to politics anyway for want of any business word at all.
 */
const POLITICAL_ACTOR =
  /\b(trump|biden|congress|senate|senators?|lawmakers?|republicans?|democrats?|white house|statehouses?|governors?|mayors?|president|parliament|ministers?|elections?|voters?|supreme court|regulators?)\b/i;

/** Has this story shown enough of itself to be pulled out of its newspaper's default? */
function businessEarned(topics?: StoryTag[] | null, headline?: string | null): boolean {
  const h = headline ?? "";
  if (POLITICAL_ACTOR.test(h)) return false;
  return namesCompany(topics) || BUSINESS_WORDS.test(h);
}

/**
 * The topic for one story.
 *
 * A specialist publication decides on its own: a Digiday story about AI is adtech, and
 * letting theme:ai pull it into business would be a regression, not a refinement. Only a
 * general-interest source defers to the themes, and only when they point one way.
 *
 * One exception, the corroboration test above: a source that defaults to POLITICS, which
 * is every newspaper and wire service in the table, only yields to a BUSINESS theme when
 * the story backs it up. Sport and adtech themes still override freely, because those
 * themes are narrow enough to be trusted on their own; it is the business ones that are
 * loose. Measured over the 34 contested stories: 13 stayed business (the resigning
 * Anthropic researcher, the OpenAI suit, the Paramount and Warner deal) and 21 went back
 * to politics.
 *
 * `headline` is optional so older callers keep working; without it the test falls back to
 * the company tag alone, which is the conservative half.
 */
export function topicFor(
  sourceName: string,
  storyTopics?: StoryTag[] | null,
  headline?: string | null,
): TopicKey | null {
  const pub = publicationFor(sourceName);
  if (pub?.specialist) return pub.topic;
  const theme = themeTopic(storyTopics);
  if (theme === "business" && pub?.topic === "politics" && !businessEarned(storyTopics, headline)) {
    return pub.topic;
  }
  return theme ?? pub?.topic ?? null;
}

/**
 * EVERY topic a story belongs to, which is usually one and sometimes two.
 *
 * Ashwin, 2026-09-13: "those four main topics are not exclusive. You can have two topics
 * on the same story." Until now the pipeline forced a single winner, so a Trump ally
 * buying influence in college football had to choose between Politics and Sport, and a
 * Puck piece on Google's AI position had to choose between AdTech and Business.
 *
 * The rule, measured across the 1,339-story window before it was chosen: the source's own
 * topic always counts, AND every mapped theme counts, specialist publications included.
 * 189 stories reach two topics and 10 reach three; the other 1,145 are unchanged.
 *
 * The one thing that does NOT stack is an unearned business label on a newspaper. The
 * corroboration test still applies here, or the 21 stories it just sent back to politics
 * would quietly return as Politics AND Business, which is the original complaint wearing
 * a second chip.
 *
 * Returned in TOPIC_ORDER, never in discovery order, so a story's chips do not reshuffle
 * between renders. topicFor stays the answer when only one label will fit.
 */
export function topicsFor(
  sourceName: string,
  storyTopics?: StoryTag[] | null,
  headline?: string | null,
): TopicKey[] {
  const pub = publicationFor(sourceName);
  const found = new Set<TopicKey>();

  const primary = topicFor(sourceName, storyTopics, headline);
  if (primary) found.add(primary);
  if (pub) found.add(pub.topic);
  for (const t of themeTopics(storyTopics)) {
    if (t === "business" && pub?.topic === "politics" && !businessEarned(storyTopics, headline)) continue;
    found.add(t);
  }
  return TOPIC_ORDER.filter((t) => found.has(t));
}
