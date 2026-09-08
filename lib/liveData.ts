import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Shared loader for data that a scheduled job refreshes out of band.
//
// THE BUG THIS EXISTS TO PREVENT (found twice independently, 2026-08-07):
// a lib that reads public/data with a build-time readFileSync, fed by a refresh
// script that self-tags [vercel skip], produces data that is committed and never
// reaches a reader until some unrelated build happens to land. It fails silently:
// no error, no warning, no staleness alert. The site just serves old numbers.
//
// Before this, the same fix had been written twice by hand, in lib/powerRanking.ts
// and lib/screen.ts, and applied to exactly one file each while four other
// verticals stayed broken. This is that pattern, once, so the next vertical gets
// it for free and scripts/check-live-data.mjs can verify it mechanically.
//
// Contract: in production the GitHub raw copy leads, on an ISR revalidate
// interval, so a [vercel skip] data commit goes live without a deploy. The
// bundled file is the fallback if the fetch fails. In development the local
// working copy leads, so unpushed data renders on localhost.

const GH_RAW_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/";

/** Default revalidate: one hour. Every current caller refreshes weekly at most. */
export const LIVE_DATA_REVALIDATE = 3600;

// Every current caller's relPath is one of these known, literal shapes:
// "<dir>/<file>.json" (a fixed name) or "<dir>/<subdir>/<slug>.json" (one
// dynamic leaf). Each branch below puts every literal directory segment
// directly in its own join() call and only the leaf is dynamic, so the
// Vercel file tracer scopes a route to that one directory instead of all of
// public/data. See scripts/DATA-READS-RECIPE.md.
//
// Adding a new loadLiveJson() call site for an existing or new directory
// needs a matching branch here -- an unrecognised relPath returns null.
function readLocal<T>(relPath: string): T | null {
  try {
    const cwd = process.cwd();
    if (relPath === "basketball/nations.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "basketball", "nations.json"), "utf-8"));
    if (relPath === "basketball/hub.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "basketball", "hub.json"), "utf-8"));
    if (relPath === "basketball/fiba_ranking.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "basketball", "fiba_ranking.json"), "utf-8"));
    if (relPath.startsWith("basketball/nation-detail/"))
      return JSON.parse(
        readFileSync(
          join(cwd, "public", "data", "basketball", "nation-detail", relPath.slice("basketball/nation-detail/".length)),
          "utf-8",
        ),
      );
    if (relPath === "cricket/teams.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "cricket", "teams.json"), "utf-8"));
    if (relPath === "cricket/hub.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "cricket", "hub.json"), "utf-8"));
    if (relPath.startsWith("cricket/team-detail/"))
      return JSON.parse(
        readFileSync(
          join(cwd, "public", "data", "cricket", "team-detail", relPath.slice("cricket/team-detail/".length)),
          "utf-8",
        ),
      );
    if (relPath === "rugby-union/teams.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "rugby-union", "teams.json"), "utf-8"));
    if (relPath === "rugby-union/hub.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "rugby-union", "hub.json"), "utf-8"));
    if (relPath.startsWith("rugby-union/team-detail/"))
      return JSON.parse(
        readFileSync(
          join(cwd, "public", "data", "rugby-union", "team-detail", relPath.slice("rugby-union/team-detail/".length)),
          "utf-8",
        ),
      );
    if (relPath === "wbasketball/nations.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "wbasketball", "nations.json"), "utf-8"));
    if (relPath === "wbasketball/hub.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "wbasketball", "hub.json"), "utf-8"));
    if (relPath === "wbasketball/fiba_ranking.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "wbasketball", "fiba_ranking.json"), "utf-8"));
    if (relPath.startsWith("wbasketball/nation-detail/"))
      return JSON.parse(
        readFileSync(
          join(cwd, "public", "data", "wbasketball", "nation-detail", relPath.slice("wbasketball/nation-detail/".length)),
          "utf-8",
        ),
      );
    if (relPath === "sound/metros_unified.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "sound", "metros_unified.json"), "utf-8"));
    if (relPath === "sound/metro_number_ones.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "sound", "metro_number_ones.json"), "utf-8"));
    if (relPath === "refresh-schedule.json")
      return JSON.parse(readFileSync(join(cwd, "public", "data", "refresh-schedule.json"), "utf-8"));
    return null;
  } catch {
    return null;
  }
}

/**
 * Load a public/data JSON that is refreshed out of band.
 *
 * @param relPath  path under public/data, forward-slashed, e.g. "rugby-union/teams.json"
 * @param revalidate  ISR interval in seconds; defaults to LIVE_DATA_REVALIDATE
 *
 * Returns null when the file is absent both remotely and locally. Callers must
 * treat null as "no data yet", never as an error, exactly as the previous
 * existsSync-guarded readFileSync helpers did.
 */
export async function loadLiveJson<T>(
  relPath: string,
  revalidate: number = LIVE_DATA_REVALIDATE,
): Promise<T | null> {
  if (process.env.NODE_ENV !== "production") {
    const local = readLocal<T>(relPath);
    if (local !== null) return local;
  }
  try {
    const r = await fetch(GH_RAW_BASE + relPath, { next: { revalidate } });
    if (r.ok) return (await r.json()) as T;
  } catch {
    /* fall through to the bundled copy */
  }
  return readLocal<T>(relPath);
}
