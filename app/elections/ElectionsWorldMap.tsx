"use client";

import dynamic from "next/dynamic";

// Server-friendly wrapper for the elections world map. Leaflet needs `window`,
// so the inner component is dynamic-imported with ssr:false — the same pattern
// as MetroMap across the rest of the site.

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
};

export default function ElectionsWorldMap({ markers }: { markers: HubMarker[] }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--border)", height: 400 }}
    >
      <InnerMap markers={markers} />
    </div>
  );
}
