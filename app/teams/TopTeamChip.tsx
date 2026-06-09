import Link from "next/link";
import { findTopTeamForName, topTeamAnchorId } from "@/lib/topTeams";

// Shared "Top Team" badge for per-franchise/club pages. Resolves the page's
// team (by name candidates + metro) against the Team That Wins the City picks
// and, when it is a metro's named pick, renders an amber badge linking back to
// that metro's slot on /top-teams. Renders nothing otherwise. findTopTeamForName
// is contested-aware (splits "A / B" picks), so co-equal teams both match.

export default function TopTeamChip({
  names,
  metro,
  className = "",
}: {
  names: string[];
  metro: string | null;
  className?: string;
}) {
  const pick = findTopTeamForName(names, metro ?? "");
  if (!pick) return null;
  return (
    <Link
      href={`/top-teams#${topTeamAnchorId(pick.metro)}`}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors text-xs font-medium ${className}`}
      title="This team is the metro's named Top Team pick on The Team That Wins the City"
    >
      <span className="text-amber-400 text-base leading-none" aria-hidden>&#9812;</span>
      <span className="font-semibold tracking-wide">Top Team</span>
      <span className="opacity-80">{pick.metro}</span>
    </Link>
  );
}
