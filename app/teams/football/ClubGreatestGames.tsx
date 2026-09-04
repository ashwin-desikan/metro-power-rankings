"use client";

import { useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import type { ClubGame, ClubDecade } from "@/lib/clubGames";
import { DataBar } from "@/app/_shared/DataBar";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// Badge colours per competition class, on the site's dataviz palette.
const COMP: Record<string, { color: string; bg: string }> = {
  EC: { color: "#e0a83e", bg: "rgba(224,168,62,0.16)" },
  CL: { color: "#e0a83e", bg: "rgba(224,168,62,0.16)" },
  UC: { color: "#4f9dff", bg: "rgba(79,157,255,0.16)" },
  EL: { color: "#4f9dff", bg: "rgba(79,157,255,0.16)" },
  CWC: { color: "#a855f7", bg: "rgba(168,85,247,0.16)" },
  FCUP: { color: "#a855f7", bg: "rgba(168,85,247,0.16)" },
  ECL: { color: "#33cc77", bg: "rgba(51,204,119,0.16)" },
  LG: { color: "#8888A0", bg: "rgba(136,136,160,0.14)" },
  CUP: { color: "#e05e5e", bg: "rgba(224,94,94,0.14)" },
};

// The Game Score components on hover. A row lifted by the curated floor says
// so and gives the model's own number, because a hand-placed row should not
// be able to pass itself off as a computed one.
function scoreTitle(g: ClubGame): string {
  const bits = [`Closeness ${g.cl}`, `Stakes ${g.st}`, `Quality ${g.q}`, `Upset ${g.u}`];
  if (g.floored) bits.push(`Curated floor ${g.gs} (model score ${g.base.toFixed(1)})`);
  return bits.join(" · ");
}

function Club({ name, canon, slug, bold }: { name: string; canon: string; slug: string | null; bold?: boolean }) {
  const cn = `${bold ? "font-semibold text-[var(--text)]" : ""}`;
  // Era name displays; the canonical identity fetches the crest and, when the
  // era name differs, explains itself on hover.
  const title = canon !== name ? `${canon} (as ${name})` : undefined;
  const crest = <CrestIcon name={canon} size={14} className="mr-1 align-[-2px]" />;
  if (!slug) return <span className={cn} title={title}>{crest}{name}</span>;
  return (
    <Link href={`/teams/football/${slug}`} title={title} className={`hover:text-[var(--accent)] transition-colors ${cn}`}>
      {crest}{name}
    </Link>
  );
}

// Shared row derivation. Football convention throughout: the HOME side is
// listed first and the scoreline is home-away; the winner is bolded wherever
// it sits, and neutral venues (finals) are marked explicitly.
function rowInfo(g: ClubGame) {
  const c = COMP[g.cls] ?? COMP.LG;
  const boldIdx = g.hg > g.ag ? 0 : g.ag > g.hg ? 1 : -1;
  const order = [
    { n: g.home, k: g.homeCanon, s: g.homeSlug },
    { n: g.away, k: g.awayCanon, s: g.awaySlug },
  ];
  const score = `${g.hg}–${g.ag}`;
  const legBit = g.leg === 2 ? `2nd leg${g.agg ? `, agg ${g.agg}` : ""}` : g.leg === 1 ? "1st leg" : undefined;
  const ctx = [g.comp, g.rivalry ?? undefined, g.round ?? undefined, legBit, g.pens ? `pens ${g.pens}` : undefined,
    g.neutral ? "neutral venue" : undefined]
    .filter(Boolean)
    .join(" · ");
  return { c, order, boldIdx, score, ctx };
}

function Row({ g, rank, gsMax }: { g: ClubGame; rank: number; gsMax: number }) {
  const { c, order, boldIdx, score, ctx } = rowInfo(g);
  return (
    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="py-2 pl-3 pr-2 text-[var(--text-dim)] tabular-nums align-top" style={MONO}>{rank}</td>
      <td className="py-2 pr-3 align-top">
        <div className="flex items-center gap-1.5 flex-wrap leading-tight">
          <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ ...MONO, color: c.color, background: c.bg, letterSpacing: "0.04em" }}>{g.cls}</span>
          {g.floored && <span title={`All-time classic (curated floor); model score ${g.base.toFixed(1)}`} style={{ color: "#e0a83e" }}>&#9733;</span>}
          <span className="text-[13px]">
            <Club name={order[0].n} canon={order[0].k} slug={order[0].s} bold={boldIdx === 0} />
            <span className="text-[var(--text-dim)]"> v </span>
            <Club name={order[1].n} canon={order[1].k} slug={order[1].s} bold={boldIdx === 1} />
          </span>
        </div>
        <div className="text-[11px] text-[var(--text-dim)] mt-0.5 truncate max-w-[64ch]">
          <span style={MONO}>{fmtDay(g.date)}</span>{` · ${[score, ...(ctx ? [ctx] : [])].join(" · ")}`}
        </div>
      </td>
      <td className="py-2 pr-3 text-right align-top" title={scoreTitle(g)}>
        <DataBar v={g.gs} max={gsMax} dp={1} width={88} label="game score" />
      </td>
    </tr>
  );
}

function GameCard({ g, rank }: { g: ClubGame; rank: number }) {
  const { c, order, boldIdx, score, ctx } = rowInfo(g);
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[var(--text-dim)] tabular-nums text-xs flex-shrink-0" style={MONO}>{rank}</span>
          <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ ...MONO, color: c.color, background: c.bg, letterSpacing: "0.04em" }}>{g.cls}</span>
          {g.floored && <span title={`All-time classic (curated floor); model score ${g.base.toFixed(1)}`} style={{ color: "#e0a83e" }}>&#9733;</span>}
        </div>
        <span className="text-base font-semibold tabular-nums flex-shrink-0" style={{ ...MONO, color: "var(--accent)" }} title={scoreTitle(g)}>
          {g.gs.toFixed(1)}
        </span>
      </div>
      <div className="mt-1.5 text-[13px] leading-tight">
        <Club name={order[0].n} canon={order[0].k} slug={order[0].s} bold={boldIdx === 0} />
        <span className="text-[var(--text-dim)]"> v </span>
        <Club name={order[1].n} canon={order[1].k} slug={order[1].s} bold={boldIdx === 1} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-[var(--text-dim)] truncate">
          <span style={MONO}>{fmtDay(g.date)}</span>{ctx ? ` · ${ctx}` : ""}
        </div>
        <span className="text-xs tabular-nums font-semibold flex-shrink-0" style={MONO}>{score}</span>
      </div>
    </div>
  );
}

function Table({ games }: { games: ClubGame[] }) {
  // Game Score is this board's argument (rows are already ranked by it);
  // max is this current view's own maximum, computed once over the rows
  // actually rendered (the view/decade filter has already been applied
  // above), never per row.
  const gsMax = Math.max(...games.map((g) => g.gs), 0.1);
  return (
    <>
      <div className="sm:hidden max-h-[70vh] overflow-auto rounded-xl border p-2" style={{ borderColor: "var(--border)" }}>
        <div className="grid grid-cols-1 gap-2">
          {games.map((g, i) => (
            <GameCard key={`${g.date}-${g.home}-${g.away}-card`} g={g} rank={i + 1} />
          ))}
        </div>
      </div>
      <div className="hidden sm:block max-h-[70vh] overflow-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table data-sticky-col="2" className="w-full text-xs [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="text-left font-medium py-2 pl-3 pr-2 uppercase tracking-wider text-[10px]">#</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px]">Match</th>
              <th className="text-right font-medium py-2 pr-3 uppercase tracking-wider text-[10px]">Score</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g, i) => (
              <Row key={`${g.date}-${g.home}-${g.away}`} g={g} rank={i + 1} gsMax={gsMax} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type Props = {
  top: ClubGame[];
  europe: ClubGame[];
  league: ClubGame[];
  cups: ClubGame[];
  decades: Record<string, ClubDecade>;
  limit?: number;
};

const VIEWS = [
  { id: "all", label: "All" },
  { id: "europe", label: "European nights" },
  { id: "league", label: "League" },
  { id: "cups", label: "Cups" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

export default function ClubGreatestGames({ top, europe, league, cups, decades, limit = 25 }: Props) {
  const [view, setView] = useState<ViewId>("all");
  const [decade, setDecade] = useState<string>("all");
  const decadeList = Object.keys(decades).sort().reverse();

  let rows: ClubGame[];
  if (decade !== "all" && decades[decade]) {
    rows = decades[decade][view] ?? [];
  } else if (view === "europe") {
    rows = europe.slice(0, limit);
  } else if (view === "league") {
    rows = league.slice(0, limit);
  } else if (view === "cups") {
    rows = cups.slice(0, limit);
  } else {
    rows = top.slice(0, limit);
  }

  const pill = (active: boolean) =>
    active
      ? { color: "var(--accent)", borderColor: "var(--accent)", background: "transparent" }
      : { color: "var(--text-dim)", borderColor: "var(--border)", background: "transparent" };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            className="text-[11px] px-2.5 py-0.5 rounded-full border transition-colors" style={pill(view === v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {["all", ...decadeList].map((d) => (
          <button key={d} onClick={() => setDecade(d)}
            className="text-[11px] px-2.5 py-0.5 rounded-full border transition-colors" style={pill(decade === d)}>
            {d === "all" ? "All decades" : `${d}s`}
          </button>
        ))}
      </div>
      <Table games={rows} />
    </div>
  );
}
