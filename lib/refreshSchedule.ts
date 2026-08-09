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
  return loadLiveJson<RefreshSchedule>("refresh-schedule.json");
}
