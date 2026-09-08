import type { CSSProperties } from "react";
import type { NflEloTeam, NflEloSeasonStatus, NflUpcoming } from "@/lib/nflElo";
import { CappedList } from "@/app/_shared/Disclosure";
import { MONOGRAM_BY_SLUG } from "@/lib/nfl";
import type { TeamIdent } from "./TeamCell";

// The companion to the towers, and only for a season actually under way.
// A finished season has no "what's left"; a preseason board has nothing but
// what's left, which is the whole preseason chart already. This exists for
// the one state in between.
//
// 🔴 SIZED BY THE OPPONENT'S CURRENT RATING, NOT A GUESS AT DIFFICULTY.
// `NflScheduledGame.home_elo`/`away_elo` are the two teams' ratings at the
// moment the upcoming shard was built, which is exactly the "current
// ratings" a remaining-schedule strip needs, and it is the same number the
// week-1 pricing table above already trusts.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BOX_MIN_W = 6;
const BOX_MAX_W = 22;
const BOX_H = 12;

type Row = {
  key: string;
  slug: string | null;
  abbr: string;
  label: string;
  games: { opp: string; elo: number; date: string | null; home: boolean }[];
  mean: number;
};

function abbrFor(t: NflEloTeam, slug: string | null): string {
  if (slug && MONOGRAM_BY_SLUG[slug]) return MONOGRAM_BY_SLUG[slug].mono;
  const nick = (t.team ?? t.name ?? "").trim();
  return nick.slice(0, 3).toUpperCase() || "NFL";
}

export default function WhatIsLeft({
  season,
  status,
  teams,
  ident,
  upcoming,
}: {
  season: number;
  status: NflEloSeasonStatus;
  teams: NflEloTeam[];
  ident: Record<string, TeamIdent>;
  upcoming: NflUpcoming | null;
}) {
  // Only a live season has a "what's left" worth drawing: a seeded one has no
  // games played yet (that's the preseason board above) and a final one has
  // no games left.
  if (status !== "live") return null;
  if (!upcoming || upcoming.season !== season || !upcoming.schedule.length) return null;

  const remaining = upcoming.schedule.filter(
    (g) => g.phase !== "Playoff" && g.home_pts == null && g.away_pts == null,
  );
  if (!remaining.length) return null;

  const rows: Row[] = [];
  for (const t of teams) {
    const slug = ident[t.name]?.slug ?? null;
    const games = remaining
      .filter((g) => g.home === t.team || g.away === t.team)
      .map((g) => {
        const home = g.home === t.team;
        const oppElo = home ? g.away_elo : g.home_elo;
        const oppName = home ? g.away : g.home;
        return { opp: oppName, elo: oppElo ?? 1500, date: g.date, home };
      })
      .filter((g) => g.elo != null);
    if (!games.length) continue;
    const mean = games.reduce((s, g) => s + g.elo, 0) / games.length;
    rows.push({
      key: t.name,
      slug,
      abbr: abbrFor(t, slug),
      label: `${t.city ?? ""} ${t.team ?? t.name}`.trim() || t.name,
      games,
      mean,
    });
  }
  if (!rows.length) return null;

  rows.sort((a, b) => b.mean - a.mean);
  const allElos = rows.flatMap((r) => r.games.map((g) => g.elo));
  const lo = Math.min(...allElos);
  const hi = Math.max(...allElos);
  const boxW = (elo: number) =>
    hi > lo ? BOX_MIN_W + ((elo - lo) / (hi - lo)) * (BOX_MAX_W - BOX_MIN_W) : (BOX_MIN_W + BOX_MAX_W) / 2;

  const items = rows.map((r) => (
    <div key={r.key} className="flex items-center gap-2 py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
      {r.slug ? (
        <a href={`/teams/nfl/${r.slug}`} className="w-10 flex-shrink-0 text-[11px] font-semibold text-[var(--accent)] hover:underline" style={MONO}>
          {r.abbr}
        </a>
      ) : (
        <span className="w-10 flex-shrink-0 text-[11px] font-semibold text-[var(--text-dim)]" style={MONO}>{r.abbr}</span>
      )}
      <span className="w-12 flex-shrink-0 text-right text-[11px] tabular-nums text-[var(--text-muted)]" style={MONO}>
        {r.mean.toFixed(0)}
      </span>
      <span className="flex flex-wrap items-center gap-[3px] min-w-0" title={`${r.label}: ${r.games.length} games left, mean opponent rating ${r.mean.toFixed(0)}`}>
        {r.games.map((g, i) => (
          <span
            key={i}
            aria-hidden
            title={`${g.home ? "vs" : "at"} ${g.opp} (${g.elo.toFixed(0)})`}
            className="inline-block rounded-sm"
            style={{ background: "var(--text-dim)", opacity: 0.55, width: boxW(g.elo), height: BOX_H }}
          />
        ))}
      </span>
    </div>
  ));

  return (
    <figure className="m-0 min-w-0">
      <div className="rounded-xl border overflow-hidden min-w-0" style={{ borderColor: "var(--border)" }}>
        <CappedList items={items} initial={12} noun="teams" />
      </div>
      <p className="mt-2 text-xs text-[var(--text-dim)]">
        Box width is the remaining opponent&rsquo;s current rating. Sorted by remaining difficulty, hardest first.
      </p>
    </figure>
  );
}
