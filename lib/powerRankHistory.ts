import "server-only";
import fs from "fs";
import path from "path";

/**
 * Rank history for the Nowhere 100, assembled from the dated snapshots in
 * `public/data/power-ranking-history/`.
 *
 * The board already showed a one-step delta against the previous snapshot. That
 * answers "did they move" and not "which way have they been going", which is the
 * question a returning reader actually has. Twelve snapshots exist; this turns
 * them into a per-person series the row can draw.
 *
 * Matching is on the snapshot's own `bare` field (lower-cased name) because the
 * live entry's `name` carries decoration glyphs (⚠, 👑) that the snapshot does
 * not. `bareName()` is exported so the call site normalises the same way; if the
 * two ever drift the series simply comes back empty rather than wrong.
 *
 * Absent people are gaps, not zeros: someone outside the hundred in an older
 * snapshot has no rank that week, and Sparkline skips nulls rather than drawing
 * a plunge to the axis.
 */

const DIR = path.join(process.cwd(), "public", "data", "power-ranking-history");

export function bareName(name: string): string {
  return name
    .replace(/[⚠\u{1F451}]️?/gu, "")
    .trim()
    .toLowerCase();
}

export type RankHistory = {
  /** Snapshot dates, oldest first. */
  dates: string[];
  /** bare name -> rank per snapshot, aligned to `dates`; null where absent. */
  series: Record<string, (number | null)[]>;
};

let cached: RankHistory | null = null;

export function getPowerRankHistory(): RankHistory {
  if (cached) return cached;
  let files: string[] = [];
  try {
    files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  } catch {
    cached = { dates: [], series: {} };
    return cached;
  }
  const dates: string[] = [];
  const perFile: Record<string, number>[] = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8"));
      const rows: { bare?: string; name?: string; rank?: number }[] = j?.ranking ?? [];
      if (!rows.length) continue;
      const m: Record<string, number> = {};
      for (const r of rows) {
        const key = r.bare ? r.bare.trim().toLowerCase() : r.name ? bareName(r.name) : "";
        if (key && typeof r.rank === "number") m[key] = r.rank;
      }
      dates.push(j?.asOf ?? f.replace(/\.json$/, ""));
      perFile.push(m);
    } catch {
      // a corrupt snapshot is a gap, not a build failure
    }
  }
  const keys = new Set<string>();
  for (const m of perFile) for (const k of Object.keys(m)) keys.add(k);
  const series: Record<string, (number | null)[]> = {};
  for (const k of keys) series[k] = perFile.map((m) => (k in m ? m[k] : null));
  cached = { dates, series };
  return cached;
}
