/**
 * tiles.citizenofnowhere.org -- CARTO basemap proxy.
 *
 * The browser asks this Worker for /{style}/{z}/{x}/{y}.png and the Worker
 * appends the CARTO key server-side before forwarding. The key lives in a
 * Worker secret and never reaches a reader.
 *
 * Why a Worker and not a Next route handler: a single map view pulls dozens of
 * tiles, and turning each one into a Vercel function invocation is the
 * expensive way to solve this. Here the Cloudflare edge cache answers almost
 * everything after the first request for a given tile, and the free Workers
 * allowance only has to cover the misses.
 *
 * Written as .js on purpose. tsconfig.json includes only *.ts and *.tsx, so
 * this file stays out of the repo's `npx tsc --noEmit` gate and does not need
 * Cloudflare's ambient types installed alongside Next's.
 */

const UPSTREAM = "https://basemaps.cartocdn.com/rastertiles";

/** Only the three styles lib/basemap.ts can ask for. Anything else is a 404. */
const ALLOWED_STYLES = new Set(["dark_all", "light_all", "voyager"]);

/**
 * Referer allowlist. CARTO's free tier has no domain restriction, so this is
 * the nearest equivalent, but be honest about what it buys: a Referer header
 * is trivially forged, so this stops casual hotlinking and nothing more
 * determined. A missing Referer is allowed through because some privacy
 * settings strip it, and a blank map is worse than a stolen tile.
 */
const ALLOWED_ORIGINS = new Set([
  "https://rankings.citizenofnowhere.org",
  "https://citizenofnowhere.org",
  "https://www.citizenofnowhere.org",
  "http://localhost:3000",
]);

/** Seven days. Basemap tiles change on the order of months. */
const TTL_SECONDS = 604800;

/**
 * Served from rankings.citizenofnowhere.org/tiles/* rather than its own
 * hostname. A Workers custom domain gets an AAAA-only DNS record, and the
 * public answer inherits that: no A record, so IPv4-only readers cannot reach
 * it at all. rankings.* is an existing proxied CNAME with both families, and
 * routing under it also makes the tiles same-origin, so no CORS and no second
 * certificate.
 */
const TILE_PATH = /^\/tiles\/([a-z_]+)\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})(@2x)?\.png$/;

function allowedReferer(request) {
  const ref = request.headers.get("Referer");
  if (!ref) return true;
  try {
    return ALLOWED_ORIGINS.has(new URL(ref).origin);
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (!allowedReferer(request)) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    const match = TILE_PATH.exec(url.pathname);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const [, style, z, x, y, retina] = match;
    if (!ALLOWED_STYLES.has(style)) {
      return new Response("Unknown style", { status: 404 });
    }
    if (!env.CARTO_KEY) {
      // Loud rather than silent: an unset secret would otherwise look like a
      // CARTO outage. Fix with: npx wrangler secret put CARTO_KEY
      return new Response("CARTO_KEY secret is not set on this Worker", { status: 500 });
    }

    // Cache on the public path only, so the key never becomes part of a cache
    // key and every reader shares the same cached tile.
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const upstream = `${UPSTREAM}/${style}/${z}/${x}/${y}${retina || ""}.png?key=${env.CARTO_KEY}`;
    const res = await fetch(upstream, {
      cf: { cacheEverything: true, cacheTtl: TTL_SECONDS },
    });

    if (!res.ok) {
      // Pass the status through so a bad zoom still reads as a 404 in the
      // browser's network tab, but never pass the upstream body: it can echo
      // the query string, and the query string carries the key.
      return new Response(`Upstream returned ${res.status}`, { status: res.status });
    }

    const out = new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/png",
        "Cache-Control": `public, max-age=${TTL_SECONDS}, immutable`,
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });

    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  },
};
