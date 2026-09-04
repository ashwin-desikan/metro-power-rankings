import Link from "next/link";
import { getGhostFranchise, GHOST_SPECIES } from "@/lib/ghostFranchises";
import type { TeamLink } from "@/lib/teamLinks";

// Server component. Renders a small clickable pill on the hero of any team that
// is featured in The Geography of Erasure, deep-linking to the feature page.
// Mirrors ValuationChip: returns null when the team is not in the roster, so it
// is safe to drop into every team hero (active and defunct) unconditionally.
export default function GhostFranchiseTag({
  league,
  slug,
  className = "",
}: {
  league: TeamLink["league"];
  slug: string;
  className?: string;
}) {
  const g = getGhostFranchise(league, slug);
  if (!g) return null;
  const species = GHOST_SPECIES[g.species].label;
  return (
    <Link
      href="/sports/geography-of-erasure"
      title={`${species}: featured in The Geography of Erasure`}
      className={`inline-flex items-baseline gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold align-middle transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">Ghost</span>
      <span>Geography of Erasure</span>
    </Link>
  );
}
