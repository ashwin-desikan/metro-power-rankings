import Link from "next/link";
import { getEuroleagueStandings, EUROLEAGUE_FULL_SEASON, type EuroleagueRow } from "@/lib/euroleagueStandings";
import { isLeagueLive } from "@/lib/seasonWindows";
import { euroleagueClubColor, euroleagueMonogram } from "@/lib/euroleague-colors";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { SectionHead } from "@/app/_shared/SectionHead";
import { CollapsibleSection } from "@/app/_shared/CollapsibleSection";
import { CappedList } from "@/app/_shared/Disclosure";

// Live EuroLeague regular-season table, rendered from the SAME source and
// the SAME liveness rule as the euroleagueBlock on /sports/standings: see
// lib/euroleagueStandings.ts (getEuroleagueStandings) and
// lib/seasonWindows.ts (isLeagueLive, EUROLEAGUE_FULL_SEASON). Columns,
// club colors/monograms and the top-ten playoff cut all mirror that block
// so the two pages never disagree about the same table.

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const DASH = "—";
const PLAYOFF_FIELD = 10;

const pct3 = (played: number, won: number): string =>
  played > 0 ? (won / played).toFixed(3).replace(/^0/, "") : DASH;

function Monogram({ r }: { r: EuroleagueRow }) {
  const c = euroleagueClubColor(r.display);
  return (
    <TeamCrest
      name={r.team ?? r.display}
      size={20}
      fallback={
        <span
          className="inline-grid place-items-center rounded-full flex-shrink-0"
          style={{ background: c.bg, color: c.fg, width: 20, height: 20, fontSize: 8, fontWeight: 700 }}
          aria-hidden
        >
          {euroleagueMonogram(r.display)}
        </span>
      }
    />
  );
}

function ClubName({ r }: { r: EuroleagueRow }) {
  const content = (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <Monogram r={r} />
      <span className="truncate">{r.display}</span>
    </span>
  );
  return r.metro_slug ? (
    <Link href={`/rankings/${r.metro_slug}`} className="hover:text-[var(--accent)]">
      {content}
    </Link>
  ) : (
    content
  );
}

export default async function EuroleagueLiveTable() {
  const s = await getEuroleagueStandings();
  if (s.rows.length === 0) return null;

  const played = s.rows.map((r) => r.played);
  const live = isLeagueLive("euroleague", played, EUROLEAGUE_FULL_SEASON);
  const anyPlayed = Math.max(0, ...played) > 0;
  const showNums = live || anyPlayed;

  const sorted = s.rows.slice().sort((a, b) =>
    showNums ? (a.rank ?? 99) - (b.rank ?? 99) || b.won - a.won || b.pd - a.pd : a.display.localeCompare(b.display),
  );
  const cutSet = live ? new Set(sorted.slice(0, PLAYOFF_FIELD)) : null;

  const sub = live
    ? `Live regular-season table, ${s.season_label}${s.fetched_at ? `, as of ${new Date(s.fetched_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}.`
    : `Offseason, last table shown: ${s.season_label} regular season.`;

  const mobileRows = sorted.map((r, i) => {
    const inField = cutSet ? cutSet.has(r) : false;
    return (
      <div
        key={r.code || r.display}
        className="flex items-center gap-2 px-3 py-2"
        style={inField ? { background: "rgba(78,205,196,0.06)" } : undefined}
      >
        <span className="min-w-6 flex-shrink-0 text-right text-[11px]" style={{ ...mono, color: "var(--text-dim)" }}>
          {showNums ? (r.rank ?? i + 1) : DASH}
        </span>
        <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
          <ClubName r={r} />
        </div>
        <div className="flex-shrink-0 text-right text-[11px] tabular-nums" style={mono}>
          {showNums ? `${r.won}-${r.lost}` : `${DASH}-${DASH}`}
        </div>
      </div>
    );
  });

  return (
    <CollapsibleSection
      id="live-standings"
      title="Live standings"
      sub={sub}
    >
      <div
        className="sm:hidden rounded-xl border divide-y overflow-hidden"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <CappedList
          key={s.season_code}
          initial={12}
          noun="clubs"
          bodyClassName="divide-y divide-[var(--border)]"
          items={mobileRows}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
        <table className="w-full text-sm min-w-[480px]" data-sticky-col="2">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">Club</th>
              <th className="py-2 px-3 text-right font-medium">W</th>
              <th className="py-2 px-3 text-right font-medium">L</th>
              <th className="py-2 px-3 text-right font-medium">PCT</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const inField = cutSet ? cutSet.has(r) : false;
              return (
                <tr
                  key={r.code || r.display}
                  className="border-t"
                  style={{ borderColor: "var(--border)", background: inField ? "rgba(78,205,196,0.06)" : undefined }}
                >
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{showNums ? (r.rank ?? i + 1) : DASH}</td>
                  <td className="py-1.5 px-3 font-medium"><ClubName r={r} /></td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{showNums ? r.won : DASH}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{showNums ? r.lost : DASH}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{showNums ? pct3(r.played, r.won) : DASH}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {live ? (
        <p className="text-[11px] text-[var(--text-dim)] mt-2">
          Top ten reach the post-season: the top six go straight to the quarter-finals, seventh to
          tenth into the play-in.
        </p>
      ) : null}
    </CollapsibleSection>
  );
}
