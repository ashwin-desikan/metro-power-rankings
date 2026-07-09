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
  description: 'The producer-driven, studio-luxe adult-pop economy of 1974 to 1989, read as a map of studios from Los Angeles to Tokyo rather than a genre.',
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
        <p className="mt-1 text-sm" style={muted}>The producer's map, 1974 to 1989. Los Angeles to Tokyo.</p>
      </header>

      <div className="max-w-2xl space-y-4 text-[15px] leading-relaxed">
        <p>
          Velvet Rock is a name for the studio-luxe, mid-tempo, harmonically rich pop that
          &ldquo;yacht rock&rdquo; flattened into a Southern California beach cliché. The better frame
          is not a sound but a map: the places where the records were actually made. And that map is
          not an Atlantic one. It is a Pacific rim.
        </p>
        <p>
          Four primary capitals carried the tracking and mixing: Los Angeles, New York, London, and
          Tokyo. The first three are the familiar story. The fourth is the one the Anglo-American
          telling leaves out, and it belongs on equal footing. Through the back half of the 1970s and
          deep into the bubble-economy 1980s, Tokyo built the same machine, elite rooms, a closed guild
          of session players, and label budgets that rivalled anything in Burbank, and aimed it at the
          same reference records.
        </p>
        <p>
          That is not a coincidence of taste. In 1976 POPEYE magazine sold Japanese youth a Californian
          daydream, and its soundtrack was AOR: Boz Scaggs, Ned Doheny, the jazz-schooled soft rock of
          Steely Dan and the Doobie Brothers. A generation of Tokyo musicians absorbed the
          major-seventh harmony and the flawless-take discipline and handed it back sharper. Sugar
          Babe&rsquo;s &ldquo;SONGS&rdquo; (1975) lit the fuse; Tatsuro Yamashita became the scene&rsquo;s
          Quincy Jones, producing and arranging across it; and the canon that followed, his own
          &ldquo;For You,&rdquo; Mariya Takeuchi&rsquo;s &ldquo;Variety,&rdquo; Anri&rsquo;s
          &ldquo;Timely!!,&rdquo; is Velvet Rock in every particular but language. The loop even closed
          physically: &ldquo;Variety&rdquo; was tracked partly at A&amp;M in Los Angeles, in the same
          rooms as the Atlantic capitals.
        </p>
        <p>
          Around the four poles sat the specialists and the outposts. Three specialists supplied the
          edges: the country-house studios of Bath and Somerset (the Wool Hall, Ashcombe House),
          Philadelphia&rsquo;s Sigma Sound for R&amp;B and quiet storm, and Stockholm&rsquo;s Polar
          Studios, which a decade later became the Cheiron pop factory. Two island studios punched far
          above their size: Compass Point in Nassau (Chris Blackwell, 1977) and AIR Montserrat at Salem
          (George Martin, 1979).
        </p>
        <p>
          The Atlantic story has a hard end. On 17 September 1989 Hurricane Hugo destroyed the
          Montserrat studio, and within five years the digital sampler, New Jack Swing, and the home
          project studio dissolved the economics that paid for all of it. The Pacific pole faded too,
          and then, uniquely, came back. In 2017 the YouTube algorithm began pushing a fan upload of
          Takeuchi&rsquo;s &ldquo;Plastic Love&rdquo; to millions who had never heard the phrase city
          pop, and the genre became raw material for vaporwave and future funk. Velvet Rock&rsquo;s
          Atlantic half died at Hugo. Its Pacific half got a second life.
        </p>
        <p style={{ color: gold }}>
          Yacht rock, sophisti-pop, quiet storm, and city pop were never separate genres. They were one
          geography, and it ringed the Pacific as surely as the Atlantic.
        </p>
      </div>

      {/* Capital Index */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>The Velvet Rock Capital Index</h2>
        {/* Mobile: stacked cards instead of a 4-column table forced wide by min-w */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {capitals.map((m) => (
            <div key={m.slug} className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #1b2330)' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium leading-tight">{m.metro}</div>
                  <div className="text-xs" style={muted}>{m.country}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-semibold tabular-nums" style={{ color: gold }}>{m.lenses.production!.index}</div>
                  <div className="text-[11px]" style={muted}>{m.lenses.production!.tier}</div>
                </div>
              </div>
              <div className="mt-1.5 text-xs" style={muted}>{m.lenses.production!.note}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto hidden sm:block">
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
        </div>
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
          <p className="mb-2 text-xs" style={muted}>Centroid of the {sig.n_tracks} Master Tape tracks with available audio features.</p>
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
