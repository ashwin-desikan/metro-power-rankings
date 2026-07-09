"use client";

// Client wrapper for the International Football index: continent + federation
// filter chips, map, and grouped team list. The team payload is pre-trimmed
// in the server page to keep the bundle compact.

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CONTINENT_COLORS, flagForTeam, flagCdnUrl, displayNameForTeam } from "@/lib/international-display";
import type { NationalMapPoint } from "./NationalMapInner";

const NationalMap = dynamic(() => import("./NationalMapInner"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center text-xs animate-pulse"
      style={{ height: "520px", width: "100%", borderRadius: "0.75rem", background: "var(--bg-card)", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
    >
      Loading map…
    </div>
  ),
});

export type IndexTeam = {
  slug: string;
  cur_name: string;
  continent: string;
  federation: string | null;
  trophies: number;
  major_trophies: number;
  last_trophy: number | null;
  last_major_trophy: number | null;
  tour_app: number;
  fifa_rank: number | null;
  elo_rank: number | null;
  centroid: [number, number] | null;
  active: boolean;
  has_country_page: boolean;
  country_page_slug: string | null;
};

type Props = {
  teams: IndexTeam[];
  snapshots: { elo: string; fifa: string };
};

// Continent display order. World last; we'll show it grouped under "Other".
const CONTINENT_ORDER = [
  "Europe",
  "South America",
  "Africa",
  "Asia",
  "North America",
  "Oceania",
  "World",
];

function SortableTh({
  label,
  active,
  dir,
  onClick,
  caption,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  caption?: string;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th className="py-2 px-2 text-right font-medium whitespace-nowrap align-bottom">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex flex-col items-end gap-0.5 py-1.5 hover:text-[var(--accent)] transition"
        style={{
          color: active ? "var(--accent)" : "inherit",
          fontWeight: "inherit",
        }}
        title={`Sort by ${label} (${dir === "asc" ? "best first" : "worst first"})`}
      >
        <span className="inline-flex items-center gap-1">
          <span>{label}</span>
          <span className="text-[10px] opacity-70" aria-hidden>{arrow}</span>
        </span>
        {caption && (
          <span className="text-[9px] font-normal tracking-normal normal-case text-[var(--text-dim)] tabular-nums">
            {caption}
          </span>
        )}
      </button>
    </th>
  );
}

// Federations we surface as filter chips. Order matches FIFA confederation
// hierarchy. The workbook uses COMNEBOL spelling intentionally per the
// project's editorial position.
const FEDERATIONS = ["UEFA", "COMNEBOL", "CAF", "AFC", "CONCACAF", "OFC"];

export default function NationalIndexClient({ teams, snapshots }: Props) {
  const [continents, setContinents] = useState<Set<string>>(new Set());
  const [federations, setFederations] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams.filter((t) => {
      if (continents.size > 0 && !continents.has(t.continent)) return false;
      if (federations.size > 0 && (!t.federation || !federations.has(t.federation))) return false;
      if (q && !t.cur_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [teams, continents, federations, search]);

  const points = useMemo<NationalMapPoint[]>(() => {
    const out: NationalMapPoint[] = [];
    for (const t of filtered) {
      if (!t.centroid) continue;
      out.push({
        slug: t.slug,
        cur_name: t.cur_name,
        continent: t.continent,
        federation: t.federation,
        trophies: t.trophies,
        lat: t.centroid[0],
        lng: t.centroid[1],
        color: CONTINENT_COLORS[t.continent] ?? "#525252",
      });
    }
    return out;
  }, [filtered]);

  // Sort state: which column is the current sort key, and direction. ELO
  // ascending is the v1 default since lower = better in ranking systems.
  const [sortKey, setSortKey] = useState<"elo" | "fifa">("elo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [announce, setAnnounce] = useState("");

  function toggleSort(key: "elo" | "fifa") {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const ranked = useMemo(() => {
    const sentinel = Number.POSITIVE_INFINITY;
    return [...filtered].sort((a, b) => {
      const av = sortKey === "elo" ? a.elo_rank : a.fifa_rank;
      const bv = sortKey === "elo" ? b.elo_rank : b.fifa_rank;
      const aRank = av ?? sentinel;
      const bRank = bv ?? sentinel;
      // Always push nulls to the bottom regardless of direction.
      if (aRank === sentinel && bRank !== sentinel) return 1;
      if (bRank === sentinel && aRank !== sentinel) return -1;
      const diff = sortDir === "asc" ? aRank - bRank : bRank - aRank;
      if (diff !== 0) return diff;
      return a.cur_name.localeCompare(b.cur_name);
    });
  }, [filtered, sortKey, sortDir]);

  const refitKey = `${[...continents].sort().join(",")}|${[...federations].sort().join(",")}`;

  return (
    <div>
      <section className="mb-8">
        <NationalMap points={points} refitKey={refitKey} />
      </section>

      <section className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {CONTINENT_ORDER.filter((c) => c !== "World").map((c) => {
            const on = continents.has(c);
            return (
              <button
                key={c}
                onClick={() =>
                  setContinents((prev) => {
                    const next = new Set(prev);
                    if (next.has(c)) next.delete(c);
                    else next.add(c);
                    return next;
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition"
                style={{
                  background: on ? CONTINENT_COLORS[c] ?? "var(--bg-card)" : "var(--bg-card)",
                  color: on ? "white" : "var(--text)",
                  borderColor: on ? CONTINENT_COLORS[c] ?? "var(--border)" : "var(--border)",
                }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: on ? "white" : CONTINENT_COLORS[c] ?? "#525252" }}
                  aria-hidden
                />
                {c}
              </button>
            );
          })}
          {continents.size > 0 && (
            <button
              onClick={() => setContinents(new Set())}
              className="text-xs text-[var(--accent)] hover:underline ml-1"
            >
              Clear continents
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FEDERATIONS.map((fed) => {
            const on = federations.has(fed);
            return (
              <button
                key={fed}
                onClick={() =>
                  setFederations((prev) => {
                    const next = new Set(prev);
                    if (next.has(fed)) next.delete(fed);
                    else next.add(fed);
                    return next;
                  })
                }
                className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs transition"
                style={{
                  background: on ? "var(--accent)" : "var(--bg-card)",
                  color: on ? "white" : "var(--text)",
                  borderColor: on ? "var(--accent)" : "var(--border)",
                }}
              >
                {fed}
              </button>
            );
          })}
          {federations.size > 0 && (
            <button
              onClick={() => setFederations(new Set())}
              className="text-xs text-[var(--accent)] hover:underline ml-1"
            >
              Clear federations
            </button>
          )}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team name..."
          className="w-full sm:max-w-md rounded-md border px-3 py-1.5 text-sm"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <p className="mt-2 text-xs text-[var(--text-muted)] tabular-nums">
          {filtered.length} team{filtered.length === 1 ? "" : "s"} match{filtered.length === 1 ? "es" : ""} the current filters.
        </p>
      </section>

      <section>
        {/* Mobile sort control: the desktop SortableTh buttons (onClick={() =>
            toggleSort(k)}) live only in the table below, hidden below sm, so
            cards need their own way to drive the same sortKey/sortDir state. */}
        <div
          className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 sm:hidden"
          style={{ backgroundColor: "var(--bg)" }}
        >
          <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
            <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
            <select
              value={sortKey}
              onChange={(e) => {
                const label = e.target.options[e.target.selectedIndex]?.text ?? "";
                toggleSort(e.target.value as "elo" | "fifa");
                setAnnounce(`Sorted by ${label}`);
              }}
              className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="elo">ELO</option>
              <option value="fifa">FIFA</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              toggleSort(sortKey);
              setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
            }}
            aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
            className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
          <span aria-live="polite" className="sr-only">{announce}</span>
        </div>

        {/* Mobile: one card per national team instead of a 6-column table.
            Same `ranked` array (filters + sort state above) drives both. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {ranked.map((t) => {
            const flagUrl = flagCdnUrl(t.slug);
            return (
              <div
                key={t.slug}
                className="rounded-lg border p-3"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="leading-tight flex items-center gap-1.5 flex-wrap font-medium text-sm min-w-0">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: CONTINENT_COLORS[t.continent] ?? "#525252" }}
                      aria-hidden
                    />
                    {flagUrl && (
                      <img src={flagUrl} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" loading="lazy" decoding="async" />
                    )}
                    <Link href={`/teams/national/${t.slug}`} className="hover:text-[var(--accent)] hover:underline truncate">
                      {displayNameForTeam(t.slug, t.cur_name)}
                    </Link>
                    {!t.active && (
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold flex-shrink-0"
                        style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-muted)" }}
                      >
                        Defunct
                      </span>
                    )}
                  </div>
                </div>
                {t.federation && (
                  <div className="text-[11px] text-[var(--text-dim)] mb-2">{t.federation}</div>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mt-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">ELO rank</div>
                    <div className="tabular-nums font-semibold">{t.elo_rank ?? <span className="text-[var(--text-dim)] font-normal">—</span>}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">FIFA rank</div>
                    <div className="tabular-nums">{t.fifa_rank ?? <span className="text-[var(--text-dim)]">—</span>}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Trophies</div>
                    <div className="tabular-nums">
                      {t.trophies > 0 ? (
                        <span>
                          {t.trophies}
                          {t.last_trophy && <span className="text-[var(--text-muted)]"> ({t.last_trophy})</span>}
                        </span>
                      ) : (
                        <span className="text-[var(--text-dim)]">—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Major trophies</div>
                    <div className="tabular-nums">
                      {t.major_trophies > 0 ? (
                        <span>
                          {t.major_trophies}
                          {t.last_major_trophy && <span className="text-[var(--text-muted)]"> ({t.last_major_trophy})</span>}
                        </span>
                      ) : (
                        <span className="text-[var(--text-dim)]">—</span>
                      )}
                    </div>
                  </div>
                  {t.has_country_page && t.country_page_slug && (
                    <div className="col-span-2">
                      <Link
                        href={`/countries/${t.country_page_slug}`}
                        className="text-[var(--accent)] hover:underline"
                        title={`Open ${t.cur_name} country page`}
                      >
                        /countries →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="py-2 px-2 text-left font-medium align-bottom">National team</th>
                <SortableTh
                  label="ELO"
                  active={sortKey === "elo"}
                  dir={sortDir}
                  onClick={() => toggleSort("elo")}
                  caption={`as of ${snapshots.elo}`}
                />
                <SortableTh
                  label="FIFA"
                  active={sortKey === "fifa"}
                  dir={sortDir}
                  onClick={() => toggleSort("fifa")}
                  caption={`as of ${snapshots.fifa}`}
                />
                <th className="py-2 px-2 text-right font-medium align-bottom">Trophies</th>
                <th className="py-2 px-2 text-right font-medium whitespace-nowrap hidden sm:table-cell align-bottom">Major trophies</th>
                <th className="py-2 px-2 text-left font-medium hidden sm:table-cell align-bottom">Country</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((t) => {
                const flag = flagForTeam(t.slug);
                const continentDot = (
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: CONTINENT_COLORS[t.continent] ?? "#525252" }}
                    aria-hidden
                  />
                );
                return (
                  <tr
                    key={t.slug}
                    className="border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="py-1.5 px-2">
                      <span className="inline-flex items-center gap-2">
                        {continentDot}
                        {flagCdnUrl(t.slug) && <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" loading="lazy" decoding="async" />}
                        <Link href={`/teams/national/${t.slug}`} className="hover:underline font-medium">
                          {displayNameForTeam(t.slug, t.cur_name)}
                        </Link>
                        {!t.active && (
                          <span
                            className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold"
                            style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-muted)" }}
                          >
                            Defunct
                          </span>
                        )}
                        {t.federation && (
                          <span className="text-[var(--text-muted)] text-xs">· {t.federation}</span>
                        )}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap font-semibold">
                      {t.elo_rank ?? <span className="text-[var(--text-dim)] font-normal">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      {t.fifa_rank ?? <span className="text-[var(--text-dim)]">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      {t.trophies > 0 ? (
                        <span>
                          {t.trophies}
                          {t.last_trophy && (
                            <span className="text-[var(--text-muted)] text-xs"> ({t.last_trophy})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[var(--text-dim)]">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap hidden sm:table-cell">
                      {t.major_trophies > 0 ? (
                        <span>
                          {t.major_trophies}
                          {t.last_major_trophy && (
                            <span className="text-[var(--text-muted)] text-xs"> ({t.last_major_trophy})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[var(--text-dim)]">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 hidden sm:table-cell">
                      {t.has_country_page && t.country_page_slug ? (
                        <Link
                          href={`/countries/${t.country_page_slug}`}
                          className="text-[var(--accent)] hover:underline text-xs"
                          title={`Open ${t.cur_name} country page`}
                        >
                          /countries →
                        </Link>
                      ) : (
                        <span className="text-[var(--text-dim)] text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
