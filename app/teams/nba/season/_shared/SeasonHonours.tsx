import Link from "next/link";
import type { CSSProperties } from "react";
import type { NbaAward, NbaAllStar } from "@/lib/nbaElo";
import { CappedList } from "@/app/_shared/Disclosure";

// The season's individual honours: who won what, who made an All-NBA team,
// and who was picked for the All-Star game.
//
// 🔴 A SEASON IS PEOPLE AS WELL AS TEAMS. Everything else on this page is a
// club: ratings, records, a bracket. The workbook has carried the awards and
// the All-Star rosters all along and nothing surfaced them per year, so a
// reader could see that the Thunder were rated highest in 2026 and not that
// Shai Gilgeous-Alexander won MVP that same season.
//
// A server component: nothing here is interactive, so it stays off the client
// bundle. The one density control is CappedList, which is a <details> and
// needs no JavaScript.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

type Props = {
  awards: NbaAward[];
  allStar: NbaAllStar | null;
  slugByName?: Record<string, string | null>;
};

function PlayerLine({
  player, detail, slug, badge,
}: {
  player: string;
  detail: string | null;
  slug: string | null;
  badge?: string | null;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3 min-w-0">
      <span className="min-w-0">
        <span className="text-sm">{player}</span>
        {badge ? (
          <span
            className="ml-1.5 text-[9px] uppercase tracking-wider px-1 py-px rounded"
            style={{ background: "#d4af37", color: "#1a1408" }}
          >
            {badge}
          </span>
        ) : null}
      </span>
      {detail ? (
        slug ? (
          <Link
            href={`/teams/nba/${slug}`}
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

export default function SeasonHonours({ awards, allStar, slugByName = {} }: Props) {
  const named = awards.filter((a) => !a.all_nba);
  const allNba = awards.filter((a) => a.all_nba);
  if (!named.length && !allNba.length && !allStar) return null;

  // All-NBA arrives flat; group it back into its teams, in the workbook's own
  // order, so "1st Team" reads as a team rather than five separate rows.
  const teams = new Map<string, NbaAward[]>();
  for (const a of allNba) {
    if (!teams.has(a.award)) teams.set(a.award, []);
    teams.get(a.award)!.push(a);
  }

  const asMvp = allStar?.players.filter((p) => p.mvp) ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
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
                  detail={[a.city, a.team].filter(Boolean).join(" ") || null}
                  slug={a.canonical ? slugByName[a.canonical] ?? null : null}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {teams.size ? (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-2" style={MONO}>
            All-NBA
          </h3>
          <div className="space-y-3">
            {[...teams.entries()].map(([label, list]) => (
              <div key={label}>
                <div className="text-[11px] text-[var(--text-muted)] mb-0.5">{label}</div>
                <ul className="space-y-1">
                  {list.map((a, i) => (
                    <li key={`${a.player}-${i}`}>
                      <PlayerLine
                        player={a.player}
                        detail={a.team ?? null}
                        slug={a.canonical ? slugByName[a.canonical] ?? null : null}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {allStar?.players.length ? (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-2" style={MONO}>
            All-Star game
          </h3>
          {allStar.host_arena || allStar.host_city ? (
            <p className="text-[11px] text-[var(--text-muted)] mb-2">
              {[allStar.host_arena, allStar.host_city].filter(Boolean).join(", ")}
              {asMvp.length ? (
                <>
                  {" · "}MVP {asMvp.map((p) => p.player).join(", ")}
                </>
              ) : null}
            </p>
          ) : null}
          {/* Up to 28 names is the longest list on the page, so it is capped on
              a phone and open from 640px up, per the density rule. */}
          <CappedList
            initial={8}
            noun="selections"
            items={allStar.players.map((p) => (
              <div key={p.player} className="py-0.5">
                <PlayerLine
                  player={p.player}
                  detail={[
                    p.team,
                    p.appearance ? `#${p.appearance}` : null,
                  ].filter(Boolean).join(" · ") || null}
                  slug={p.canonical ? slugByName[p.canonical] ?? null : null}
                  badge={p.mvp ? "MVP" : null}
                />
              </div>
            ))}
          />
        </section>
      ) : null}
    </div>
  );
}
