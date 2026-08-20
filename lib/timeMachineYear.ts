import "server-only";

import { readFileSync } from "fs";
import { join } from "path";

import { getCountryTimeline } from "./countryTimeMachine";
import { getAllCountries, getPopulationFile } from "./countries";
import { getPowerHistory } from "./powerHistory";
import { getScreenYears } from "./screen";
import { getChampionsInYear, type YearChampion } from "./championsHistory";
import { getF1DriverTitles } from "./f1";

// The cross-section: one year, read across the boards that cover it.
//
// This is the part of the hub that is not just a list of links. Each strand
// reads the SAME data its own time machine reads — no separate summary file,
// no precomputed "facts of the year" table — so the hub cannot drift from the
// boards it advertises. If the Countries board changes its mind about 1912,
// this changes with it.
//
// 🔴 EVERY STRAND IS OPTIONAL AND SAYS SO WHEN IT IS ABSENT. The spans differ
// by centuries: power reaches 1500, population 1800, film 1920. A year outside
// a strand's range must render as "this board does not reach here" rather than
// as an empty slot, because an empty slot on a data page reads as missing data
// rather than as an honest edge. Same rule as the 0.0 rows on the Heartbreak
// board and the null years on the population series.

export type YearStrand = {
  key: string;
  label: string;
  value: string;
  detail?: string;
  href: string;
  /** Country slug for a flag, where the answer is a place. */
  flag?: string;
  /** Club name for a crest, where the answer is a team. */
  crest?: string;
  /** A single glyph when there is no flag or crest to show. */
  emoji?: string;
  /** Set when the strand has nothing for this year, with the reason. */
  absent?: string;
};

/** A one-line fact from a board that does not get a full card: rendered as an
 *  "Also in {year}" strip under the strand grid. Same honesty rule as the
 *  strands — each reads the SAME data its own board reads — but an extra that
 *  has nothing for the year simply does not appear, because a strip of
 *  "nothing here" chips would drown the ones that do. */
export type YearExtra = {
  key: string;
  text: string;
  href: string;
  /** Country slug for a flag chip, where the fact is about a place's office. */
  flag?: string;
  emoji?: string;
};

export type YearCrossSection = {
  year: number;
  strands: YearStrand[];
  extras: YearExtra[];
};

const fmtPeople = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : n.toLocaleString();

// World population before the annual series begins.
//
// 🔴 THESE TWELVE POINTS ARE NOT AN ANNUAL SERIES AND MUST NOT BE TREATED AS
// ONE. Ashwin asked for every year 1500-1799 and the honest answer is that no
// such dataset exists: OWID's population-with-projections file carries 1500,
// 1600, 1700 and then one point per decade to 1790 — twelve values for three
// centuries, from HYDE 3.3, which is itself a reconstruction rather than a
// measurement. Interpolating them into 300 annual figures would manufacture
// precision the source does not have, so this follows the site's standing rule
// for sparse series instead: show the nearest PRECEDING benchmark and label it
// with the year it came from, so the reader can see the staleness rather than
// infer it.
//
// 🔴 AND IT LIVES HERE, NOT IN THE SHARED SERIES. Loading these into
// public/data country-population.json would set `_meta.first` to 1500 and pad
// every country's dense array with ~300 nulls, moving the Countries board's
// minYear and its axis for a strand that only the hub reads. Scoped to this
// panel on purpose, per "just there for now".
const WORLD_BENCHMARKS: [number, number][] = [
  [1500, 503051104], [1600, 516147616], [1700, 595456896], [1710, 617975872],
  [1720, 648184768], [1730, 670899968], [1740, 702227776], [1750, 753279296],
  [1760, 788254976], [1770, 827951488], [1780, 900945152], [1790, 942261696],
];

const HYDE_NOTE = "HYDE 3.3 via Our World in Data";

function population(year: number): YearStrand {
  const base = { key: "population", label: "People on earth", href: `/countries?year=${year}` };
  const file = getPopulationFile();
  const world = new Map(file?.world ?? []);
  const total = world.get(year);
  if (total == null) {
    // Nearest preceding benchmark, but ONLY below the annual series. Without
    // the `year < seriesFrom` guard a gap at the TOP of the range — a year the
    // hub allows because the Power Atlas reaches it and the population file
    // does not yet — would fall through to 1790 and print 942m as the world
    // population of 2026. The guard is the whole reason this is not a plain
    // nearest-preceding lookup.
    const seriesFrom = file?._meta?.first ?? 1800;
    const bm = year < seriesFrom
      ? [...WORLD_BENCHMARKS].reverse().find(([y]) => y <= year)
      : undefined;
    // The href drops the year: the Countries board starts at `seriesFrom` and
    // would silently clamp, which is exactly the broken deep-link promise this
    // hub was built to stop making.
    if (bm) {
      const [at, n] = bm;
      return {
        ...base,
        href: "/countries",
        value: fmtPeople(n),
        detail: at === year
          ? `Estimated, ${HYDE_NOTE}`
          : `As of ${at}, the last estimate before ${year} · ${HYDE_NOTE}`,
        emoji: "🌍",
      };
    }
    // ABOVE the annual series, the workbook answers instead.
    //
    // Ashwin, 2026-08-14: "why doesn't 2026 have a total population — just use
    // the sum of all countries." The history file stops at 2025 because OWID's
    // projection column is capped there on purpose (see load_population_series
    // TO_YEAR: loading it whole would put 75 years of forecast behind a chart
    // captioned "population"). But the workbook carries a CURRENT count for
    // every country and is the site's ground truth for exactly that, so the
    // current year does not have to read as a hole.
    //
    // 🔴 THIS IS A DIFFERENT BASIS AND SAYS SO. The sum is ~8.13bn against the
    // 2025 projection's 8.23bn — not because the world shrank but because 247
    // official national counts, taken between 2020 and 2026 and never
    // rebased to a common date, do not add up to a UN model's single-date
    // estimate. Scrubbing 2025 → 2026 therefore shows a DROP, which would read
    // as a bug if the card did not name the change of source. It does.
    const seriesTo = file?._meta?.projectedTo ?? file?._meta?.last ?? 2025;
    if (year > seriesTo && year <= new Date().getUTCFullYear()) {
      const cs = getAllCountries().filter((c) => (c.pop ?? 0) > 0);
      // Every row, dependencies included: the workbook's parent figures
      // EXCLUDE their territories (the United States row is the 50 states and
      // DC, Puerto Rico is its own row), so summing the whole list is the
      // total and summing only sovereigns would lose ~87m people.
      const total = cs.reduce((a, c) => a + (c.pop ?? 0), 0);
      if (total > 0) {
        const big = cs.reduce((a, c) => ((c.pop ?? 0) > (a.pop ?? 0) ? c : a), cs[0]);
        return {
          ...base,
          href: "/countries",
          value: fmtPeople(total),
          detail: `Summed from ${cs.length} national counts · ${big.name} biggest at ${fmtPeople(big.pop ?? 0)}`,
          flag: big.slug,
          emoji: "🌍",
        };
      }
    }
    // Two different absences, and they must not read the same: below the
    // benchmarks there is no estimate at all, above the series there is a
    // board that simply has not been extended yet.
    return {
      ...base, value: "—",
      absent: year < WORLD_BENCHMARKS[0][0]
        ? `World population estimates here start in ${WORLD_BENCHMARKS[0][0]}.`
        : `The annual population series runs ${seriesFrom} to ${seriesTo}.`,
    };
  }
  // The largest territory that year, from the same atoms the Countries board
  // groups. Deliberately the TERRITORY and not the polity: "the largest single
  // country" is a different and more slippery claim once empires are in play,
  // and the board itself is the place to go and see that.
  const tl = getCountryTimeline();
  const i = year - tl.meta.from;
  let bestName = "", bestSlug = "", bestVal = 0;
  for (const c of tl.countries) {
    const v = c.v[i];
    if (v != null && v > bestVal) { bestVal = v; bestName = c.name; bestSlug = c.key; }
  }
  return {
    ...base,
    value: fmtPeople(total),
    detail: bestName ? `${bestName} is the biggest, ${fmtPeople(bestVal)}` : undefined,
    flag: bestSlug || undefined,
    emoji: "🌍",
  };
}

function power(year: number): YearStrand {
  const base = { key: "power", label: "The leading power", href: "/power-atlas" };
  const d = getPowerHistory();
  const rows = d.byYear[String(year)] ?? [];
  const top = rows.find((r) => r.rank === 1) ?? rows[0];
  if (!top) {
    return { ...base, value: "—", absent: "The Power Atlas runs 1500 to 2026." };
  }
  const label = d.labels[top.slug];
  // The era-correct name where the labels layer has one, so 1850 does not read
  // "Turkey" for a power that called itself something else entirely.
  const era = (label?.hist ?? []).find((h) => {
    const s = h.start ? parseInt(h.start.slice(0, 4), 10) : -Infinity;
    const e = h.end ? parseInt(h.end.slice(0, 4), 10) : Infinity;
    return year >= s && year <= e;
  });
  return {
    ...base,
    value: era?.name ?? label?.base ?? top.slug,
    // 🔴 `share` IS A FRACTION, NOT A PERCENTAGE. The Power Atlas multiplies by
    // 100 to render it and this panel did not, so a superpower holding a fifth
    // of world power read "0.2%". Caught only because 0.2% for a superpower is
    // absurd on its face; a subtler field would have shipped. Formatted here
    // the same way the Atlas formats it.
    detail: top.share != null
      ? `${(top.share * 100).toFixed(1)}% of world power`
      : top.tier,
    flag: top.slug,
    emoji: "⚖️",
  };
}

function film(year: number): YearStrand {
  const base = { key: "film", label: "At the cinema", href: "/screen/years" };
  const row = getScreenYears()?.years.find((y) => y.year === year);
  if (!row) {
    return { ...base, value: "—", absent: "The film year-by-year board runs 1920 to 2025." };
  }
  const best = row.awards?.picture?.film;
  const top = row.films?.[0]?.title;
  return {
    ...base,
    value: best ?? top ?? "—",
    detail: best
      ? (top && top !== best ? `Best Picture · biggest was ${top}` : "Best Picture")
      : (top ? "The year's biggest film" : undefined),
    emoji: "🎬",
  };
}

/** Fisher-Yates, on a copy. Fresh randomness per request; see below. */
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CHAMPS_SHOWN = 3;

/**
 * Champions of the year, rotating.
 *
 * WHAT THIS REPLACED AND WHY. The first version walked a hardcoded list of
 * five marquee competitions in a fixed order, so a given year always produced
 * the same card — Ashwin, 2026-08-14, on 1883: "randomly rotate between tier 0
 * and 1 for that year, so it isn't the same each time." Worse, the fixed list
 * returned NOTHING for 33 years in range (1860-1888, and 1916-1919) because
 * none of the five was being played, and the card then claimed no marquee
 * competition crowned anyone — while the ledger held eight champions for 1883.
 *
 * 🔴 THE POOL IS THE TWO BEST TIERS PRESENT THAT YEAR, NOT LITERALLY 0 AND 1.
 * Taking tiers 0 and 1 by number would blank exactly the year that prompted
 * this: 1883's eight champions are all tier 2 and 3 (MLB, College Football,
 * Wimbledon, the FA Cup, the Open, the Six Nations). So the tiers actually
 * present are sorted and the top two taken, which IS {0,1} for every year that
 * has them and degrades to {2,3} for the early ledger rather than to nothing.
 *
 * One row per competition, picked at random, because a straight sample gives
 * "MLB · MLB · MLB" in the years the ledger carries both the NL and the AA.
 *
 * 🔴 Math.random() IS SAFE HERE ONLY BECAUSE THE HUB IS force-dynamic. This is
 * a server component: the value is rendered once per request and shipped in
 * the RSC payload, so there is nothing for the client to re-roll and disagree
 * with. Move this into a client component, or drop `force-dynamic`, and it
 * becomes a hydration mismatch or a frozen cache respectively.
 */
function champions(year: number): YearStrand {
  const base = { key: "champions", label: "Champions that year", href: `/sports/champions?asof=${year}-12` };
  const rows = getChampionsInYear(year);
  if (!rows.length) {
    // Two different absences, and they must not read the same. Before 1860 the
    // ledger does not reach; inside its range an empty year is a fact about
    // the year rather than about our coverage.
    return {
      ...base, value: "—",
      absent: year < 1860
        ? "The champions ledger starts in 1860."
        : "The ledger has no champion crowned in this year.",
    };
  }

  const byComp = new Map<string, YearChampion[]>();
  for (const r of rows) {
    const g = byComp.get(r.compSlug);
    if (g) g.push(r); else byComp.set(r.compSlug, [r]);
  }
  const groups = [...byComp.values()];

  const tiers = [...new Set(groups.map((g) => g[0].tier).filter((t): t is number => t != null))]
    .sort((a, b) => a - b)
    .slice(0, 2);
  const keep = new Set(tiers);
  // Untiered-only years fall back to everything rather than to an empty card.
  const eligible = keep.size ? groups.filter((g) => keep.has(g[0].tier as number)) : groups;

  const won = shuffled(eligible.length ? eligible : groups)
    .slice(0, CHAMPS_SHOWN)
    .map((g) => shuffled(g)[0]);

  // The headline is the CHAMPION; the competition is the supporting line.
  // Cramming both into the value gave "Unified Team (Summer Olympics Top
  // Medalist)" as a card title, which is a database row rather than a fact
  // anyone wants to read.
  const rest = won.slice(1).map((w) => w.champion).join(" · ");
  return {
    ...base,
    value: won[0].champion,
    detail: [won[0].eraName || won[0].competition, rest].filter(Boolean).join(" · "),
    // The CANONICAL name, not the era one: crests are keyed on the club as it
    // is known today, so "Boston Red Sox" resolves and a period label does not.
    crest: won[0].canonical || undefined,
    emoji: "🏆",
  };
}

// ---------------------------------------------------------------------------
// The "Also in {year}" strip: one-liners from boards that have a fact for the
// year but no full card. Leaders come straight from the files the /leaders
// board serves; the F1 champion from the same data as the F1 hub.
//
// 🔴 THE STRIP IS A RANDOM DRAW FROM A WIDE POOL, not a fixed US/UK/F1 trio
// (Ashwin, 2026-08-20: "randomize the different categories"). Every candidate
// the year can support goes into the pool — twenty countries' leaders plus the
// F1 champion — and EXTRAS_SHOWN are drawn at random. Math.random() is safe
// here for exactly the reason it is in champions() above: the hub is
// force-dynamic, so the value renders once per request.

type LeaderRow = { name: string; role: string; start: string; end: string | null };

const _leaders = new Map<string, LeaderRow[]>();
function leadersFile(slug: string): LeaderRow[] {
  const hit = _leaders.get(slug);
  if (hit) return hit;
  let rows: LeaderRow[] = [];
  try {
    rows = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "leaders", `${slug}.json`), "utf-8"),
    ) as LeaderRow[];
  } catch {
    /* board absent: the strip simply skips it */
  }
  _leaders.set(slug, rows);
  return rows;
}

/** Whoever held an office on 1 July of the year — mid-year, so a January
 *  handover credits the incumbent who served most of it. A country whose file
 *  holds both a head of state and a head of government returns both; the
 *  caller draws one. */
function officeHolders(slug: string, year: number): LeaderRow[] {
  const at = `${year}-07-01`;
  return leadersFile(slug).filter(
    (l) => l.start <= at && (l.end == null || l.end > at),
  );
}

/** Countries in the pool, with the article their name needs in a sentence.
 *  All twenty have deep leader histories on the /leaders board. */
const EXTRA_COUNTRIES: [slug: string, display: string, href: string][] = [
  ["united-states", "the United States", "/us-political-leadership/time-machine"],
  ["united-kingdom", "the United Kingdom", "/uk-political-leadership/time-machine"],
  ["france", "France", "/countries/france"],
  ["germany", "Germany", "/countries/germany"],
  ["russia", "Russia", "/countries/russia"],
  ["china", "China", "/countries/china"],
  ["japan", "Japan", "/countries/japan"],
  ["india", "India", "/countries/india"],
  ["italy", "Italy", "/countries/italy"],
  ["spain", "Spain", "/countries/spain"],
  ["canada", "Canada", "/countries/canada"],
  ["australia", "Australia", "/countries/australia"],
  ["brazil", "Brazil", "/countries/brazil"],
  ["mexico", "Mexico", "/countries/mexico"],
  ["turkey", "Turkey", "/countries/turkey"],
  ["egypt", "Egypt", "/countries/egypt"],
  ["south-africa", "South Africa", "/countries/south-africa"],
  ["argentina", "Argentina", "/countries/argentina"],
  ["netherlands", "the Netherlands", "/countries/netherlands"],
  ["sweden", "Sweden", "/countries/sweden"],
];

const EXTRAS_SHOWN = 4;

/**
 * A sentence from a role string the files write many ways: "President",
 * "King of Italy", "Emperor (Second Empire)", "Paramount Leader (PRC)",
 * "Chairman, Council of People's Commissars", "Provisional Government".
 * Crowns "reign over"; office-like titles read "is {role} of {country}";
 * anything that is a body or already carries its own scope just "leads",
 * because "is King of Italy of Italy" is the bug this function exists for.
 */
function leaderText(l: LeaderRow, display: string): string {
  const clean = l.role.replace(/\s*\(.+\)\s*$/, "").trim();
  if (/^(monarch|sovereign|emperor|empress|king|queen|sultan|regent|shogun|kaiser|tsar|stadtholder|elector)\b/i.test(clean)) {
    return `${l.name} reigns over ${display}`;
  }
  if (/\bof\b|,|government|authority|regency/i.test(clean)) {
    return `${l.name} leads ${display}`;
  }
  return `${l.name} is ${clean} of ${display}`;
}

function extras(year: number): YearExtra[] {
  const pool: YearExtra[] = [];
  for (const [slug, display, href] of EXTRA_COUNTRIES) {
    const holders = officeHolders(slug, year);
    if (!holders.length) continue;
    const l = shuffled(holders)[0];
    pool.push({ key: `leader-${slug}`, flag: slug, text: leaderText(l, display), href });
  }
  try {
    const f1 = getF1DriverTitles().find((t) => t.years.includes(year));
    if (f1) {
      pool.push({
        key: "f1",
        emoji: "🏎️",
        text: `${f1.name} takes the Formula 1 world championship`,
        href: "/teams/f1",
      });
    }
  } catch {
    /* F1 data absent: skip */
  }
  return shuffled(pool).slice(0, EXTRAS_SHOWN);
}

export function getYearCrossSection(year: number): YearCrossSection {
  return {
    year,
    strands: [population(year), power(year), champions(year), film(year)],
    extras: extras(year),
  };
}
