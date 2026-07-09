"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { monogramForFootball } from "@/lib/football-colors";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import type { ContinentalSection } from "@/lib/football";

type Row = {
  year: number | null;
  continent: string;
  tournament: string | null;
  champion: string | null;
  champion_slug: string | null;
  runner_up: string | null;
  runner_up_slug: string | null;
};

type SortKey = "year" | "continent" | "tournament";

function ColorBall({ slug, name }: { slug: string | null; name: string | null }) {
  if (!name) return null;
  const m = monogramForFootball(name, slug ?? undefined);
  return <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 18, height: 18, fontSize: 8, fontWeight: 700 }} aria-hidden>{m.mono}</span>;
}

function ClubCell({ name, slug }: { name: string | null; slug: string | null }) {
  if (!name) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <TeamCrest name={name} size={18} fallback={<ColorBall slug={slug} name={name} />} />
      {slug ? <Link href={`/teams/football/${slug}`} className="hover:underline font-medium">{name}</Link> : <span className="font-medium">{name}</span>}
    </span>
  );
}

export default function ContinentalTable({ sections }: { sections: ContinentalSection[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("year");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const sec of sections) {
      for (const f of sec.finals) {
        out.push({
          year: f.year,
          continent: sec.continent,
          tournament: f.competition,
          champion: f.champion,
          champion_slug: f.champion_slug,
          runner_up: f.runner_up,
          runner_up_slug: f.runner_up_slug,
        });
      }
    }
    return out;
  }, [sections]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "year") cmp = (a.year ?? 0) - (b.year ?? 0);
      else if (sortKey === "continent") cmp = a.continent.localeCompare(b.continent) || (b.year ?? 0) - (a.year ?? 0);
      else cmp = (a.tournament ?? "").localeCompare(b.tournament ?? "") || (b.year ?? 0) - (a.year ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggle(k: SortKey) {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "year" ? "desc" : "asc"); }
  }

  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={`py-3 px-3 text-left font-medium cursor-pointer select-none hover:text-[var(--text)] ${className ?? ""}`} onClick={() => toggle(k)} style={{ color: sortKey === k ? "var(--text)" : undefined }}>
      <span className="inline-flex items-center gap-1">{label}{sortKey === k && <span aria-hidden style={{ color: "var(--accent)" }}>{sortDir === "asc" ? "▲" : "▼"}</span>}</span>
    </th>
  );

  return (
    <div>
      {/* Mobile: one stacked card per final instead of a 5-column table. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {sorted.map((r, i) => (
          <div
            key={`${r.year}-${r.continent}-${r.tournament}-${i}-card`}
            className="rounded-lg border p-3"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.tournament ?? "—"}</div>
                <div className="text-xs text-[var(--text-muted)]">{r.continent}</div>
              </div>
              <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{r.year ?? "—"}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Champion</div>
                <ClubCell name={r.champion} slug={r.champion_slug} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                <ClubCell name={r.runner_up} slug={r.runner_up_slug} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm tabular-nums min-w-[640px]">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <Th k="year" label="Year" className="w-16" />
              <Th k="continent" label="Continent" />
              <Th k="tournament" label="Tournament" />
              <th className="py-3 px-3 text-left font-medium">Champion</th>
              <th className="py-3 px-3 text-left font-medium">Runner-up</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={`${r.year}-${r.continent}-${r.tournament}-${i}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 text-[var(--text-muted)]">{r.year ?? "—"}</td>
                <td className="py-1.5 px-3 text-[var(--text-muted)] whitespace-nowrap">{r.continent}</td>
                <td className="py-1.5 px-3 text-[var(--text-muted)] text-xs whitespace-nowrap">{r.tournament ?? "—"}</td>
                <td className="py-1.5 px-3"><ClubCell name={r.champion} slug={r.champion_slug} /></td>
                <td className="py-1.5 px-3 text-[var(--text-muted)]"><ClubCell name={r.runner_up} slug={r.runner_up_slug} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
