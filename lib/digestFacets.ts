import type { DigestItem } from "./digestFeed";
import { clubNeedles } from "./digestClubs";
import { topicsFor, TOPIC_LABEL, TOPIC_ORDER, type TopicKey } from "./digestTopics";
import {
  competitionForTag, COMPETITIONS, DISPLAY_COMPETITIONS, GROUP_BY_SLUG, SPORT_GROUPS,
  UMBRELLAS, displayCompetition, displaySlug,
  type CompetitionSection,
} from "./sportHubs";

// Facets for the digest's filter rail, counted from the day's own stories.
//
// Ashwin, 2026-09-13, on sportsindustryhub.com: "I liked the topic and sport menu he had
// on the left-hand side ... the list of tags, which you're already putting together, can
// be a list of topics, and you can have a list of sports. These can be the filters that
// people can search on."
//
// Three rails, in the order a reader narrows: the four high-level topics, then the
// specific themes, then the sports. Counts come from the rendered set, never from a
// global total, so a filter never promises rows the page does not have.

export type FacetGroup = "topic" | "theme" | "sport" | "competition";

// Topics, then themes, then sports. Ashwin, 2026-09-13: "move the theme up so that it's
// above sport". Themes are the denser rail and the one that applies to every section of
// the feed; sports only reach the stories that name a competition.
export const FACET_GROUPS: FacetGroup[] = ["topic", "theme", "sport"];

export const GROUP_TITLE: Record<FacetGroup, string> = {
  topic: "Topics",
  sport: "Sports",
  theme: "Themes",
  competition: "Competitions",
};

export type Facet = {
  id: string;
  label: string;
  count: number;
  slug: string;
  /** The site hub this facet names, when one exists. Absent means render plain text. */
  hubHref?: string;
  /** Club football only: "continental" competitions are listed above "domestic" leagues. */
  section?: CompetitionSection;
  /** Competitions under a sport. Only the sports rail is two levels deep. */
  children?: Facet[];
};

/** URL-safe form of a facet id. Theme ids and topic keys already qualify; sports do not. */
export function facetSlug(id: string): string {
  return id
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function facetHref(group: FacetGroup, slug: string): string {
  return `/digest/filter/${group}/${slug}`;
}

export type DigestFacets = {
  topics: Facet[];
  themes: Facet[];
  sports: Facet[];
};

/** The filter values for one story. */
export type ItemFacets = {
  /**
   * Every topic the story belongs to, not one. Ashwin, 2026-09-13: "those four main
   * topics are not exclusive. You can have two topics on the same story." So the topic
   * counts in the rail add up to more than the day's story count, exactly as the theme
   * and sport counts already do.
   */
  topics: TopicKey[];
  themes: string[];
  /** Competition slugs from lib/sportHubs, e.g. "premier-league". */
  competitions: string[];
  /** The sport groups those competitions belong to, e.g. "club-football". */
  sports: string[];
};

/**
 * The competitions one story names, as slugs from lib/sportHubs.
 *
 * Two sources, because they can each carry what the other missed: `topics` holds league
 * tags the matcher found in the text, `entities` holds league tags the feed writer
 * verified against a real hub page. Measured 2026-09-13, entities carries none of these
 * at all and topics carries 113 across ten leagues, so the union costs nothing and the
 * day entities starts carrying them this already reads both.
 *
 * 🔴 CLUB TAGS ARE NOT USED, on purpose. Rolling a club up to its league looks like free
 * coverage and is not: measured on the same day, the 64 club tags in the archive are led
 * by "South Carolina" 11, "San Francisco" 6, "Southern" 3, "Athletics" 3 and
 * "George Washington" 1, which are places and people caught by the college vocabulary.
 * Using them would file state politics under College Football. Real coverage has to come
 * from a sport pass in build_topics.py, not from re-reading a tag that is already wrong.
 */
function competitionsFor(item: DigestItem): string[] {
  const out = new Set<string>();
  const add = (label?: string | null) => {
    if (!label) return;
    const c = competitionForTag(label);
    if (c) out.add(c.slug);
  };
  for (const t of item.topics ?? []) if (t.type === "league") add(t.label);
  for (const e of item.entities ?? []) if (e.type === "league") add(e.name);
  return [...out];
}

// ---------------------------------------------------------------------------
// The text pass
// ---------------------------------------------------------------------------
//
// Ashwin, 2026-09-13: "I thought when we were putting this together, there were plenty of
// World Cup stories from the last 60 days, but I don't see any tag about World Cup or
// international football. Did something happen to have them fall off?"
//
// They never landed. build_topics.py's league vocabulary holds eight names - NFL, MLB,
// NBA, Premier League, NHL, Bundesliga, Serie A, Ligue 1 - and nothing else, so the 30
// World Cup stories in that window (the FIFA stake sale, the Infantino resignation calls,
// the 64-team proposal, the final's 60M North American audience) carry no league tag at
// all. Measured the same day: tags alone reach 5.3% of stories, tags plus this pass 9.9%.
//
// This is the READ-SIDE half of the fix, shipped first because it needs no backfill and
// covers the whole archive the moment it deploys. The durable half, teaching
// scripts/digest/build_topics.py the same vocabulary so the tags are right at the source,
// is still to do; when it lands this becomes a safety net rather than the only net.

/**
 * Names that are fine as a tag label and unusable as a free-text needle. Measured against
 * the archive on 2026-09-13:
 *   CBA          collective bargaining agreement, constant in sports-business writing
 *   County       Orange County, county officials
 *   BL           two letters, matches nothing it should
 *   T20          good as a tag, but "T20 World Cup" would file cricket as football
 *   Euros        the currency
 *   Top 14       "the top 14 teams"
 *   Premiership  reachable as "Premiership Rugby" and "Scottish Premiership" instead
 *   Super League in this archive it means the football breakaway, not rugby league
 * "UCL" is not in the taxonomy at all, and must never be added: it fires on UCLA, twice in
 * the last ninety days.
 */
const TEXT_DENY = new Set(
  ["cba", "county", "bl", "t20", "euros", "top 14", "premiership", "super league"],
);

// The governing bodies used to be matched here as bare sport labels, which meant a FIFA
// story got "International Football" and no tag a reader could click. They are UMBRELLAS
// now (lib/sportHubs), so each one carries its own name, its members' names, and the sport
// group it belongs to. 🔴 "AFC" stays out of all of it: it is also the NFL's American
// Football Conference.

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type TextNeedle = { re: RegExp; competition: string; guard?: RegExp };

const TEXT_NEEDLES: TextNeedle[] = (() => {
  const out: TextNeedle[] = [];
  for (const c of COMPETITIONS) {
    for (const name of [c.label, ...(c.aliases ?? [])]) {
      if (TEXT_DENY.has(name.trim().toLowerCase())) continue;
      out.push({ re: new RegExp(`\\b${escapeRe(name)}\\b`, "i"), competition: c.slug });
    }
  }
  // The umbrella's own names: the governing body itself, and anything under the banner
  // with no competition entry of its own.
  for (const u of UMBRELLAS) {
    for (const n of u.needles ?? []) {
      if (TEXT_DENY.has(n.trim().toLowerCase())) continue;
      out.push({ re: new RegExp(`\\b${escapeRe(n)}\\b`, "i"), competition: u.slug });
    }
  }
  return out;
})();

/**
 * "World Cup" qualified by another sport is that sport's, not football's: the archive
 * carries an Esports World Cup story, and cricket, rugby and the age-group sides all use
 * the same two words.
 *
 * 🔴 "Club" is NOT in this list. Ashwin, 2026-09-13: "international football should
 * represent the FIFA World Cup and the club World Cup ... they should all be around the
 * same tag." The Club World Cup is FIFA's, so it belongs under the FIFA banner with the
 * rest. The Women's World Cup keeps its own competition, which matches first.
 */
const QUALIFIED_WORLD_CUP = /\b(esports?|rugby|cricket|women'?s|t20|u-?\d{2})\s+world cup\b/gi;

/** Built on first use, because it reads all-teams.json. See lib/digestClubs. */
let _clubNeedles: TextNeedle[] | null = null;
function clubTextNeedles(): TextNeedle[] {
  if (_clubNeedles) return _clubNeedles;
  _clubNeedles = clubNeedles().map((c) => ({
    re: new RegExp(`\\b${escapeRe(c.name)}\\b`, "i"),
    competition: c.competition,
    guard: c.guard,
  }));
  return _clubNeedles;
}

/** Competition slugs, pre-rollup, found in a story's own words. */
function textCompetitions(item: DigestItem): string[] {
  const raw = `${item.headline ?? ""} ${item.why ?? ""}`;
  const found = new Set<string>();
  for (const n of [...TEXT_NEEDLES, ...clubTextNeedles()]) {
    if (!n.re.test(raw)) continue;
    if (n.competition === "world-cup" && !n.re.test(raw.replace(QUALIFIED_WORLD_CUP, " "))) continue;
    // A club name with a second life ("college athletics") only counts outside it.
    if (n.guard && !n.re.test(raw.replace(n.guard, " "))) continue;
    found.add(n.competition);
  }
  return [...found];
}

function themesFor(item: DigestItem): string[] {
  return (item.topics ?? [])
    .filter((t) => t.type === "theme" && t.id)
    .map((t) => t.id);
}

// facetsFor maps every story and itemInFacet then asks again per story per filter page, so
// the same item is read several times in one render. The text pass is ~70 regexes, cheap
// once and wasteful sixty times; a WeakMap keyed on the item object costs nothing and dies
// with the request.
const FACET_CACHE = new WeakMap<DigestItem, ItemFacets>();

export function itemFacets(item: DigestItem): ItemFacets {
  const cached = FACET_CACHE.get(item);
  if (cached) return cached;

  // Rolled up through the umbrella, so the three UEFA cups arrive as one "uefa" value.
  // Ashwin, 2026-09-13: "It would just show UEFA as the tag itself, but underneath, you
  // would be looking for all of those other ones."
  const competitions = [...new Set(
    [...competitionsFor(item), ...textCompetitions(item)].map(displaySlug),
  )];
  const facets: ItemFacets = {
    // The headline is passed so a newspaper's politics default can survive a loose
    // business theme. See the corroboration test in lib/digestTopics.
    topics: topicsFor(item.sourceName, item.topics, item.headline),
    themes: themesFor(item),
    competitions,
    // Every sport reached through a competition or an umbrella. A governing body carries
    // its own sport now that it is an umbrella, so nothing arrives outside this.
    sports: [...new Set(
      competitions.map((s) => displayCompetition(s)?.group).filter((g): g is string => !!g),
    )],
  };
  FACET_CACHE.set(item, facets);
  return facets;
}

// Sentence case turns half the vocabulary into nonsense: "Ai", "Ipo", "M and a".
// These are the ids where the written form is not a capitalised word.
const THEME_LABEL: Record<string, string> = {
  ai: "AI",
  ipo: "IPO",
  "m-and-a": "M&A",
  "film-tv": "Film and TV",
  "data-centres": "Data centres",
  "press-freedom": "Press freedom",
  "public-health": "Public health",
  "women-sports": "Women's sport",
  "college-sports": "College sport",
  "combat-sports": "Combat sports",
  "sports-betting": "Sports betting",
  "stadium-financing": "Stadium financing",
  "streaming-rights": "Streaming rights",
  "private-equity": "Private equity",
  "venture-capital": "Venture capital",
  "art-market": "Art market",
};

/** "press-freedom" -> "Press freedom", with the acronyms above spelled properly. */
export function themeLabel(id: string): string {
  const known = THEME_LABEL[id];
  if (known) return known;
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function tally(rows: string[][]): Map<string, number> {
  const c = new Map<string, number>();
  for (const list of rows) for (const id of list) c.set(id, (c.get(id) ?? 0) + 1);
  return c;
}

const byCountThenName = (a: Facet, b: Facet) =>
  b.count - a.count || a.label.localeCompare(b.label);

export function facetsFor(items: DigestItem[]): DigestFacets {
  const all = items.map(itemFacets);

  const topicCounts = new Map<TopicKey, number>();
  for (const f of all) {
    for (const t of f.topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  // Topics keep their declared order rather than sorting by count, because four links
  // that reshuffle between days are harder to use than four that do not move.
  const topics: Facet[] = TOPIC_ORDER
    .map((id) => ({ id, label: TOPIC_LABEL[id], count: topicCounts.get(id) ?? 0, slug: id }))
    .filter((f) => f.count > 0);

  const themeMap = tally(all.map((f) => f.themes));
  const themes: Facet[] = [...themeMap]
    .map(([id, count]) => ({ id, label: themeLabel(id), count, slug: facetSlug(id) }))
    .sort(byCountThenName);

  // Sports are two levels: the hub group, with the competitions seen under it. Both
  // levels carry their hub href, which is the point of shaping it this way at all.
  const groupCounts = tally(all.map((f) => f.sports));
  const compCounts = tally(all.map((f) => f.competitions));
  const sports: Facet[] = SPORT_GROUPS
    .map((g): Facet => ({
      id: g.slug,
      label: g.label,
      slug: g.slug,
      count: groupCounts.get(g.slug) ?? 0,
      hubHref: g.href,
      // COMPETITIONS is already in prominence order, and club football keeps its
      // continental competitions above its domestic leagues, so the array order is the
      // display order. Sorting by count here would scatter that.
      children: DISPLAY_COMPETITIONS
        .filter((c) => c.group === g.slug && (compCounts.get(c.slug) ?? 0) > 0)
        .map((c): Facet => ({
          id: c.slug,
          label: c.label,
          slug: c.slug,
          count: compCounts.get(c.slug) ?? 0,
          hubHref: c.href,
          section: c.section,
        })),
    }))
    // A sport with nothing in the window is left out entirely. The taxonomy lists every
    // hub the site has; the rail only ever shows what the stories actually reached.
    .filter((f) => f.count > 0);

  return { topics, themes, sports };
}

/** One filter chip on a story row: what it says, where it goes, and how to style it. */
export type StoryChip = {
  key: string;
  label: string;
  href: string;
  kind: "topic" | "sport";
  /** Sport chips carry their group's emoji; topics have none. */
  icon?: string;
};

/**
 * The filter chips a single story shows on the digest page.
 *
 * Ashwin, 2026-09-13: "why do none of the stories on this page have any of the topic tags
 * on them? ... we want to have the topics, themes, and sports associated with them visible
 * so people can see them on that page itself." The rail could already count them and the
 * filter pages could already find them; the rows themselves said nothing.
 *
 * Topics first, then sport. Themes are rendered separately by the row, because they are a
 * long tail rather than a handful and keep their own quieter treatment.
 *
 * A COMPETITION beats its sport: a story that names the Premier League shows "Premier
 * League", not "Club Football" as well. Everything reaches a competition or an umbrella
 * now, so the sport never has to stand in for one.
 */
export function storyChips(item: DigestItem): StoryChip[] {
  const f = itemFacets(item);
  const out: StoryChip[] = [];
  for (const t of f.topics) {
    out.push({ key: `topic-${t}`, label: TOPIC_LABEL[t], href: facetHref("topic", t), kind: "topic" });
  }
  for (const slug of f.competitions) {
    const c = displayCompetition(slug);
    if (!c) continue;
    out.push({
      key: `competition-${slug}`,
      label: c.label,
      href: facetHref("competition", slug),
      kind: "sport",
      icon: GROUP_BY_SLUG.get(c.group)?.icon,
    });
  }
  return out;
}

/** A story's themes as filter links: the id, its written label, and where it points. */
export function storyThemes(item: DigestItem): { id: string; label: string; href: string }[] {
  const seen = new Set<string>();
  return itemFacets(item).themes
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((id) => ({ id, label: themeLabel(id), href: facetHref("theme", facetSlug(id)) }));
}

export function facetsByGroup(f: DigestFacets, group: FacetGroup): Facet[] {
  if (group === "topic") return f.topics;
  if (group === "theme") return f.themes;
  if (group === "sport") return f.sports;
  return f.sports.flatMap((s) => s.children ?? []);
}

/** Does this story belong under the named facet? The filter pages' only membership test. */
export function itemInFacet(item: DigestItem, group: FacetGroup, slug: string): boolean {
  const f = itemFacets(item);
  // Any of a story's topics matches, because a story can hold more than one.
  if (group === "topic") return f.topics.some((t) => t === slug);
  if (group === "sport") return f.sports.includes(slug);
  if (group === "competition") return f.competitions.includes(slug);
  return f.themes.some((id) => facetSlug(id) === slug);
}
