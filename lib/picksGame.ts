// Citizen of Nowhere Picks — pure game logic (client-safe: no server-only,
// no fs). Types mirror the prediction ledgers built by
// scripts/predictions/build_pl_sim.py / build_nfl_sim.py / build_cfb_sim.py; grading here NEVER
// computes results — it joins stored picks against ledger entries the daily
// predictions workflow has already graded (result/score fields).
//
// Scoring (spec: PICKEM-SPEC.md):
//   Slate      — 10 pts per correct call (PL three-way H/D/A, NFL and CFB
//                two-way H/A; the CFB slate is AP Top 25 games only).
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
export type PicksLeague = "pl" | "nfl" | "cfb" | "mlb";

export const ALL_LEAGUES = ["pl", "nfl", "cfb", "mlb"] as const;

export type LedgerEntry = {
  event_id?: string; // NFL (ESPN); PL entries key on date:home_slug
  date: string; // ISO yyyy-mm-dd
  kickoff?: string; // ISO UTC datetime, when the builder knows it
  home: string;
  away: string;
  home_slug: string;
  away_slug: string;
  ap?: { home: number | null; away: number | null }; // CFB: AP ranks at predict time
  neutral?: boolean; // CFB: neutral-site game ("vs", and no home edge in the model)
  model: { pH: number; pD?: number; pA?: number };
  market?: { pH: number };
  blend?: { pH: number };
  pick: PickCode;
  predicted_at?: string;
  result?: PickCode | "T";
  score?: string;
};

/** A postseason SERIES entry (MLB October): the winner is locked before Game 1
 *  for a bigger payout, then the games themselves run as an ordinary slate.
 *  `home` is the higher seed. `model.pH` is the probability the higher seed
 *  takes the series; `result` is the series winner once it ends. */
export type SeriesEntry = {
  series_id: string; // stable id from the builder (e.g. "2026-ALDS-nyy-bos")
  round: string; // "WC" | "DS" | "CS" | "WS"
  date: string; // Game 1 date, ISO yyyy-mm-dd
  kickoff?: string; // Game 1 first pitch, ISO UTC — the series lock
  home: string;
  away: string;
  home_slug: string;
  away_slug: string;
  model: { pH: number };
  result?: "H" | "A";
};

export type LedgerFile = {
  meta: { season: number | string; generated_at: string };
  ledger: LedgerEntry[];
  series?: SeriesEntry[];
};

export type StoredPick = {
  league: PicksLeague;
  season: string;
  event_key: string;
  mode: "slate" | "radar" | "series";
  pick: PickCode | RadarSide;
  confidence: number | null;
  picked_at: string; // ISO timestamptz
};

export const SLATE_POINTS = 10;
export const RADAR_POINTS = 25;
export const SERIES_POINTS = 25;
export const RADAR_SIZE = 5;
export const RADAR_LEAGUES = ["nfl", "cfb"] as const;

export function eventKey(league: PicksLeague, e: LedgerEntry): string {
  // NFL and CFB ledgers key on the ESPN event id; PL keys on date:home_slug
  // (changing PL's key would orphan every stored pick).
  return league !== "pl" && e.event_id ? e.event_id : `${e.date}:${e.home_slug}`;
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
  for (const league of ALL_LEAGUES) {
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

/** The N games of one ledger where model and market disagree most. */
export function radarGames(nfl: LedgerEntry[], n: number = RADAR_SIZE): (LedgerEntry & { gap: number })[] {
  return nfl
    .filter((e) => e.market)
    .map((e) => ({ ...e, gap: Math.abs(e.model.pH - (e.market as { pH: number }).pH) }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, n);
}

export type RadarGame = { league: PicksLeague; e: LedgerEntry & { gap: number } };

/** The combined cross-league radar: the biggest model-market gaps across
 *  every radar-eligible league (NFL + CFB), sized to n. */
export function radarBoard(
  ledgers: Partial<Record<PicksLeague, LedgerEntry[]>>,
  n: number = RADAR_SIZE,
): RadarGame[] {
  const out: RadarGame[] = [];
  for (const league of RADAR_LEAGUES) {
    for (const e of radarGames(ledgers[league] ?? [], Number.MAX_SAFE_INTEGER)) {
      out.push({ league, e });
    }
  }
  out.sort((a, b) => b.e.gap - a.e.gap);
  return out.slice(0, n);
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
export function gradeRadar(
  picks: StoredPick[],
  ledgers: Partial<Record<PicksLeague, LedgerEntry[]>>,
): { points: number; wins: number; losses: number } {
  const byKey = new Map<string, LedgerEntry>();
  for (const league of RADAR_LEAGUES) {
    for (const e of ledgers[league] ?? []) byKey.set(`${league}:${eventKey(league, e)}`, e);
  }
  let points = 0, wins = 0, losses = 0;
  for (const p of picks) {
    if (p.mode !== "radar") continue;
    const e = byKey.get(`${p.league}:${p.event_key}`);
    if (!e || !pickIsValid(p, e)) continue;
    const v = radarVerdict(e); // null without market or result; push scores nothing
    if (v == null || v === "push") continue;
    if (p.pick === v) { points += RADAR_POINTS; wins++; }
    else losses++;
  }
  return { points, wins, losses };
}

// --- series (MLB postseason) ------------------------------------------------

/** The stored event_key convention for a series pick: `series:<round>:<id>`.
 *  Namespaced so a series pick can never collide with a game pick, and the
 *  Supabase PK (user_id, league, season, event_key, mode) stays sufficient. */
export function seriesKey(s: SeriesEntry): string {
  return `series:${s.round}:${s.series_id}`;
}

/** A series locks at first pitch of Game 1 (00:00 UTC on Game 1 day without one). */
export function seriesLockTime(s: SeriesEntry): number {
  if (s.kickoff) {
    const t = Date.parse(s.kickoff);
    if (Number.isFinite(t)) return t;
  }
  return Date.parse(`${s.date}T00:00:00Z`);
}

export function seriesPickIsValid(p: StoredPick, s: SeriesEntry): boolean {
  const t = Date.parse(p.picked_at);
  return Number.isFinite(t) && t < seriesLockTime(s);
}

/** Grade stored series picks: SERIES_POINTS per correct pre-lock call. */
export function gradeSeries(
  picks: StoredPick[],
  series: Partial<Record<PicksLeague, SeriesEntry[]>>,
): { points: number; wins: number; losses: number } {
  const byKey = new Map<string, SeriesEntry>();
  for (const league of ALL_LEAGUES) {
    for (const s of series[league] ?? []) byKey.set(`${league}:${seriesKey(s)}`, s);
  }
  let points = 0, wins = 0, losses = 0;
  for (const p of picks) {
    if (p.mode !== "series") continue;
    const s = byKey.get(`${p.league}:${p.event_key}`);
    if (!s || s.result == null || !seriesPickIsValid(p, s)) continue;
    if (p.pick === s.result) { points += SERIES_POINTS; wins++; }
    else losses++;
  }
  return { points, wins, losses };
}

// --- Brier ------------------------------------------------------------------
// The same axis as the NFL expectation board (lib/nflExpectation): a tie
// scores 0.5 to each side, exactly as the century ledger does.

export type BrierLine = { games: number; brier: number | null };

function outcomeY(result: PickCode | "T", side: "H" | "A"): number {
  if (result === "T") return 0.5;
  return result === side ? 1 : 0;
}

/** Season-to-date Brier of a ledger source over its graded two-way games. */
export function ledgerBrier(entries: LedgerEntry[], source: RadarSide): BrierLine {
  let n = 0, sum = 0;
  for (const e of entries) {
    if (e.result == null) continue;
    const p = source === "model" ? e.model.pH : e.market?.pH;
    if (p == null) continue;
    sum += (p - outcomeY(e.result, "H")) ** 2;
    n++;
  }
  return { games: n, brier: n ? sum / n : null };
}

/**
 * A reader's Brier over their graded slate picks. A hard pick is a probability
 * of 1 on the chosen side, so it scores 0 when right, 1 when wrong and 0.25 on
 * a tie — which is what puts a reader on the same axis as the model, the
 * market, and every season back to 1920 on the expectation board.
 */
export function userPicksBrier(
  picks: StoredPick[],
  ledgers: Partial<Record<PicksLeague, LedgerEntry[]>>,
  league?: PicksLeague,
): BrierLine {
  const byKey = new Map<string, LedgerEntry>();
  for (const lg of ALL_LEAGUES) {
    if (league && lg !== league) continue;
    for (const e of ledgers[lg] ?? []) byKey.set(`${lg}:${eventKey(lg, e)}`, e);
  }
  let n = 0, sum = 0;
  for (const p of picks) {
    if (p.mode !== "slate") continue;
    if (league && p.league !== league) continue;
    const e = byKey.get(`${p.league}:${p.event_key}`);
    if (!e || e.result == null || !pickIsValid(p, e)) continue;
    if (e.result === "T") sum += 0.25;
    else sum += p.pick === e.result ? 0 : 1;
    n++;
  }
  return { games: n, brier: n ? sum / n : null };
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
  series: Partial<Record<PicksLeague, SeriesEntry[]>> = {},
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
    const r = gradeRadar(picks, ledgers);
    const sr = gradeSeries(picks, series);
    out.push({
      userId,
      name: names.get(userId) ?? "Anonymous",
      points: s.points + r.points + sr.points,
      wins: s.wins + r.wins + sr.wins,
      losses: s.losses + r.losses + sr.losses,
      bestStreak: s.bestStreak,
    });
  }
  out.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  return out;
}
