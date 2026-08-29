// Pure derivation over the api-football continental-comp bundle (LiveComp):
// no fs, no fetch — safe to unit test and to import from server components.
//
// Two jobs, both born 2026-08-29 when the 2026-27 UEFA league phases were
// drawn but api-football's /standings endpoint still returned nothing for
// leagues 2/3/848 (checked in Supabase football_standings: zero rows, while
// the fixtures endpoint already carried all 144/… league-phase pairings):
//
//  1. deriveLeaguePhaseGroups — the hub pages and /sports/standings want a
//     table as soon as the 36 teams are known. Use the real standings rows
//     when the bundle has them; otherwise COMPUTE the table from the comp's
//     own league-phase fixtures (zeros before matchday 1, real W/D/L/GD/Pts
//     from finished fixtures after — points 3/1/0). The computed table's
//     tiebreak is pts, gd, gf, name; api ranks take over the moment the
//     real standings appear upstream.
//
//  2. deriveCompEntries — the Libertadores/NBA/NHL-style round-by-round
//     "alive vs eliminated" view, derived entirely from fixtures so it needs
//     no workbook row. The tournament hub uses it only when the curated
//     workbook entries (european-tournaments.json current_entries) don't yet
//     cover the season — the workbook stays the source of truth when present.

import type { LiveComp, LiveFixture, LiveGroup, LiveRow, LiveTeamRef } from "@/lib/clubFootballLive";

export const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

// Ordered shallow -> deep. Matches api-football round strings seen in the
// bundle for UEFA comps ("1st Qualifying Round", "Play-offs", "Group Stage",
// "Knockout Round Play-offs", "Round of 16", …) and the CONMEBOL spellings.
export type StageKey =
  | "qualifying" | "qualifying_playoffs" | "league_phase"
  | "knockout_playoffs" | "round_of_16" | "quarterfinal" | "semifinal" | "final";

const STAGES: Array<{ key: StageKey; label: string; match: (round: string) => boolean }> = [
  { key: "qualifying",         label: "Qualifying",          match: (r) => /qualifying|preliminary/i.test(r) },
  { key: "qualifying_playoffs", label: "Qualifying play-offs", match: (r) => /^play-?offs?$/i.test(r.trim()) },
  { key: "league_phase",       label: "League phase",        match: (r) => /group stage|league (phase|stage)/i.test(r) },
  { key: "knockout_playoffs",  label: "Knockout play-offs",  match: (r) => /knockout.*play-?offs?/i.test(r) },
  { key: "round_of_16",        label: "Round of 16",         match: (r) => /round of 16|1\/8/i.test(r) },
  { key: "quarterfinal",       label: "Quarter-finals",      match: (r) => /quarter/i.test(r) },
  { key: "semifinal",          label: "Semi-finals",         match: (r) => /semi/i.test(r) },
  { key: "final",              label: "Final",               match: (r) => /^final$/i.test(r.trim()) },
];

export function stageIndexOf(round: string | null): number {
  if (!round) return -1;
  // Scan deep -> shallow so "Knockout Round Play-offs" hits its own stage
  // before the qualifying "Play-offs" pattern could ever see it.
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (STAGES[i].match(round)) return i;
  }
  return -1;
}

export function stageLabel(i: number): string {
  return STAGES[i]?.label ?? "";
}

const teamKey = (t: LiveTeamRef): string | null =>
  t.team_id != null ? String(t.team_id) : (t.name ? `n:${t.name}` : null);

const teamKnown = (t: LiveTeamRef): boolean => teamKey(t) !== null;

// ---------------------------------------------------------------- tables ----

/** Real standings if the bundle has them; otherwise a table computed from the
 *  comp's league-phase fixtures. `computed` tells the caller which it got so
 *  captions can say so. Empty groups when the league phase isn't drawn yet. */
export function deriveLeaguePhaseGroups(comp: LiveComp): { groups: LiveGroup[]; computed: boolean } {
  if (comp.groups.length > 0) return { groups: comp.groups, computed: false };

  const lp = (comp.fixtures ?? []).filter((f) => stageIndexOf(f.round) ===
    STAGES.findIndex((s) => s.key === "league_phase"));
  if (lp.length === 0) return { groups: [], computed: true };

  type Acc = LiveRow & { _key: string };
  const rows = new Map<string, Acc>();
  const touch = (t: LiveTeamRef): Acc | null => {
    const k = teamKey(t);
    if (k === null) return null;
    let r = rows.get(k);
    if (!r) {
      r = { _key: k, team_id: t.team_id, name: t.name, lookup: t.lookup, country: t.country,
            rank: null, played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0, gd: 0, points: 0, form: null };
      rows.set(k, r);
    }
    return r;
  };

  for (const f of lp) {
    const h = touch(f.home);
    const a = touch(f.away);
    if (!h || !a) continue;
    const done = f.status && FINISHED_STATUSES.has(f.status) && f.home_goals != null && f.away_goals != null;
    if (!done) continue;
    const hg = f.home_goals as number, ag = f.away_goals as number;
    h.played = (h.played ?? 0) + 1; a.played = (a.played ?? 0) + 1;
    h.gf = (h.gf ?? 0) + hg; h.ga = (h.ga ?? 0) + ag;
    a.gf = (a.gf ?? 0) + ag; a.ga = (a.ga ?? 0) + hg;
    if (hg > ag) { h.win = (h.win ?? 0) + 1; a.lose = (a.lose ?? 0) + 1; h.points = (h.points ?? 0) + 3; }
    else if (hg < ag) { a.win = (a.win ?? 0) + 1; h.lose = (h.lose ?? 0) + 1; a.points = (a.points ?? 0) + 3; }
    else { h.draw = (h.draw ?? 0) + 1; a.draw = (a.draw ?? 0) + 1; h.points = (h.points ?? 0) + 1; a.points = (a.points ?? 0) + 1; }
  }

  const list = Array.from(rows.values());
  for (const r of list) r.gd = (r.gf ?? 0) - (r.ga ?? 0);
  list.sort((a, b) =>
    (b.points ?? 0) - (a.points ?? 0) ||
    (b.gd ?? 0) - (a.gd ?? 0) ||
    (b.gf ?? 0) - (a.gf ?? 0) ||
    String(a.lookup ?? a.name ?? "").localeCompare(String(b.lookup ?? b.name ?? "")));
  list.forEach((r, i) => { r.rank = i + 1; });
  const groups: LiveGroup[] = [{ group_label: "League phase", rows: list.map(({ _key, ...r }) => r) }];
  return { groups, computed: true };
}

// --------------------------------------------------------------- bracket ----

export type DerivedEntry = {
  key: string;
  name: string | null;
  lookup: string | null;
  stage: number;           // deepest stage index the team has a fixture in
  alive: boolean;
  champion: boolean;
};

export type DerivedBracket = {
  stages: Array<{ index: number; label: string; alive: DerivedEntry[]; eliminated: DerivedEntry[] }>;
  aliveCount: number;
  totalCount: number;
  champion: DerivedEntry | null;
};

/** Round-by-round alive/eliminated view straight from the comp's fixtures.
 *  A team's depth is the deepest stage it has a NAMED fixture in; the
 *  frontier is the deepest stage with any fully named fixture. Teams at the
 *  frontier are alive, shallower teams are eliminated where they stopped.
 *  League-phase top-8 byes (skip the knockout play-offs straight to the R16)
 *  are kept alive through the play-off frontier via the standings ranks in
 *  `groups` — pass the REAL groups only; the computed zeros table has no
 *  meaningful top 8 (callers pass [] before the official table exists). */
export function deriveCompBracket(comp: LiveComp, rankedGroups: LiveGroup[] = []): DerivedBracket | null {
  const fixtures = comp.fixtures ?? [];
  const byTeam = new Map<string, DerivedEntry>();
  let frontier = -1;

  for (const f of fixtures) {
    const si = stageIndexOf(f.round);
    if (si < 0) continue;
    const named = teamKnown(f.home) && teamKnown(f.away);
    if (named && si > frontier) frontier = si;
    for (const t of [f.home, f.away]) {
      const k = teamKey(t);
      if (k === null) continue;
      const e = byTeam.get(k);
      if (!e) byTeam.set(k, { key: k, name: t.name, lookup: t.lookup, stage: si, alive: false, champion: false });
      else if (si > e.stage) e.stage = si;
    }
  }
  if (byTeam.size === 0 || frontier < 0) return null;

  for (const e of byTeam.values()) e.alive = e.stage === frontier;

  // League-phase byes: while the knockout play-offs are the frontier, the top
  // 8 of the official table are already through to the R16 and must stay alive.
  const koIdx = STAGES.findIndex((s) => s.key === "knockout_playoffs");
  const lpIdx = STAGES.findIndex((s) => s.key === "league_phase");
  if (frontier === koIdx) {
    const ranked = rankedGroups.flatMap((g) => g.rows)
      .filter((r) => r.rank != null && r.rank <= 8);
    for (const r of ranked) {
      const e = byTeam.get(teamKey(r) ?? "");
      if (e && e.stage === lpIdx) e.alive = true;
    }
  }

  // Champion: the final has a decisive finished result. A PEN result carries
  // level goals in this bundle, so it stays undecided here rather than guessed;
  // the curated workbook entries take over the hub as soon as they cover the
  // season, so a shoot-out final is a caption-level gap, not a wrong champion.
  let champion: DerivedEntry | null = null;
  const finIdx = STAGES.length - 1;
  const fin = fixtures.find((f) => stageIndexOf(f.round) === finIdx &&
    f.status && FINISHED_STATUSES.has(f.status) &&
    f.home_goals != null && f.away_goals != null && f.home_goals !== f.away_goals);
  if (fin) {
    const winner = (fin.home_goals as number) > (fin.away_goals as number) ? fin.home : fin.away;
    const loser = winner === fin.home ? fin.away : fin.home;
    const w = byTeam.get(teamKey(winner) ?? "");
    const l = byTeam.get(teamKey(loser) ?? "");
    if (w) { w.champion = true; w.alive = true; champion = w; }
    if (l) l.alive = false;
  }

  const entries = Array.from(byTeam.values());
  const cmp = (a: DerivedEntry, b: DerivedEntry) =>
    String(a.lookup ?? a.name ?? "").localeCompare(String(b.lookup ?? b.name ?? ""));
  const stages = STAGES.map((s, i) => ({
    index: i,
    label: s.label,
    alive: entries.filter((e) => e.stage === i && e.alive).sort(cmp),
    eliminated: entries.filter((e) => e.stage === i && !e.alive).sort(cmp),
  })).filter((s) => s.alive.length > 0 || s.eliminated.length > 0);

  return {
    stages,
    aliveCount: entries.filter((e) => e.alive).length,
    totalCount: entries.length,
    champion,
  };
}
