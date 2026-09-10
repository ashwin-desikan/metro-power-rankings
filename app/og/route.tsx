import { ImageResponse } from "next/og";
import { brandCard } from "./card";
import { cardFontsEdge } from "./fonts-edge";

// The share card. /og?t=<page title>&p=<path> draws a 1200×630 card on the
// site's own dark ground: the section's emoji, the page title, the section
// kicker, and the Citizen of Nowhere wordmark. Every page's Open Graph and
// Twitter image points here through lib/seo's ogImage(); the home page's
// file-convention card (app/opengraph-image.tsx) is the same element with no
// title, and public/og-default.png is a render of it.
//
// 🔴 EDGE, NO FS. next/og renders with Satori on the edge runtime; the font
// is Inter 400 and 700 fetched from the bundle (./fonts-edge.ts), emoji come from
// Twemoji via the `emoji` option, and nothing here reads public/data, so the
// tracer bundles nothing but the two WOFF files. Cached a
// week at the CDN: a title does not change.
//
// Ashwin, 2026-09-10: "I don't like the text, and I don't like the image
// that shows up there. I want something professional and representative of
// the page that is being shared."

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return new ImageResponse(brandCard(searchParams.get("t") || "", searchParams.get("p") || "/"), {
    width: 1200,
    height: 630,
    emoji: "twemoji",
    fonts: await cardFontsEdge(),
    headers: { "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400" },
  });
}
