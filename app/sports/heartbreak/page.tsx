import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { TableScroll } from "@/app/_shared/TableScroll";
import { SITE_NAME } from "@/lib/seo";
import { resolveTeamLink } from "@/lib/teamLinks";
import { getAllNationalTeamSlugs } from "@/lib/international";
import { getAllCricketTeams } from "@/lib/cricket";
import { getAllRugbyTeams } from "@/lib/rugbyUnion";
import { getAllBasketballNations } from "@/lib/basketball";
import { getAllBaseballTeams } from "@/lib/baseball";
import { getWWCNations } from "@/lib/wnational";
import HeartbreakBoard, { type BoardRow } from "./HeartbreakBoard";

import { SectionHead } from "@/app/_shared/SectionHead";
const PAGE_PATH = "/sports/heartbreak";
const PAGE_TITLE = "The Heartbreak Index";
const PAGE_DESCRIPTION =
  "Which fanbases suffer most: droughts, relegations, lost finals and playoff exile, scored by one published formula across football, the US majors, college and nations.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_PATH,
    type: "website",
  },
  twitter: {
    images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const BORD = { borderColor: "var(--border)" } as const;

interface LongingLine {
  honour: string;
  since: number;
  points: number;
  discount?: number;
  maturity?: number;
  fade?: number;
  effective_years?: number;
}
interface Wound { kind: string; year: number; points: number; name?: string }
interface ClubRow {
  slug: string;
  name: string;
  sport: string;
  /** The engine's internal partition: football / us / gfl / college. */
  group: string;
  /** The reader-facing roll-up: American Football, Basketball, ... */
  sport_group?: string;
  country?: string;
  agony: number;
  despair: number;
  total: number;
  quadrant?: string;
  longing: LongingLine[];
  wounds: Wound[];
  wound_count: number;
  last_playoffs?: number | null;
  last_won?: number | null;
}
interface NeverRow {
  slug: string;
  name: string;
  league: string;
  finals_lost: number;
  conf_final_exits: number;
  last_playoffs: number | null;
  agony: number;
}
interface CollegeRow { name: string; since: number; years: number; points: number }
interface NationRow {
  nation: string;
  sport: string;
  total: number;
  /** Latest title in any competition this team's sport counts (the Euros count for the Netherlands). */
  last_won?: number | null;
  /** First appearance in any counted competition; the clock for a team that has never won. */
  first?: number | null;
  detail: { kind: string; comp?: string; since?: number; year?: number; never?: boolean; points: number }[];
}
interface ParadeRow { metro: string; slug?: string | null; last: number; years: number }
interface HeartbreakData {
  params: Record<string, unknown>;
  clubs: ClubRow[];
  never_winners: NeverRow[];
  college: Record<string, CollegeRow[]>;
  college_abdicated: Record<string, CollegeRow[]>;
  nations: NationRow[];
  parade_drought: ParadeRow[];
}

function loadHeartbreak(): HeartbreakData {
  const p = path.join(process.cwd(), "public", "data", "sports", "heartbreak.json");
  return JSON.parse(fs.readFileSync(p, "utf-8")) as HeartbreakData;
}

const WOUND_LABEL: Record<string, string> = {
  final_lost: "lost the final",
  conf_final_exit: "fell one round short",
  relegation_top: "relegated from the top flight",
  relegation_l2: "relegated from the second tier",
  playoff_final_lost: "lost the playoff final",
  runner_up: "league runner-up",
  fa_cup_final_lost: "lost the FA Cup final",
  league_cup_final_lost: "lost the League Cup final",
  major_cup_final_lost: "lost the national cup final",
  minor_cup_final_lost: "lost the league cup final",
  early_exit: "playoff run died early",
  "champions-league_final_lost": "lost the European Cup final",
  "europa-league_final_lost": "lost the Europa League final",
  "cup-winners-cup_final_lost": "lost the Cup Winners' Cup final",
  "inter-cities-fairs-cup_final_lost": "lost the Fairs Cup final",
  "conference-league_final_lost": "lost the Conference League final",
};

function woundText(w?: Wound): string {
  if (!w) return "–";
  if (w.kind === "agony_event" && w.name) return `${w.name} (${w.year})`;
  return `${WOUND_LABEL[w.kind] ?? w.kind} ${w.year}`;
}

// The board's sport labels -> resolveTeamLink(sport, name, leagueHint) inputs,
// reusing the sitewide resolver so every club links to its team page. NPB
// routes through the "Baseball" branch (MLB miss -> NPB fallback); clubs the
// resolver can't place simply render unlinked.
const LINK_ARGS: Record<string, [string, string]> = {
  NFL: ["NFL", "NFL"],
  NBA: ["NBA", "NBA"],
  MLB: ["MLB", "MLB"],
  NHL: ["NHL", "NHL"],
  Football: ["Football", ""],
  CFL: ["Canadian Football", "CFL"],
  AFL: ["AFL", "AFL"],
  NRL: ["NRL", "NRL"],
  NPB: ["Baseball", ""],
  CFB: ["CFB", "CFB"],
  CBB: ["Basketball", "CBB"],
  IPL: ["T20 Cricket", "IPL"],
};

function teamHref(sport: string, name: string): string | undefined {
  const a = LINK_ARGS[sport];
  return a ? (resolveTeamLink(a[0], name, a[1])?.href ?? undefined) : undefined;
}

const NATIONS_GROUP = "National teams";

/**
 * A national team's page, per sport. The engine names football nations from
 * the appearances slug (`slug.replace("-", " ").title()`), so the slug is
 * recoverable and checked against the index before it is linked; every other
 * sport is keyed by the display name in the ledger the engine read, so the
 * same file gives the slug. A team with no page (a Euros-only women's side,
 * a cricket XI) keeps its name and no link, the club rule.
 */
async function nationHrefResolver(): Promise<(sport: string, name: string) => string | undefined> {
  const football = new Set(getAllNationalTeamSlugs());
  const byName = (rows: { name: string; slug: string }[]) => new Map(rows.map((r) => [r.name, r.slug]));
  const [cricket, rugby, basketball] = await Promise.all([
    getAllCricketTeams(), getAllRugbyTeams(), getAllBasketballNations(),
  ]);
  const maps: Record<string, [Map<string, string>, string]> = {
    Cricket: [byName(cricket), "/teams/cricket/"],
    Rugby: [byName(rugby), "/teams/rugby-union/"],
    Basketball: [byName(basketball), "/teams/basketball/"],
    Baseball: [byName(getAllBaseballTeams()), "/teams/baseball/"],
    "Women's football": [byName(getWWCNations()), "/teams/national/womens-world-cup/"],
  };
  return (sport, name) => {
    if (sport === "Football") {
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      return football.has(slug) ? `/teams/national/${slug}` : undefined;
    }
    const m = maps[sport];
    const slug = m?.[0].get(name);
    return m && slug ? `${m[1]}${slug}` : undefined;
  };
}

function longingText(c: ClubRow): string {
  if (!c.longing.length) return c.last_won ? `won ${c.last_won}` : "never won it";
  const l = c.longing[0];
  if (l.honour.startsWith("first ")) return `never won, est. ${l.since}`;
  const honour = l.honour === "league" ? "league title" : l.honour === "champions-league" ? "European Cup" : l.honour;
  return `${honour} ${l.since}`;
}

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 min-w-0" style={CARD}>
      <div className="text-[20px] font-extrabold" style={MONO}>{v}</div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-muted)]">{k}</div>
    </div>
  );
}


function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 px-2 border-b" style={BORD}>{children}</th>;
}

export default async function HeartbreakPage() {
  const data = loadHeartbreak();
  const nationHref = await nationHrefResolver();
  // The QUADRANT cards below still take the scoring clubs only — a quadrant is
  // a shape of suffering and a club with none has no place in one. The BOARD
  // takes everything, including the 0.0s. See the note in HeartbreakBoard.
  const board = data.clubs.filter((c) => c.total > 0).slice(0, 100);
  // Clubs and nations on ONE board, one global rank (Ashwin, 2026-09-07: a
  // separate nations table hid that England's wait sits between the Maple
  // Leafs and the rest). A nation row is one national TEAM, a nation in one
  // sport; its worst drought and worst final stand in for the club columns.
  const clubRows: BoardRow[] = data.clubs.map((c) => ({
    rank: 0,
    kind: "club",
    name: c.name,
    href: teamHref(c.sport, c.name),
    sport: c.sport,
    sportGroup: c.sport_group ?? c.sport,
    country: c.country,
    total: c.total,
    agony: c.agony,
    despair: c.despair,
    quadrant: c.quadrant,
    waiting: longingText(c),
    wound: woundText(c.wounds[0]),
  }));
  const nationRows: BoardRow[] = data.nations.map((n) => {
    // One row per national TEAM: the engine keys nations by sport, so England
    // arrives three times, and each row carries its own wait.
    const sports = [n.sport];
    const drought = n.detail.filter((d) => d.kind === "drought").sort((a, b) => b.points - a.points)[0];
    const final = n.detail.filter((d) => d.kind === "final_lost").sort((a, b) => b.points - a.points)[0];
    return {
      rank: 0,
      kind: "nation",
      name: n.nation,
      href: nationHref(n.sport, n.nation),
      sport: n.sport,
      sportGroup: NATIONS_GROUP,
      nationSports: sports,
      country: n.nation,
      total: n.total,
      agony: null,
      despair: null,
      quadrant: undefined,
      // One rule for every team (Ashwin, 2026-09-07): the wait runs from the last
      // trophy in ANY competition the sport counts, and a team that has never
      // won waits from its first entry. The Netherlands wait since the 1988
      // Euros, not "never" because the World Cup is still unwon.
      waiting: n.last_won
        ? `last trophy ${n.last_won}`
        : n.first
          ? `never won, entered ${n.first}`
          : drought
            ? `${drought.comp} since ${drought.since}`
            : "\u2013",
      wound: final ? `lost the ${final.comp} final ${final.year}` : "\u2013",
    };
  });
  const boardRows: BoardRow[] = [...clubRows, ...nationRows]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const parade = data.parade_drought.slice(0, 30);
  const quadrants: Record<string, ClubRow[]> = {};
  for (const c of board) {
    const q = c.quadrant ?? "";
    if (!q) continue;
    (quadrants[q] = quadrants[q] ?? []).push(c);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>The Heartbreak Index</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">💔 The Heartbreak Index</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          Which fanbases actually suffer most. One published formula scores every club&rsquo;s longing
          (droughts, matured over a fan generation), wounds (lost finals, relegations, blown near-misses,
          healed only when avenged) and grind (playoff exile, losing seasons), with hope making every
          wound worse, and consolations, dynasties and faded aspirations making them bearable.
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          model v3 preview · {data.clubs.length} clubs scored · {data.never_winners.length} never-winners ·{" "}
          {data.nations.length} nations · site data through the 2025-26 season
        </div>
      </header>

      <HubNav items={[
        { label: "The board", href: "#board" },
        { label: "Never winners", href: "#never" },
        { label: "Quadrants", href: "#quadrants" },
        { label: "Parade droughts", href: "#parade" },
        { label: "How it works", href: "#method" },
      ]} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-10">
        <Stat v={board[0]?.name ?? "–"} k="Most heartbroken" />
        <Stat
          v={boardRows.length.toLocaleString("en-GB")}
          k={`Teams scored: ${data.clubs.length.toLocaleString("en-GB")} clubs, ${data.nations.length} national`}
        />
        <Stat v={data.never_winners[0] ? `${data.never_winners[0].finals_lost} finals` : "–"} k={`Never won: ${data.never_winners[0]?.name ?? ""}`} />
        <Stat v={parade[0] ? `${parade[0].years}y` : "–"} k={`Longest parade drought: ${parade[0]?.metro ?? ""}`} />
      </div>

      <section id="board" className="mb-12 scroll-mt-24">
        <SectionHead
          title="The board"
          sub="Every professional club and national team with a heartbreak score, on one global scale."
          more="Agony is hope crushed: longing plus unavenged wounds. Despair is hopelessness: playoff exile and losing streaks. Each national team is scored on its own, England the footballers apart from England the cricketers, and carries a drought and a lost final in place of the club columns. Filter by sport, within football by country, and within national teams by sport; ranks stay global."
        />
        <HeartbreakBoard rows={boardRows} />
      </section>

      <section id="never" className="mb-12 scroll-mt-24">
        <SectionHead
          title="The never-winners"
          sub="Current US-major franchises still waiting for their first title."
          more="Ranked by finals lost while waiting. No formula required: the table is the heartbreak."
        />
        <TableScroll className="rounded-xl border" style={CARD}>
          <table className="w-full text-[13px]" data-sticky-col="2">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
                <Th>#</Th>
                <Th>Franchise</Th>
                <Th>Finals lost</Th>
                <Th>One round short</Th>
                <Th>Last playoffs</Th>
                <Th>League</Th>
              </tr>
            </thead>
            <tbody>
              {data.never_winners.slice(0, 30).map((n, i) => (
                <tr key={`${n.league}-${n.slug}`}>
                  <td className="py-1.5 px-2 border-b text-[var(--text-dim)]" style={{ ...BORD, ...MONO }}>{i + 1}</td>
                  <td className="py-1.5 px-2 border-b font-medium" style={BORD}>
                    {(() => {
                      const h = teamHref(n.league, n.name);
                      return h ? <Link href={h} className="hover:underline">{n.name}</Link> : n.name;
                    })()}
                  </td>
                  <td className="py-1.5 px-2 border-b font-bold" style={{ ...BORD, ...MONO }}>{n.finals_lost}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ ...BORD, ...MONO }}>{n.conf_final_exits}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ ...BORD, ...MONO }}>{n.last_playoffs ?? "never"}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={BORD}>{n.league}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section id="quadrants" className="mb-12 scroll-mt-24">
        <SectionHead
          title="The four quadrants"
          sub="Agony against Despair, the two axes of suffering."
          more="The Tortured hope and lose. The Damned do both kinds of suffering. The Numb have stopped expecting. The Blessed would not know."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["The Tortured", "The Damned", "The Numb", "The Blessed"] as const).map((q) => (
            <div key={q} className="rounded-xl border p-4 min-w-0" style={CARD}>
              <div className="text-sm font-semibold mb-2">{q}</div>
              <div className="text-[13px] text-[var(--text-muted)]">
                {(quadrants[q] ?? []).slice(0, 8).map((c) => c.name).join(" · ") || "–"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="parade" className="mb-12 scroll-mt-24">
        <SectionHead
          title="Parade droughts"
          sub="Years since a metro last won anything, in a top competition."
          more="The one metro-level lens that survives. More teams can only shorten this clock, never pad it."
        />
        <TableScroll className="rounded-xl border" style={CARD}>
          <table className="w-full text-[13px]" data-sticky-col="2">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
                <Th>#</Th>
                <Th>Metro</Th>
                <Th>Years waiting</Th>
                <Th>Last parade</Th>
              </tr>
            </thead>
            <tbody>
              {parade.map((p, i) => (
                <tr key={p.metro}>
                  <td className="py-1.5 px-2 border-b text-[var(--text-dim)]" style={{ ...BORD, ...MONO }}>{i + 1}</td>
                  <td className="py-1.5 px-2 border-b font-medium" style={BORD}>
                    {p.slug ? (
                      <Link href={`/rankings/${p.slug}`} className="hover:underline">{p.metro}</Link>
                    ) : p.metro}
                  </td>
                  <td className="py-1.5 px-2 border-b font-bold" style={{ ...BORD, ...MONO }}>{p.years}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ ...BORD, ...MONO }}>{p.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section id="method" className="scroll-mt-24">
        <div className="rounded-2xl border p-5 text-[13.5px] text-[var(--text-muted)]" style={CARD}>
          <h3 className="text-sm font-semibold text-[var(--text)] mb-2">How this board works</h3>
          <p className="mb-2">
            Heartbreak = longing + wounds + grind. <b>Longing</b>: for football the headline clock is the
            major trophy drought, any real silverware stops it, with title and European Cup longing riding
            on top at half weight, scaled by whether the club can realistically win them in the modern era.
            For the US majors it is the title drought plus, at half weight, the wait for a finals
            appearance. All longing matures over a sixty-year fan generation, is discounted by dynasty
            pedigree and consolations, and fades when a club has not contended within living memory.
            <b> Wounds</b> are lost finals, near-misses, relegations (habituated for yo-yo clubs, refunded
            on an immediate bounce-back) and early playoff exits, each multiplied by the hope preceding
            it, decayed on a 25-year half-life, and healed to 15% once avenged. A runner-up season behind
            a hegemon (a champion holding five of the last eight titles) counts at 35%: second to PSG or
            Bayern is the ceiling, not a race lost. <b>Grind</b> is playoff
            exile and losing streaks.
          </p>
          <p className="mb-2">
            More rules keep it honest. <b>Afterglow</b>: a club that won its ultimate honour within
            the last five years is celebrating, not suffering, and for serial domestic champions the
            ultimate honour is the European one, which is why Benfica still qualify. <b>Local currency</b>:
            the four US majors weigh equally (to each fanbase, their league is the league), with a
            heartland bump pricing the Maple Leafs&rsquo; wait in Canadian terms. <b>Size of the fanbase</b>:
            US franchises scale by valuation percentile, football clubs by the weight of the trophy
            cabinet: the same drought is heavier at Goodison than at a club that never expected to win.
            <b> Bigness now</b>: football clubs also scale by present stature, from 0.7 to 1.5 times, read from
            European presence over the last ten seasons, Europe-wide squad value where a club is priced, and
            the ground a club can fill,
            so Benfica losing the finals it reaches outweighs a club that no longer competes for the big
            trophies, and Arsenal&rsquo;s 2004 to 2025 wait counted for more than a century at Genoa.
            <b> Relocation</b>: moved franchises inherit their pre-move history at 30%, with San Diego and
            Los Angeles ruled one Southern California market. <b>Living memory</b>: a football trophy clock
            stops growing at forty years, so a century at a small club does not outweigh a generation at a big
            one. <b>Relevance</b>: a college program scales, from 0.4 to 1.3 times, by how often it has made the
            tournament and won its conference in the last 25 seasons, so two lost finals in the 1940s do not
            keep Dartmouth beside Purdue.
          </p>
          <p className="mb-2">
            Coverage is stated honestly: England and the four US majors run the full model including cups
            and second-tier pain; Scotland, Spain, Germany, Italy, France, the Netherlands and Portugal run
            leagues, relegations and European finals; everywhere else only droughts and known finals count
            for now. Every weight in the formula is a published constant in the dataset itself.
          </p>
          <p className="mb-2">
            National teams sit on the same board, one row per team and sport, so England&rsquo;s footballers
            and cricketers wait separately, and every team the site holds a ledger for is scored, not only
            past winners: Wales and France in rugby, France in basketball, Puerto Rico at the Classic,
            England and Italy in the women&rsquo;s game. Each sport&rsquo;s ultimate honour weighs like the World
            Cup, its lost finals with it. The wait shown runs from the last trophy in any competition the
            sport counts, or from first entry for a team that has never won. Football counts the World Cup and the continental championship
            (Euros, Copa América, and where the ledger reaches, AFCON, the Asian Cup and the Gold Cup); a nation
            that has never won waits from its first appearance, faded like a club that has not been near the
            semi-finals. A continental title consoles the World Cup wait rather than ending it, which is why
            Uruguay&rsquo;s six Copas since 1950 keep it well down the board. Cricket counts both World Cups as
            peers: a title in either restarts both clocks, and the Champions Trophy and the World Test
            Championship console. Rugby counts the World Cup, consoled lightly by Six Nations and Rugby
            Championship titles and scaled by how much a nation has invested in the game (caps played, peak
            ranking), which is how France and Wales sit above Argentina; basketball counts Olympic gold and
            the World Cup as peers; women&rsquo;s football counts the World Cup and the Euros, with Olympic
            gold as consolation, priced at half for the depth of the field. <b>Hegemon</b>: where one nation has
            won most of the last eight editions and is still winning (the US men at the Olympics), everyone
            else&rsquo;s wait and lost finals in that competition count at 35%: second to a dynasty is the
            ceiling, not heartbreak. Champions stay on the board at the bottom rather than vanishing. Scarcity: a nation plays for its title once in four years, not every season,
            so each drought and each lost final carries a small cadence premium (four-year tournaments 1.04
            times, two-year ones 1.02), calibrated so England&rsquo;s wait sits beside Toronto&rsquo;s. Healing: a
            title in the same sport at equal or higher standing restarts every drought clock in that sport and
            mostly closes the earlier lost finals, so France&rsquo;s 2018 World Cup ended its European
            Championship wait and avenged 2006, while the 2022 final still stands. Semi-final exits are not yet
            priced for cricket, so South Africa reads lighter than its reputation until that ledger exists.
          </p>
          <p>
            This is a working preview of the model output. The curated agony layer, the blown leads and
            bracket-busters, scored in pangs, arrives in a later phase, calibrated so that Syracuse&rsquo;s
            1996 tournament run equals exactly 1.00 pang.
          </p>
        </div>
      </section>
    </main>
  );
}
