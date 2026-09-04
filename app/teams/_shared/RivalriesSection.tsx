// Shared cross-sport Rivalries badges for team pages. Server component: the page
// resolves rivals with getRivalries() from lib/rivalries and passes the list.
// Renders a compact inline row of chips (at most ~2-3 per team), each labelled
// with the rivalry's name (distinctive where one exists: Iron Bowl, The Ashes,
// Subway Series; otherwise "TeamA-TeamB rivalry"), linking to the rival, and
// marked mutual (two-sided) vs one-sided (this team claims it). Renders nothing
// when a team has no tracked rivalries. See lib/rivalries.ts.

import Link from "next/link";
import type { ResolvedRival } from "@/lib/rivalries";

export default function RivalriesSection({
  rivals,
  title = "Rivalries",
}: {
  rivals: ResolvedRival[];
  title?: string;
}) {
  if (!rivals || rivals.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-4">
      <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mr-0.5">
        {title}
      </span>
      {rivals.map((r, i) => {
        const marker = r.mutual ? "⇄" : "→";
        const tip = r.mutual
          ? `Mutual rivalry with ${r.rivalName}`
          : `One-sided: considers ${r.rivalName} a rival (not mutual)`;
        const chip = (
          <span
            className="inline-flex items-baseline gap-1 rounded-full border px-2.5 py-1 text-xs"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            title={tip}
          >
            <span
              aria-hidden
              className="text-[10px]"
              style={{ color: r.mutual ? "var(--text-dim)" : "#b58900" }}
            >
              {marker}
            </span>
            <span className="font-medium">{r.rivalry}</span>
            <span className="text-[var(--text-muted)]">vs {r.rivalName}</span>
            {r.top && (
              <span className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: "#d4af37" }}>★ Top Rivalry</span>
            )}
            <span className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">
              {r.mutual ? "two-way" : "one-way"}
            </span>
          </span>
        );
        return r.href ? (
          <Link key={`${r.rivalName}-${i}`} href={r.href} className="hover:opacity-80 transition-opacity">
            {chip}
          </Link>
        ) : (
          <span key={`${r.rivalName}-${i}`}>{chip}</span>
        );
      })}
    </div>
  );
}
