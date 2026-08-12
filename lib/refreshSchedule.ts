import "server-only";

// Runtime read via lib/liveData: mac-mini-jobs/export_schedule.py regenerates
// and commits this after every dispatcher tick (~every 10 minutes), so it is
// never more than a few minutes stale relative to jobs.toml or state.json.
// Enforced by scripts/check-live-data.mjs.
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
  next_run: string | null;
  last_run: {
    date: string | null;
    status: string | null;
    slot: string | null;
  };
};

export type RefreshSchedule = {
  generated_at: string;
  jobs: ScheduledJob[];
};

export async function getRefreshSchedule(): Promise<RefreshSchedule | null> {
  // Explicit 0 = do not use the Data Cache for this fetch. loadLiveJson's
  // default is LIVE_DATA_REVALIDATE (3600), which is right for its other five
  // callers (weekly data) and wrong here: the dispatcher rewrites this file
  // every ~10 minutes and the payload is countdown-shaped (next_run/last_run),
  // so an hour-old copy reads as visibly broken rather than merely stale.
  // Paired with `export const dynamic = "force-dynamic"` on the page, which is
  // what stops the Full Route Cache serving a prerendered copy over the top.
  // Floor on freshness is raw.githubusercontent.com's own ~5-minute CDN TTL,
  // not anything this app controls.
  return loadLiveJson<RefreshSchedule>("refresh-schedule.json", 0);
}
