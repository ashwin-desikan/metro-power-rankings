"use client";

import { getCrest } from "@/lib/teamCrest";
import { flagCdnUrl } from "@/lib/international-display";

// Inline champion logo for champion tables: a club crest where one exists,
// otherwise a national-team flag (international champions store a country in
// `name`). Renders nothing when neither resolves, so rows stay clean.
// Client-safe: the crest map is a static import and flagCdnUrl is pure.

function nationSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ChampionLogo({
  name,
  canonical,
  size = 18,
  className = "",
}: {
  name: string;
  canonical?: string | null;
  size?: number;
  className?: string;
}) {
  const crest = (canonical ? getCrest(canonical) : null) ?? getCrest(name);
  const src = crest?.src ?? flagCdnUrl(nationSlug(name));
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block rounded-sm object-contain flex-shrink-0 align-middle mr-1 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
