import "server-only";
import fs from "fs";
import path from "path";

// Weekly log of officeholder changes, written by scripts/leaders/apply_leader_change.py
// and the auto-apply step in scripts/leaders/refresh-current-leaders.py. Read from
// GitHub raw with ISR so a new change surfaces without a Vercel build.

export type LeaderChange = {
  date: string;
  slug: string;
  country: string;
  office: string;
  from: string | null;
  to: string;
  source?: string;
};
export type LeaderChanges = { updated?: string; changes: LeaderChange[] };

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/leaders/_changes.json";

function readLocal(): LeaderChanges | null {
  try {
    const p = path.join(process.cwd(), "public", "data", "leaders", "_changes.json");
    return JSON.parse(fs.readFileSync(p, "utf-8")) as LeaderChanges;
  } catch {
    return null;
  }
}

export async function getLeaderChanges(): Promise<LeaderChanges> {
  if (process.env.NODE_ENV !== "production") {
    const local = readLocal();
    if (local) return local;
  }
  try {
    const r = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (r.ok) return (await r.json()) as LeaderChanges;
  } catch {
    /* fall through to bundled copy */
  }
  return readLocal() ?? { changes: [] };
}
