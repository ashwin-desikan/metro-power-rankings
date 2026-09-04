"use client";

import { useState } from "react";
import Link from "next/link";
import { flagCdnUrl } from "@/lib/international-display";
import type { RugbyGame } from "@/lib/rugbyGames";
import { DataBar } from "@/app/_shared/DataBar";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

const COMP: Record<string, { label: string; color: string; bg: string }> = {
  RWC: { label: "RWC", color: "#e0a83e", bg: "rgba(224,168,62,0.16)" },
  "6N": { label: "6N", color: "#4f9dff", bg: "rgba(79,157,255,0.16)" },
  RC: { label: "RC", color: "#33cc77", bg: "rgba(51,204,119,0.16)" },
  NC: { label: "NC", color: "#a855f7", bg: "rgba(168,85,247,0.16)" },
  TEST: { label: "TEST", color: "#8888A0", bg: "rgba(136,136,160,0.14)" },
};

// Curated highlight clips, keyed by date + the two team slugs (sorted).
const CLIPS: Record<string, string> = {
  "2023-10-28|new-zealand,south-africa": "https://www.youtube.com/watch?v=ETlUWCT2nxo",
  "1995-06-24|new-zealand,south-africa": "https://www.youtube.com/watch?v=ceD7U4JP5Fo",
  "2011-10-23|france,new-zealand": "https://www.youtube.com/watch?v=iLncU_JxyQk",
  "2003-11-22|australia,england": "https://www.youtube.com/watch?v=2FUmusIuK3Q",
};
function clipFor(g: RugbyGame): string | undefined {
  return CLIPS[`${g.date}|${[g.teamSlug, g.oppSlug].sort().join(",")}`];
}

function Flag({ slug }: { slug: string }) {
  const url = flagCdnUrl(slug);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden width={16} height={12} className="inline-block rounded-[1px] align-[-1px] mr-0.5" style={{ objectFit: "cover" }} loading="lazy" decoding="async" />;
}

function Team({ name, slug, bold }: { name: string; slug: string; bold?: boolean }) {
  return (
    <Link href={`/teams/rugby-union/${slug}`} className={`hover:text-[var(--accent)] transition-colors ${bold ? "font-semibold text-[var(--text)]" : ""}`}>
      {name}
    </Link>
  );
}

// Shared derivation for a game's display data - the team order (winner
// The Game Score components, spelled out on hover. `up` and `vol` arrived with
// the 2026-08-30 reweighting and are optional, so a stale data file still shows
// the three original terms rather than "undefined". A row lifted by a curated
// floor says so and gives the model's own number, because a hand-placed row
// should not be able to pass itself off as a computed one.
// The star means "a human put this here". Which kind of human intervention it
// was matters, so the hover says: a floor lifted the row, or a pin placed it.
function starTitle(g: RugbyGame): string {
  return g.pin != null
    ? `Placed at #${g.pin} by hand`
    : "All-time classic (curated pick)";
}

function scoreTitle(g: RugbyGame): string {
  const bits = [`Closeness ${g.cl}`, `Stakes ${g.st}`, `Quality ${g.q}`];
  if (g.vol != null) bits.push(`Scoring volume ${g.vol}`);
  if (g.up != null) bits.push(`Upset ${g.up}`);
  if (g.pin != null && g.base != null) {
    bits.push(`Placed at #${g.pin} by hand: model score ${g.base.toFixed(1)}`);
  } else if (g.editorPick && g.base != null && g.floor != null && g.floor > g.base) {
    bits.push(`Curated floor ${g.floor}: model score ${g.base.toFixed(1)}`);
  }
  return bits.join(" · ");
}

// first), which side to bold, the winner-first scoreline and the curated
// clip link. Used by both the desktop table row and the mobile card so the
// two presentations never drift.
function rowInfo(g: RugbyGame, highlight?: string) {
  const c = COMP[g.comp] ?? COMP.TEST;
  const winSlug = g.draw ? null : g.winner === g.team ? g.teamSlug : g.oppSlug;
  const order = !g.draw && g.winner === g.opp
    ? [{ n: g.opp, s: g.oppSlug }, { n: g.team, s: g.teamSlug }]
    : [{ n: g.team, s: g.teamSlug }, { n: g.opp, s: g.oppSlug }];
  const isBold = (sl: string) => (highlight ? sl === highlight : winSlug ? sl === winSlug : false);
  // Winner-first scoreline.
  const score = !g.draw && g.winner === g.opp ? `${g.pa}–${g.pf}` : `${g.pf}–${g.pa}`;
  const stage = g.stage && g.stage !== "Pool" ? g.stage : "";
  const ctx = [g.competition, stage, g.city].filter(Boolean).join(" · ");
  const clip = clipFor(g);
  return { c, order, isBold, score, ctx, clip };
}

function Row({ g, rank, highlight, gsMax }: { g: RugbyGame; rank: number; highlight?: string; gsMax: number }) {
  const { c, order, isBold, score, ctx, clip } = rowInfo(g, highlight);
  return (
    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="py-2 pl-3 pr-2 text-[var(--text-dim)] tabular-nums align-top" style={MONO}>{rank}</td>
      <td className="py-2 pr-3 align-top">
        <div className="flex items-center gap-1.5 flex-wrap leading-tight">
          <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ ...MONO, color: c.color, background: c.bg, letterSpacing: "0.04em" }}>{c.label}</span>
          {g.editorPick && <span title={starTitle(g)} style={{ color: "#e0a83e" }}>&#9733;</span>}
          <span className="text-[13px]">
            <Flag slug={order[0].s} /><Team name={order[0].n} slug={order[0].s} bold={isBold(order[0].s)} />
            <span className="text-[var(--text-dim)]"> v </span>
            <Flag slug={order[1].s} /><Team name={order[1].n} slug={order[1].s} bold={isBold(order[1].s)} />
          </span>
          {clip && (
            <a href={clip} target="_blank" rel="noopener noreferrer" className="text-[11px] whitespace-nowrap hover:underline" style={{ color: "var(--accent)" }}>
              &#9654; Watch
            </a>
          )}
        </div>
        <div className="text-[11px] text-[var(--text-dim)] mt-0.5 truncate max-w-[64ch]"><span style={MONO}>{fmtDay(g.date)}</span>{` · ${[score, ...(ctx ? [ctx] : [])].join(" · ")}`}</div>
      </td>
      <td className="py-2 pr-3 text-right align-top" title={scoreTitle(g)}>
        <DataBar v={g.norm} max={gsMax} dp={0} width={80} label="game score" />
      </td>
    </tr>
  );
}

// Mobile card: same fields as Row (rank, competition badge, editor pick,
// both teams with flags, watch link, date/context, score, Game Score) but
// stacked instead of squeezed into a 3-column table.
function GameCard({ g, rank, highlight }: { g: RugbyGame; rank: number; highlight?: string }) {
  const { c, order, isBold, score, ctx, clip } = rowInfo(g, highlight);
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[var(--text-dim)] tabular-nums text-xs flex-shrink-0" style={MONO}>{rank}</span>
          <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ ...MONO, color: c.color, background: c.bg, letterSpacing: "0.04em" }}>{c.label}</span>
          {g.editorPick && <span title={starTitle(g)} style={{ color: "#e0a83e" }}>&#9733;</span>}
        </div>
        <span
          className="text-base font-semibold tabular-nums flex-shrink-0"
          style={{ ...MONO, color: "var(--accent)" }}
          title={`Closeness ${g.cl} · Stakes ${g.st} · Quality ${g.q}`}
        >
          {g.norm.toFixed(0)}
        </span>
      </div>
      <div className="mt-1.5 text-[13px] leading-tight">
        <Flag slug={order[0].s} /><Team name={order[0].n} slug={order[0].s} bold={isBold(order[0].s)} />
        <span className="text-[var(--text-dim)]"> v </span>
        <Flag slug={order[1].s} /><Team name={order[1].n} slug={order[1].s} bold={isBold(order[1].s)} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-[var(--text-dim)] truncate">
          <span style={MONO}>{fmtDay(g.date)}</span>{ctx ? ` · ${ctx}` : ""}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs tabular-nums font-semibold" style={MONO}>{score}</span>
          {clip && (
            <a href={clip} target="_blank" rel="noopener noreferrer" className="text-[11px] whitespace-nowrap hover:underline" style={{ color: "var(--accent)" }}>
              &#9654; Watch
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Table({ games, highlight }: { games: RugbyGame[]; highlight?: string }) {
  // Game Score is this board's argument (rows are already ranked by it);
  // max is this current view's own maximum, computed once over the rows
  // actually rendered, never per row.
  const gsMax = Math.max(...games.map((g) => g.norm), 1);
  return (
    <>
      {/* Mobile: one card per game instead of the 3-column table. */}
      <div className="sm:hidden max-h-[70vh] overflow-auto rounded-xl border p-2" style={{ borderColor: "var(--border)" }}>
        <div className="grid grid-cols-1 gap-2">
          {games.map((g, i) => (
            <GameCard key={`${g.date}-${g.teamSlug}-${g.oppSlug}-card`} g={g} rank={i + 1} highlight={highlight} />
          ))}
        </div>
      </div>

      <div className="hidden sm:block max-h-[70vh] overflow-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-xs [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="text-left font-medium py-2 pl-3 pr-2 uppercase tracking-wider text-[10px]">#</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px]">Match</th>
              <th className="text-right font-medium py-2 pr-3 uppercase tracking-wider text-[10px]">Score</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g, i) => (
              <Row key={`${g.date}-${g.teamSlug}-${g.oppSlug}`} g={g} rank={i + 1} highlight={highlight} gsMax={gsMax} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type HubProps = { top: RugbyGame[]; decades?: Record<string, RugbyGame[]>; limit?: number };
type FlatProps = { games: RugbyGame[]; teamSlug: string };

export default function RugbyGreatestGames(props: Partial<HubProps> & Partial<FlatProps>) {
  const [decade, setDecade] = useState<string>("all");

  if (props.games) {
    return <Table games={props.games} highlight={props.teamSlug} />;
  }

  const limit = props.limit ?? 25;
  const top = props.top ?? [];
  const dec = props.decades;
  const decadeList = dec ? Object.keys(dec).sort().reverse() : [];
  const rows = decade !== "all" && dec?.[decade] ? dec[decade] : top.slice(0, limit);
  return (
    <div>
      {decadeList.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {["all", ...decadeList].map((d) => (
            <button
              key={d}
              onClick={() => setDecade(d)}
              className="text-[11px] px-2.5 py-0.5 rounded-full border transition-colors"
              style={decade === d
                ? { color: "var(--accent)", borderColor: "var(--accent)", background: "transparent" }
                : { color: "var(--text-dim)", borderColor: "var(--border)", background: "transparent" }}
            >
              {d === "all" ? "All decades" : d}
            </button>
          ))}
        </div>
      )}
      <Table games={rows} />
    </div>
  );
}
