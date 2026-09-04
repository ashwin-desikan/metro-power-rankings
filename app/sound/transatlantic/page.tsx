import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';

interface M { slug: string; metro: string; us_score: number; uk_score: number; combined: number; lenses: { origin: unknown | null } }
async function load(): Promise<M[]> { return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'metros_unified.json'), 'utf8')); }
export const metadata = { title: 'The Transatlantic Divide: Sound of the Metros' };
const muted = { color: 'var(--text-muted)' } as const;

export default async function TransatlanticPage() {
  const all = (await load()).filter((m) => m.lenses.origin && m.us_score + m.uk_score >= 40);
  const lean = (m: M) => (m.us_score - m.uk_score) / (m.us_score + m.uk_score);
  const usLean = [...all].sort((a, b) => lean(b) - lean(a)).slice(0, 12);
  const ukLean = [...all].sort((a, b) => lean(a) - lean(b)).slice(0, 12);
  const pts = [...all].sort((a, b) => (b.us_score + b.uk_score) - (a.us_score + a.uk_score)).slice(0, 45);
  const maxV = Math.max(...pts.map((m) => Math.max(m.us_score, m.uk_score)), 1);
  const S = 380, PAD = 34;
  const X = (v: number) => PAD + (v / maxV) * (S - PAD * 1.5);
  const Y = (v: number) => S - PAD - (v / maxV) * (S - PAD * 1.5);
  const labelSet = new Set(['New York', 'London', 'Los Angeles', 'Detroit', 'Liverpool', 'Atlanta', 'Nashville', 'Manchester', 'Toronto', 'Glasgow', 'Chicago', 'Dublin']);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SoundNav />
      <h1 className="text-2xl font-bold tracking-tight">The Transatlantic Divide</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm" style={muted}>
        Every metro placed by its US chart score (right) against its UK score (up). Points above the diagonal are UK-facing; points below it are US-facing. It is the whole US-versus-UK question in one picture.
      </p>
      <div className="grid gap-8 md:grid-cols-2">
        <svg viewBox={`0 0 ${S} ${S}`} className="w-full" style={{ maxWidth: 460 }}>
          <line x1={PAD} y1={S - PAD} x2={S - PAD * 0.5} y2={S - PAD} stroke="var(--border, #333)" />
          <line x1={PAD} y1={S - PAD} x2={PAD} y2={PAD * 0.5} stroke="var(--border, #333)" />
          <line x1={X(0)} y1={Y(0)} x2={X(maxV)} y2={Y(maxV)} stroke="var(--border, #333)" strokeDasharray="3 3" />
          <text x={S - PAD} y={S - 8} textAnchor="end" fontSize="10" fill="var(--text-muted)">US score &rarr;</text>
          <text x={10} y={PAD} fontSize="10" fill="var(--text-muted)">UK &uarr;</text>
          {pts.map((m) => {
            const show = labelSet.has(m.metro);
            return (
              <g key={m.slug}>
                <circle cx={X(m.us_score)} cy={Y(m.uk_score)} r={show ? 4 : 2.5} fill={m.us_score >= m.uk_score ? '#4f9dff' : '#c98bff'} opacity={0.85} />
                {show && <text x={X(m.us_score) + 5} y={Y(m.uk_score) + 3} fontSize="9" fill="var(--text)">{m.metro}</text>}
              </g>
            );
          })}
        </svg>
        <div className="grid grid-cols-2 gap-6">
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: '#4f9dff' }}>Most US-facing</h2>
            <ol className="space-y-0.5 text-sm">{usLean.map((m) => (
              <li key={m.slug}><a href={`/rankings/${m.slug}`} className="hover:underline">{m.metro}</a></li>))}</ol>
          </section>
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: '#c98bff' }}>Most UK-facing</h2>
            <ol className="space-y-0.5 text-sm">{ukLean.map((m) => (
              <li key={m.slug}><a href={`/rankings/${m.slug}`} className="hover:underline">{m.metro}</a></li>))}</ol>
          </section>
        </div>
      </div>
    </main>
  );
}
