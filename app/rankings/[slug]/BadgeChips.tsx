// Badge chips for a single metro detail page. Server component: reads
// the live badge registry, finds which badges this metro qualifies for,
// renders a row of clickable chips. Each chip links to the badge index
// page, turning every metro into a discovery surface for the badges layer.

import Link from "next/link";
import { getBadgesForMetro } from "@/lib/badges";

function formatChipValue(badgeSlug: string, value: number, tier?: string): string {
  if (tier) return `Tier ${tier}`;
  if (badgeSlug === "university-town" || badgeSlug === "skyline-city") {
    return `${value.toFixed(0)}%`;
  }
  if (badgeSlug === "megacity") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return `${value}`;
  }
  if (badgeSlug === "finance-capital") {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
    return `$${value.toFixed(0)}`;
  }
  if (badgeSlug === "overperformer") return `${value.toFixed(1)}x`;
  if (badgeSlug === "global-gateway") return value.toFixed(0);
  // Composite scores (culture, sports, rail) — show as integer
  return value.toFixed(0);
}

export default function BadgeChips({ slug }: { slug: string }) {
  const badges = getBadgesForMetro(slug);
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-4" aria-label="Badges this metro qualifies for">
      {badges.map(({ badge, qualifying }) => {
        const value = formatChipValue(
          badge.slug,
          qualifying.contextValue,
          qualifying.tier,
        );
        return (
          <Link
            key={badge.slug}
            href={`/badges/${badge.slug}`}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border)",
              color: "var(--text-muted)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
            title={`${badge.name}: ${qualifying.contextLabel}`}
          >
            <span aria-hidden="true">{badge.emoji}</span>
            <span className="text-[var(--text)]">{badge.name}</span>
            <span className="text-[var(--text-dim)]">·</span>
            <span>{value}</span>
          </Link>
        );
      })}
    </div>
  );
}
