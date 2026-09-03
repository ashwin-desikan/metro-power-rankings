"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Cross-hub tab row linking every prediction surface, the BusinessNav idiom
// (client, usePathname, flex-wrap, px-3 py-2 text-sm font-semibold, active =
// 2px accent underline). Rendered directly under PredHeader on all eight
// pages in the family: /predictions, /predictions/nfl, /predictions/cfb,
// /predictions/mlb, /predictions/pl, /predictions/ucl,
// /predictions/scoreboard, /play/picks.
//
// Labels are kept short on purpose so the row wraps to at most three rows
// at 390px (measured) - "College" not "College Football", "UCL" not
// "Champions League", "Ledger" not "The Ledger". Do not lengthen a label
// without re-measuring at 390px.
const TABS: [string, string][] = [
  ["/predictions", "Overview"],
  ["/predictions/nfl", "NFL"],
  ["/predictions/cfb", "College"],
  ["/predictions/mlb", "MLB"],
  ["/predictions/pl", "Premier League"],
  ["/predictions/ucl", "UCL"],
  ["/predictions/scoreboard", "Ledger"],
  ["/play/picks", "Picks"],
];

export default function PredictionsNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
      {TABS.map(([href, label]) => {
        const active = href === "/predictions" ? pathname === "/predictions" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="px-3 py-2 text-sm font-semibold"
            style={{
              color: active ? "var(--text)" : "var(--text-muted)",
              borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
