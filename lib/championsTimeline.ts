import "server-only";

// Reign windows for every competition in the all-time ledger, so
// /sports/champions can answer "who held what in <month> <year>".
//
// Source of truth: public/data/champions-history.json (Champions_History.xlsx ->
// scripts/build-champions-history.py). Every row now carries a YYYY-MM-DD date,
// which is what makes month-level resolution possible at all.
//
// The model is deliberately the same shape as /leaders: a holder reigns from the
// day they won until the day the next holder won, and a month that contains a
// handover returns BOTH. Server-only (it pulls championsHub for team links);
// served to the client as static JSON by app/api/champions-timeline.
//
// Two rules close a reign early. A competition that has stopped being contested
// expires at the end of the calendar year it was last won, so a dead trophy is
// never still on the board the following January. And a competition that was
// abolished outright is cut on the day its replacement took over, which matters
// for the handful that were later revived — see ABOLISHED below.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { championTeamHref, getChampionsWithLinks } from "./championsHub";

type Raw = {
  sport: string;
  competition: string;
  /** Period-correct competition name ("VFL Premiership", "European Cup"). */
  eraName?: string;
  compSlug: string;
  /** Not always a string: the workbook writes a bare year as a number. */
  season: string | number | null;
  year: number | null;
  champion: string;
  canonical: string;
  metroSlug: string;
  date: string;
  scope?: string;
  scopeType: string;
  tier?: number | null;
  tierGuide?: number | null;
  isCurrent?: boolean;
};

export type TimelineChampion = {
  /** Era-correct name, e.g. "Baltimore Colts" for 1970 — the point of a time machine. */
  name: string;
  canonical: string;
  href: string | null;
  metroSlug: string;
  season: string;
  /** This champion's own date. Co-champions of one season can differ by days. */
  won: string;
};

export type TimelineReign = {
  /** Index into comps[]. */
  c: number;
  /** Earliest day this season's title was won (inclusive). */
  from: string;
  /** Day the next season's title was won (exclusive); null = still held. */
  to: string | null;
  /** The competition's period-correct name for this reign; see the push site. */
  eraName: string;
  /**
   * The tier THIS reign was won at, which is not the competition's tier today.
   * The NFL is the clearest case: 1920-65 NFL Champions sit at tier 1, the
   * 1946-49 AAFC at 3, the pre-merger Super Bowls 1966-71 at 1, and only
   * 1972 onward at 0. Reading these off TimelineComp showed whichever row
   * happened to sort first in the workbook for every season in history.
   */
  tier: number | null;
  tierGuide: number | null;
  /**
   * One season's champions. More than one means a split title: co-champions who
   * hold it together rather than in succession — Michigan and Nebraska in 1997,
   * the NFL and AAFC champions of 1946, Six Nations 1920's three-way tie. Each
   * carries its own `won` date and only counts from that day.
   */
  champions: TimelineChampion[];
};

export type TimelineComp = {
  slug: string;
  competition: string;
  sport: string;
  scopeType: string;
  geo: string;
  region: string;
  tier: number | null;
  tierGuide: number | null;
  gold: boolean;
  first: string;
  last: string;
  /** False once the competition stops being contested; drives the "hide when it ends" rule. */
  live: boolean;
};

export type ChampionsTimeline = {
  generated: string;
  minYear: number;
  maxYear: number;
  comps: TimelineComp[];
  reigns: TimelineReign[];
};

const DAY = 86_400_000;
/** Exclusive end-of-year bound: 1 Jan of the following year. */
function jan1After(iso: string): string {
  return `${Number(iso.slice(0, 4)) + 1}-01-01`;
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}
function median(xs: number[]): number {
  if (!xs.length) return 366;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function rows(): Raw[] {
  const p = join(process.cwd(), "public", "data", "champions-history.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as Raw[]) : [];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Competition metadata from the current-champions board, so the time machine
// sorts and filters identically to the Current view. Competitions that have
// folded (Cup Winners Cup, Inter-Cities Fairs Cup, ...) are not on that board,
// so geo/region fall back to the workbook's own Scope column and, for region,
// to a live competition that shares the same geo.
type Meta = { geo: string; region: string; gold: boolean; live: boolean };
function metaIndex(): { byComp: Map<string, Meta>; regionByGeo: Map<string, string> } {
  const byComp = new Map<string, Meta>();
  const regionByGeo = new Map<string, string>();
  for (const c of getChampionsWithLinks()) {
    byComp.set(c.competition, { geo: c.geo, region: c.region, gold: c.gold, live: true });
    if (c.geo && !regionByGeo.has(c.geo)) regionByGeo.set(c.geo, c.region);
  }
  return { byComp, regionByGeo };
}

const CONTINENTS = new Set(["Africa", "Asia", "Europe", "North America", "Oceania", "South America"]);

// Competitions that stopped being contested for a while, as opposed to merely
// not being played in a year the holder legitimately stayed champion.
//
// This CANNOT be inferred from gap length, which is why it is a hand-kept list.
// A long silence is usually a suspension in which the last champion rightly
// keeps the crown: nobody took the 1914 Five Nations off England during the war,
// Uruguay were Copa América holders from 1967 to 1975, and West Indies held the
// T20 World Cup from 2016 to 2021. Those must keep reigning. A dormancy is the
// other thing — the trophy was withdrawn, replaced or shelved — and the reign is
// cut short even when a later revival supplies a "next" title to chain to.
//
// `from` is the day the reign ends. For a competition that was replaced, that is
// the day its successor took over. For one that was simply shelved, it is the
// start of the year after it was last won, matching the rule for competitions
// that end for good.
const DORMANT: Record<string, { from: string; why: string }[]> = {
  "Intercontinental Cup": [
    {
      from: "2005-12-18",
      why: "Superseded by the FIFA Club World Cup, whose 2005 final was the first to carry the world club title. FIFA revived the Intercontinental Cup as a separate competition in 2024, which is why the ledger chains straight from 2004 to 2024 and needs this cut.",
    },
  ],
  "Club World Cup": [
    {
      from: "2001-01-01",
      why: "The 2001 edition was cancelled after the collapse of FIFA's marketing partner ISL and the competition was shelved until 2005. The Intercontinental Cup carried the world club title in the interim.",
    },
  ],
  "OFC Nations Cup": [
    {
      from: "1981-01-01",
      why: "Not contested between 1980 and 1996.",
    },
  ],
  "AFC Champions League Elite": [
    {
      from: "1972-01-01",
      why: "The Asian Champion Club Tournament lapsed after 1971 and was not revived until the 1985-86 edition.",
    },
  ],
  "OFC Champions League": [
    {
      from: "1988-01-01",
      why: "The Oceania Club Championship lapsed after 1987 and was not held again until 1999.",
    },
    {
      from: "2002-01-01",
      why: "Shelved again after 2001; the next edition was 2005.",
    },
  ],
  MLB: [
    {
      from: "1903-10-13",
      why: "The day Boston won the first World Series, which is the day the league pennant stopped being the terminal title of a baseball season. The ledger records the NL and AL pennants for 1901, 1902 and 1904 — the years with no World Series — and not for 1903, so without this cut the 1902 winners keep reigning right through 1903 and into October 1904. That is wrong on its face for the AL, where Boston and not Philadelphia won the 1903 pennant. From November 1903 to September 1904 the board should carry the World Series champion alone. The cut lands on the NL and AL 1902 reigns only: it is later than every reign the AA, Players' League, Temple Cup and 19th-century World's Series strands can still be serving, earlier than the Federal League's, and not later than the start of the 1903 World Series reign it is meant to hand over to.",
    },
  ],
};

let _cache: ChampionsTimeline | null = null;

export function getChampionsTimeline(): ChampionsTimeline {
  if (_cache) return _cache;

  const all = rows().filter((r) => r.competition && ISO.test(r.date || ""));
  const { byComp, regionByGeo } = metaIndex();
  const today = new Date().toISOString().slice(0, 10);

  const byCompSlug = new Map<string, Raw[]>();
  for (const r of all) {
    const a = byCompSlug.get(r.compSlug);
    if (a) a.push(r);
    else byCompSlug.set(r.compSlug, [r]);
  }

  const comps: TimelineComp[] = [];
  const reigns: TimelineReign[] = [];

  for (const list of byCompSlug.values()) {
    // Reigns are keyed on the SEASON, not the date. Two rows for one season are
    // co-champions of a split title and hold it together; two rows for different
    // seasons are a succession. Keying on the date got this wrong wherever a
    // split title was awarded on different days — Michigan took the 1997 AP
    // title after the Rose Bowl on 1 January 1998 and Nebraska the coaches'
    // title after the Orange Bowl on the 2nd, and the chain read that as
    // Nebraska replacing Michigan a day later.
    //
    // Neither a date-gap threshold nor the era name can stand in for this. The
    // 1974 college football split is 39 days apart because Oklahoma were on
    // probation and played no bowl; the NFL and AAFC champions of 1946 carry
    // different era names and are still co-champions.
    // SEASONLESS competitions key on the DATE, not the season. Boxing has no
    // seasons: a belt can change hands three times in a calendar year, and the
    // workbook necessarily writes the same Season (the year) on each. Grouping
    // those by season made them co-champions, so June 1990 showed the WBA belt
    // held by Tim Witherspoon AND Bonecrusher Smith at once, when in fact Smith
    // took it off Witherspoon that December. Every title change is its own
    // reign, ended by the next one in the same lineage.
    //
    // This is the exact inverse of the season rule above and both are needed:
    // a league's split title is two champions on different days, a boxing
    // lineage is two champions on different days who are a succession. Nothing
    // in the shape of the data distinguishes them, so the sport does.
    const SEASONLESS_SPORTS = new Set(["Boxing"]);
    const seasonless = SEASONLESS_SPORTS.has(list[0].sport);
    const bySeason = new Map<string, Raw[]>();
    for (const r of list) {
      // Coerce: the workbook writes a bare year as a NUMBER, so season is not
      // always a string however the JSON is typed.
      const k = seasonless
        ? r.date
        : String(r.season ?? "").trim() || String(r.year ?? "").trim() || r.date;
      const a = bySeason.get(k);
      if (a) a.push(r);
      else bySeason.set(k, [r]);
    }
    // STRANDS. One compSlug can carry two competitions that ran side by side
    // under rival banners. Merging those into one season group made Boston
    // Celtics and Oakland Oaks co-champions of the same trophy in 1969, and
    // chained the ABA champion's reign to the NBA's calendar.
    //
    // This has to be a CURATED list, and both cheaper rules were tested against
    // the ledger and rejected:
    //   - Tier does not work. NFL Champions and AFL Champions 1960-65 are BOTH
    //     tier 1 / guide 2.5, so a tier split leaves the pair he asked about
    //     merged. It also splits NFL Champions (tier 1) from Super Bowl
    //     Champions (tier 0), which is one continuous competition.
    //   - Era name alone does not work either. 126 season groups hold more than
    //     one era at the same tier and nearly all must stay merged: Argentina's
    //     Apertura and Clausura, Liga MX's Apertura and Clausura, and NCAA
    //     basketball's Helms / Premo-Porretta / tournament selections, which are
    //     three selectors of ONE national title rather than three leagues.
    //
    // So: name the rival banners explicitly, keyed by competition then era, the
    // same shape as DORMANT above. Anything unlisted stays on the main strand,
    // which means adding a competition here is the only way to split one.
    const RIVAL_STRANDS: Record<string, Record<string, string>> = {
      // The AAFC (1946-49) and the AFL (1960-65) were separate leagues with
      // their own championship games, not co-winners of the NFL's title.
      NFL: { "AAFC Champions": "aafc", "AFL Champions": "afl" },
      // The ABA ran 1968-76 alongside the NBA. BAA Champions is NOT here: the
      // BAA is the NBA's own predecessor, a continuous line.
      NBA: { "ABA Champions": "aba" },
      // The WHA's Avco World Trophy, 1973-79, beside the Stanley Cup.
      NHL: { "AVCO Cup Champions": "wha" },
      // Baseball before the World Series settled it. Two things are going on
      // and they are different in kind, so they are split on both axes.
      //
      // LEAGUES. The NL, the AA, the AL, the Players' League and the Federal
      // League each crowned their own champion, and in 1890 three of them did
      // it in the same October. Merging them made the NL and AA pennant winners
      // read as co-holders of one trophy.
      //
      // POSTSEASON. The 19th-century World's Series (1884-90), the Temple Cup
      // (1894-97) and the World Series (1903-) are interleague play-offs, not
      // league titles, and they are three separate formats rather than one
      // continuous line: nothing was contested 1891-93 or 1898-1902. Keeping
      // them apart lets each expire at its own end instead of handing the 1890
      // co-champions a reign that runs to the first Temple Cup.
      //
      // "World Series Champions" is deliberately absent, so it stays on the
      // main strand and keeps the competition's live current champion.
      MLB: {
        "NL Champions": "nl",
        "AA Champions": "aa",
        "AL Champions": "al",
        "Players' League Champions": "pl",
        "Federal League Champions": "fl",
        "World's Series Winner": "ws19c",
        "Temple Cup Winners": "temple",
      },
      // Brazil ran two national championships side by side in 1967 and 1968.
      // Only the Taça Brasil is split out: the Torneio Roberto Gomes Pedrosa is
      // the direct predecessor of the 1971 Campeonato Nacional de Clubes and
      // belongs on the main strand, which keeps the national line unbroken
      // through 1971. Merged, the 1968 season group ran from the Robertão final
      // in December 1968 to the Taça Brasil final in October 1969 and put
      // Santos and Botafogo up as joint champions of Brazil for a year.
      "Brasileiro Série A": { "Taça Brasil": "taca" },
    };
    const strandMap = RIVAL_STRANDS[list[0].competition] ?? {};
    const strandOf = (r: Raw) => strandMap[String(r.eraName ?? "")] ?? "main";
    const strandKeys = [...new Set(list.map(strandOf))];
    const soleStrand = strandKeys.length === 1;

    for (const sk of strandKeys) {
    const strandRows = list.filter((r) => strandOf(r) === sk);
    const strandSeasons = new Map<string, Raw[]>();
    for (const [k, rs] of bySeason) {
      const mine = rs.filter((r) => strandOf(r) === sk);
      if (mine.length) strandSeasons.set(k, mine);
    }
    const groups = [...strandSeasons.values()]
      .map((rs) => {
        const ds = rs.map((r) => r.date).sort();
        return { rs, start: ds[0], end: ds[ds.length - 1] };
      })
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

    const dates = [...new Set(strandRows.map((r) => r.date))].sort();
    const first = groups[0].start;
    const last = groups[groups.length - 1].end;
    // The strand's own head, not the competition's. On a split competition the
    // rival strand must take its tier, era and dates from its own rows.
    const head = strandRows[0];
    const meta = byComp.get(head.competition);

    // How long one holder normally keeps it, from this competition's own
    // history. Only used to decide whether the competition is still running.
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
    const cycle = Math.min(Math.max(median(gaps), 366), 1826);

    // Liveness is per strand. `meta.live` says the COMPETITION is on the
    // current-champions board, which is true of the NBA and therefore of the
    // ABA strand too if applied blindly — that would leave the Oakland Oaks
    // reigning today. Only the sole strand of an unsplit competition may use
    // it; a rival strand lives or dies on its own rows.
    const live =
      strandRows.some((r) => r.isCurrent) ||
      (soleStrand && Boolean(meta?.live)) ||
      daysBetween(last, today) <= cycle;

    const geo = meta?.geo || head.scope || "—";
    const region =
      meta?.region ||
      (geo === "World" ? "World" : CONTINENTS.has(geo) ? geo : regionByGeo.get(geo) || "Other");

    const c = comps.length;
    comps.push({
      slug: head.compSlug,
      competition: head.competition,
      sport: head.sport,
      scopeType: head.scopeType || "",
      geo,
      region,
      tier: head.tier ?? null,
      tierGuide: head.tierGuide ?? null,
      gold: Boolean(meta?.gold),
      first,
      last,
      live,
    });

    const dormancies = DORMANT[head.competition] ?? [];

    groups.forEach((g, i) => {
      // The next season that starts AFTER this one's last champion was crowned.
      // Scanning forward rather than taking groups[i + 1] matters where seasons
      // overlap in the ledger: the 1968 Brazilian season carries a Robertão
      // title in December 1968 and a Taça Brasil in October 1969, which the 1969
      // season starts inside.
      const next = groups.slice(i + 1).find((x) => x.start > g.end) ?? null;
      // A competition that has stopped being contested expires at the end of the
      // calendar year it was last won, so a dead trophy never turns up in the
      // following January. A live one is open-ended.
      let to = next ? next.start : live ? null : jan1After(last);
      // A dormancy cuts the reign short of the next title, which is how a
      // revived competition (Intercontinental Cup: 2004, then nothing until
      // 2024) avoids handing its last champion a twenty-year reign.
      const cut = dormancies.find((x) => x.from > g.start && (to === null || x.from < to));
      if (cut) to = cut.from;
      reigns.push({
        c,
        from: g.start,
        to,
        // The competition's name AT THE TIME, from the reign's own rows, e.g.
        // "VFL Premiership" for 1983 rather than "AFL", "European Cup" rather
        // than "Champions League". It belongs on the reign and not on
        // TimelineComp because it changes from season to season, which is the
        // whole point of it. TimelineComp.competition stays canonical so
        // sorting, filtering and the competition link remain stable across
        // eras. Falls back to the canonical name when a row carries no era.
        // String() because champions-history.json is cast, not validated, and
        // its fields are not reliably strings (see `season`).
        eraName: String(g.rs[0]?.eraName ?? "").trim() || head.competition,
        // Era-correct tier, from this reign's own rows rather than the
        // competition's head row. Falls back to the competition's value so an
        // untiered row still sorts where the competition does.
        tier: g.rs[0]?.tier ?? head.tier ?? null,
        tierGuide: g.rs[0]?.tierGuide ?? head.tierGuide ?? null,
        champions: [...g.rs]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((r) => ({
            name: r.champion || r.canonical,
            canonical: r.canonical,
            href: championTeamHref({
              sport: r.sport,
              team: r.canonical || r.champion,
              competition: r.competition,
              scopeType: r.scopeType || null,
              year: r.year,
            }),
            metroSlug: r.metroSlug || "",
            season: String(r.season ?? "") || String(r.year ?? ""),
            // Each co-champion keeps its OWN date, so the board can hold one back
            // until it has actually been won. Argentina crowned the Metropolitano
            // in August 1967 and the Nacional that December; September 1967 must
            // show only the first.
            won: r.date,
          })),
      });
    });
    } // end strand
  }

  // UNIFIED TITLES vs THEIR CONSTITUENT BELTS.
  //
  // The ledger records a unified championship as its own competition, named for
  // the bodies it carries: "World Heavyweight Championship (WBA, WBC, and IBF)"
  // beside "(WBA)", "(WBC)" and "(IBF)". That leaves a GAP in each constituent
  // lineage for as long as the belts are held together, and a gap is exactly
  // what the reign chain fills by extending the previous holder. June 1990 read
  // as five heavyweight champions: Buster Douglas with the unified title, plus
  // Bonecrusher Smith, Mike Tyson and Tony Tucker still holding the very belts
  // Douglas had just taken off Tyson.
  //
  // Nothing needs inventing to fix it, because the competition names already
  // say which bodies are involved. A reign of any belt ends the moment a
  // competition sharing one of its bodies crowns someone, and that is
  // symmetric: a unified reign ends when a constituent belt is next won alone.
  const bodiesOf = (competition: string): Set<string> => {
    const open = competition.indexOf("(");
    const close = competition.lastIndexOf(")");
    if (open < 0 || close <= open) return new Set();
    return new Set(
      competition
        .slice(open + 1, close)
        // Drop nested qualifiers such as the "(Super)" in "WBA (Super)".
        .replace(/\([^)]*\)/g, " ")
        .split(/,|\band\b/i)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && s !== "AND"),
    );
  };
  const compBodies = comps.map((c) => (c.sport === "Boxing" ? bodiesOf(c.competition) : new Set<string>()));
  // Every boxing reign start, so each reign can find the next event that
  // touches one of its bodies.
  const events = reigns
    .map((r) => ({ c: r.c, from: r.from }))
    .filter((e) => compBodies[e.c].size > 0)
    .sort((a, b) => a.from.localeCompare(b.from));
  for (const r of reigns) {
    const mine = compBodies[r.c];
    if (mine.size === 0) continue;
    for (const e of events) {
      if (e.c === r.c || e.from <= r.from) continue;
      if (r.to !== null && e.from >= r.to) break; // already ends earlier
      let overlaps = false;
      for (const b of compBodies[e.c]) {
        if (mine.has(b)) { overlaps = true; break; }
      }
      if (overlaps) {
        r.to = e.from;
        break;
      }
    }
  }

  // Same default order as the Current board: tier, then the sub-tier guide,
  // then sport, then name.
  const order = comps
    .map((c, i) => i)
    .sort(
      (a, b) =>
        (comps[a].tier ?? 99) - (comps[b].tier ?? 99) ||
        (comps[a].tierGuide ?? 999) - (comps[b].tierGuide ?? 999) ||
        comps[a].sport.localeCompare(comps[b].sport) ||
        comps[a].competition.localeCompare(comps[b].competition),
    );
  const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
  const sortedComps = order.map((i) => comps[i]);
  const sortedReigns = reigns
    .map((r) => ({ ...r, c: remap.get(r.c)! }))
    .sort((a, b) => a.c - b.c || a.from.localeCompare(b.from));

  const years = sortedComps.flatMap((c) => [Number(c.first.slice(0, 4)), Number(c.last.slice(0, 4))]);

  _cache = {
    generated: today,
    minYear: years.length ? Math.min(...years) : 1850,
    maxYear: new Date().getUTCFullYear(),
    comps: sortedComps,
    reigns: sortedReigns,
  };
  return _cache;
}
