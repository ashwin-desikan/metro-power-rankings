import "server-only";

// Current-leader overlay for the countries directory.
// A weekly GitHub Action (.github/workflows/leaders-refresh.yml) regenerates
// public/data/leaders/_current.json from Wikidata and commits it with
// [vercel skip]. The countries hub fetches it here via ISR from GitHub raw, so
// a change of leader appears within the revalidate window with NO Vercel build.
// On any failure (e.g. before the first Action run, or a network hiccup) we
// return {} and the hub falls back to the build-time computation from the
// committed per-country history files.

export type CurrentLeader = {
  name: string;
  role: string;
  since?: string;
  second?: { name: string; role: string };
};

import { readFileSync } from "fs";
import { join } from "path";

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/leaders/_current.json";

function readLocalOverlay(): Record<string, CurrentLeader> | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "leaders", "_current.json"), "utf-8"),
    ) as Record<string, CurrentLeader>;
  } catch {
    return null;
  }
}

export async function getCurrentLeaderOverlay(): Promise<Record<string, CurrentLeader>> {
  // In development prefer the working copy, the same rule lib/powerRanking.ts
  // follows: an unpushed correction (Belgium's PM, a new warning flag) must be
  // visible on the dev server, not hidden behind the GitHub-raw copy of main.
  // Production keeps the raw fetch so the weekly refresh reaches the site
  // without a build, and falls back to the bundled copy when the fetch fails.
  if (process.env.NODE_ENV !== "production") {
    const local = readLocalOverlay();
    if (local) return local;
  }
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 3600 } }); // weekly
    if (!res.ok) return readLocalOverlay() ?? {};
    return (await res.json()) as Record<string, CurrentLeader>;
  } catch {
    return readLocalOverlay() ?? {};
  }
}
