'use client';

import { useMemo } from 'react';
import { useSessionState } from '@/lib/useSessionState';
import MetroMap, { type MapPoint } from '../MetroMap';

export type LensId = 'origin' | 'affinity' | 'production';

export interface LensConfig {
  id: LensId;
  label: string;
  metric: string;
  source: string;
  desc: string;
}

export interface SoundMetro {
  slug: string;
  metro: string;
  country?: string;
  lat?: number;
  lon?: number;
  lenses: {
    origin:
      | {
          combined: number;
          us: number;
          uk: number;
          artists: number;
          signature_decade?: string | null;
          distinctiveness?: number;
          score_per_artist?: number;
          rank?: number;
        }
      | null;
    affinity: { vr_tracks: number; vr_artists: number; rank?: number };
    production: { index: number; tier: string; note: string; rank?: number } | null;
  };
}

const COLOR: Record<LensId, string> = {
  origin: '#4f9dff',
  affinity: '#c98bff',
  production: '#ffb64f',
};
const UNIT: Record<LensId, string> = { origin: 'score', affinity: 'tracks', production: 'index' };

function value(m: SoundMetro, lens: LensId): number {
  if (lens === 'origin') return m.lenses.origin?.combined ?? 0;
  if (lens === 'affinity') return m.lenses.affinity?.vr_tracks ?? 0;
  return m.lenses.production?.index ?? 0;
}
function rankOf(m: SoundMetro, lens: LensId): number | undefined {
  if (lens === 'origin') return m.lenses.origin?.rank;
  if (lens === 'affinity') return m.lenses.affinity?.rank;
  return m.lenses.production?.rank;
}

export default function SoundHub({
  metros,
  lenses,
}: {
  metros: SoundMetro[];
  lenses: LensConfig[];
}) {
  const [lens, setLens] = useSessionState<LensId>('mpr.sound.lens', 'origin');
  const active = lenses.find((l) => l.id === lens) ?? lenses[0];

  const ranked = useMemo(
    () => metros.filter((m) => value(m, lens) > 0).sort((a, b) => value(b, lens) - value(a, lens)),
    [metros, lens],
  );
  const max = ranked.length ? value(ranked[0], lens) : 1;

  const points: MapPoint[] = useMemo(
    () =>
      ranked
        .filter((m) => typeof m.lat === 'number' && typeof m.lon === 'number')
        .slice(0, 60)
        .map((m) => ({
          slug: m.slug,
          name: m.metro,
          lat: m.lat as number,
          lon: m.lon as number,
          color: COLOR[lens],
          country: m.country,
          subtitle: `#${rankOf(m, lens) ?? '-'} · ${value(m, lens)} ${UNIT[lens]}`,
          details:
            lens === 'production' && m.lenses.production
              ? m.lenses.production.tier
              : lens === 'origin' && m.lenses.origin?.signature_decade
                ? `signature ${m.lenses.origin.signature_decade}`
                : undefined,
        })),
    [ranked, lens],
  );

  return (
    <div>
      <div
        className="inline-flex gap-1 rounded-lg border p-1"
        style={{ borderColor: 'var(--border, #222b36)' }}
      >
        {lenses.map((l) => {
          const on = lens === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setLens(l.id)}
              className="rounded-md px-3 py-1.5 text-sm font-semibold"
              style={{
                background: on ? COLOR[l.id] : 'transparent',
                color: on ? '#0e1116' : 'var(--text-muted)',
              }}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      <p className="mb-4 mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>
        {active.desc}{' '}
        <span style={{ opacity: 0.7 }}>Source: {active.source}.</span>
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <div
          className="h-[360px] overflow-hidden rounded-lg border"
          style={{ borderColor: 'var(--border, #222b36)' }}
        >
          <MetroMap
            points={points}
            height={360}
            showConnections={false}
            refitOnChange
            clickToNavigate={false}
          />
        </div>

        <ol className="space-y-1">
          {ranked.slice(0, 25).map((m, i) => {
            const v = value(m, lens);
            const w = Math.max(2, (v / max) * 100);
            const productionOnly = m.lenses.origin === null;
            return (
              <li
                key={m.slug}
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: '24px minmax(120px, 1fr) 3fr 56px' }}
              >
                <span className="text-right text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {i + 1}
                </span>
                <span className="truncate text-sm">
                  <a href={`/rankings/${m.slug}`} className="hover:underline">{m.metro}</a><a href={`/sound/metros/${m.slug}`} title="Sound profile" className="ml-1 text-xs align-middle" style={{ color: 'var(--text-muted)' }}>&#9834;</a>
                  {productionOnly && (
                    <span title="Appears only on the production map" style={{ color: COLOR.production }}>
                      {' '}
                      &#9670;
                    </span>
                  )}
                  {lens === 'production' && m.lenses.production && (
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {m.lenses.production.tier}
                    </span>
                  )}
                </span>
                <span className="h-2 rounded" style={{ width: `${w}%`, background: COLOR[lens] }} />
                <span className="text-right text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {v}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
