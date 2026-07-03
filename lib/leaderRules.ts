// lib/leaderRules.ts
// Client-safe (no fs) pure helpers for resolving who held an office at a given
// time, shared by the /leaders directory. Role strings are the full forms used
// in the per-country history files ("Prime Minister", "President", ...).

export type HistRow = { n: string; r: string; s: string | null; e: string | null };

const ROLE_PRIORITY = [
  "Supreme Leader", "General Secretary", "President", "Chancellor",
  "Prime Minister", "Taoiseach", "Premier", "Monarch",
];
const HEAD_OF_GOV_PRIORITY = [
  "Supreme Leader", "General Secretary", "Chancellor", "Prime Minister",
  "Taoiseach", "Premier", "President", "Monarch",
];
export const PM_LED_COUNTRIES = new Set<string>([
  "germany", "poland", "austria", "czech-republic", "hungary", "greece",
  "portugal", "finland", "ethiopia", "iraq", "georgia", "croatia", "bulgaria",
  "bosnia-herzegovina", "montenegro", "slovenia", "slovakia", "lithuania",
]);
const GOV_ROLES = [
  "Supreme Leader", "General Secretary", "Chancellor",
  "Prime Minister", "Taoiseach", "Premier",
];
const HEAD_OF_STATE_TOKENS = [
  "Monarch", "Sovereign", "Emir", "Sultan", "King", "Queen", "Emperor", "President",
];

/** True if a term overlaps any part of the [start, end] window (month, day...). */
export function overlaps(h: HistRow, winStart: string, winEnd: string): boolean {
  return h.s != null && h.s <= winEnd && (h.e == null || h.e >= winStart);
}

/** All terms overlapping the window, in chronological order. */
export function activeIn(history: HistRow[], winStart: string, winEnd: string): HistRow[] {
  return history
    .filter((h) => overlaps(h, winStart, winEnd))
    .sort((a, b) => (a.s ?? "").localeCompare(b.s ?? ""));
}

/** Resolve the leading office over a window: every holder of the top-priority
 *  office active in that window (so a mid-window handover returns both), plus
 *  any ceremonial head(s) of state as the secondary slot. */
export function resolveWindow(
  history: HistRow[],
  slug: string,
  winStart: string,
  winEnd: string,
): { primaries: HistRow[]; seconds: HistRow[] } {
  const active = activeIn(history, winStart, winEnd);
  if (!active.length) return { primaries: [], seconds: [] };
  const order = PM_LED_COUNTRIES.has(slug) ? HEAD_OF_GOV_PRIORITY : ROLE_PRIORITY;
  let token: string | null = null;
  for (const role of order) {
    if (active.some((a) => a.r.includes(role))) { token = role; break; }
  }
  let primaries = token ? active.filter((a) => a.r.includes(token!)) : active.slice();
  const seen = new Set<string>();
  primaries = primaries.filter((p) => (seen.has(p.n) ? false : (seen.add(p.n), true)));

  let seconds: HistRow[] = [];
  const primaryIsGov = token != null && GOV_ROLES.some((r) => token!.includes(r));
  if (primaryIsGov) {
    for (const tok of HEAD_OF_STATE_TOKENS) {
      const hs = active.filter((a) => a.r.includes(tok) && !primaries.some((p) => p.n === a.n));
      if (hs.length) { seconds = hs; break; }
    }
  }
  return { primaries, seconds };
}

export function shortRole(role: string): string {
  return role
    .replace("Prime Minister", "PM")
    .replace("General Secretary", "Gen. Sec.")
    .replace("Supreme Leader", "Sup. Leader")
    .replace("Chancellor", "Chanc.")
    .replace("President", "Pres.");
}
