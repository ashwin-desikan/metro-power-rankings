// Badge chips for a single metro detail page. Server component: reads
// the live badge registry, finds which badges this metro qualifies for,
// renders a row of clickable chips. Each chip links to the badge index
// page, turning every metro into a discovery surface for the badges layer.

import Link from "next/link";
import { getBadgesForMetro } from "@/lib/badges";

export default function BadgeChips({ slug }: { slug: string }) {
  const badges = getBadgesForMetro(slug);
  if (badges.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-2 mt-4"
      aria-label="Badges this metro qualifies for"
    >
      {badges.map(({ badge }) => (
        <Link
          key={badge.slug}
          href={`/badges/${badge.slug}`}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border)",
            color: "var(--text)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
          title={badge.shortDesc}
        >
          <span aria-hidden="true">{badge.emoji}</span>
          <span>{badge.name}</span>
        </Link>
      ))}
    </div>
  );
}
