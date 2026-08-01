"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { Badge } from "@/app/teams/_shared/Badge";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import type { DomesticClub, EraHonours } from "@/lib/domesticFootball";

type SortKey = "name" | "country" | "titles" | "majorTrophies" | "cups" | "contTitles" | "clTitles";

const mono = { fontVariantNumeric: "tabular-nums" } as const;

export default function DomesticLeaguesTable({
  clubs,
  confederations,
  countries,
}: {
  clubs: DomesticClub[];
  confederations: string[];
  countries: string[];
}) {
  const [scope, setScope] = useState<"current" | "all">("current");
  const [conf, setConf] = useState("");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("titles");
  const [asc, setAsc] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState("");
  // Confederation/country/scope controls collapse behind this on mobile so
  // the card doesn't open with a wall of selects; search + reset stay
  // visible since search is the highest-utility control on a phone.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const countryActive = country !== "";

  const countryOpts = useMemo(
    () => (conf ? countries.filter((c) => clubs.some((x) => x.confederation === conf && x.byCountry[c])) : countries),
    [conf, countries, clubs],
  );

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = clubs.filter((c) => {
      if (countryActive) {
        if (!c.byCountry[country]) return false;
      } else {
        if (scope === "current" && c.status !== "current") return false;
        if (conf && c.confederation !== conf) return false;
      }
      if (needle && !c.name.toLowerCase().includes(needle) && !(c.metro || "").toLowerCase().includes(needle)) return false;
      return true;
    });
    const rows = base.map((c) => ({
      c,
      h: (countryActive ? c.byCountry[country] : c.allTime) as EraHonours,
      displayCountry: countryActive ? country : c.country,
    }));
    const dir = asc ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "name") return a.c.name.localeCompare(b.c.name) * dir;
      if (sortKey === "country") return (a.displayCountry || "").localeCompare(b.displayCountry || "") * dir;
      const av = (a.h as unknown as Record<string, number>)[sortKey] || 0;
      const bv = (b.h as unknown as Record<string, number>)[sortKey] || 0;
      return (av - bv) * dir || a.c.name.localeCompare(b.c.name);
    });
    return rows;
  }, [clubs, scope, conf, country, countryActive, q, sortKey, asc]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name" || k === "country");
    }
  }
  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function reset() {
    setConf(""); setCountry(""); setQ(""); setScope("current");
    setSortKey("titles"); setAsc(false);
  }

  const selStyle = "rounded-md border px-2 py-1 text-sm bg-[var(--bg-card)] border-[var(--border)] text-[var(--text)]";
  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => sortBy(k)}
      className={`px-3 py-3 cursor-pointer select-none hover:text-[var(--accent)] ${right ? "text-right" : "text-left"}`}
      title="Sort"
    >
      {label}{sortKey === k ? (asc ? " ▲" : " ▼") : ""}
    </th>
  );
  const activeFilterCount = (conf ? 1 : 0) + (country ? 1 : 0) + (scope !== "current" ? 1 : 0);

  return (
    <div>
      {/* Always-visible bar: search (primary control on a phone) + a
          mobile-only toggle that reveals scope/confederation/country
          filtering. Desktop skips the toggle and shows everything inline. */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          className={`${selStyle} flex-1 sm:flex-none sm:max-w-xs`}
          placeholder="Search club or metro"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((v) => !v)}
          aria-expanded={mobileFiltersOpen}
          className="sm:hidden inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition flex-shrink-0"
          style={{ background: "var(--bg-card-hover)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          Filters
          {activeFilterCount > 0 && <Badge variant="live">{activeFilterCount}</Badge>}
          <span aria-hidden className={`transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}>▾</span>
        </button>
        <div className={`${mobileFiltersOpen ? "flex" : "hidden"} sm:flex flex-wrap items-center gap-2 w-full sm:w-auto`}>
          <div className={`inline-flex rounded-md border border-[var(--border)] overflow-hidden ${countryActive ? "opacity-40 pointer-events-none" : ""}`}>
            {(["current", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1 text-sm ${scope === s ? "bg-[var(--accent)] text-black font-semibold" : "bg-[var(--bg-card)] text-[var(--text-muted)]"}`}
              >
                {s === "current" ? "Current first division" : "Ever first division"}
              </button>
            ))}
          </div>
          <select className={selStyle} value={conf} onChange={(e) => { setConf(e.target.value); setCountry(""); }}>
            <option value="">All confederations</option>
            {confederations.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selStyle} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries (current)</option>
            {countryOpts.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={reset} className="px-2 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent)]">Reset</button>
        <span className="text-xs text-[var(--text-dim)] tabular-nums ml-auto">{view.length} clubs</span>
      </div>
      {countryActive && (
        <p className="text-xs text-[var(--text-dim)] mb-2">
          Showing honours won while in <b className="text-[var(--text)]">{country}</b> only.
        </p>
      )}

      {/* Mobile sort control: the desktop header cells (onClick={() => sortBy(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same sortKey/asc state - a Sort-by select (reuses sortBy,
          which already sets each column's sensible default direction) plus a
          direction flip button. */}
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
              sortBy(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="name">Club</option>
            <option value="country">Country</option>
            <option value="titles">Titles</option>
            <option value="majorTrophies">Major</option>
            <option value="cups">Cups</option>
            <option value="contTitles">Cont.</option>
            <option value="clTitles">CL</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            sortBy(sortKey);
            setAnnounce(`Sort direction: ${asc ? "descending" : "ascending"}`);
          }}
          aria-label={asc ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {asc ? "▲" : "▼"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Same `view` array (filters + sort state above) drives both the
          mobile card grid and the desktop table; each club's honours
          breakdown expands in place (click the card, or the +/− cell). */}
      <ResponsiveTable
        variant="list"
        className="rounded-lg border"
        style={{ borderColor: "var(--border)" }}
        mobileRows={view.map(({ c, h, displayCountry }) => {
          const id = c.name + "|" + (c.metro || "");
          const isOpen = open.has(id);
          const eras = Object.entries(c.byCountry).sort((a, b) => (b[1].lastYear || 0) - (a[1].lastYear || 0));
          return (
            <div key={id} className="cursor-pointer" onClick={() => toggle(id)}>
              <RankRow
                name={
                  <>
                    <CrestIcon name={c.name} size={16} className="flex-shrink-0" />
                    {c.slug ? (
                      <Link
                        href={`/teams/football/${c.slug}`}
                        className="text-[var(--accent)] hover:underline truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <span className="truncate">{c.name}</span>
                    )}
                    <span className="text-[var(--text-dim)] flex-shrink-0" aria-hidden>{isOpen ? "−" : "+"}</span>
                  </>
                }
                sub={
                  <>
                    {displayCountry}
                    {countryActive && c.country !== country && (
                      <span className="ml-1 text-[10px]">now {c.country}</span>
                    )}
                    {!countryActive && c.status === "former" && (
                      <Badge variant="defunct" className="ml-1.5">Former</Badge>
                    )}
                  </>
                }
                right={h.titles || "—"}
                rightSub="titles"
              />
              {isOpen && (
                <div className="px-3 pb-3 text-xs text-[var(--text-muted)]">
                  <div className="mb-1 space-y-0.5">
                    {c.metro && <div>Metro: <b className="text-[var(--text)]">{c.metro}</b></div>}
                    <div>Cups: <b className="text-[var(--text)]">{h.cups || 0}</b></div>
                    <div>CL titles: <b className="text-[var(--text)]">{h.clTitles || 0}</b></div>
                    <div>Major trophies: <b className="text-[var(--text)]">{h.majorTrophies || 0}</b></div>
                    <div>Continental titles: <b className="text-[var(--text)]">{h.contTitles || 0}</b></div>
                    <div>Confederation: <b className="text-[var(--text)]">{c.confederation}</b></div>
                    <div>Status: <b className="text-[var(--text)]">{c.status === "current" ? "Current top flight" : "Former top flight"}</b></div>
                    {c.lastTopFlight != null && <div>Last top flight: <b className="text-[var(--text)]">{c.lastTopFlight}</b></div>}
                    {c.slug && (
                      <Link
                        href={`/teams/football/${c.slug}`}
                        className="inline-block text-[var(--accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Club page →
                      </Link>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {eras.map(([ctry, e]) => (
                      <span key={ctry}>
                        <b className="text-[var(--text)]">{ctry}</b>: {e.titles} titles
                        {e.cups ? `, ${e.cups} cups` : ""}
                        {e.contTitles ? `, ${e.contTitles} continental` : ""}
                        {e.clTitles ? `, ${e.clTitles} CL` : ""}
                        {e.lastTitle ? ` (last title ${e.lastTitle})` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      >
        <table className="w-full text-sm">
          <thead className="text-[var(--text-muted)] border-b border-[var(--border)] bg-[var(--bg-card)]">
            <tr>
              <th className="px-2 py-2 w-6" />
              <Th k="name" label="Club" />
              <Th k="country" label="Country" />
              <Th k="titles" label="Titles" right />
              <Th k="majorTrophies" label="Major" right />
              <Th k="cups" label="Cups" right />
              <Th k="contTitles" label="Cont." right />
              <Th k="clTitles" label="CL" right />
            </tr>
          </thead>
          <tbody>
            {view.map(({ c, h, displayCountry }) => {
              const id = c.name + "|" + (c.metro || "");
              const isOpen = open.has(id);
              const eras = Object.entries(c.byCountry).sort((a, b) => (b[1].lastYear || 0) - (a[1].lastYear || 0));
              return (
                <Fragment key={id}>
                  <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] cursor-pointer" onClick={() => toggle(id)}>
                    <td className="px-2 py-2 text-[var(--text-dim)]">{isOpen ? "−" : "+"}</td>
                    <td className="px-3 py-2">
                      <CrestIcon name={c.name} size={18} className="mr-1.5 align-middle" />
                      {c.slug ? (
                        <Link href={`/teams/football/${c.slug}`} className="font-medium text-[var(--accent)] hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-[var(--text)]">{c.name}</span>
                      )}
                      {c.metro && <div className="text-[11px] text-[var(--text-dim)]">{c.metro}</div>}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {displayCountry}
                      {countryActive && c.country !== country && (
                        <span className="ml-1 text-[10px] text-[var(--text-dim)]">now {c.country}</span>
                      )}
                      {!countryActive && c.status === "former" && (
                        <Badge variant="defunct" className="ml-1.5">Former</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={mono}>{h.titles || ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={mono}>{h.majorTrophies || ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={mono}>{h.cups || ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={mono}>{h.contTitles || ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={mono}>{h.clTitles || ""}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                      <td />
                      <td colSpan={7} className="px-3 pt-1 pb-3 text-xs text-[var(--text-muted)]">
                        <div className="mb-1">
                          <span>Confederation: <b className="text-[var(--text)]">{c.confederation}</b></span>
                          <span className="ml-4">Status: <b className="text-[var(--text)]">{c.status === "current" ? "Current top flight" : "Former top flight"}</b></span>
                          {c.lastTopFlight != null && <span className="ml-4">Last top flight: <b className="text-[var(--text)]">{c.lastTopFlight}</b></span>}
                          {c.slug && <Link href={`/teams/football/${c.slug}`} className="ml-4 text-[var(--accent)] hover:underline">Club page →</Link>}
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1">
                          {eras.map(([ctry, e]) => (
                            <span key={ctry}>
                              <b className="text-[var(--text)]">{ctry}</b>: {e.titles} titles
                              {e.cups ? `, ${e.cups} cups` : ""}
                              {e.contTitles ? `, ${e.contTitles} continental` : ""}
                              {e.clTitles ? `, ${e.clTitles} CL` : ""}
                              {e.lastTitle ? ` (last title ${e.lastTitle})` : ""}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </ResponsiveTable>
    </div>
  );
}
