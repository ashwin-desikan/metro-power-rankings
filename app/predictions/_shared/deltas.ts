import type { NflSimHistorySnapshotRow } from "@/lib/nflSim";

// Pure helpers over a league's sim-history file (public/data/<league>-sim-history.json).
// Shared across NFL/CFB/MLB/PL: every league's history file has the same
// OUTER shape (one snapshot per calendar date, keyed by team/club slug) but
// each league's snapshot ROW carries its own short field names (NFL/CFB use
// "po"/"title"; MLB adds "pennant"; PL uses "xpts"/"top4"/"rel" instead of
// "xw"/"div"). deltaSince/series are therefore generic over the row shape -
// TypeScript infers it structurally from whatever history file is passed in,
// so NFL's SimHistoryFile keeps working unchanged and each other league
// supplies its own row type from its own lib/<league>Sim.ts.

export type HistorySnapshotOf<TRow extends Record<string, number>> = {
  date: string;
  games_played: number;
  rows: Record<string, TRow>;
};

export type SimHistoryFileOf<TRow extends Record<string, number>> = {
  meta: { league: string; season: number | string; generated_at: string; keep: number };
  snapshots: HistorySnapshotOf<TRow>[];
};

/** Back-compat alias: NFL's existing key set, used only by callers that
 *  don't care which league's history they hold. */
export type HistoryKey = keyof NflSimHistorySnapshotRow;

/**
 * Change in `key` for `slug` between the newest snapshot and the latest
 * snapshot at least `days` days older than it. Falls back to the previous
 * snapshot that carries the slug/key (whatever its age) when nothing is old
 * enough, and to null when there is no such snapshot at all.
 */
export function deltaSince<TRow extends Record<string, number>>(
  history: SimHistoryFileOf<TRow> | null | undefined,
  slug: string,
  key: keyof TRow & string,
  days: number,
): number | null {
  const snaps = history?.snapshots ?? [];
  if (snaps.length < 2) return null;
  const latest = snaps[snaps.length - 1];
  const latestVal = latest.rows[slug]?.[key];
  if (latestVal == null) return null;

  const latestMs = Date.parse(`${latest.date}T00:00:00Z`);
  if (Number.isNaN(latestMs)) return null;
  const thresholdMs = latestMs - days * 86_400_000;

  let baseline: TRow | undefined;
  let fallback: TRow | undefined;
  for (let i = snaps.length - 2; i >= 0; i--) {
    const s = snaps[i];
    const ms = Date.parse(`${s.date}T00:00:00Z`);
    if (Number.isNaN(ms)) continue;
    const row = s.rows[slug];
    if (!row || row[key] == null) continue;
    if (!fallback) fallback = row; // nearest snapshot carrying this slug/key
    if (ms <= thresholdMs) {
      baseline = row;
      break;
    }
  }
  const base = baseline ?? fallback;
  if (!base || base[key] == null) return null;
  return Math.round((latestVal - base[key]) * 10) / 10;
}

/** Full time series of `key` for `slug`, in chronological order, for a sparkline. */
export function series<TRow extends Record<string, number>>(
  history: SimHistoryFileOf<TRow> | null | undefined,
  slug: string,
  key: keyof TRow & string,
): number[] {
  const snaps = history?.snapshots ?? [];
  const out: number[] = [];
  for (const s of snaps) {
    const v = s.rows[slug]?.[key];
    if (v != null) out.push(v);
  }
  return out;
}
