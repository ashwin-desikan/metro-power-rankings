"use client";

import { useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import type { NpbTeam, NpbDefunct } from "@/lib/npb";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

type Row = {
  key: string;
  name: string;
  slug: string | null;
  division: string;
  city: string | null;
  metro: string | null;
  metro_slug: string | null;
  js_titles: number;
  pennants: number;
  seasons: number;
  years: string | null;
  w: number;
  l: number;
  t: number;
  win_pct: number;
  defunct: boolean;
  successor: string | null;
};

function toRow(t: NpbTeam): Row {
  return {
    key: t.slug, name: t.name, slug: t.slug, division: t.division, city: t.city,
    metro: t.metro, metro_slug: t.metro_slug, js_titles: t.js_titles,
    pennants: t.pennants, seasons: t.seasons, years: null,
    w: t.w, l: t.l, t: t.t, win_pct: t.win_pct, defunct: false, successor: null,
  };
}

function defunctToRow(d: NpbDefunct): Row {
  return {
    key: "defunct-" + d.name, name: d.name, slug: null, division: d.division, city: d.city,
    metro: d.metro, metro_slug: d.metro_slug, js_titles: d.js_titles,
    pennants: d.pennants, seasons: d.seasons, years: `${d.first_season}–${d.last_season}`,
    w: d.w, l: d.l, t: d.t, win_pct: d.win_pct, defunct: true, successor: d.successor,
  };
}

export default function ClubsTable({
  active,
  defunct,
}: {
  active: NpbTeam[];
  defunct: NpbDefunct[];
}) {
  const [showAll, setShowAll] = useState(false);

  const activeRows = active.map(toRow);
  const allRows = [...activeRows, ...defunct.map(defunctToRow)].sort(
    (a, b) =>
      b.js_titles - a.js_titles ||
      b.pennants - a.pennants ||
      b.win_pct - a.win_pct ||
      a.name.localeCompare(b.name)
  );
  const rows = showAll ? allRows : activeRows;

  const btn = (label: string, on: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-md border transition"
      style={{
        background: on ? "var(--accent)" : "var(--bg-card)",
        borderColor: on ? "var(--accent)" : "var(--border)",
        color: on ? "var(--bg)" : "var(--text-muted)",
        fontWeight: on ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        {btn(`Current (${active.length})`, !showAll, () => setShowAll(false))}
        {btn(`All (${allRows.length})`, showAll, () => setShowAll(true))}
      </div>
      {/* Mobile: one card per club instead of a 9-column table nobody can
          read at 375px without scrolling sideways. Same `rows` data as the
          desktop table below - only the presentation differs. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {rows.map((r) => (
          <div
            key={r.key + "-card"}
            className="rounded-lg border p-3"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
              <CrestIcon name={r.name} size={18} className="align-middle" />
              {r.slug ? (
                <Link href={`/teams/baseball/npb/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link>
              ) : (
                <span className="text-[var(--text-muted)]">{r.name}</span>
              )}
            </div>
            {r.defunct && (
              <div className="mt-1">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded border text-[var(--text-dim)]"
                  style={{ borderColor: "var(--border)" }}
                  title={r.successor ?? "Defunct franchise"}
                >
                  Defunct · {r.years}
                </span>
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">League</div>
                <div className="text-[var(--text-muted)]">{r.division}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">City</div>
                <div>{r.city ?? <span className="text-[var(--text-dim)]">—</span>}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Metro</div>
                <div>
                  {r.metro_slug ? (
                    <Link href={`/rankings/${r.metro_slug}`} className="hover:text-[var(--accent)]">{r.metro}</Link>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]" style={{ color: r.js_titles > 0 ? GOLD : undefined }}>Japan Series</div>
                <div className="tabular-nums font-semibold" style={{ ...mono, color: r.js_titles > 0 ? GOLD : "var(--text-dim)" }}>{r.js_titles}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Pennants</div>
                <div className="tabular-nums" style={mono}>{r.pennants}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Seasons</div>
                <div className="tabular-nums" style={mono}>{r.seasons}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W–L–T</div>
                <div className="tabular-nums" style={mono}>{r.w}–{r.l}–{r.t}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Win %</div>
                <div className="tabular-nums" style={mono}>{r.win_pct.toFixed(3)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="hidden sm:block rounded-xl border overflow-x-auto"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <table className="w-full text-sm min-w-[700px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">Club</th>
              <th className="py-2 px-3 font-medium">League</th>
              <th className="py-2 px-3 font-medium">City</th>
              <th className="py-2 px-3 font-medium">Metro</th>
              <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Japan Series</th>
              <th className="py-2 px-3 text-right font-medium">Pennants</th>
              <th className="py-2 px-3 text-right font-medium">Seasons</th>
              <th className="py-2 px-3 text-right font-medium">W–L–T</th>
              <th className="py-2 px-3 text-right font-medium">Win %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 font-medium">
                  <CrestIcon name={r.name} size={18} className="mr-1.5 align-middle" />
                  {r.slug ? (
                    <Link href={`/teams/baseball/npb/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link>
                  ) : (
                    <span className="text-[var(--text-muted)]">{r.name}</span>
                  )}
                  {r.defunct && (
                    <span
                      className="ml-2 align-middle text-[10px] px-1.5 py-0.5 rounded border text-[var(--text-dim)]"
                      style={{ borderColor: "var(--border)" }}
                      title={r.successor ?? "Defunct franchise"}
                    >
                      Defunct · {r.years}
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{r.division}</td>
                <td className="py-1.5 px-3 text-xs">{r.city ?? <span className="text-[var(--text-dim)]">—</span>}</td>
                <td className="py-1.5 px-3 text-xs">
                  {r.metro_slug ? (
                    <Link href={`/rankings/${r.metro_slug}`} className="hover:text-[var(--accent)]">{r.metro}</Link>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                    style={{ ...mono, color: r.js_titles > 0 ? GOLD : "var(--text-dim)" }}>{r.js_titles}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.pennants}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.seasons}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.w}–{r.l}–{r.t}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.win_pct.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
