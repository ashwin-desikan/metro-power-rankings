import type { SimHistoryFile, NflSimHistorySnapshotRow } from "@/lib/nflSim";

// Pure helpers over a league's sim-history file (public/data/<league>-sim-history.json).
// Shared across NFL/CFB/MLB/PL so the history file shape stays uniform: one
// snapshot per calendar date, each keyed by team/club slug.

export type HistoryKey = keyof NflSimHistorySnapshotRow;

/**
 * Change in `key` for `slug` between the newest snapshot and the latest
 * snapshot at least `days` days older than it. Falls back to the previous
 * snapshot that carries the slug/key (whatever its age) when nothing is old
 * enough, and to null when there is no such snapshot at all.
 */
export function deltaSince(
  history: SimHistoryFile | null | undefined,
  slug: string,
  key: HistoryKey,
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

  let baseline: NflSimHistorySnapshotRow | undefined;
  let fallback: NflSimHistorySnapshotRow | undefined;
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
export function series(
  history: SimHistoryFile | null | undefined,
  slug: string,
  key: HistoryKey,
): number[] {
  const snaps = history?.snapshots ?? [];
  const out: number[] = [];
  for (const s of snaps) {
    const v = s.rows[slug]?.[key];
    if (v != null) out.push(v);
  }
  return out;
}
