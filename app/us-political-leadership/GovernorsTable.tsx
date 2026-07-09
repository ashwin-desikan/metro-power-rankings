"use client";
import { useState } from "react";
import Link from "next/link";

export type GovRow = {
  slug: string;
  name: string;
  href: string;
  gov: string;
  party: string;
  since: string;
  score: number;
  metros: number;
};

type SortKey = "name" | "gov" | "party" | "since" | "metros" | "score";

function partyClass(p: string): string {
  const s = p.toLowerCase();
  if (s.includes("republican")) return "text-red-700 dark:text-red-400";
  if (s.includes("democratic")) return "text-blue-700 dark:text-blue-400";
  return "text-[var(--text-muted)]";
}
function yr(d: string): string {
  return d ? d.slice(0, 4) : "—";
}

export default function GovernorsTable({
  rows,
  nameHeader,
}: {
  rows: GovRow[];
  nameHeader: string;
}) {
  const [key, setKey] = useState<SortKey>("name");
  const [dir, setDir] = useState<1 | -1>(1);
  const [announce, setAnnounce] = useState("");

  function sortBy(k: SortKey) {
    if (k === key) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setKey(k);
      setDir(k === "score" || k === "metros" ? -1 : 1);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (key === "score") {
      av = a.score;
      bv = b.score;
    } else if (key === "metros") {
      av = a.metros;
      bv = b.metros;
    } else if (key === "since") {
      av = a.since || "";
      bv = b.since || "";
    } else {
      av = (a[key] || "").toString().toLowerCase();
      bv = (b[key] || "").toString().toLowerCase();
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  function Th({
    k,
    label,
    right,
    hideOnMobile,
  }: {
    k: SortKey;
    label: string;
    right?: boolean;
    hideOnMobile?: boolean;
  }) {
    return (
      <th
        onClick={() => sortBy(k)}
        className={`py-2 px-4 cursor-pointer select-none hover:text-[var(--accent)] ${
          right ? "text-right" : ""
        } ${hideOnMobile ? "hidden sm:table-cell" : ""}`}
      >
        {label}
        {key === k ? (dir === 1 ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  return (
    <div>
      {/* Mobile sort control: the desktop header cells (onClick={() => sortBy(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same key/dir state. Sticky so it stays reachable on
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
            value={key}
            onChange={(e) => {
              const label = e.target.options[e.target.selectedIndex]?.text ?? "";
              sortBy(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="name">{nameHeader}</option>
            <option value="gov">Governor</option>
            <option value="party">Party</option>
            <option value="since">Since</option>
            <option value="metros">Metros</option>
            <option value="score">Metro score</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            sortBy(key);
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

      {/* Mobile: stacked cards instead of hiding the Since/Metros columns */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {sorted.map((r) => (
          <div
            key={`${r.slug}-card`}
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={r.href}
                  className="font-medium text-sm text-[var(--text)] hover:text-[var(--accent)]"
                >
                  {r.name}
                </Link>
                <div className="text-xs text-[var(--text)] mt-0.5">{r.gov}</div>
              </div>
              <span className={`text-xs font-medium flex-shrink-0 ${partyClass(r.party)}`}>{r.party}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Since</div>
                <div className="tabular-nums text-[var(--text-muted)]">{yr(r.since)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Metros</div>
                <div className="tabular-nums text-[var(--text-muted)]">{r.metros || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Metro score</div>
                <div className="tabular-nums text-[var(--text)] font-semibold">{r.score > 0 ? r.score.toFixed(1) : "—"}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="rounded-xl border overflow-x-auto hidden sm:block"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr
              className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]"
              style={{ borderColor: "var(--border)" }}
            >
              <Th k="name" label={nameHeader} />
              <Th k="gov" label="Governor" />
              <Th k="party" label="Party" />
              <Th k="since" label="Since" right />
              <Th k="metros" label="Metros" right />
              <Th k="score" label="Metro score" right />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.slug}
                className="border-b last:border-0"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="py-2 px-4">
                  <Link
                    href={r.href}
                    className="font-medium text-[var(--text)] hover:text-[var(--accent)]"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 px-4 text-[var(--text)]">{r.gov}</td>
                <td className={`py-2 px-4 font-medium ${partyClass(r.party)}`}>
                  {r.party}
                </td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)]">
                  {yr(r.since)}
                </td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)]">
                  {r.metros || "—"}
                </td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text)]">
                  {r.score > 0 ? r.score.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
