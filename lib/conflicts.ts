import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Interstate wars since 1945 (Wikipedia). A monthly GitHub Action regenerates
// public/data/conflicts.json and commits it with [vercel skip]; pages read it
// here via ISR from GitHub raw (monthly revalidate) with a build-time fallback,
// so updates appear without a Vercel deploy.

export type Belligerent = { name: string; slug: string | null; principal: boolean };
export type War = {
  name: string;
  url: string;
  start: string | null;
  end: string | null;
  ongoing: boolean;
  major: boolean;
  deathsMin: number | null;
  deathsMax: number | null;
  sideA: Belligerent[];
  sideB: Belligerent[];
};
type ConflictsFile = { generated: string; source: string; count: number; wars: War[] };

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/conflicts.json";

export async function getConflicts(): Promise<War[]> {
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 3600 } }); // 30 days
    if (res.ok) {
      const d = (await res.json()) as ConflictsFile;
      if (d?.wars?.length) return d.wars;
    }
  } catch {
    /* fall through to build-time copy */
  }
  try {
    const d = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "conflicts.json"), "utf-8"),
    ) as ConflictsFile;
    return d.wars ?? [];
  } catch {
    return [];
  }
}

export type CountryWar = {
  war: War;
  side: "A" | "B";
  opponents: Belligerent[];
  allies: Belligerent[];
};

export function conflictsForCountry(wars: War[], slug: string): CountryWar[] {
  const out: CountryWar[] = [];
  for (const w of wars) {
    const inA = w.sideA.some((b) => b.slug === slug);
    const inB = w.sideB.some((b) => b.slug === slug);
    if (inA)
      out.push({ war: w, side: "A", opponents: w.sideB, allies: w.sideA.filter((b) => b.slug !== slug) });
    else if (inB)
      out.push({ war: w, side: "B", opponents: w.sideA, allies: w.sideB.filter((b) => b.slug !== slug) });
  }
  out.sort((a, b) => (b.war.start ?? "").localeCompare(a.war.start ?? ""));
  return out;
}

export function countryHasConflicts(wars: War[], slug: string): boolean {
  return wars.some(
    (w) => w.sideA.some((b) => b.slug === slug) || w.sideB.some((b) => b.slug === slug),
  );
}

export function warYears(w: War): string {
  const s = w.start ? w.start.slice(0, 4) : "?";
  if (w.ongoing) return `${s}–present`;
  const e = w.end ? w.end.slice(0, 4) : "";
  return e && e !== s ? `${s}–${e}` : s;
}

export function fmtDeaths(w: War): string {
  const f = (n: number | null) => (n == null ? "" : n.toLocaleString("en-US"));
  if (w.deathsMin == null) return "—";
  if (w.deathsMax == null || w.deathsMax === w.deathsMin) return `${f(w.deathsMin)}+`;
  return `${f(w.deathsMin)}–${f(w.deathsMax)}`;
}
