"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import SortableBoard from "@/app/_shared/SortableBoard";
import { flagCdnUrl } from "@/lib/international-display";
import { fmtPop, type Pop2100Bloc, type Pop2100IndexRow } from "@/lib/population2100Shape";

// The ranking table for /countries/2100, on SortableBoard: every column
// sorts on desktop (heading) and on the phone (select), the rank is the
// position under the current sort, and every row carries its flag (§7:
// flag emoji never render on Windows, so flagCdnUrl images).
//
// Column order (Ashwin, 2026-09-10, three rulings): 2100 first; the
// MULTIPLE and the PEAK next, because they are the two columns a reader must
// see before any sideways scroll (§4, value before metadata); then the
// decades DOWN from 2090, with the CURRENT YEAR in its place among them,
// highlighted, carrying the population this site tracks (countries.json)
// rather than a UN figure; then 2020, 2010, 2000 as UN estimates, dimmed;
// the 95% band last. The current-year column moves with the calendar until
// the 2030 projection; there is no 2025 column.
//
// Blocs sit in the same ranking as countries, marked with a chip instead of
// a flag: an organisation's current full members summed on the median, or a
// proposed union summed from its would-be members. No band for a bloc; the
// intervals are per country and do not add.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const NOW_BG = "color-mix(in srgb, var(--cat-6) 18%, transparent)";
const NOW_FG = "var(--cat-6)";

function Flag({ slug }: { slug: string }) {
  const url = flagCdnUrl(slug);
  if (!url) return <span aria-hidden className="inline-block w-[18px] h-[13px] rounded-sm flex-shrink-0" style={{ background: "var(--border)" }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden width={18} height={13} loading="lazy" decoding="async" className="inline-block rounded-sm object-contain flex-shrink-0 align-middle" />;
}

function BlocChip({ kind }: { kind: Pop2100Bloc["kind"] }) {
  return (
    <span
      className="inline-block rounded-sm px-1 text-[10px] uppercase tracking-wider flex-shrink-0 leading-[13px]"
      style={{ ...MONO, background: kind === "proposed" ? "var(--cat-3)" : "var(--accent)", color: "var(--bg)" }}
      title={kind === "proposed" ? "A proposed union, summed from its would-be members" : "An organisation's current full members, summed"}
    >
      {kind === "proposed" ? "proposed" : "bloc"}
    </span>
  );
}

type Kind = "country" | "org" | "proposed";
type Filter = "all" | Kind;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "country", label: "Countries" },
  { key: "org", label: "Blocs" },
  { key: "proposed", label: "Proposed" },
  { key: "all", label: "Everything" },
];
const CONTINENTS = ["Africa", "Asia", "Europe", "North America", "Oceania", "South America", "Global"];
// A bloc whose full members sit on this many continents or more is Global
// (OPEC, OECD, the G20, the Commonwealth, the UN), not a member of each;
// two continents (NATO, the Arab League) answers to both.
const GLOBAL_FROM = 3;

type Row = {
  key: string;
  kind: Kind;
  continents: string[];
  name: string;
  nameCell: ReactNode;
  nameMobile: ReactNode;
  path: number[];
  /** The population this site tracks today (countries.json), or the UN path at the current year. */
  now: number | null;
  y2050: number;
  y2100: number;
  multiple: number | null;
  peak: { year: number; value: number; past: boolean };
  band: [number, number] | null;
};

export default function Board2100({ rows, blocs, continents, nowYear, nowPop, pathStart, lastEstimate }: {
  rows: Pop2100IndexRow[];
  blocs: Pop2100Bloc[];
  continents: Record<string, string>;
  nowYear: number;
  nowPop: Record<string, number>;
  pathStart: number;
  lastEstimate: number;
}) {
  const pathAt = (path: number[], year: number) => { const i = year - pathStart; return i >= 0 && i < path.length ? path[i] : null; };
  const all: Row[] = [
    ...rows.map((r): Row => {
      const now = nowPop[r.slug] ?? pathAt(r.path, nowYear);
      return {
        key: r.slug,
        kind: "country",
        continents: continents[r.slug] ? [continents[r.slug]] : [],
        name: r.name,
        nameCell: <span className="block w-[150px] md:w-[190px] lg:w-[220px] whitespace-normal leading-tight"><span className="inline-block align-middle mr-1.5"><Flag slug={r.slug} /></span><Link href={`/countries/${r.slug}#population-2100`} className="hover:text-[var(--accent)] hover:underline align-middle">{r.name}</Link></span>,
        nameMobile: <><Flag slug={r.slug} /><Link href={`/countries/${r.slug}#population-2100`} className="hover:underline whitespace-normal leading-snug">{r.name}</Link></>,
        path: r.path, now, y2050: r.y2050.med, y2100: r.y2100.med,
        multiple: now ? +(r.y2100.med / now).toFixed(3) : null,
        peak: r.peak,
        band: r.y2100.lo95 != null && r.y2100.hi95 != null ? [r.y2100.lo95, r.y2100.hi95] : null,
      };
    }),
    ...blocs.map((b): Row => ({
      key: b.key,
      kind: b.kind,
      continents: (() => {
        const set = [...new Set(b.members.map((m) => continents[m]).filter((c): c is string => !!c))];
        return set.length >= GLOBAL_FROM ? ["Global"] : set;
      })(),
      name: b.name,
      nameCell: (
        // 🔴 THE WHOLE NAME, WRAPPED. Truncation made "Economic Community of West
        // African States" and "Economic Community of Central African States"
        // the same row (Ashwin, 2026-09-10); a bloc's row is as tall as its name.
        // The chip and the count are inline, so the name wraps across the whole column.
        <span className="block w-[150px] md:w-[190px] lg:w-[220px] whitespace-normal leading-tight" title={`${b.note}${b.missing.length ? ` Not counted (no UN row): ${b.missing.join(", ")}.` : ""}`}>
          <span className="inline-block align-middle mr-1.5"><BlocChip kind={b.kind} /></span>
          {b.href ? <a href={b.href} className="hover:text-[var(--accent)] hover:underline align-middle" rel={b.href.startsWith("http") ? "nofollow noopener" : undefined}>{b.name}</a> : <span className="align-middle">{b.name}</span>}
          <span className="ml-1.5 text-[10px] text-[var(--text-dim)] align-middle" style={MONO}>{b.members.length}</span>
        </span>
      ),
      nameMobile: <><BlocChip kind={b.kind} /><span className="whitespace-normal leading-snug">{b.name}</span><span className="flex-shrink-0 text-[10px] text-[var(--text-dim)]" style={MONO}>{b.members.length}</span></>,
      path: b.path, now: b.base, y2050: b.y2050, y2100: b.y2100, multiple: b.multiple2100,
      peak: b.peak,
      band: null,
    })),
  ];
  // One filter for both surfaces (Ashwin, 2026-09-10: "filter on individual
  // countries, blocs, everything, and ... proposed countries"). The rank is
  // the position within the filtered, sorted set.
  // Countries by default (Ashwin, 2026-09-10: "it gets confusing if you put the everything view").
  const [filter, setFilter] = useState<Filter>("country");
  const [continent, setContinent] = useState<string>("");
  const shown = all.filter((r) => (filter === "all" || r.kind === filter) && (!continent || r.continents.includes(continent)));
  const counts = { all: all.length, country: all.filter((r) => r.kind === "country").length, org: all.filter((r) => r.kind === "org").length, proposed: all.filter((r) => r.kind === "proposed").length };

  // The decades, descending, with the current year in its slot; the past
  // (UN estimates) is dimmed and the current year highlighted.
  const FUTURE = [2090, 2080, 2070, 2060, 2050, 2040, 2030];
  const PAST = [2020, 2010, 2000].filter((d) => d < nowYear);
  const at = (r: Row, year: number) => pathAt(r.path, year);
  const mult = (r: Row) => (r.multiple != null ? `${r.multiple.toFixed(2)}×` : "—");
  // "peaked 1989" when the peak is behind us, "2061" ahead, "after 2100" when it never turns.
  // 🔴 "Behind us" is judged against TODAY, not the UN's last estimate year: Germany
  // peaked in 2024 and that is the past in 2026 (Ashwin, 2026-09-10), whatever the
  // data file's `past` flag (which is "within the estimates") says.
  const peaked = (r: Row) => r.peak.year <= nowYear;
  const peakText = (r: Row) => (r.peak.year >= 2100 ? "after 2100" : peaked(r) ? `peaked ${r.peak.year}` : String(r.peak.year));
  const num = (v: number | null, cls = "text-[var(--text-muted)]") => (
    <span className={`tabular-nums ${cls}`} style={MONO}>{v == null ? "—" : fmtPop(v)}</span>
  );

  return (
    <div>
      <div role="group" aria-label="Show" className="inline-flex flex-wrap rounded-md border overflow-hidden mb-1 text-xs" style={{ borderColor: "var(--border)" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="px-2.5 py-1.5 min-h-[44px] sm:min-h-0"
            style={{ background: filter === f.key ? "var(--accent)" : "var(--bg-card)", color: filter === f.key ? "var(--bg)" : "var(--text-muted)" }}
          >
            {f.label} <span className="tabular-nums opacity-70" style={MONO}>{counts[f.key]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
        <label className="text-[var(--text-muted)]" htmlFor="continent-2100">Continent</label>
        <select
          id="continent-2100"
          value={continent}
          onChange={(e) => setContinent(e.target.value)}
          className="rounded-md border px-2 py-1.5 min-h-[44px] sm:min-h-0 text-xs max-w-full"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <option value="">All continents</option>
          {CONTINENTS.map((c) => (
            <option key={c} value={c}>{c} ({all.filter((r) => (filter === "all" || r.kind === filter) && r.continents.includes(c)).length})</option>
          ))}
        </select>
        <span className="text-[var(--text-dim)] tabular-nums" style={MONO}>{shown.length} shown</span>
        <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
          <span aria-hidden className="inline-block w-3 h-3 rounded-sm" style={{ background: NOW_BG, border: `1px solid ${NOW_FG}` }} />
          {nowYear} as tracked here; the rest is the UN
        </span>
      </div>
      <SortableBoard
        id="board-2100"
        compact
        mobileNoun="rows"
        mobileInitial={25}
        className="rounded-xl border"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        initial={{ key: "y2100", dir: "desc" }}
        cols={[
          { key: "name", label: "Country or bloc", className: "whitespace-nowrap" },
          { key: "y2100", label: "2100", right: true, title: "The UN median in 2100" },
          { key: "multiple", label: "Multiple", right: true, title: `2100 over ${nowYear}` },
          { key: "peak", label: "Peak", right: true, title: "The year the population peaks on the UN series (1950 to 2100)" },
          // Width tiers (§4): the identity, 2100, the multiple and the peak are
          // always there; the current year and 2050 from 640px; 2070 and 2030
          // from 768; 2080, 2060, 2040 from 1024; 2090, 2020 and 2000 from
          // 1280; 2010 and the band from 1536 (where the page widens to 7xl).
          // Measured 2026-09-10 so the table fits its container at every
          // breakpoint and never needs the scroll box; the phone list under
          // 640px carries the whole row.
          ...FUTURE.map((d) => ({ key: `y${d}`, label: String(d), right: true, demote: (d === 2050 ? "sm" : d === 2070 || d === 2030 ? "md" : d === 2090 ? "xl" : "lg") as "sm" | "md" | "lg" | "xl" })),
          { key: "now", label: <span style={{ color: NOW_FG }}>{nowYear}</span>, right: true, demote: "sm" as const, title: `The population this site tracks for ${nowYear} (official estimates); a bloc is its members summed`, className: "whitespace-nowrap", tdStyle: { background: NOW_BG }, short: `${nowYear} (tracked here)` },
          ...PAST.map((d) => ({ key: `y${d}`, label: String(d), right: true, demote: (d === 2010 ? "2xl" : "xl") as "xl" | "2xl", title: `UN estimate, ${d}` })),
          { key: "band", label: "95% band, 2100", right: true, demote: "2xl" as const, title: "The UN's own prediction interval at 2100; sorts on its width. Blocs have none: intervals do not add." },
        ]}
        rows={shown.map((r) => ({
          key: r.key,
          sort: {
            name: r.name,
            y2100: r.y2100,
            multiple: r.multiple,
            peak: r.peak.year,
            ...Object.fromEntries([...FUTURE, ...PAST].map((d) => [`y${d}`, at(r, d)])),
            now: r.now,
            band: r.band ? r.band[1] - r.band[0] : null,
          },
          cells: [
            r.nameCell,
            <span key="a" className="tabular-nums font-semibold" style={MONO}>{fmtPop(r.y2100)}</span>,
            <span key="m" className="tabular-nums font-semibold" style={{ ...MONO, color: (r.multiple ?? 1) < 1 ? "var(--div-neg)" : "var(--div-pos)" }}>{mult(r)}</span>,
            <span key="p" className="tabular-nums whitespace-nowrap" style={{ ...MONO, color: peaked(r) ? "var(--div-neg)" : undefined }} title={`${fmtPop(r.peak.value)} at the peak`}>{peakText(r)}</span>,
            ...FUTURE.map((d) => <span key={d}>{num(at(r, d))}</span>),
            <span key="now" className="tabular-nums font-semibold" style={MONO}>{r.now == null ? "—" : fmtPop(r.now)}</span>,
            ...PAST.map((d) => <span key={d}>{num(at(r, d), "text-[var(--text-dim)]")}</span>),
            <span key="b" className="tabular-nums text-[var(--text-muted)] whitespace-nowrap" style={MONO}>{r.band ? `${fmtPop(r.band[0])}–${fmtPop(r.band[1])}` : <span className="text-[var(--text-dim)]" title="Intervals do not add across a bloc">—</span>}</span>,
          ],
          mobile: {
            name: r.nameMobile,
            sub: <><span style={{ color: NOW_FG }}>{fmtPop(r.now)} in {nowYear}</span> · 2050 {fmtPop(r.y2050)} · {peakText(r)} · {fmtPop(at(r, 2000))} in 2000</>,
            right: fmtPop(r.y2100),
            rightSub: mult(r),
          },
        }))}
      />
    </div>
  );
}
