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
import { ELECTION_HUBS, nextElections } from "@/lib/electionHubsMeta";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubCardClient from "./HubCardClient";
import { getUsElections } from "@/lib/usElections";
import ElectionsWorldMap, { type HubMarker } from "./ElectionsWorldMap";
import TimelineStrip, { TimelineLegend, type TlDot, type TlRow } from "./TimelineStrip";
import { BackButton } from "./HubShared";
import { getElectionCensus } from "@/lib/electionCensus";
import { weightedFreedomDecades } from "@/lib/electionPopulationWeight";
import { getForecast, FORECAST_COLORS, FORECAST_NAMES, NZ_COLORS, NZ_NAMES } from "@/lib/forecast";
import LineChart, { type ChartSeries } from "./LineChart";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function fullDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const PATH = "/elections";
const TITLE = "Elections";
const DESC =
  "Election history hubs for thirty-five polities: every general election, the parties, the leaders, the turnout and the results, with unfree and managed votes labelled as such. For novices who want the story and experts who want the numbers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

type Card = { hub: string; head: string; body: string };

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
};
// The EU marker sits at Strasbourg — the Parliament's seat — so Brussels
// stays legible as Belgium's marker.
CAPITALS.eu = [48.5734, 7.7521];

// Timeline dots come from the shared election census (lib/electionCensus),
// which also powers the wartime cross-references and /elections/under-fire.

// Cards are collapsed by default (flag, headline, last and next elections);
// the description expands on click. Interactivity lives in HubCardClient.
function HubCard({ c }: { c: Card }) {
  const meta = ELECTION_HUBS[c.hub];
  return (
    <HubCardClient
      href={meta.href}
      flagSrc={flagUrlByCode(meta.flag)}
      flagSrcSet={flagSrcSetByCode(meta.flag)}
      name={meta.name}
      note={meta.note ?? null}
      noteTone={meta.noteTone ?? null}
      head={c.head}
      body={c.body}
      last={meta.last}
      next={meta.next}
    />
  );
}

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
  const forecast = await getForecast();
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

  const tlRows: TlRow[] = getElectionCensus()
    .filter((r) => ELECTION_HUBS[r.code]?.tier !== "compact")
    .map((r) => ({
    code: r.code, name: r.name, href: r.href,
    dots: r.items.map((i): TlDot => ({ id: i.id, y: i.year, t: i.title, f: i.f })),
  }));
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

  const top: Card[] = [
    {
      hub: "us",
      head: "US Presidential Elections →",
      body: "All 60 presidential elections from 1788 to 2024: every ticket, the popular and electoral votes, state-by-state results, turnout back to Washington, the Congress each contest seated, and the story of ten eras, from unanimous elections to the polarized present.",
    },
    {
      hub: "uk",
      head: "UK General Elections →",
      body: `All ${uk.elections.length} general elections from ${ukFirst.year} to ${ukLast.year}: every result, every Prime Minister made and unmade, eight eras of electoral history, plus the referendums, devolved parliaments and mayoralties around them.`,
    },
  ];

  const europe: Card[] = [
    {
      hub: "eu",
      head: "European Parliament Elections →",
      body: `All ${eu.elections.length} elections to the world's only directly elected transnational parliament, 1979 to ${euLast.year}: the political groups, the presidents they made, and a chamber that grew from 410 seats to ${euLast.totalSeats}.`,
    },
    {
      hub: "de",
      head: "German Federal Elections →",
      body: `${de.elections.length} national elections from the Frankfurt Parliament of 1848 to ${deLast.year}, across Empire, Weimar, dictatorship and two republics, with the Nazi-era sham votes clearly labelled as such.`,
    },
    {
      hub: "fr",
      head: "French Elections →",
      body: `${fr.legislative.length} legislative elections from the Revolution of 1791 to ${frLegLast.year} and all ${fr.presidential.length} Fifth Republic presidential contests: five republics, two empires, three monarchies.`,
    },
    {
      hub: "it",
      head: "Italian General Elections →",
      body: `All ${it.elections.length} general elections from unification in 1861 to ${itLast.year}: the Liberal monarchy, the Fascist plebiscites labelled as such, the First Republic's decades and the Second Republic's upheavals.`,
    },
    {
      hub: "es",
      head: "Spanish General Elections →",
      body: `All ${es.elections.length} general elections from 1867 to ${esLast.year}: the turno pacífico's arranged results stated plainly, the Second Republic's swings, and the democratic era from the transition to today's coalitions.`,
    },
    {
      hub: "pl",
      head: "Polish Elections →",
      body: `From the Commonwealth's royal free elections of 1573 to the 2025 runoff: ${pl.presidential.length} contests for the head of state and ${pl.legislative.length} parliamentary elections, with the communist rituals labelled as such.`,
    },
    {
      hub: "nl",
      head: "Dutch General Elections →",
      body: `All ${nl.elections.length} general elections from 1886 to ${nlLast.year}: the school struggle, the Pacification of 1917, the pillarised decades, the Fortuyn shock, and the fragmented coalitions of the world's purest proportional system.`,
    },
    {
      hub: "ru",
      head: "Russian & Soviet Elections →",
      body: `${ru.presidential.length} presidential votes and ${ru.legislative.length} legislative elections, 1906–2024, recorded honestly: the Tsar's Dumas, the free 1917 vote the Bolsheviks overturned, the Soviet single-list theatre, the contested Duma of the 1990s, and the managed votes that closed the window.`,
    },
    {
      hub: "ua",
      head: "Ukrainian Elections →",
      body: `${ua.presidential.length} presidential and ${ua.legislative.length} Rada elections since independence: every one competitive, three incumbents defeated, one falsified runoff overturned by revolution. Suspended under martial law since 2022; the record awaits the war's end.`,
    },
    {
      hub: "va",
      head: "Papal Conclaves →",
      body: `${va.elections.length} papal elections across 964 years, the oldest electoral system still in use. The 33-month deadlock that invented the conclave, the schism with three rival popes, the crown vetoes, and the two-day conclaves of the modern age, through Leo XIV in 2025.`,
    },
  ];

  const asiaOceania: Card[] = [
    {
      hub: "in",
      head: "Indian General Elections →",
      body: `${ind.elections.length} elections from the Raj-era assemblies of 1920 to ${inLast.year}: the world's largest democratic exercise, from Nehru's first sweep through the Emergency verdict to the Modi era.`,
    },
    {
      hub: "jp",
      head: "Japanese General Elections →",
      body: `All ${jp.elections.length} general elections from 1890, Asia's first national parliament, to the ${jpLast.year} snap election: the 1955 system, the reform era, and the LDP's seven decades of dominance.`,
    },
    {
      hub: "au",
      head: "Australian Federal Elections →",
      body: `All ${au.elections.length} federal elections from Federation in 1901 to ${auLast.year}: preferential voting, compulsory turnout, the Dismissal, and every Prime Minister the ballot box made and unmade.`,
    },
    {
      hub: "kr",
      head: "South Korean Elections →",
      body: `${kr.presidential.length} presidential contests from 1948 to the post-martial-law snap vote of 2025, plus every National Assembly election: the authoritarian rituals labelled as such, and the two-camp democracy since 1987.`,
    },
    {
      hub: "id",
      head: "Indonesian Elections →",
      body: `From the colonial Volksraad of 1917 to the world's largest single-day vote: the 1955 experiment, the New Order's managed contests stated plainly, and the reformasi era's ${idn.presidential.length} presidential and ${idn.legislative.length} legislative elections.`,
    },
    {
      hub: "tw",
      head: "Taiwanese Presidential Elections →",
      body: `${tw.elections.length} contests across the Republic of China's whole lineage, 1911–2024: the Beiyang parliaments, the 'eternal' National Assembly's rituals labelled as such, and the direct-election democracy born under missile fire in 1996.`,
    },
    {
      hub: "nz",
      head: "New Zealand General Elections →",
      body: `All ${nz.elections.length} general elections from 1853 to ${nzLast.year}: the world's first vote with women's suffrage in 1893, the first Labour government, and the MMP era's coalition mathematics.`,
    },
    {
      hub: "cn",
      head: "Chinese National Congresses →",
      body: `China holds no competitive national elections. This hub records what exists instead: all ${cn.elections.length} national congresses since 1949, their party-managed selection stated plainly, and what the theatre of unanimity reveals.`,
    },
  ];

  const meAfrica: Card[] = [
    {
      hub: "za",
      head: "South African General Elections →",
      body: `All ${za.elections.length} general elections from Union in 1910 to ${zaLast.year}: the whites-only parliaments stated plainly as such, then the democratic era, from the queues of 1994 to the 2024 coalition.`,
    },
    {
      hub: "il",
      head: "Israeli Elections →",
      body: `${il.elections.length} elections from the pre-state assemblies of 1920 to ${ilLast.year}: the Mapai decades, the Mahapach, the direct-election experiment and the deadlock cycle, where no party has ever won a majority.`,
    },
    {
      hub: "tr",
      head: "Turkish Elections →",
      body: `From the Ottoman parliaments of 1877 to the 2023 runoff: ${tr.legislative.length} parliamentary and ${tr.presidential.length} presidential contests: the single-party era labelled, the coups, and the tilted contests of today.`,
    },
    {
      hub: "ng",
      head: "Nigerian Elections →",
      body: `From Africa's first colonial election in 1923 to the three-way contest of 2023: ${ng.presidential.length} presidential and ${ng.legislative.length} parliamentary votes, with June 12 and the rigged contests labelled for what they were.`,
    },
    {
      hub: "iq",
      head: "Iraqi Elections →",
      body: `${iq.legislative.length} parliamentary elections from the monarchy of 1946 to November 2025, recorded honestly: the palace-managed chambers, Saddam's 99.99% rituals stated plainly, and seven consecutive competitive elections since the purple fingers of 2005.`,
    },
    {
      hub: "ps",
      head: "Palestinian Elections →",
      body: `The shortest record in the atlas: the annulled Mandate election of 1923, the Authority's founding votes of 1996, Abbas's 2005 mandate still running two decades later, and the free 2006 election that froze everything. Next vote scheduled for 28 November 2026.`,
    },
  ];

  const americas: Card[] = [
    {
      hub: "ca",
      head: "Canadian Federal Elections →",
      body: `All ${ca.elections.length} federal elections from Confederation in 1867 to ${caLast.year}: every Parliament from Macdonald to Carney, the minority-government specialty, and the 1993 collapse.`,
    },
    {
      hub: "mx",
      head: "Mexican Elections →",
      body: `${mx.presidential.length} presidential contests from 1853 to 2024 and the Chamber midterms since 1943: the Porfiriato, seventy-one years of one-party rule, and the transition that made elections real.`,
    },
    {
      hub: "br",
      head: "Brazilian Elections →",
      body: `${br.presidential.length} presidential contests from 1891 to 2022 plus the parliamentary record: the Old Republic's machine counts, the dictatorship's electoral college, and the New Republic's runoffs.`,
    },
    {
      hub: "ar",
      head: "Argentine Presidential Elections →",
      body: `All ${ar.elections.length} presidential contests from 1826 to Milei's runoff: the oligarchic republic's arranged successions, the secret-ballot revolution of 1916, Perón, the proscription years, and unbroken democracy since 1983.`,
    },
  ];

  // Compact hubs: the scaling pattern for an ever-growing atlas. Each new
  // polity joins as a flag + name link in its region — no card, no place in
  // the map/timeline/charts above — and can be promoted to a featured card
  // later by dropping `tier: "compact"` in electionHubsMeta.
  const regions: { title: string; cards: Card[]; more: string[] }[] = [
    { title: "Europe", cards: europe, more: ["ch", "be", "dk", "gr", "at", "pt", "ie"] },
    { title: "Asia & Oceania", cards: asiaOceania, more: ["sg", "my", "ph"] },
    { title: "Middle East & Africa", cards: meAfrica, more: ["eg"] },
    { title: "The Americas", cards: americas, more: [] },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BackButton href="/" label="Back to rankings" />
        <BackButton href="/elections/all" label="All hubs A–Z" />
        <BackButton href="/leaders" label="World Leaders" />
        <BackButton href="/countries" label="Countries" />
        <BackButton href="/conflicts" label="Conflicts" />
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      {/* ---------- forecast previews: the permanent US & UK window + the rotating tracker ---------- */}
      {forecast ? (
        <section className="mb-8 grid gap-4">
          <Link
            href="/elections/forecast"
            className="block rounded-2xl border p-5 transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "#B4540A", backgroundColor: "rgba(217,119,6,0.04)" }}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-[var(--text)]">
                Forecasts <span className="text-sm font-normal" style={{ color: "#D97706" }}>· United States &amp; United Kingdom, always on</span>
              </h2>
              <span className="text-xs text-[var(--accent)]">Open the full forecast →</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-1 max-w-3xl">
              Whatever the next US and UK elections are, they live here permanently.
            </p>
            <details className="mb-4 max-w-3xl">
              <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">
                How this is measured
              </summary>
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                Seat ranges from thousands of simulations, updated weekly: ranges first, probabilities
                second, and labelled as speculation. Updated {forecast.built}.
              </div>
            </details>
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
                <h2 className="text-lg font-bold text-[var(--text)]">
                  Tracking now <span className="text-sm font-normal text-[var(--text-dim)]">· elections on the near horizon</span>
                </h2>
                <span className="text-xs text-[var(--accent)]">Full forecasts →</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-4 max-w-3xl">
                Every other race we currently forecast. Each preview retires from this window once
                its election has been run, and new races rotate in as their polling begins.
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
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Next to vote</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
          The twelve soonest contests in the atlas. Dates in white are officially set; the rest
          are the term running its course, and say so rather than inventing a day.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {countdown.map((r) => (
            <Link
              key={r.code}
              href={r.href}
              className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: r.overdue ? "#B4540A" : "var(--border)", backgroundColor: "var(--bg-card)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={flagUrlByCode(r.flag)} srcSet={flagSrcSetByCode(r.flag)} alt="" width={26} height={19} className="rounded-[2px] shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[var(--text)] truncate">{r.name}</span>
                <span className="block text-xs text-[var(--text-dim)] truncate">
                  {r.confidence === "confirmed" && r.date ? fullDate(r.date) : r.next}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums text-xs">
                {r.overdue ? (
                  <span className="font-semibold" style={{ color: "#D97706" }}>result due</span>
                ) : r.daysAway == null ? (
                  <span className="text-[var(--text-dim)]">no date</span>
                ) : (
                  <>
                    <span className={r.confidence === "confirmed" ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}>
                      {r.daysAway === 0 ? "today" : r.daysAway.toLocaleString("en-US")}
                    </span>
                    {r.daysAway === 0 ? null : <span className="block text-[10px] text-[var(--text-dim)]">days</span>}
                  </>
                )}
              </span>
            </Link>
          ))}
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-2">
          {confirmedCount} of the {allNext.length} hubs have an officially set date. The others show the
          term running out, which is what is actually known.
        </p>
      </section>
      {/* ---------- world map ---------- */}
      <section className="mb-10">
        <ElectionsWorldMap markers={markers} />
        <p className="text-xs text-[var(--text-muted)] mt-2">
          {markers.length} election hubs, {totalContests.toLocaleString("en-US")} contests.{" "}
          <span className="inline-flex items-center gap-1.5 ml-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#4ECDC4" }} /> competitive democracies
          </span>
          <span className="inline-flex items-center gap-1.5 ml-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#D97706" }} /> managed systems
          </span>
          <span className="ml-3 text-[var(--text-dim)]">Click any marker to open its hub.</span>
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        {top.map((c) => <HubCard key={c.hub} c={c} />)}
      </div>

      {/* Regions side by side: each region is a column with its hubs stacked,
          so every region is visible at once instead of section after section. */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-10 items-start">
        {regions.map((r) => (
          <section key={r.title}>
            <h2 className="text-xl font-bold mb-3 text-[var(--text)]">{r.title}</h2>
            <div className="grid gap-4">
              {r.cards.map((c) => <HubCard key={c.hub} c={c} />)}
            </div>
            {r.more.length ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">More hubs</span>
                {r.more.map((code) => {
                  const m = ELECTION_HUBS[code];
                  return (
                    <Link
                      key={code}
                      href={m.href}
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={flagUrlByCode(m.flag)}
                        srcSet={flagSrcSetByCode(m.flag)}
                        alt={`Flag of ${m.name}`}
                        width={16}
                        height={12}
                        className="rounded-[2px] border"
                        style={{ borderColor: "var(--border)" }}
                      />
                      {m.name} →
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      {/* ---------- every election ever ---------- */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Two centuries of ballots</h2>
        <p className="text-sm text-[var(--text-muted)] mb-1 max-w-3xl">
          Every one of the {totalContests.toLocaleString("en-US")} contests in the atlas on one
          timeline, newest first.
        </p>
        <details className="mb-4 max-w-3xl">
          <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">
            How to read it
          </summary>
          <div className="mt-2 text-sm text-[var(--text-muted)]">
            The postwar democratic wave, the cluster of 1989–91, the solid amber-and-red rows of
            the managed systems, and New Zealand&apos;s unbroken teal line back to 1853. Scroll
            right to travel back in time.
          </div>
        </details>
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
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">The world compared</h2>
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
      </section>

      <section className="mt-2 text-sm text-[var(--text-muted)]">
        <p>
          Related: <Link href="/uk-political-leadership" className="text-[var(--accent)] hover:underline">UK Political Leadership</Link>
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
      </section>
    </main>
  );
}
