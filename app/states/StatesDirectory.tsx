"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

type Gov = { name: string; party?: string; second?: { name: string; role: string } };
type Row = {
  slug: string; name: string; country: string; countrySlug: string;
  type: string; continent: string | null; pop: number | null;
  metroCount: number; score: number; weighted: boolean; rank: number;
};
type SortKey = "rank" | "name" | "country" | "pop" | "metroCount" | "score";

function fmtPop(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

export default function StatesDirectory({ rows, governors }: { rows: Row[]; governors: Record<string, Gov> }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [continent, setContinent] = useState("All");
  const [country, setCountry] = useState("All");
  const [q, setQ] = useState("");

  const continents = useMemo(
    () => ["All", ...Array.from(new Set(rows.map((r) => r.continent).filter(Boolean))).sort() as string[]],
    [rows]);
  const countries = useMemo(
    () => ["All", ...Array.from(new Set(rows.map((r) => r.country).filter(Boolean))).sort()],
    [rows]);

  function toggle(k: SortKey) {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === "name" || k === "country" || k === "rank" ? 1 : -1); }
  }

  const view = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let r = rows.filter((x) =>
      (continent === "All" || x.continent === continent) &&
      (country === "All" || x.country === country) &&
      (!ql || x.name.toLowerCase().includes(ql)));
    r = [...r].sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortKey === "rank") { av = a.rank; bv = b.rank; }
      else if (sortKey === "pop") { av = a.pop ?? -1; bv = b.pop ?? -1; }
      else if (sortKey === "metroCount") { av = a.metroCount; bv = b.metroCount; }
      else if (sortKey === "score") { av = a.score; bv = b.score; }
      else { av = (a[sortKey] || "").toString().toLowerCase(); bv = (b[sortKey] || "").toString().toLowerCase(); }
      if (av < bv) return -1 * dir; if (av > bv) return 1 * dir; return 0;
    });
    return r;
  }, [rows, continent, country, q, sortKey, dir]);

  const arrow = (k: SortKey) => (sortKey === k ? (dir === 1 ? " ▲" : " ▼") : "");

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {continents.map((c) => (
          <button key={c} onClick={() => setContinent(c)}
            className={`text-xs px-2.5 py-1 rounded-full border ${continent === c ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search states…"
          className="px-3 py-1.5 text-sm rounded-md border bg-transparent" style={{ borderColor: "var(--border)" }} />
        <select value={country} onChange={(e) => setCountry(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-md border" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)", color: "var(--text)" }}>
          {countries.map((c) => <option key={c} value={c}>{c === "All" ? "All countries" : c}</option>)}
        </select>
        <span className="text-xs text-[var(--text-dim)]">{view.length} of {rows.length}</span>
      </div>
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 px-4 cursor-pointer" onClick={() => toggle("name")}>State{arrow("name")}</th>
              <th className="py-2 px-4 text-right cursor-pointer" onClick={() => toggle("rank")}>Rank{arrow("rank")}</th>
              <th className="py-2 px-4 cursor-pointer" onClick={() => toggle("country")}>Country{arrow("country")}</th>
              <th className="py-2 px-4 hidden md:table-cell">Continent</th>
              <th className="py-2 px-4 hidden lg:table-cell">Leader</th>
              <th className="py-2 px-4 text-right cursor-pointer" onClick={() => toggle("pop")}>Population{arrow("pop")}</th>
              <th className="py-2 px-4 text-right hidden sm:table-cell cursor-pointer" onClick={() => toggle("metroCount")}>Metros{arrow("metroCount")}</th>
              <th className="py-2 px-4 text-right cursor-pointer" onClick={() => toggle("score")}>Score{arrow("score")}</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const g = governors[r.slug];
              return (
                <tr key={r.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-4">
                    <Link href={`/states/${r.slug}`} className="font-medium text-[var(--text)] hover:text-[var(--accent)]">{r.name}</Link>
                    {r.type && r.type !== "State" ? <span className="ml-1 text-[10px] text-[var(--text-dim)]">{r.type}</span> : null}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-[var(--text-dim)]">{r.rank}</td>
                  <td className="py-2 px-4">
                    <Link href={`/countries/${r.countrySlug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)]">{r.country}</Link>
                  </td>
                  <td className="py-2 px-4 text-[var(--text-muted)] hidden md:table-cell">{r.continent ?? "—"}</td>
                  <td className="py-2 px-4 text-[var(--text-muted)] hidden lg:table-cell">{g ? <>{g.name}{g.party ? <span className="text-[10px] text-[var(--text-dim)]"> {g.party}</span> : null}{g.second ? <span className="block text-[10px] text-[var(--text-dim)]">{g.second.name} ({g.second.role})</span> : null}</> : ""}</td>
                  <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)]">{fmtPop(r.pop)}</td>
                  <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell">{r.metroCount || ""}</td>
                  <td className="py-2 px-4 text-right tabular-nums text-[var(--text)]">{r.score > 0 ? r.score.toFixed(1) : "—"}{!r.weighted && r.score > 0 ? <span className="text-[var(--text-dim)]">*</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--text-dim)]">Score is the population-weighted sum of each state&rsquo;s metro scores; cross-state metros are split by the share of their population in the state. * marks states using the full-credit sum where municipality/county population was unavailable.</p>
    </div>
  );
}
