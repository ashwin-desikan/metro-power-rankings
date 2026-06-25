import "server-only";

// Cross-sport rivalries. Source of truth: Rivalries.xlsx (repo root, gitignored)
// -> scripts/build-rivalries.py -> public/data/rivalries.json. A team page calls
// getRivalries(teamName, sport, leagueHint) and renders <RivalriesSection>; the
// /sports/rivalries hub calls getAllRivalries().
//
// Links are baked at build time from our franchise/team files. This loader
// prefers the baked href and falls back to resolveTeamLink for any club that is
// not baked (e.g. a side gained a page between rebuilds). Server-only;
// registered in scripts/check-client-imports.mjs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { resolveTeamLink } from "./teamLinks";

type RawEntry = {
  rivalry: string;
  rival: string;
  href: string;
  scope: string; // "Club" | "National" | "College"
  leagueHint: string;
  country: string;
  trophy: string;
  type: string;
  tier: string;
  blurb: string;
  wikipedia: string;
  mutual?: boolean;
  top?: boolean;
};

type AllRow = {
  sport: string;
  rivalry: string;
  team: { name: string; href: string };
  rival: { name: string; href: string };
  twoWay: boolean;
  top: boolean;
  country: string;
};

type RivalriesFile = {
  generated_at: string;
  by_team: Record<string, Record<string, RawEntry[]>>;
  all: AllRow[];
};

export type ResolvedRival = {
  rivalry: string;
  rivalName: string;
  href: string | null;
  scope: string;
  trophy: string;
  type: string;
  tier: string;
  blurb: string;
  wikipedia: string;
  mutual: boolean;
  top: boolean;
};

export type ResolvedRivalryRow = {
  sport: string;
  rivalry: string;
  team: { name: string; href: string | null };
  rival: { name: string; href: string | null };
  country: string;
  twoWay: boolean;
  top: boolean;
};

let _data: RivalriesFile | null = null;
function data(): RivalriesFile {
  if (_data) return _data;
  const p = join(process.cwd(), "public", "data", "rivalries.json");
  _data = existsSync(p)
    ? (JSON.parse(readFileSync(p, "utf-8")) as RivalriesFile)
    : { generated_at: "", by_team: {}, all: [] };
  return _data;
}

// Full-name resolution for the US majors. The rivalries data stores short
// nicknames ("49ers", "Mets", "Avalanche") for these leagues, which read oddly
// beside the full names every other sport uses and break the name-keyed crest
// lookup (short names miss or collide, e.g. "Chiefs"). The baked href carries
// the franchise slug, so we map it back to the full display name.
const MAJOR_LEAGUES = ["nfl", "nba", "mlb", "nhl"] as const;
type FranchiseName = { slug?: string; display_name?: string; name?: string };
let _majorNames: Record<string, Record<string, string>> | null = null;
function majorNames(): Record<string, Record<string, string>> {
  if (_majorNames) return _majorNames;
  _majorNames = {};
  for (const lg of MAJOR_LEAGUES) {
    const map: Record<string, string> = {};
    try {
      const p = join(process.cwd(), "public", "data", lg, "franchises.json");
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, "utf-8")) as
          | FranchiseName[]
          | { franchises?: FranchiseName[]; teams?: FranchiseName[] };
        const arr: FranchiseName[] = Array.isArray(j) ? j : (j.franchises ?? j.teams ?? []);
        for (const f of arr) {
          const full = f.display_name || f.name;
          if (f.slug && full) map[f.slug] = full;
        }
      }
    } catch {
      // leave empty; callers fall back to the stored name
    }
    _majorNames[lg] = map;
  }
  return _majorNames;
}

// Given a baked team href, return the full franchise name for the US majors;
// otherwise the supplied fallback (already a full/proper name for every other
// sport).
function displayName(href: string | null | undefined, fallback: string): string {
  if (!href) return fallback;
  const m = /^\/teams\/(nfl|nba|mlb|nhl)\/([^/?#]+)/.exec(href);
  if (!m) return fallback;
  return majorNames()[m[1]]?.[m[2]] ?? fallback;
}

// Must match norm() in scripts/build-rivalries.py exactly.
function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FOOTBALL_LABELS = new Set(["Football", "Soccer", "Football/Soccer"]);
const CFB_LABELS = new Set(["College Football", "CFB", "American Football (NCAA)"]);
const HINT_KEY: Record<string, string> = {
  NFL: "nfl", NBA: "nba", NHL: "nhl", MLB: "mlb",
  CBB: "cbb", NCAAM: "cbb", NCAA: "cbb", CFB: "college-football",
  NRL: "nrl", AFL: "afl", CFL: "cfl", WNBA: "wnba",
  WCBB: "cbb-w", NCAAW: "cbb-w", WFOOTBALL: "wfootball",
};

function sportKeyFor(sport: string, leagueHint: string): string {
  if (HINT_KEY[leagueHint]) return HINT_KEY[leagueHint];
  if (CFB_LABELS.has(sport)) return "college-football";
  if (FOOTBALL_LABELS.has(sport)) return "football";
  if (sport === "Rugby Union" || sport === "Rugby") return "rugby-union";
  if (sport === "Cricket") return "cricket";
  return norm(sport);
}

// Fallback resolution for unbaked club/college sides.
function fallbackHref(scope: string, name: string, sport: string, leagueHint: string): string | null {
  if (scope === "National") return null;
  const resolveSport = scope === "College" ? "College Football" : sport;
  const link = resolveTeamLink(resolveSport, name, leagueHint);
  return link ? link.href : null;
}

export function getRivalries(teamName: string, sport: string, leagueHint = ""): ResolvedRival[] {
  const bucket = data().by_team[sportKeyFor(sport, leagueHint)];
  if (!bucket) return [];
  const list = bucket[norm(teamName)] ?? [];
  return list.map((e) => {
    const href = e.href || fallbackHref(e.scope, e.rival, sport, e.leagueHint || leagueHint);
    return {
    rivalry: e.rivalry,
    rivalName: displayName(href, e.rival),
    href,
    scope: e.scope,
    trophy: e.trophy,
    type: e.type,
    tier: e.tier,
    blurb: e.blurb,
    wikipedia: e.wikipedia,
    mutual: e.mutual ?? true,
    top: e.top ?? false,
    };
  });
}

export function getAllRivalries(): ResolvedRivalryRow[] {
  return data().all.map((r) => ({
    sport: r.sport,
    rivalry: r.rivalry,
    team: { name: displayName(r.team.href, r.team.name), href: r.team.href || null },
    rival: { name: displayName(r.rival.href, r.rival.name), href: r.rival.href || null },
    country: r.country ?? "",
    twoWay: r.twoWay ?? true,
    top: r.top ?? false,
  }));
}
