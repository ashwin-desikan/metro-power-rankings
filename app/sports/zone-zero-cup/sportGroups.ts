// The Cup read by sport: the aggregation, and the taxonomy the filter uses.
//
// No "use client" and no server-only import on purpose. The page builds the rows
// on the server and the board renders them on the client, so this module has to
// be usable from both. The nation shape is declared structurally rather than
// imported from lib/zoneZeroCup, which is server-only.

export type SportKind = "pillar" | "national";
export type SportGroup = "team" | "summer" | "winter" | "national" | "retired";
/**
 * What the filter row can be set to. "womens" is deliberately NOT a SportGroup:
 * the groups partition the board, and Women's Football is a team sport as much
 * as Football is. It is a lens laid across the groups instead, so a sport can be
 * in Team AND in Women's without either being a lie.
 */
export type SportFilter = SportGroup | "all" | "womens";

export type NationLike = {
  name: string;
  countrySlug: string | null;
  sportMerit: Record<string, number>;
  nationalSports?: { sport: string; pts: number }[];
  defunct?: boolean;
  suspended?: boolean;
};

export type SportRow = {
  sport: string;
  kind: SportKind;
  group: SportGroup;
  /** Scored as its own women's pillar, rather than pooled with the men's. */
  womens: boolean;
  total: number;
  share: number;
  nations: number;
  topFourShare: number;
  weight: number | null;
  leaders: { name: string; slug: string | null; pts: number; defunct: boolean; suspended: boolean }[];
};

// Short on purpose. At 390px the full names ("Summer Olympic", "National
// sports") wrapped the chip row to four rows, and DESIGN-STANDARDS caps a tab
// row at three. The blurb under the row carries the full meaning. Do not
// lengthen one of these without re-measuring at 390px.
export const GROUP_LABEL: Record<SportFilter, string> = {
  all: "All",
  womens: "Women's",
  team: "Team",
  summer: "Summer",
  winter: "Winter",
  national: "National",
  retired: "Retired",
};

export const GROUP_BLURB: Record<SportFilter, string> = {
  all: "Every discipline the Cup scores, plus the national sports it recognises.",
  womens: "The eight codes the Cup scores as their own pillar, separately from the men's. Every other discipline here, athletics and swimming and tennis and rowing among them, is one pillar covering both, so the women's half of it cannot be pulled out. This filter shows where the Cup counts women's sport separately, not where women compete.",
  team: "Codes played club and country, in a league and for a flag. Winter team games sit here rather than under Winter Olympic, because that is where a reader looks for them.",
  summer: "The individual summer programme, plus the racquet and precision sports contested mainly outside the Games.",
  winter: "The individual winter programme. Ice hockey and curling are team sports and are filed as such.",
  national: "Domestically major, internationally negligible. These carry a fixed recognition bonus rather than competing for a nation's ten scoring slots, which is why one country can hold all of a sport.",
  retired: "Contested at a Games once and never since. They score nothing today and stay on the board because leaving them off would be a tidier record and a less true one.",
};

// Team codes, including the winter ones. Precedence: this set wins over the
// winter list, so Ice Hockey reads as a team sport rather than as a winter
// discipline. Curling is a rink team game and is filed the same way.
const TEAM = new Set([
  "Football", "Women's Football", "Futsal",
  "Basketball", "Women's Basketball",
  "Cricket", "Women's Cricket",
  "Ice Hockey", "Curling",
  "Rugby Union", "Women's Rugby", "Rugby League",
  "Baseball", "Softball",
  "Handball", "Women's Handball",
  "Volleyball", "Women's Volleyball",
  "Water Polo", "Women's Water Polo",
  "Hockey", "Women's Hockey",
  "Lacrosse", "Netball",
]);

const WINTER = new Set([
  "Alpine Skiing", "Cross Country Skiing", "Ski Jumping", "Nordic Combined",
  "Freestyle Skiing", "Snowboarding", "Biathlon", "Ski Mountaineering",
  "Speed Skating", "Short Track Speed Skating", "Figure Skating",
  "Luge", "Bobsleigh", "Skeleton",
]);

// Contested at a Games and discontinued. Kept as an explicit list rather than
// inferred from "scores zero", so a live sport nobody happens to score in is
// never mislabelled as extinct.
const RETIRED = new Set([
  "Painting", "Sculpture", "Architecture", "Literature", "Music",
  "Polo", "Roque", "Tug-Of-War", "Jeu de Paume", "Field Handball",
  "Alpinism", "Racquets", "Motorboating", "Basque pelota", "Croquet",
  "Military Ski Patrol", "Aeronautics",
  "Equestrian Vaulting", "Equestrian Driving",
]);

/**
 * Derived from the label rather than a hand-kept list, so a pillar the pipeline
 * adds later (a Women's Baseball, say) is picked up without anyone remembering
 * to edit this file.
 */
export function isWomens(sport: string): boolean {
  return sport.startsWith("Women's ");
}

export function classify(sport: string, kind: SportKind): SportGroup {
  if (kind === "national") return "national";
  if (RETIRED.has(sport)) return "retired";
  if (TEAM.has(sport)) return "team";
  if (WINTER.has(sport)) return "winter";
  return "summer";
}

/**
 * One pass over every nation, folding both scoring pillars and the national
 * sports recognition bonuses into one row per sport.
 *
 * National sports are additive bonuses that never compete for a nation's ten
 * scoring slots, so most of them appear nowhere in sportMerit. Rugby League is
 * the exception that proves the merge has to happen by sport name: it is a real
 * pillar AND Papua New Guinea's national sport, and its row has to carry both.
 */
export function buildSportRows(nations: NationLike[], prestige: Record<string, number>): SportRow[] {
  const acc = new Map<string, { total: number; kinds: Set<SportKind>; holders: Map<string, { n: NationLike; pts: number }> }>();

  const add = (sport: string, pts: number, n: NationLike, kind: SportKind) => {
    const a = acc.get(sport) ?? { total: 0, kinds: new Set<SportKind>(), holders: new Map() };
    a.total += pts;
    a.kinds.add(kind);
    const prev = a.holders.get(n.name);
    a.holders.set(n.name, { n, pts: (prev?.pts ?? 0) + pts });
    acc.set(sport, a);
  };

  for (const n of nations) {
    for (const [sport, pts] of Object.entries(n.sportMerit)) add(sport, pts, n, "pillar");
    for (const ns of n.nationalSports ?? []) add(ns.sport, ns.pts, n, "national");
  }

  const grand = [...acc.values()].reduce((s, a) => s + a.total, 0) || 1;

  return [...acc.entries()]
    .map(([sport, a]) => {
      const ranked = [...a.holders.values()].sort((x, y) => y.pts - x.pts);
      const top = ranked.slice(0, 4);
      const topSum = top.reduce((s, h) => s + h.pts, 0);
      // A sport that is only ever a recognition bonus is a national sport; one
      // that is ever scored as a pillar is a pillar, even if a bonus lands on it.
      const kind: SportKind = a.kinds.has("pillar") ? "pillar" : "national";
      return {
        sport,
        kind,
        group: classify(sport, kind),
        womens: isWomens(sport),
        total: a.total,
        share: (a.total / grand) * 100,
        nations: a.holders.size,
        // Zero over zero would render NaN%, so an empty sport reports no
        // concentration rather than a nonsense one.
        topFourShare: a.total > 0 ? (topSum / a.total) * 100 : 0,
        weight: prestige[sport] ?? null,
        leaders: top.map((h) => ({
          name: h.n.name,
          slug: h.n.countrySlug,
          pts: h.pts,
          defunct: !!h.n.defunct,
          suspended: !!h.n.suspended,
        })),
      };
    })
    .sort((a, b) => b.total - a.total);
}
