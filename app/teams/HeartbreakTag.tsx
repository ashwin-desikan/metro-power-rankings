import Link from "next/link";
import { getHeartbreak } from "@/lib/heartbreak";

// Server component. A small clickable pill for the team hero, carrying the
// club's world rank on The Heartbreak Index and its score. Mirrors
// GhostFranchiseTag and ValuationChip: returns null when the club does not
// score, so it is safe to drop into every team hero unconditionally, in every
// league the index covers.
export default function HeartbreakTag({
  league,
  slug,
  className = "",
}: {
  league: string;
  slug: string;
  className?: string;
}) {
  const h = getHeartbreak(league, slug);
  if (!h) return null;
  return (
    <Link
      href="/sports/heartbreak"
      title={`#${h.rank} of ${h.outOf.toLocaleString()} on The Heartbreak Index: ${h.total.toFixed(1)} points of accumulated ache`}
      className={`inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold align-middle transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">
        Heartbreak
      </span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>#{h.rank}</span>
      <span className="text-[var(--text-muted)] font-normal">{h.total.toFixed(1)}</span>
    </Link>
  );
}
