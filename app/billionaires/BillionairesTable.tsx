"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

type B = {
  rank: number | null; name: string; uri: string; networth: number | null;
  countryCode: string | null; countrySlug: string | null; countryName: string | null;
  industries: string[]; selfMade: boolean | null; age: number | null; source: string[];
};
type SortKey = "rank" | "networth" | "age" | "name";

function worth(m: number | null): string {
  if (m == null) return "—";
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(0)}M`;
}

export default function BillionairesTable({ data }: { data: B[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("All");
  const [industry, setIndustry] = useState("All");
  const [made, setMade] = useState<"all" | "self" | "inherited">("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState(100);

  const countries = useMemo(
    () => ["All", ...Array.from(new Set(data.map((b) => b.countryName).filter(Boolean) as string[])).sort()],
    [data]);
  const industries = useMemo(
    () => ["All", ...Array.from(new Set(data.flatMap((b) => b.industries))).sort()],
    [data]);

  function toggle(k: SortKey) {
    if (sortKey === k) setDir(dir === "desc" ? "asc" : "desc");
    else { setSortKey(k); setDir(k === "name" ? "asc" : k === "rank" ? "asc" : "desc"); }
  }
  const arrow = (k: SortKey) => (sortKey !== k ? "" : dir === "desc" ? " ↓" : " ↑");

  const rows = useMemo(() => {
    let r = data;
    if (country !== "All") r = r.filter((b) => b.countryName === country);
    if (industry !== "All") r = r.filter((b) => b.industries.includes(industry));
    if (made === "self") r = r.filter((b) => b.selfMade === true);
    else if (made === "inherited") r = r.filter((b) => b.selfMade === false);
    if (q) { const s = q.toLowerCase(); r = r.filter((b) => b.name.toLowerCase().includes(s)); }
    const out = [...r];
    out.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortKey === "name") { av = a.name; bv = b.name; }
      else if (sortKey === "rank") { av = a.rank ?? 1e9; bv = b.rank ?? 1e9; }
      else if (sortKey === "networth") { av = a.networth ?? -1; bv = b.networth ?? -1; }
      else { av = a.age ?? -1; bv = b.age ?? -1; }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [data, q, country, industry, made, sortKey, dir]);

  const shown = rows.slice(0, limit);
  const sel = "px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input type="text" placeholder="Search by name…" value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(100); }}
          className="flex-1 min-w-[200px] px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]" />
        <select className={sel} value={country} onChange={(e) => { setCountry(e.target.value); setLimit(100); }}>
          {countries.map((c) => <option key={c} value={c}>{c === "All" ? "All countries" : c}</option>)}
        </select>
        <select className={sel} value={industry} onChange={(e) => { setIndustry(e.target.value); setLimit(100); }}>
          {industries.map((c) => <option key={c} value={c}>{c === "All" ? "All industries" : c}</option>)}
        </select>
        <select className={sel} value={made} onChange={(e) => { setMade(e.target.value as "all" | "self" | "inherited"); setLimit(100); }}>
          <option value="all">Self-made & inherited</option>
          <option value="self">Self-made</option>
          <option value="inherited">Inherited</option>
        </select>
      </div>
      {/* Mobile: stacked cards, same sorted/filtered/limited data as the table */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {shown.map((b) => (
          <div key={`${b.uri}-card`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <div className="flex items-start justify-between gap-2">
              <a href={`https://www.forbes.com/profile/${b.uri}/`} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-[var(--text)] hover:text-[var(--accent)] hover:underline">
                {b.rank ? <span className="text-[var(--text-dim)] tabular-nums mr-1.5">#{b.rank}</span> : null}
                {b.name}
                {b.selfMade === false ? <span className="ml-1.5 text-[10px] text-[var(--text-dim)]">inherited</span> : null}
              </a>
              <span className="flex-shrink-0 tabular-nums font-semibold text-sm text-[var(--text)]">{worth(b.networth)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
              {b.countrySlug ? <Link href={`/countries/${b.countrySlug}`} className="hover:text-[var(--accent)] hover:underline">{b.countryName}</Link> : <span className="text-[var(--text-dim)]">{b.countryName ?? "—"}</span>}
              {b.age != null && <span className="tabular-nums text-[var(--text-dim)]">Age {b.age}</span>}
            </div>
            {(b.industries.length > 0 || b.source.length > 0) && (
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--text-dim)]">
                {b.industries.length > 0 && <span>{b.industries.join(", ")}</span>}
                {b.source.length > 0 && <span>{b.source.join(", ")}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]" style={{ backgroundColor: "var(--bg-card)" }}>
              <th className="px-3 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" onClick={() => toggle("rank")}>#{arrow("rank")}</th>
              <th className="px-3 py-3 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" onClick={() => toggle("name")}>Name{arrow("name")}</th>
              <th className="px-3 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] whitespace-nowrap" onClick={() => toggle("networth")}>Net worth{arrow("networth")}</th>
              <th className="px-3 py-3 text-left font-semibold text-[var(--text-muted)]">Country</th>
              <th className="px-3 py-3 text-left font-semibold text-[var(--text-muted)] hidden md:table-cell">Industry</th>
              <th className="px-3 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] hidden sm:table-cell" onClick={() => toggle("age")}>Age{arrow("age")}</th>
              <th className="px-3 py-3 text-left font-semibold text-[var(--text-muted)] hidden lg:table-cell">Source</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.uri} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors align-top">
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-dim)]">{b.rank ?? "—"}</td>
                <td className="px-3 py-2">
                  <a href={`https://www.forbes.com/profile/${b.uri}/`} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--text)] hover:text-[var(--accent)] hover:underline">{b.name}</a>
                  {b.selfMade === false ? <span className="ml-1.5 text-[10px] text-[var(--text-dim)]">inherited</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)] whitespace-nowrap">{worth(b.networth)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {b.countrySlug ? <Link href={`/countries/${b.countrySlug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{b.countryName}</Link> : <span className="text-[var(--text-dim)]">{b.countryName ?? "—"}</span>}
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)] hidden md:table-cell">{b.industries.join(", ")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-dim)] hidden sm:table-cell">{b.age ?? "—"}</td>
                <td className="px-3 py-2 text-[var(--text-dim)] hidden lg:table-cell">{b.source.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-dim)]">Showing {Math.min(limit, rows.length)} of {rows.length} {rows.length === 1 ? "billionaire" : "billionaires"}</p>
        {limit < rows.length ? (
          <button onClick={() => setLimit(limit + 200)} className="px-4 py-1.5 rounded-full text-sm font-medium bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]">Show more</button>
        ) : null}
      </div>
    </div>
  );
}
