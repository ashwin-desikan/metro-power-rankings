// Citizen of Nowhere Picks — pure game logic (client-safe: no server-only,
// no fs). Types mirror the prediction ledgers built by
// scripts/predictions/build_pl_sim.py / build_nfl_sim.py; grading here NEVER
// computes results — it joins stored picks against ledger entries the daily
// predictions workflow has already graded (result/score fields).
//
// Scoring (spec: PICKEM-SPEC.md):
//   Slate      — 10 pts per correct call (PL three-way H/D/A, NFL two-way H/A).
//   Confidence — the slot value (n..1) as a bonus on top of the base 10.
//   Radar      — +25 for siding with the source (model|market) whose
//                probability graded closer to the result (lower Brier).
//
// Lock rule: a game locks at kickoff when the ledger entry carries a kickoff
// timestamp (ISO UTC, emitted by the builders from ESPN event dates), and
// falls back to 00:00 UTC on its match date when it does not — old entries
// and any source that only knows the date. picked_at is stamped server-side
// by a Supabase trigger, so grading simply discards any pick stamped on or
// after the lock.

export type PickCode = "H" | "D" | "A";
export type RadarSide = "model" | "market";
export type PicksLeague = "pl" | "nfl";

export type LedgerEntry = {
  event_id?: string; // NFL (ESPN); PL entries key on date:home_slug
  date: string; // ISO yyyy-mm-dd
  kickoff?: string; // ISO UTC datetime, when the builder knows it
  home: string;
  away: string;
  home_slug: string;
  away_slug: string;
  model: { pH: number; pD?: number; pA?: number };
  market?: { pH: number };
  blend?: { pH: number };
  pick: PickCode;
  predicted_at?: string;
  result?: PickCode | "T";
  score?: string;
};

export type LedgerFile = {
  meta: { season: number | string; generated_at: string };
  ledger: LedgerEntry[];
};

export type StoredPick = {
  league: PicksLeague;
  season: string;
  event_key: string;
  mode: "slate" | "radar";
  pick: PickCode | RadarSide;
  confidence: number | null;
  picked_at: string; // ISO timestamptz
};

export const SLATE_POINTS = 10;
export const RADAR_POINTS = 25;
export const RADAR_SIZE = 5;

export function eventKey(league: PicksLeague, e: LedgerEntry): string {
  return league === "nfl" && e.event_id ? e.event_id : `${e.date}:${e.home_slug}`;
}

/** Kickoff when the ledger carries it; else 00:00 UTC on match day. */
export function lockTime(e: LedgerEntry): number {
  if (e.kickoff) {
    const t = Date.parse(e.kickoff);
    if (Number.isFinite(t)) return t;
  }
  return Date.parse(`${e.date}T00:00:00Z`);
}

export function isLocked(e: LedgerEntry, now: number): boolean {
  return now >= lockTime(e);
}

/** A pick counts only if it was stamped strictly before the game locked. */
export function pickIsValid(p: StoredPick, e: LedgerEntry): boolean {
  const t = Date.parse(p.picked_at);
  return Number.isFinite(t) && t < lockTime(e);
}

/** Probability the model assigns to a given slate pick. */
export function pickProb(league: PicksLeague, e: LedgerEntry, pick: PickCode): number {
  if (league === "pl") {
    if (pick === "H") return e.model.pH;
    if (pick === "A") return e.model.pA ?? 0;
    return e.model.pD ?? 0;
  }
  return pick === "H" ? e.model.pH : 1 - e.model.pH;
}

/** Ties (NFL "T") grade nobody correct; treat as a miss for both sides. */
function slateCorrect(pick: PickCode | RadarSide, e: LedgerEntry): boolean {
  return e.result != null && e.result !== "T" && pick === e.result;
}

export type SlateGrade = {
  points: number; // slate base + confidence bonus
  basePoints: number;
  confidencePoints: number;
  wins: number;
  losses: number;
  graded: number;
  bestStreak: number;
  currentStreak: number;
  modelWins: number;
  modelLosses: number;
};

/**
 * Grade a user's slate picks (both leagues together) against the ledgers.
 * Streaks run over graded games in (date, event_key) order. Picks stamped
 * after lock are discarded entirely — they neither score nor break a streak.
 */
export function gradeSlate(
  picks: StoredPick[],
  ledgers: Partial<Record<PicksLeague, LedgerEntry[]>>,
): SlateGrade {
  const byKey = new Map<string, StoredPick>();
  for (const p of picks) {
    if (p.mode === "slate") byKey.set(`${p.league}:${p.event_key}`, p);
  }
  const games: { league: PicksLeague; e: LedgerEntry }[] = [];
  for (const league of ["pl", "nfl"] as const) {
    for (const e of ledgers[league] ?? []) games.push({ league, e });
  }
  games.sort((a, b) => {
    const k1 = `${a.e.date}:${eventKey(a.league, a.e)}`;
    const k2 = `${b.e.date}:${eventKey(b.league, b.e)}`;
    return k1 < k2 ? -1 : k1 > k2 ? 1 : 0;
  });

  const g: SlateGrade = {
    points: 0, basePoints: 0, confidencePoints: 0, wins: 0, losses: 0,
    graded: 0, bestStreak: 0, currentStreak: 0, modelWins: 0, modelLosses: 0,
  };
  for (const { league, e } of games) {
    if (e.result == null) continue;
    if (slateCorrect(e.pick, e)) g.modelWins++;
    else g.modelLosses++;
    const p = byKey.get(`${league}:${eventKey(league, e)}`);
    if (!p || !pickIsValid(p, e)) continue;
    g.graded++;
    if (slateCorrect(p.pick, e)) {
      g.wins++;
      g.basePoints += SLATE_POINTS;
      if (p.confidence != null && p.confidence > 0) g.confidencePoints += p.confidence;
      g.currentStreak++;
      if (g.currentStreak > g.bestStreak) g.bestStreak = g.currentStreak;
    } else {
      g.losses++;
      g.currentStreak = 0;
    }
  }
  g.points = g.basePoints + g.confidencePoints;
  return g;
}

/** The N NFL games where model and market disagree most (needs market). */
export function radarGames(nfl: LedgerEntry[], n: number = RADAR_SIZE): (LedgerEntry & { gap: number })[] {
  return nfl
    .filter((e) => e.market)
    .map((e) => ({ ...e, gap: Math.abs(e.model.pH - (e.market as { pH: number }).pH) }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, n);
}

/** Which source graded closer (lower Brier) on a finished game. */
export function radarVerdict(e: LedgerEntry): RadarSide | "push" | null {
  if (e.result == null || e.result === "T" || !e.market) return null;
  const y = e.result === "H" ? 1 : 0;
  const bModel = (e.model.pH - y) ** 2;
  const bMarket = (e.market.pH - y) ** 2;
  if (bModel < bMarket) return "model";
  if (bMarket < bModel) return "market";
  return "push";
}

/**
 * Grade stored radar picks against ANY market-carrying ledger entry, not the
 * current top-5: the top-5 is recomputed from live odds every refresh, so a
 * pick made when a game was on the radar must not stop counting because the
 * gaps reshuffled underneath it. The UI still only offers the current top-5;
 * this only widens grading.
 */
export function gradeRadar(picks: StoredPick[], nfl: LedgerEntry[]): { points: number; wins: number; losses: number } {
  const byKey = new Map<string, LedgerEntry>();
  for (const e of nfl) byKey.set(eventKey("nfl", e), e);
  let points = 0, wins = 0, losses = 0;
  for (const p of picks) {
    if (p.mode !== "radar" || p.league !== "nfl") continue;
    const e = byKey.get(p.event_key);
    if (!e || !pickIsValid(p, e)) continue;
    const v = radarVerdict(e); // null without market or result; push scores nothing
    if (v == null || v === "push") continue;
    if (p.pick === v) { points += RADAR_POINTS; wins++; }
    else losses++;
  }
  return { points, wins, losses };
}

export type LeaderboardRow = {
  userId: string;
  name: string;
  points: number;
  wins: number;
  losses: number;
  bestStreak: number;
};

/** Grade every user's rows into a sorted leaderboard. */
export function computeLeaderboard(
  rows: (StoredPick & { user_id: string })[],
  names: Map<string, string>,
  ledgers: Partial<Record<PicksLeague, LedgerEntry[]>>,
): LeaderboardRow[] {
  const byUser = new Map<string, StoredPick[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }
  const out: LeaderboardRow[] = [];
  for (const [userId, picks] of byUser) {
    const s = gradeSlate(picks, ledgers);
    const r = gradeRadar(picks, ledgers.nfl ?? []);
    out.push({
      userId,
      name: names.get(userId) ?? "Anonymous",
      points: s.points + r.points,
      wins: s.wins + r.wins,
      losses: s.losses + r.losses,
      bestStreak: s.bestStreak,
    });
  }
  out.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  return out;
}
