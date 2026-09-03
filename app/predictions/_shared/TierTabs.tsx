"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

// Small tab switcher for a sim's tiers (e.g. "classic" stats+market vs
// "lite" stats-only). Renders every child up front and toggles visibility
// with the `hidden` attribute, so there is no content flash and no
// server/client markup mismatch; the last-chosen tab is remembered per
// browser in sessionStorage, wrapped in try/catch since storage can throw
// or simply be unavailable (private browsing, embedded previews).

export type TierTab = { key: string; label: string };

const STORAGE_KEY = "predictions-tier-tab";
const DEFAULT_TAB = "classic";

function readStoredTab(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTab(key: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* storage unavailable; the tab choice just won't persist */
  }
}

export function TierTabs({
  tabs,
  children,
  className = "",
}: {
  tabs: TierTab[];
  /** One child per tab, in the same order as `tabs`. */
  children: ReactNode[];
  className?: string;
}) {
  const groupId = useId();
  const fallback = tabs.some((t) => t.key === DEFAULT_TAB) ? DEFAULT_TAB : tabs[0]?.key;
  const [active, setActive] = useState<string>(fallback);

  useEffect(() => {
    const stored = readStoredTab();
    if (stored && tabs.some((t) => t.key === stored)) setActive(stored);
    // Only run once on mount: this reads the viewer's last choice, it does
    // not need to react to `tabs` changing shape after the fact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(key: string) {
    setActive(key);
    writeStoredTab(key);
  }

  if (tabs.length === 0) return null;

  return (
    <div className={className}>
      <div role="tablist" className="flex flex-wrap gap-1 mb-3" aria-label="Simulation tier">
        {tabs.map((t) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${groupId}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${groupId}-panel-${t.key}`}
              onClick={() => choose(t.key)}
              className="min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors"
              style={{
                background: selected ? "var(--accent)" : "var(--bg-card)",
                color: selected ? "#08080D" : "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.key}
          id={`${groupId}-panel-${t.key}`}
          role="tabpanel"
          aria-labelledby={`${groupId}-tab-${t.key}`}
          hidden={t.key !== active}
        >
          {children[i]}
        </div>
      ))}
    </div>
  );
}
