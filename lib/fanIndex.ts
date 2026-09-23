import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveTeamLink } from "./teamLinks";

// Fan Attention Index. Source data is built entirely from Wikimedia
// Pageviews (agent=user, human traffic only) and Wikidata sitelinks by
// scripts/fans/build_fan_index.py, converted to JSON by
// scripts/fans/csv_to_json.py, and read here from
// public/data/fans/fan-attention.json. No external popularity survey is
// used anywhere in this pipeline or on this page.

export type FanIndexGroup =
  | "NFL" | "NBA" | "MLB" | "NHL" | "MLS" | "WNBA/NWSL" | "F1"
  | "European football" | "Liga MX";

type RawTeam = {
  team: string;
  group: FanIndexGroup;
  league: string;
  val_league: string;
  qid: string;
  en_title: string;
  baseline_12m: number;
  all_lang_views_12m: number;
  en_views_12m: number;
  lang_count: number;
  spike_ratio: number;
  attention_share_in_group: number;
  attention_score: number;
  rank_in_group: number;
  monthly: (number | null)[];
  value_m: number | null;
  val_source: string | null;
  val_year: number | null;
  residual_pct: number | null;
  value_per_1k_baseline: number | null;
};

type RawFile = {
  generated: string;
  window: { start: string; end: string };
  version: string;
  method_url: string;
  groups: FanIndexGroup[];
  teams: RawTeam[];
};

export type FanTeamRow = RawTeam & {
  /** Canonical /teams page, when the site has one for this team. */
  href: string | null;
  displayName: string;
};

export type FanIndexData = {
  generated: string;
  window: { start: string; end: string };
  version: string;
  methodUrl: string;
  groups: FanIndexGroup[];
  teams: FanTeamRow[];
};

// Spike threshold for the "event-driven spike" marker. Matches the README's
// framing of spike_ratio (max month / median month); 2.5x a typical month is
// the line between "a good month" and "something happened".
export const SPIKE_THRESHOLD = 2.5;

// Groups whose log-log value_m ~ baseline_12m regression clears R^2 >= 0.4
// (see scripts/fans/README section carried into /fans/methodology). Kept
// here too so the page can explain an "n/a" residual without re-deriving it.
export const RESIDUAL_ELIGIBLE_GROUPS: ReadonlySet<FanIndexGroup> = new Set([
  "European football", "MLB", "NBA", "NFL",
]);

// (group) -> the sport label resolveTeamLink() expects. WNBA/NWSL is split
// per row by val_league, since that group mixes two different team-link
// sports (WNBA franchises and NWSL football clubs).
function sportFor(group: FanIndexGroup, valLeague: string): string {
  switch (group) {
    case "NFL":
    case "NBA":
    case "MLB":
    case "NHL":
      return group;
    case "F1":
      return "F1";
    case "MLS":
    case "Liga MX":
    case "European football":
      return "Football";
    case "WNBA/NWSL":
      return valLeague === "NWSL" ? "W Football" : "WNBA";
    default:
      return group;
  }
}

let _data: FanIndexData | null = null;

export function getFanIndex(): FanIndexData {
  if (_data) return _data;
  const file = join(process.cwd(), "public", "data", "fans", "fan-attention.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as RawFile;
  const teams: FanTeamRow[] = raw.teams.map((t) => {
    const link = resolveTeamLink(sportFor(t.group, t.val_league), t.team);
    return { ...t, href: link?.href ?? null, displayName: link?.displayName ?? t.team };
  });
  _data = {
    generated: raw.generated,
    window: raw.window,
    version: raw.version,
    methodUrl: raw.method_url,
    groups: raw.groups,
    teams,
  };
  return _data;
}

export function formatFanValueM(m: number): string {
  if (m >= 1000) {
    const b = m / 1000;
    const s = b.toFixed(2).replace(/\.?0+$/, "");
    return `$${s}B`;
  }
  return `$${Math.round(m)}M`;
}

export function formatCompactViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}
