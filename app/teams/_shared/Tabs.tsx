"use client";

import type { ReactNode } from "react";

// Segmented-control tab switcher, styled to match the site's existing chip
// nav (FootballHubNav/HubNav) rather than inventing a new visual grammar.
// Controlled: the caller owns `active` state and renders content per tab.
export type TabItem = { key: string; label: ReactNode; badge?: ReactNode };

export function Tabs({
  items,
  active,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(it.key)}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              on ? "font-semibold" : "hover:text-[var(--text)] hover:border-[var(--text-dim)]"
            }`}
            style={{
              background: on ? "var(--bg-card-hover)" : "var(--bg-card)",
              color: on ? "var(--accent)" : "var(--text-muted)",
              borderColor: on ? "var(--accent)" : "var(--border)",
            }}
          >
            {it.label}
            {it.badge}
          </button>
        );
      })}
    </div>
  );
}
