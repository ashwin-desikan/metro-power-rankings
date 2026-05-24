'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, Polyline, GeoJSON, useMap, LayerGroup, ZoomControl, AttributionControl, Pane } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint } from './MetroMap';
import { MARKER_COLORS, MARKER_LABELS, sortForRender, formatLevel, type TeamMarker } from '@/lib/teamMarkers';
import { normalizeSport } from '@/lib/sportLabels';

// Padding adapts to span: tight derbies get more breathing room than
// continent-wide clusters. Returns south-west then north-east bound pairs.
function getPointBounds(points: MapPoint[]): [[number, number], [number, number]] {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lons) - Math.min(...lons),
  );
  const pad = Math.max(0.2, span * 0.25);
  return [
    [Math.min(...lats) - pad, Math.min(...lons) - pad],
    [Math.max(...lats) + pad, Math.max(...lons) + pad],
  ];
}

// Previously created custom panes for the primary city pin (z=670) and
// pin tooltip (z=690). That setup had a race: the pane was created in a
// useEffect that runs AFTER children mount, so the first CircleMarker
// render attached to a non-existent pane and Leaflet would either drop
// the marker silently or attach it to the wrong layer. Affected metros
// were the ones whose polygon footprint is too small to act as a visual
// fallback (Brussels, Athens, Hong Kong, Prague, Copenhagen, etc).
//
// Fix: use Leaflet's default panes throughout. markerPane (z=600) sits
// above the default overlayPane (z=400) where GeoJSON polygons live, so
// the pin is still drawn above the boundary. tooltipPane (z=650) sits
// above markerPane so hover tooltips still float over the pin.

// When a boundary GeoJSON is provided, fit map bounds to its extent so
// the map frames the metro region naturally rather than the city pin alone.
function FitToBoundary({ boundary }: { boundary: unknown }) {
  const map = useMap();
  useEffect(() => {
    if (!boundary) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = L.geoJSON(boundary as any);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch {
      // ignore malformed boundary; pin-only fallback is fine
    }
  }, [boundary, map]);
  return null;
}

// Re-fit map bounds whenever the points array changes. Used by the
// home-page rankings map where the table filter set is reactive. A stable
// key derived from the slug list keeps the effect dep array shallow so
// React doesn't re-run on every parent render.
function FitToPoints({ points, skipFirst = false }: { points: MapPoint[]; skipFirst?: boolean }) {
  const map = useMap();
  const key = points.map((p) => p.slug).join('|');
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) {
      firstMount.current = false;
      if (skipFirst) return; // honor caller-provided initialCenter on mount
    }
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 9);
      return;
    }
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const span = Math.max(
      Math.max(...lats) - Math.min(...lats),
      Math.max(...lons) - Math.min(...lons),
    );
    // Tightened from 0.5 / span*0.15 so filter changes zoom in more
    // aggressively. A continent-wide filter now frames continent-fill,
    // not continent-plus-surrounding-ocean.
    const pad = Math.max(0.2, span * 0.06);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad],
    ];
    // animate: true is the leaflet default; explicit duration keeps the
    // transition snappy without feeling jumpy on rapid filter toggles.
    map.fitBounds(bounds, { padding: [16, 16], animate: true, duration: 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

// Tier accent palette. Mirrors lib/tiers.ts so the country-map polygon
// shading reads as the same hierarchy used everywhere else on the site.
// Falls back to the site accent for any feature missing a tier slug.
const TIER_FILL: Record<string, string> = {
  'global-capital':   '#7c3aed',
  'world-city':       '#2563eb',
  'major-metro':      '#0891b2',
  'regional-hub':     '#16a34a',
  'established-city': '#ca8a04',
  'emerging-city':    '#ea580c',
  'local-city':       '#6b7280',
};
const DEFAULT_FILL = '#4ECDC4';

// Build a stable React key from a boundary FeatureCollection. react-leaflet
// won't diff <GeoJSON data> on prop change, so when the country-map tier
// toggle filters the collection we have to remount via key. Joining feature
// slugs is cheap and uniquely identifies the visible set; falls back to
// the JSON length when slugs are absent (single-metro pages).
function getBoundaryKey(boundary: unknown): string {
  if (!boundary || typeof boundary !== 'object') return 'none';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features = (boundary as any).features;
  if (!Array.isArray(features)) return 'single';
  if (features.length === 0) return 'empty';
  const slugs = features
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f: any) => f?.properties?.slug || '')
    .join('|');
  return `${features.length}:${slugs}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tierStyle(feature: any) {
  const tierSlug = feature?.properties?.tierSlug as string | undefined;
  const color = (tierSlug && TIER_FILL[tierSlug]) || DEFAULT_FILL;
  return {
    color,
    weight: 1.2,
    fillColor: color,
    fillOpacity: 0.42,
  };
}

// Tracks moveend / zoomend events and forwards the current center+zoom to
// the parent. Used by the Expandable Map page to persist the viewport to
// localStorage. The hook returns null because we only need the side effect.
function ViewportTracker({
  onChange,
}: {
  onChange: (center: [number, number], zoom: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const c = map.getCenter();
      onChange([c.lat, c.lng], map.getZoom());
    };
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, onChange]);
  return null;
}

export default function MetroMapInner({
  points,
  showConnections,
  boundary,
  interactiveFeatures = false,
  markers,
  refitOnChange = false,
  clickToNavigate = false,
  initialCenter,
  initialZoom,
  onViewportChange,
  preferCanvas,
  scrollWheelZoom = false,
}: {
  points: MapPoint[];
  showConnections: boolean;
  boundary?: unknown;
  // When true, polygon styling is driven by feature.properties.tierSlug,
  // each polygon binds a hover tooltip with name + rank, and clicking
  // navigates to the metro detail page. Default false preserves the
  // single-boundary behavior used on metro detail and matchup pages.
  interactiveFeatures?: boolean;
  // Team / venue markers, classified by category. Rendered above the
  // boundary polygon and below the primary pin so the metro's home pin
  // stays visually dominant.
  markers?: TeamMarker[];
  // Re-fit map bounds whenever the points array changes. Powers the
  // home-page rankings overlay where the table's filter state drives
  // the visible point set.
  refitOnChange?: boolean;
  // Wire each point marker to navigate to /rankings/{slug} on click.
  // Opt-in so existing single-pin callers (metro detail) don't become
  // accidentally self-clickable.
  clickToNavigate?: boolean;
  // Optional saved-viewport restore. When both are provided, the map
  // initializes at this center+zoom instead of fitting bounds to points.
  initialCenter?: [number, number];
  initialZoom?: number;
  // Optional callback fired on every moveend / zoomend.
  onViewportChange?: (center: [number, number], zoom: number) => void;
  // Force canvas rendering on MapContainer. Defaults to the
  // interactiveFeatures-driven value so existing callers keep their
  // current behavior unchanged.
  preferCanvas?: boolean;
  // Enable mouse-wheel zoom on the underlying MapContainer. Default false
  // so embedded maps inside scrollable pages do not steal page scroll.
  scrollWheelZoom?: boolean;
}) {
  const router = useRouter();
  const single = points.length === 1;
  // When an initial viewport is supplied (e.g. restored from localStorage on
  // the Expandable Map page), use it as-is and skip the bounds-derived frame.
  // Otherwise fall back to the standard fitBounds / single-pin behavior.
  const hasInitialView = initialCenter !== undefined && initialZoom !== undefined;
  const bounds = hasInitialView
    ? undefined
    : boundary || single || points.length === 0
      ? undefined
      : getPointBounds(points);
  const center: [number, number] | undefined = hasInitialView
    ? initialCenter
    : single
      ? [points[0].lat, points[0].lon]
      : points.length === 0
        ? [0, 0]
        : undefined;
  const zoom = hasInitialView ? initialZoom : single ? 9 : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEachFeature = (feature: any, layer: any) => {
    const p = feature?.properties || {};
    const name = p.name as string | undefined;
    const rank = p.rank as number | undefined;
    const tier = p.tier as string | undefined;
    const slug = typeof p.slug === 'string' ? (p.slug as string) : undefined;
    // Hover tooltip: quick read on mouseover, no commitment.
    if (name) {
      const html =
        `<div style="font-family:'Inter',system-ui,sans-serif;padding:2px 4px;">` +
        `<strong>${name}</strong>` +
        (rank ? ` <span style="color:#9ca3af">· #${rank}</span>` : '') +
        (tier ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${tier}</div>` : '') +
        `</div>`;
      layer.bindTooltip(html, { direction: 'top', sticky: true, opacity: 0.95 });
    }
    // Single click: open a popup with metro name + link to detail page.
    // Double click: navigate directly. Together with doubleClickZoom={false}
    // on MapContainer, this gives the user three interaction modes:
    //   hover -> tooltip (info only)
    //   click -> popup (with a link to commit)
    //   dblclick -> navigate (shortcut)
    if (slug && name) {
      const popupHtml =
        `<div style="font-family:'Inter',system-ui,sans-serif;min-width:160px;padding:2px 4px;">` +
        `<div style="font-weight:600;font-size:14px;">${name}</div>` +
        (rank ? `<div style="color:#9ca3af;font-size:11px;margin-top:2px;">Rank #${rank}${tier ? ` · ${tier}` : ''}</div>` : '') +
        `<a href="/rankings/${slug}" style="display:inline-block;margin-top:8px;color:#4ECDC4;font-size:12px;text-decoration:underline;">Open metro page &rarr;</a>` +
        `</div>`;
      layer.bindPopup(popupHtml, { closeButton: true, autoClose: true, autoPan: true });
      // Double-click navigates. Stop propagation so Leaflet's default
      // dblclick-to-zoom on the map doesn't also fire and yank the
      // viewport on the way to the detail page.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layer.on('dblclick', (e: any) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        router.push(`/rankings/${slug}`);
      });
    }
  };

  return (
    <MapContainer
      bounds={bounds}
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%', background: 'var(--bg-card)' }}
      scrollWheelZoom={scrollWheelZoom}
      // Leaflet's default dblclick-to-zoom stays ON so users can still
      // zoom by double-clicking empty map area. Marker and polygon
      // dblclick handlers call L.DomEvent.stopPropagation so a dblclick
      // ON a metro layer navigates without also firing the map zoom.
      attributionControl={false}
      zoomControl={false}
      preferCanvas={preferCanvas ?? interactiveFeatures}
      worldCopyJump={true}
    >
      {/* Default zoom (top-left) and attribution (bottom-right) overlap
          markers in the corners readers most want to click. Reposition
          both: zoom to bottom-right, attribution to bottom-left without
          the Leaflet prefix so it reads as a discreet credit line. */}
      <ZoomControl position="bottomright" />
      <AttributionControl position="bottomleft" prefix={false} />
      <TileLayer
        url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://overturemaps.org/">Overture Maps</a>'
        subdomains={['a', 'b', 'c', 'd']}
        maxZoom={18}
        minZoom={1}
        // World-wrap on: tiles repeat horizontally so panning east or west
        // never hits a hard edge. Pairs with worldCopyJump on MapContainer
        // so markers always render at the longitude the user is viewing.
        // minZoom=1 lets readers pull all the way out to see the whole
        // planet in one frame; below that, the CARTO tile pack returns
        // 404s and Leaflet renders empty squares.
      />
      {/* Synchronous pane creation for the primary city pin layer. The
          react-leaflet <Pane> component creates the Leaflet pane during
          MapContainer initialization, BEFORE sibling children render. This
          replaces the previous useEffect-based pane creation that raced
          the first CircleMarker render and silently dropped markers for
          small-footprint metros (Brussels, Athens, Hong Kong, Prague,
          Copenhagen, etc). zIndex 670 sits above the default markerPane
          (600) and the default overlayPane (400, GeoJSON polygons), so
          the pin is always drawn on top of any boundary layer regardless
          of which mounts first or last. Critical in canvas mode where
          render order within a single pane determines z-stacking. */}
      <Pane name="primaryPins" style={{ zIndex: 670 }} />
      <Pane name="primaryPinTooltips" style={{ zIndex: 690, pointerEvents: 'none' }} />
      {boundary ? (
        <>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <GeoJSON
            // react-leaflet GeoJSON does NOT diff `data` once mounted; without
            // a changing `key`, tier toggles on the country map (filtered
            // FeatureCollection) would not visually update. Key off the
            // collection identity so any change forces a remount.
            key={getBoundaryKey(boundary)}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={boundary as any}
            style={
              interactiveFeatures
                ? tierStyle
                : {
                    color: '#4ECDC4',
                    weight: 2,
                    fillColor: '#4ECDC4',
                    fillOpacity: 0.18,
                  }
            }
            onEachFeature={interactiveFeatures ? handleEachFeature : undefined}
          />
          <FitToBoundary boundary={boundary} />
        </>
      ) : null}
      {showConnections && points.length >= 2 ? (
        <Polyline
          positions={points.map((p) => [p.lat, p.lon])}
          pathOptions={{ color: '#4ECDC4', weight: 2, dashArray: '6 6', opacity: 0.85 }}
        />
      ) : null}
      {markers && markers.length > 0 ? (
        <LayerGroup>
          {sortForRender(markers).map((m, idx) => {
            const fill = MARKER_COLORS[m.category];
            const levelLabel = formatLevel(m.level);
            return (
              <CircleMarker
                key={`marker-${idx}-${m.lat}-${m.lng}`}
                center={[m.lat, m.lng]}
                radius={7}
                pathOptions={{
                  color: '#0f172a',
                  weight: 1.5,
                  fillColor: fill,
                  fillOpacity: 0.95,
                }}
                eventHandlers={{
                  mouseover: (e) => e.target.setRadius(9),
                  mouseout: (e) => e.target.setRadius(7),
                }}
              >
                <Tooltip direction="top" offset={[0, -7]} opacity={0.97}>
                  <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    {m.subtitle ? (
                      <div style={{ color: '#9ca3af' }}>{m.subtitle}</div>
                    ) : (m.sport || m.league) ? (
                      <div style={{ color: '#9ca3af' }}>
                        {normalizeSport(m.sport)}{m.league ? ` · ${m.league}` : ''}
                      </div>
                    ) : null}
                    {levelLabel ? (
                      <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 1 }}>
                        {levelLabel}
                      </div>
                    ) : null}
                    <div style={{ color: fill, fontSize: 11, marginTop: 2, fontWeight: 500 }}>
                      {m.href ? (
                        <a
                          href={m.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: fill, textDecoration: 'underline' }}
                        >
                          {MARKER_LABELS[m.category]} →
                        </a>
                      ) : (
                        MARKER_LABELS[m.category]
                      )}
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </LayerGroup>
      ) : null}
      {refitOnChange ? <FitToPoints points={points} skipFirst={hasInitialView} /> : null}
      {onViewportChange ? <ViewportTracker onChange={onViewportChange} /> : null}
      {points.map((p) => {
        const richMeta = [p.city, p.state, p.country].filter(Boolean).join(' · ');
        // Per-point color override lets league-map callers mix categories
        // (e.g. gold NHL team pins alongside pink Global Series venues).
        // Falls back to the site's teal accent.
        const fill = p.color ?? '#4ECDC4';
        return (
        <CircleMarker
          key={p.slug}
          center={[p.lat, p.lon]}
          // Pin small enough that polygons remain the primary visual layer,
          // large enough to reliably click. Radius 4 lands at ~10px target
          // diameter which is the practical floor for pointer accuracy.
          radius={4}
          // Pinned to the synchronously-created primaryPins pane (z=670)
          // so pins always render above the GeoJSON boundary layer, no
          // matter which mounts first or whether the GeoJSON remounts
          // when the boundary fetch resolves. This is the actual fix for
          // Brussels / Athens / Hong Kong / Prague / Copenhagen markers
          // being invisible - in canvas mode without an explicit pane,
          // the GeoJSON's late remount on async fetch resolution pushes
          // it to the top of the draw order and covers the pin.
          pane="primaryPins"
          pathOptions={{
            color: '#ffffff',
            weight: 1.5,
            fillColor: fill,
            fillOpacity: 1,
            pane: 'primaryPins',
          }}
          eventHandlers={
            clickToNavigate
              ? {
                  // Double-click navigates. Stop propagation so the map's
                  // default dblclick-to-zoom does not also fire underneath.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  dblclick: (e: any) => {
                    L.DomEvent.stopPropagation(e);
                    L.DomEvent.preventDefault(e);
                    router.push(`/rankings/${p.slug}`);
                  },
                }
              : undefined
          }
        >
          <Tooltip direction="top" offset={[0, -4]} permanent={false} pane="primaryPinTooltips">
            <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, lineHeight: 1.4 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              {(p.subtitle || richMeta) ? (
                <div style={{ color: '#9ca3af', fontSize: 11 }}>{p.subtitle || richMeta}</div>
              ) : null}
              {p.details ? (
                <div style={{ color: '#9ca3af', fontSize: 11 }}>{p.details}</div>
              ) : null}
            </div>
          </Tooltip>
          {clickToNavigate ? (
            <Popup closeButton autoClose autoPan>
              <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                {(p.subtitle || richMeta) ? (
                  <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>{p.subtitle || richMeta}</div>
                ) : null}
                {p.details ? (
                  <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>{p.details}</div>
                ) : null}
                <a
                  href={`/rankings/${p.slug}`}
                  style={{ display: 'inline-block', marginTop: 8, color: '#4ECDC4', fontSize: 12, textDecoration: 'underline' }}
                >
                  Open metro page →
                </a>
              </div>
            </Popup>
          ) : null}
        </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
