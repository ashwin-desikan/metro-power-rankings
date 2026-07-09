"use client";

import { useState } from "react";
import Link from "next/link";
import { flagCdnUrl } from "@/lib/international-display";
import type { CricketGame } from "@/lib/cricketGames";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
function dateLabel(g: CricketGame): string {
  if (g.fmt === "Test" && g.end && g.end !== g.date) {
    const [ys, ms, ds] = g.date.split("-");
    const [ye, me, de] = g.end.split("-");
    if (ys === ye && ms === me) return `${Number(ds)}\u2013${Number(de)} ${MONTHS[Number(ms) - 1]} ${ys}`;
    if (ys === ye) return `${Number(ds)} ${MONTHS[Number(ms) - 1]} \u2013 ${Number(de)} ${MONTHS[Number(me) - 1]} ${ys}`;
    return `${fmtDay(g.date)} \u2013 ${fmtDay(g.end)}`;
  }
  return fmtDay(g.date);
}
const FMT: Record<string, { label: string; color: string; bg: string }> = {
  Test: { label: "TEST", color: "#e0a83e", bg: "rgba(224,168,62,0.16)" },
  ODI: { label: "ODI", color: "#4f9dff", bg: "rgba(79,157,255,0.16)" },
  T20I: { label: "T20I", color: "#33cc77", bg: "rgba(51,204,119,0.16)" },
};

// Curated highlight clips, keyed by date + the two team slugs (sorted).
const CLIPS: Record<string, string> = {
  "2019-07-14|england,new-zealand": "https://www.youtube.com/watch?v=pQ5xEiZ-5IE",
  "2005-08-04|australia,england": "https://www.youtube.com/watch?v=QiNvL3FfrT8",
  "2007-09-24|india,pakistan": "https://www.youtube.com/watch?v=vG4ydr_iEwo",
};
function clipFor(g: CricketGame): string | undefined {
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
    <Link href={`/teams/cricket/${slug}`} className={`hover:text-[var(--accent)] transition-colors ${bold ? "font-semibold text-[var(--text)]" : ""}`}>
      {name}
    </Link>
  );
}

function Row({ g, rank, highlight }: { g: CricketGame; rank: number; highlight?: string }) {
  const f = FMT[g.fmt];
  const isTie = !g.winner;
  const winSlug = isTie ? null : g.winner === g.team ? g.teamSlug : g.oppSlug;
  const order = !isTie && g.winner === g.opp
    ? [{ n: g.opp, s: g.oppSlug }, { n: g.team, s: g.teamSlug }]
    : [{ n: g.team, s: g.teamSlug }, { n: g.opp, s: g.oppSlug }];
  const isBold = (sl: string) => (highlight ? sl === highlight : winSlug ? sl === winSlug : false);
  const ctx = [g.detail, g.major || g.tournament, g.round, g.city].filter(Boolean).join(" · ");
  const clip = clipFor(g);
  return (
    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="py-2 pl-3 pr-2 text-[var(--text-dim)] tabular-nums align-top" style={MONO}>{rank}</td>
      <td className="py-2 pr-3 align-top">
        <div className="flex items-center gap-1.5 flex-wrap leading-tight">
          <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ ...MONO, color: f.color, background: f.bg, letterSpacing: "0.04em" }}>{f.label}</span>
          {g.editorPick && <span title="All-time classic (curated pick)" style={{ color: "#e0a83e" }}>★</span>}
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
        <div className="text-[11px] text-[var(--text-dim)] mt-0.5 truncate max-w-[64ch]"><span style={MONO}>{dateLabel(g)}</span>{ctx ? ` · ${ctx}` : ""}</div>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums align-top font-semibold" style={{ ...MONO, color: "var(--accent)" }} title={`Closeness ${g.cl} · Stakes ${g.st} · Quality ${g.q}`}>{g.norm.toFixed(0)}</td>
    </tr>
  );
}

// Mobile: one stacked card per game instead of a cramped 3-column table.
// Same game data and highlight/winner logic as the desktop <Row>, just laid
// out top-to-bottom so nothing needs horizontal scrolling at 375px.
function Card({ g, rank, highlight }: { g: CricketGame; rank: number; highlight?: string }) {
  const f = FMT[g.fmt];
  const isTie = !g.winner;
  const winSlug = isTie ? null : g.winner === g.team ? g.teamSlug : g.oppSlug;
  const order = !isTie && g.winner === g.opp
    ? [{ n: g.opp, s: g.oppSlug }, { n: g.team, s: g.teamSlug }]
    : [{ n: g.team, s: g.teamSlug }, { n: g.opp, s: g.oppSlug }];
  const isBold = (sl: string) => (highlight ? sl === highlight : winSlug ? sl === winSlug : false);
  const ctx = [g.detail, g.major || g.tournament, g.round, g.city].filter(Boolean).join(" · ");
  const clip = clipFor(g);
  return (
    <div className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ ...MONO, color: f.color, background: f.bg, letterSpacing: "0.04em" }}>{f.label}</span>
          {g.editorPick && <span title="All-time classic (curated pick)" style={{ color: "#e0a83e" }}>★</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-[var(--text-dim)] tabular-nums" style={MONO}>#{rank}</span>
          <span className="tabular-nums font-semibold text-sm" style={{ ...MONO, color: "var(--accent)" }} title={`Closeness ${g.cl} · Stakes ${g.st} · Quality ${g.q}`}>{g.norm.toFixed(0)}</span>
        </div>
      </div>
      <div className="text-sm leading-tight flex items-center flex-wrap gap-x-1">
        <Flag slug={order[0].s} /><Team name={order[0].n} slug={order[0].s} bold={isBold(order[0].s)} />
        <span className="text-[var(--text-dim)]">v</span>
        <Flag slug={order[1].s} /><Team name={order[1].n} slug={order[1].s} bold={isBold(order[1].s)} />
      </div>
      <div className="text-[11px] text-[var(--text-dim)] mt-1"><span style={MONO}>{dateLabel(g)}</span>{ctx ? ` · ${ctx}` : ""}</div>
      {clip && (
        <a href={clip} target="_blank" rel="noopener noreferrer" className="inline-block mt-1.5 text-[11px] hover:underline" style={{ color: "var(--accent)" }}>
          &#9654; Watch
        </a>
      )}
    </div>
  );
}

function Table({ games, highlight }: { games: CricketGame[]; highlight?: string }) {
  return (
    <>
      <div className="max-h-[70vh] overflow-auto sm:hidden">
        <div className="grid grid-cols-1 gap-2">
          {games.map((g, i) => (
            <Card key={`${g.date}-${g.teamSlug}-${g.oppSlug}-card`} g={g} rank={i + 1} highlight={highlight} />
          ))}
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border hidden sm:block" style={{ borderColor: "var(--border)" }}>
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
              <Row key={`${g.date}-${g.teamSlug}-${g.oppSlug}`} g={g} rank={i + 1} highlight={highlight} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type TabbedProps = { test: CricketGame[]; odi: CricketGame[]; t20i: CricketGame[]; combined: CricketGame[]; decades?: Record<string, Record<string, CricketGame[]>>; limit?: number };
type FlatProps = { games: CricketGame[]; teamSlug: string };

export default function CricketGreatestGames(props: Partial<TabbedProps> & Partial<FlatProps>) {
  const [tab, setTab] = useState<"All" | "Test" | "ODI" | "T20I">("All");
  const [decade, setDecade] = useState<string>("all");

  if (props.games) {
    return <Table games={props.games} highlight={props.teamSlug} />;
  }

  const limit = props.limit ?? 25;
  const lists: Record<string, CricketGame[]> = {
    All: props.combined ?? [], Test: props.test ?? [], ODI: props.odi ?? [], T20I: props.t20i ?? [],
  };
  const dec = props.decades;
  const decadeList = dec ? Object.keys(dec[tab] ?? {}).sort().reverse() : [];
  const rows = decade !== "all" && dec?.[tab]?.[decade] ? dec[tab][decade] : lists[tab].slice(0, limit);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(["All", "Test", "ODI", "T20I"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (dec && decade !== "all" && !dec[t]?.[decade]) setDecade("all"); }}
            className="text-xs px-3 py-1 rounded-full border transition-colors"
            style={tab === t
              ? { background: "var(--accent)", color: "#08080D", borderColor: "var(--accent)" }
              : { background: "transparent", color: "var(--text-muted)", borderColor: "var(--border)" }}
          >
            {t === "All" ? "All formats" : t}
          </button>
        ))}
      </div>
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
