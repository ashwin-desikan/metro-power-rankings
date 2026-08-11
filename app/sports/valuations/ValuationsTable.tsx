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
  /** Control owner, from lib/teamOwners. Null only if the owner row is missing,
      which scripts/build-team-owners-data.py treats as a hard build failure. */
  owner: string | null;
  ownerHref: string | null;
};

type SortKey = "value" | "team" | "league" | "year" | "owner";
const SPORTS: Array<Row["sport"] | "All"> = ["All", "NFL", "NBA", "MLB", "NHL", "Football"];

export default function ValuationsTable({ rows }: { rows: Row[] }) {
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("All");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [asc, setAsc] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

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
    if (needle) r = r.filter((x) => x.displayName.toLowerCase().includes(needle) || x.team.toLowerCase().includes(needle) || x.league.toLowerCase().includes(needle) || (x.owner ?? "").toLowerCase().includes(needle));
    const dir = asc ? 1 : -1;
    return [...r].sort((a, b) => {
      let c = 0;
      if (sortKey === "value") c = a.valueM - b.valueM;
      else if (sortKey === "team") c = a.displayName.localeCompare(b.displayName);
      else if (sortKey === "league") c = a.league.localeCompare(b.league);
      else if (sortKey === "year") c = (a.year ?? 0) - (b.year ?? 0);
      else if (sortKey === "owner") c = (a.owner ?? "").localeCompare(b.owner ?? "");
      return c * dir;
    });
  }, [rows, sport, q, sortKey, asc]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "team" || k === "league" || k === "owner");
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
          placeholder="Search team, league or owner…"
          className="ml-auto w-full sm:w-64 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
        />
      </div>

      {/* Mobile sort control: the desktop header cells (onClick={() => toggleSort(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same sortKey/asc state. Sticky so it stays reachable on
          long lists instead of forcing a scroll back to the top. Uses top-24
          (not the site-wide top-20) to match this file's own anchor offset
          (scrollMarginTop: 96px) used for the #anchor highlight rows above.
          The aria-live span announces the change for screen-reader users, who
          otherwise get no signal that the (silently reordered) cards moved. */}
      <div
        className="sticky top-24 z-30 flex items-center gap-2 py-2 mb-1 sm:hidden"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const label = e.target.options[e.target.selectedIndex]?.text ?? "";
              toggleSort(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="team">Team</option>
            <option value="league">League / Country</option>
            <option value="value">Valuation</option>
            <option value="owner">Owner</option>
            <option value="year">Year</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            toggleSort(sortKey);
            setAnnounce(`Sort direction: ${asc ? "descending" : "ascending"}`);
          }}
          aria-label={asc ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {asc ? "↑" : "↓"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
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
              {/* Wraps rather than truncates: entity names run long ("City
                  Football Group (Abu Dhabi United Group, Sheikh Mansour)") and
                  a clipped owner is worse than a second line on a card that is
                  already variable height. */}
              {r.owner && (
                <div className="mt-1 text-xs text-[var(--text-muted)] break-words" title={r.owner}>
                  <span className="text-[var(--text-dim)]">Owner: </span>
                  {r.ownerHref ? (
                    <Link href={r.ownerHref} className="hover:text-[var(--accent)] hover:underline">{r.owner}</Link>
                  ) : (
                    r.owner
                  )}
                </div>
              )}
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
              <th className={`${th} hidden md:table-cell`} onClick={() => toggleSort("owner")}>Owner{arrow("owner")}</th>
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
                  <td className="px-3 py-2 text-[var(--text-muted)] hidden md:table-cell">
                    {r.ownerHref && r.owner ? (
                      <Link href={r.ownerHref} className="hover:text-[var(--accent)] hover:underline">{r.owner}</Link>
                    ) : (
                      r.owner ?? "—"
                    )}
                  </td>
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
