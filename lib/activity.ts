import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The Site Activity feed: a granular, auto-generated log of what changed on the
// site and when (data refreshes, hub edits, new hubs, fixes), derived from git
// history by scripts/build-activity-feed.py. Complements /updates (lib/releases.ts),
// which is the curated, human-written release log.

export type ActivityCategory = "data" | "hub" | "fix" | "new-hub";

export type ActivityEntry = {
  date: string; // ISO yyyy-mm-dd
  category: ActivityCategory;
  hub: string | null;
  text: string;
  commit: string;
};

export type ActivityFeed = {
  generatedAt: string;
  count: number;
  entries: ActivityEntry[];
};

const ACTIVITY_GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/activity-feed.json";

function readLocalActivity(): ActivityFeed | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "activity-feed.json"), "utf-8"),
    ) as ActivityFeed;
  } catch {
    return null;
  }
}

// ISR-from-raw (mirrors lib/screen.ts): the daily activity-feed job commits the JSON
// with [vercel skip], so the page must read the GitHub raw copy on its revalidate
// interval rather than a build-baked readFileSync — otherwise new entries never show
// without a Vercel build. Dev prefers the local working copy so unpushed data renders.
export async function getActivityFeed(): Promise<ActivityFeed | null> {
  if (process.env.NODE_ENV !== "production") {
    const local = readLocalActivity();
    if (local) return local;
  }
  try {
    const r = await fetch(ACTIVITY_GH_RAW, { next: { revalidate: 3600 } });
    if (r.ok) return (await r.json()) as ActivityFeed;
  } catch {
    /* fall through */
  }
  return readLocalActivity();
}
