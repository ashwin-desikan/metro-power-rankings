import Link from "next/link";
import { getNationalTeamsForCountry } from "@/lib/nationalTeamsForCountry";
import { getCricketTeamForCountry, CRICKET_FORMATS } from "@/lib/cricket";
import { getRugbyTeamForCountry } from "@/lib/rugbyUnion";

// "National Teams" section on country hub pages: men's football, women's
// football (WWC nations), plus cricket and rugby union cards joined by name
// (West Indies resolves for every member country of the combined Caribbean
// side). Server component; renders nothing when the country has no teams.

const chipStyle = {
  backgroundColor: "var(--bg-card)",
  borderColor: "var(--border)",
  fontFamily: "'JetBrains Mono', monospace",
} as const;

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-[var(--text-dim)]">{label} </span>
      <span className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

function Card({
  href, chip, tag, name, note, children,
}: {
  href: string; chip: string; tag?: string | null; name: string;
  note?: string | null; children: React.ReactNode;
}) {
  return (
    <Link href={href}
          className="block border rounded-lg p-4 transition-colors hover:border-[var(--accent)]"
          style={cardStyle}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border" style={chipStyle}>
          {chip}
        </span>
        {tag ? (
          <span className="text-[10px] text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {tag}
          </span>
        ) : null}
      </div>
      <div className="font-semibold mb-2">{name}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">{children}</div>
      {note ? <div className="text-[10px] text-[var(--text-dim)] mt-2">{note}</div> : null}
    </Link>
  );
}

export default function NationalTeamsSection({ countryName }: { countryName: string }) {
  const { men, women } = getNationalTeamsForCountry(countryName);
  const cricket = getCricketTeamForCountry(countryName);
  const rugby = getRugbyTeamForCountry(countryName);
  if (!men && !women && !cricket && !rugby) return null;

  const cricketMajors = cricket && cricket.honours
    ? cricket.honours.wc.titles + cricket.honours.t20wc.titles + cricket.honours.ct.titles +
      cricket.honours.wtc.titles + cricket.honours.asia.titles
    : 0;

  return (
    <section className="mb-12" id="national-teams">
      <h2 className="text-xl font-bold mb-3">National Teams</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {countryName} on the international stage. Click a card for the full record.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {men ? (
          <Card href={`/teams/national/${men.slug}`} chip="Men's Football"
                tag={men.federation} name={men.cur_name || men.name}>
            {men.fifa_rank != null ? <Stat label="FIFA" value={`#${men.fifa_rank}`} /> : null}
            {men.elo_rank != null ? <Stat label="ELO" value={`#${men.elo_rank}`} /> : null}
            <Stat label="WC apps" value={`${men.world_cup.app}`} />
            {men.totals.major_trophies > 0 ? (
              <Stat label="Major trophies" value={`${men.totals.major_trophies}`} />
            ) : null}
          </Card>
        ) : null}
        {women ? (
          <Card href={`/teams/national/womens-world-cup/${women.slug}`} chip="Women's Football"
                name={women.name}>
            <Stat label="WWC apps" value={`${women.appearances}`} />
            {women.titles > 0 ? <Stat label="Titles" value={`${women.titles}`} /> : null}
            {women.best_finish ? <Stat label="Best" value={women.best_finish} /> : null}
          </Card>
        ) : null}
        {cricket ? (
          <Card href={`/teams/cricket/${cricket.slug}`} chip="Cricket"
                tag={cricket.full_member ? "Full Member" : "Associate"} name={cricket.name}
                note={cricket.name === "West Indies" && countryName !== "West Indies"
                  ? "Combined side of the cricket-playing Caribbean" : null}>
            {CRICKET_FORMATS.map((f) => {
              const rk = cricket.rankings[f];
              return rk && rk.current_rank != null
                ? <Stat key={f} label={f} value={`#${rk.current_rank}`} />
                : null;
            })}
            {cricketMajors > 0 ? <Stat label="Major titles" value={`${cricketMajors}`} /> : null}
            <Stat label="Matches" value={cricket.overall.m.toLocaleString()} />
          </Card>
        ) : null}
        {rugby ? (
          <Card href={`/teams/rugby-union/${rugby.slug}`} chip="Rugby Union"
                tag={rugby.six_nations ? "Six Nations" : rugby.sanzaar ? "SANZAAR" : null}
                name={rugby.name}>
            {rugby.ranking && rugby.ranking.current != null ? (
              <Stat label="World" value={`#${rugby.ranking.current}`} />
            ) : null}
            {rugby.rwc && rugby.rwc.titles > 0 ? (
              <Stat label="RWC titles" value={`${rugby.rwc.titles}`} />
            ) : null}
            {rugby.championships && rugby.championships.five_six_titles > 0 ? (
              <Stat label="6N titles" value={`${rugby.championships.five_six_titles}`} />
            ) : null}
            {rugby.championships && rugby.championships.trc_titles > 0 ? (
              <Stat label="TRC titles" value={`${rugby.championships.trc_titles}`} />
            ) : null}
            {rugby.record ? <Stat label="Tests" value={rugby.record.m.toLocaleString()} /> : null}
          </Card>
        ) : null}
      </div>
    </section>
  );
}
