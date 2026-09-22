import fs from "fs";
import path from "path";
import { ELECTION_HUBS } from "./electionHubsMeta";

/**
 * Completed elections, for the "Just voted" board on /elections.
 *
 * The file is built by scripts/build-elections-recent.py out of the 67
 * per-country `public/data/<code>-elections.json` files. It exists so this
 * page reads ONE small file rather than importing 67 lib modules and bundling
 * 5.1 MB into the route.
 *
 * The file holds three years and the WINDOW IS APPLIED HERE, at render time,
 * so it slides with the clock. The page revalidates, so the board stays
 * truthful without a rebuild; a rebuild is only needed when a result is filed.
 */
export type RecentElection = {
  code: string;
  date: string;          // ISO, the day the election CONCLUDED
  precision: "day" | "month" | "year";
  dateText: string;      // the source's own wording, which is what we print
  label: string | null;
  kind: string | null;
  seatLeader: string | null;
  seatLeaderSeats: number | null;
  seatLeaderShare: number | null;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  summary: string | null;
  unfree: boolean | null;
  caveat: string | null;
};

export type RecentElectionRow = RecentElection & {
  name: string;
  flag: string;
  href: string;
  /** true when the seat leader cleared the chamber's own majority line. */
  majority: boolean | null;
  /**
   * The hub's standing note ("Managed elections"). `unfree` on the election
   * records is unset across every file checked, so it is not what marks a
   * managed system; the hub note is.
   */
  note: string | null;
};

type File = {
  /** `_meta.asOf` is the shape scripts/check-data-currency.mjs reads. */
  _meta?: { asOf?: string; source?: string; keepYears?: number };
  elections: RecentElection[];
};

function load(): File | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "elections-recent.json"), "utf-8"),
    ) as File;
  } catch {
    return null; // not built yet: the section simply does not render
  }
}

/**
 * Completed elections within `windowDays`, newest first.
 *
 * A row is only returned when its country has a hub to link to, because a
 * board of results you cannot open is a dead end rather than a feature.
 */
export function getRecentElections(windowDays = 183, today = new Date()): RecentElectionRow[] {
  const file = load();
  if (!file) return [];
  const floor = new Date(today.getTime() - windowDays * 86400000)
    .toISOString()
    .slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  const out: RecentElectionRow[] = [];
  for (const e of file.elections) {
    if (e.date < floor || e.date > todayIso) continue;
    const hub = ELECTION_HUBS[e.code];
    if (!hub) continue;
    out.push({
      ...e,
      name: hub.name,
      flag: hub.flag,
      href: hub.href,
      note: hub.note ?? null,
      majority:
        e.seatLeaderSeats != null && e.majoritySeats != null
          ? e.seatLeaderSeats >= e.majoritySeats
          : null,
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.code.localeCompare(b.code)));
  return out;
}

export function recentBuiltOn(): string | null {
  return load()?._meta?.asOf ?? null;
}
