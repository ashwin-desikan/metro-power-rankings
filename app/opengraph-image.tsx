import { ImageResponse } from "next/og";
import { brandCard } from "./og/card";

// The home page's share card, and the fallback for any route that sets no
// image of its own: the Citizen of Nowhere brand card (app/og/card.tsx), the
// same element the /og route draws for every page with its title. The old
// "Global Metro Power Rankings" card was retired on 2026-09-10 (Ashwin: a
// pasted link "should say the name of the page: Citizen of Nowhere").
// Rendered once at build.

export const alt = "Citizen of Nowhere";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(brandCard("", "/"), { ...size, emoji: "twemoji" });
}
