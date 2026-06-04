import Link from "next/link";
import { getTeamValuation } from "@/lib/valuations";
import type { TeamLink } from "@/lib/teamLinks";

// Server component. Renders a small clickable valuation pill next to a team's
// name when that team appears in the cross-sport valuations dataset. Clicking
// it deep-links to /sports/valuations (scrolled to the team's row). Renders
// nothing when the team has no tracked valuation, so it is safe to drop into
// every team hero unconditionally.
export default function ValuationChip({
  league,
  slug,
  className = "",
}: {
  league: TeamLink["league"];
  slug: string;
  className?: string;
}) {
  const v = getTeamValuation(league, slug);
  if (!v) return null;
  return (
    <Link
      href={`/sports/valuations#${v.anchor}`}
      title={`Estimated valuation${v.year ? ` (${v.year})` : ""} — see all team valuations`}
      className={`inline-flex items-baseline gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold tabular-nums align-middle transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">Value</span>
      <span>{v.valueLabel}</span>
    </Link>
  );
}
