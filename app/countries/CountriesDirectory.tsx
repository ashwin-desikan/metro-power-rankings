"use client";

// Client-side directory: sortable, filterable, expandable rows.
// Receives the full country list pre-computed by the server page.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSessionState } from "@/lib/useSessionState";
import { flagUrl, flagSrcSet } from "@/lib/flags";

export type DirectoryCountry = {
  slug: string;
  name: string;
  parent: string | null;
  parent_slug: string | null;
  continent: string | null;
  pop: number | null;
  metroCount: number;
  scoreTotal: number | null;
  capital: string | null;
  disputed?: boolean;
  currentLeader: { name: string; role: string; since?: string; second?: { name: string; role: string } } | null;
  power: { share: number | null; rank: number; tier: string } | null;
  children: DirectoryCountry[];
};

type SortKey = "pop" | "metroCount" | "scoreTotal" | "power" | "name" | "since";
type SortDir = "asc" | "desc";

const CONTINENTS = [
  "All",
  "Europe",
  "North America",
  "Asia",
  "South America",
  "Africa",
  "Oceania",
];

function fmtPop(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function fmtScore(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

const TIER_COLOR: Record<string, string> = {
  "Superpower": "#f5c518", "Great Power": "#e8833a", "Middle Power": "#4a9edb", "Regional": "#7a8a99", "Minor": "#464659",
};
function PowerCell({ power, small }: { power: DirectoryCountry["power"]; small?: boolean }) {
  if (!power || power.share == null) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 justify-end" title={`${power.tier} · world rank #${power.rank}`}>
      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: TIER_COLOR[power.tier] }} />
      <span style={{ color: small ? "var(--text-muted)" : "var(--accent)" }}>{(power.share * 100).toFixed(1)}%</span>
    </span>
  );
}

// Flag image for a country/constituent slug. Images (not emoji) because Windows
// browsers render flag emoji as bare letter pairs. Renders nothing when we have
// no code for the slug (e.g. a handful of de-facto states).
function Flag({ slug }: { slug: string }) {
  const url = flagUrl(slug);
  if (!url) return null;
  const srcSet = flagSrcSet(slug) ?? undefined;
  return (
    <img
      src={url}
      srcSet={srcSet}
      alt=""
      aria-hidden="true"
      width={20}
      height={15}
      loading="lazy"
      className="inline-block mr-2 rounded-sm ring-1 ring-white/10 align-[-2px] shrink-0"
    />
  );
}

export default function CountriesDirectory({
  countries,
}: {
  countries: DirectoryCountry[];
}) {
  const [sortKey, setSortKey] = useSessionState<SortKey>("countries-sort-key", "pop");
  const [sortDir, setSortDir] = useSessionState<SortDir>("countries-sort-dir", "desc");
  const [continent, setContinent] = useState<string>("All");
  const [search, setSearch] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function toggleExpand(slug: string) {
    const next = new Set(expanded);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setExpanded(next);
  }

  const filtered = useMemo(() => {
    let rows = countries;
    if (continent !== "All") {
      rows = rows.filter((c) => c.continent === continent);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        if (c.children.some((k) => k.name.toLowerCase().includes(q)))
          return true;
        return false;
      });
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let av: number | string | null = null;
      let bv: number | string | null = null;
      if (sortKey === "name") { av = a.name; bv = b.name; }
      else if (sortKey === "pop") { av = a.pop; bv = b.pop; }
      else if (sortKey === "metroCount") { av = a.metroCount; bv = b.metroCount; }
      else if (sortKey === "scoreTotal") { av = a.scoreTotal; bv = b.scoreTotal; }
      else if (sortKey === "power") { av = a.power?.share ?? null; bv = b.power?.share ?? null; }
      else if (sortKey === "since") { av = a.currentLeader?.since ?? null; bv = b.currentLeader?.since ?? null; }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const aN = typeof av === "number" ? av : 0;
      const bN = typeof bv === "number" ? bv : 0;
      return sortDir === "asc" ? aN - bN : bN - aN;
    });
    return sorted;
  }, [countries, continent, search, sortKey, sortDir]);

  function arrow(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Continent</p>
          <div className="flex flex-wrap gap-2">
            {CONTINENTS.map((c) => (
              <button
                key={c}
                onClick={() => setContinent(c)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                  continent === c
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]"
                }`}
              >{c}</button>
            ))}
          </div>
        </div>
        <input
          type="text"
          placeholder="Search countries (e.g. Germany, Hong Kong, Cayman Islands)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Mobile sort control: the desktop header cells (onClick={() => toggleSort(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same sortKey/sortDir state - a Sort-by select (reuses
          toggleSort, which already sets each column's sensible default
          direction) plus a direction flip button. */}
      <div className="flex items-center gap-2 mb-3 sm:hidden">
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => toggleSort(e.target.value as SortKey)}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="name">Country</option>
            <option value="since">Since</option>
            <option value="pop">Population</option>
            <option value="metroCount">Metros</option>
            <option value="scoreTotal">Score</option>
            <option value="power">Power</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {sortDir === "asc" ? "▲" : "▼"}
        </button>
      </div>

      {/* Mobile: true stacked cards. All stats visible up front (no hidden
          columns behind a tap) — the only interaction retained is expanding
          a country's constituents/territories, which is a distinct
          parent/child hierarchy, not hidden data. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {filtered.map((c) => {
          const visibleChildren = continent === "All"
            ? c.children
            : c.children.filter((k) => k.continent === continent);
          const hasChildren = visibleChildren.length > 0;
          const isOpen = expanded.has(c.slug);
          return (
            <CountryCard
              key={`${c.slug}-card`}
              country={c}
              visibleChildren={visibleChildren}
              isOpen={isOpen}
              hasChildren={hasChildren}
              onToggle={() => toggleExpand(c.slug)}
            />
          );
        })}
      </div>

      <div className="hidden sm:block overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]" style={{ backgroundColor: "var(--bg-card)" }}>
              <th className="px-2 sm:px-4 py-3 text-left font-semibold text-[var(--text-muted)] w-8" />
              <th className="px-2 sm:px-4 py-3 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" onClick={() => toggleSort("name")}>Country{arrow("name")}</th>
              <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Continent</th>
              <th className="hidden lg:table-cell px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Leader</th>
              <th className="hidden lg:table-cell px-4 py-3 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }} onClick={() => toggleSort("since")}>Since{arrow("since")}</th>
              <th className="px-2 sm:px-4 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }} onClick={() => toggleSort("pop")}>Population{arrow("pop")}</th>
              <th className="hidden sm:table-cell px-4 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }} onClick={() => toggleSort("metroCount")}>Metros{arrow("metroCount")}</th>
              <th className="hidden sm:table-cell px-4 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }} onClick={() => toggleSort("scoreTotal")}>Score{arrow("scoreTotal")}</th>
              <th className="px-2 sm:px-4 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }} onClick={() => toggleSort("power")} title="Share of world power today (see The Power Atlas)">Power{arrow("power")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              // When a continent filter is active, only show children whose
              // continent matches. Keeps the expander honest.
              const visibleChildren = continent === "All"
                ? c.children
                : c.children.filter((k) => k.continent === continent);
              const hasChildren = visibleChildren.length > 0;
              const isOpen = expanded.has(c.slug);
              return (
                <CountryRows
                  key={c.slug}
                  country={c}
                  visibleChildren={visibleChildren}
                  isOpen={isOpen}
                  hasChildren={hasChildren}
                  onToggle={() => toggleExpand(c.slug)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          No countries match your filters.
        </div>
      ) : null}

      <p className="text-xs text-[var(--text-dim)] mt-2">
        {filtered.length} of {countries.length} parent countries shown.
        Constituents and territories shown when expanded. Click any country for the full metro breakdown.
      </p>
    </div>
  );
}

function CountryRows({
  country,
  visibleChildren,
  isOpen,
  hasChildren,
  onToggle,
}: {
  country: DirectoryCountry;
  visibleChildren: DirectoryCountry[];
  isOpen: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors">
        <td className="px-2 sm:px-4 py-3 align-top">
          <button
            onClick={onToggle}
            className={`text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors w-6 h-6 inline-flex items-center justify-center ${hasChildren ? "" : "sm:hidden"}`}
            aria-label={isOpen ? "Collapse" : "Expand"}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >{isOpen ? "−" : "+"}</button>
        </td>
        <td className="px-2 sm:px-4 py-3">
          <Flag slug={country.slug} />
          <Link href={`/countries/${country.slug}`} className="font-semibold hover:text-[var(--accent)] transition-colors">
            {country.name}
          </Link>
          {country.disputed ? (
            <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded italic"
                  style={{ color: "var(--text-dim)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
                  title="Internationally disputed">disputed</span>
          ) : null}
        </td>
        <td className="hidden md:table-cell px-4 py-3 text-[var(--text-muted)]">{country.continent ?? ""}</td>
        <td className="hidden lg:table-cell px-4 py-3">
          {country.currentLeader ? (
            <span className="text-sm text-[var(--text)]">
              {country.currentLeader.name}
              <span className="ml-1 text-xs text-[var(--text-dim)]">({country.currentLeader.role})</span>
              {country.currentLeader.second ? (
                <span className="block text-xs text-[var(--text-dim)]">
                  {country.currentLeader.second.name}
                  <span className="ml-1">({country.currentLeader.second.role})</span>
                </span>
              ) : null}
            </span>
          ) : null}
        </td>
        <td className="hidden lg:table-cell px-4 py-3 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {country.currentLeader?.since ?? ""}
        </td>
        <td className="px-2 sm:px-4 py-3 text-right text-[var(--text)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtPop(country.pop)}</td>
        <td className="hidden sm:table-cell px-4 py-3 text-right text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{country.metroCount}</td>
        <td className="hidden sm:table-cell px-4 py-3 text-right font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{fmtScore(country.scoreTotal)}</td>
        <td className="px-2 sm:px-4 py-3 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}><PowerCell power={country.power} /></td>
      </tr>
      {isOpen ? (
        <tr className="sm:hidden border-b border-[var(--border)]" style={{ backgroundColor: "rgba(255,255,255,0.025)" }}>
          <td />
          <td colSpan={8} className="px-2 py-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-dim)]">Score</dt>
                <dd className="font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{fmtScore(country.scoreTotal)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-dim)]">Power</dt>
                <dd style={{ fontFamily: "'JetBrains Mono', monospace" }}><PowerCell power={country.power} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-dim)]">Metros</dt>
                <dd className="text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{country.metroCount}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-dim)]">Continent</dt>
                <dd className="text-[var(--text-muted)]">{country.continent ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-dim)]">Since</dt>
                <dd className="text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{country.currentLeader?.since ?? "—"}</dd>
              </div>
              <div className="col-span-2 flex flex-col gap-0.5 pt-2 border-t border-[var(--border)]">
                <dt className="text-[var(--text-dim)]">Leader</dt>
                {country.currentLeader ? (
                  <dd className="text-[var(--text)]">
                    {country.currentLeader.name}
                    <span className="ml-1 text-[var(--text-dim)]">({country.currentLeader.role})</span>
                    {country.currentLeader.second ? (
                      <span className="block text-[var(--text-dim)]">
                        {country.currentLeader.second.name} ({country.currentLeader.second.role})
                      </span>
                    ) : null}
                  </dd>
                ) : (
                  <dd className="text-[var(--text-dim)]">—</dd>
                )}
              </div>
            </dl>
          </td>
        </tr>
      ) : null}
      {isOpen && hasChildren
        ? visibleChildren.map((child) => (
            <tr key={child.slug} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors" style={{ backgroundColor: "rgba(255,255,255,0.015)" }}>
              <td className="px-2 sm:px-4 py-2 align-top" />
              <td className="px-2 sm:px-4 py-2 pl-8 sm:pl-12">
                <Flag slug={child.slug} />
                <Link href={`/countries/${child.slug}`} className="text-sm hover:text-[var(--accent)] transition-colors" style={{ color: "var(--text-muted)" }}>{child.name}</Link>
                {child.disputed ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded italic"
                        style={{ color: "var(--text-dim)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
                        title="Internationally disputed">disputed</span>
                ) : null}
              </td>
              <td className="hidden md:table-cell px-4 py-2 text-[var(--text-dim)] text-xs">{child.continent ?? ""}</td>
              <td className="hidden lg:table-cell px-4 py-2 text-xs text-[var(--text-dim)]">
                {child.currentLeader ? child.currentLeader.name : ""}
              </td>
              <td className="hidden lg:table-cell px-4 py-2 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {child.currentLeader?.since ?? ""}
              </td>
              <td className="px-2 sm:px-4 py-2 text-right text-[var(--text-muted)] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtPop(child.pop)}</td>
              <td className="hidden sm:table-cell px-4 py-2 text-right text-[var(--text-dim)] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{child.metroCount}</td>
              <td className="hidden sm:table-cell px-4 py-2 text-right text-[var(--text-muted)] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtScore(child.scoreTotal)}</td>
              <td className="px-2 sm:px-4 py-2 text-right text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}><PowerCell power={child.power} small /></td>
            </tr>
          ))
        : null}
    </>
  );
}

function LeaderLine({ leader, small }: { leader: NonNullable<DirectoryCountry["currentLeader"]>; small?: boolean }) {
  return (
    <div className={small ? "text-[11px]" : "text-xs"}>
      <span className="text-[var(--text)]">{leader.name}</span>
      <span className="ml-1 text-[var(--text-dim)]">({leader.role})</span>
      {leader.second ? (
        <div className="text-[var(--text-dim)]">{leader.second.name} ({leader.second.role})</div>
      ) : null}
    </div>
  );
}

// Compact card for a single constituent/territory, shown nested under its
// parent's card once expanded.
function ChildCountryCard({ child }: { child: DirectoryCountry }) {
  return (
    <div className="rounded-md border px-3 py-2" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center min-w-0">
          <Flag slug={child.slug} />
          <Link href={`/countries/${child.slug}`} className="text-sm hover:text-[var(--accent)] transition-colors truncate" style={{ color: "var(--text-muted)" }}>
            {child.name}
          </Link>
          {child.disputed ? (
            <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded italic flex-shrink-0"
                  style={{ color: "var(--text-dim)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
                  title="Internationally disputed">disputed</span>
          ) : null}
        </div>
        <span className="flex-shrink-0 text-xs tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
          {fmtScore(child.scoreTotal)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <span>{fmtPop(child.pop)}</span>
        {child.metroCount > 0 && <span>{child.metroCount} metros</span>}
        {child.continent && <span className="font-sans">{child.continent}</span>}
        <PowerCell power={child.power} small />
      </div>
      {child.currentLeader ? <div className="mt-1"><LeaderLine leader={child.currentLeader} small /></div> : null}
    </div>
  );
}

// Full-data mobile card. Population, metros, score, power and leader are all
// visible without interaction — only the constituents/territories list (a
// genuine parent/child hierarchy) sits behind an expand toggle.
function CountryCard({
  country,
  visibleChildren,
  isOpen,
  hasChildren,
  onToggle,
}: {
  country: DirectoryCountry;
  visibleChildren: DirectoryCountry[];
  isOpen: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center min-w-0 flex-wrap gap-y-1">
          <Flag slug={country.slug} />
          <Link href={`/countries/${country.slug}`} className="font-semibold hover:text-[var(--accent)] transition-colors">
            {country.name}
          </Link>
          {country.disputed ? (
            <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded italic"
                  style={{ color: "var(--text-dim)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
                  title="Internationally disputed">disputed</span>
          ) : null}
        </div>
        <span className="flex-shrink-0 font-semibold text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
          {fmtScore(country.scoreTotal)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Population</div>
          <div className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtPop(country.pop)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Metros</div>
          <div className="tabular-nums text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{country.metroCount}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Continent</div>
          <div className="text-[var(--text-muted)]">{country.continent ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Power</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace" }}><PowerCell power={country.power} /></div>
        </div>
      </div>
      {country.currentLeader ? (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-0.5">Leader</div>
          <LeaderLine leader={country.currentLeader} />
          {country.currentLeader.since ? (
            <div className="text-[11px] text-[var(--text-dim)] mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              since {country.currentLeader.since}
            </div>
          ) : null}
        </div>
      ) : null}
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2.5 text-xs font-medium text-[var(--accent)] hover:underline"
        >
          {isOpen ? "Hide" : "Show"} {visibleChildren.length} constituent{visibleChildren.length !== 1 ? "s" : ""}/territories
        </button>
      ) : null}
      {isOpen && hasChildren ? (
        <div className="mt-2 pl-3 border-l space-y-2" style={{ borderColor: "var(--border)" }}>
          {visibleChildren.map((child) => (
            <ChildCountryCard key={child.slug} child={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
