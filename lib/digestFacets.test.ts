import { describe, it, expect } from "vitest";
import { itemFacets, facetsFor, itemInFacet, storyChips } from "./digestFacets";
import type { DigestItem } from "./digestFeed";

// The sports rail reached 5.3% of the archive because the story tagger's league vocabulary
// holds eight names and nothing else. Ashwin, 2026-09-13: "there were plenty of World Cup
// stories from the last 60 days, but I don't see any tag about World Cup or international
// football. Did something happen to have them fall off?" They never landed. These lock in
// the read-side text pass that finds them.

let n = 0;
const story = (p: Partial<DigestItem>): DigestItem => ({
  digestDate: "2026-09-13",
  position: ++n,
  headline: "",
  sourceName: "The Athletic",
  url: `https://example.com/${n}`,
  why: "",
  entities: [],
  topics: [],
  ...p,
});

describe("the sport text pass", () => {
  it("finds the World Cup stories the tagger missed", () => {
    const f = itemFacets(story({
      headline: "FIFA's $4.2bn World Cup stake sale: Who will invest? Who could stop this?",
    }));
    // Filed under the FIFA banner, which is where the World Cup lives now.
    expect(f.competitions).toContain("fifa");
    expect(f.sports).toContain("international-football");
  });

  // Ashwin, 2026-09-13: "There were plenty of stories about UEFA and FIFA. You can include
  // all of those." A governance story names no tournament and still earns every banner it
  // mentions.
  it("tags a governance story with each body it names", () => {
    const f = itemFacets(story({ headline: "UEFA, Concacaf and AFC hold firm on Infantino resignation calls" }));
    expect(f.competitions).toContain("uefa");
    expect(f.competitions).toContain("concacaf");
    expect(f.competitions).toContain("fifa");
    expect(f.sports).toContain("international-football");
  });

  it("reads the summary as well as the headline", () => {
    const f = itemFacets(story({
      headline: "Sunday briefing",
      why: "Further reading on the Premier League's new broadcast cycle.",
    }));
    expect(f.competitions).toContain("premier-league");
  });

  // The qualified forms belong to other sports and would otherwise file cricket, rugby and
  // esports as international football.
  it("does not claim somebody else's World Cup", () => {
    for (const headline of ["Does the Esports World Cup make money?",
                            "Inside the Club World Cup's broadcast deal",
                            "The T20 World Cup schedule lands"]) {
      expect(itemFacets(story({ headline })).competitions, headline).not.toContain("world-cup");
    }
  });

  it("still resolves the Women's World Cup as its own competition", () => {
    const f = itemFacets(story({ headline: "Ticket sales open for the Women's World Cup" }));
    expect(f.competitions).toContain("womens-world-cup");
    expect(f.sports).toContain("womens-football");
  });

  // Every one of these was measured firing on the wrong thing in the archive. They are
  // fine as tag labels and must never become free-text needles.
  it("refuses the ambiguous names", () => {
    const cases: [string, string][] = [
      ["The NBA and the players' union reopened the CBA", "cba"],
      ["Orange County officials approved the plan", "county-championship"],
      ["UCLA parts with AD Martin Jarmond", "uefa"],
      ["Ranked: the top 14 college towns", "top-14"],
      ["The euros kept falling against the dollar", "euros"],
      ["A European Super League redux, again", "super-league"],
    ];
    for (const [headline, slug] of cases) {
      expect(itemFacets(story({ headline })).competitions, headline).not.toContain(slug);
    }
  });

  it("keeps reading the stored league tags, so the text pass only ever adds", () => {
    const f = itemFacets(story({
      headline: "A quiet Sunday",
      topics: [{ id: "nfl", type: "league", label: "NFL" }],
    }));
    expect(f.competitions).toContain("nfl");
    expect(f.sports).toContain("american-football");
  });
});

// Ashwin, 2026-09-13: "those four main topics are not exclusive. You can have two topics
// on the same story."
describe("a story can hold more than one topic", () => {
  it("gives a political story about college football both labels", () => {
    const f = itemFacets(story({
      sourceName: "The Washington Post",
      headline: "The billionaire Trump ally blowing up college football",
      topics: [{ id: "college-sports", type: "theme", label: "college sports" }],
    }));
    expect(f.topics).toEqual(["politics", "sport"]);
  });

  it("gives a specialist story its own topic and its theme's", () => {
    const f = itemFacets(story({
      sourceName: "Puck",
      headline: "Can Google still win the AI race?",
      topics: [{ id: "ai", type: "theme", label: "AI" }],
    }));
    expect(f.topics).toEqual(["adtech", "business"]);
  });

  // The corroboration test must survive: an unearned business label cannot come back as a
  // second chip instead of a first one.
  it("does not let an unearned business label return as a second topic", () => {
    const f = itemFacets(story({
      sourceName: "The Washington Post",
      headline: "The mystery behind an audio clip that helped upend a Senate race",
      topics: [{ id: "ai", type: "theme", label: "AI" }],
    }));
    expect(f.topics).toEqual(["politics"]);
  });

  it("matches a filter on any of a story's topics", () => {
    const item = story({
      sourceName: "The Washington Post",
      headline: "The billionaire Trump ally blowing up college football",
      topics: [{ id: "college-sports", type: "theme", label: "college sports" }],
    });
    expect(itemInFacet(item, "topic", "politics")).toBe(true);
    expect(itemInFacet(item, "topic", "sport")).toBe(true);
    expect(itemInFacet(item, "topic", "adtech")).toBe(false);
  });
});

// Ashwin, 2026-09-13: "perhaps you can call it UEFA instead as the tag. You could look for
// UEFA Champions League, Europa League, and Conference League. All of those could be under
// the banner of UEFA ... It would just show UEFA as the tag itself, but underneath, you
// would be looking for all of those other ones."
describe("the UEFA umbrella", () => {
  it("files all three club cups, the Super Cup and the body itself under one tag", () => {
    for (const headline of ["A Champions League venue is agreed",
                            "The Europa League run reshapes the broadcast deal",
                            "Conference League prize money climbs again",
                            "Inside the UEFA Super Cup's sponsorship refresh",
                            "UEFA reopens the calendar talks"]) {
      const f = itemFacets(story({ headline }));
      expect(f.competitions, headline).toEqual(["uefa"]);
      expect(f.sports, headline).toContain("club-football");
    }
  });

  it("shows UEFA as the label and points the chip at one filter", () => {
    const chips = storyChips(story({ headline: "Europa League prize money climbs" }));
    const sport = chips.filter((c) => c.kind === "sport");
    expect(sport.map((c) => c.label)).toEqual(["UEFA"]);
    expect(sport[0].href).toBe("/digest/filter/competition/uefa");
  });

  it("counts three different cups as one filter with three stories", () => {
    const items = [
      story({ headline: "A Champions League night" }),
      story({ headline: "An Europa League night" }),
      story({ headline: "A Conference League night" }),
    ];
    const club = facetsFor(items).sports.find((s) => s.slug === "club-football");
    const uefa = club?.children?.find((c) => c.slug === "uefa");
    expect(uefa?.label).toBe("UEFA");
    expect(uefa?.count).toBe(3);
    for (const it of items) expect(itemInFacet(it, "competition", "uefa")).toBe(true);
  });

  // The other banners, built the same way.
  it("gives FIFA, CONMEBOL and CONCACAF the same treatment", () => {
    const cases: [string, string][] = [
      ["FIFA scraps its privatization push", "fifa"],
      ["Inside the Club World Cup's broadcast deal", "fifa"],
      ["Is Infantino's indecent proposal really such a surprise?", "fifa"],
      ["Copa Libertadores prize money rises", "conmebol"],
      ["CONMEBOL confirms the Recopa Sudamericana date", "conmebol"],
      ["CONCACAF rejects the FIFA World Cup proposal", "concacaf"],
      ["Leagues Cup expands its format", "concacaf"],
    ];
    for (const [headline, slug] of cases) {
      expect(itemFacets(story({ headline })).competitions, headline).toContain(slug);
    }
  });
});

// "if they have different names or go by acronyms and full names, you should have meta
// tags associated with those" - the showpiece each league is known by counts as the league.
describe("the American leagues' meta tags", () => {
  it("reads a showpiece as its league", () => {
    const cases: [string, string][] = [
      ["Super Bowl ad inventory sells out early", "nfl"],
      ["World Series ratings climb on streaming", "mlb"],
      ["Stanley Cup final draws a record audience", "nhl"],
      ["March Madness rights head back to market", "cbb"],
      ["The College Football Playoff expands again", "cfb"],
      ["Women's National Basketball Association expansion fees", "wnba"],
    ];
    for (const [headline, slug] of cases) {
      expect(itemFacets(story({ headline })).competitions, headline).toContain(slug);
    }
  });
});

describe("the chips a story row shows", () => {
  it("shows the topics and the competition, never the sport above it", () => {
    const chips = storyChips(story({
      sourceName: "The Athletic",
      headline: "Premier League clubs weigh a new broadcast cycle",
    }));
    expect(chips.filter((c) => c.kind === "topic").map((c) => c.label)).toEqual(["Sport"]);
    expect(chips.filter((c) => c.kind === "sport").map((c) => c.label)).toEqual(["Premier League"]);
  });

  // Club names route to their league. Ashwin, 2026-09-13: "Premier League can include all
  // the Premier League teams."
  it("reads a club as its league", () => {
    const cases: [string, string][] = [
      ["Emirates renews Arsenal stadium deal until 2033", "Premier League"],
      ["Arctos to buy 10% of the Atlanta Falcons", "NFL"],
      ["Why the NHL is partnering with Bayern Munich", "Bundesliga"],
      ["Rodri, Real Madrid, and Mourinho's spending spree", "La Liga"],
      ["You Can't Venture-Fund a Second Los Angeles Lakers", "NBA"],
    ];
    for (const [headline, label] of cases) {
      const chips = storyChips(story({ headline })).map((c) => c.label);
      expect(chips, headline).toContain(label);
    }
  });

  // The place guard: a one-word club name that is also a city in the same dataset is out.
  it("never reads a bare place name as its club", () => {
    for (const headline of ["Charlotte's transit referendum passes",
                            "Manchester's new tram line opens",
                            "Liverpool's waterfront redevelopment clears planning"]) {
      const sports = storyChips(story({ headline })).filter((c) => c.kind === "sport");
      expect(sports.map((c) => c.label), headline).toEqual([]);
    }
  });

  it("points every chip at a filter page", () => {
    for (const c of storyChips(story({ headline: "FIFA's World Cup stake sale" }))) {
      expect(c.href, c.label).toMatch(/^\/digest\/filter\/(topic|sport|competition)\//);
    }
  });
});

describe("the facets a page renders", () => {
  it("counts and filters on the text pass, not just on tags", () => {
    const items = [
      story({ headline: "FIFA's World Cup stake sale draws sovereign funds" }),
      story({ headline: "Ranchers' loyalty to Trump wavers", sourceName: "The Washington Post" }),
    ];
    const sports = facetsFor(items).sports;
    const intl = sports.find((s) => s.slug === "international-football");
    expect(intl?.count).toBe(1);
    expect(itemInFacet(items[0], "sport", "international-football")).toBe(true);
    expect(itemInFacet(items[1], "sport", "international-football")).toBe(false);
  });
});
