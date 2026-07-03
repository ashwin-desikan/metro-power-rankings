import fs from "fs";
import path from "path";
import { flagUrl } from "@/lib/flags";

export type PowerRow = { slug: string; share: number | null; rank: number | null; tier: string; lat?: number | null; rec?: number | null };
export type NamePeriod = { name: string; start: string | null; end: string | null };
export type PowerLabel = { slug: string; base: string; flag: string | null; hist: NamePeriod[]; href: string | null };
export type PowerData = {
  years: number[];
  byYear: Record<string, PowerRow[]>;
  labels: Record<string, PowerLabel>;
  meta: { method: string; sources: string[]; tiers: string[] };
};

function read<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf8")) as T; } catch { return null; }
}

let _cache: PowerData | null = null;

export function getPowerHistory(): PowerData {
  if (_cache) return _cache;
  const base = path.join(process.cwd(), "public", "data");
  const ph = read<{ years: number[]; byYear: Record<string, PowerRow[]>; meta: PowerData["meta"] }>(
    path.join(base, "power-history.json"),
  );
  const names = read<Record<string, Array<{ name: string; start?: string; end?: string }>>>(
    path.join(base, "leaders", "_names.json"),
  ) ?? {};
  const defunct = read<Record<string, { name: string; href?: string }>>(path.join(base, "leaders", "_defunct.json")) ?? {};
  const countriesRaw = read<unknown>(path.join(base, "countries.json"));
  const crows = (Array.isArray(countriesRaw) ? countriesRaw : (countriesRaw as { countries?: unknown[] })?.countries ?? []) as Array<{ slug?: string; name?: string }>;
  const cname: Record<string, string> = {};
  for (const c of crows) if (c?.slug) cname[c.slug] = c.name ?? c.slug;

  const empty: PowerData = { years: [], byYear: {}, labels: {}, meta: { method: "", sources: [], tiers: [] } };
  if (!ph) return empty;

  const slugs = new Set<string>();
  for (const arr of Object.values(ph.byYear)) for (const r of arr) slugs.add(r.slug);

  const labels: Record<string, PowerLabel> = {};
  for (const s of slugs) {
    const isDefunct = !!defunct[s];
    labels[s] = {
      slug: s,
      base: cname[s] ?? defunct[s]?.name ?? s,
      flag: flagUrl(s),
      hist: (names[s] ?? []).map((n) => ({ name: n.name, start: n.start ?? null, end: n.end ?? null })),
      href: isDefunct ? null : (cname[s] ? `/countries/${s}` : null),
    };
  }
  _cache = { years: ph.years, byYear: ph.byYear, labels, meta: ph.meta };
  return _cache;
}

export type PowerPoint = { year: number; rank: number; share: number | null; tier: string; lat: number | null; rec: number | null };

/** This entity's power standing across every year it was ranked (chronological). */
export function getCountryPowerSeries(slug: string): PowerPoint[] {
  const d = getPowerHistory();
  const out: PowerPoint[] = [];
  for (const y of d.years) {
    const row = (d.byYear[String(y)] ?? []).find((r) => r.slug === slug);
    if (row) out.push({ year: y, rank: row.rank ?? 0, share: row.share, tier: row.tier, lat: (row as { lat?: number | null }).lat ?? null, rec: (row as { rec?: number | null }).rec ?? null });
  }
  return out;
}

/** Present-day (latest year) power share/rank/tier keyed by slug, for the directory. */
export function getCurrentPowerBySlug(): Record<string, { share: number | null; rank: number; tier: string }> {
  const d = getPowerHistory();
  const yr = d.years[d.years.length - 1];
  const out: Record<string, { share: number | null; rank: number; tier: string }> = {};
  for (const r of d.byYear[String(yr)] ?? []) out[r.slug] = { share: r.share, rank: r.rank ?? 0, tier: r.tier };
  return out;
}
