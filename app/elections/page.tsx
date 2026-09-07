import type { Metadata } from "next";
import Link from "next/link";
import { getUkElections } from "@/lib/ukElections";
import { getCaElections } from "@/lib/caElections";
import { getEuElections } from "@/lib/euElections";
import { getAuElections } from "@/lib/auElections";
import { getDeElections } from "@/lib/deElections";
import { getFrElections } from "@/lib/frElections";
import { getInElections } from "@/lib/inElections";
import { getJpElections } from "@/lib/jpElections";
import { getZaElections } from "@/lib/zaElections";
import { getMxElections } from "@/lib/mxElections";
import { getBrElections } from "@/lib/brElections";
import { getIlElections } from "@/lib/ilElections";
import { getItElections } from "@/lib/itElections";
import { getKrElections } from "@/lib/krElections";
import { getIdElections } from "@/lib/idElections";
import { getEsElections } from "@/lib/esElections";
import { getPlElections } from "@/lib/plElections";
import { getNlElections } from "@/lib/nlElections";
import { getArElections } from "@/lib/arElections";
import { getTwElections } from "@/lib/twElections";
import { getNgElections } from "@/lib/ngElections";
import { getNzElections } from "@/lib/nzElections";
import { getRuElections } from "@/lib/ruElections";
import { getCnElections } from "@/lib/cnElections";
import { getTrElections } from "@/lib/trElections";
import { getUaElections } from "@/lib/uaElections";
import { getIqElections } from "@/lib/iqElections";
import { getPsElections } from "@/lib/psElections";
import { getVaElections } from "@/lib/vaElections";
import { ELECTION_HUBS, HUB_REGION, GOVERNMENT_TYPE_LABELS, nextElections } from "@/lib/electionHubsMeta";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubDirectory, { type DirRow } from "./HubDirectory";
import { getUsElections } from "@/lib/usElections";
import ElectionsWorldMap, { type HubMarker } from "./ElectionsWorldMap";
import TimelineStrip, { TimelineLegend, type TlDot, type TlRow } from "./TimelineStrip";
import { getElectionCensus, type CensusRow } from "@/lib/electionCensus";
import { weightedFreedomDecades } from "@/lib/electionPopulationWeight";
import { getForecast, FORECAST_COLORS, FORECAST_NAMES, NZ_COLORS, NZ_NAMES } from "@/lib/forecast";
import { getCurrentLeaderOverlay } from "@/lib/currentLeaders";
import { HUB_COUNTRY_SLUGS } from "@/lib/electionConflicts";
import { getAllCountries } from "@/lib/countries";
import { getCurrentPowerBySlug } from "@/lib/powerHistory";
import { getOrgLeadership } from "@/lib/orgLeaders";
import LineChart, { type ChartSeries } from "./LineChart";
import { SectionHead } from "@/app/_shared/SectionHead";
import { CollapsibleSection } from "@/app/_shared/CollapsibleSection";
import { ElectionsCrumbs, ElectionsHeader, SiblingHubs, SourcesCard, MONO } from "./_shared/ui";
import ElectionsNav from "./_shared/ElectionsNav";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function fullDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Number of hubs, spelled out for the metadata description (never a
// hardcoded digit or word - both are derived from ELECTION_HUBS).
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function numberToWords(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens];
}

const HUB_COUNT = Object.keys(ELECTION_HUBS).length;

// The leaders feed abbreviates offices ("PM", "Pres.", "Federal Chanc.");
// the directory prints the office in full beside the name so a reader knows
// what each person actually is (Ashwin, 2026-09-07). Anything not in the
// table passes through as the feed wrote it, minus the trailing full stop.
const LEADER_TITLES: Record<string, string> = {
  "PM": "Prime Minister",
  "Pres.": "President",
  "Acting Pres.": "Acting President",
  "Federal Chanc.": "Chancellor",
  "Chanc.": "Chancellor",
  "Sup. Leader": "Supreme Leader",
  "Gen. Sec.": "General Secretary",
  "Pres. (PRC)": "President",
  "Monarch": "Monarch",
  "Pope": "Pope",
  "Governor": "Governor",
  "Premier": "Premier",
  "Taoiseach": "Taoiseach",
  "VP": "Vice President",
};
function leaderTitle(role: string | undefined): string {
  if (!role) return "";
  if (LEADER_TITLES[role]) return LEADER_TITLES[role];
  const base = role.replace(/\s*\(.*\)\s*$/, "");
  return LEADER_TITLES[base] ?? role.replace(/\.$/, "");
}

const PATH = "/elections";
const TITLE = "Elections";
const DESC =
  `Election history hubs for ${numberToWords(HUB_COUNT)} polities: every general election, the parties, the leaders, the turnout and the results, with unfree and managed votes labelled as such. For novices who want the story and experts who want the numbers.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

// Seat of government for each hub — the world map's marker positions.
const CAPITALS: Record<string, [number, number]> = {
  us: [38.9072, -77.0369], uk: [51.5074, -0.1278], ca: [45.4215, -75.6972], eu: [50.8503, 4.3517],
  mx: [19.4326, -99.1332], br: [-15.7975, -47.8919], ar: [-34.6037, -58.3816],
  de: [52.52, 13.405], fr: [48.8566, 2.3522], it: [41.9028, 12.4964], es: [40.4168, -3.7038],
  pl: [52.2297, 21.0122], nl: [52.0705, 4.3007], ru: [55.7558, 37.6173],
  il: [31.7683, 35.2137], za: [-25.7479, 28.2293], ng: [9.0765, 7.3986], tr: [39.9334, 32.8597],
  in: [28.6139, 77.209], jp: [35.6762, 139.6503], au: [-35.2809, 149.13], nz: [-41.2866, 174.7756],
  kr: [37.5665, 126.978], id: [-6.2088, 106.8456], tw: [25.033, 121.5654], cn: [39.9042, 116.4074],
  ua: [50.4501, 30.5234], iq: [33.3152, 44.3661], ps: [31.9038, 35.2034], va: [41.9029, 12.4534],
  // Wave 1, 2026-08-30. A hub with no entry here is silently absent from the
  // map, which is exactly how the six new hubs shipped invisible: the metro
  // link table (HUB_CAPITALS) and this coordinate table are separate, and only
  // one of them was filled in.
  gr: [37.9838, 23.7275], at: [48.2082, 16.3738], pt: [38.7223, -9.1393],
  ie: [53.3498, -6.2603], ph: [14.5995, 120.9842], eg: [30.0444, 31.2357],
  sg: [1.3521, 103.8198], my: [3.139, 101.6869], ch: [46.948, 7.4474], be: [50.8503, 4.3517],
  dk: [55.6761, 12.5683],
  // Wave 2, 2026-09-07. Same rule: no coordinates here means no marker.
  hu: [47.4979, 19.0402], no: [59.9139, 10.7522], se: [59.3293, 18.0686],
  co: [4.711, -74.0721], cd: [-4.4419, 15.2663],
  cl: [-33.4489, -70.6693], ir: [35.6892, 51.389], pk: [33.6844, 73.0479],
};
// The EU marker sits at Strasbourg — the Parliament's seat — so Brussels
// stays legible as Belgium's marker.
CAPITALS.eu = [48.5734, 7.7521];

// Timeline dots come from the shared election census (lib/electionCensus),
// which also powers the wartime cross-references and /elections/under-fire.

// Colours for the tracked-election preview blocks (candidate names as they
// appear in the forecast dataset; unknowns fall back to grey).
const TRACK_COLORS: Record<string, string> = {
  "Lula": "#C4122D", "F. Bolsonaro": "#1B4F9C", "Caiado": "#0B7A75", "Santos": "#6D28D9",
  "Marine Le Pen": "#0D378A", "Édouard Philippe": "#0EA5E9", "Jean-Luc Mélenchon": "#C9462C",
  "Raphaël Glucksmann": "#E75480", "Yashar": "#0FA88F", "Likud": "#1E5EBE", "Together": "#7C3AED",
};
const trackColor = (name: string) => TRACK_COLORS[name] ?? "#9ca3af";
// FR scenario tables tag candidates with their party ("Le Pen RN") — strip for display
const frName = (s: string) => s.replace(/\s+[A-ZÉÈÀ]{2,}$/u, "");

function TrackRow({ label, color, value }: { label: string; color: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-[11px]">
      <span className="font-semibold text-[var(--text)] truncate">
        <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="tabular-nums text-[var(--text-muted)] shrink-0 ml-2">{value}</span>
    </div>
  );
}

function TrackBlock({ flag, title, sub, rows, note }: { flag: string; title: string; sub: string; rows: { label: string; color: string; value: string }[]; note: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <div className="flex items-center gap-2 mb-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={flagUrlByCode(flag)}
          srcSet={flagSrcSetByCode(flag)}
          alt=""
          width={20}
          height={15}
          className="rounded-[2px] border shrink-0"
          style={{ borderColor: "var(--border)" }}
        />
        <span className="text-sm font-bold text-[var(--text)]">{title}</span>
      </div>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">{sub}</p>
      <div className="grid gap-1">
        {rows.map((r) => <TrackRow key={r.label} {...r} />)}
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-2">{note}</p>
    </div>
  );
}

function MiniRange({ label, color, median, lo, hi, max, right }: { label: string; color: string; median: number; lo: number; hi: number; max: number; right: string }) {
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between text-[11px] mb-0.5">
        <span className="font-semibold text-[var(--text)]">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="tabular-nums text-[var(--text-muted)]">{median} <span className="text-[var(--text-dim)]">({lo}–{hi})</span> <span className="ml-1 text-[var(--text-dim)]">{right}</span></span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
        <div className="absolute h-full rounded-full opacity-40" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})`, backgroundColor: color }} />
        <div className="absolute h-full w-0.5" style={{ left: `calc(${pct(median)} - 1px)`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default async function ElectionsPage() {
  const [forecast, leaders] = await Promise.all([getForecast(), getCurrentLeaderOverlay()]);
  const uk = getUkElections();
  const ukFirst = uk.elections[0];
  const ukLast = uk.elections[uk.elections.length - 1];
  const ca = getCaElections();
  const caLast = ca.elections[ca.elections.length - 1];
  const eu = getEuElections();
  const euLast = eu.elections[eu.elections.length - 1];
  const au = getAuElections();
  const auLast = au.elections[au.elections.length - 1];
  const de = getDeElections();
  const deLast = de.elections[de.elections.length - 1];
  const fr = getFrElections();
  const frLegLast = fr.legislative[fr.legislative.length - 1];
  const ind = getInElections();
  const inLast = ind.elections[ind.elections.length - 1];
  const jp = getJpElections();
  const jpLast = jp.elections[jp.elections.length - 1];
  const za = getZaElections();
  const zaLast = za.elections[za.elections.length - 1];
  const mx = getMxElections();
  const br = getBrElections();
  const il = getIlElections();
  const ilLast = il.elections[il.elections.length - 1];
  const it = getItElections();
  const itLast = it.elections[it.elections.length - 1];
  const kr = getKrElections();
  const idn = getIdElections();
  const es = getEsElections();
  const esLast = es.elections[es.elections.length - 1];
  const pl = getPlElections();
  const nl = getNlElections();
  const nlLast = nl.elections[nl.elections.length - 1];
  const ar = getArElections();
  const tw = getTwElections();
  const ng = getNgElections();
  const nz = getNzElections();
  const nzLast = nz.elections[nz.elections.length - 1];
  const ru = getRuElections();
  const cn = getCnElections();
  const tr = getTrElections();
  const usd = getUsElections();
  const ua = getUaElections();
  const iq = getIqElections();
  const ps = getPsElections();
  const va = getVaElections();

  // ---------- world map markers ----------
  const markers: HubMarker[] = Object.values(ELECTION_HUBS)
    .filter((m) => CAPITALS[m.code])
    .map((m) => ({
      code: m.code, name: m.name, href: m.href,
      lat: CAPITALS[m.code][0], lon: CAPITALS[m.code][1],
      last: m.last, next: m.next, note: m.note ?? null,
      compact: m.tier === "compact",
    }));

  // ---------- "every election ever" timeline ----------
  // The countdown board. nextElections() sorts on the structured dates in
  // ELECTION_HUBS and puts the unscheduled hubs (Ukraine, the Vatican) last.
  const allNext = nextElections();
  const countdown = allNext.slice(0, 12);
  const confirmedCount = allNext.filter((r) => r.confidence === "confirmed").length;

  // Every hub, compact or featured: the tier decides whether a hub gets a
  // card on this page, not whether its ballots count. Until 2026-09-07 the
  // compact hubs were left out of the timeline and both freedom charts, so
  // the page's own contest count disagreed with the map's.
  //
  // Row order: the US, UK and EU pinned first (the atlas's three deepest
  // records), then every other hub grouped by region in HUB_REGION's order,
  // alphabetical within each group. TimelineStrip draws a group label ahead
  // of each region's first row; the three pinned rows carry none.
  const PINNED_TL_CODES = ["us", "uk", "eu"];
  const REGION_ORDER = ["Europe", "Asia & Oceania", "Middle East & Africa", "The Americas"];
  const censusRows = getElectionCensus();
  const censusByCode = new Map(censusRows.map((r) => [r.code, r]));
  const toTlRow = (r: CensusRow, groupLabel?: string): TlRow => ({
    code: r.code, name: r.name, href: r.href, groupLabel,
    dots: r.items.map((i): TlDot => ({ id: i.id, y: i.year, t: i.title, f: i.f })),
  });
  const pinnedTlRows = PINNED_TL_CODES
    .map((c) => censusByCode.get(c))
    .filter((r): r is CensusRow => !!r)
    .map((r) => toTlRow(r));
  const restCensusByRegion = new Map<string, CensusRow[]>();
  for (const r of censusRows) {
    if (PINNED_TL_CODES.includes(r.code)) continue;
    const region = HUB_REGION[r.code] ?? "Other";
    if (!restCensusByRegion.has(region)) restCensusByRegion.set(region, []);
    restCensusByRegion.get(region)!.push(r);
  }
  for (const list of restCensusByRegion.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const restTlRows = REGION_ORDER.flatMap((region) =>
    (restCensusByRegion.get(region) ?? []).map((r, i) => toTlRow(r, i === 0 ? region : undefined)),
  );
  const tlRows: TlRow[] = [...pinnedTlRows, ...restTlRows];
  const totalContests = tlRows.reduce((s, r) => s + r.dots.length, 0);

  // ---------- cross-polity turnout ----------
  const turnoutPoints = (els: { year: number; label: string; turnout: number | null }[], nm: string) =>
    els
      .filter((e) => e.year >= 1900 && e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: `${nm} ${e.label}` }));
  const turnoutSeries: ChartSeries[] = [
    { name: "Australia", color: "#E4B505", points: turnoutPoints(au.elections, "Australia") },
    { name: "New Zealand", color: "#4ECDC4", points: turnoutPoints(nz.elections, "New Zealand") },
    { name: "United Kingdom", color: "#8A7CA8", points: turnoutPoints(uk.elections, "United Kingdom") },
    { name: "Germany", color: "#9ca3af", points: turnoutPoints(de.elections.filter((e) => !e.unfree), "Germany") },
    { name: "India", color: "#FF9933", points: turnoutPoints(ind.elections, "India") },
    { name: "United States (pres.)", color: "#5B8DEF", points: turnoutPoints(usd.elections, "United States") },
  ];

  // ---------- freedom by decade ----------
  const allDots = tlRows.flatMap((r) => r.dots);
  const freedomDecades: { d: number; free: number; partial: number; unfree: number }[] = [];
  for (let d = 1850; d <= 2020; d += 10) {
    const slice = allDots.filter((x) => x.y >= d && x.y < d + 10);
    if (!slice.length) continue;
    freedomDecades.push({
      d,
      free: slice.filter((x) => x.f === 0).length,
      partial: slice.filter((x) => x.f === 1).length,
      unfree: slice.filter((x) => x.f === 2).length,
    });
  }

  // The same chart weighted by the people living under those ballots, at the
  // population of the decade rather than of today. The contest-counted version
  // measures the atlas; this one measures the world it covers.
  const freedomPop = weightedFreedomDecades(getElectionCensus());
  const freedomCounts = new Map(freedomDecades.map((r) => [r.d, r]));
  const millions = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : `${Math.round(n / 1e6)}m`;

  // The 30 hub descriptions that used to be featured-card bodies, kept here
  // as a hub-code-keyed lookup rather than deleted: HubDirectory surfaces
  // them as a title tooltip on the polity link, and any hub page is free to
  // adopt one as its own intro prose. Values are computed from the live
  // per-hub election data above, exactly as the cards were.
  const HUB_BLURBS: Record<string, string> = {
    us: "All 60 presidential elections from 1788 to 2024: every ticket, the popular and electoral votes, state-by-state results, turnout back to Washington, the Congress each contest seated, and the story of ten eras, from unanimous elections to the polarized present.",
    uk: `All ${uk.elections.length} general elections from ${ukFirst.year} to ${ukLast.year}: every result, every Prime Minister made and unmade, eight eras of electoral history, plus the referendums, devolved parliaments and mayoralties around them.`,
    eu: `All ${eu.elections.length} elections to the world's only directly elected transnational parliament, 1979 to ${euLast.year}: the political groups, the presidents they made, and a chamber that grew from 410 seats to ${euLast.totalSeats}.`,
    de: `${de.elections.length} national elections from the Frankfurt Parliament of 1848 to ${deLast.year}, across Empire, Weimar, dictatorship and two republics, with the Nazi-era sham votes clearly labelled as such.`,
    fr: `${fr.legislative.length} legislative elections from the Revolution of 1791 to ${frLegLast.year} and all ${fr.presidential.length} Fifth Republic presidential contests: five republics, two empires, three monarchies.`,
    it: `All ${it.elections.length} general elections from unification in 1861 to ${itLast.year}: the Liberal monarchy, the Fascist plebiscites labelled as such, the First Republic's decades and the Second Republic's upheavals.`,
    es: `All ${es.elections.length} general elections from 1867 to ${esLast.year}: the turno pacífico's arranged results stated plainly, the Second Republic's swings, and the democratic era from the transition to today's coalitions.`,
    pl: `From the Commonwealth's royal free elections of 1573 to the 2025 runoff: ${pl.presidential.length} contests for the head of state and ${pl.legislative.length} parliamentary elections, with the communist rituals labelled as such.`,
    nl: `All ${nl.elections.length} general elections from 1886 to ${nlLast.year}: the school struggle, the Pacification of 1917, the pillarised decades, the Fortuyn shock, and the fragmented coalitions of the world's purest proportional system.`,
    ru: `${ru.presidential.length} presidential votes and ${ru.legislative.length} legislative elections, 1906–2024, recorded honestly: the Tsar's Dumas, the free 1917 vote the Bolsheviks overturned, the Soviet single-list theatre, the contested Duma of the 1990s, and the managed votes that closed the window.`,
    ua: `${ua.presidential.length} presidential and ${ua.legislative.length} Rada elections since independence: every one competitive, three incumbents defeated, one falsified runoff overturned by revolution. Suspended under martial law since 2022; the record awaits the war's end.`,
    va: `${va.elections.length} papal elections across 964 years, the oldest electoral system still in use. The 33-month deadlock that invented the conclave, the schism with three rival popes, the crown vetoes, and the two-day conclaves of the modern age, through Leo XIV in 2025.`,
    in: `${ind.elections.length} elections from the Raj-era assemblies of 1920 to ${inLast.year}: the world's largest democratic exercise, from Nehru's first sweep through the Emergency verdict to the Modi era.`,
    jp: `All ${jp.elections.length} general elections from 1890, Asia's first national parliament, to the ${jpLast.year} snap election: the 1955 system, the reform era, and the LDP's seven decades of dominance.`,
    au: `All ${au.elections.length} federal elections from Federation in 1901 to ${auLast.year}: preferential voting, compulsory turnout, the Dismissal, and every Prime Minister the ballot box made and unmade.`,
    kr: `${kr.presidential.length} presidential contests from 1948 to the post-martial-law snap vote of 2025, plus every National Assembly election: the authoritarian rituals labelled as such, and the two-camp democracy since 1987.`,
    id: `From the colonial Volksraad of 1917 to the world's largest single-day vote: the 1955 experiment, the New Order's managed contests stated plainly, and the reformasi era's ${idn.presidential.length} presidential and ${idn.legislative.length} legislative elections.`,
    tw: `${tw.elections.length} contests across the Republic of China's whole lineage, 1911–2024: the Beiyang parliaments, the 'eternal' National Assembly's rituals labelled as such, and the direct-election democracy born under missile fire in 1996.`,
    nz: `All ${nz.elections.length} general elections from 1853 to ${nzLast.year}: the world's first vote with women's suffrage in 1893, the first Labour government, and the MMP era's coalition mathematics.`,
    cn: `China holds no competitive national elections. This hub records what exists instead: all ${cn.elections.length} national congresses since 1949, their party-managed selection stated plainly, and what the theatre of unanimity reveals.`,
    za: `All ${za.elections.length} general elections from Union in 1910 to ${zaLast.year}: the whites-only parliaments stated plainly as such, then the democratic era, from the queues of 1994 to the 2024 coalition.`,
    il: `${il.elections.length} elections from the pre-state assemblies of 1920 to ${ilLast.year}: the Mapai decades, the Mahapach, the direct-election experiment and the deadlock cycle, where no party has ever won a majority.`,
    tr: `From the Ottoman parliaments of 1877 to the 2023 runoff: ${tr.legislative.length} parliamentary and ${tr.presidential.length} presidential contests: the single-party era labelled, the coups, and the tilted contests of today.`,
    ng: `From Africa's first colonial election in 1923 to the three-way contest of 2023: ${ng.presidential.length} presidential and ${ng.legislative.length} parliamentary votes, with June 12 and the rigged contests labelled for what they were.`,
    iq: `${iq.legislative.length} parliamentary elections from the monarchy of 1946 to November 2025, recorded honestly: the palace-managed chambers, Saddam's 99.99% rituals stated plainly, and seven consecutive competitive elections since the purple fingers of 2005.`,
    ps: "The shortest record in the atlas: the annulled Mandate election of 1923, the Authority's founding votes of 1996, Abbas's 2005 mandate still running two decades later, and the free 2006 election that froze everything. Next vote scheduled for 28 November 2026.",
    ca: `All ${ca.elections.length} federal elections from Confederation in 1867 to ${caLast.year}: every Parliament from Macdonald to Carney, the minority-government specialty, and the 1993 collapse.`,
    mx: `${mx.presidential.length} presidential contests from 1853 to 2024 and the Chamber midterms since 1943: the Porfiriato, seventy-one years of one-party rule, and the transition that made elections real.`,
    br: `${br.presidential.length} presidential contests from 1891 to 2022 plus the parliamentary record: the Old Republic's machine counts, the dictatorship's electoral college, and the New Republic's runoffs.`,
    ar: `All ${ar.elections.length} presidential contests from 1826 to Milei's runoff: the oligarchic republic's arranged successions, the secret-ballot revolution of 1916, Perón, the proscription years, and unbroken democracy since 1983.`,
  };

  // ---------- hub directory rows ----------
  // Plain, fully-computed row data for the client-side HubDirectory (sortable
  // headers and region filter chips need client state, so all the
  // server-only joins - census counts, the country-slug join, the current-
  // leader overlay, the country power ranking - happen here and cross the
  // boundary as data, never as an import).
  const PINNED_HUB_CODES = ["us", "uk", "eu"];
  // The country power index (the Power Atlas share, /countries "Power"
  // column) is the ranking Ashwin asked the directory to follow; the Countries
  // hub's scoreRank is the fallback for a polity the atlas does not score.
  const powerBySlug = getCurrentPowerBySlug();
  // The European Union has no country row and no head of government in the
  // country feed; its executive is the Commission President, which the
  // Organisations hub already tracks (Ashwin, 2026-09-07).
  const euExec = getOrgLeadership("EU")?.current ?? null;
  const countryRankBySlug = new Map(getAllCountries().map((c) => [c.slug, c.scoreRank]));
  const dirRowsAll: DirRow[] = Object.values(ELECTION_HUBS).map((m) => {
    const countrySlug = HUB_COUNTRY_SLUGS[m.href]?.[0];
    const cl = countrySlug ? leaders[countrySlug] : undefined;
    const census = censusByCode.get(m.code);
    const lastYear = census && census.items.length ? census.items[census.items.length - 1].year : null;
    return {
      code: m.code,
      name: m.name,
      flagSrc: flagUrlByCode(m.flag),
      flagSrcSet: flagSrcSetByCode(m.flag),
      href: m.href,
      region: HUB_REGION[m.code] ?? "Other",
      systemLabel: m.governmentLabel ?? GOVERNMENT_TYPE_LABELS[m.governmentType],
      last: m.last,
      lastYear,
      next: m.next,
      nextDate: m.nextDate ?? null,
      confidence: m.nextConfidence ?? "expected",
      leader: cl && countrySlug
        ? { name: cl.name, title: leaderTitle(cl.role), href: `/leaders/${countrySlug}` }
        : m.code === "eu" && euExec
          ? { name: euExec.name, title: euExec.role, href: "/orgs#eu" }
          : null,
      contests: census ? census.items.length : null,
      rank: countrySlug
        ? (powerBySlug[countrySlug]?.rank || countryRankBySlug.get(countrySlug) || null)
        : null,
      power: countrySlug && powerBySlug[countrySlug]
        ? { share: powerBySlug[countrySlug].share, rank: powerBySlug[countrySlug].rank, tier: powerBySlug[countrySlug].tier }
        : null,
      note: m.note ?? null,
      noteTone: m.noteTone ?? null,
      blurb: HUB_BLURBS[m.code],
      pinned: PINNED_HUB_CODES.includes(m.code),
    };
  });
  const pinnedDirRows = PINNED_HUB_CODES
    .map((c) => dirRowsAll.find((r) => r.code === c))
    .filter((r): r is DirRow => !!r);
  const restDirRows = dirRowsAll
    .filter((r) => !r.pinned)
    .sort((a, b) => {
      if (a.rank == null && b.rank == null) return a.name.localeCompare(b.name);
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank === b.rank ? a.name.localeCompare(b.name) : a.rank - b.rank;
    });
  const dirRows: DirRow[] = [...pinnedDirRows, ...restDirRows];

  const stamp = `AS OF ${forecast?.built ?? "UNKNOWN"} · ${HUB_COUNT} HUBS · ${totalContests.toLocaleString("en-US")} CONTESTS · WIKIPEDIA, NATIONAL ELECTORAL AUTHORITIES`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ElectionsCrumbs />
      <ElectionsHeader
        emoji="🗳️"
        title={TITLE}
        sub="Every general election in the atlas, live forecasts for the next ones, and a public record of how those forecasts did."
        stamp={stamp}
      />
      <ElectionsNav />
      <SiblingHubs />

      {/* ---------- forecast previews: the permanent US & UK window + the rotating tracker ---------- */}
      {forecast ? (
        <section className="mb-8">
          <SectionHead
            title="Forecasts"
            sub="Seat ranges from thousands of simulations, updated weekly: ranges first, probabilities second."
            more={`Every average is a recency-weighted mean of each pollster's latest poll within a 45-day window, 14-day half-life. Labelled as speculation, not a claim about the outcome. Updated ${forecast.built}.`}
          />
          <div className="grid gap-4">
          <Link
            href="/elections/forecast"
            className="block rounded-2xl border p-5 transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "#B4540A", backgroundColor: "rgba(217,119,6,0.04)" }}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
              <h3 className="text-xl font-bold text-[var(--text)]">
                United States &amp; United Kingdom <span className="text-sm font-normal" style={{ color: "#D97706" }}>· always on</span>
              </h3>
              <span className="text-xs text-[var(--accent)]">Open the full forecast →</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl">
              Whatever the next US and UK elections are, they live here permanently.
            </p>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">United States · 2026 midterms · 3 November</p>
                {forecast.us ? (
                  <>
                    <MiniRange label="Dem House" color={FORECAST_COLORS.dem} median={forecast.us.demSeats.median} lo={forecast.us.demSeats.lo} hi={forecast.us.demSeats.hi} max={435} right={`House ${forecast.us.pDemHouse}%`} />
                    <MiniRange label="Rep House" color={FORECAST_COLORS.rep} median={435 - forecast.us.demSeats.median} lo={435 - forecast.us.demSeats.hi} hi={435 - forecast.us.demSeats.lo} max={435} right={`House ${(100 - forecast.us.pDemHouse).toFixed(1)}%`} />
                    {forecast.us.senate ? (
                      <>
                        <MiniRange label="Dem Senate" color={FORECAST_COLORS.dem} median={forecast.us.senate.demSeats.median} lo={forecast.us.senate.demSeats.lo} hi={forecast.us.senate.demSeats.hi} max={100} right={`control ${forecast.us.senate.pDemControl}%`} />
                        <MiniRange label="Rep Senate" color={FORECAST_COLORS.rep} median={100 - forecast.us.senate.demSeats.median} lo={100 - forecast.us.senate.demSeats.hi} hi={100 - forecast.us.senate.demSeats.lo} max={100} right={`control ${(100 - forecast.us.senate.pDemControl).toFixed(1)}%`} />
                      </>
                    ) : null}
                    <p className="text-[10px] text-[var(--text-dim)] mt-1.5">
                      House: generic ballot margin through the 2012–2024 seats-votes relationship.
                    </p>
                  </>
                ) : null}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">United Kingdom · next general election · hung parliament {forecast.uk.sim.pHung}%</p>
                {Object.entries(forecast.uk.sim.seats)
                  .filter(([k]) => k !== "oth" && k !== "ni")
                  .filter(([k]) => k !== "pc")
                  .sort((a, b) => b[1].median - a[1].median)
                  .slice(0, 6)
                  .map(([k, r]) => (
                    <MiniRange
                      key={k}
                      label={FORECAST_NAMES[k] ?? k}
                      color={FORECAST_COLORS[k] === "#FDF38E" ? "#D9C838" : FORECAST_COLORS[k] ?? "#9ca3af"}
                      median={r.median}
                      lo={r.lo}
                      hi={r.hi}
                      max={420}
                      right={forecast.uk.sim.pLargest[k] != null ? `largest ${forecast.uk.sim.pLargest[k]}%` : ""}
                    />
                  ))}
                <p className="text-[10px] text-[var(--text-dim)] mt-1.5">
                  Proportional swing from the 2024 result in all 632 GB constituencies.
                </p>
              </div>
            </div>
          </Link>

          {forecast.br || forecast.il || forecast.nz || forecast.fr ? (
            <Link
              href="/elections/forecast"
              className="block rounded-2xl border p-5 transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h3 className="text-lg font-bold text-[var(--text)]">
                  Tracking now <span className="text-sm font-normal text-[var(--text-dim)]">· elections on the near horizon</span>
                </h3>
                <span className="text-xs text-[var(--accent)]">Full forecasts →</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-4 max-w-3xl">
                A race is tracked when its date is confirmed within twelve months and it has a poll series
                we parse. Next to rotate in: Nigeria (16 January 2027) as a scenario board, Germany&apos;s
                Federal Convention (30 January 2027).
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {forecast.br ? (
                  <TrackBlock
                    flag="br"
                    title="Brazil"
                    sub="Presidential · 4 Oct 2026"
                    rows={Object.entries(forecast.br.firstRound.shares).slice(0, 2).map(([n, v]) => ({ label: n, color: trackColor(n), value: `${v.toFixed(1)}%` }))}
                    note={forecast.br.runoffs[0]
                      ? `Runoff: ${forecast.br.runoffs[0].pA >= 50
                          ? `${forecast.br.runoffs[0].a} ${forecast.br.runoffs[0].pA.toFixed(0)}%`
                          : `${forecast.br.runoffs[0].b} ${(100 - forecast.br.runoffs[0].pA).toFixed(0)}%`}`
                      : "First-round polling average"}
                  />
                ) : null}
                {forecast.il ? (
                  <TrackBlock
                    flag="il"
                    title="Israel"
                    sub="Knesset · 2026"
                    rows={forecast.il.parties.slice(0, 2).map((p) => ({ label: p.name, color: trackColor(p.name), value: `${Math.round(p.seats)} seats` }))}
                    note={forecast.il.gov.avg != null ? `Gov bloc averages ${forecast.il.gov.avg} of 120` : "Seat-poll average"}
                  />
                ) : null}
                {forecast.nz ? (
                  <TrackBlock
                    flag="nz"
                    title="New Zealand"
                    sub="General · late 2026"
                    rows={Object.entries(forecast.nz.average).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => ({ label: NZ_NAMES[k] ?? k, color: NZ_COLORS[k] ?? "#9ca3af", value: `${v.toFixed(1)}%` }))}
                    note={`Right bloc ${forecast.nz.pRightBloc}% · left ${forecast.nz.pLeftBloc}% · neither ${forecast.nz.pNeither}%`}
                  />
                ) : null}
                {forecast.fr ? (
                  <TrackBlock
                    flag="fr"
                    title="France"
                    sub="Presidential · spring 2027"
                    rows={Object.entries(forecast.fr.firstRound.shares).slice(0, 2).map(([n, v]) => ({ label: frName(n), color: trackColor(n), value: `${v.toFixed(1)}%` }))}
                    note="Scenario polling · no declared field yet"
                  />
                ) : null}
              </div>
            </Link>
          ) : null}
          </div>
        </section>
      ) : null}

      {/* ---------- the countdown board ----------
          Sorted on ELECTION_HUBS.nextDate, the one place election dates live.
          A confirmed date prints as a date; an "expected" one prints the prose
          instead, because its date is a latest-permissible sort key and not a
          claim. An overdue row is left visible on purpose: it means a result
          needs filing, and scripts/check-election-dates.mjs fails the build if
          it stays that way for a fortnight. */}
      <section className="mb-10">
        <SectionHead
          title="Next to vote"
          sub="The twelve soonest contests in the atlas, badged by how firm their date is."
          more={`${confirmedCount} of the ${allNext.length} hubs have an officially set date (badged Set). The rest show the term running its course (Term running) or have no scheduled vote at all (No date), which is what is actually known, never a guessed day. A Set date that has passed with no result filed shows "result due" until it is.`}
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {countdown.map((r) => {
            const badge = r.confidence === "confirmed" ? "Set" : r.confidence === "expected" ? "Term running" : "No date";
            const badgeColor = r.confidence === "confirmed" ? "#4ECDC4" : "var(--text-dim)";
            return (
              <div
                key={r.code}
                className="tap-row flex items-center gap-2 rounded-xl border p-3 transition-colors hover:border-[var(--accent)]"
                style={{ borderColor: r.overdue ? "#B4540A" : "var(--border)", backgroundColor: "var(--bg-card)" }}
              >
                <Link href={r.href} className="tap-target flex min-h-11 min-w-0 flex-1 items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrlByCode(r.flag)} srcSet={flagSrcSetByCode(r.flag)} alt="" width={26} height={19} className="rounded-[2px] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-[var(--text)] truncate">{r.name}</span>
                      <span
                        className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
                        style={{ ...MONO, color: badgeColor, backgroundColor: "var(--bg-card-hover)" }}
                      >
                        {badge}
                      </span>
                    </span>
                    <span className="block text-xs text-[var(--text-dim)] truncate">
                      {r.confidence === "confirmed" && r.date ? fullDate(r.date) : r.next}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-xs">
                    {r.overdue ? (
                      <span className="font-semibold" style={{ color: "#D97706" }}>result due</span>
                    ) : r.daysAway == null ? (
                      <span className="text-[var(--text-dim)]">·</span>
                    ) : (
                      <>
                        <span className="text-[var(--text-muted)]">
                          {r.daysAway === 0 ? "today" : r.daysAway.toLocaleString("en-US")}
                        </span>
                        {r.daysAway === 0 ? null : <span className="block text-[10px] text-[var(--text-dim)]">days</span>}
                      </>
                    )}
                  </span>
                </Link>
                {r.confidence === "confirmed" && !r.overdue ? (
                  <Link
                    href={`/elections/calendar/${r.code}.ics`}
                    className="shrink-0 inline-flex min-h-11 items-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)] hover:underline"
                    title={`Add ${r.name} to your calendar`}
                  >
                    Calendar
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      {/* ---------- world map ---------- */}
      <section className="mb-10">
        <SectionHead
          title="World map"
          sub={`${markers.length} election hubs, ${totalContests.toLocaleString("en-US")} contests. Click any marker to open its hub.`}
        />
        <ElectionsWorldMap markers={markers} />
        <p className="text-xs text-[var(--text-muted)] mt-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#4ECDC4" }} /> competitive democracies
          </span>
          <span className="inline-flex items-center gap-1.5 ml-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#D97706" }} /> managed systems
          </span>
        </p>
      </section>

      {/* One directory for every hub, replacing the old featured-card pair
          plus the 30-card region grid. Folded on a phone (measured
          2026-09-07: the open page ran 21 screens at 390px), open on a
          desktop, per DESIGN-STANDARDS section 2. */}
      <CollapsibleSection
        id="regions"
        title="Every hub, in power order"
        sub={`${HUB_COUNT} polities, US/UK/EU first then ranked by the site's country power ranking: when each last voted, when it votes next, and who governs.`}
        more="Managed systems carry an amber badge beside their name; Contests is this atlas's own count, not any official total."
        meta={`${HUB_COUNT} hubs`}
        bodyClassName="p-0 sm:p-0 pt-3"
      >
        <HubDirectory rows={dirRows} />
      </CollapsibleSection>

      {/* ---------- every election ever ---------- */}
      <section className="mb-10">
        <SectionHead
          title="Two centuries of ballots"
          sub={`Every one of the ${totalContests.toLocaleString("en-US")} contests in the atlas, newest first.`}
          more="Rows lead with the US, UK and EU, then group by region. The postwar democratic wave, the cluster of 1989-91, the solid amber-and-red rows of the managed systems, and New Zealand's unbroken teal line back to 1853. Scroll right to travel back in time."
          moreLabel="How to read it"
        />
        <TimelineStrip rows={tlRows} />
        <TimelineLegend />
        <p className="text-sm mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/elections/forecast" className="text-[var(--accent)] hover:underline">
            Forecasts: the road to the next elections in the US, UK, Brazil, Israel, New Zealand and France →
          </Link>
          <Link href="/elections/under-fire" className="text-[var(--accent)] hover:underline">
            Elections under fire: every ballot held in wartime →
          </Link>
          <Link href="/elections/referendums" className="text-[var(--accent)] hover:underline">
            Landmark referendums: when the people decided directly →
          </Link>
          <Link href="/elections/all" className="text-[var(--accent)] hover:underline">
            Every hub A–Z, searchable →
          </Link>
          <Link href="/elections/systems" className="text-[var(--accent)] hover:underline">
            Electoral systems: how closely seats track votes →
          </Link>
        </p>
      </section>

      {/* ---------- cross-polity charts ---------- */}
      <CollapsibleSection
        id="compared"
        title="The world compared"
        sub="Turnout across six long-running democracies, and how much of the world voted freely, by decade."
        bodyClassName="p-0 sm:p-0 pt-3"
      >
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout across six democracies, 1900–2026</h3>
            <p className="text-xs text-[var(--text-muted)] mb-1">
              Compulsory voting explains most of the gap between these six democracies.
            </p>
            <details className="mb-2">
              <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">
                How to read it
              </summary>
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                Compulsory-voting Australia holds above 90% for a century; New Zealand and Germany run
                high without compulsion; India climbs as the franchise deepens; American presidential
                turnout lives 20 points below its peers. Hover for exact figures.
              </div>
            </details>
            <LineChart series={turnoutSeries} yMax={100} yTicks={[25, 50, 75]} />
            <p className="text-[10px] text-[var(--text-dim)] mt-2">
              Six is a chart; all of them is a table. Turnout for every polity that records it,
              with the highs that are rituals marked as such, is on{" "}
              <Link href="/elections/systems" className="text-[var(--accent)] hover:underline">electoral systems</Link>.
            </p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">How much of the world voted freely</h3>
            <p className="text-xs text-[var(--text-muted)] mb-1">
              Weighted by the people, not by the elections.
            </p>
            <details className="mb-3">
              <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">
                How this is measured
              </summary>
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                Each polity counts once a decade, at its population in that decade, under the worst
                label its ballots earned: the colonial restrictions of the early rows, the mid-century
                rituals under dictatorship, the democratic flood after 1945 and again after 1989.
              </div>
            </details>
            <div className="grid gap-1">
              {freedomPop.map(({ d, free, partial, unfree, covered, worldShare, polities }) => {
                const counts = freedomCounts.get(d);
                return (
                  <div key={d} className="flex items-center gap-2">
                    <span className="text-[10px] tabular-nums text-[var(--text-dim)] w-10 shrink-0">{d}s</span>
                    <div className="flex h-3 flex-1 overflow-hidden rounded-sm" style={{ backgroundColor: "var(--border)" }}>
                      {free > 0 ? <div style={{ width: `${(free / covered) * 100}%`, backgroundColor: "#4ECDC4" }} title={`${millions(free)} under free ballots${counts ? ` · ${counts.free} contests` : ""}`} /> : null}
                      {partial > 0 ? <div style={{ width: `${(partial / covered) * 100}%`, backgroundColor: "#D97706" }} title={`${millions(partial)} under restricted or tilted ballots${counts ? ` · ${counts.partial} contests` : ""}`} /> : null}
                      {unfree > 0 ? <div style={{ width: `${(unfree / covered) * 100}%`, backgroundColor: "#8E1B1B" }} title={`${millions(unfree)} under unfree rituals${counts ? ` · ${counts.unfree} contests` : ""}`} /> : null}
                    </div>
                    <span
                      className="text-[10px] tabular-nums text-[var(--text-dim)] w-12 shrink-0 text-right"
                      title={`${polities} polities voting, ${millions(covered)} people, ${worldShare.toFixed(0)}% of the world alive then`}
                    >
                      {millions(covered)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[var(--text-dim)] mt-2">
              Free (teal), restricted or tilted (amber), unfree (dark red). The figure on the right is
              the population of the polities that voted at all that decade, which is why the early rows
              are small: in the {freedomPop[0]?.d}s that was{" "}
              {freedomPop[0]?.worldShare.toFixed(0)}% of the people alive, against{" "}
              {freedomPop[freedomPop.length - 1]?.worldShare.toFixed(0)}% in the{" "}
              {freedomPop[freedomPop.length - 1]?.d}s. Hover any bar for the contest counts behind it.
              Coverage is the {tlRows.length} polities tracked here, so this is the covered world, not the whole one.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      <SourcesCard>
        <p>
          Every hub is built from Wikipedia&apos;s election articles cross-checked against each polity&apos;s
          national electoral authority, with unfree and managed votes labelled as such rather than
          folded in as if they were competitive contests. Forecasts on this page are this site&apos;s
          own aggregation model, rebuilt weekly; the ledger of how those forecasts have done is on{" "}
          <Link href="/elections/track-record" className="text-[var(--accent)] hover:underline">Track record</Link>.
        </p>
        <p>
          <Link href="/data/elections-all.csv" className="text-[var(--accent)] hover:underline">
            Download every hub as CSV
          </Link>
          {" · "}
          <Link href="/elections/calendar.ics" className="text-[var(--accent)] hover:underline">
            Subscribe to the election calendar
          </Link>{" "}
          <span className="text-[var(--text-dim)]">
            (in most calendar apps, paste the link with <code>https</code> replaced by <code>webcal</code>)
          </span>
        </p>
        <p>
          Related:{" "}
          <Link href="/uk-political-leadership" className="text-[var(--accent)] hover:underline">UK Political Leadership</Link>
          {" · "}
          <Link href="/us-political-leadership" className="text-[var(--accent)] hover:underline">US Political Leadership</Link>
          {" · "}
          <Link href="/leaders" className="text-[var(--accent)] hover:underline">World Leaders</Link>
          {" · "}
          <Link href="/power-atlas" className="text-[var(--accent)] hover:underline">Power Atlas</Link>
          {" · "}
          <Link href="/conflicts" className="text-[var(--accent)] hover:underline">Conflicts</Link>
          {" · "}
          <Link href="/mayors" className="text-[var(--accent)] hover:underline">Mayors</Link>
          {" · "}
          <Link href="/orgs" className="text-[var(--accent)] hover:underline">Organisations</Link>
        </p>
      </SourcesCard>
    </main>
  );
}
