import "server-only";

// Live WC2026 group standings from ESPN's public fifa.world standings API,
// merged over the workbook-derived bundle so the Group Stage tables update
// between deploys like the other live league tables. Parsed server-side with
// 30-minute revalidation during the tournament; returns null on any failure
// so the page falls back to the workbook bundle and the build never breaks.
//
// Schema verified 2026-06-11: children[] = 12 groups (name "Group A"...),
// children[i].standings.entries[] = { team: { displayName }, stats: [
// gamesPlayed, wins, ties, losses, pointsFor, pointsAgainst,
// pointDifferential, points, rank ] }.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import type { WorldCup2026Bundle } from "@/lib/international";

const ESPN_URL =
  "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=2026";

export type Wc2026LiveRow = {
  group: string; // "A".."L"
  name: string;  // ESPN displayName
  played: number; w: number; d: number; l: number;
  gs: number; ga: number; gd: number; pts: number;
};

export type Wc2026LiveStandings = {
  source: "espn";
  rows: Wc2026LiveRow[];
} | null;

// ESPN displayName -> workbook cur_name where they diverge.
const NAME_ALIASES: Record<string, string> = {
  "USA": "United States",
  "Czechia": "Czech Republic",
  "Korea Republic": "South Korea",
  "IR Iran": "Iran",
  "Cabo Verde": "Cape Verde",
  "Ivory Coast": "Côte d'Ivoire",
  "Türkiye": "Turkey",
  "Turkiye": "Turkey",
  "Bosnia and Herzegovina": "Bosnia-Herzegovina",
  "DR Congo": "Congo DR",
};

type EspnStat = { name?: string; value?: number };
type EspnEntry = { team?: { displayName?: string }; stats?: EspnStat[] };
type EspnGroup = { name?: string; standings?: { entries?: EspnEntry[] } };

function statVal(entry: EspnEntry, name: string): number | null {
  const s = entry.stats ? entry.stats.find((x) => x.name === name) : undefined;
  return s && typeof s.value === "number" ? s.value : null;
}

function norm(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  // Drop punctuation/separators and connector words, then sort the
  // remaining tokens so word order and hyphen-vs-"and" differences match.
  const drop = new Set(["and", "the", "of"]);
  return out
    .replace(/['’.\-]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && !drop.has(t))
    .sort()
    .join(" ");
}

export async function getWc2026LiveStandings(): Promise<Wc2026LiveStandings> {
  try {
    const res = await fetch(ESPN_URL, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const groups: EspnGroup[] = data?.children ?? [];
    if (groups.length === 0) return null;
    const rows: Wc2026LiveRow[] = [];
    for (const g of groups) {
      const label = (g.name ?? "").replace(/^Group\s+/i, "").trim();
      for (const e of g.standings?.entries ?? []) {
        const name = e.team?.displayName;
        const played = statVal(e, "gamesPlayed");
        if (!name || played === null) continue;
        rows.push({
          group: label,
          name,
          played,
          w: statVal(e, "wins") ?? 0,
          d: statVal(e, "ties") ?? 0,
          l: statVal(e, "losses") ?? 0,
          gs: statVal(e, "pointsFor") ?? 0,
          ga: statVal(e, "pointsAgainst") ?? 0,
          gd: statVal(e, "pointDifferential") ?? 0,
          pts: statVal(e, "points") ?? 0,
        });
      }
    }
    return rows.length > 0 ? { source: "espn", rows } : null;
  } catch {
    return null;
  }
}

// Pure merge: overrides the workbook group rows with live numbers where the
// team resolves by name; unmatched teams keep their workbook line. Returns
// the original bundle untouched when there is nothing to merge.
export function mergeWc2026Live(
  bundle: WorldCup2026Bundle,
  live: Wc2026LiveStandings,
): WorldCup2026Bundle {
  if (!live || live.rows.length === 0) return bundle;
  const byName = new Map<string, Wc2026LiveRow>();
  for (const r of live.rows) {
    byName.set(norm(NAME_ALIASES[r.name] ?? r.name), r);
  }
  let matched = 0;
  const group_stage: WorldCup2026Bundle["group_stage"] = {};
  for (const [key, rows] of Object.entries(bundle.group_stage)) {
    group_stage[key] = rows.map((row) => {
      const lr = byName.get(norm(row.cur_name));
      if (!lr) return row;
      // Never let a stale live row regress a more-complete bundle row: only
      // override when the live source has played at least as many matches as
      // the bundle already records. This prevents a matchday-1 ESPN snapshot
      // from overwriting a completed group table derived from the results feed.
      if (lr.played < (row.matches ?? 0)) return row;
      matched += 1;
      return {
        ...row,
        w: lr.w, d: lr.d, l: lr.l,
        gs: lr.gs, ga: lr.ga, gd: lr.gd,
        pts: lr.pts, matches: lr.played,
      };
    });
  }
  if (matched === 0) return bundle;
  return { ...bundle, group_stage, live: { source: "espn" } };
}

// ---------------------------------------------------------------------------
// Runtime fetch of wc2026.json + wc2026-sim.json from GitHub raw.
//
// These two files are updated by the daily GitHub Action (wc2026-daily.yml)
// with [vercel skip] so no Vercel deploy is triggered. Fetching from GitHub
// raw with 30-minute revalidation means the bracket + sim odds update on the
// ISR cycle without needing a rebuild.
//
// Falls back to the build-time bundle (getWorldCup2026) on any fetch failure
// so the page never breaks.
// ---------------------------------------------------------------------------

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/international";

export async function fetchWc2026Bundle(
  buildTimeFallback: WorldCup2026Bundle | null,
): Promise<WorldCup2026Bundle | null> {
  try {
    const [bundleRes, simRes] = await Promise.all([
      fetch(`${GH_RAW}/wc2026.json`,     { next: { revalidate: 1800 } }),
      fetch(`${GH_RAW}/wc2026-sim.json`, { next: { revalidate: 1800 } }),
    ]);
    if (!bundleRes.ok) return buildTimeFallback;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bundle: any = await bundleRes.json();
    if (!bundle?.tournament) return buildTimeFallback;
    if (simRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawSim: any = await simRes.json();
      if (rawSim?.groups) {
        const by_slug: Record<string, { exp_points: number; p_advance: number; p_win_group: number }> = {};
        for (const rows of Object.values(rawSim.groups) as any[]) {
          for (const r of rows) {
            by_slug[r.slug] = { exp_points: r.exp_points, p_advance: r.p_advance, p_win_group: r.p_win_group };
          }
        }
        bundle.sim = { meta: rawSim.meta, by_slug, deep_runs: rawSim.deep_runs ?? [], matchups: rawSim.matchups ?? {} };
      }
    }
    return bundle as WorldCup2026Bundle;
  } catch {
    return buildTimeFallback;
  }
}


// ---------------------------------------------------------------------------
// Live knockout results + bracket advancement from ESPN's fifa.world scoreboard.
//
// The group tables ride the standings feed above. This pulls finished matches
// straight from the scoreboard across the whole knockout window and, at read
// time: (1) writes their scores onto the bracket, and (2) advances winners into
// the next round's slots. So both the score AND the bubble move within the
// 30-minute ISR window, with no Action run and no deploy. The morning refresh
// then only recomputes the projection odds.
// ---------------------------------------------------------------------------

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
// UTC window covering Round of 32 through the Final; one ranged request.
const KO_DATE_RANGE = "20260628-20260720";

export type Wc2026LiveMatch = {
  a_name: string; a_score: number; a_win: boolean; a_so: number | null;
  b_name: string; b_score: number; b_win: boolean; b_so: number | null;
};
export type Wc2026LiveScores = { source: "espn"; matches: Wc2026LiveMatch[] } | null;

export async function getWc2026LiveScores(): Promise<Wc2026LiveScores> {
  try {
    const res = await fetch(`${SCOREBOARD_URL}?dates=${KO_DATE_RANGE}`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: any[] = data?.events ?? [];
    const matches: Wc2026LiveMatch[] = [];
    for (const ev of events) {
      const comp = ev?.competitions?.[0];
      if (!comp || !comp.status?.type?.completed) continue; // finished matches only
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cs: any[] = comp.competitors ?? [];
      if (cs.length !== 2) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const home = cs.find((c: any) => c.homeAway === "home") ?? cs[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const away = cs.find((c: any) => c.homeAway === "away") ?? cs[1];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nm = (c: any): string | null => (c?.team?.displayName ?? null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sc = (c: any): number | null => { const n = Number(c?.score); return Number.isFinite(n) ? n : null; };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const so = (c: any): number | null => { const n = Number(c?.shootoutScore); return Number.isFinite(n) && n > 0 ? n : null; };
      const an = nm(home), bn = nm(away), hs = sc(home), aws = sc(away);
      if (!an || !bn || hs === null || aws === null) continue;
      matches.push({
        a_name: an, a_score: hs, a_win: !!home.winner, a_so: so(home),
        b_name: bn, b_score: aws, b_win: !!away.winner, b_so: so(away),
      });
    }
    return matches.length > 0 ? { source: "espn", matches } : null;
  } catch {
    return null;
  }
}

// Bracket topology, mirroring scripts/patch-wc2026-bracket.py. Round of 32 slots
// are in match order 73..88. Each later match takes the winners of two earlier
// matches; the third-place game (103) takes the two semifinal losers. Downstream
// slots are labelled "Winner Match N" / "Loser Match N" until resolved.
const WC_WIN_FEEDERS: Record<number, [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100], 104: [101, 102],
};
const WC_OWN_OF_PAIR = new Map<string, number>();
for (const [k, [a, b]] of Object.entries(WC_WIN_FEEDERS)) {
  WC_OWN_OF_PAIR.set([a, b].sort((x, y) => x - y).join("-"), Number(k));
}
const WC_KO_ORDER = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Third Place Game", "Final"];

function wcFeeder(label: string | null): { num: number; loser: boolean } | null {
  if (!label) return null;
  const m = label.match(/(Winner|Loser)\s+Match\s+(\d+)/i);
  return m ? { num: Number(m[2]), loser: m[1].toLowerCase() === "loser" } : null;
}

// Overlays live final scores AND advances winners through the bracket. Matched
// by the unordered pair of team names, so home/away order is irrelevant.
export function mergeWc2026Knockout(
  bundle: WorldCup2026Bundle,
  live: Wc2026LiveScores,
): WorldCup2026Bundle {
  if (!live || live.matches.length === 0) return bundle;
  const pairKey = (x: string, y: string) => [norm(x), norm(y)].sort().join("|");
  const byPair = new Map<string, Wc2026LiveMatch>();
  for (const m of live.matches) {
    byPair.set(pairKey(NAME_ALIASES[m.a_name] ?? m.a_name, NAME_ALIASES[m.b_name] ?? m.b_name), m);
  }

  type Side = { slug: string | null; name: string };
  const winnerBy = new Map<number, Side>();
  const loserBy = new Map<number, Side>();
  let changed = 0;

  const knockout: WorldCup2026Bundle["knockout"] = {};
  for (const [rn, ms] of Object.entries(bundle.knockout)) knockout[rn] = ms.map((r) => ({ ...r }));

  for (const rn of WC_KO_ORDER) {
    const slots = knockout[rn];
    if (!slots) continue;
    slots.forEach((slot, i) => {
      let ownNum: number | null = null;
      if (rn === "Round of 32") {
        ownNum = 73 + i;
      } else {
        const fa = wcFeeder(slot.team_cur_name);
        const fb = wcFeeder(slot.opp_cur_name);
        if (slot.team_slug === null && fa) {
          const src = fa.loser ? loserBy.get(fa.num) : winnerBy.get(fa.num);
          if (src && src.slug) { slot.team_slug = src.slug; slot.team_cur_name = src.name; changed += 1; }
        }
        if (slot.opp_slug === null && fb) {
          const src = fb.loser ? loserBy.get(fb.num) : winnerBy.get(fb.num);
          if (src && src.slug) { slot.opp_slug = src.slug; slot.opp_cur_name = src.name; changed += 1; }
        }
        if (rn === "Third Place Game") ownNum = 103;
        else if (fa && fb) ownNum = WC_OWN_OF_PAIR.get([fa.num, fb.num].sort((x, y) => x - y).join("-")) ?? null;
      }

      const teamsKnown = slot.team_slug !== null && slot.opp_slug !== null;
      if (teamsKnown) {
        const lm = byPair.get(pairKey(slot.team_cur_name, slot.opp_cur_name));
        if (lm) {
          const teamIsA = norm(NAME_ALIASES[lm.a_name] ?? lm.a_name) === norm(slot.team_cur_name);
          const ts = teamIsA ? lm.a_score : lm.b_score;
          const os = teamIsA ? lm.b_score : lm.a_score;
          const teamWon = teamIsA ? lm.a_win : lm.b_win;
          const oppWon = teamIsA ? lm.b_win : lm.a_win;
          const so = teamIsA ? (lm.a_so ?? lm.b_so) : (lm.b_so ?? lm.a_so);
          const result = ts === os ? (teamWon ? "W" : oppWon ? "L" : "D") : ts > os ? "W" : "L";
          if (!(slot.played && slot.team_score === ts && slot.opp_score === os)) {
            slot.team_score = ts; slot.opp_score = os;
            slot.penalty_kicks = so ?? slot.penalty_kicks;
            slot.result = result; slot.played = true; changed += 1;
          }
        }
      }

      // Record the winner/loser (from whatever source resolved the score) so the
      // next round can advance. Uses the final slot state, live or pre-existing.
      if (ownNum !== null && slot.played && (slot.result === "W" || slot.result === "L")
          && slot.team_slug !== null && slot.opp_slug !== null) {
        const teamSide: Side = { slug: slot.team_slug, name: slot.team_cur_name };
        const oppSide: Side = { slug: slot.opp_slug, name: slot.opp_cur_name };
        const teamWon = slot.result === "W";
        winnerBy.set(ownNum, teamWon ? teamSide : oppSide);
        loserBy.set(ownNum, teamWon ? oppSide : teamSide);
      }
    });
  }

  if (changed === 0) return bundle;
  return { ...bundle, knockout, live: { source: "espn" } };
}
