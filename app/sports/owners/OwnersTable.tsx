"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { CappedList } from "@/app/_shared/Disclosure";

// Local structural types, kept independent of the server-only lib/teamOwners
// module so this client component never pulls a server import.
type TeamRow = {
  team: string;
  displayName: string;
  league: string;
  valueLabel: string;
  href: string | null;
  stakeLabel: string | null;
  confidence: "sourced" | "cross-checked" | "contested";
  note: string | null;
  coControllers: string | null;
  minority: string | null;
  sourceUrl: string | null;
};

type Row = {
  ownerKey: string;
  ownerDisplay: string;
  ownerType: string;
  totalM: number;
  totalLabel: string;
  leagues: string[];
  crossesCodes: boolean;
  confidence: TeamRow["confidence"];
  teams: TeamRow[];
};

type SortKey = "total" | "owner" | "clubs";
type Scope = "All" | "Multi-club" | "Cross-code" | "Contested";
const SCOPES: Scope[] = ["All", "Multi-club", "Cross-code", "Contested"];

export default function OwnersTable({ rows }: { rows: Row[] }) {
  const [scope, setScope] = useState<Scope>("Multi-club");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = rows;
    if (scope === "Multi-club") r = r.filter((x) => x.teams.length > 1);
    else if (scope === "Cross-code") r = r.filter((x) => x.crossesCodes);
    else if (scope === "Contested") r = r.filter((x) => x.confidence === "contested");
    if (needle) {
      r = r.filter(
        (x) =>
          x.ownerDisplay.toLowerCase().includes(needle) ||
          x.teams.some(
            (t) =>
              t.displayName.toLowerCase().includes(needle) ||
              t.league.toLowerCase().includes(needle),
          ),
      );
    }
    const dir = asc ? 1 : -1;
    return [...r].sort((a, b) => {
      let c = 0;
      if (sortKey === "total") c = a.totalM - b.totalM;
      else if (sortKey === "owner") c = a.ownerDisplay.localeCompare(b.ownerDisplay);
      else if (sortKey === "clubs") c = a.teams.length - b.teams.length;
      return c * dir || a.totalM - b.totalM;
    });
  }, [rows, scope, q, sortKey, asc]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "owner");
    }
  }

  const arrow = (k: SortKey) => (sortKey === k ? (asc ? " ↑" : " ↓") : "");
  const th =
    "px-3 py-2 text-left font-semibold text-[var(--text-muted)] cursor-pointer select-none hover:text-[var(--text)]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => {
            const active = scope === s;
            return (
              <button
                key={s}
                onClick={() => setScope(s)}
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
          placeholder="Search owner, club or country…"
          className="ml-auto w-full sm:w-64 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
        />
      </div>

      {/* Mobile sort control. The desktop header cells drive sortKey/asc via
          onClick and are hidden below sm along with the table, so the cards
          need their own control over the same state. */}
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
            <option value="total">Portfolio value</option>
            <option value="owner">Owner</option>
            <option value="clubs">Clubs held</option>
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
        <CappedList
          initial={12}
          noun="rows"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={filtered.map((r, i) => (
          <div
            key={r.ownerKey}
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-sm min-w-0 break-words">{r.ownerDisplay}</span>
              <span className="text-xs tabular-nums text-[var(--text-dim)] flex-shrink-0">#{i + 1}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-4 text-sm">
              <span className="font-semibold tabular-nums">{r.totalLabel}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {r.teams.length} club{r.teams.length === 1 ? "" : "s"}
              </span>
              <Badges r={r} />
            </div>
            <ul className="mt-2 space-y-1">
              {r.teams.map((t) => (
                <li key={t.team + t.league} className="text-xs flex items-baseline gap-1.5">
                  <CrestIcon name={t.team} size={14} className="flex-shrink-0 translate-y-0.5" />
                  <TeamName t={t} />
                  <span className="text-[var(--text-dim)]">{t.league}</span>
                  <span className="ml-auto tabular-nums text-[var(--text-muted)] flex-shrink-0">{t.valueLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border hidden sm:block" style={{ borderColor: "var(--border)" }}>
        {/* Rank-first table: pin column 2 (Owner) so the name survives a
            sideways swipe instead of the rank number. DESIGN-STANDARDS.md. */}
        <table className="w-full text-sm border-collapse" data-sticky-col={2}>
          <thead>
            <tr
              className="border-b text-xs uppercase tracking-wider"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)] w-12">#</th>
              <th className={th} onClick={() => toggleSort("owner")}>Owner{arrow("owner")}</th>
              <th className={`${th} text-right`} onClick={() => toggleSort("total")}>Portfolio{arrow("total")}</th>
              <th className={`${th} text-right`} onClick={() => toggleSort("clubs")}>Clubs{arrow("clubs")}</th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] hidden md:table-cell">
                Leagues &amp; countries
              </th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] hidden lg:table-cell">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const isOpen = open === r.ownerKey;
              return (
                <Fragment key={r.ownerKey}>
                  <tr
                    className="border-b cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => setOpen(isOpen ? null : r.ownerKey)}
                  >
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.ownerDisplay}</span>
                      <span className="ml-2 text-[var(--text-dim)]">{isOpen ? "▾" : "▸"}</span>
                      <Badges r={r} />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.totalLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.teams.length}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)] hidden md:table-cell">
                      {r.leagues.join(", ")}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-dim)] hidden lg:table-cell">{r.ownerType}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td />
                      <td colSpan={5} className="px-3 py-3">
                        <ul className="space-y-2">
                          {r.teams.map((t) => (
                            <li key={t.team + t.league} className="text-xs">
                              <div className="flex items-baseline gap-2">
                                <CrestIcon name={t.team} size={16} className="flex-shrink-0 translate-y-0.5" />
                                <TeamName t={t} />
                                <span className="text-[var(--text-dim)]">{t.league}</span>
                                <span className="tabular-nums text-[var(--text-muted)]">{t.valueLabel}</span>
                                {t.stakeLabel && (
                                  <span className="text-[var(--text-dim)]">· {t.stakeLabel}</span>
                                )}
                                {t.sourceUrl && (
                                  <a
                                    href={t.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--text-dim)] hover:text-[var(--accent)] hover:underline"
                                  >
                                    source
                                  </a>
                                )}
                              </div>
                              {t.coControllers && (
                                <div className="text-[var(--text-dim)] mt-0.5 ml-6">
                                  With: {t.coControllers}
                                </div>
                              )}
                              {t.minority && (
                                <div className="text-[var(--text-dim)] mt-0.5 ml-6">
                                  Minority: {t.minority}
                                </div>
                              )}
                              {t.note && (
                                <div className="text-[var(--text-muted)] mt-0.5 ml-6 max-w-3xl">{t.note}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-[var(--text-dim)] mt-2">
        {filtered.length} of {rows.length} control entities shown
      </div>
    </div>
  );
}

function TeamName({ t }: { t: TeamRow }) {
  return t.href ? (
    <Link href={t.href} className="font-medium hover:text-[var(--accent)] hover:underline">
      {t.displayName}
    </Link>
  ) : (
    <span className="font-medium">{t.displayName}</span>
  );
}

function Badges({ r }: { r: Row }) {
  return (
    <>
      {r.crossesCodes && (
        <span
          className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest align-middle"
          style={{ background: "rgba(34,197,94,0.12)", color: "var(--text-muted)" }}
          title="Controls franchises in more than one code: North American league sport, association football, motorsport"
        >
          Cross-code
        </span>
      )}
      {r.confidence === "contested" && (
        <span
          className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest align-middle"
          style={{ background: "rgba(234,179,8,0.14)", color: "var(--text-muted)" }}
          title="Control is unresolved or a sale is mid-flight; open the row for what is outstanding"
        >
          Contested
        </span>
      )}
    </>
  );
}
