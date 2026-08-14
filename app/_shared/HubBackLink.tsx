import Link from "next/link";

// The reciprocal link every time machine carries back to /time-machine.
//
// A hub that federates sixteen boards while none of them mention it is a
// directory nobody arrives at: the traffic is on the boards, and the hub is a
// page you have to already know about. This is the return leg.
//
// Deliberately small and text-only. These are all dense, finished boards and
// the point is a way out, not a banner competing with the thing the reader
// came for.

export default function HubBackLink({
  className = "",
  label = "Part of The Time Machine",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Link
      href="/time-machine"
      className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[var(--accent)] ${className}`}
      style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-dim)" }}
    >
      <span aria-hidden>🕰️</span>
      {label}
      <span aria-hidden>→</span>
    </Link>
  );
}
