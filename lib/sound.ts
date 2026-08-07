import { loadLiveJson } from '@/lib/liveData';

// Sound of the Metros data for the main metro page.
//
// Read at RUNTIME via lib/liveData, not with a build-time readFileSync. The
// weekly sound refresh (mac-mini-jobs/run-sound-weekly.sh) commits this JSON
// with [vercel skip], so a build-baked read means the refresh never reaches a
// reader until an unrelated deploy lands. See scripts/check-live-data.mjs,
// which fails CI if this file goes back to readFileSync.
let _uni: Record<string, UnifiedMetro> | null = null;
let _no1: Record<string, No1Doc> | null = null;

interface UnifiedMetro {
  slug: string;
  metro: string;
  combined: number;
  us_score: number;
  uk_score: number;
  signature_decade?: string | null;
  top_artists?: { name: string; combined: number }[];
  lenses: { origin: { rank?: number } | null };
}
interface No1Doc { metro: string; count: number; number_ones: { single: string; artist: string; charts: string; year: number }[] }

async function load() {
  if (_uni) return;
  const arr = (await loadLiveJson<UnifiedMetro[]>('sound/metros_unified.json')) ?? [];
  _no1 = (await loadLiveJson<Record<string, No1Doc>>('sound/metro_number_ones.json')) ?? {};
  _uni = Object.fromEntries(arr.map((m) => [m.slug, m]));
}

export interface MetroSound {
  metro: string;
  rank?: number;
  combined: number;
  us: number;
  uk: number;
  signatureDecade?: string | null;
  topArtists: { name: string; combined: number }[];
  numberOnes: { single: string; artist: string; charts: string; year: number }[];
  numberOnesCount: number;
}

export async function getSoundForMetro(slug: string): Promise<MetroSound | null> {
  await load();
  const m = _uni![slug];
  if (!m || !m.lenses?.origin) return null;
  const n = _no1![slug];
  return {
    metro: m.metro,
    rank: m.lenses.origin.rank,
    combined: m.combined,
    us: m.us_score,
    uk: m.uk_score,
    signatureDecade: m.signature_decade,
    topArtists: (m.top_artists ?? []).slice(0, 8),
    numberOnes: (n?.number_ones ?? []).slice().sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    numberOnesCount: n?.count ?? 0,
  };
}
