import "server-only";

// Centralised ESPN fetch with a committed-snapshot fallback.
//
// WHY (2026-08-05): on the night of 04 Aug every render-time ESPN fetch from
// Vercel failed for 7+ hours straight, so MLB, WNBA, MLS, NFL and the CFB
// polls silently vanished from /sports/standings and the franchise pages.
// Measured, not assumed: the same requests succeeded from a residential
// vantage and from GitHub-runner IPs (wnba-refresh.yml pulls ESPN daily),
// while a spoofed browser User-Agent gets 403'd even residentially -- so the
// custom UA is not the trigger; ESPN scores Vercel's egress IPs. Every
// consumer wrapped its fetch in `catch { return empty }` with no logging,
// which is why monitoring showed nothing while whole sections evaporated.
//
// The fix has two halves:
//  1. This helper warn-logs every live-fetch failure (so runtime logs show
//     the failure class from now on), then falls back to the latest snapshot
//     committed by .github/workflows/espn-standings-snapshot.yml from a
//     GitHub runner -- read via GitHub raw + ISR like every other committed
//     bundle on this site.
//  2. Consumers keep their own shapers and empty fallbacks; a null return
//     here means both the live and snapshot paths failed.

const GH_RAW_SNAPSHOTS =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/espn-snapshots";

// Snapshot freshness is bounded by the workflow cadence (every 3h), so this
// window only controls how quickly a NEW snapshot commit is noticed.
const SNAPSHOT_REVALIDATE_SECONDS = 900;

type SnapshotWrapper = { fetched_at?: string; url?: string; body?: unknown };

export async function fetchEspnJson(
  url: string,
  snapshotKey: string,
  revalidateSeconds: number,
): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      // 5-second timeout caps the failure cost when ESPN is slow or down.
      signal: AbortSignal.timeout(5000),
      next: { revalidate: revalidateSeconds },
      headers: {
        // Deliberately NOT a browser UA: ESPN 403s bare browser-UA requests
        // that lack real browser TLS/header fingerprints (verified 2026-08-05
        // from a residential vantage; the custom UA got 200 from the same IP).
        "User-Agent": "rankings-citizen-of-nowhere/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[espn] live fetch failed (${snapshotKey}): ${msg}; trying snapshot`);
  }
  try {
    const res = await fetch(`${GH_RAW_SNAPSHOTS}/${snapshotKey}.json`, {
      next: { revalidate: SNAPSHOT_REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const wrapped = (await res.json()) as SnapshotWrapper;
    if (wrapped && typeof wrapped === "object" && wrapped.body != null) {
      return wrapped.body;
    }
    throw new Error("snapshot wrapper missing body");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[espn] snapshot fallback failed (${snapshotKey}): ${msg}`);
    return null;
  }
}
