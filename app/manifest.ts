import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Metro Rankings",
    description:
      "A composite ranking of every metropolitan area on Earth, across sixteen dimensions, hand-curated from individually verified parameters.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1117",
    theme_color: "#0d1117",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
