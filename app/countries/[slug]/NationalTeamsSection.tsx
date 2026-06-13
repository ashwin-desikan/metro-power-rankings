import Link from "next/link";
import { getNationalTeamsForCountry } from "@/lib/nationalTeamsForCountry";
import { getCricketTeamForCountry, CRICKET_FORMATS } from "@/lib/cricket";
import { getRugbyTeamForCountry } from "@/lib/rugbyUnion";
import { getBaseballTeamForCountry } from "@/lib/baseball";
import { getOlympicTeamForCountry } from "@/lib/olympics";
import { getBasketballTeamForCountry } from "@/lib/basketball";
import { getHockeyTeamForCountry } from "@/lib/hockey";
import { sportIcon } from "@/lib/sportLabels";

// "National Teams" section on country hub pages: men's football, women's
// football (WWC nations), plus cricket and rugby union cards joined by name
// (West Indies resolves for every member country of the combined Caribbean
// side). Server component; renders nothing when the country has no teams.
//
// CARD ORDER (editorial):
//  1. Olympics — always first (the umbrella national-team identity).
//  2. The country's most popular national team — curated PRIMARY_SPORT override
//     below; defaults to men's football (true for most of the world).
//  3. The rest, ranked by an achievement score (world titles, then secondary
//     honours/ranking, on a small base reflecting each sport's global reach).
//     This deliberately sinks the niche team sports (cricket, rugby, basketball,
//     baseball, ice hockey) in countries where those sides are weak, and lifts
//     them where they are strong (e.g. NZ rugby, India cricket, Lithuania
//     basketball, Canada hockey, Japan baseball).
//
// Card conventions (apply to every future national-team sport):
//  - sport icon from lib/sportLabels sportIcon()
//  - ultimate-trophy titles rendered as a stat CHIP in the metro club-card
//    style: gold when won, muted zero state otherwise.
//  - card links to the team page; team pages link back to their sport's hub
//    and to this country page.

type SportKey =
  | "olympics" | "football" | "wfootball" | "cricket"
  | "rugby" | "baseball" | "basketball" | "hockey";

// Country (by lowercased country-page name) → its most popular national team,
// for any country whose #2 card is NOT men's football. Everything else defaults
// to football. Best-guess editorial picks among the sports that have a card.
const PRIMARY_SPORT: Record<string, SportKey> = {
  // Cricket nations
  india: "cricket", pakistan: "cricket", bangladesh: "cricket",
  "sri lanka": "cricket", afghanistan: "cricket", australia: "cricket",
  zimbabwe: "cricket",
  // Rugby union nations
  "new zealand": "rugby", "south africa": "rugby", wales: "rugby",
  fiji: "rugby", samoa: "rugby", tonga: "rugby", ireland: "rugby",
  georgia: "rugby",
  // Basketball nations
  "united states": "basketball", lithuania: "basketball", slovenia: "basketball",
  philippines: "basketball", serbia: "basketball", greece: "basketball",
  china: "basketball", angola: "basketball",
  // Baseball nations
  japan: "baseball", cuba: "baseball", "dominican republic": "baseball",
  venezuela: "baseball", taiwan: "baseball", nicaragua: "baseball",
  "puerto rico": "baseball", panama: "baseball",
  // Ice hockey nations
  canada: "hockey", finland: "hockey", sweden: "hockey",
  "czech republic": "hockey", slovakia: "hockey", latvia: "hockey",
  russia: "hockey", belarus: "hockey",
};

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
          className="block border rounded-lg p-3 transition-colors hover:border-[var(--accent)]"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border inline-flex items-center gap-1"
              style={chipStyle}>
          <span aria-hidden>{sportIcon(sport)}</span>
          {chip}
        </span>
        {tag ? (
          <span className="text-[10px] text-[var(--text-dim)] truncate max-w-[45%]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {tag}
          </span>
        ) : null}
      </div>
      <div className="font-semibold text-sm mb-1.5">{name}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">{children}</div>
      {chips && chips.length > 0 ? (
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {chips.map((c) => <TitleChip key={c.title} chip={c} />)}
        </div>
      ) : null}
      {note ? <div className="text-[10px] text-[var(--text-dim)] mt-1.5">{note}</div> : null}
    </Link>
  );
}

// Whether this country has any national-team card (used by the page's section
// nav to decide whether to show the "National Teams" anchor).
export function countryHasNationalTeams(countryName: string): boolean {
  const { men, women } = getNationalTeamsForCountry(countryName);
  return !!(
    men || women ||
    getCricketTeamForCountry(countryName) ||
    getRugbyTeamForCountry(countryName) ||
    getBaseballTeamForCountry(countryName) ||
    getOlympicTeamForCountry(countryName) ||
    getBasketballTeamForCountry(countryName) ||
    getHockeyTeamForCountry(countryName)
  );
}

export default function NationalTeamsSection({ countryName }: { countryName: string }) {
  const { men, women } = getNationalTeamsForCountry(countryName);
  const cricket = getCricketTeamForCountry(countryName);
  const rugby = getRugbyTeamForCountry(countryName);
  const baseball = getBaseballTeamForCountry(countryName);
  const olympics = getOlympicTeamForCountry(countryName);
  const basketball = getBasketballTeamForCountry(countryName);
  const hockey = getHockeyTeamForCountry(countryName);
  if (!men && !women && !cricket && !rugby && !baseball && !olympics && !basketball && !hockey) return null;

  const cricketMajors = cricket && cricket.honours
    ? cricket.honours.wc.titles + cricket.honours.t20wc.titles + cricket.honours.ct.titles +
      cricket.honours.wtc.titles + cricket.honours.asia.titles
    : 0;

  // ---- achievement scoring (orders the cards after Olympics + primary) ----
  const rankBonus = (r?: number | null) => (r && r > 0 ? Math.max(0, 30 - r / 2) : 0);
  const cricketBestRank = cricket
    ? CRICKET_FORMATS.map((f) => cricket.rankings[f]?.current_rank)
        .filter((x): x is number => x != null)
        .reduce((m, x) => Math.min(m, x), Infinity)
    : Infinity;

  const scores: Record<SportKey, number> = {
    olympics: 0,
    football: men ? 60 + men.world_cup.champ * 120 + (men.totals?.major_trophies ?? 0) * 12 + rankBonus(men.fifa_rank) : 0,
    wfootball: women ? 42 + women.titles * 120 + (women.appearances ?? 0) * 4 : 0,
    cricket: cricket ? (cricket.full_member ? 40 : 8) + cricketMajors * 45 + rankBonus(isFinite(cricketBestRank) ? cricketBestRank : null) : 0,
    rugby: rugby ? 30 + (rugby.rwc?.titles ?? 0) * 120 + (rugby.championships?.five_six_titles ?? 0) * 6 + (rugby.championships?.trc_titles ?? 0) * 8 + rankBonus(rugby.ranking?.current) : 0,
    baseball: baseball ? 25 + baseball.titles * 120 + (baseball.apps ?? 0) * 6 : 0,
    basketball: basketball ? 45 + basketball.gold * 120 + basketball.wc_titles * 45 + rankBonus(basketball.fiba_rank) : 0,
    hockey: hockey ? 35 + hockey.oly_gold * 120 + (hockey.wc_titles ?? 0) * 30 + (hockey.worlds_gold ?? 0) * 15 + rankBonus(hockey.oly_alltime_rank) : 0,
  };

  const primary: SportKey = PRIMARY_SPORT[countryName.toLowerCase()] ?? "football";
  const DEFAULT_PRIORITY: Record<SportKey, number> = {
    olympics: 0, football: 1, wfootball: 2, basketball: 3, cricket: 4, rugby: 5, hockey: 6, baseball: 7,
  };
  const slot = (k: SportKey) => (k === "olympics" ? 0 : k === primary ? 1 : 2);

  const entries: { key: SportKey; node: React.ReactNode }[] = [];

  if (olympics) entries.push({ key: "olympics", node: (
    <Card key="olympics" href={`/teams/olympics/${olympics.slug}`} chip="Olympics" sport="Olympics"
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
      {olympics.alltime_rank != null ? (
        <Stat label="All-time" value={`#${olympics.alltime_rank}`} />
      ) : null}
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
  ) });

  if (men) entries.push({ key: "football", node: (
    <Card key="football" href={`/teams/national/${men.slug}`} chip="Men's Football" sport="Football"
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
  ) });

  if (women) entries.push({ key: "wfootball", node: (
    <Card key="wfootball" href={`/teams/national/womens-world-cup/${women.slug}`} chip="Women's Football"
          sport="Football" name={women.name}
          chips={[{
            label: plural(women.titles, "World Cup"),
            gold: women.titles > 0,
            title: "FIFA Women's World Cup titles",
          }]}>
      <Stat label="WWC apps" value={`${women.appearances}`} />
      {women.best_finish ? <Stat label="Best" value={women.best_finish} /> : null}
    </Card>
  ) });

  if (cricket) entries.push({ key: "cricket", node: (
    <Card key="cricket" href={`/teams/cricket/${cricket.slug}`} chip="Cricket" sport="Cricket"
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
  ) });

  if (rugby) entries.push({ key: "rugby", node: (
    <Card key="rugby" href={`/teams/rugby-union/${rugby.slug}`} chip="Rugby Union" sport="Rugby Union"
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
  ) });

  if (baseball) entries.push({ key: "baseball", node: (
    <Card key="baseball" href={`/teams/baseball/${baseball.slug}`} chip="Baseball" sport="Baseball"
          name={baseball.name}
          chips={[{
            label: plural(baseball.titles, "WBC title"),
            gold: baseball.titles > 0,
            title: "World Baseball Classic titles",
          }]}
          note={baseball.name === "Chinese Taipei" && countryName === "Taiwan"
            ? "Competes as Chinese Taipei"
            : baseball.name === "Great Britain" && countryName !== "United Kingdom"
              ? "Competes as Great Britain" : null}>
      <Stat label="WBC apps" value={`${baseball.apps}`} />
      <Stat label="Record" value={`${baseball.w}-${baseball.l}`} />
      {baseball.best_finish ? <Stat label="Best" value={baseball.best_finish} /> : null}
    </Card>
  ) });

  if (basketball) entries.push({ key: "basketball", node: (
    <Card key="basketball" href={`/teams/basketball/${basketball.slug}`} chip="Basketball" sport="Basketball"
          tag={basketball.lineage ? `incl. ${basketball.lineage.join(", ")}` : null}
          name={basketball.name}
          chips={[{
            label: basketball.gold === 0 ? "No Olympic golds"
              : basketball.gold === 1 ? "1 Olympic gold" : `${basketball.gold} Olympic golds`,
            gold: basketball.gold > 0,
            title: "Olympic basketball gold medals",
          }]}>
      {basketball.fiba_rank != null ? (
        <Stat label="FIBA" value={`#${basketball.fiba_rank}`} />
      ) : null}
      {basketball.wc_titles > 0 ? (
        <Stat label="WC titles" value={`${basketball.wc_titles}`} />
      ) : null}
      <Stat label="Oly medals" value={`${basketball.medals}`} />
      <Stat label="WC apps" value={`${basketball.wc_apps}`} />
    </Card>
  ) });

  if (hockey) entries.push({ key: "hockey", node: (
    <Card key="hockey" href={`/teams/hockey/${hockey.slug}`} chip="Ice Hockey" sport="Ice Hockey"
          tag={hockey.lineage ? `incl. ${hockey.lineage.join(", ")}` : null}
          name={hockey.name}
          chips={[{
            label: hockey.oly_gold === 0 ? "No Olympic golds"
              : hockey.oly_gold === 1 ? "1 Olympic gold" : `${hockey.oly_gold} Olympic golds`,
            gold: hockey.oly_gold > 0,
            title: "Olympic ice hockey gold medals",
          }]}
          note={hockey.name === "Great Britain" && countryName !== "United Kingdom"
            ? "Competes as Great Britain" : null}>
      {hockey.oly_alltime_rank != null ? (
        <Stat label="All-time" value={`#${hockey.oly_alltime_rank}`} />
      ) : null}
      <Stat label="Oly medals" value={`${hockey.oly_medals}`} />
      {hockey.wc_titles > 0 ? (
        <Stat label="World Cups" value={`${hockey.wc_titles}`} />
      ) : null}
      {hockey.worlds_gold > 0 ? (
        <Stat label="Worlds golds" value={`${hockey.worlds_gold}`} />
      ) : null}
    </Card>
  ) });

  entries.sort((a, b) =>
    slot(a.key) - slot(b.key) ||
    scores[b.key] - scores[a.key] ||
    DEFAULT_PRIORITY[a.key] - DEFAULT_PRIORITY[b.key]
  );

  return (
    <section className="mb-8" id="national-teams">
      <h2 className="text-xl font-bold mb-3">National Teams</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {countryName} on the international stage. Click a card for the full record.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {entries.map((e) => e.node)}
      </div>
    </section>
  );
}
