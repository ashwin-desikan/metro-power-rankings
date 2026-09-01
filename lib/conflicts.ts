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
  civil?: boolean | null; // notable civil wars, labelled as such
  home?: string | null; // civil wars: the country whose war it is (chips attach only there)
  deathsMin: number | null;
  deathsMax: number | null;
  sideA: Belligerent[];
  sideB: Belligerent[];
};
type ConflictsFile = { generated: string; source: string; count: number; wars: War[] };

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/conflicts.json";

// Post-merge curation, applied to local and remote rows alike so it survives
// the monthly refresh. Renames fix scrape artefacts; drops remove rows that a
// curated local entry supersedes (the Iraq War entry covers the invasion).
const NAME_FIX: Record<string, string> = {
  "Russo-Ukrainian War (outline)": "Russo-Ukrainian War",
};
// Each drop names the curated row that supersedes it. The drop only applies
// when that row is actually present: on 2026-09-01 the curated "Iraq War" entry
// was wiped by a refresh and this rule then deleted the only remaining record of
// the 2003 invasion. A superseding rule must check that it is superseding
// something.
const SUPERSEDED: Record<string, string> = { "2003 invasion of Iraq": "Iraq War" };

function curate(wars: War[]): War[] {
  const present = new Set(wars.map((w) => NAME_FIX[w.name] ?? w.name));
  const seen = new Set<string>();
  const out: War[] = [];
  for (const w of wars) {
    const name = NAME_FIX[w.name] ?? w.name;
    const supersededBy = SUPERSEDED[name];
    if ((supersededBy && present.has(supersededBy)) || seen.has(name)) continue;
    seen.add(name);
    out.push(name === w.name ? w : { ...w, name });
  }
  return out;
}

export async function getConflicts(): Promise<War[]> {
  // The committed local file carries the full 1500-present dataset; the GitHub
  // raw feed is the monthly-refreshed modern era (the Action regenerates the
  // since-1945 list). Merge them: remote wins on name matches so deaths and
  // ongoing flags stay fresh, and the pre-1945 history always survives.
  let local: War[] = [];
  try {
    const d = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "conflicts.json"), "utf-8"),
    ) as ConflictsFile;
    local = d.wars ?? [];
  } catch {
    /* no build-time copy */
  }
  let remote: War[] = [];
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 3600 } }); // 30 days
    if (res.ok) {
      const d = (await res.json()) as ConflictsFile;
      remote = d?.wars ?? [];
    }
  } catch {
    /* offline: local only */
  }
  if (!remote.length) return curate(local);
  const remoteNames = new Set(remote.map((w) => w.name));
  const merged = curate([...remote, ...local.filter((w) => !remoteNames.has(w.name))]);
  merged.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  return merged;
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
