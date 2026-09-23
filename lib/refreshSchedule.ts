import "server-only";

// Runtime read via lib/liveData: mac-mini-jobs/export_schedule.py regenerates
// this after every dispatcher tick (~every 10 minutes), but it now COMMITS only
// when something real changed, because the payload no longer carries anything
// that moves on its own. Enforced by scripts/check-live-data.mjs.
import { loadLiveJson } from "@/lib/liveData";

export type JobCadence = "daily" | "weekly" | "monthly";

export type ScheduledJob = {
  id: string;
  label: string;
  schedule_text: string;
  cadence: JobCadence;
  times: string[];
  weekdays: number[];
  months: number[];
  days_of_month: number[];
  last_run: {
    date: string | null;
    status: string | null;
  };
};

export type RefreshSchedule = {
  /** A DATE, not an instant. See export_schedule.py: a full timestamp here
   *  rewrote the file on every dispatcher tick. */
  generated_on: string;
  jobs: ScheduledJob[];
};

export async function getRefreshSchedule(): Promise<RefreshSchedule | null> {
  // Explicit 0 = do not use the Data Cache for this fetch. loadLiveJson's
  // default is LIVE_DATA_REVALIDATE (3600), which is right for its other five
  // callers (weekly data). Kept at 0 here, though the original reason no longer
  // applies: the payload used to be countdown-shaped (next_run ticking down),
  // and is not any more. What is still live is last_run.status, which is the
  // one thing a reader checks this page to see, and the document is small.
  // Paired with `export const dynamic = "force-dynamic"` on the page, which is
  // what stops the Full Route Cache serving a prerendered copy over the top.
  // Floor on freshness is raw.githubusercontent.com's own ~5-minute CDN TTL,
  // not anything this app controls.
  return loadLiveJson<RefreshSchedule>("refresh-schedule.json", 0);
}
