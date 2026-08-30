"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// The scaling answer for /elections. The landing page's four regional columns
// work at 35 hubs and stop working somewhere well before 80, which is where the
// coverage rule takes this atlas. So: one A-Z list, one search box, no
// pagination, and everything filtered in the browser off a payload the server
// already had to build.
//
// Deliberately not a fuzzy matcher. Substring on name, code, region and the
// election prose is predictable, and predictable beats clever for a picker
// someone uses once and leaves.

export type HubRow = {
  code: string;
  name: string;
  href: string;
  flagSrc: string;
  flagSrcSet: string;
  region: string;
  last: string;
  next: string;
  nextDate: string | null;
  confidence: "confirmed" | "expected" | "unscheduled";
  daysAway: number | null;
  overdue: boolean;
  contests: number;
  note?: string | null;
  noteTone?: "neutral" | null;
  compact: boolean;
};

type SortKey = "name" | "next" | "contests";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function HubIndex({ rows }: { rows: HubRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    const hit = needle
      ? rows.filter((r) =>
          [r.name, r.code, r.region, r.last, r.next].some((f) => norm(f).includes(needle)),
        )
      : rows;
    const out = [...hit];
    if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "contests") out.sort((a, b) => b.contests - a.contests);
    if (sort === "next") {
      out.sort((a, b) => {
        if (!a.nextDate && !b.nextDate) return a.name.localeCompare(b.name);
        if (!a.nextDate) return 1;
        if (!b.nextDate) return -1;
        return a.nextDate === b.nextDate ? a.name.localeCompare(b.name) : a.nextDate < b.nextDate ? -1 : 1;
      });
    }
    return out;
  }, [rows, q, sort]);

  // A-Z headings only make sense while the list is alphabetical and unfiltered.
  const grouped = sort === "name";
  let lastInitial = "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex-1 min-w-[220px]">
          <span className="sr-only">Search election hubs</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 35 hubs by country, region or election…"
            className="w-full rounded-xl border px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
          />
        </label>
        <div className="flex items-center gap-1 text-xs">
          {(["name", "next", "contests"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              aria-pressed={sort === k}
              className="rounded-full border px-3 py-1.5 transition-colors"
              style={{
                borderColor: sort === k ? "var(--accent)" : "var(--border)",
                color: sort === k ? "var(--accent)" : "var(--text-muted)",
                backgroundColor: "var(--bg-card)",
              }}
            >
              {k === "name" ? "A–Z" : k === "next" ? "Next to vote" : "Most contests"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--text-dim)] mb-3 tabular-nums" aria-live="polite">
        {filtered.length} of {rows.length} hubs
        {q ? ` matching “${q}”` : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-6">
          Nothing matches “{q}”. The atlas covers 35 polities today; the coverage rule that decides
          which country joins next is on the{" "}
          <Link href="/elections" className="text-[var(--accent)] hover:underline">
            main elections page
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-2">
          {filtered.map((r) => {
            const initial = r.name[0].toUpperCase();
            const showHeading = grouped && !q && initial !== lastInitial;
            if (showHeading) lastInitial = initial;
            return (
              <div key={r.code}>
                {showHeading ? (
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-dim)] mt-4 mb-1">
                    {initial}
                  </h3>
                ) : null}
                <Link
                  href={r.href}
                  className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:border-[var(--accent)]"
                  style={{
                    borderColor: r.overdue ? "#B4540A" : "var(--border)",
                    backgroundColor: "var(--bg-card)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.flagSrc}
                    srcSet={r.flagSrcSet}
                    alt=""
                    width={28}
                    height={21}
                    className="rounded-[2px] shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[var(--text)]">
                      {r.name}
                      {r.note ? (
                        <span
                          className="ml-2 align-middle rounded-full border px-2 py-0.5 text-[10px] font-normal"
                          style={
                            r.noteTone === "neutral"
                              ? { borderColor: "var(--border)", color: "var(--text-dim)" }
                              : { borderColor: "#B4540A", color: "#D97706" }
                          }
                        >
                          {r.note}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-[var(--text-dim)] truncate">
                      {r.region} · last: {r.last}
                    </span>
                  </span>
                  <span className="hidden sm:block shrink-0 text-right text-xs max-w-[16rem]">
                    <span className="block text-[var(--text-muted)] truncate">{r.next}</span>
                    <span className="block text-[10px] text-[var(--text-dim)] tabular-nums">
                      {r.overdue
                        ? "result due"
                        : r.daysAway == null
                          ? "no date set"
                          : `${r.daysAway.toLocaleString("en-US")} days · ${r.contests} contests`}
                    </span>
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
