/**
 * The single source for the CARTO basemap.
 *
 * Five map components each carried their own tile URL and drifted: two were
 * still on `cartodb-basemaps-*.global.ssl.fastly.net`, the retired host; the
 * other three used three different spellings of the current one. Everything now
 * builds its URL from here.
 *
 * Tiles are served through our own Cloudflare Worker (source in workers/tiles/),
 * which appends the CARTO key server-side. That is why there is no key in this
 * file and no NEXT_PUBLIC_ variable behind it: a key in a client bundle is a key
 * the reader can read, and CARTO's free tier has no domain restriction to fall
 * back on. The Worker also caches at the edge, so the proxy hop costs nothing
 * after the first request for a given tile.
 *
 * The Worker runs on a ROUTE under the site's own hostname, not on a tiles.*
 * subdomain. A Workers custom domain is created as a proxied AAAA record and
 * the public answer inherits that address family, so tiles.citizenofnowhere.org
 * resolved with no A record at all and was unreachable from any IPv4-only
 * reader. Routing under rankings.* reuses a hostname that already has both
 * families, and makes the tiles same-origin as a bonus.
 *
 * Absolute rather than relative so `npm run dev` renders real tiles too. In
 * production it is the same hostname the page is already on, so this is still
 * same-origin there; only localhost pays a cross-origin request, which the
 * Worker's Referer allowlist expects.
 *
 * Outage plan: set HOST to "https://{s}.basemaps.cartocdn.com/rastertiles" and
 * restore a subdomains={["a","b","c","d"]} prop on the five TileLayers. Unkeyed
 * CARTO tiles still render.
 */

const HOST = "https://rankings.citizenofnowhere.org/tiles";

export type BasemapStyle = "dark_all" | "light_all" | "voyager";

/**
 * A Leaflet tile-URL template. Set retina when the component wants the {r}
 * placeholder, which Leaflet expands to "@2x" on high-density displays.
 *
 * No {s} subdomain sharding: the Worker is a single host, and sharding was a
 * workaround for HTTP/1.1 connection limits that no longer applies.
 */
export function basemapUrl(style: BasemapStyle, opts?: { retina?: boolean }): string {
  const r = opts?.retina ? "{r}" : "";
  return `${HOST}/${style}/{z}/{x}/{y}${r}.png`;
}

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** The metro map also draws Overture-derived boundaries, so it credits them. */
export const BASEMAP_ATTRIBUTION_WITH_OVERTURE =
  `${BASEMAP_ATTRIBUTION} &copy; <a href="https://overturemaps.org/">Overture Maps</a>`;
