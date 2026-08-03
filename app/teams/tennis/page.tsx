import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getTennisMajors, nationSlug, type Champion, type Leader } from "@/lib/majors";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import TennisChampionsTable, { type EditionRow, type ChampCell } from "./TennisChampionsTable";

export const dynamicParams = false;
const PATH = "/teams/tennis";
const TITLE = "Tennis's Grand Slams";
const DESC =
  "Every men's and women's singles Grand Slam champion at the Australian Open, French Open, Wimbledon, and US Open, plus the Davis Cup, the all-time leaders, and the metros that host them.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

const TOUR_META: Record<string, { id: string; short: string }> = {
  "Australian Open": { id: "australian", short: "Australian Open" },
  "French Open": { id: "french", short: "French Open" },
  "Wimbledon": { id: "wimbledon", short: "Wimbledon" },
  "US Open": { id: "us-open", short: "US Open" },
};

// Historical states folded into their modern successor for the by-nation tally,
// matching the site's flag convention (nationSlug in lib/majors). Individual
// champions keep their era name and flag; only the aggregate is consolidated.
const NATION_CANON: Record<string, string> = {
  "West Germany": "Germany",
  "Weimar Republic": "Germany",
  "Czechoslovakia": "Czech Republic",
  "Socialist Federal Republic of Yugoslavia": "Serbia",
  "Federal Republic of Yugoslavia": "Serbia",
  "United Kingdom of Great Britain and Ireland": "United Kingdom",
  "Soviet Union": "Russia",
};
const canonNation = (n: string) => NATION_CANON[n] ?? n;

function Flag({ nation }: { nation: string | null }) {
  const url = flagCdnUrl(nationSlug(nation) ?? "");
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" loading="lazy" decoding="async" />;
}

function Champ({ c }: { c?: Champion }) {
  if (!c) return <span className="text-[var(--text-dim)]">—</span>;
  return <span><Flag nation={c.nation} />{c.champion}{c.note === "neutral" ? " †" : ""}</span>;
}

function MetroCell({ c }: { c?: Champion }) {
  if (!c || !c.metroSlug) return <span className="text-[var(--text-dim)]">—</span>;
  return <Link href={`/rankings/${c.metroSlug}#sports`} className="hover:text-[var(--accent)]">{c.metroName}</Link>;
}

// First and last Grand Slam-winning year per player, from the champions list.
function slamSpans(champions: Champion[], gender: "M" | "W"): Map<string, { first: number; last: number }> {
  const m = new Map<string, { first: number; last: number }>();
  for (const c of champions) {
    if (c.gender !== gender) continue;
    const e = m.get(c.champion);
    if (!e) m.set(c.champion, { first: c.year, last: c.year });
    else { e.first = Math.min(e.first, c.year); e.last = Math.max(e.last, c.year); }
  }
  return m;
}

function LeaderTable({ leaders, tours, spans }: { leaders: Leader[]; tours: string[]; spans: Map<string, { first: number; last: number }> }) {
  const rows = leaders.filter((l) => l.total >= 3);
  return (
    <>
      {/* Mobile: one card per player instead of a table with a column per
          major that forces sideways scrolling. Same filtered `rows` array
          as the desktop table below. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {rows.map((l) => {
          const s = spans.get(l.player);
          const span = s ? (s.first === s.last ? `${s.first}` : `${s.first}–${s.last}`) : "";
          return (
            <div key={l.player} className="rounded-lg border p-3" style={card}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <Flag nation={l.nation} />{l.player}
                </div>
                <span className="flex-shrink-0 text-sm font-semibold tabular-nums" style={{ ...mono, color: GOLD }}>{l.total}</span>
              </div>
              <div className="text-[11px] text-[var(--text-dim)] mb-2 tabular-nums" style={mono}>{span}</div>
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
      </div>

      <div className="rounded-xl border overflow-x-auto max-h-[480px] overflow-y-auto hidden sm:block" style={card}>
        <table className="w-full text-sm min-w-[680px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">Player</th>
              <th className="py-2 px-3 text-right font-medium">Span</th>
              <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Slams</th>
              {tours.map((t) => <th key={t} className="py-2 px-3 text-right font-medium">{TOUR_META[t]?.short ?? t}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
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
    </>
  );
}

export default function TennisHubPage() {
  const data = getTennisMajors();
  if (!data) return null;

  // By-nation, consolidated: former states fold into the modern country.
  const nationMap = new Map<string, { nation: string; men: number; women: number }>();
  const bump = (raw: string, men: number, women: number) => {
    const key = canonNation(raw);
    const e = nationMap.get(key) ?? { nation: key, men: 0, women: 0 };
    e.men += men; e.women += women; nationMap.set(key, e);
  };
  for (const n of data.byNationMen) bump(n.nation, n.titles, 0);
  for (const n of data.byNationWomen) bump(n.nation, 0, n.titles);
  const nations = [...nationMap.values()].sort((a, b) => (b.men + b.women) - (a.men + a.women));

  const latestOf = (t: string, g: "M" | "W") =>
    data.champions.filter((c) => c.tournament === t && c.gender === g).sort((a, b) => b.year - a.year)[0];

  // One combined, filterable ledger: pivot champions into per-edition rows,
  // flags precomputed here so the client table stays server-only-free.
  const edMap = new Map<string, EditionRow>();
  for (const c of data.champions) {
    const key = `${c.year}|${c.tournament}`;
    let e = edMap.get(key);
    if (!e) { e = { year: c.year, tournament: c.tournament, men: null, women: null, metroSlug: null, metroName: null }; edMap.set(key, e); }
    const slug = nationSlug(c.nation);
    const cell: ChampCell = { name: c.champion, flagUrl: (slug ? flagCdnUrl(slug) : "") || null, neutral: c.note === "neutral" };
    if (c.gender === "W") e.women = cell; else e.men = cell;
    if (!e.metroSlug && c.metroSlug) { e.metroSlug = c.metroSlug; e.metroName = c.metroName ?? null; }
  }
  const editions = [...edMap.values()];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <span>Tennis</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Tennis&apos;s Grand Slams</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The sport measured by its summit: the all-time Grand Slam leaders, the reigning champions
          of the four majors, and one filterable ledger of every men&apos;s and women&apos;s singles
          champion since 1877. Each title links to the metro that staged it.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Reigning champions", href: "#now" },
          { label: "All champions", href: "#champions" },
          { label: "Men's leaders", href: "#leaders-men" },
          { label: "Women's leaders", href: "#leaders-women" },
          { label: "By nation", href: "#by-nation" },
          { label: "Davis Cup", href: "#davis-cup" },
          { label: "Venues & metros", href: "#venues" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* reigning champions */}
      <section id="now" className="mb-12">
        <h2 className="text-lg font-semibold mb-3">Reigning champions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.tournaments.map((t) => {
            const m = latestOf(t, "M"); const w = latestOf(t, "W");
            return (
              <div key={t} className="rounded-xl border p-4" style={card}>
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{TOUR_META[t]?.short ?? t}</div>
                {/* Each gender shows its own most-recent year rather than a
                    combined Math.max header: the two finals don't always land
                    on the same day (e.g. Wimbledon), so one gender's result
                    can lag the other's by a few days while ESPN/ingest catches
                    up. A shared year would misattribute the older champion to
                    the newer year. */}
                <div className="mt-1 text-sm"><span className="text-[var(--text-dim)] text-xs mr-1">M {m?.year ?? ""}</span><Champ c={m} /></div>
                <div className="mt-0.5 text-sm"><span className="text-[var(--text-dim)] text-xs mr-1">W {w?.year ?? ""}</span><Champ c={w} /></div>
                <div className="mt-1 text-xs text-[var(--text-muted)]"><MetroCell c={m ?? w} /></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* one combined, filterable champions ledger */}
      <section className="mb-12">
        <h2 id="champions" className="text-lg font-semibold mb-1">Every Grand Slam champion</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          All four majors in one ledger, most recent first. Filter by tournament or year.
        </p>
        <TennisChampionsTable rows={editions} tournaments={data.tournaments} />
      </section>

      {/* all-time leaders (the summit) */}
      <section className="mb-10">
        <h2 id="leaders-men" className="text-lg font-semibold mb-1">Men&apos;s all-time leaders</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Three or more singles majors, by total.</p>
        <LeaderTable leaders={data.leadersMen} tours={data.tournaments} spans={slamSpans(data.champions, "M")} />
      </section>
      <section className="mb-12">
        <h2 id="leaders-women" className="text-lg font-semibold mb-1">Women&apos;s all-time leaders</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Three or more singles majors, by total.</p>
        <LeaderTable leaders={data.leadersWomen} tours={data.tournaments} spans={slamSpans(data.champions, "W")} />
      </section>

      {/* by nation */}
      <section className="mb-12">
        <h2 id="by-nation" className="text-lg font-semibold mb-1">By nation</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Singles majors by country, former states folded into the modern nation.</p>

        {/* Mobile: one card per nation instead of a 4-column table. Same
            `nations` array as the desktop table below. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {nations.map((n) => (
            <div key={n.nation} className="rounded-lg border p-3" style={card}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm flex items-center gap-1.5"><Flag nation={n.nation} />{n.nation}</div>
                <span className="flex-shrink-0 text-sm font-semibold tabular-nums" style={{ ...mono, color: GOLD }}>{n.men + n.women}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Men</div>
                  <div className="tabular-nums text-[var(--text-muted)]" style={mono}>{n.men || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Women</div>
                  <div className="tabular-nums text-[var(--text-muted)]" style={mono}>{n.women || "—"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border overflow-x-auto max-h-[440px] overflow-y-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[360px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium">Men</th>
                <th className="py-2 px-3 text-right font-medium">Women</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {nations.map((n) => (
                <tr key={n.nation} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3"><Flag nation={n.nation} />{n.nation}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{n.men || ""}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{n.women || ""}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{n.men + n.women}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Davis Cup */}
      <section className="mb-12">
        <h2 id="davis-cup" className="text-lg font-semibold mb-1">Davis Cup</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">National-team titles and runner-up finishes, all-time.</p>

        {/* Mobile: one card per nation instead of a 3-column table. Same
            `data.davis` array as the desktop table below. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {data.davis.map((d) => (
            <div key={d.country} className="rounded-lg border p-3" style={card}>
              <div className="flex items-center gap-1.5">
                <Flag nation={d.country} />
                <span className="font-medium text-sm">{d.country}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Titles</div>
                  <div className="tabular-nums" style={{ ...mono, color: d.titles > 0 ? GOLD : "var(--text-dim)" }}>{d.titles || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runners-up</div>
                  <div className="tabular-nums text-[var(--text-muted)]" style={mono}>{d.runnerUp || "—"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border overflow-x-auto max-h-[440px] overflow-y-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[360px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Titles</th>
                <th className="py-2 px-3 text-right font-medium">Runners-up</th>
              </tr>
            </thead>
            <tbody>
              {data.davis.map((d) => (
                <tr key={d.country} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3"><Flag nation={d.country} />{d.country}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: d.titles > 0 ? GOLD : "var(--text-dim)" }}>{d.titles || ""}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{d.runnerUp || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* venues */}
      <section className="mb-12">
        <h2 id="venues" className="text-lg font-semibold mb-1">Venues &amp; metros</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Metros that have staged a Grand Slam, including the early Australian and
          French rotations. Each links to its page.
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
          Singles champions span Wimbledon from 1877, the US Championships from 1881,
          the French from 1891 (counted as a major from 1925, when it opened to
          international players) and the Australian from 1905, through the current
          season. Career totals count Grand Slam singles titles. A dagger marks a title
          won under a neutral flag. Occupation-era French champions of 1941-1945 are
          recorded but not counted, per convention. In the by-nation tally, former
          states are folded into the modern country: West Germany under Germany,
          Czechoslovakia under the Czech Republic, and the Yugoslav republics under
          Serbia. Host metros are joined to each champion through the venue that staged
          the event.
        </p>
      </section>
    </main>
  );
}
