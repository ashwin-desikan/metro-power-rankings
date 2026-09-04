'use client';

import { useMemo } from 'react';
import { useSessionState } from '@/lib/useSessionState';
import { CappedList } from "@/app/_shared/Disclosure";

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

      {/* Mobile: stacked cards, same rows/lens state as the desktop table */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          initial={12}
          noun="rows"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={rows.map((m, i) => (
          <div key={m.slug} className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #1b2330)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">
                  <a href={`/rankings/${m.slug}`} className="hover:underline">{m.metro}</a>
                  <a href={`/sound/metros/${m.slug}`} title={`${m.metro}: sound profile`} aria-label={`${m.metro} sound profile`} className="ml-1.5 inline-flex items-center rounded px-1 py-0.5 align-middle hover:bg-[var(--bg-card-hover)] transition-colors" style={{ color: 'var(--accent)' }}>&#9835;</a>
                  {m.lenses.origin === null && (
                    <span title="Production-only" style={{ color: COLOR.production }}> &#9670;</span>
                  )}
                </div>
                <div className="text-xs" style={muted}>{m.country}</div>
              </div>
              <div className="text-xs tabular-nums flex-shrink-0" style={muted}>#{i + 1}</div>
            </div>

            {lens === 'origin' && (
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>Combined</div>
                  <div className="tabular-nums font-semibold">{m.combined}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>US</div>
                  <div className="tabular-nums" style={muted}>{m.us_score}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>UK</div>
                  <div className="tabular-nums" style={muted}>{m.uk_score}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>Artists</div>
                  <div className="tabular-nums" style={muted}>{m.artist_count}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>Signature</div>
                  <div style={muted}>{m.signature_decade ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>Distinct.</div>
                  <div className="tabular-nums" style={muted}>{m.distinctiveness ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>Per-artist</div>
                  <div className="tabular-nums" style={muted}>{m.score_per_artist ?? '-'}</div>
                </div>
              </div>
            )}
            {lens === 'affinity' && (
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>VR tracks</div>
                  <div className="tabular-nums font-semibold">{m.lenses.affinity.vr_tracks}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={muted}>VR artists</div>
                  <div className="tabular-nums" style={muted}>{m.lenses.affinity.vr_artists}</div>
                </div>
              </div>
            )}
            {lens === 'production' && m.lenses.production && (
              <div className="mt-2 text-xs">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={muted}>Index</div>
                    <div className="tabular-nums font-semibold">{m.lenses.production.index}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={muted}>Tier</div>
                    <div>{m.lenses.production.tier}</div>
                  </div>
                </div>
                <div className="mt-1.5" style={muted}>{m.lenses.production.note}</div>
              </div>
            )}
          </div>
        ))}
        />
      </div>

      <div className="overflow-x-auto hidden sm:block">
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
                  <a href={`/rankings/${m.slug}`} className="hover:underline">{m.metro}</a><a href={`/sound/metros/${m.slug}`} title={`${m.metro}: sound profile`} aria-label={`${m.metro} sound profile`} className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-sm align-middle hover:bg-[var(--bg-card-hover)] transition-colors" style={{ color: 'var(--accent)' }}>&#9835;</a>
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
