import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { TableScroll } from "@/app/_shared/TableScroll";
import { SITE_NAME } from "@/lib/seo";
import { resolveTeamLink } from "@/lib/teamLinks";
import HeartbreakBoard, { type BoardRow } from "./HeartbreakBoard";

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
  group: string;
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
interface NationRow { nation: string; total: number; detail: { kind: string; comp?: string; since?: number; year?: number; points: number }[] }
interface ParadeRow { metro: string; last: number; years: number }
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
};

function teamHref(sport: string, name: string): string | undefined {
  const a = LINK_ARGS[sport];
  return a ? (resolveTeamLink(a[0], name, a[1])?.href ?? undefined) : undefined;
}

function longingText(c: ClubRow): string {
  if (!c.longing.length) return c.last_won ? `won ${c.last_won}` : "never won it";
  const l = c.longing[0];
  if (l.honour.startsWith("first ")) return `never won — est. ${l.since}`;
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

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-bold mb-1.5">{title}</h2>
      <p className="text-[14px] text-[var(--text-muted)] max-w-3xl">{sub}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 px-2 border-b" style={BORD}>{children}</th>;
}

export default function HeartbreakPage() {
  const data = loadHeartbreak();
  const board = data.clubs.filter((c) => c.total > 0).slice(0, 100);
  const boardRows: BoardRow[] = data.clubs.filter((c) => c.total > 0).map((c, i) => ({
    rank: i + 1,
    name: c.name,
    href: teamHref(c.sport, c.name),
    sport: c.sport,
    country: c.country,
    total: c.total,
    agony: c.agony,
    despair: c.despair,
    quadrant: c.quadrant,
    waiting: longingText(c),
    wound: woundText(c.wounds[0]),
  }));
  const nations = data.nations.slice(0, 25);
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
          healed only when avenged) and grind (playoff exile, losing seasons) — with hope making every
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
        { label: "Nations", href: "#nations" },
        { label: "Parade droughts", href: "#parade" },
        { label: "How it works", href: "#method" },
      ]} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-10">
        <Stat v={board[0]?.name ?? "–"} k="Most heartbroken" />
        <Stat v={String(data.clubs.length)} k="Clubs scored" />
        <Stat v={data.never_winners[0] ? `${data.never_winners[0].finals_lost} finals` : "–"} k={`Never won: ${data.never_winners[0]?.name ?? ""}`} />
        <Stat v={parade[0] ? `${parade[0].years}y` : "–"} k={`Longest parade drought: ${parade[0]?.metro ?? ""}`} />
      </div>

      <section id="board" className="mb-12 scroll-mt-24">
        <SectionHead
          title="The board"
          sub="Every professional club with a heartbreak score, worldwide, on one scale. Agony is hope crushed: longing plus unavenged wounds. Despair is hopelessness: playoff exile and losing streaks. Filter by sport, and within football by country — ranks stay global."
        />
        <HeartbreakBoard rows={boardRows} />
      </section>

      <section id="never" className="mb-12 scroll-mt-24">
        <SectionHead
          title="The never-winners"
          sub="Current US-major franchises still waiting for their first title, ranked by finals lost while waiting. No formula required; the table is the heartbreak."
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
          sub="Agony against Despair. The Tortured hope and lose; The Damned do both kinds of suffering; The Numb have stopped expecting; The Blessed would not know."
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

      <section id="nations" className="mb-12 scroll-mt-24">
        <SectionHead
          title="Nations"
          sub="National-team heartbreak across football, cricket, rugby and more: title droughts matured over a fan generation, plus finals lost weighted by how close they came — penalty shootouts hurt double."
        />
        <TableScroll className="rounded-xl border" style={CARD}>
          <table className="w-full text-[13px]" data-sticky-col="2">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
                <Th>#</Th>
                <Th>Nation</Th>
                <Th>Heartbreak</Th>
                <Th>Biggest source</Th>
              </tr>
            </thead>
            <tbody>
              {nations.map((n, i) => {
                const d = n.detail[0];
                const src = d
                  ? d.kind === "drought"
                    ? `${d.comp} drought since ${d.since}`
                    : `lost the ${d.comp} final ${d.year}`
                  : "–";
                return (
                  <tr key={n.nation}>
                    <td className="py-1.5 px-2 border-b text-[var(--text-dim)]" style={{ ...BORD, ...MONO }}>{i + 1}</td>
                    <td className="py-1.5 px-2 border-b font-medium" style={BORD}>{n.nation}</td>
                    <td className="py-1.5 px-2 border-b font-bold" style={{ ...BORD, ...MONO }}>{n.total.toFixed(1)}</td>
                    <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={BORD}>{src}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section id="parade" className="mb-12 scroll-mt-24">
        <SectionHead
          title="Parade droughts"
          sub="The one metro-level lens that survives: years since a metro last won anything at all in a top competition. More teams can only shorten this clock, never pad it."
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
                  <td className="py-1.5 px-2 border-b font-medium" style={BORD}>{p.metro}</td>
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
            major trophy drought — any real silverware stops it — with title and European Cup longing riding
            on top at half weight, scaled by whether the club can realistically win them in the modern era.
            For the US majors it is the title drought plus, at half weight, the wait for a finals
            appearance. All longing matures over a sixty-year fan generation, is discounted by dynasty
            pedigree and consolations, and fades when a club has not contended within living memory.
            <b> Wounds</b> are lost finals, near-misses, relegations (habituated for yo-yo clubs, refunded
            on an immediate bounce-back) and early playoff exits — each multiplied by the hope preceding
            it, decayed on a 25-year half-life, and healed to 15% once avenged. <b>Grind</b> is playoff
            exile and losing streaks.
          </p>
          <p className="mb-2">
            More rules keep it honest. <b>Afterglow</b>: a club that won its ultimate honour within
            the last five years is celebrating, not suffering — and for serial domestic champions the
            ultimate honour is the European one, which is why Benfica still qualify. <b>Local currency</b>:
            the four US majors weigh equally (to each fanbase, their league is the league), with a
            heartland bump pricing the Maple Leafs&rsquo; wait in Canadian terms. <b>Size of the fanbase</b>:
            US franchises scale by valuation percentile, football clubs by the weight of the trophy
            cabinet — the same drought is heavier at Goodison than at a club that never expected to win.
            <b> Relocation</b>: moved franchises inherit their pre-move history at 30%, with San Diego and
            Los Angeles ruled one Southern California market.
          </p>
          <p className="mb-2">
            Coverage is stated honestly: England and the four US majors run the full model including cups
            and second-tier pain; Scotland, Spain, Germany, Italy, France, the Netherlands and Portugal run
            leagues, relegations and European finals; everywhere else only droughts and known finals count
            for now. Every weight in the formula is a published constant in the dataset itself.
          </p>
          <p>
            This is a working preview of the model output. The curated agony layer — the blown leads and
            bracket-busters, scored in pangs — arrives in a later phase, calibrated so that Syracuse&rsquo;s
            1996 tournament run equals exactly 1.00 pang.
          </p>
        </div>
      </section>
    </main>
  );
}
