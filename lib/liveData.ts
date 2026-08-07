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

function readLocal<T>(relPath: string): T | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", ...relPath.split("/")), "utf-8"),
    ) as T;
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
