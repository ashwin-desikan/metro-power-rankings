// Club names as a route into their competition, for the digest's sport tagging.
//
// No `import "server-only"` here, deliberately: lib/digestFacets imports this and is unit
// tested under vitest, where that package does not resolve. It reads the filesystem, so it
// is server-only in fact; scripts/check-client-imports.mjs is what enforces it.
//
// Ashwin, 2026-09-13: "Premier League can include all the Premier League teams. This is
// what I'm talking about with umbrella terms." A story headlined "Emirates renews Arsenal
// stadium deal until 2033" never says Premier League and is obviously a Premier League
// story; before this it carried no sport tag at all.
//
// 🔴 THIS IS THE IDEA THAT FAILED ONCE. Rolling the stored `club` TAGS up to their league
// was measured on 2026-09-13 and rejected: the 64 club tags in the archive were led by
// "South Carolina" 11, "San Francisco" 6, "Southern" 3 and "George Washington" 1, which
// are places and people caught by the college vocabulary. What makes this version safe is
// that it reads the TOP FLIGHT ONLY from all-teams.json and drops any single-word name
// that is also a place in that same file. College divisions never enter it.
//
// Measured over the 60-day window before it shipped: 746 usable club names, 21 stories
// matched, and every one of the 21 was correct - Chelsea, Manchester City, Aston Villa,
// Bayern Munich, Real Madrid, the Atlanta Falcons, the Cleveland Browns, the Las Vegas
// Raiders, the Los Angeles Lakers, the Minnesota Timberwolves, the Athletics, the Los
// Angeles Angels. No false positives.

import { readFileSync } from "fs";
import { join } from "path";

type Row = {
  sport?: string;
  league?: string;
  team?: string;
  city?: string;
  metro?: string;
  /** "1" is the top flight of its sport and country. "College" is deliberately excluded. */
  workbook_level?: string | number | null;
};

/**
 * (sport, league) -> competition slug, for the top flight only. `league` is the country
 * for football, which is why England and Scotland can be told apart here when the
 * `country` field ("United Kingdom") cannot tell them apart at all.
 *
 * A null league means the sport has one top flight worldwide in this dataset.
 */
const TOP_FLIGHT: Record<string, string> = {
  "Football|England": "premier-league",
  "Football|Spain": "la-liga",
  "Football|Italy": "serie-a",
  "Football|Germany": "bundesliga",
  "Football|France": "ligue-1",
  "Football|Netherlands": "eredivisie",
  "Football|Portugal": "primeira-liga",
  "Football|Scotland": "scottish-premiership",
  "Football|United States": "mls",
  "American Football|*": "nfl",
  "Baseball|*": "mlb",
  "Basketball|*": "nba",
  "Hockey|*": "nhl",
};

/**
 * Names that pass the place test and still must not be needles.
 *
 * "Athletics" is the Sacramento club's actual name, and it is also the word every college
 * sports-business story uses ("college athletics", "athletics department"). It is kept,
 * with the college senses excluded below, because it was the right answer on both of the
 * stories it matched in the window and the wrong answer on none.
 */
const CLUB_DENY = new Set<string>(["union", "city", "united", "athletic", "rangers", "wanderers"]);

/** Contexts where a club name means something else entirely. */
const CLUB_GUARDS: Record<string, RegExp> = {
  Athletics: /\b(college|collegiate|university|track|intercollegiate)\s+athletics\b/gi,
};

export type ClubNeedle = { name: string; competition: string; guard?: RegExp };

let _clubs: ClubNeedle[] | null = null;

export function clubNeedles(): ClubNeedle[] {
  if (_clubs) return _clubs;
  const out: ClubNeedle[] = [];
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "sports", "all-teams.json"), "utf-8"),
    ) as unknown;
    const rows = (Array.isArray(raw) ? raw : ((raw as { teams?: unknown[] }).teams ?? [])) as Row[];

    // Every place name the dataset knows. A one-word club that is also one of these is a
    // place first: Charlotte, Manchester, Brighton, Liverpool, Genoa, Aberdeen, Monza.
    const places = new Set<string>();
    for (const t of rows) {
      if (t.metro) places.add(t.metro.toLowerCase());
      if (t.city) places.add(t.city.toLowerCase());
    }

    const seen = new Set<string>();
    for (const t of rows) {
      if (String(t.workbook_level ?? "") !== "1") continue;
      const slug = TOP_FLIGHT[`${t.sport}|${t.league}`] ?? TOP_FLIGHT[`${t.sport}|*`];
      if (!slug) continue;
      const name = (t.team ?? "").trim();
      const key = name.toLowerCase();
      if (name.length < 4 || seen.has(key)) continue;
      if (CLUB_DENY.has(key)) continue;
      // One word and also a place in this same file: unusable.
      if (!name.includes(" ") && places.has(key)) continue;
      seen.add(key);
      out.push({ name, competition: slug, guard: CLUB_GUARDS[name] });
    }
  } catch {
    // A missing or unreadable file means no club needles, never a crash: the rest of the
    // sport tagging (competition names, umbrellas) carries on untouched.
  }
  _clubs = out;
  return out;
}
