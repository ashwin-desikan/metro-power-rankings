import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getGolfMajors, latestByTournament, nationSlug, golfMajorMonths, type Champion, type Leader } from "@/lib/majors";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import GolfChampionsTable, { type GolfRow } from "./GolfChampionsTable";
import { CappedList } from "@/app/_shared/Disclosure";
import { SportBadge } from "@/app/teams/_shared/SportIcon";

export const dynamicParams = false;
const PATH = "/teams/golf";
const TITLE = "Golf's Majors";
const DESC =
  "Every men's major champion at The Open, U.S. Open, PGA Championship, and the Masters, read greatness-first: the all-time leaders, the reigning champions, one filterable ledger of every winner, plus the Ryder Cup and the metros that host them.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

const TOUR_META: Record<string, { id: string; short: string }> = {
  "The Open Championship": { id: "the-open", short: "The Open" },
  "U.S. Open": { id: "us-open", short: "U.S. Open" },
  "PGA Championship": { id: "pga", short: "PGA" },
  "Masters Tournament": { id: "masters", short: "Masters" },
};

// Former states folded into the modern country for the by-nation tally, matching
// the site's flag convention. Golf keeps the home nations (Scotland, England,
// Wales, Northern Ireland) separate by tradition; only true duplicates merge.
const NATION_CANON: Record<string, string> = {
  "West Germany": "Germany",
  "Republic of Ireland": "Ireland",
};
const canonNation = (n: string) => NATION_CANON[n] ?? n;

function Flag({ nation }: { nation: string | null }) {
  const url = flagCdnUrl(nationSlug(nation) ?? "");
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" loading="lazy" decoding="async" />;
}

function MetroCell({ c }: { c: Champion }) {
  if (!c.metroSlug) return <span className="text-[var(--text-dim)]">{c.venue ?? "—"}</span>;
  return (
    <Link href={`/rankings/${c.metroSlug}#sports`} className="hover:text-[var(--accent)]">
      {c.venue ? `${c.venue}, ` : ""}{c.metroName}
    </Link>
  );
}

// Fallback month each major was played, used only when the real date is not in
// champions-history.json. The PGA closed the season (roughly August) through
// 2018 and moved to May in 2019; it opened the 1971 season in February. The
// others have held their slots: Masters in April, U.S. Open in June, The Open in July.
function majorMonth(tournament: string, year: number): number {
  switch (tournament) {
    case "Masters Tournament": return 4;
    case "U.S. Open": return 6;
    case "The Open Championship": return 7;
    case "PGA Championship": return year >= 2019 ? 5 : year === 1971 ? 2 : 8;
    default: return 0;
  }
}

// First and last major-winning year per player, from the champions list.
function majorSpans(champions: Champion[]): Map<string, { first: number; last: number }> {
  const m = new Map<string, { first: number; last: number }>();
  for (const c of champions) {
    const e = m.get(c.champion);
    if (!e) m.set(c.champion, { first: c.year, last: c.year });
    else { e.first = Math.min(e.first, c.year); e.last = Math.max(e.last, c.year); }
  }
  return m;
}

function LeaderTable({ leaders, tours, spans }: { leaders: Leader[]; tours: string[]; spans: Map<string, { first: number; last: number }> }) {
  const filtered = leaders.filter((l) => l.total >= 2);
  return (
    <div>
      {/* Mobile: one card per player instead of a table that grows a column
          per major (up to 7 columns) and forces sideways scrolling. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[520px] overflow-y-auto">
        <CappedList
          initial={12}
          noun="players"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={filtered.map((l) => {
          const s = spans.get(l.player);
          const span = s ? (s.first === s.last ? `${s.first}` : `${s.first}–${s.last}`) : "";
          return (
            <div key={`${l.player}-card`} className="rounded-lg border p-3" style={card}>
              <div className="flex items-start justify-between gap-2">
                <div className="leading-tight font-medium text-sm flex items-center gap-1.5 flex-wrap">
                  <Flag nation={l.nation} />
                  <span>{l.player}</span>
                </div>
                <span className="flex-shrink-0 text-sm tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{l.total}</span>
              </div>
              <div className="text-[11px] text-[var(--text-dim)] mb-2">Span {span}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {tours.map((t) => (
                  <div key={t}>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{TOUR_META[t]?.short ?? t}</div>
                    <div className="tabular-nums text-[var(--text-muted)]" style={mono}>{l.byTour[t] ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto max-h-[520px] overflow-y-auto hidden sm:block" style={card}>
        <table className="w-full text-sm min-w-[700px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">Player</th>
              <th className="py-2 px-3 text-right font-medium">Span</th>
              <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Majors</th>
              {tours.map((t) => <th key={t} className="py-2 px-3 text-right font-medium">{TOUR_META[t]?.short ?? t}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const s = spans.get(l.player);
              const span = s ? (s.first === s.last ? `${s.first}` : `${s.first}–${s.last}`) : "";
              return (
                <tr key={l.player} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium"><Flag nation={l.nation} />{l.player}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{span}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{l.total}</td>
                  {tours.map((t) => <td key={t} className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{l.byTour[t] ?? ""}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GolfHubPage() {
  const data = getGolfMajors();
  if (!data) return null;
  const latest = latestByTournament(data.champions);
  const ryderTally = data.ryderTally;
  const months = golfMajorMonths(); // real month per (year, major) from the championship record

  // By-nation, consolidated: true duplicates fold into the modern country.
  const nationMap = new Map<string, { nation: string; titles: number }>();
  for (const n of data.byNation) {
    const key = canonNation(n.nation);
    const e = nationMap.get(key) ?? { nation: key, titles: 0 };
    e.titles += n.titles; nationMap.set(key, e);
  }
  const nations = [...nationMap.values()].sort((a, b) => b.titles - a.titles);

  // One combined, filterable ledger: one row per champion, flags precomputed
  // here so the client table stays server-only-free.
  const editions: GolfRow[] = data.champions.map((c) => {
    const slug = nationSlug(c.nation);
    return {
      year: c.year,
      tournament: c.tournament,
      seasonMonth: months[`${c.year}|${c.tournament}`] ?? majorMonth(c.tournament, c.year),
      champion: c.champion,
      flagUrl: (slug ? flagCdnUrl(slug) : "") || null,
      nation: c.nation,
      dual: c.note === "dual",
      venue: c.venue ?? null,
      metroSlug: c.metroSlug ?? null,
      metroName: c.metroName ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <span>Golf</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <SportBadge sport="golf" />
          <h1 className="text-3xl font-semibold tracking-tight">Golf&apos;s Majors</h1>
        </div>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The four men&apos;s majors since 1860, read through the lens this project cares about:
          the all-time leaders, the reigning champions, and one filterable ledger of every winner,
          each linked to the metro that staged it.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Reigning champions", href: "#now" },
          { label: "All champions", href: "#champions" },
          { label: "All-time leaders", href: "#leaders" },
          { label: "By nation", href: "#by-nation" },
          { label: "Ryder Cup", href: "#ryder-cup" },
          { label: "Venues & metros", href: "#venues" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* reigning champions */}
      <section id="now" className="mb-12">
        <h2 className="text-lg font-semibold mb-3">Reigning champions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.tournaments.map((t) => {
            const c = latest.get(t);
            if (!c) return null;
            return (
              <div key={t} className="rounded-xl border p-4" style={card}>
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{TOUR_META[t]?.short ?? t} · {c.year}</div>
                <div className="mt-1 font-semibold"><Flag nation={c.nation} />{c.champion}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]"><MetroCell c={c} /></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* one combined, filterable champions ledger */}
      <section className="mb-12">
        <h2 id="champions" className="text-lg font-semibold mb-1">Every major champion</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          All four majors in one ledger, most recent first. Filter by major or year.
        </p>
        <GolfChampionsTable rows={editions} tournaments={data.tournaments} />
      </section>

      {/* all-time leaders (the summit) */}
      <section className="mb-12">
        <h2 id="leaders" className="text-lg font-semibold mb-1">All-time leaders</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Players with two or more majors, by total, with the span of their major wins.</p>
        <LeaderTable leaders={data.leaders} tours={data.tournaments} spans={majorSpans(data.champions)} />
      </section>

      {/* by nation */}
      <section className="mb-12">
        <h2 id="by-nation" className="text-lg font-semibold mb-1">By nation</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Men&apos;s majors by country, true duplicates folded into the modern nation.</p>

        {/* Mobile: stacked rows in card form. Only two columns, but the
            mandate is no exceptions — every table gets a true card view. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[440px] overflow-y-auto">
          <CappedList
            initial={12}
            noun="nations"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={nations.map((n) => (
            <div key={`${n.nation}-card`} className="rounded-lg border px-3 py-2 flex items-center justify-between gap-2" style={card}>
              <div className="text-sm flex items-center gap-1.5 flex-wrap">
                <Flag nation={n.nation} />
                <span>{n.nation}</span>
              </div>
              <span className="flex-shrink-0 text-sm tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{n.titles}</span>
            </div>
          ))}
          />
        </div>

        <div className="rounded-xl border overflow-x-auto max-h-[440px] overflow-y-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[320px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Majors</th>
              </tr>
            </thead>
            <tbody>
              {nations.map((n) => (
                <tr key={n.nation} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3"><Flag nation={n.nation} />{n.nation}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{n.titles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ryder Cup */}
      <section className="mb-12">
        <h2 id="ryder-cup" className="text-lg font-semibold mb-1">Ryder Cup</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3" style={mono}>
          United States {ryderTally["United States"] ?? 0} · Europe {ryderTally["Europe"] ?? 0} · Great Britain {ryderTally["Great Britain"] ?? 0} · Tied {ryderTally["Tied"] ?? 0}
        </p>
        {/* Mobile: one card per edition instead of a 4-column table. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[460px] overflow-y-auto">
          <CappedList
            initial={12}
            noun="Ryder Cups"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={data.ryder.map((r) => (
            <div key={`${r.edition}-card`} className="rounded-lg border p-3" style={card}>
              <div className="flex items-start justify-between gap-2">
                <div className="leading-tight font-medium text-sm">{r.winner}</div>
                <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]" style={mono}>{r.year}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mt-1.5">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Score</div>
                  <div className="tabular-nums text-[var(--text-muted)]" style={mono}>{r.score}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Host venue &amp; metro</div>
                  <div className="text-[var(--text-muted)]">
                    {r.metroSlug
                      ? <Link href={`/rankings/${r.metroSlug}#sports`} className="hover:text-[var(--accent)]">{r.venue}, {r.metroName}</Link>
                      : <span>{r.venue}, {r.host}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
          />
        </div>

        <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[680px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Winner</th>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Host venue &amp; metro</th>
              </tr>
            </thead>
            <tbody>
              {data.ryder.map((r) => (
                <tr key={r.edition} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{r.year}</td>
                  <td className="py-1.5 px-3 font-medium">{r.winner}</td>
                  <td className="py-1.5 px-3 tabular-nums text-[var(--text-muted)]" style={mono}>{r.score}</td>
                  <td className="py-1.5 px-3 text-[var(--text-muted)]">
                    {r.metroSlug
                      ? <Link href={`/rankings/${r.metroSlug}#sports`} className="hover:text-[var(--accent)]">{r.venue}, {r.metroName}</Link>
                      : <span>{r.venue}, {r.host}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* venues & metros */}
      <section className="mb-12">
        <h2 id="venues" className="text-lg font-semibold mb-1">Venues &amp; metros</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Metros that have hosted a men&apos;s major, by number of majors staged. Each links to its page.
        </p>
        <div className="flex flex-wrap gap-2">
          {data.hostMetros.map((m) => (
            <Link key={m.metroSlug} href={`/rankings/${m.metroSlug}#sports`} className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:text-[var(--text)] hover:border-[var(--text-dim)]"
              style={{ background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
              {m.metroName} <span style={mono} className="text-[var(--text-dim)]">{m.count}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* methodology */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          Champions cover The Open Championship from 1860, the U.S. Open from 1895, the
          PGA Championship from 1916 and the Masters from 1934, through the current
          season. Career totals use the running count of professional majors. Players
          marked with an asterisk held dual nationality; the primary nation is shown.
          Within a year the ledger orders the majors by the actual date each was played,
          newest first, so the PGA Championship closes the season through 2018 and sits in
          May from 2019. In the by-nation tally, West Germany is
          folded into Germany; the home nations of Scotland, England, Wales, and Northern
          Ireland are kept separate by tradition. This hub tracks the men&apos;s majors
          only; an LPGA and women&apos;s-majors layer is a known gap. Host metros are
          joined to each champion through the venue that staged the event.
        </p>
      </section>
    </main>
  );
}
