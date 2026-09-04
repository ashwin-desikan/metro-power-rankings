import Link from "next/link";

// Small pill marking a club as "Below the Line": active, but below the level
// the Sports directory tracks for its sport, so excluded from the Sports map
// and metro cards by design. Links to the directory so readers can see what the
// site DOES track. Distinct from GhostFranchiseTag: Ghost = defunct/erased,
// Below the Line = alive and playing, just beneath the tracked line.
export default function BelowTheLineTag({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/sports#league-directory"
      title="Active club, below this sport's tracked level, not in the Sports directory"
      className={`inline-flex items-baseline gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold align-middle transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">Below the line</span>
      <span>Not in the Sports directory</span>
    </Link>
  );
}
