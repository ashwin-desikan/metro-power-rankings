import "server-only";

// Roll-to-metro-card wiring. Credits each domestic winners-roll title to the
// Team List club that shows on metro pages, so a rugby league / volleyball /
// handball / KHL hockey / CBA / county cricket club's card can display its
// honours (e.g. "5× Bundesliga"), and shows a "No titles" zero-state for clubs
// that ARE part of a tracked competition but have not won — so coverage is
// visible at a glance.
//
// Eligibility is scoped by country, because several sports share one Team List
// "sport" across different leagues (Hockey = NHL + KHL, Rugby League = NRL +
// British, Basketball = NBA/EuroLeague + CBA). Only clubs in the roll's country
// get a chip; everyone else (an NHL club, a EuroLeague club) gets nothing.
//
// Roll winner names often differ from Team List names ("Leeds" vs "Leeds
// Rhinos"), so each winner is resolved to a single eligible club by: exact
// normalized match, else the curated alias map (lib/belowTheLine), else a
// unique token-superset match. Exact match wins, so same-city clubs (Hull FC
// vs Hull Kingston Rovers) are never conflated.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getHonourPortal } from "./honourRolls";
import { ROLL_TO_TEAMLIST_ALIASES } from "./belowTheLine";

export type DomesticHonour = { count: number; label: string; href: string };

type RollCfg = {
  portalKey: string; rollKey: string; label: string; href: string;
  countries: string[];          // Team List country/countries this roll covers
  exclude?: string[];           // club names in those countries that are NOT in the competition
  onlyNames?: string[];         // restrict eligibility to exactly these club names
};

const SPORT_ROLLS: Record<string, RollCfg[]> = {
  "Handball": [
    { portalKey: "handball-domestic", rollKey: "bundesliga", label: "Bundesliga", href: "/teams/handball/domestic", countries: ["Germany"] },
  ],
  "Volleyball": [
    { portalKey: "volleyball-domestic", rollKey: "superlega", label: "SuperLega", href: "/teams/volleyball/domestic", countries: ["Italy"] },
    { portalKey: "volleyball-domestic", rollKey: "plusliga", label: "PlusLiga", href: "/teams/volleyball/domestic", countries: ["Poland"] },
    { portalKey: "volleyball-domestic", rollKey: "svleague", label: "SV.League", href: "/teams/volleyball/domestic", countries: ["Japan"] },
  ],
  "Hockey": [
    { portalKey: "hockey-domestic", rollKey: "khl", label: "KHL", href: "/teams/hockey/domestic", countries: ["Russia"] },
  ],
  "Rugby League": [
    { portalKey: "rugby-league", rollKey: "superleague", label: "British RL", href: "/teams/rugby-league/british", countries: ["United Kingdom", "France"] },
  ],
  "Basketball": [
    { portalKey: "basketball-domestic", rollKey: "cba", label: "CBA", href: "/teams/basketball/domestic", countries: ["China"] },
  ],
  "T20 Cricket": [
    {
      portalKey: "cricket-county", rollKey: "county", label: "County Championship", href: "/teams/cricket/county",
      countries: ["United Kingdom", "England"],
      // The Hundred franchises and the Scotland/Ireland T20 sides are not first-class counties.
      exclude: ["Birmingham Phoenix", "London Spirit", "MI London", "Manchester Super Giants",
                "Southern Brave", "Sunrisers Leeds", "Trent Rockets", "Welsh Fire",
                "Edinburgh Castle Rockers", "Glasgow", "Irish Wolves"],
    },
  ],
};

const DROP = new Set(["hc", "vc", "bc", "rc", "sc", "fc", "club", "de", "the", "rlfc", "ccc", "county", "cricket"]);

function norm(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  out = out.replace(/&/g, " and ").replace(/[.\-']/g, " ").replace(/[^a-z0-9 ]/gi, "").toLowerCase();
  return out.split(/\s+/).filter((w) => w && !DROP.has(w)).join(" ").trim();
}

type Club = { norm: string; tokens: Set<string>; country: string };

// Eligible clubs for one roll config: Team List clubs of that sport, in the
// roll's country, minus the exclude list.
function eligibleFor(sport: string, cfg: RollCfg): Club[] {
  const p = join(process.cwd(), "public", "data", "sports", "all-teams.json");
  if (!existsSync(p)) return [];
  const teams = JSON.parse(readFileSync(p, "utf-8")) as { sport: string; team: string; country?: string; source?: string }[];
  const ex = new Set((cfg.exclude ?? []).map(norm));
  const only = cfg.onlyNames ? new Set(cfg.onlyNames.map(norm)) : null;
  const out: Club[] = [];
  for (const t of teams) {
    if (t.source !== "team_list" || t.sport !== sport) continue;
    if (!cfg.countries.includes(t.country ?? "")) continue;
    const n = norm(t.team);
    if (!n || ex.has(n)) continue;
    if (only && !only.has(n)) continue;
    out.push({ norm: n, tokens: new Set(n.split(" ")), country: t.country ?? "" });
  }
  return out;
}

function resolveAmong(eligible: Club[], winner: string, portalKey: string): string | null {
  const byNorm = new Map(eligible.map((c) => [c.norm, c]));
  const aliasName = ROLL_TO_TEAMLIST_ALIASES[portalKey]?.[winner];
  if (aliasName) {
    const an = norm(aliasName);
    if (byNorm.has(an)) return an;
  }
  const nw = norm(winner);
  if (byNorm.has(nw)) return nw; // exact match wins
  const wTokens = nw.split(" ").filter(Boolean);
  if (wTokens.length === 0) return null;
  const supersets = eligible.filter((c) => wTokens.every((t) => c.tokens.has(t)));
  return supersets.length === 1 ? supersets[0].norm : null;
}

// sport -> (club norm -> chips, including zero-count for connected-but-titleless)
let _map: Map<string, Map<string, DomesticHonour[]>> | null = null;

function honoursMap(): Map<string, Map<string, DomesticHonour[]>> {
  if (_map) return _map;
  _map = new Map();
  for (const [sport, cfgs] of Object.entries(SPORT_ROLLS)) {
    const bySport = new Map<string, DomesticHonour[]>();
    for (const cfg of cfgs) {
      const eligible = eligibleFor(sport, cfg);
      const counts = new Map<string, number>();
      for (const c of eligible) counts.set(c.norm, 0); // zero-state for every eligible club
      const portal = getHonourPortal(cfg.portalKey);
      for (const r of portal?.rolls[cfg.rollKey] ?? []) {
        const club = resolveAmong(eligible, r.winner, cfg.portalKey);
        if (club) counts.set(club, (counts.get(club) ?? 0) + 1);
      }
      for (const [club, count] of counts) {
        const arr = bySport.get(club) ?? [];
        arr.push({ count, label: cfg.label, href: cfg.href });
        bySport.set(club, arr);
      }
    }
    _map.set(sport, bySport);
  }
  return _map;
}

// Honour chips for a club's metro card. count > 0 = titles; count === 0 =
// connected to the competition but no titles. Empty when the sport has no roll
// or the club is not in a tracked competition.
export function getDomesticHonours(sport: string, teamName: string): DomesticHonour[] {
  if (!SPORT_ROLLS[sport]) return [];
  const bySport = honoursMap().get(sport);
  if (!bySport) return [];
  return (bySport.get(norm(teamName)) ?? []).slice().sort((a, b) => b.count - a.count);
}
