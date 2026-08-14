"use client";

import { useState } from "react";
import CountriesDirectory, { type DirectoryCountry } from "./CountriesDirectory";
import CountryTimeMachine from "./CountryTimeMachine";

// Tab shell for /countries. The directory is the landing view, always.
//
// The Time Machine is deliberately NOT resumed from sessionStorage, for the
// same reason the champions one is not: it is the view a reader arrives at
// from a link, and making it sticky means a plain /countries never shows the
// directory again in that tab.
//
// The Time Machine is mounted lazily - its payload is a separate fetch that
// should not happen for the majority of visitors who only ever want the table.

const TABS = [
  { id: "directory", label: "Directory" },
  { id: "timeline", label: "Time Machine" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CountriesTabs({ countries }: { countries: DirectoryCountry[] }) {
  const [tab, setTab] = useState<TabId>("directory");

  return (
    <div>
      <div role="tablist" aria-label="Countries views" className="flex gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium transition"
            style={{
              borderColor: tab === t.id ? "var(--accent)" : "var(--border)",
              color: tab === t.id ? "var(--accent)" : "var(--text-muted)",
              background: "var(--bg-card)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "directory" ? (
        <CountriesDirectory countries={countries} />
      ) : (
        <CountryTimeMachine />
      )}
    </div>
  );
}
