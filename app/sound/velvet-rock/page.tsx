import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';

async function readJSON<T>(rel: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', rel), 'utf8')) as T;
}

interface Prod { slug: string; metro: string; country?: string; lenses: { production: { index: number; tier: string; note: string } | null } }
interface Aff { slug: string; metro: string; vr_tracks: number; vr_artists: number }
interface Sig { n_tracks: number; signature: Record<string, { mean: number; sd: number }> }

const muted = { color: 'var(--text-muted)' } as const;
const gold = '#ffb64f';

export const metadata = {
  title: 'Velvet Rock — The Sound of the Metros',
  description: 'The transatlantic, producer-driven adult-pop economy of 1974 to 1989, read as a map of studios rather than a genre.',
};

export default async function VelvetRockPage() {
  const [metros, aff, sig] = await Promise.all([
    readJSON<Prod[]>('metros_unified.json'),
    readJSON<Aff[]>('velvet_rock_by_metro.json'),
    readJSON<Sig>('velvet_rock_signature.json'),
  ]);
  const capitals = metros.filter((m) => m.lenses.production).sort((a, b) => b.lenses.production!.index - a.lenses.production!.index);
  const s = sig.signature;
  const feat = (k: string) => (s[k] ? s[k].mean : 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SoundNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Velvet Rock</h1>
        <p className="mt-1 text-sm" style={muted}>The producer's map, 1974 to 1989.</p>
      </header>

      <div className="max-w-2xl space-y-4 text-[15px] leading-relaxed">
        <p>
          Velvet Rock is a name for the studio-luxe, mid-tempo, harmonically rich pop that
          &ldquo;yacht rock&rdquo; flattened into a Southern California beach cliché. The better frame
          is not a sound but a map: eight places where the records were actually made.
        </p>
        <p>
          Three primary capitals carried the tracking and mixing: Los Angeles, New York, London.
          Three specialists supplied the edges: the country-house studios of Bath and Somerset
          (the Wool Hall, Ashcombe House), Philadelphia&rsquo;s Sigma Sound for R&amp;B and quiet storm,
          and Stockholm&rsquo;s Polar Studios, which a decade later became the Cheiron pop factory. Two
          island outposts punched far above their size: Compass Point in Nassau (Chris Blackwell, 1977)
          and AIR Montserrat at Salem (George Martin, 1979).
        </p>
        <p>
          The era has a hard end. On 17 September 1989 Hurricane Hugo destroyed the Montserrat studio,
          and within five years the digital sampler, New Jack Swing, and the home project studio had
          dissolved the economics that paid for all of it.
        </p>
        <p style={{ color: gold }}>
          Yacht rock, sophisti-pop, and quiet storm were never separate genres. They were one geography.
        </p>
      </div>

      {/* Capital Index */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>The Velvet Rock Capital Index</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left" style={muted}>
              <th className="py-2 pr-3 text-right">Index</th>
              <th className="py-2 pr-3">Capital</th>
              <th className="py-2 pr-3">Tier</th>
              <th className="py-2 pr-3">Studios &amp; anchor records</th>
            </tr>
          </thead>
          <tbody>
            {capitals.map((m) => (
              <tr key={m.slug} className="border-t align-top" style={{ borderColor: 'var(--border, #1b2330)' }}>
                <td className="py-1.5 pr-3 text-right font-semibold tabular-nums" style={{ color: gold }}>{m.lenses.production!.index}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{m.metro}<span className="ml-1 text-xs" style={muted}>{m.country}</span></td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{m.lenses.production!.tier}</td>
                <td className="py-1.5 pr-3 text-xs" style={muted}>{m.lenses.production!.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs" style={muted}>
          Scored 0 to 100 on studio infrastructure, anchor records, producer and session-musician
          concentration, and capital disproportion, meaning how much a place&rsquo;s claim rests on this one
          industry under these conditions. Nassau and Brades score high on almost no local artists: the
          flown-in-labor case.
        </p>
      </section>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {/* Affinity by origin */}
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Which metros lean Velvet Rock</h2>
          <p className="mb-2 text-xs" style={muted}>By Master Tape tracks whose artists come from that metro.</p>
          <ol className="space-y-1 text-sm">
            {aff.slice(0, 12).map((a, i) => (
              <li key={a.slug} className="flex justify-between gap-2">
                <span><span className="mr-1 text-xs tabular-nums" style={muted}>{i + 1}</span>{a.metro}</span>
                <span className="tabular-nums" style={muted}>{a.vr_tracks} · {a.vr_artists} artists</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Sonic signature */}
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>The sonic signature</h2>
          <p className="mb-2 text-xs" style={muted}>Centroid of {sig.n_tracks} Master Tape tracks (Spotify audio features).</p>
          <ul className="space-y-1 text-sm">
            {[['Tempo', `${feat('tempo').toFixed(0)} BPM`], ['Valence (warmth)', feat('valence').toFixed(2)],
              ['Danceability', feat('danceability').toFixed(2)], ['Energy', feat('energy').toFixed(2)],
              ['Acousticness', feat('acousticness').toFixed(2)], ['Speechiness', feat('speechiness').toFixed(2)]].map(([k, v]) => (
              <li key={k} className="flex justify-between"><span style={muted}>{k}</span><span className="tabular-nums">{v}</span></li>
            ))}
          </ul>
        </section>
      </div>

      <p className="mt-8 text-xs" style={muted}>
        Adapted from the Velvet Rock manifesto. The full essay lives on Substack.
      </p>
    </main>
  );
}
