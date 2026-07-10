import fs from 'fs';
import path from 'path';

// Sound of the Metros data for the main metro page. Reads the pre-built JSON
// in public/data/sound once and caches it for the process.
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

function load() {
  if (_uni) return;
  const base = path.join(process.cwd(), 'public', 'data', 'sound');
  const arr = JSON.parse(fs.readFileSync(path.join(base, 'metros_unified.json'), 'utf8')) as UnifiedMetro[];
  _uni = Object.fromEntries(arr.map((m) => [m.slug, m]));
  _no1 = JSON.parse(fs.readFileSync(path.join(base, 'metro_number_ones.json'), 'utf8')) as Record<string, No1Doc>;
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

export function getSoundForMetro(slug: string): MetroSound | null {
  load();
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
