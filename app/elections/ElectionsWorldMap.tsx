"use client";

import dynamic from "next/dynamic";

// Server-friendly wrapper for the elections world map. Leaflet needs `window`,
// so the inner component is dynamic-imported with ssr:false — the same pattern
// as MetroMap across the rest of the site. The height steps down on small
// screens so the map doesn't swallow a phone viewport.

const InnerMap = dynamic(() => import("./ElectionsWorldMapInner"), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full flex items-center justify-center text-xs animate-pulse"
      style={{ color: "var(--text-muted)", background: "var(--bg-card)" }}
    >
      Loading map…
    </div>
  ),
});

export type HubMarker = {
  code: string;
  name: string;
  href: string;
  lat: number;
  lon: number;
  last: string;
  next: string;
  note?: string | null;
  compact?: boolean;
};

export default function ElectionsWorldMap({ markers }: { markers: HubMarker[] }) {
  return (
    <div
      className="rounded-xl border overflow-hidden h-[260px] sm:h-[340px] lg:h-[420px]"
      style={{ borderColor: "var(--border)" }}
    >
      <InnerMap markers={markers} />
    </div>
  );
}
