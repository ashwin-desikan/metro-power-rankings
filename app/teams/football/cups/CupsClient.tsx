"use client";
import { useState } from "react";
import Link from "next/link";
import type {
  DomesticCupCompetition,
  DomesticCupSeason,
  DomesticCupMatch,
  DomesticCupAggregateRow,
} from "@/lib/football";

function ClubName({ name, slug, gold = false }: { name: string | null; slug: string | null; gold?: boolean }) {
  if (!name) return <span className="text-[var(--text-dim)]">—</span>;
  const style = gold ? { color: "#b58900" } : undefined;
  const cls = gold ? "font-semibold" : "";
  return slug ? (
    <Link href={`/teams/football/${slug}`} className={`hover:text-[var(--accent)] hover:underline ${cls}`} style={style}>{name}</Link>
  ) : (
    <span className={cls} style={style}>{name}</span>
  );
}

function legNote(m: DomesticCupMatch): string {
  if (!m.note) return "";
  if (m.note === "1") return " · 1st leg";
  if (m.note === "2") return " · 2nd leg";
  return ` · ${m.note}`;
}

function MatchScore({ m }: { m: DomesticCupMatch }) {
  return (
    <span className="tabular-nums">
      <ClubName name={m.team} slug={m.team_slug} gold={m.trophy} />
      <span className="mx-1.5 text-[var(--text-muted)]">{m.for}–{m.ag}</span>
      <ClubName name={m.opp} slug={m.opp_slug} />
    </span>
  );
}

function SeasonCard({ s }: { s: DomesticCupSeason }) {
  const finals = s.matches.filter((m) => m.round === "Final");
  const semis = s.matches.filter((m) => m.round === "Semifinal");
  const venue = finals.find((m) => m.venue)?.venue ?? null;
  return (
    <div className="rounded-lg border p-3.5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold tabular-nums">{s.season}</span>
        <span aria-hidden style={{ color: "#b58900" }}>&#9733;</span>
        <ClubName name={s.champion} slug={s.champion_slug} gold />
        <span className="text-xs text-[var(--text-muted)]">def.</span>
        <ClubName name={s.runner_up} slug={s.runner_up_slug} />
      </div>

      <div className="mt-2 text-sm">
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-0.5">
          Final{venue ? ` · ${venue}` : ""}
        </div>
        {finals.map((m, i) => (
          <div key={i} className="py-0.5">
            <MatchScore m={m} />
            <span className="text-xs text-[var(--text-dim)]">{legNote(m)}</span>
          </div>
        ))}
      </div>

      {semis.length > 0 && (
        <div className="mt-2 text-sm">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-0.5">Semifinals</div>
          {semis.map((m, i) => (
            <div key={i} className="py-0.5 text-[var(--text-muted)]">
              <MatchScore m={m} />
              <span className="text-xs text-[var(--text-dim)]">{legNote(m)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function decadeOf(y: number | null): number | null {
  return y === null ? null : Math.floor(y / 10) * 10;
}

function CompetitionBrowser({ comp, anchor }: { comp: DomesticCupCompetition; anchor: string }) {
  const decades = Array.from(new Set(comp.seasons.map((s) => decadeOf(s.year)).filter((d): d is number => d !== null)))
    .sort((a, b) => b - a);
  const [decade, setDecade] = useState<number>(decades[0]);
  const seasons = comp.seasons.filter((s) => decadeOf(s.year) === decade);

  return (
    <section id={anchor} className="mb-12">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-lg font-semibold">{comp.name}</h2>
        <span className="text-xs text-[var(--text-dim)]">{comp.first_year}–{comp.last_year} · {comp.seasons.length} seasons</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {decades.map((d) => {
          const active = d === decade;
          return (
            <button
              key={d}
              onClick={() => setDecade(d)}
              className="text-xs px-2.5 py-1 rounded-full border transition-colors tabular-nums"
              style={{
                background: active ? "var(--accent)" : "var(--bg-card)",
                color: active ? "#fff" : "var(--text-muted)",
                borderColor: active ? "var(--accent)" : "var(--border)",
              }}
            >
              {d}s
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {seasons.map((s) => <SeasonCard key={s.season} s={s} />)}
      </div>
    </section>
  );
}

type SortKey =
  | "fa_sf" | "fa_f" | "fa_cups"
  | "lg_sf" | "lg_f" | "lg_cups"
  | "sf" | "f" | "cups";

function AggregateTable({ rows }: { rows: DomesticCupAggregateRow[] }) {
  const [sort, setSort] = useState<SortKey>("cups");
  const sorted = [...rows].sort((a, b) =>
    b[sort] - a[sort] || b.cups - a.cups || b.f - a.f || a.cur_name.localeCompare(b.cur_name));

  const SortTh = ({ k, label, lead = false }: { k: SortKey; label: string; lead?: boolean }) => (
    <th className={"py-1.5 px-2 text-right font-medium " + (lead ? "border-l" : "")} style={lead ? { borderColor: "var(--border)" } : undefined}>
      <button onClick={() => setSort(k)} className={"hover:text-[var(--text)] " + (sort === k ? "text-[var(--accent)] font-semibold" : "")}>
        {label}{sort === k ? " ↓" : ""}
      </button>
    </th>
  );
  const lead = { borderColor: "var(--border)" };

  const Cell = ({ v, last, lead = false, strong = false }: { v: number; last: number | null; lead?: boolean; strong?: boolean }) => (
    <td className={"py-1.5 px-2 text-right tabular-nums whitespace-nowrap " + (lead ? "border-l" : "")} style={lead ? { borderColor: "var(--border)" } : undefined}>
      {v ? (
        <>
          <span className={strong ? "font-semibold" : "text-[var(--text-muted)]"}>{v}</span>
          {last ? <span className="ml-1 text-[10px] text-[var(--text-dim)]">({last})</span> : null}
        </>
      ) : (
        <span className="text-[var(--text-dim)]">·</span>
      )}
    </td>
  );

  return (
    <section id="aggregate" className="mb-12">
      <h2 className="text-lg font-semibold mb-1">All-time cup record</h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        Semifinals reached (SF), finals reached (F) and cups won (Cup) for each competition, then the two combined.
        The year in parentheses is the most recent time each was achieved. Click any column to sort.
      </p>
      <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
              <th className="py-1.5 pl-4 pr-2 text-left"></th>
              <th className="py-1.5 px-2 text-center border-l" colSpan={3} style={lead}>FA Cup</th>
              <th className="py-1.5 px-2 text-center border-l" colSpan={3} style={lead}>League Cup</th>
              <th className="py-1.5 px-2 text-center border-l" colSpan={3} style={lead}>Combined</th>
            </tr>
            <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 pl-4 pr-2 text-left font-medium">Club</th>
              <SortTh k="fa_sf" label="SF" lead />
              <SortTh k="fa_f" label="F" />
              <SortTh k="fa_cups" label="Cup" />
              <SortTh k="lg_sf" label="SF" lead />
              <SortTh k="lg_f" label="F" />
              <SortTh k="lg_cups" label="Cup" />
              <SortTh k="sf" label="SF" lead />
              <SortTh k="f" label="F" />
              <SortTh k="cups" label="Cups" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.slug} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 pl-4 pr-2 whitespace-nowrap"><ClubName name={r.cur_name} slug={r.slug} /></td>
                <Cell v={r.fa_sf} last={r.fa_sf_last} lead /><Cell v={r.fa_f} last={r.fa_f_last} /><Cell v={r.fa_cups} last={r.fa_cups_last} strong />
                <Cell v={r.lg_sf} last={r.lg_sf_last} lead /><Cell v={r.lg_f} last={r.lg_f_last} /><Cell v={r.lg_cups} last={r.lg_cups_last} strong />
                <Cell v={r.sf} last={r.sf_last} lead /><Cell v={r.f} last={r.f_last} /><Cell v={r.cups} last={r.cups_last} strong />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function CupsClient({
  competitions,
  aggregate,
}: {
  competitions: { id: string; anchor: string; comp: DomesticCupCompetition }[];
  aggregate: DomesticCupAggregateRow[];
}) {
  return (
    <>
      {competitions.map((c) => (
        <CompetitionBrowser key={c.id} comp={c.comp} anchor={c.anchor} />
      ))}
      <AggregateTable rows={aggregate} />
    </>
  );
}
