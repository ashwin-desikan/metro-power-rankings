// PlayoffBracket — current-state view of the NBA postseason, rendered as
// two conference ladders (East / West) with a converging Finals slot.
// Pure data view: no client state needed. The shape of the data
// (per-team state, no opponent pairings) means we render "who is still
// alive at each round" rather than series matchups. Pairings would
// require either an ESPN scrape or a workbook bracket sheet.

import Link from "next/link";
import type { Franchise, PlayoffStateBundle, PlayoffStateRecord } from "@/lib/nba";
import { PLAYOFF_STATE_COLORS } from "@/lib/nba";

type Props = {
  franchises: Franchise[];
  playoffBundle: PlayoffStateBundle;
  logoMap: Record<string, string | null>;
};

// Rank ordering of playoff states — higher = further into the bracket.
// Used to decide what to show at each round row.
const STATE_RANK: Record<PlayoffStateRecord["state"], number> = {
  champion:           7,
  lost_finals:        6,
  active_finals:      6,
  eliminated_cf:      5,
  active_cf:          5,
  eliminated_semis:   4,
  active_semis:       4,
  eliminated_qf:      3,
  active_qf:          3,
  eliminated_play_in: 1,
  active_play_in:     1,
};

type TeamSlot = {
  canonical: string;
  display: string;
  slug: string;
  state: PlayoffStateRecord["state"];
  logo: string | null;
};

function bucketByRound(
  teams: TeamSlot[],
  round: "play_in" | "qf" | "semis" | "cf" | "finals",
): { alive: TeamSlot[]; eliminatedHere: TeamSlot[] } {
  const stateAlive = `active_${round}` as PlayoffStateRecord["state"];
  const stateOut = `eliminated_${round}` as PlayoffStateRecord["state"];
  const alive = teams.filter((t) => t.state === stateAlive);
  const eliminatedHere = teams.filter((t) => t.state === stateOut);
  // For finals: "alive" means active_finals OR champion; "eliminatedHere" means lost_finals
  if (round === "finals") {
    return {
      alive: teams.filter((t) => t.state === "active_finals" || t.state === "champion"),
      eliminatedHere: teams.filter((t) => t.state === "lost_finals"),
    };
  }
  return { alive, eliminatedHere };
}

function TeamChip({ slot, alive }: { slot: TeamSlot; alive: boolean }) {
  const style = PLAYOFF_STATE_COLORS[slot.state];
  if (alive) {
    return (
      <Link
        href={`/teams/nba/${slot.slug}`}
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
      href={`/teams/nba/${slot.slug}`}
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
  emptyHint,
}: {
  label: string;
  alive: TeamSlot[];
  eliminatedHere: TeamSlot[];
  emptyHint?: string;
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
        {alive.length === 0 && eliminatedHere.length === 0 && emptyHint && (
          <span className="text-[11px] text-[var(--text-dim)] italic">{emptyHint}</span>
        )}
      </div>
    </div>
  );
}

function Ladder({
  conference,
  teams,
}: {
  conference: "East" | "West";
  teams: TeamSlot[];
}) {
  const playIn = bucketByRound(teams, "play_in");
  const qf = bucketByRound(teams, "qf");
  const semis = bucketByRound(teams, "semis");
  const cf = bucketByRound(teams, "cf");
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h3 className="text-sm font-bold tracking-tight mb-3 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: conference === "East" ? "#3a5a8a" : "#a07a30" }} />
        {conference}ern Conference
      </h3>
      <div className="space-y-2">
        <RoundRow label="Play-In" alive={playIn.alive} eliminatedHere={playIn.eliminatedHere} />
        <RoundRow label="First Round" alive={qf.alive} eliminatedHere={qf.eliminatedHere} />
        <RoundRow label="Conference Semifinals" alive={semis.alive} eliminatedHere={semis.eliminatedHere} />
        <RoundRow label="Conference Finals" alive={cf.alive} eliminatedHere={cf.eliminatedHere} />
      </div>
    </div>
  );
}

export default function PlayoffBracket({ franchises, playoffBundle, logoMap }: Props) {
  if (playoffBundle.is_postseason_complete) return null;
  if (!playoffBundle.year) return null;

  const byCanonical = new Map(franchises.map((f) => [f.canonical, f]));

  const east: TeamSlot[] = [];
  const west: TeamSlot[] = [];
  for (const [canonical, st] of Object.entries(playoffBundle.by_franchise)) {
    const f = byCanonical.get(canonical);
    if (!f) continue;
    const slot: TeamSlot = {
      canonical,
      display: f.display_name,
      slug: f.slug,
      state: st.state,
      logo: logoMap[f.slug] ?? null,
    };
    if (f.conf === "Eastern") east.push(slot);
    else if (f.conf === "Western") west.push(slot);
  }

  // Sort each conference by state rank desc so highest-round teams appear in
  // the right buckets via filtering (and reads consistently across renders).
  const byStateDesc = (a: TeamSlot, b: TeamSlot) => STATE_RANK[b.state] - STATE_RANK[a.state];
  east.sort(byStateDesc);
  west.sort(byStateDesc);

  // Finals row: any team with state in {active_finals, lost_finals, champion}
  const finalsAll = [...east, ...west].filter((t) =>
    t.state === "active_finals" || t.state === "lost_finals" || t.state === "champion"
  );
  const finalsAlive = finalsAll.filter((t) => t.state === "active_finals" || t.state === "champion");
  const finalsEliminated = finalsAll.filter((t) => t.state === "lost_finals");
  const champion = finalsAll.find((t) => t.state === "champion") ?? null;

  // Bracket-level summary string
  const stillIn = [...east, ...west].filter((t) => t.state.startsWith("active_")).length;

  return (
    <section className="mb-8">
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{playoffBundle.year} Playoffs</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {stillIn} {stillIn === 1 ? "team" : "teams"} still alive. Pairings not encoded in source data; shown here as round-by-round survival.
          </p>
        </div>
        <a
          href={`https://en.wikipedia.org/wiki/${playoffBundle.year}_NBA_playoffs`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
        >
          Full bracket on Wikipedia &rarr;
        </a>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Ladder conference="East" teams={east} />
        <Ladder conference="West" teams={west} />
      </div>

      {/* Finals strip */}
      <div
        className="mt-3 rounded-xl border p-4 text-center"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">
          NBA Finals
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
              {playoffBundle.year} NBA Champion
            </div>
            <div className="text-lg font-bold tracking-tight">{champion.display}</div>
          </div>
        )}
      </div>
    </section>
  );
}
