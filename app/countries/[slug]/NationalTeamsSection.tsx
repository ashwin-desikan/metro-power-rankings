import Link from "next/link";
import { getNationalTeamsForCountry } from "@/lib/nationalTeamsForCountry";
import { getCricketTeamForCountry, CRICKET_FORMATS } from "@/lib/cricket";
import { getRugbyTeamForCountry } from "@/lib/rugbyUnion";
import { getBaseballTeamForCountry } from "@/lib/baseball";
import { getOlympicTeamForCountry } from "@/lib/olympics";
import { getBasketballTeamForCountry } from "@/lib/basketball";
import { sportIcon } from "@/lib/sportLabels";

// "National Teams" section on country hub pages: men's football, women's
// football (WWC nations), plus cricket and rugby union cards joined by name
// (West Indies resolves for every member country of the combined Caribbean
// side). Server component; renders nothing when the country has no teams.
//
// Card conventions (apply to every future national-team sport):
//  - sport icon from lib/sportLabels sportIcon()
//  - ultimate-trophy titles rendered as a stat CHIP in the metro club-card
//    style: gold (#d4af37 on rgba(212,175,55,0.16)) when won, muted zero
//    state otherwise. Football: World Cup / Women's World Cup; cricket:
//    Cricket World Cup and T20 World Cup; rugby union: Rugby World Cup.
//  - card links to the team page; team pages link back to their sport's hub
//    and to this country page.

const chipStyle = {
  backgroundColor: "var(--bg-card)",
  borderColor: "var(--border)",
  fontFamily: "'JetBrains Mono', monospace",
} as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-[var(--text-dim)]">{label} </span>
      <span className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

type TrophyChip = { label: string; gold: boolean; title: string };

// Metro club-card chip styling: gold when the count is non-zero.
function TitleChip({ chip }: { chip: TrophyChip }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
      style={{
        background: chip.gold ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
        color: chip.gold ? "#d4af37" : "var(--text-dim)",
      }}
      title={chip.title}
    >
      {chip.label}
    </span>
  );
}

function plural(n: number, noun: string): string {
  if (n === 0) return `No ${noun}s`;
  return n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
}

function Card({
  href, chip, sport, tag, name, note, chips, children,
}: {
  href: string; chip: string; sport: string; tag?: string | null; name: string;
  note?: string | null; chips?: TrophyChip[]; children: React.ReactNode;
}) {
  return (
    <Link href={href}
          className="block border rounded-lg p-4 transition-colors hover:border-[var(--accent)]"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border inline-flex items-center gap-1"
              style={chipStyle}>
          <span aria-hidden>{sportIcon(sport)}</span>
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
      {chips && chips.length > 0 ? (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {chips.map((c) => <TitleChip key={c.title} chip={c} />)}
        </div>
      ) : null}
      {note ? <div className="text-[10px] text-[var(--text-dim)] mt-2">{note}</div> : null}
    </Link>
  );
}

export default function NationalTeamsSection({ countryName }: { countryName: string }) {
  const { men, women } = getNationalTeamsForCountry(countryName);
  const cricket = getCricketTeamForCountry(countryName);
  const rugby = getRugbyTeamForCountry(countryName);
  const baseball = getBaseballTeamForCountry(countryName);
  const olympics = getOlympicTeamForCountry(countryName);
  const basketball = getBasketballTeamForCountry(countryName);
  if (!men && !women && !cricket && !rugby && !baseball && !olympics && !basketball) return null;

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
          <Card href={`/teams/national/${men.slug}`} chip="Men's Football" sport="Football"
                tag={men.federation} name={men.cur_name || men.name}
                chips={[{
                  label: plural(men.world_cup.champ, "World Cup"),
                  gold: men.world_cup.champ > 0,
                  title: "FIFA World Cup titles",
                }]}>
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
                sport="Football" name={women.name}
                chips={[{
                  label: plural(women.titles, "World Cup"),
                  gold: women.titles > 0,
                  title: "FIFA Women's World Cup titles",
                }]}>
            <Stat label="WWC apps" value={`${women.appearances}`} />
            {women.best_finish ? <Stat label="Best" value={women.best_finish} /> : null}
          </Card>
        ) : null}
        {cricket ? (
          <Card href={`/teams/cricket/${cricket.slug}`} chip="Cricket" sport="Cricket"
                tag={cricket.full_member ? "Full Member" : "Associate"} name={cricket.name}
                chips={cricket.honours ? [
                  {
                    label: plural(cricket.honours.wc.titles, "World Cup"),
                    gold: cricket.honours.wc.titles > 0,
                    title: "Cricket World Cup titles",
                  },
                  {
                    label: plural(cricket.honours.t20wc.titles, "T20 World Cup"),
                    gold: cricket.honours.t20wc.titles > 0,
                    title: "T20 World Cup titles",
                  },
                ] : undefined}
                note={cricket.name === "West Indies" && countryName !== "West Indies"
                  ? "Combined side of the cricket-playing Caribbean"
                  : cricket.name === "Ireland" && countryName === "Northern Ireland"
                    ? "All-island team for Ireland and Northern Ireland" : null}>
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
          <Card href={`/teams/rugby-union/${rugby.slug}`} chip="Rugby Union" sport="Rugby Union"
                tag={rugby.six_nations ? "Six Nations" : rugby.sanzaar ? "SANZAAR" : null}
                name={rugby.name}
                chips={[{
                  label: plural(rugby.rwc ? rugby.rwc.titles : 0, "World Cup"),
                  gold: !!(rugby.rwc && rugby.rwc.titles > 0),
                  title: "Rugby World Cup titles",
                }]}
                note={rugby.name === "Ireland" && countryName === "Northern Ireland"
                  ? "All-island team for Ireland and Northern Ireland" : null}>
            {rugby.ranking && rugby.ranking.current != null ? (
              <Stat label="World" value={`#${rugby.ranking.current}`} />
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
        {baseball ? (
          <Card href={`/teams/baseball/${baseball.slug}`} chip="Baseball" sport="Baseball"
                name={baseball.name}
                chips={[{
                  label: plural(baseball.titles, "WBC title"),
                  gold: baseball.titles > 0,
                  title: "World Baseball Classic titles",
                }]}
                note={baseball.name === "Chinese Taipei" && countryName === "Taiwan"
                  ? "Competes as Chinese Taipei" : null}>
            <Stat label="WBC apps" value={`${baseball.apps}`} />
            <Stat label="Record" value={`${baseball.w}-${baseball.l}`} />
            {baseball.best_finish ? <Stat label="Best" value={baseball.best_finish} /> : null}
          </Card>
        ) : null}
        {olympics ? (
          <Card href={`/teams/olympics/${olympics.slug}`} chip="Olympics" sport="Olympics"
                tag={olympics.lineage ? `incl. ${olympics.lineage.join(", ")}` : null}
                name={olympics.name}
                chips={[{
                  label: olympics.g === 0 ? "No golds"
                    : olympics.g === 1 ? "1 gold" : `${olympics.g.toLocaleString()} golds`,
                  gold: olympics.g > 0,
                  title: "Olympic gold medals (all-time, lineage included)",
                }]}
                note={olympics.special
                  ? `Competed as ${olympics.name} (${olympics.first}–${olympics.last})`
                  : olympics.name === "Great Britain" && countryName === "Northern Ireland"
                    ? "Competes as Great Britain; the team was Great Britain & Ireland before Irish independence"
                    : olympics.name === "Great Britain" && countryName !== "United Kingdom"
                      ? "Competes as Great Britain" : null}>
            <Stat label="Games" value={`${olympics.apps}`} />
            <Stat label="Medals" value={olympics.total.toLocaleString()} />
            {olympics.no1.summer_gold > 0 || olympics.no1.summer_total > 0 ? (
              <Stat label="Summer #1 (G/M)"
                    value={`${olympics.no1.summer_gold}/${olympics.no1.summer_total}`} />
            ) : null}
            {olympics.no1.winter_gold > 0 || olympics.no1.winter_total > 0 ? (
              <Stat label="Winter #1 (G/M)"
                    value={`${olympics.no1.winter_gold}/${olympics.no1.winter_total}`} />
            ) : null}
            {olympics.no1.summer_gold === 0 && olympics.no1.summer_total === 0 &&
             olympics.no1.winter_gold === 0 && olympics.no1.winter_total === 0 ? (
              <Stat label="Best" value={`#${olympics.best_rank}`} />
            ) : null}
          </Card>
        ) : null}
        {basketball ? (
          <Card href={`/teams/basketball/${basketball.slug}`} chip="Basketball" sport="Basketball"
                tag={basketball.lineage ? `incl. ${basketball.lineage.join(", ")}` : null}
                name={basketball.name}
                chips={[{
                  label: basketball.gold === 0 ? "No Olympic golds"
                    : basketball.gold === 1 ? "1 Olympic gold" : `${basketball.gold} Olympic golds`,
                  gold: basketball.gold > 0,
                  title: "Olympic basketball gold medals",
                }]}>
            {basketball.wc_titles > 0 ? (
              <Stat label="WC titles" value={`${basketball.wc_titles}`} />
            ) : null}
            <Stat label="Oly medals" value={`${basketball.medals}`} />
            <Stat label="WC apps" value={`${basketball.wc_apps}`} />
          </Card>
        ) : null}
      </div>
    </section>
  );
}
