"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

// Local structural type (kept independent of the server-only lib/valuations
// module so this client component never pulls a server import).
type Row = {
  team: string;
  displayName: string;
  league: string;
  leagueHref: string;
  sport: "NFL" | "NBA" | "MLB" | "NHL" | "Football";
  valueM: number;
  valueLabel: string;
  year: number | null;
  source: string;
  href: string | null;
  anchor: string;
};

type SortKey = "value" | "team" | "league" | "year";
const SPORTS: Array<Row["sport"] | "All"> = ["All", "NFL", "NBA", "MLB", "NHL", "Football"];

export default function ValuationsTable({ rows }: { rows: Row[] }) {
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("All");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [asc, setAsc] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!h) return;
    setHighlight(h);
    const el = document.getElementById(h);
    if (el) el.scrollIntoView({ block: "center" });
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = rows;
    if (sport !== "All") r = r.filter((x) => x.sport === sport);
    if (needle) r = r.filter((x) => x.displayName.toLowerCase().includes(needle) || x.team.toLowerCase().includes(needle) || x.league.toLowerCase().includes(needle));
    const dir = asc ? 1 : -1;
    return [...r].sort((a, b) => {
      let c = 0;
      if (sortKey === "value") c = a.valueM - b.valueM;
      else if (sortKey === "team") c = a.displayName.localeCompare(b.displayName);
      else if (sortKey === "league") c = a.league.localeCompare(b.league);
      else if (sortKey === "year") c = (a.year ?? 0) - (b.year ?? 0);
      return c * dir;
    });
  }, [rows, sport, q, sortKey, asc]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "team" || k === "league");
    }
  }

  const arrow = (k: SortKey) => (sortKey === k ? (asc ? " ↑" : " ↓") : "");
  const th = "px-3 py-2 text-left font-semibold text-[var(--text-muted)] cursor-pointer select-none hover:text-[var(--text)]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5">
          {SPORTS.map((s) => {
            const active = sport === s;
            return (
              <button
                key={s}
                onClick={() => setSport(s)}
                className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  background: active ? "var(--accent)" : "var(--bg-card)",
                  color: active ? "#0b0f17" : "var(--text-muted)",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search team or league…"
          className="ml-auto w-full sm:w-64 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
        />
      </div>

      {/* Mobile: stacked cards, same filtered/sorted rows as the desktop table */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {filtered.map((r, i) => {
          const hot = highlight === r.anchor;
          return (
            <div
              key={r.anchor + i}
              id={r.anchor}
              className="rounded-lg border p-3 transition-colors"
              style={{
                borderColor: "var(--border)",
                background: hot ? "var(--bg-card-hover)" : "var(--bg-card)",
                boxShadow: hot ? "inset 3px 0 0 var(--accent)" : undefined,
                scrollMarginTop: "96px",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center min-w-0 text-sm">
                  <CrestIcon name={r.team} size={18} className="mr-1.5 align-middle flex-shrink-0" />
                  {r.href ? (
                    <Link href={r.href} className="font-medium hover:text-[var(--accent)] hover:underline truncate">{r.displayName}</Link>
                  ) : (
                    <span className="font-medium truncate" title="No team page yet">{r.displayName}</span>
                  )}
                </span>
                <span className="text-xs tabular-nums text-[var(--text-dim)] flex-shrink-0">#{i + 1}</span>
              </div>
              <div className="mt-1 text-xs">
                <Link href={r.leagueHref} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{r.league}</Link>
                {r.sport === "Football" && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Football</span>}
              </div>
              <div className="mt-2 flex items-baseline gap-4 text-sm">
                <span className="font-semibold tabular-nums">{r.valueLabel}</span>
                <span className="text-xs tabular-nums text-[var(--text-muted)]">{r.year ?? "—"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border hidden sm:block" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)] w-12">#</th>
              <th className={th} onClick={() => toggleSort("team")}>Team{arrow("team")}</th>
              <th className={th} onClick={() => toggleSort("league")}>League / Country{arrow("league")}</th>
              <th className={`${th} text-right`} onClick={() => toggleSort("value")}>Valuation{arrow("value")}</th>
              <th className={`${th} text-right`} onClick={() => toggleSort("year")}>Year{arrow("year")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const hot = highlight === r.anchor;
              return (
                <tr
                  key={r.anchor + i}
                  id={r.anchor}
                  className="border-b transition-colors"
                  style={{
                    borderColor: "var(--border)",
                    background: hot ? "var(--bg-card-hover)" : undefined,
                    boxShadow: hot ? "inset 3px 0 0 var(--accent)" : undefined,
                    scrollMarginTop: "96px",
                  }}
                >
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center min-w-0">
                      <CrestIcon name={r.team} size={18} className="mr-1.5 align-middle" />
                      {r.href ? (
                        <Link href={r.href} className="font-medium hover:text-[var(--accent)] hover:underline truncate">{r.displayName}</Link>
                      ) : (
                        <span className="font-medium truncate" title="No team page yet">{r.displayName}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={r.leagueHref} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{r.league}</Link>
                    {r.sport === "Football" && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Football</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.valueLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.year ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-[var(--text-dim)] mt-2">{filtered.length} of {rows.length} teams shown</div>
    </div>
  );
}
