"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

type Belligerent = { name: string; slug: string | null; principal: boolean };
type War = {
  name: string; url: string; start: string | null; end: string | null;
  ongoing: boolean; major: boolean; deathsMin: number | null; deathsMax: number | null;
  sideA: Belligerent[]; sideB: Belligerent[];
};
type SortKey = "start" | "deaths";

function years(w: War): string {
  const s = w.start ? w.start.slice(0, 4) : "?";
  if (w.ongoing) return `${s}–present`;
  const e = w.end ? w.end.slice(0, 4) : "";
  return e && e !== s ? `${s}–${e}` : s;
}
function deaths(w: War): string {
  const f = (n: number | null) => (n == null ? "" : n.toLocaleString("en-US"));
  if (w.deathsMin == null) return "—";
  if (w.deathsMax == null || w.deathsMax === w.deathsMin) return `${f(w.deathsMin)}+`;
  return `${f(w.deathsMin)}–${f(w.deathsMax)}`;
}
function Side({ list }: { list: Belligerent[] }) {
  return (
    <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
      {list.map((b, i) => {
        const inner = b.principal ? <strong>{b.name}</strong> : <>{b.name}</>;
        return (
          <span key={`${b.name}-${i}`} className="whitespace-nowrap">
            {b.slug ? (
              <Link href={`/countries/${b.slug}`} className="hover:text-[var(--accent)] hover:underline">{inner}</Link>
            ) : (
              <span className="text-[var(--text-dim)]">{inner}</span>
            )}
            {i < list.length - 1 ? <span className="text-[var(--text-dim)]">,</span> : null}
          </span>
        );
      })}
    </span>
  );
}

export default function ConflictsTable({ wars }: { wars: War[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "ongoing" | "major">("all");
  const [sortKey, setSortKey] = useState<SortKey>("start");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [announce, setAnnounce] = useState("");

  function toggle(k: SortKey) {
    if (sortKey === k) setDir(dir === "desc" ? "asc" : "desc");
    else { setSortKey(k); setDir("desc"); }
  }
  const arrow = (k: SortKey) => (sortKey !== k ? "" : dir === "desc" ? " ↓" : " ↑");

  const rows = useMemo(() => {
    let r = wars;
    if (filter === "ongoing") r = r.filter((w) => w.ongoing);
    else if (filter === "major") r = r.filter((w) => w.major);
    if (q) {
      const s = q.toLowerCase();
      r = r.filter((w) =>
        w.name.toLowerCase().includes(s) ||
        [...w.sideA, ...w.sideB].some((b) => b.name.toLowerCase().includes(s)));
    }
    const out = [...r];
    out.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortKey === "start") { av = a.start ?? ""; bv = b.start ?? ""; }
      else { av = a.deathsMin ?? -1; bv = b.deathsMin ?? -1; }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [wars, q, filter, sortKey, dir]);

  const btn = (v: "all" | "ongoing" | "major", label: string) => (
    <button onClick={() => setFilter(v)}
      className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
        filter === v ? "bg-[var(--accent)] text-black"
        : "bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]"}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{btn("all", "All")}{btn("ongoing", "Ongoing")}{btn("major", "10,000+ deaths")}</div>
      <input type="text" placeholder="Search a war or a country (e.g. Vietnam, India, Six-Day)…"
        value={q} onChange={(e) => setQ(e.target.value)}
        className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]" />
      {/* Mobile sort control: the desktop header cells (onClick={() => toggle(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same sortKey/dir state - a Sort-by select (reuses toggle,
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
              toggle(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="start">Years</option>
            <option value="deaths">Combat deaths</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            toggle(sortKey);
            setAnnounce(`Sort direction: ${dir === "asc" ? "descending" : "ascending"}`);
          }}
          aria-label={dir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {dir === "asc" ? "▲" : "▼"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Mobile: stacked cards, same sorted/filtered data as the table */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {rows.map((w) => (
          <div key={w.name + w.start} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <div className="flex items-start justify-between gap-2">
              <a href={w.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-[var(--text)] hover:text-[var(--accent)] hover:underline">
                {w.name}
                {w.major ? <span className="ml-1.5 text-[10px] text-red-500" title="10,000+ combat deaths">●</span> : null}
              </a>
              <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{years(w)}</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-[var(--text-muted)]">
              <Side list={w.sideA} />
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">vs</span>
              <Side list={w.sideB} />
            </div>
            <div className="mt-1.5 text-xs text-[var(--text-dim)]">Combat deaths: {deaths(w)}</div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]" style={{ backgroundColor: "var(--bg-card)" }}>
              <th className="px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Conflict</th>
              <th className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] whitespace-nowrap" onClick={() => toggle("start")}>Years{arrow("start")}</th>
              <th className="px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Belligerents</th>
              <th className="px-4 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] whitespace-nowrap" onClick={() => toggle("deaths")}>Combat deaths{arrow("deaths")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.name + w.start} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors align-top">
                <td className="px-4 py-3">
                  <a href={w.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--text)] hover:text-[var(--accent)] hover:underline">{w.name}</a>
                  {w.major ? <span className="ml-1.5 text-[10px] text-red-500" title="10,000+ combat deaths">●</span> : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-[var(--text-muted)]">{years(w)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 text-[var(--text-muted)]">
                    <Side list={w.sideA} />
                    <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">vs</span>
                    <Side list={w.sideB} />
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--text-dim)] whitespace-nowrap">{deaths(w)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--text-dim)]">{rows.length} of {wars.length} wars · bold = principal belligerent · red ● = 10,000+ combat deaths</p>
    </div>
  );
}
