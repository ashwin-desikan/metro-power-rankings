'use client';

import { useMemo } from 'react';
import { useSessionState } from '@/lib/useSessionState';

export interface RankMetro {
  slug: string;
  metro: string;
  country?: string;
  us_score: number;
  uk_score: number;
  combined: number;
  artist_count: number;
  signature_decade?: string | null;
  signature_over_index?: number;
  distinctiveness?: number;
  score_per_artist?: number;
  lenses: {
    origin: { rank?: number } | null;
    affinity: { vr_tracks: number; vr_artists: number; rank?: number };
    production: { index: number; tier: string; note: string; rank?: number } | null;
  };
}

type LensId = 'origin' | 'affinity' | 'production';
const COLOR: Record<LensId, string> = { origin: '#4f9dff', affinity: '#c98bff', production: '#ffb64f' };

const muted = { color: 'var(--text-muted)' } as const;

export default function RankingsLens({ metros }: { metros: RankMetro[] }) {
  const [lens, setLens] = useSessionState<LensId>('mpr.sound.rank.lens', 'origin');

  const rows = useMemo(() => {
    const val = (m: RankMetro) =>
      lens === 'origin' ? m.combined : lens === 'affinity' ? m.lenses.affinity.vr_tracks : m.lenses.production?.index ?? 0;
    return metros.filter((m) => val(m) > 0).sort((a, b) => val(b) - val(a));
  }, [metros, lens]);

  return (
    <div>
      <div className="mb-4 inline-flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border, #222b36)' }}>
        {(['origin', 'affinity', 'production'] as LensId[]).map((id) => {
          const on = lens === id;
          const label = id === 'origin' ? 'Origin' : id === 'affinity' ? 'Velvet Rock affinity' : 'Production';
          return (
            <button
              key={id}
              type="button"
              onClick={() => setLens(id)}
              className="rounded-md px-3 py-1.5 text-sm font-semibold"
              style={{ background: on ? COLOR[id] : 'transparent', color: on ? '#0e1116' : 'var(--text-muted)' }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={muted} className="text-left">
              <th className="py-2 pr-3 text-right">#</th>
              <th className="py-2 pr-3">Metro</th>
              {lens === 'origin' && (
                <>
                  <th className="py-2 pr-3 text-right">Combined</th>
                  <th className="py-2 pr-3 text-right">US</th>
                  <th className="py-2 pr-3 text-right">UK</th>
                  <th className="py-2 pr-3 text-right">Artists</th>
                  <th className="py-2 pr-3">Signature</th>
                  <th className="py-2 pr-3 text-right">Distinct.</th>
                  <th className="py-2 pr-3 text-right">Per-artist</th>
                </>
              )}
              {lens === 'affinity' && (
                <>
                  <th className="py-2 pr-3 text-right">VR tracks</th>
                  <th className="py-2 pr-3 text-right">VR artists</th>
                </>
              )}
              {lens === 'production' && (
                <>
                  <th className="py-2 pr-3 text-right">Index</th>
                  <th className="py-2 pr-3">Tier</th>
                  <th className="py-2 pr-3">Studios / note</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.slug} className="border-t" style={{ borderColor: 'var(--border, #1b2330)' }}>
                <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{i + 1}</td>
                <td className="py-1.5 pr-3">
                  <a href={`/rankings/${m.slug}`} className="hover:underline">{m.metro}</a><a href={`/sound/metros/${m.slug}`} title="Sound profile" className="ml-1 text-xs align-middle" style={{ color: 'var(--text-muted)' }}>&#9834;</a>
                  {m.lenses.origin === null && (
                    <span title="Production-only" style={{ color: COLOR.production }}> &#9670;</span>
                  )}
                  <span className="ml-1 text-xs" style={muted}>{m.country}</span>
                </td>
                {lens === 'origin' && (
                  <>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{m.combined}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{m.us_score}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{m.uk_score}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{m.artist_count}</td>
                    <td className="py-1.5 pr-3" style={muted}>{m.signature_decade ?? '-'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{m.distinctiveness ?? '-'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{m.score_per_artist ?? '-'}</td>
                  </>
                )}
                {lens === 'affinity' && (
                  <>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{m.lenses.affinity.vr_tracks}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{m.lenses.affinity.vr_artists}</td>
                  </>
                )}
                {lens === 'production' && m.lenses.production && (
                  <>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{m.lenses.production.index}</td>
                    <td className="py-1.5 pr-3">{m.lenses.production.tier}</td>
                    <td className="py-1.5 pr-3 text-xs" style={muted}>{m.lenses.production.note}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
