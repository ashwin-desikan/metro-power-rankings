import Link from "next/link";
import type { CSSProperties } from "react";
import type { NflSeasonAward } from "@/lib/nflSeasonHonours";
import { CappedList } from "@/app/_shared/Disclosure";
import { orderSeasonAwards } from "./seasonAwardOrder";

// The season's individual honours: who won what, and every All-Pro pick.
//
// 🔴 A SEASON IS PEOPLE AS WELL AS TEAMS. Everything else on this page is a
// club: ratings, standings, a seed timeline. The workbook has carried these
// award winners all along and nothing surfaced them per year, so a reader
// could see the Chiefs rated highest in 2024 and not that Josh Allen won MVP.
// Mirrors app/teams/nba/season/_shared/SeasonHonours.tsx.
//
// pro-bowl-counts.json is a per-franchise CAREER total with no year field,
// so there is no Pro Bowl block here: that data cannot be sliced by season.
// See lib/nflSeasonHonours.ts.
//
// A server component: nothing here is interactive, so it stays off the
// client bundle. The one density control is CappedList, a <details> that
// needs no JavaScript, for the All-Pro list, which can run past 200 names in
// some seasons.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

type Props = {
  awards: NflSeasonAward[];
};

function PlayerLine({
  player, detail, slug,
}: {
  player: string;
  detail: string | null;
  slug: string | null;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3 min-w-0">
      <span className="text-sm min-w-0 truncate">{player}</span>
      {detail ? (
        slug ? (
          <Link
            href={`/teams/nfl/${slug}`}
            className="text-[11px] text-[var(--text-dim)] shrink-0 hover:text-[var(--accent)]"
          >
            {detail}
          </Link>
        ) : (
          <span className="text-[11px] text-[var(--text-dim)] shrink-0">{detail}</span>
        )
      ) : null}
    </span>
  );
}

export default function SeasonHonours({ awards }: Props) {
  const allPro = awards.filter((a) => a.award === "All-Pro");
  const named = orderSeasonAwards(awards.filter((a) => a.award !== "All-Pro"));
  if (!named.length && !allPro.length) return null;

  const sortedAllPro = [...allPro].sort((a, b) => a.player.localeCompare(b.player));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {named.length ? (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-2" style={MONO}>
            Awards
          </h3>
          <ul className="space-y-2">
            {named.map((a, i) => (
              <li key={`${a.award}-${a.player}-${i}`}>
                <div className="text-[11px] text-[var(--text-muted)]">{a.award}</div>
                <PlayerLine
                  player={a.player}
                  detail={a.team}
                  slug={a.slug}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sortedAllPro.length ? (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-2" style={MONO}>
            All-Pro
          </h3>
          {/* Some early seasons run past 200 selections, so this is capped on
              a phone and open from 640px up, per the density rule. */}
          <CappedList
            initial={12}
            noun="selections"
            items={sortedAllPro.map((a, i) => (
              <div key={`${a.player}-${i}`} className="py-0.5">
                <PlayerLine
                  player={a.player}
                  detail={[a.position, a.team].filter(Boolean).join(" · ") || null}
                  slug={a.slug}
                />
              </div>
            ))}
          />
        </section>
      ) : null}
    </div>
  );
}
