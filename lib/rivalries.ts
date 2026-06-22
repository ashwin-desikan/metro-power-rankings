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
  return list.map((e) => ({
    rivalry: e.rivalry,
    rivalName: e.rival,
    href: e.href || fallbackHref(e.scope, e.rival, sport, e.leagueHint || leagueHint),
    scope: e.scope,
    trophy: e.trophy,
    type: e.type,
    tier: e.tier,
    blurb: e.blurb,
    wikipedia: e.wikipedia,
    mutual: e.mutual ?? true,
    top: e.top ?? false,
  }));
}

export function getAllRivalries(): ResolvedRivalryRow[] {
  return data().all.map((r) => ({
    sport: r.sport,
    rivalry: r.rivalry,
    team: { name: r.team.name, href: r.team.href || null },
    rival: { name: r.rival.name, href: r.rival.href || null },
    country: r.country ?? "",
    twoWay: r.twoWay ?? true,
    top: r.top ?? false,
  }));
}
