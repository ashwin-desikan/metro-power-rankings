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
  second?: { name: string; role: string };
};

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/leaders/_current.json";

export async function getCurrentLeaderOverlay(): Promise<Record<string, CurrentLeader>> {
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 604800 } }); // weekly
    if (!res.ok) return {};
    return (await res.json()) as Record<string, CurrentLeader>;
  } catch {
    return {};
  }
}
