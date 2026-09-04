"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tab row across every Order surface, the BusinessNav / PredictionsNav idiom:
// client component, usePathname, flex-wrap, px-3 py-2 text-sm font-semibold,
// active = a 2px accent underline.
//
// Labels are short on purpose so the row wraps to at most two rows at 390px:
// "Direction" not "Direction of Travel", "Recognition" not "The Recognition
// Gap". Do not lengthen one without re-measuring at 390px.
const TABS: [string, string][] = [
  ["/order", "Overview"],
  ["/order/grid", "The Grid"],
  ["/order/trajectory", "Direction"],
  ["/order/recognition-gap", "Recognition"],
  ["/order/about", "What this is"],
];

export default function OrderNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
      {TABS.map(([href, label]) => {
        const active = href === "/order" ? pathname === "/order" : pathname.startsWith(href);
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
