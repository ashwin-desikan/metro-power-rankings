'use client';

import dynamic from 'next/dynamic';

// Server-friendly wrapper. Leaflet itself needs `window`, so the inner
// component is dynamic-imported with ssr:false. The wrapper renders a
// sized container and a loading state so the page layout doesn't jump.

const InnerMap = dynamic(() => import('./MetroMapInner'), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full flex items-center justify-center text-xs"
      style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
    >
      Loading map…
    </div>
  ),
});

export type MapPoint = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
};

export default function MetroMap({
  points,
  showConnections = true,
  height = 320,
}: {
  points: MapPoint[];
  showConnections?: boolean;
  height?: number;
}) {
  // Filter out zero-coord workbook entries (e.g. Mulhouse, Baden) so they
  // don't sit at (0,0) off Africa. They reappear once coords land in the xlsx.
  const valid = points.filter((p) => p.lat !== 0 || p.lon !== 0);
  if (valid.length === 0) return null;
  return (
    <div
      style={{ height, width: '100%' }}
      className="rounded-lg overflow-hidden border border-[var(--border)]"
    >
      <InnerMap points={valid} showConnections={showConnections} />
    </div>
  );
}
