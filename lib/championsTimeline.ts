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
    const bySeason = new Map<string, Raw[]>();
    for (const r of list) {
      // Coerce: the workbook writes a bare year as a NUMBER, so season is not
      // always a string however the JSON is typed.
      const k = String(r.season ?? "").trim() || String(r.year ?? "").trim() || r.date;
      const a = bySeason.get(k);
      if (a) a.push(r);
      else bySeason.set(k, [r]);
    }
    const groups = [...bySeason.values()]
      .map((rs) => {
        const ds = rs.map((r) => r.date).sort();
        return { rs, start: ds[0], end: ds[ds.length - 1] };
      })
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

    const dates = [...new Set(list.map((r) => r.date))].sort();
    const first = groups[0].start;
    const last = groups[groups.length - 1].end;
    const head = list[0];
    const meta = byComp.get(head.competition);

    // How long one holder normally keeps it, from this competition's own
    // history. Only used to decide whether the competition is still running.
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
    const cycle = Math.min(Math.max(median(gaps), 366), 1826);

    const live =
      list.some((r) => r.isCurrent) || Boolean(meta?.live) || daysBetween(last, today) <= cycle;

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
