import { describe, expect, it } from "vitest";
import {
  topicFor, topicsFor, publicationFor, themeTopic, normSource,
  PUBLICATIONS, TOPIC_LABEL, TOPIC_ORDER, type StoryTag,
} from "./digestTopics";

const theme = (id: string): StoryTag => ({ id, type: "theme", label: id });

describe("normSource", () => {
  it("pads and flattens so needles match on word edges", () => {
    expect(normSource("The Washington Post")).toBe(" the washington post ");
    expect(normSource("NYT/The Athletic alert")).toBe(" nyt the athletic alert ");
  });
});

describe("publicationFor", () => {
  it("matches a bare name", () => {
    expect(publicationFor("Digiday")?.topic).toBe("adtech");
  });

  // The whole reason this is substring matching and not an exact-match table.
  it("matches editions of one title", () => {
    for (const s of ["WaPo 5-Minute Fix", "Washington Post Early Brief",
                     "Washington Post Politics Alert"]) {
      expect(publicationFor(s)?.topic, s).toBe("politics");
    }
    for (const s of ["The Athletic FC", "The Athletic Pulse",
                     "Front Office Sports — Morning Edition", "SBJ 360"]) {
      expect(publicationFor(s)?.topic, s).toBe("sport");
    }
  });

  // A joint attribution lists the primary source first.
  it("takes the leftmost publication in a compound string", () => {
    expect(publicationFor("Washington Post / Politico")?.needle).toBe("washington post");
    expect(publicationFor("Morning Brew, Yahoo Sports")?.needle).toBe("morning brew");
    expect(publicationFor("AdExchanger, The Athletic")?.needle).toBe("adexchanger");
  });

  it("returns null rather than guessing", () => {
    expect(publicationFor("Some Newsletter Nobody Has Heard Of")).toBeNull();
  });
});

describe("themeTopic", () => {
  it("reads only theme tags, not the place taxonomy", () => {
    expect(themeTopic([{ id: "palantir", type: "company", label: "Palantir" }])).toBeNull();
    expect(themeTopic([theme("elections")])).toBe("politics");
  });

  it("refuses to decide when mapped themes disagree", () => {
    expect(themeTopic([theme("elections"), theme("ai")])).toBeNull();
  });

  // 🔴 These are left out on purpose. If someone adds them back, this fails and they
  // have to read the comment explaining why measuring said no.
  it("leaves genuinely two-sided themes unmapped", () => {
    for (const id of ["antitrust", "streaming-rights", "labour", "tariffs",
                      "art-market", "climate", "housing", "public-health"]) {
      expect(themeTopic([theme(id)]), id).toBeNull();
    }
  });
});

describe("topicFor", () => {
  // The regression that matters. A specialist publication is never overridden, or a
  // Digiday story about AI silently becomes business.
  it("lets a specialist source win over any theme", () => {
    expect(topicFor("Digiday", [theme("ai")])).toBe("adtech");
    expect(topicFor("The Athletic", [theme("crypto")])).toBe("sport");
    expect(topicFor("Democracy Docket", [theme("advertising")])).toBe("politics");
  });

  // The other half. A general source defers, which is what fixes the Washington Post
  // sports desk filing under politics and government.
  it("lets themes override a general-interest source", () => {
    expect(topicFor("The Washington Post", [theme("college-sports")])).toBe("sport");
    expect(topicFor("The Washington Post", null)).toBe("politics");
    expect(topicFor("Business Insider", [theme("elections")])).toBe("politics");
    expect(topicFor("Business Insider", null)).toBe("business");
  });

  it("returns null for a source it does not know and a story with no usable theme", () => {
    expect(topicFor("Some Newsletter Nobody Has Heard Of", null)).toBeNull();
  });

  // Ashwin, 2026-09-13: "By default, things like Washington Post, New York Times, Guardian,
  // and BBC News etc will be political and government unless you can find business and tech
  // within the headline or within the story." These are the real headlines he objected to.
  describe("a business theme has to earn a newspaper", () => {
    it("keeps politics when nothing in the story backs the theme up", () => {
      expect(topicFor("The Washington Post", [theme("ai")],
        "The mystery behind an audio clip that helped upend a Senate race")).toBe("politics");
      expect(topicFor("The Washington Post", [theme("aviation")],
        "ICE is expanding its arrests at airports to new targets")).toBe("politics");
      expect(topicFor("Politico", [theme("space")], "US strikes Iran's Larak Island")).toBe("politics");
    });

    // The two he named. Both carried theme:energy, caught on a section summary about oil
    // prices; energy is out of the map entirely now, so they never leave politics.
    it("files the Trump dividend and the ranchers as politics", () => {
      expect(topicFor("The Washington Post", [theme("energy")],
        "Why a $5,000 Trump dividend check won't solve your money woes")).toBe("politics");
      expect(topicFor("The Washington Post", [theme("energy")],
        "Ranchers' loyalty to Trump wavers as some bristle over beef imports")).toBe("politics");
    });

    it("still allows business when the story names a company or the trade", () => {
      expect(topicFor("Reuters", [theme("ai"), { id: "openai", type: "company", label: "OpenAI" }],
        "Seattle Times, Newsday sue OpenAI and Microsoft")).toBe("business");
      expect(topicFor("The Guardian", [theme("ai")],
        "John Lewis is making a chat show for the chatbots")).toBe("business");
    });

    // A political actor in the headline vetoes an otherwise real tech word.
    it("lets a named politician outrank a tech word", () => {
      expect(topicFor("The Washington Post", [theme("data-centres")],
        "Trump champions data centers as Republicans turn against them")).toBe("politics");
    });

    // The test is scoped to the business pull. Narrow themes still override freely, or the
    // Washington Post sports desk goes back to filing under politics.
    it("does not touch sport or adtech overrides", () => {
      expect(topicFor("The Washington Post", [theme("college-sports")],
        "The billionaire Trump ally blowing up college football")).toBe("sport");
      expect(topicFor("The Washington Post", [theme("advertising")],
        "Trump's ad spend hits a record")).toBe("adtech");
    });

    // Business-defaulted sources are untouched: the test only applies to a politics default.
    it("leaves business-first publications alone", () => {
      expect(topicFor("Semafor", [theme("ai")], "Saudi's AI superpower ambitions")).toBe("business");
    });
  });
});

// Ashwin, 2026-09-13: "those four main topics are not exclusive. You can have two topics
// on the same story." topicFor still answers when only one label fits; topicsFor is the
// full set, and must always contain that one.
describe("topicsFor", () => {
  it("returns the source's topic and every mapped theme's", () => {
    expect(topicsFor("The Washington Post", [theme("college-sports")])).toEqual(["politics", "sport"]);
    expect(topicsFor("Puck", [theme("ai")])).toEqual(["adtech", "business"]);
    expect(topicsFor("The Athletic", [theme("advertising")])).toEqual(["sport", "adtech"]);
  });

  it("stays single when there is nothing to add", () => {
    expect(topicsFor("The Washington Post", null)).toEqual(["politics"]);
    expect(topicsFor("Digiday", [theme("advertising")])).toEqual(["adtech"]);
  });

  it("keeps the corroboration test, so an unearned business label cannot sneak back", () => {
    expect(topicsFor("The Washington Post", [theme("ai")],
      "The mystery behind an audio clip that helped upend a Senate race")).toEqual(["politics"]);
    expect(topicsFor("Reuters", [theme("ai"), { id: "openai", type: "company", label: "OpenAI" }],
      "Seattle Times, Newsday sue OpenAI and Microsoft")).toEqual(["politics", "business"]);
  });

  it("always contains the single answer topicFor gives", () => {
    const cases: [string, StoryTag[] | null, string | null][] = [
      ["The Washington Post", [theme("college-sports")], "A college football story"],
      ["Puck", [theme("ai")], "Can Google still win the AI race?"],
      ["The Washington Post", [theme("energy")], "Why a $5,000 Trump dividend check won't help"],
      ["Semafor", [theme("ipo"), theme("ai")], "Terminal value"],
      ["Digiday", null, "An adtech story"],
    ];
    for (const [src, tags, head] of cases) {
      const one = topicFor(src, tags, head);
      const all = topicsFor(src, tags, head);
      if (one) expect(all, `${src} / ${head}`).toContain(one);
    }
  });

  it("returns nothing for a source it does not know with no usable theme", () => {
    expect(topicsFor("Some Newsletter Nobody Has Heard Of", null)).toEqual([]);
  });

  // Order is TOPIC_ORDER, never discovery order, so a story's chips do not reshuffle.
  it("returns topics in the declared order", () => {
    const all = topicsFor("The Washington Post", [theme("college-sports"), theme("advertising")]);
    expect(all).toEqual(TOPIC_ORDER.filter((t) => all.includes(t)));
  });
});

describe("the map itself", () => {
  it("labels and orders all four topics", () => {
    expect(TOPIC_ORDER).toHaveLength(4);
    for (const t of TOPIC_ORDER) expect(TOPIC_LABEL[t]).toBeTruthy();
  });

  it("has no duplicate needles", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const p of PUBLICATIONS) {
      if (seen.has(p.needle)) dupes.push(p.needle);
      seen.add(p.needle);
    }
    expect(dupes).toEqual([]);
  });

  // Needles are matched space-padded, so one containing punctuation can never fire.
  it("has needles that normSource could actually produce", () => {
    const bad = PUBLICATIONS.filter((p) => normSource(p.needle) !== ` ${p.needle} `);
    expect(bad.map((p) => p.needle)).toEqual([]);
  });
});
