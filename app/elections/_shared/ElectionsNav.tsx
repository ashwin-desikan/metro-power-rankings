"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Cross-page tab row for the elections family, the PredictionsNav idiom
// (client, usePathname, flex-wrap, px-3 py-2 text-sm font-semibold, active =
// 2px accent underline). Rendered directly under ElectionsHeader on every
// page in the family: /elections, /elections/forecast,
// /elections/track-record, /elections/all, /elections/systems,
// /elections/under-fire, /elections/referendums.
//
// The 41 polity hubs (/elections/uk and friends) are NOT tabs: they are the
// content the family indexes, reached from Overview and All hubs.
//
// Labels are kept short so the row wraps to at most three rows at 390px.
// Do not lengthen a label without re-measuring.
const TABS: [string, string][] = [
  ["/elections", "Overview"],
  ["/elections/forecast", "Forecasts"],
  ["/elections/track-record", "Track record"],
  ["/elections/all", "All hubs"],
  ["/elections/systems", "Systems"],
  ["/elections/under-fire", "Under fire"],
  ["/elections/referendums", "Referendums"],
];

export default function ElectionsNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
      {TABS.map(([href, label]) => {
        const active = href === "/elections" ? pathname === "/elections" : pathname.startsWith(href);
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
