"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TableScroll } from "@/app/_shared/TableScroll";
import { flagCdnUrl } from "@/lib/international-display";

// Time machine for /countries: pick any year from 1800 and see who held every
// territory, and how many people lived in it.
//
// THE ONE RULE THIS BOARD EXISTS TO KEEP. A state's total is the sum of the
// rows you get when you expand it. Not approximately - exactly, because the
// total was computed from those rows upstream rather than read off a separate
// parent series. Where the source's own parent figure disagrees (Yugoslavia by
// about 2%, Serbia and Montenegro by about 3%, because OWID's Balkan parents
// are round Gapminder-era estimates while the successors are UN WPP
// back-casts) the divergence is printed on the expanded row rather than
// quietly resolved in our favour.
//
// EVERY FIGURE IS A TERRITORY AS DRAWN TODAY, carrying that year's people.
// That is what lets a state that no longer exists appear at all: the USSR in
// 1985 is the sum of fifteen modern territories, not a separate estimate. It
// is also the honest limit of the design - it answers "how many people lived
// in the area the USSR governed" and not "what did the 1985 census say".
//
// SPARSE YEARS ARE LABELLED, NEVER INTERPOLATED. East and West Germany have
// three data points between them across 1949-1990. Landing on 1972 shows the
// nearest preceding value with "as of 1970" attached, so nobody is handed an
// invented number wearing the clothes of a measurement (Ashwin's ruling,
// 2026-08-14, matching the leadership-gap convention).
//
// Data is the static /api/country-timeline document, fetched lazily so the
// /countries payload is untouched - the champions-timeline pattern.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ALL = "All";
const CONTINENT_ORDER = [
  "Africa", "Asia", "Europe", "North America", "Oceania", "South America",
];

type Entity = { key: string; name: string; continent: string | null; v: (number | null)[] };
type Polity = Entity & {
  from: number;
  to: number;
  replaces: string[];
  memberWindows?: [string, number, number][];
  gaps?: [number, number][];
  basis: "sum" | "source";
  partitionOf?: string;
  sourceDivergence: number | null;
};
type Empire = {
  key: string;
  name: string;
  coloniser: string;
  metropole: string;
  from: number;
  to: number;
  territories: number;
  eraNames?: [number, number, string][];
};
type Timeline = {
  meta: { from: number; to: number; estimateThrough: number; source: string; note: string };
  countries: Entity[];
  polities: Polity[];
  empires: Empire[];
  colonisers: Record<string, [number, number, string][]>;
  colonySource: string;
  partitioned: { slug: string; from: number; to: number; between: string[] }[];
  dominions: { slug: string; from: number; of: string }[];
  dependencies: Record<string, string>;
  dependencyOverrides: { slug: string; from: number; to: number; holder: string }[];
  dependencySince: Record<string, number>;
  countryEras: Record<string, [number, number, string][]>;
  extraHoldings: {
    slug: string; from: number; to: number; holder: string;
    kind: "colony" | "occupied" | "annexed" | "partial" | "client"; note?: string;
  }[];
  extraEraNames: Record<string, [number, number, string][]>;
  fragmented: { slug: string; from: number; to: number; note: string }[];
};

/**
 * How a territory was held that year. `sovereign` is the absence of the
 * others. Ashwin's ruling: sovereign and colony are on by default, the rest
 * behind the grouping control.
 */
type Control =
  | "sovereign" | "colony" | "constituent" | "partition" | "metropole"
  | "partitioned" | "dominion" | "occupied" | "annexed" | "fragmented" | "client";
const CONTROL_LABEL: Record<Control, string> = {
  sovereign: "",
  colony: "colony",
  constituent: "constituent",
  partition: "partition",
  metropole: "metropole",
  partitioned: "partitioned",
  dominion: "dominion",
  occupied: "occupied",
  annexed: "annexed",
  fragmented: "not yet one country",
  client: "client state",
};

type SortKey = "rank" | "name" | "value" | "share";

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}bn`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}
function pct(v: number): string {
  return v >= 1 ? `${v.toFixed(1)}%` : `${v.toFixed(2)}%`;
}

/** Nearest value at or before `i`, with the year it actually came from. */
function nearest(v: (number | null)[], i: number, from: number) {
  for (let j = Math.min(i, v.length - 1); j >= 0; j--) {
    if (v[j] != null) return { value: v[j] as number, year: from + j, stale: j !== i };
  }
  return null;
}

/**
 * Period flags for states that no longer exist, extracted from the OT-SVG
 * glyphs of BabelStone Flags (SIL OFL 1.1) and served as images - see
 * public/flags-historical/ATTRIBUTION.md.
 *
 * Only four exist, and that is the whole list the font can honestly supply.
 * The Russian Empire, the Austrian Empire, Austria-Hungary and the Ottoman
 * Empire are NOT here. Their modern successors' flags are in the font, and
 * using one would be worse than showing nothing: an 1850 row captioned
 * "Ottoman Empire" beside the flag of the Turkish Republic is a claim, not a
 * label. Those rows stay bare until real period artwork exists.
 */
const HISTORICAL_FLAG: Record<string, string> = {
  OWID_USS: "soviet-union",
  OWID_YGS: "yugoslavia",
  OWID_CZS: "czechoslovakia",
  OWID_GDR: "east-germany",
};

/**
 * Polities whose flag is a MODERN one, legitimately. These are not different
 * states wearing a successor's colours - they are the same state with a
 * different extent. Ethiopia with Eritrea is Ethiopia; West Germany's flag IS
 * the modern German one. That is why the Ottoman Empire is not here: Turkey is
 * a successor, not the same state larger.
 */
const POLITY_MODERN_FLAG: Record<string, string> = {
  OWID_ERE: "ethiopia",
  OWID_GFR: "germany",
};

/** Flag emoji never render on Windows, so the site uses CDN images sitewide. */
function Flag({ slug }: { slug: string }) {
  const hist = HISTORICAL_FLAG[slug];
  const url = hist
    ? `/flags-historical/${hist}.svg`
    : flagCdnUrl(POLITY_MODERN_FLAG[slug] ?? slug);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      width={18}
      height={13}
      loading="lazy"
      decoding="async"
      className="inline-block rounded-sm object-contain flex-shrink-0 align-middle"
    />
  );
}

export default function CountryTimeMachine() {
  const [data, setData] = useState<Timeline | null>(null);
  const [err, setErr] = useState(false);

  // Deep link: /countries?year=1985 opens straight on that year. Read once,
  // synchronously, in the initialiser rather than in an effect - this subtree
  // only mounts on the client, and an effect would lose the race with the URL
  // writer below, which StrictMode runs twice on mount.
  const initialYear = (() => {
    if (typeof window === "undefined") return 1985;
    const p = new URLSearchParams(window.location.search).get("year");
    const n = p ? parseInt(p, 10) : NaN;
    return Number.isFinite(n) && n >= 1800 && n <= 2100 ? n : 1985;
  })();

  const [year, setYear] = useState(initialYear);
  const [yearStr, setYearStr] = useState(String(initialYear));
  const [continent, setContinent] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  // Empires ON by default: for most of the period this board now covers, the
  // largest political units on earth were empires, and a 1930 board that opens
  // with 66 separate British territories buries that rather than showing it.
  const [grouping, setGrouping] = useState<"Empires" | "Territories">("Empires");
  // ON by default (Ashwin, 2026-08-14, revising his earlier ruling): the point
  // of looking at 1942 is to see who held what, and a board that lists the
  // occupied countries separately answers a question nobody asked. The toggle
  // stays, because occupation is not possession and a reader comparing empires
  // on equal terms may reasonably want it out.
  const [includeOccupied, setIncludeOccupied] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    let alive = true;
    // no-cache for the same reason the route sets must-revalidate: a stale
    // body with an older shape renders an empty board, which reads as a data
    // bug and is not one. This repo has paid for that once already.
    fetch("/api/country-timeline", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((d: Timeline) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);

  // Keep the URL in step without a navigation, so the view is shareable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    u.searchParams.set("year", String(year));
    window.history.replaceState(null, "", u.toString());
  }, [year]);

  const minYear = data?.meta.from ?? 1800;
  const maxYear = data?.meta.to ?? 2025;
  const commitYear = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      setYearStr(String(year));
      return;
    }
    const y = Math.min(Math.max(n, minYear), maxYear);
    setYear(y);
    setYearStr(String(y));
  };
  const step = (d: number) => {
    const y = Math.min(Math.max(year + d, minYear), maxYear);
    setYear(y);
    setYearStr(String(y));
  };

  const i = year - minYear;

  type Row = {
    key: string;
    name: string;
    continent: string | null;
    value: number;
    asOf: number;
    stale: boolean;
    control: Control;
    polity?: Polity;
    empire?: Empire;
    parts?: string[];
    heldBy?: string;
    splitBetween?: string[];
    understatedBy?: string[];
    dominionOf?: string;
    extraKind?: string;
    extraNote?: string;
    notYetNote?: string;
    sharedBy?: string[];
    sharedKind?: string;
    /** The empire stands but its home ground is under someone else. */
    metropoleTakenBy?: string;
    /**
     * Members of a live polity that were under foreign control this year.
     * A polity ABSORBS its members, and absorption used to swallow their
     * holdings whole: in 1942 the board knew Ukraine, Belarus, Estonia,
     * Latvia, Lithuania and Moldova were German- or Romanian-held and showed
     * none of it, because they were Soviet republics and the Soviet row won.
     * The state's legal extent is still the right total - they were Soviet
     * republics throughout - but who held the ground is the question the
     * board exists to answer, so it is carried here and named on the row.
     */
    occupiedWithin?: { slug: string; holder: string; kind: string }[];
  };

  const byKey = useMemo(
    () => new Map((data?.countries ?? []).map((c) => [c.key, c])),
    [data],
  );

  /** Which coloniser held a slug this year, if any (COLDAT, by name). */
  const colonizerOf = useMemo(() => {
    const m = new Map<string, string>();
    if (!data) return m;
    for (const [slug, runs] of Object.entries(data.colonisers)) {
      for (const [a, b, name] of runs) {
        if (year >= a && year <= b) {
          m.set(slug, name);
          break;
        }
      }
    }
    return m;
  }, [data, year]);

  /**
   * Which sovereign SLUG holds each dependent territory this year. Gibraltar
   * and the British Virgin Islands never appear in COLDAT, because COLDAT is
   * about decolonisation and they never decolonised, so the site's own country
   * hierarchy supplies them - the same relation the directory uses to nest
   * them under the United Kingdom.
   *
   * Precedence: an explicit historical window beats the CURRENT parent, or
   * Hong Kong would sit under China in 1914.
   */
  /**
   * Curated holdings live this year, by territory. A territory can have MORE
   * THAN ONE: Poland in 1940 was held by Germany west of the
   * Molotov-Ribbentrop line and the Soviet Union east of it. Two holders is
   * not a conflict to resolve in favour of the larger one, it is the fact, so
   * the map holds a list and the board names all of them.
   *
   * A colony is superseded by an occupation of the same territory in the same
   * year - the Philippines was American property and Japanese-occupied in
   * 1943, and the occupation is the more specific fact about that year.
   */
  /**
   * The era-correct name for a country in the viewed year, from the LEADERS
   * layer's own `era` field - so this board and the World Leaders time machine
   * cannot drift: 1940 reads "Nazi Germany" on both because both read the same
   * file. Overlapping eras resolve to the LATEST start, because Weimar runs to
   * 1934 and Nazi Germany from 1933 where the leaders they cover overlap at
   * the handover, and 1933 belongs to the regime that had just begun.
   */
  const eraNameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (!data) return m;
    for (const [slug, eras] of Object.entries(data.countryEras)) {
      let best: [number, number, string] | null = null;
      for (const e of eras) {
        if (year < e[0] || year > e[1]) continue;
        if (!best || e[0] > best[0]) best = e;
      }
      if (best) m.set(slug, best[2]);
    }
    return m;
  }, [data, year]);

  const extraNow = useMemo(() => {
    const m = new Map<string, { holder: string; kind: string; note?: string }[]>();
    if (!data) return m;
    for (const h of data.extraHoldings) {
      if (year < h.from || year > h.to) continue;
      m.set(h.slug, [...(m.get(h.slug) ?? []), { holder: h.holder, kind: h.kind, note: h.note }]);
    }
    for (const [slug, list] of m) {
      const taken = list.filter((x) => x.kind !== "colony");
      if (taken.length && taken.length !== list.length) m.set(slug, taken);
    }
    return m;
  }, [data, year]);

  const heldBySlug = useMemo(() => {
    const m = new Map<string, string>();
    if (!data) return m;
    for (const [slug, parent] of Object.entries(data.dependencies)) {
      // Guam was Spanish until 1898. Attributing a dependency to its MODERN
      // holder from 1800 is how the United States ended up holding it in 1818.
      const since = data.dependencySince[slug];
      if (since != null && year < since) continue;
      m.set(slug, parent);
    }
    for (const o of data.dependencyOverrides) {
      if (year >= o.from && year <= o.to) m.set(o.slug, o.holder);
      else if (m.get(o.slug) === o.holder) m.delete(o.slug);
    }
    return m;
  }, [data, year]);

  /** Every entity standing in this year, before any filter. */
  const all = useMemo(() => {
    if (!data) return [];

    // Dissolved STATES win over empires. A state is a political fact; an
    // empire here is a grouping we impose, so where both would claim a
    // territory the state keeps it and the empire simply does not double-count.
    const livePolities = data.polities.filter(
      (p) => year >= p.from && year <= p.to &&
        !(p.gaps ?? []).some(([a, b]) => year >= a && year <= b),
    );
    const absorbed = new Set<string>();
    const partOf = new Map<string, Control>();
    // Per-member windows matter: a land empire acquired its ground over a
    // century, so "inside the empire" is not the same as "inside its lifespan".
    const liveMembers = new Map<string, string[]>();
    for (const p of livePolities) {
      const mem = p.memberWindows
        ? p.memberWindows.filter(([, a, b]) => year >= a && year <= b).map(([sl]) => sl)
        : p.replaces;
      liveMembers.set(p.key, mem);
      mem.forEach((sl) => { absorbed.add(sl); partOf.set(sl, "constituent"); });
      if (p.partitionOf) { absorbed.add(p.partitionOf); partOf.set(p.partitionOf, "partition"); }
    }

    // Territories split between powers. Never summed into any of them, and
    // never shown as independent either.
    const split = new Map<string, string[]>();
    for (const d of data.partitioned) {
      if (year >= d.from && year <= d.to) split.set(d.slug, d.between);
    }

    // Not yet one country: the borders exist on the map but described no state
    // at this date. Tagged, never grouped, and never claimed as sovereign.
    const notYet = new Map<string, string>();
    for (const f of data.fragmented) {
      if (year >= f.from && year <= f.to) notYet.set(f.slug, f.note);
    }

    // The consequence of refusing to double-count: an empire that held part of
    // a split territory is UNDERSTATED by that territory's people. The Russian
    // Empire reads 108m in 1914 against a real figure nearer 166m, because
    // Poland and Ukraine are excluded. A precise-looking number that is a third
    // low is its own kind of lie, so every affected total is marked "at least"
    // and names what it leaves out.
    const understates = new Map<string, string[]>();
    for (const [slug, between] of split) {
      const nm = byKey.get(slug)?.name ?? slug;
      for (const holder of between) understates.set(holder, [...(understates.get(holder) ?? []), nm]);
    }

    // Self-governing dominions leave their empire from their own year. Canada
    // in 1914 had its own parliament and budget; folding it in beside British
    // India describes neither correctly.
    const dominionOf = new Map<string, string>();
    for (const d of data.dominions) {
      if (year >= d.from) dominionOf.set(d.slug, d.of);
    }

    // Who holds what, by METROPOLE SLUG. COLDAT gives the colonies of the
    // eight European powers; the dependency map gives everything that never
    // decolonised, which is how Guam reaches the United States at all - the US
    // is not a COLDAT coloniser.
    const colBySlug = new Map<string, string>();
    for (const e of data.empires) {
      if (year < e.from || year > e.to) continue;
      for (const [sl, who] of colonizerOf) {
        if (who === e.coloniser) colBySlug.set(sl, e.metropole);
      }
    }
    const holdings = new Map<string, string[]>();
    const addHolding = (holder: string, sl: string) => {
      if (sl === holder || absorbed.has(sl) || dominionOf.has(sl)) return;
      // Only territories that actually carry a population series. The site's
      // hierarchy also nests CONSTITUENTS - England, Scotland, Wales under the
      // United Kingdom - which have no separate series because their people are
      // already inside the UK's. Listing them would add rows reading "—" and,
      // worse, invite the reader to think something had been left out.
      if (!byKey.has(sl)) return;
      holdings.set(holder, [...(holdings.get(holder) ?? []), sl]);
    };
    /**
     * 🔴 A CONQUEST SUPERSEDES A COLONIAL CLAIM ON THE SAME GROUND IN THE SAME
     * YEAR. Ashwin: "I still see Indonesia under Dutch rule 1942-1945."
     *
     * This rule was already written down and already enforced - but only
     * INSIDE the curated table, where `extraNow` drops a colony entry when a
     * non-colony entry exists for the same slug. That is why the Philippines
     * behaved: both its American ownership and its Japanese occupation are
     * curated, so the filter saw them together and kept the occupation.
     * Indonesia's Dutch claim comes from COLDAT instead, and nothing compared
     * the two sources at all. The Netherlands was simply inserted into the
     * holdings map first and won by iteration order.
     *
     * A rule enforced against one source and not the other is not a rule, it
     * is a coincidence that held for the cases someone checked. So the
     * suppression moves up here, where every claim on a territory passes
     * through, and it applies whatever the reader has done with the
     * aggregation toggle: the toggle decides whether an occupation is COUNTED
     * into the occupier, never whether it HAPPENED. With it off, Indonesia
     * stands alone tagged "occupied by Japan" rather than reverting to the
     * Dutch East Indies, because it was not the Dutch East Indies in 1943.
     */
    const conquered = new Set<string>();
    for (const [sl, list] of extraNow) {
      if (list.some((h) => h.kind !== "colony")) conquered.add(sl);
    }
    if (grouping === "Empires") {
      for (const [sl, holder] of colBySlug) {
        if (!conquered.has(sl)) addHolding(holder, sl);
      }
      for (const [sl, holder] of heldBySlug) {
        if (!colBySlug.has(sl) && !conquered.has(sl)) addHolding(holder, sl);
      }
      // Curated holdings. A colony always aggregates; an occupation or
      // annexation only when the reader asks; a partial holding never, because
      // there is no modern slug for the part that was actually held.
      for (const [sl, list] of extraNow) {
        // Held by more than one power at once: sum it into none of them, or
        // its people are counted twice. Same rule as a partitioned territory.
        if (list.length > 1) continue;
        const h = list[0];
        // A client state had its own government. It is named, never summed:
        // the Independent State of Croatia was not part of Germany.
        if (h.kind === "partial" || h.kind === "client") continue;
        if (h.kind !== "colony" && !includeOccupied) continue;
        addHolding(h.holder, sl);
      }
    }

    /**
     * 🔴 AN OCCUPIED COUNTRY DOES NOT HAND OVER ITS EMPIRE. Ashwin: "Netherlands
     * and Belgium occupied by Germany, what was the fate of their other
     * colonies?" The answer is that they carried on without them. The Dutch
     * East Indies were run from London until Japan took them in 1942; the
     * Belgian Congo fought on the Allied side throughout and shipped the
     * uranium for the Manhattan Project. Neither ever became German.
     *
     * The code did something worse than get this wrong. Because the metropole
     * had been absorbed into the occupier's row, the guard below used to drop
     * the Dutch empire ROW ENTIRELY, and its colonies scattered to the bottom
     * of the board as loose territories. So the fix is not cosmetic: an empire
     * whose metropole is occupied keeps its row, keeps its colonies, and is
     * marked as having lost its own home ground.
     */
    const metropoleTaken = new Map<string, string>();
    for (const [sl, list] of extraNow) {
      if (list.length !== 1) continue;
      const h = list[0];
      if (h.kind === "occupied" || h.kind === "annexed") metropoleTaken.set(sl, h.holder);
    }

    const empireByMetropole = new Map(
      data.empires.filter((e) => year >= e.from && year <= e.to).map((e) => [e.metropole, e]),
    );
    const empireParts = new Map<string, string[]>();
    const liveEmpires: (Empire & { key: string })[] = [];
    for (const [holder, held] of holdings) {
      // An empire whose METROPOLE was occupied still stands - it just no
      // longer contains its own home ground, which is named on the row rather
      // than left as an unexplained hole in the arithmetic.
      const takenBy = metropoleTaken.get(holder);
      if (!held.length || (absorbed.has(holder) && !takenBy)) continue;
      const e = empireByMetropole.get(holder);
      const key = e?.key ?? `holder:${holder}`;
      // When the reader is counting occupied territory, an occupied metropole
      // goes to the OCCUPIER along with everything else that was taken - that
      // is what the toggle means - and the empire row is left holding exactly
      // what the government in exile still held. Excluding it here rather than
      // letting the occupier's row win the race also makes the result
      // order-independent, which it was not: whichever of the two rows was
      // built first kept the Dutch nine million.
      const dropMetropole = !!takenBy && includeOccupied;
      const parts = [holder, ...held].filter(
        (sl, n, arr) =>
          arr.indexOf(sl) === n && !absorbed.has(sl) && !(sl === holder && dropMetropole),
      );
      empireParts.set(key, parts);
      parts.forEach((sl) => absorbed.add(sl));
      liveEmpires.push(
        e ?? {
          key,
          // A holder COLDAT does not know as a coloniser - the United States,
          // China, Denmark - still governs territory and still deserves one row.
          name: (() => {
            const era = (data.extraEraNames[holder] ?? []).find(
              ([lo, hi]) => year >= lo && year <= hi,
            );
            return era ? era[2] : `${byKey.get(holder)?.name ?? holder} and its territories`;
          })(),
          coloniser: byKey.get(holder)?.name ?? holder,
          metropole: holder,
          from: year,
          to: year,
          territories: held.length,
          eraNames: [],
        },
      );
    }

    const out: Row[] = [];

    for (const p of livePolities) {
      const n = nearest(p.v, i, minYear);
      if (n)
        out.push({
          key: p.key, name: p.name, continent: p.continent,
          // Same rule as an empire: a summed state is not stale, its parts are.
          value: n.value, asOf: p.basis === "sum" ? year : n.year,
          stale: p.basis === "sum" ? false : n.stale,
          polity: p, control: "sovereign",
          parts: liveMembers.get(p.key),
          understatedBy: understates.get(p.name),
          occupiedWithin: (liveMembers.get(p.key) ?? []).flatMap((sl) =>
            (extraNow.get(sl) ?? [])
              .filter((h) => h.kind !== "colony")
              .map((h) => ({
                slug: sl,
                holder: h.holder ? byKey.get(h.holder)?.name ?? h.holder : "several powers",
                kind: h.kind,
              })),
          ),
        });
    }

    for (const e of liveEmpires) {
      const parts = empireParts.get(e.key);
      if (!parts) continue;
      let total = 0;
      for (const sl of parts) {
        const c = byKey.get(sl);
        const n = c ? nearest(c.v, i, minYear) : null;
        if (!n) continue;
        total += n.value;
      }
      if (!total) continue;
      // Descending by population, so the largest possession reads first and
      // the metropole sits where its size puts it rather than at the top by
      // convention.
      parts.sort((x, y) => {
        const a = byKey.get(x) ? nearest(byKey.get(x)!.v, i, minYear)?.value ?? 0 : 0;
        const b = byKey.get(y) ? nearest(byKey.get(y)!.v, i, minYear)?.value ?? 0 : 0;
        return b - a;
      });
      // Era-correct label: 1914 reads "German Empire", 1930 reads "Germany
      // and its colonies", because by then it was not an empire.
      const era = (e.eraNames ?? []).find(([lo, hi]) => year >= lo && year <= hi);
      out.push({
        key: e.key, name: era ? era[2] : e.name,
        continent: byKey.get(e.metropole)?.continent ?? null,
        // An aggregate is never "as of" an earlier year. One territory inside
        // it may be carrying an older figure, and that is the territory's fact,
        // shown on its own line in the breakdown. Stamping the whole British
        // Empire "as of 1800" because one island's series is sparse describes
        // the empire wrongly to explain something about the island.
        value: total, asOf: year, stale: false, empire: e, parts, control: "sovereign",
        understatedBy: understates.get(e.coloniser) ?? understates.get(e.name),
        metropoleTakenBy: metropoleTaken.has(e.metropole)
          ? byKey.get(metropoleTaken.get(e.metropole)!)?.name ?? metropoleTaken.get(e.metropole)
          : undefined,
      });
    }

    for (const c of data.countries) {
      if (absorbed.has(c.key)) continue;
      const n = nearest(c.v, i, minYear);
      if (!n) continue;
      const who = colonizerOf.get(c.key);
      const sp = split.get(c.key);
      const dom = dominionOf.get(c.key);
      const exList = extraNow.get(c.key);
      const ex = exList?.length === 1 ? exList[0] : undefined;
      const shared = exList && exList.length > 1 ? exList : undefined;
      out.push({
        key: c.key, name: eraNameOf.get(c.key) ?? c.name, continent: c.continent,
        value: n.value, asOf: n.year, stale: n.stale,
        control: shared ? "partitioned"
          : ex?.kind === "client" ? "client"
          : notYet.has(c.key) && !ex && !who ? "fragmented"
          : dom ? "dominion"
          : ex && ex.kind !== "colony" ? (ex.kind === "partial" ? "partitioned" : ex.kind as Control)
          : sp ? "partitioned" : (ex || who) ? "colony"
          : (partOf.get(c.key) ?? "sovereign"),
        heldBy: dom || shared ? undefined
          : ex ? (ex.holder ? byKey.get(ex.holder)?.name ?? ex.holder : undefined) : who,
        sharedBy: shared?.map((x) => byKey.get(x.holder)?.name ?? x.holder),
        sharedKind: shared?.[0]?.kind,
        extraKind: ex?.kind,
        extraNote: ex?.note,
        notYetNote: notYet.get(c.key),
        dominionOf: dom,
        splitBetween: sp,
      });
    }
    return out;
  }, [data, year, i, minYear, grouping, colonizerOf, byKey, heldBySlug, extraNow,
      includeOccupied, eraNameOf]);

  // Share is of the WORLD, computed from every standing territory, not of
  // whatever the filter happens to leave on screen. Narrowing to Europe must
  // not inflate Germany's share of humanity to 12%.
  const worldTotal = useMemo(() => all.reduce((a, r) => a + r.value, 0), [all]);

  const continentOpts = useMemo(() => {
    const seen = new Set(all.map((r) => r.continent).filter(Boolean) as string[]);
    return [...CONTINENT_ORDER.filter((c) => seen.has(c)),
            ...[...seen].filter((c) => !CONTINENT_ORDER.includes(c)).sort()];
  }, [all]);

  const rows = useMemo(() => {
    let out = all;
    if (continent !== ALL) out = out.filter((r) => r.continent === continent);
    if (kind === "Historical states") out = out.filter((r) => r.polity || r.empire);
    else if (kind === "Countries today") out = out.filter((r) => !r.polity && !r.empire);
    const sorted = [...out].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else cmp = a.value - b.value; // rank/value/share all order by size
      return cmp * dir;
    });
    return sorted;
  }, [all, continent, kind, sortKey, dir]);

  function toggle(k: SortKey) {
    if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === "name" ? 1 : -1);
    }
  }
  function reset() {
    setContinent(ALL);
    setKind(ALL);
    setGrouping("Empires");
    setIncludeOccupied(true);
    setSortKey("value");
    setDir(-1);
  }
  const hasFilter =
    continent !== ALL || kind !== ALL || grouping !== "Empires" || !includeOccupied ||
    sortKey !== "value" || dir !== -1;
  const arrow = (k: SortKey) => (sortKey === k ? (dir === 1 ? " ▲" : " ▼") : "");

  const selectCls = "rounded-lg border px-3 py-2 text-sm";
  const selectStyle = {
    backgroundColor: "var(--bg-card)",
    borderColor: "var(--border)",
    color: "var(--text)",
  } as const;

  function Th({ label, k, right }: { label: string; k: SortKey; right?: boolean }) {
    const active = sortKey === k;
    return (
      <th
        scope="col"
        className={`py-2 px-3 font-medium select-none cursor-pointer hover:text-[var(--accent)] ${right ? "text-right" : "text-left"}`}
        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
        onClick={() => toggle(k)}
        aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}
      >
        {label}
        <span aria-hidden style={MONO}>{arrow(k)}</span>
      </th>
    );
  }

  function Select({
    label, value, onChange, opts,
  }: { label: string; value: string; onChange: (v: string) => void; opts: string[] }) {
    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className="uppercase tracking-wide text-[var(--text-dim)]">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} style={selectStyle}>
          <option value={ALL}>All</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }

  /** The expandable breakdown, shared by the table and the mobile cards. */
  function Parts({ r }: { r: Row }) {
    const p = r.polity;
    if (r.polity && r.parts) {
      return (
        <ul className="mt-1.5 ml-1 space-y-0.5 border-l pl-3" style={{ borderColor: "var(--border)" }}>
          {r.parts.map((slug) => {
            const c = byKey.get(slug);
            const nv = c ? nearest(c.v, i, minYear) : null;
            return (
              <li key={slug} className="text-xs text-[var(--text-muted)] flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Flag slug={slug} />
                  <Link href={`/countries/${slug}`} className="truncate hover:text-[var(--accent)] hover:underline">
                    {c?.name ?? slug}
                  </Link>
                  {/* A republic of this state that someone else was actually
                      holding this year. Before this the board knew and said
                      nothing, because the polity absorbed the member and the
                      member's tag went with it. */}
                  {(() => {
                    const occ = r.occupiedWithin?.filter((o) => o.slug === slug) ?? [];
                    if (!occ.length) return null;
                    return (
                      <span className="text-[10px] text-[var(--warn,var(--accent))] flex-shrink-0">
                        {occ[0].kind === "client" ? "client of " : `${occ[0].kind} by `}
                        {occ.map((o) => o.holder).join(" and ")}
                      </span>
                    );
                  })()}
                </span>
                <span className="tabular-nums flex-shrink-0 flex items-baseline gap-1.5" style={MONO}>
                  {/* The "as of" belongs to the TERRITORY whose series is
                      sparse, not to the aggregate above it. Stamping the whole
                      British Empire "as of 1800" because one island is missing
                      years describes the empire wrongly to explain the island. */}
                  {nv?.stale && <span className="text-[10px] text-[var(--text-dim)]">as of {nv.year}</span>}
                  {nv ? fmt(nv.value) : "—"}
                </span>
              </li>
            );
          })}
          {r.occupiedWithin && r.occupiedWithin.length ? (
            <li className="text-[11px] text-[var(--text-dim)] pt-1.5 leading-relaxed">
              The total is the state&rsquo;s legal extent. {r.occupiedWithin.length === 1 ? "One" : r.occupiedWithin.length}{" "}
              of these {r.occupiedWithin.length === 1 ? "was" : "were"} under someone else&rsquo;s control in {year},
              and the tags above say whose.
            </li>
          ) : null}
          {r.polity.basis === "source" || r.polity.sourceDivergence ? (
            <li className="text-[11px] text-[var(--text-dim)] pt-1.5 leading-relaxed">
              {r.polity.basis === "source"
                ? "A slice of one modern country, so there is nothing to sum; this is the source’s own series."
                : null}
              {r.polity.sourceDivergence ? (
                <>
                  {r.polity.basis === "source" ? " " : null}
                  The source&rsquo;s own figure for {r.polity.name} differs by{" "}
                  {r.polity.sourceDivergence > 0 ? "+" : ""}{r.polity.sourceDivergence}%.
                </>
              ) : null}
            </li>
          ) : null}
        </ul>
      );
    }
    if (r.empire && r.parts) {
      return (
        <ul className="mt-1.5 ml-1 space-y-0.5 border-l pl-3" style={{ borderColor: "var(--border)" }}>
          {r.parts.map((slug) => {
            const c = byKey.get(slug);
            const nv = c ? nearest(c.v, i, minYear) : null;
            const isMetropole = slug === r.empire!.metropole;
            return (
              <li key={slug} className="text-xs text-[var(--text-muted)] flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Flag slug={slug} />
                  <Link href={`/countries/${slug}`} className="truncate hover:text-[var(--accent)] hover:underline">
                    {c?.name ?? slug}
                  </Link>
                  <span className="text-[10px] text-[var(--text-dim)] flex-shrink-0">
                    {isMetropole && r.metropoleTakenBy
                      ? `home ground, occupied by ${r.metropoleTakenBy}`
                      : isMetropole ? CONTROL_LABEL.metropole : CONTROL_LABEL.colony}
                  </span>
                </span>
                <span className="tabular-nums flex-shrink-0 flex items-baseline gap-1.5" style={MONO}>
                  {/* The "as of" belongs to the TERRITORY whose series is
                      sparse, not to the aggregate above it. Stamping the whole
                      British Empire "as of 1800" because one island is missing
                      years describes the empire wrongly to explain the island. */}
                  {nv?.stale && <span className="text-[10px] text-[var(--text-dim)]">as of {nv.year}</span>}
                  {nv ? fmt(nv.value) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      );
    }
    if (!p) return null;
    return (
      <ul className="mt-1.5 ml-1 space-y-0.5 border-l pl-3" style={{ borderColor: "var(--border)" }}>
        {p.replaces.map((slug) => {
          const c = byKey.get(slug);
          const nv = c ? nearest(c.v, i, minYear) : null;
          return (
            <li key={slug} className="text-xs text-[var(--text-muted)] flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 min-w-0">
                <Flag slug={slug} />
                <Link href={`/countries/${slug}`} className="truncate hover:text-[var(--accent)] hover:underline">
                  {c?.name ?? slug}
                </Link>
              </span>
              <span className="tabular-nums flex-shrink-0 flex items-baseline gap-1.5" style={MONO}>
                  {/* The "as of" belongs to the TERRITORY whose series is
                      sparse, not to the aggregate above it. Stamping the whole
                      British Empire "as of 1800" because one island is missing
                      years describes the empire wrongly to explain the island. */}
                  {nv?.stale && <span className="text-[10px] text-[var(--text-dim)]">as of {nv.year}</span>}
                  {nv ? fmt(nv.value) : "—"}
                </span>
            </li>
          );
        })}
        {p.basis === "source" ? (
          <li className="text-[11px] text-[var(--text-dim)] pt-1.5 leading-relaxed">
            A slice of one modern country, so there is nothing to sum; this is the
            source&rsquo;s own series.
          </li>
        ) : p.sourceDivergence ? (
          <li className="text-[11px] text-[var(--text-dim)] pt-1.5 leading-relaxed">
            The source&rsquo;s own figure for {p.name} differs by{" "}
            {p.sourceDivergence > 0 ? "+" : ""}{p.sourceDivergence}%.
          </li>
        ) : null}
      </ul>
    );
  }

  const projected = data ? year > data.meta.estimateThrough : false;
  const historical = rows.filter((r) => r.polity || r.empire).length;

  return (
    <div>
      {/* Year picker: input + steppers, the champions idiom, plus a scrubber
          because 226 years is a long way to travel two buttons at a time. */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Year</span>
          <input
            type="text"
            inputMode="numeric"
            value={yearStr}
            onChange={(e) => setYearStr(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            onBlur={(e) => commitYear(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitYear((e.target as HTMLInputElement).value); }}
            aria-label="Year"
            className={`${selectCls} w-24`}
            style={{ ...selectStyle, ...MONO }}
          />
        </label>
        <div className="flex items-center gap-1 pb-[1px]">
          <button type="button" onClick={() => step(-1)} disabled={year <= minYear} className={`${selectCls} px-2 disabled:opacity-40`} style={selectStyle} aria-label="One year earlier">◀</button>
          <button type="button" onClick={() => step(1)} disabled={year >= maxYear} className={`${selectCls} px-2 disabled:opacity-40`} style={selectStyle} aria-label="One year later">▶</button>
          <button type="button" onClick={() => step(-10)} disabled={year <= minYear} className={`${selectCls} text-xs disabled:opacity-40`} style={selectStyle} title="Ten years earlier">−10y</button>
          <button type="button" onClick={() => step(10)} disabled={year >= maxYear} className={`${selectCls} text-xs disabled:opacity-40`} style={selectStyle} title="Ten years later">+10y</button>
          {year !== maxYear && (
            <button type="button" onClick={() => { setYear(maxYear); setYearStr(String(maxYear)); }} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline px-2">Today</button>
          )}
        </div>
        <label className="flex flex-col gap-1 text-xs flex-1 min-w-[200px]">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Scrub</span>
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={year}
            onChange={(e) => { const y = Number(e.target.value); setYear(y); setYearStr(String(y)); }}
            aria-label="Year scrubber"
            className="w-full"
          />
        </label>
      </div>

      {/*
        COLLAPSED BY DEFAULT (Ashwin, 2026-08-14): "it's unnecessarily long and
        makes it hard to see the timeline". He is right, and the reason it grew
        is worth recording - every accuracy question answered on this board
        added a sentence defending the answer, so the prose became a changelog
        of arguments won rather than an orientation. One line orients; the
        rules stay one click away for the reader who wants to argue with them.
      */}
      <p className="text-xs text-[var(--text-dim)] leading-relaxed mb-2 max-w-3xl">
        Who held every territory in <strong className="text-[var(--text)]">{year}</strong>, and how many people lived
        in it. Populations are for each territory{" "}
        <strong className="text-[var(--text)]">as it is drawn today</strong>, carrying that year&rsquo;s people.
      </p>
      <details className="mb-4 max-w-3xl">
        <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] select-none">
          How the totals are built
        </summary>
        <div className="text-xs text-[var(--text-dim)] leading-relaxed mt-2 space-y-2">
          <p>
            A state that no longer exists is shown as the sum of the territories it governed, so
            expanding the Soviet Union in 1985 gives fifteen rows that add to the total exactly.
            Empires are a grouping over the same territories, so an empire total is exactly the sum
            of the rows inside it.
          </p>
          <p>
            A territory that was split between powers is never summed into any of them, and says who
            actually held it rather than pretending to independence it did not have. The cost of that
            refusal is marked: an empire holding part of a split territory shows{" "}
            <strong className="text-[var(--text)]">≥</strong> and names what its total leaves out.
            Territory held by conquest is tagged but not counted into the conqueror unless you ask,
            because occupation is not possession and the occupied state usually still existed. An
            occupied country does not hand over its empire either: the Netherlands fell in 1940 and
            the Dutch East Indies did not become German.
          </p>
          <p>
            A row marked <em>not yet one country</em> is one whose modern borders described no state
            at that date. Dependent territories that never decolonised come from this site&rsquo;s own
            country hierarchy. Self-governing dominions stand on their own rather than inside an
            empire, because they were not held the way India was held.
          </p>
        </div>
      </details>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Group by</span>
          <select
            value={grouping}
            onChange={(e) => setGrouping(e.target.value as "Empires" | "Territories")}
            className={selectCls}
            style={selectStyle}
          >
            <option value="Empires">Empires and states</option>
            <option value="Territories">Territories</option>
          </select>
        </label>
        {grouping === "Empires" && (
          <label className="flex items-center gap-2 text-xs pb-2 self-end">
            <input
              type="checkbox"
              checked={includeOccupied}
              onChange={(e) => setIncludeOccupied(e.target.checked)}
            />
            <span className="text-[var(--text-muted)]">Count occupied territory</span>
          </label>
        )}
        <Select label="Continent" value={continent} onChange={setContinent} opts={continentOpts} />
        <Select label="Show" value={kind} onChange={setKind} opts={["Countries today", "Historical states"]} />
        <button
          type="button"
          onClick={reset}
          disabled={!hasFilter}
          className="rounded-lg border px-3 py-2 text-sm font-medium enabled:hover:text-[var(--accent)] enabled:hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-default"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          Reset
        </button>
        <div className="ml-auto self-center text-xs text-[var(--text-muted)]">
          <strong className="text-[var(--text)] tabular-nums" style={MONO}>{rows.length}</strong>
          {rows.length === 1 ? " territory" : " territories"}
          {historical > 0 ? (
            <>, <strong className="text-[var(--text)] tabular-nums" style={MONO}>{historical}</strong> historical</>
          ) : null}
        </div>
      </div>

      {err && (
        <p className="text-sm text-[var(--text-muted)] py-8">
          Could not load the timeline. Please reload the page.
        </p>
      )}
      {!err && !data && <p className="text-sm text-[var(--text-dim)] py-8">Loading the timeline…</p>}
      {data && rows.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] py-8">
          Nothing stood in {year} under these filters. The series starts in {data.meta.from}.
        </p>
      )}

      {data && rows.length > 0 && (
        <>
          {/* Mobile sort control */}
          <div className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 sm:hidden" style={{ backgroundColor: "var(--bg)" }}>
            <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
              <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
              <select
                value={sortKey}
                onChange={(e) => { toggle(e.target.value as SortKey); setAnnounce(`Sorted by ${e.target.value}`); }}
                className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
                style={selectStyle}
              >
                <option value="value">Population</option>
                <option value="name">Name</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => { toggle(sortKey); setAnnounce(`Sort direction: ${dir === 1 ? "descending" : "ascending"}`); }}
              aria-label={dir === 1 ? "Sort ascending" : "Sort descending"}
              className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {dir === 1 ? "▲" : "▼"}
            </button>
            <span aria-live="polite" className="sr-only">{announce}</span>
          </div>

          {/* Mobile: one card per territory. Capped and scrollable - a 200-row
              card list inherits none of the table rule's 80vh containment and
              would otherwise run to dozens of screens (DESIGN-STANDARDS.md). */}
          <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[80vh] overflow-y-auto overscroll-contain">
            {rows.map((r, n) => (
              <div key={r.key} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] text-[var(--text-dim)] tabular-nums mr-1.5" style={MONO}>{n + 1}</span>
                    {r.empire ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Flag slug={r.empire.metropole} />
                        {r.name}
                      </span>
                    ) : r.polity ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Flag slug={r.key} />
                        {r.name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Flag slug={r.key} />
                        <Link href={`/countries/${r.key}`} className="font-semibold hover:text-[var(--accent)] hover:underline">{r.name}</Link>
                      </span>
                    )}
                    {(r.heldBy || r.extraKind === "partial") && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                        {r.extraKind === "partial"
                          ? (r.heldBy ? `partly held by ${r.heldBy}` : "not one state this year")
                          : r.extraKind === "client"
                            ? `${CONTROL_LABEL.client} of ${r.heldBy}`
                            : r.extraKind === "occupied" || r.extraKind === "annexed"
                              ? `${r.extraKind} by ${r.heldBy}`
                              : `${CONTROL_LABEL.colony} of ${r.heldBy}`}
                        {r.extraNote ? ` · ${r.extraNote}` : ""}
                      </span>
                    )}
                    {r.dominionOf && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                        self-governing {CONTROL_LABEL.dominion} of the {r.dominionOf}
                      </span>
                    )}
                    {r.control === "fragmented" && r.notYetNote && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                        {CONTROL_LABEL.fragmented} · {r.notYetNote}
                      </span>
                    )}
                    {r.sharedBy && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                        {r.sharedKind === "occupied" ? "occupied by " : "held by "}
                        {r.sharedBy.join(" and ")}
                      </span>
                    )}
                    {r.splitBetween && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                        not independent · split between {r.splitBetween.join(", ")}
                      </span>
                    )}
                    {r.understatedBy && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                        excludes {r.understatedBy.join(", ")}, held jointly
                      </span>
                    )}
                    {r.metropoleTakenBy && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                        home country occupied by {r.metropoleTakenBy}; the colonies carried on without it
                      </span>
                    )}
                    {r.occupiedWithin && r.occupiedWithin.length > 0 && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                        {r.occupiedWithin.length} of its territories under foreign control this year
                      </span>
                    )}
                    {r.stale && <span className="ml-2 text-[10px] text-[var(--text-dim)]">as of {r.asOf}</span>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-semibold tabular-nums" style={MONO}>
                      {r.understatedBy ? <span className="text-[var(--text-dim)]">≥ </span> : null}{fmt(r.value)}
                    </div>
                    <div className="text-[10px] text-[var(--text-dim)] tabular-nums" style={MONO}>
                      {worldTotal ? pct((r.value / worldTotal) * 100) : "—"}
                    </div>
                  </div>
                </div>
                {(r.polity?.replaces.length || r.parts?.length) ? (
                  <>
                    <button
                      onClick={() => setExpanded(expanded === r.key ? null : r.key)}
                      aria-expanded={expanded === r.key}
                      className="mt-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline"
                    >
                      {expanded === r.key
                        ? "hide"
                        : `${r.parts?.length ?? r.polity!.replaces.length} territories`}
                    </button>
                    {expanded === r.key && <Parts r={r} />}
                  </>
                ) : null}
              </div>
            ))}
          </div>

          {/* Desktop: ranked table. Rank-first, so the NAME column pins. */}
          <TableScroll className="hidden sm:block rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <table className="w-full text-sm" data-sticky-col={2}>
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th scope="col" className="py-2 px-3 text-left font-medium text-[var(--text-muted)]">#</th>
                  <Th label="Territory" k="name" />
                  <Th label="Population" k="value" right />
                  <Th label="Share of world" k="share" right />
                  <th scope="col" className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, n) => {
                  const open = expanded === r.key;
                  const parts = r.parts ?? r.polity?.replaces ?? [];
                  return (
                    <tr key={r.key} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{n + 1}</td>
                      <td className="py-2 px-3">
                        {r.empire ? (
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            {/* The coloniser's own flag. Modern, and so mildly
                                anachronistic on a 1914 board, but it is the
                                same convention the rest of the site uses for
                                historical entities and it is what makes a long
                                list scannable. Dissolved states below get none,
                                because picking one successor's flag for the
                                USSR would be a claim rather than a label. */}
                            <Flag slug={r.empire.metropole} />
                            {r.name}
                          </span>
                        ) : r.polity ? (
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Flag slug={r.key} />
                            {r.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Flag slug={r.key} />
                            <Link href={`/countries/${r.key}`} className="hover:text-[var(--accent)] hover:underline">{r.name}</Link>
                          </span>
                        )}
                        {(r.heldBy || r.extraKind === "partial") && (
                          <span className="ml-2 text-[10px] text-[var(--text-dim)]">
                            {r.extraKind === "partial"
                              ? (r.heldBy ? `partly held by ${r.heldBy}` : "not one state this year")
                              : r.extraKind === "client"
                                ? `${CONTROL_LABEL.client} of ${r.heldBy}`
                                : r.extraKind === "occupied" || r.extraKind === "annexed"
                                  ? `${r.extraKind} by ${r.heldBy}`
                                  : `${CONTROL_LABEL.colony} of ${r.heldBy}`}
                            {r.extraNote ? ` · ${r.extraNote}` : ""}
                          </span>
                        )}
                        {r.dominionOf && (
                          <span className="ml-2 text-[10px] text-[var(--text-dim)]">
                            self-governing {CONTROL_LABEL.dominion} of the {r.dominionOf}
                          </span>
                        )}
                        {r.control === "fragmented" && r.notYetNote && (
                          <span className="ml-2 text-[10px] text-[var(--text-dim)]">
                            {CONTROL_LABEL.fragmented} · {r.notYetNote}
                          </span>
                        )}
                        {r.sharedBy && (
                          <span className="ml-2 text-[10px] text-[var(--text-dim)]">
                            {r.sharedKind === "occupied" ? "occupied by " : "held by "}
                            {r.sharedBy.join(" and ")}
                          </span>
                        )}
                        {r.splitBetween && (
                          <span className="ml-2 text-[10px] text-[var(--text-dim)]">
                            not independent · split between {r.splitBetween.join(", ")}
                          </span>
                        )}
                        {r.understatedBy && (
                          <span className="ml-2 text-[10px] text-[var(--text-dim)]">
                            excludes {r.understatedBy.join(", ")}, held jointly
                          </span>
                        )}
                        {r.stale && <span className="ml-2 text-[10px] text-[var(--text-dim)]">as of {r.asOf}</span>}
                        {open && <Parts r={r} />}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium" style={MONO}>
                        {r.understatedBy ? <span className="text-[var(--text-dim)]" title="at least">≥ </span> : null}
                        {fmt(r.value)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>
                        {worldTotal ? pct((r.value / worldTotal) * 100) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {parts.length ? (
                          <button
                            onClick={() => setExpanded(open ? null : r.key)}
                            aria-expanded={open}
                            aria-label={open ? `Hide the ${parts.length} territories inside ${r.name}` : `Show the ${parts.length} territories inside ${r.name}`}
                            title={open ? "Collapse" : `${parts.length} territories`}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] whitespace-nowrap"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <span aria-hidden className="font-bold leading-none" style={MONO}>{open ? "−" : "+"}</span>
                            <span className="tabular-nums" style={MONO}>{parts.length}</span>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}

      {/* Where these numbers come from */}
      {data && (
        <div className="rounded-2xl border p-4 mt-6" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-2">How this board works</h3>
          <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
            {data.meta.source}. Every figure is the population of a territory as it is drawn today, carrying that
            year&rsquo;s people. That is why a state which no longer exists can be shown at all, and it is also the
            honest limit of the method: this answers how many people lived in the area a state governed, not what its
            own census said. Historical states are the sum of their parts, so a breakdown always adds up to the total
            above it, and each part is the territory as it is drawn today: British India appears as India,
            Pakistan, Bangladesh and Myanmar rather than as one imperial return. Where the source publishes a
            different figure for the state itself, the gap is printed on that row rather than smoothed away. Empires come from {data.colonySource || "COLDAT"} and are a
            grouping rather than a source: British India in 1940 is India, Pakistan, Bangladesh and Myanmar as four
            territories, which is a real answer to how many people an empire governed and is not the same thing as
            what its own returns said. A territory held by more than one power in a year is left ungrouped rather
            than counted twice.
          </p>
          <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl mt-2">
            Years to {data.meta.estimateThrough} are estimates; {data.meta.estimateThrough + 1} onward are UN WPP
            medium-variant projections{projected ? ", which is what you are looking at now" : ""}. Before 1950 the
            series is reconstruction rather than contemporaneous statistics. Where a year carries no figure the nearest
            earlier one is shown and labelled with its own year; nothing here is interpolated.
          </p>
        </div>
      )}
    </div>
  );
}
