"use client";

// Filterable subdivisions chips for a country page. England lists 91 entries,
// Russia 85, Turkey 81 — enough that scanning for one is a chore, and the
// grouping by type only helps if you already know the type.
//
// Chip markup is copied verbatim from the previous inline block in page.tsx so
// the look is unchanged; the only addition is the filter and the live count.
// Client component, so props are plain serialisable data.

import { useMemo, useState } from "react";
import Link from "next/link";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

export type SubdivisionRow = {
  slug: string;
  name: string;
  iso?: string | null;
  type: string;
  metroCount: number;
};

export type SubdivisionGroup = {
  type: string;
  label: string;
  rows: SubdivisionRow[];
};

export default function SubdivisionsExplorer({
  groups, intro,
}: {
  groups: SubdivisionGroup[];
  intro: string;
}) {
  const [q, setQ] = useState("");

  const { shownGroups, total, matched } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    if (!needle) return { shownGroups: groups, total, matched: total };
    const shownGroups = groups
      .map((g) => ({
        ...g,
        rows: g.rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            (r.iso ?? "").toLowerCase().includes(needle) ||
            r.type.toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.rows.length > 0);
    const matched = shownGroups.reduce((n, g) => n + g.rows.length, 0);
    return { shownGroups, total, matched };
  }, [groups, q]);

  const multi = groups.length > 1;

  return (
    <>
      <p className="text-sm text-[var(--text-muted)] mb-3">{intro}</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter subdivisions..."
          aria-label="Filter subdivisions by name, code or type"
          className="min-w-0 flex-1 sm:flex-none sm:w-72 rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--text-dim)]"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <span className="text-xs text-[var(--text-dim)] whitespace-nowrap" style={MONO}>
          {matched === total ? `${total} total` : `${matched} of ${total}`}
        </span>
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline"
          >
            clear
          </button>
        ) : null}
      </div>

      {shownGroups.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No subdivision matches “{q}”.</p>
      ) : (
        shownGroups.map((group) => (
          <div key={group.type} className="mb-5 last:mb-0">
            {multi ? (
              <h3
                className="text-[11px] uppercase tracking-wider font-semibold mb-2"
                style={{ color: "var(--text-muted)", ...MONO }}
              >
                {group.label}{" "}
                <span style={{ color: "var(--text-dim)" }}>({group.rows.length})</span>
              </h3>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {group.rows.map((s) => (
                <Link
                  key={s.slug}
                  href={`/states/${s.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border)",
                    color: "var(--text)",
                    ...MONO,
                  }}
                  title={s.iso ? `${s.type} · ${s.iso}` : s.type}
                >
                  {s.name}
                  {s.metroCount > 0 ? (
                    <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                      {s.metroCount}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
