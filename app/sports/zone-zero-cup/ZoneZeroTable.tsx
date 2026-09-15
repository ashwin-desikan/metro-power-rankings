"use client";

import Link from "next/link";
import { flagCdnUrl } from "@/lib/international-display";
import { Fragment, useMemo, useState } from "react";
import { CappedList } from "@/app/_shared/Disclosure";

// Interactive Zone Zero Cup table. Plain serializable rows come from the server
// page. A view toggle switches the ranking basis (overall merit / per capita /
// per GDP); a region filter narrows by continent; a sport filter switches to a
// per-sport view showing that sport's merit contribution and the nation's world
// ranking in it; any column header sorts.

export type ZzcRow = {
  slug: string;
  countrySlug: string | null;
  name: string;
  continent: string | null;
  merit: number;
  rank: number;
  tier: string | null;
  meritWinter: number | null;
  rankWinter: number | null;
  sportMeritWinter: Record<string, number>;
  meritSummer: number | null;
  rankSummer: number | null;
  move: "up" | "down" | "flat" | null;
  movePct: number | null;
  moveVsMedian: number | null;
  meritPerCapita: number | null;
  rankPerCapita: number | null;
  meritPerGdp: number | null;
  rankPerGdp: number | null;
  majorTitles: number;
  bestRank: number | null;
  bestRankSport: string | null;
  topSports: { sport: string; pts: number }[];
  sportMerit: Record<string, number>;
  sportRank: Record<string, number>;
  nationalSports: { sport: string; pts: number }[];
  suspended: boolean;
  defunct: boolean;
};

type View = "overall" | "percapita" | "pergdp" | "winter" | "summer";
type SortKey = "rank" | "name" | "merit" | "titles" | "best";

const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ALL = "All";

// Winter and Summer are the two views that rank WITHIN a group rather than
// blending. The Cup's headline folds winter merit in at winterWeight 0.5, which
// makes the position of Norway, Austria and Canada partly an artefact of a
// constant; these two show what each half looks like on its own. Winter is
// recomputed at weight 1.0 upstream, or it would be the blend again at half
// scale. Norway is 20th overall, 3rd on winter and 25th on summer, which is the
// kind of thing the single number hides.
const VIEWS: { key: View; label: string; blurb: string }[] = [
  { key: "overall", label: "Overall", blurb: "Total sporting merit." },
  { key: "percapita", label: "Per capita", blurb: "Merit per million people." },
  { key: "pergdp", label: "Per GDP", blurb: "Merit per trillion dollars of GDP." },
  { key: "winter", label: "Winter", blurb: "Winter-sport merit alone, unblended, ranked among nations that score in one." },
  { key: "summer", label: "Summer", blurb: "Everything that is not a winter sport, ranked on its own." },
];

function rowRank(r: ZzcRow, v: View): number | null {
  if (v === "percapita") return r.rankPerCapita;
  if (v === "pergdp") return r.rankPerGdp;
  if (v === "winter") return r.rankWinter;
  if (v === "summer") return r.rankSummer;
  return r.rank;
}
function rowMerit(r: ZzcRow, v: View): number | null {
  if (v === "percapita") return r.meritPerCapita;
  if (v === "pergdp") return r.meritPerGdp;
  if (v === "winter") return r.meritWinter;
  if (v === "summer") return r.meritSummer;
  return r.merit;
}

// Tier letter. A badge, not a colour scale: the point is that a reader can scan
// 240 rows and see the shape, and colour-coding seven bands would fight the
// gold the board already uses for rank.
function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-[var(--text-dim)]">-</span>;
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none border"
      style={{ ...mono, borderColor: "var(--border)", color: tier === "A" ? GOLD : "var(--text-dim)" }}
    >
      {tier}
    </span>
  );
}

// Movement against the median change of the nation's own continent, NOT against
// zero. With an 8-year half-life every nation drifts every week, so an absolute
// arrow would mostly report which flagship tournaments happened to fall in the
// window. Hidden entirely until the history holds two snapshots.
function MoveArrow({ row }: { row: ZzcRow }) {
  if (!row.move || row.moveVsMedian == null) return <span className="text-[var(--text-dim)]">-</span>;
  const glyph = row.move === "up" ? "▲" : row.move === "down" ? "▼" : "▪";
  const colour =
    row.move === "up" ? "var(--pos, #2e9e5b)" : row.move === "down" ? "var(--neg, #c2453f)" : "var(--text-dim)";
  const sign = row.moveVsMedian > 0 ? "+" : "";
  return (
    <span style={{ ...mono, color: colour }} title={`${sign}${row.moveVsMedian}pp vs the median nation in ${row.continent ?? "its group"}`}>
      {glyph}
    </span>
  );
}

// Which season a sport belongs to. The winter set is emitted by
// scripts/zzc_v1_multipillar.py (derived from the medal data, not hardcoded),
// and summer is defined as its complement so a sport can never be in neither.
type Season = "winter" | "summer" | null;

function seasonOf(v: View): Season {
  return v === "winter" ? "winter" : v === "summer" ? "summer" : null;
}

function makeInSeason(season: Season, winterSet: Set<string>) {
  if (!season) return () => true;
  return (sport: string) => (season === "winter" ? winterSet.has(sport) : !winterSet.has(sport));
}

// Expandable per-sport breakdown of a nation's score: every sport it scores in,
// split into the best-N that are counted toward the (capped) total and the rest
// that fall outside it, each with the nation's world ranking where one exists.
//
// In a season view this is filtered to that season's sports ONLY. Showing a
// nation's cricket score under a Winter ranking was the single most confusing
// thing about the first version of these views: the number at the top of the
// row was winter-only while everything the reader could expand underneath it
// was the whole Cup, so the two disagreed and neither said which it was.
function Breakdown({
  row,
  cap,
  season,
  inSeason,
}: {
  row: ZzcRow;
  cap: number;
  season: Season;
  inSeason: (sport: string) => boolean;
}) {
  // Winter reads its OWN per-sport map, emitted at winterWeight 1.0, so these
  // lines sum to the winter total in the row above. Reading the blended
  // sportMerit here would show a 38.0 header over lines summing to about 19.
  const source = season === "winter" ? row.sportMeritWinter : row.sportMerit;
  const entries = Object.entries(source)
    .filter(([sp]) => inSeason(sp))
    .sort((a, b) => b[1] - a[1]);
  const counted = entries.slice(0, cap);
  const rest = entries.slice(cap);
  // The recognition bonus is a sport like any other and follows the same rule:
  // motorsport has no business appearing under a winter ranking.
  const national = row.nationalSports.filter((ns) => inSeason(ns.sport));

  function Line({ n, sport, merit, gold }: { n: number; sport: string; merit: number; gold: boolean }) {
    const wr = row.sportRank[sport];
    return (
      <div className="flex items-baseline justify-between gap-2 py-0.5 border-b" style={{ borderColor: "var(--border)" }}>
        <span className="text-[13px] truncate">
          <span className="text-[var(--text-dim)] tabular-nums" style={mono}>{n}. </span>
          {sport}
          {wr ? <span className="text-[11px] text-[var(--text-dim)]"> #{wr}</span> : null}
        </span>
        <span className="text-[13px] tabular-nums flex-shrink-0" style={{ ...mono, color: gold ? GOLD : "var(--text-dim)" }}>
          {merit.toFixed(1)}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)] mb-1.5">
        {season ? `${season} sports only — ` : ""}
        Best {Math.min(cap, entries.length)} international sports — counted toward {row.name}&apos;s
        {season ? ` ${season}` : ""} score
        {row.suspended ? ", after the suspension penalty" : ""}
      </div>
      {entries.length === 0 && (
        <div className="text-[13px] text-[var(--text-dim)]">
          {row.name} scores in no {season} sport.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5">
        {counted.map(([sp, m], idx) => <Line key={sp} n={idx + 1} sport={sp} merit={m} gold />)}
      </div>
      {national.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)] mt-3 mb-1.5">
            National sports — recognition bonus, added on top
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5">
            {national.map((ns) => (
              <div key={ns.sport} className="flex items-baseline justify-between gap-2 py-0.5 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-[13px] truncate">{ns.sport}</span>
                <span className="text-[13px] tabular-nums flex-shrink-0" style={{ ...mono, color: "var(--accent)" }}>+{ns.pts.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)] mt-3 mb-1.5">
            Other sports — not counted (beyond the best {cap})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5">
            {rest.map(([sp, m], idx) => <Line key={sp} n={cap + idx + 1} sport={sp} merit={m} gold={false} />)}
          </div>
        </>
      )}
    </div>
  );
}

export default function ZoneZeroTable({
  rows,
  regions,
  sports,
  moveWeeks = 0,
  winterSports = [],
}: {
  rows: ZzcRow[];
  regions: string[];
  sports: string[];
  /** Weeks between the two snapshots the arrows compare. 0 means the history
      holds a single point, and the whole column stays out of the DOM rather
      than rendering 240 dashes that look like missing data. */
  moveWeeks?: number;
  /** Canonical winter sport names, from _meta.method.winterSports. Everything
      not in here is summer. Drives every column in a season view, not just the
      total. */
  winterSports?: string[];
}) {
  const [view, setView] = useState<View>("overall");
  const [region, setRegion] = useState<string>(ALL);
  const [sport, setSport] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState("");

  const sportMode = sport !== ALL;
  const CAP = 10; // best-N sports that count toward a nation's score

  // A season view filters EVERY column, not just the total. The first version
  // filtered only the score, so a nation ranked on winter merit still showed
  // its best cricket world ranking beside it and its full all-sport breakdown
  // underneath. Two different questions answered in one row.
  const season = seasonOf(view);
  const winterSet = useMemo(() => new Set(winterSports), [winterSports]);
  const inSeason = useMemo(() => makeInSeason(season, winterSet), [season, winterSet]);

  /** Best world ranking among the sports of the active season, or the nation's
      overall best when no season is selected. */
  function seasonBest(r: ZzcRow): { rank: number | null; sport: string | null } {
    if (!season) return { rank: r.bestRank, sport: r.bestRankSport };
    let best: { rank: number | null; sport: string | null } = { rank: null, sport: null };
    for (const [sp, rk] of Object.entries(r.sportRank)) {
      if (!inSeason(sp) || !rk) continue;
      if (best.rank == null || rk < best.rank) best = { rank: rk, sport: sp };
    }
    return best;
  }

  /** The strongest sports cell, scoped to the season. Reads sportMerit rather
      than the precomputed topSports, which is an all-sport top five and would
      leave most winter nations with an empty cell. */
  function seasonStrongest(r: ZzcRow): string {
    const src = season === "winter" ? r.sportMeritWinter : r.sportMerit;
    const fromMerit = Object.entries(src)
      .filter(([sp]) => inSeason(sp))
      .map(([sp, pts]) => ({ sport: sp, pts }));
    const fromNational = r.nationalSports.filter((ns) => inSeason(ns.sport));
    return [...fromMerit, ...fromNational]
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 4)
      .map((s) => s.sport)
      .join(", ");
  }

  function toggleExpand(slug: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  // global standing within the selected sport (by that sport's merit), so the
  // # column is a true world position regardless of the region filter or sort
  const sportPos = useMemo(() => {
    const m = new Map<string, number>();
    if (!sportMode) return m;
    rows
      .filter((r) => r.sportMerit[sport] != null)
      .sort((a, b) => (b.sportMerit[sport] ?? 0) - (a.sportMerit[sport] ?? 0))
      .forEach((r, i) => m.set(r.slug, i + 1));
    return m;
  }, [rows, sport, sportMode]);

  const filtered = useMemo(() => {
    let out = rows;
    if (sportMode) out = out.filter((r) => r.sportMerit[sport] != null);
    else if (view !== "overall") out = out.filter((r) => rowMerit(r, view) != null);
    if (region !== ALL) out = out.filter((r) => r.continent === region);
    return out;
  }, [rows, sportMode, sport, view, region]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "best") {
        const ar = sportMode ? a.sportRank[sport] : a.bestRank;
        const br = sportMode ? b.sportRank[sport] : b.bestRank;
        cmp = (ar ?? 9999) - (br ?? 9999);
      } else if (sortKey === "merit") {
        const av = sportMode ? a.sportMerit[sport] : rowMerit(a, view);
        const bv = sportMode ? b.sportMerit[sport] : rowMerit(b, view);
        cmp = (av ?? -1) - (bv ?? -1);
      } else {
        const ar = sportMode ? sportPos.get(a.slug) : rowRank(a, view);
        const br = sportMode ? sportPos.get(b.slug) : rowRank(b, view);
        cmp = (ar ?? 99999) - (br ?? 99999);
      }
      return cmp * dir;
    });
    return out;
  }, [filtered, sortKey, dir, view, sportMode, sport, sportPos]);

  function toggle(key: SortKey) {
    if (sortKey === key) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setDir(key === "merit" || key === "titles" ? -1 : 1);
    }
  }

  function reset() {
    setRegion(ALL);
    setSport(ALL);
    setSortKey("rank");
    setDir(1);
    setExpanded(new Set());
  }

  const arrow = (key: SortKey) => (sortKey === key ? (dir === 1 ? " ▲" : " ▼") : "");
  const hasState = region !== ALL || sport !== ALL || sortKey !== "rank" || dir !== 1;
  // One entry per view. This was a ternary chain ending in "Per $T", so adding
  // Winter and Summer silently labelled their merit column "Per $T" -- per
  // trillion dollars of GDP, which has nothing to do with either. A map cannot
  // fall through to the wrong branch when the next view is added.
  const MERIT_LABEL: Record<View, string> = {
    overall: "Merit",
    percapita: "Per M",
    pergdp: "Per $T",
    winter: "Winter merit",
    summer: "Summer merit",
  };
  const meritLabel = sportMode ? `${sport} merit` : MERIT_LABEL[view];

  // Decimals per view, for the same reason the label is a map. Winter merit
  // tops out around 44 and summer around 142, so both want one decimal rather
  // than the whole-number rounding the overall column uses.
  const MERIT_DP: Record<View, number> = {
    overall: 0, percapita: 2, pergdp: 1, winter: 1, summer: 1,
  };
  const fmtMerit = (v: number) => v.toFixed(sportMode ? 1 : MERIT_DP[view]);

  function Th({ label, k, right }: { label: string; k: SortKey; right?: boolean }) {
    const active = sortKey === k;
    return (
      <th
        className={`py-2 px-3 font-medium select-none cursor-pointer hover:text-[var(--accent)] ${right ? "text-right" : "text-left"}`}
        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
        onClick={() => toggle(k)}
        aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}
        scope="col"
      >
        {label}
        <span aria-hidden style={mono}>{arrow(k)}</span>
      </th>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* view toggle — only meaningful for the overall table */}
        {!sportMode && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wide text-[var(--text-dim)]">Ranking</span>
            <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {VIEWS.map((v) => {
                const active = view === v.key;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setView(v.key)}
                    className="px-3 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: active ? "var(--accent)" : "var(--bg-card)",
                      color: active ? "var(--bg)" : "var(--text-muted)",
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* sport filter */}
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Sport</span>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value={ALL}>All sports</option>
            {sports.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {/* region filter */}
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value={ALL}>All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={reset}
          disabled={!hasState}
          className="rounded-lg border px-3 py-2 text-sm font-medium enabled:hover:text-[var(--accent)] enabled:hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-default"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          Reset
        </button>

        <div className="ml-auto self-center text-xs text-[var(--text-muted)]">
          <strong className="text-[var(--text)] tabular-nums" style={mono}>{sorted.length}</strong>
          {sorted.length === 1 ? " nation" : " nations"}
        </div>
      </div>

      {/* A season view changes what EVERY number on the page means, so it says
          so once, loudly, rather than leaving the reader to infer it from a
          column header. It also names the sports in scope: "winter sports" is
          not self-evidently seventeen specific things. */}
      {season && !sportMode && (
        <div
          className="rounded-lg border px-3 py-2 mb-3 text-xs"
          style={{ borderColor: GOLD, backgroundColor: "var(--bg-card)" }}
        >
          <span className="font-semibold uppercase tracking-wide" style={{ color: GOLD }}>
            {season === "winter" ? "Winter sports only" : "Summer sports only"}
          </span>
          <span className="text-[var(--text-muted)]">
            {" "}— every column below counts {season} sport and nothing else: the score, the world
            ranking, the strongest sports and the per-sport breakdown. Nations that score in no{" "}
            {season} sport are not listed.
          </span>
          {season === "winter" && winterSports.length > 0 && (
            <div className="mt-1 text-[11px] text-[var(--text-dim)]">
              In scope: {winterSports.join(", ")}.
            </div>
          )}
          {season === "summer" && winterSports.length > 0 && (
            <div className="mt-1 text-[11px] text-[var(--text-dim)]">
              Everything except {winterSports.join(", ")}.
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-[var(--text-dim)] mb-3">
        {sportMode
          ? `Each nation's merit contribution in ${sport} and its current world ranking in that sport, where one exists.`
          : VIEWS.find((v) => v.key === view)?.blurb}{" "}
        Click any column to sort, or the + on a row to see a nation&apos;s
        {season ? ` ${season}-sport` : " full per-sport"} breakdown.
        § currently suspended from international competition; ‡ defunct or composite state.
      </p>

      {/* Mobile sort control: the desktop header cells (onClick={() => toggle(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same sortKey/dir state. Sticky so it stays reachable on
          long lists instead of forcing a scroll back to the top. The
          aria-live span announces the change for screen-reader users, who
          otherwise get no signal that the (silently reordered) cards moved. */}
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
              toggle(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="rank">#</option>
            <option value="name">Nation</option>
            <option value="merit">{meritLabel}</option>
            <option value="best">World rank</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            toggle(sortKey);
            setAnnounce(`Sort direction: ${dir === 1 ? "descending" : "ascending"}`);
          }}
          aria-label={dir === 1 ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {dir === 1 ? "▲" : "▼"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Mobile: stacked cards, same sorted/filtered rows and expand state as the desktop table */}
      <div className="rounded-xl border overflow-hidden sm:hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <CappedList
          initial={12}
          noun="nations"
          items={sorted.map((r, i) => {
          const rk = sportMode ? sportPos.get(r.slug) : rowRank(r, view);
          const mt = sportMode ? r.sportMerit[sport] : rowMerit(r, view);
          const sb = sportMode ? null : seasonBest(r);
          const wr = sportMode ? r.sportRank[sport] : sb!.rank;
          const wrSport = sportMode ? sport : sb!.sport;
          const isOpen = expanded.has(r.slug);
          const strongest = !sportMode ? seasonStrongest(r) : "";
          return (
            <div key={`${r.slug}-card`} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleExpand(r.slug)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Hide" : "Show"} ${r.name} sport breakdown`}
                  className="leading-none text-[var(--text-dim)] hover:text-[var(--accent)] tabular-nums flex-shrink-0 mt-0.5 py-1"
                  style={mono}
                >
                  {isOpen ? "−" : "+"}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm leading-tight">
                        {flagCdnUrl(r.slug) ? <img src={flagCdnUrl(r.slug)!} alt="" width={20} height={15} className="inline-block rounded-[2px] mr-1.5 align-[-2px]" style={{ objectFit: "cover" }} loading="lazy" decoding="async" /> : null}
                        {r.countrySlug ? (
                          <Link href={`/countries/${r.countrySlug}`} className="hover:text-[var(--accent)] hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          <span>{r.name}</span>
                        )}
                        {r.suspended && (
                          <span title="Currently suspended from international competition" className="ml-1 cursor-default text-[var(--text-dim)]">§</span>
                        )}
                        {r.defunct && (
                          <span title="Defunct or composite state" className="ml-1 cursor-default text-[var(--text-dim)]">‡</span>
                        )}
                      </div>
                      {r.continent && <div className="text-[11px] text-[var(--text-dim)]">{r.continent}</div>}
                    </div>
                    <div className="text-xs tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>#{rk ?? i + 1}</div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                    <span className="tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>
                      {meritLabel}: {mt == null ? "—" : fmtMerit(mt)}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {wr ? (
                        <>
                          <span className="tabular-nums" style={mono}>#{wr}</span>
                          {!sportMode && wrSport ? <span className="text-[11px] text-[var(--text-dim)]"> {wrSport}</span> : null}
                        </>
                      ) : (
                        <span className="text-[var(--text-dim)]">—</span>
                      )}
                    </span>
                  </div>
                  {strongest && (
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">{strongest}</div>
                  )}
                </div>
              </div>
              {isOpen && (
                <div className="px-3 pb-3 pt-1" style={{ backgroundColor: "var(--bg)" }}>
                  <Breakdown row={r} cap={CAP} season={season} inSeason={inSeason} />
                </div>
              )}
            </div>
          );
        })}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs">
              <th className="w-7" scope="col" aria-label="Expand row" />
              <Th label="#" k="rank" right />
              <Th label="Nation" k="name" />
              {!sportMode && (
                <th className="py-2 px-3 font-medium text-left" style={{ color: "var(--text-muted)" }} scope="col" title="Merit band. The cuts are round numbers on merit, not equal-sized groups.">
                  Tier
                </th>
              )}
              <Th label={meritLabel} k="merit" right />
              {moveWeeks > 0 && !sportMode && (
                <th className="py-2 px-3 font-medium text-center" style={{ color: "var(--text-muted)" }} scope="col" title={`Change over ${moveWeeks} week(s), against the median nation of the same continent`}>
                  Move
                </th>
              )}
              <Th label={season ? `Best ${season} rank` : "World rank"} k="best" />
              {!sportMode && (
                <th className="py-2 px-3 font-medium text-left" style={{ color: "var(--text-muted)" }} scope="col">
                  {season ? `Strongest ${season} sports` : "Strongest sports"}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const rk = sportMode ? sportPos.get(r.slug) : rowRank(r, view);
              const mt = sportMode ? r.sportMerit[sport] : rowMerit(r, view);
              // In a season view the world ranking shown is the best one WITHIN
              // that season, not the nation's overall best. Austria's best rank
              // is not a winter fact just because we are looking at winter.
              const sb = sportMode ? null : seasonBest(r);
              const wr = sportMode ? r.sportRank[sport] : sb!.rank;
              const wrSport = sportMode ? sport : sb!.sport;
              const isOpen = expanded.has(r.slug);
              return (
                <Fragment key={r.slug}>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pl-3 pr-0 align-top">
                    <button
                      type="button"
                      onClick={() => toggleExpand(r.slug)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} ${r.name} sport breakdown`}
                      className="leading-none text-[var(--text-dim)] hover:text-[var(--accent)] tabular-nums"
                      style={mono}
                    >
                      {isOpen ? "−" : "+"}
                    </button>
                  </td>
                  <td className="py-2 px-3 align-top text-right tabular-nums" style={{ ...mono, color: "var(--text-dim)" }}>
                    {rk ?? i + 1}
                  </td>
                  <td className="py-2 px-3 align-top">
                    <div className="font-medium text-sm leading-tight">
                      {flagCdnUrl(r.slug) ? <img src={flagCdnUrl(r.slug)!} alt="" width={20} height={15} className="inline-block rounded-[2px] mr-1.5 align-[-2px]" style={{ objectFit: "cover" }} loading="lazy" decoding="async" /> : null}
                      {r.countrySlug ? (
                        <Link href={`/countries/${r.countrySlug}`} className="hover:text-[var(--accent)] hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        <span>{r.name}</span>
                      )}
                      {r.suspended && (
                        <span title="Currently suspended from international competition" className="ml-1 cursor-default text-[var(--text-dim)]">§</span>
                      )}
                      {r.defunct && (
                        <span title="Defunct or composite state" className="ml-1 cursor-default text-[var(--text-dim)]">‡</span>
                      )}
                    </div>
                    {r.continent && <div className="text-[11px] text-[var(--text-dim)]">{r.continent}</div>}
                  </td>
                  {!sportMode && (
                    <td className="py-2 px-3 align-top">
                      <TierBadge tier={r.tier} />
                    </td>
                  )}
                  <td className="py-2 px-3 align-top text-right tabular-nums" style={{ ...mono, color: GOLD }}>
                    {mt == null ? "" : fmtMerit(mt)}
                  </td>
                  {moveWeeks > 0 && !sportMode && (
                    <td className="py-2 px-3 align-top text-center">
                      <MoveArrow row={r} />
                    </td>
                  )}
                  <td className="py-2 px-3 align-top text-[var(--text-muted)] whitespace-nowrap">
                    {wr ? (
                      <span>
                        <span className="tabular-nums" style={mono}>#{wr}</span>
                        {!sportMode && wrSport ? <span className="text-[11px] text-[var(--text-dim)]"> {wrSport}</span> : null}
                      </span>
                    ) : (
                      <span className="text-[var(--text-dim)]">—</span>
                    )}
                  </td>
                  {!sportMode && (
                    <td className="py-2 px-3 align-top text-[var(--text-muted)] text-[13px]">
                      {seasonStrongest(r)}
                    </td>
                  )}
                </tr>
                {isOpen && (
                  <tr style={{ borderColor: "var(--border)" }} className="border-t">
                    {/* expand, #, Nation, [Tier], merit, [Move], World rank, [Strongest] */}
                    <td colSpan={sportMode ? 5 : 8 + (moveWeeks > 0 ? 1 : 0)} className="px-3 pt-1 pb-3" style={{ backgroundColor: "var(--bg)" }}>
                      <Breakdown row={r} cap={CAP} season={season} inSeason={inSeason} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
