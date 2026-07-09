// NhlPlayoffBracket — current-state view of the Stanley Cup playoffs,
// rendered as two conference ladders (Eastern / Western) with a converging
// Stanley Cup Final slot. Modeled on the NBA PlayoffBracket; differences:
//   - No play-in round (NHL hasn't adopted one).
//   - 16 teams qualify (8 per conference) versus NBA's 16 post-play-in.
//   - Final is called "Stanley Cup Final" (singular) per official usage.
//   - Hidden once the calendar passes June 28 of the playoff year; that's
//     the practical end of the Stanley Cup Final under modern scheduling
//     (Game 7 of the 2024 Final was June 24; June 28 absorbs a long
//     series with one rest-day slip).
//
// The data file at public/data/nhl/playoff-state.json may be empty
// (by_franchise = {}); in that case the bracket still renders title +
// Wikipedia link with empty buckets so the page composition is stable
// while the workbook integration catches up.
//
// Wikipedia link is composed from the bundle year so a Game-7-night roll
// to the next season's bundle picks up the correct URL automatically.
//
// Server component intentionally — the playoff-state reader pulls a JSON
// file at build/request time via fs. No interactivity beyond Link nav, so
// no "use client" overhead is needed.

import Link from "next/link";
import type { Franchise } from "@/lib/nhl";
import type {
  NhlPlayoffStateBundle,
  NhlPlayoffStateRecord,
  NhlPlayoffStateValue,
} from "@/lib/nhl-playoffs";
import { NHL_PLAYOFF_STATE_COLORS } from "@/lib/nhl-playoffs";

type Props = {
  franchises: Franchise[];
  playoffBundle: NhlPlayoffStateBundle;
  logoMap: Record<string, string | null>;
};

const STATE_RANK: Record<NhlPlayoffStateValue, number> = {
  champion:         6,
  lost_final:       5,
  active_final:     5,
  eliminated_cf:    4,
  active_cf:        4,
  eliminated_semis: 3,
  active_semis:     3,
  eliminated_qf:    2,
  active_qf:        2,
};

type TeamSlot = {
  canonical: string;
  display: string;
  slug: string;
  state: NhlPlayoffStateValue;
  logo: string | null;
};

function bucketByRound(
  teams: TeamSlot[],
  round: "qf" | "semis" | "cf" | "final",
): { alive: TeamSlot[]; eliminatedHere: TeamSlot[] } {
  if (round === "final") {
    return {
      alive: teams.filter((t) => t.state === "active_final" || t.state === "champion"),
      eliminatedHere: teams.filter((t) => t.state === "lost_final"),
    };
  }
  const stateAlive = `active_${round}` as NhlPlayoffStateValue;
  const stateOut = `eliminated_${round}` as NhlPlayoffStateValue;
  return {
    alive: teams.filter((t) => t.state === stateAlive),
    eliminatedHere: teams.filter((t) => t.state === stateOut),
  };
}

function TeamChip({ slot, alive }: { slot: TeamSlot; alive: boolean }) {
  const style = NHL_PLAYOFF_STATE_COLORS[slot.state];
  if (alive) {
    return (
      <Link
        href={`/teams/nhl/${slot.slug}`}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap hover:opacity-85 transition-opacity"
        style={{ background: style.bg, color: style.text }}
        title={style.label}
      >
        {slot.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.logo} alt="" className="w-4 h-4 object-contain" loading="lazy" decoding="async" />
        )}
        <span>{slot.display}</span>
      </Link>
    );
  }
  return (
    <Link
      href={`/teams/nhl/${slot.slug}`}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full whitespace-nowrap border opacity-60 hover:opacity-100 transition-opacity"
      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      title={style.label}
    >
      {slot.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.logo} alt="" className="w-4 h-4 object-contain grayscale" loading="lazy" decoding="async" />
      )}
      <span>{slot.display}</span>
    </Link>
  );
}

function RoundRow({
  label,
  alive,
  eliminatedHere,
}: {
  label: string;
  alive: TeamSlot[];
  eliminatedHere: TeamSlot[];
}) {
  if (alive.length === 0 && eliminatedHere.length === 0) return null;
  return (
    <div className="border-l-2 pl-3 py-2" style={{ borderColor: "var(--border)" }}>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-1.5 flex items-baseline gap-2">
        <span>{label}</span>
        <span className="text-[var(--text-dim)] tabular-nums">
          {alive.length > 0 && `${alive.length} alive`}
          {alive.length > 0 && eliminatedHere.length > 0 && ", "}
          {eliminatedHere.length > 0 && `${eliminatedHere.length} out`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {alive.map((t) => <TeamChip key={t.canonical} slot={t} alive />)}
        {eliminatedHere.map((t) => <TeamChip key={t.canonical} slot={t} alive={false} />)}
      </div>
    </div>
  );
}

function Ladder({
  conference,
  teams,
}: {
  conference: "Eastern" | "Western";
  teams: TeamSlot[];
}) {
  const qf = bucketByRound(teams, "qf");
  const semis = bucketByRound(teams, "semis");
  const cf = bucketByRound(teams, "cf");
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h3 className="text-sm font-bold tracking-tight mb-3 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: conference === "Eastern" ? "#3a5a8a" : "#a07a30" }} />
        {conference} Conference
      </h3>
      <div className="space-y-2">
        <RoundRow label="First Round" alive={qf.alive} eliminatedHere={qf.eliminatedHere} />
        <RoundRow label="Conference Semifinals" alive={semis.alive} eliminatedHere={semis.eliminatedHere} />
        <RoundRow label="Conference Finals" alive={cf.alive} eliminatedHere={cf.eliminatedHere} />
      </div>
    </div>
  );
}

export default function NhlPlayoffBracket({ franchises, playoffBundle, logoMap }: Props) {
  if (playoffBundle.is_postseason_complete) return null;
  if (!playoffBundle.year) return null;

  // Hide after June 28 of the playoff year — past that the bracket is stale
  // and the page should read as offseason. Server-rendered, so this gate
  // flips automatically on the first deploy / revalidation after the date.
  const now = new Date();
  const cutoff = new Date(playoffBundle.year, 5, 28); // month index 5 = June
  cutoff.setHours(23, 59, 59, 999);
  if (now > cutoff) return null;

  const byCanonical = new Map(franchises.map((f) => [f.canonical, f]));

  const east: TeamSlot[] = [];
  const west: TeamSlot[] = [];
  for (const [canonical, st] of Object.entries(playoffBundle.by_franchise) as Array<[string, NhlPlayoffStateRecord]>) {
    const f = byCanonical.get(canonical);
    if (!f) continue;
    const slot: TeamSlot = {
      canonical,
      display: f.display_name,
      slug: f.slug,
      state: st.state,
      logo: logoMap[f.slug] ?? null,
    };
    // current_main_div carries 'Eastern' / 'Western' per NHL convention.
    if (f.current_main_div === "Eastern") east.push(slot);
    else if (f.current_main_div === "Western") west.push(slot);
  }

  const byStateDesc = (a: TeamSlot, b: TeamSlot) => STATE_RANK[b.state] - STATE_RANK[a.state];
  east.sort(byStateDesc);
  west.sort(byStateDesc);

  const finalsAll = [...east, ...west].filter((t) =>
    t.state === "active_final" || t.state === "lost_final" || t.state === "champion"
  );
  const finalsAlive = finalsAll.filter((t) => t.state === "active_final" || t.state === "champion");
  const finalsEliminated = finalsAll.filter((t) => t.state === "lost_final");
  const champion = finalsAll.find((t) => t.state === "champion") ?? null;

  const stillIn = [...east, ...west].filter((t) => t.state.startsWith("active_")).length;
  const wikiUrl = `https://en.wikipedia.org/wiki/${playoffBundle.year}_Stanley_Cup_playoffs`;

  return (
    <section className="mb-8">
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{playoffBundle.year} Stanley Cup Playoffs</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {stillIn > 0
              ? `${stillIn} ${stillIn === 1 ? "team" : "teams"} still alive. Pairings not encoded in source data; shown here as round-by-round survival.`
              : "Bracket starting soon."}
          </p>
        </div>
        <a
          href={wikiUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
        >
          Full bracket on Wikipedia &rarr;
        </a>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Ladder conference="Eastern" teams={east} />
        <Ladder conference="Western" teams={west} />
      </div>

      {/* Stanley Cup Final strip */}
      <div
        className="mt-3 rounded-xl border p-4 text-center"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">
          Stanley Cup Final
        </div>
        {finalsAll.length === 0 ? (
          <div className="text-sm text-[var(--text-dim)] italic">To be determined</div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {finalsAlive.map((t) => <TeamChip key={t.canonical} slot={t} alive />)}
            {finalsEliminated.map((t) => <TeamChip key={t.canonical} slot={t} alive={false} />)}
          </div>
        )}
        {champion && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-widest font-semibold text-amber-400 mb-1">
              {playoffBundle.year} Stanley Cup Champion
            </div>
            <div className="text-lg font-bold tracking-tight">{champion.display}</div>
          </div>
        )}
      </div>
    </section>
  );
}
