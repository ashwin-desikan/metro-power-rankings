import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { getAllMetros } from "@/lib/data";
import { getMoves } from "@/lib/moves";
import type { Move } from "@/lib/movesShared";
import HubNav from "@/app/teams/HubNav";
import { SectionHead } from "@/app/_shared/SectionHead";
import { Disclosure, CappedList } from "@/app/_shared/Disclosure";
import { TableBox, MONO } from "@/app/business/ui";
import {
  GHOST_FRANCHISES,
  GHOST_SPECIES,
  ghostsBySpecies,
  ghostTeamHref,
  type GhostSpecies,
} from "@/lib/ghostFranchises";
import DecadeStackChart, { type StackCat, type StackRow } from "./DecadeStackChart";
import SportSparklines from "./SportSparklines";
import DistanceDistribution, { type DistBin } from "./DistanceDistribution";
import MovesLedgerTable from "./MovesLedgerTable";

export const dynamicParams = false;

const PAGE_PATH = "/sports/geography-of-erasure";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "The Geography of Erasure";
const PAGE_DESCRIPTION =
  "Every franchise relocation the site tracks, by league and by decade: who left which metro, how far they went, who came back, and the champions the map forgot.";
const SUBSTACK_URL = "https://citizenofnowhere.substack.com";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: ogImage(PAGE_TITLE, PAGE_URL), width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
  },
  twitter: {
    images: [ogImage(PAGE_TITLE, PAGE_URL)], card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION,
  },
};

const SPECIES_ORDER: GhostSpecies[] = ["true-death", "relocation-laundering", "living-exile"];

const CAT_TOKENS = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)"];

function decadeRange(minDecade: string, maxDecade: string): string[] {
  const lo = parseInt(minDecade, 10);
  const hi = parseInt(maxDecade, 10);
  const out: string[] = [];
  for (let d = lo; d <= hi; d += 10) out.push(`${d}s`);
  return out;
}

function metroName(metros: Map<string, string>, slug: string | null): string {
  if (!slug) return "—";
  return metros.get(slug) ?? slug;
}

function MetroLink({ metro, slug }: { metro: string; slug: string | null }) {
  if (!slug) return <span>{metro}</span>;
  return (
    <Link href={`/rankings/${slug}`} className="hover:text-[var(--accent)] hover:underline">
      {metro}
    </Link>
  );
}

export default function GeographyOfErasurePage() {
  const data = getMoves();
  const moves = data.moves;
  const temporary = data.temporary;
  const summary = data.summary;
  const metros = new Map(getAllMetros().map((m) => [m.slug, m.name]));

  const total = moves.length;
  const leagues = new Set(moves.map((m) => m.league)).size;
  const years = moves.map((m) => m.year);
  const yearMin = Math.min(...years);
  const yearMax = Math.max(...years);
  const ghostTotal = GHOST_FRANCHISES.length;

  // ---- Section 2: decade x sport stacked bars -----------------------------
  const topSports = Object.entries(summary.by_sport)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  const primarySports = topSports.slice(0, 5);
  const cats: StackCat[] = primarySports.map((s, i) => ({ key: s, label: s, color: CAT_TOKENS[i] }));
  const hasOther = topSports.length > 5;
  if (hasOther) cats.push({ key: "Other", label: "Other", color: CAT_TOKENS[5] });
  const sportBucket = (sport: string) => (primarySports.includes(sport) ? sport : "Other");

  const decades = decadeRange(
    Object.keys(summary.by_decade).sort()[0],
    Object.keys(summary.by_decade).sort().slice(-1)[0],
  );
  const decadeRows: StackRow[] = decades.map((d) => {
    const values: Record<string, number> = {};
    let decadeTotal = 0;
    for (const m of moves) {
      if (m.decade !== d) continue;
      const key = sportBucket(m.sport);
      values[key] = (values[key] ?? 0) + 1;
      decadeTotal++;
    }
    return { decade: d, values, total: decadeTotal };
  });

  // ---- Section 3: sparklines by league -------------------------------------
  const byLeagueDecade: Record<string, Record<string, number>> = {};
  for (const m of moves) {
    byLeagueDecade[m.league] ??= {};
    byLeagueDecade[m.league][m.decade] = (byLeagueDecade[m.league][m.decade] ?? 0) + 1;
  }

  // ---- Section 4: metros lost / gained --------------------------------------
  function metroDetail(slug: string, direction: "from" | "to") {
    return moves
      .filter((m) => (direction === "from" ? m.from.metro_slug : m.to.metro_slug) === slug)
      .map((m) => `${m.franchise_now} (${m.year})`);
  }

  // ---- Section 5: distance --------------------------------------------------
  const withDist = moves.filter((m): m is Move & { distance_km: number } => m.distance_km != null);
  const distBins: DistBin[] = [
    { label: "0 to 100 km", count: 0 }, { label: "100 to 500 km", count: 0 },
    { label: "500 to 1,500 km", count: 0 }, { label: "1,500 to 3,000 km", count: 0 },
    { label: "Over 3,000 km", count: 0 },
  ];
  for (const m of withDist) {
    const d = m.distance_km;
    if (d <= 100) distBins[0].count++;
    else if (d <= 500) distBins[1].count++;
    else if (d <= 1500) distBins[2].count++;
    else if (d <= 3000) distBins[3].count++;
    else distBins[4].count++;
  }
  const longest10 = [...withDist].sort((a, b) => b.distance_km - a.distance_km).slice(0, 10);

  // ---- Section 6: returns / replacements ------------------------------------
  const returns = moves.filter((m) => m.returned).sort((a, b) => b.year - a.year);

  // ---- Section 7: species mapped to ledger rows ------------------------------
  const movesByLeagueSlug = new Map<string, Move[]>();
  for (const m of moves) {
    const key = `${m.league}:${m.franchise_slug}`;
    if (!movesByLeagueSlug.has(key)) movesByLeagueSlug.set(key, []);
    movesByLeagueSlug.get(key)!.push(m);
  }

  const asOfStamp = `AS OF ${data.as_of ?? "—"} · ${total.toLocaleString()} moves · ${leagues} leagues · ${yearMin} to ${yearMax} · source: per-season team sheets + relocations ledger`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="inline-flex items-center min-h-[44px] -my-2 hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="inline-flex items-center min-h-[44px] -my-2 hover:underline">Sports</Link>
        {" / "}
        <span>Geography of Erasure</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">The Geography of Erasure</h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          Sport sells itself as a meritocracy. It is closer to a real estate game: every franchise that ever
          packed up and left is on the board below, by league, by decade, by distance.
        </p>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
          {asOfStamp}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-3 max-w-3xl">
          Companion to the essay on{" "}
          <a href={SUBSTACK_URL} className="text-[var(--accent)] hover:underline" target="_blank" rel="noopener noreferrer">
            Citizen of Nowhere
          </a>
          .
        </p>
      </header>

      <HubNav
        items={[
          { label: "By decade", href: "#by-decade" },
          { label: "By sport", href: "#by-sport" },
          { label: "Metros", href: "#metros" },
          { label: "Distance", href: "#distance" },
          { label: "Who came back", href: "#returns" },
          { label: "Temporary homes", href: "#temporary-homes" },
          ...SPECIES_ORDER.map((s) => ({ label: GHOST_SPECIES[s].label, href: `#${s}` })),
          { label: "Full ledger", href: "#ledger" },
        ]}
      />

      {/* Section 1: essay + stat tiles */}
      <section className="mb-12">
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
          Sporting history is not written by the winners but by the markets that survived. When a champion is
          based in a metro the modern corporate league has outgrown, the legacy does not get an asterisk. It gets
          deleted, or packed onto a truck. This page is the full ledger behind that argument: {total} moves the
          site's own team data can document, from an 1877 baseball club's short hop to Brooklyn through last
          decade's NFL and NHL relocations.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Moves on record", value: total.toLocaleString() },
            { label: "Leagues", value: String(leagues) },
            { label: "Returns / replacements", value: String(summary.returns) },
            { label: "Ghost franchises", value: String(ghostTotal) },
          ].map((t) => (
            <div key={t.label} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="text-2xl font-bold tabular-nums text-[var(--text)]" style={MONO}>{t.value}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{t.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: by decade */}
      <section id="by-decade" className="mb-12 scroll-mt-24">
        <SectionHead
          title="Every move, by decade"
          sub="One stacked bar per decade, one colour per sport. Height is move count."
          more="Sports beyond the top five collapse into Other. A move is dated to the arrival year in the new metro, so a franchise that left in December 1994 for a 1995 debut counts in the 1990s."
        />
        <DecadeStackChart cats={cats} rows={decadeRows} />
      </section>

      {/* Section 3: by sport small multiples */}
      <section id="by-sport" className="mb-12 scroll-mt-24">
        <SectionHead
          title="By league"
          sub="Moves per decade, one strip per league. The lit bar is that league's busiest decade."
        />
        <SportSparklines decades={decades} byLeagueDecade={byLeagueDecade} busiest={summary.busiest_decade_by_league} />
      </section>

      {/* Section 4: metros lost / gained */}
      <section id="metros" className="mb-12 scroll-mt-24">
        <SectionHead
          title="The metros that lost the most, and gained the most"
          sub="Departures and arrivals counted across every league on record; Net is arrivals minus departures."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Lost the most</h3>
            <div className="hidden sm:block">
              <TableBox stickyCol={2}>
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">Metro</th>
                    <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Departures</th>
                    <th className="hidden md:table-cell px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Arrivals</th>
                    <th className="hidden md:table-cell px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.top_losing_metros.slice(0, 10).map((row, i) => (
                    <tr key={row.metro_slug} className="border-b hover:bg-[var(--bg-card-hover)] transition-colors" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2 text-[var(--text-dim)] tabular-nums" style={MONO}>{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/rankings/${row.metro_slug}`} className="hover:text-[var(--accent)] hover:underline">
                          {metroName(metros, row.metro_slug)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]" style={MONO}>{row.departures}</td>
                      <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>{row.arrivals}</td>
                      <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums" style={{ ...MONO, color: row.net < 0 ? "var(--div-neg)" : row.net > 0 ? "var(--div-pos)" : "var(--text-muted)" }}>
                        {row.net > 0 ? `+${row.net}` : row.net}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:hidden">
              <CappedList
                initial={8}
                noun="metros"
                className="rounded-lg border border-[var(--border)]"
                bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
                items={summary.top_losing_metros.slice(0, 10).map((row, i) => (
                  <div key={row.metro_slug} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/rankings/${row.metro_slug}`} className="font-semibold hover:text-[var(--accent)]">
                        {i + 1}. {metroName(metros, row.metro_slug)}
                      </Link>
                      <span className="text-sm font-semibold tabular-nums" style={MONO}>{row.departures} left</span>
                    </div>
                    <div className="text-xs text-[var(--text-dim)] mt-1 truncate">{metroDetail(row.metro_slug, "from").slice(0, 3).join(", ")}</div>
                  </div>
                ))}
              />
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Gained the most</h3>
            <div className="hidden sm:block">
              <TableBox stickyCol={2}>
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">Metro</th>
                    <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Arrivals</th>
                    <th className="hidden md:table-cell px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Departures</th>
                    <th className="hidden md:table-cell px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.top_gaining_metros.slice(0, 10).map((row, i) => (
                    <tr key={row.metro_slug} className="border-b hover:bg-[var(--bg-card-hover)] transition-colors" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2 text-[var(--text-dim)] tabular-nums" style={MONO}>{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/rankings/${row.metro_slug}`} className="hover:text-[var(--accent)] hover:underline">
                          {metroName(metros, row.metro_slug)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]" style={MONO}>{row.arrivals}</td>
                      <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>{row.departures}</td>
                      <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums" style={{ ...MONO, color: row.net < 0 ? "var(--div-neg)" : row.net > 0 ? "var(--div-pos)" : "var(--text-muted)" }}>
                        {row.net > 0 ? `+${row.net}` : row.net}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:hidden">
              <CappedList
                initial={8}
                noun="metros"
                className="rounded-lg border border-[var(--border)]"
                bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
                items={summary.top_gaining_metros.slice(0, 10).map((row, i) => (
                  <div key={row.metro_slug} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/rankings/${row.metro_slug}`} className="font-semibold hover:text-[var(--accent)]">
                        {i + 1}. {metroName(metros, row.metro_slug)}
                      </Link>
                      <span className="text-sm font-semibold tabular-nums" style={MONO}>{row.arrivals} gained</span>
                    </div>
                    <div className="text-xs text-[var(--text-dim)] mt-1 truncate">{metroDetail(row.metro_slug, "to").slice(0, 3).join(", ")}</div>
                  </div>
                ))}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: distance */}
      <section id="distance" className="mb-12 scroll-mt-24">
        <SectionHead
          title="How far they went"
          sub="Straight-line distance between metro centers. The longest ten below, the full spread as a single bar."
        />
        <div className="mb-6">
          <DistanceDistribution bins={distBins} />
        </div>
        <div className="min-w-0">
          <div className="hidden sm:block">
            <TableBox stickyCol={2}>
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">Franchise</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">From</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">To</th>
                  <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Year</th>
                  <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">Distance</th>
                </tr>
              </thead>
              <tbody>
                {longest10.map((m, i) => (
                  <tr key={`${m.league}-${m.franchise_slug}-${m.year}`} className="border-b hover:bg-[var(--bg-card-hover)] transition-colors" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 text-[var(--text-dim)] tabular-nums" style={MONO}>{i + 1}</td>
                    <td className="px-3 py-2"><Link href={m.href} className="hover:text-[var(--accent)]">{m.franchise_now}</Link></td>
                    <td className="px-3 py-2 text-[var(--text-muted)]"><MetroLink metro={m.from.metro} slug={m.from.metro_slug} /></td>
                    <td className="px-3 py-2 text-[var(--text-muted)]"><MetroLink metro={m.to.metro} slug={m.to.metro_slug} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-dim)]" style={MONO}>{m.year}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]" style={MONO}>{m.distance_km.toLocaleString()} km</td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={6}
              noun="moves"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={longest10.map((m, i) => (
                <div key={`${m.league}-${m.franchise_slug}-${m.year}`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={m.href} className="font-semibold hover:text-[var(--accent)]">{i + 1}. {m.franchise_now}</Link>
                    <span className="text-sm font-semibold tabular-nums" style={MONO}>{m.distance_km.toLocaleString()} km</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1"><MetroLink metro={m.from.metro} slug={m.from.metro_slug} /> to <MetroLink metro={m.to.metro} slug={m.to.metro_slug} /> · {m.year}</div>
                </div>
              ))}
            />
          </div>
        </div>
      </section>

      {/* Section 6: who came back */}
      <section id="returns" className="mb-12 scroll-mt-24">
        <SectionHead
          title="Who came back"
          sub="A franchise that later returned to the metro it left, or a same-league franchise that arrived there afterward."
        />
        <div className="grid grid-cols-1 gap-2">
          <CappedList
            initial={10}
            noun="cases"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={returns.map((m, i) => (
              <div key={`${m.league}-${m.franchise_slug}-${m.year}-${i}`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <Link href={m.href} className="font-semibold hover:text-[var(--accent)]">{m.franchise_now}</Link>
                  <span className="text-xs tabular-nums text-[var(--text-dim)]" style={MONO}>{m.year}</span>
                </div>
                <div className="text-sm text-[var(--text-muted)] mt-1">
                  Left <MetroLink metro={m.from.metro} slug={m.from.metro_slug} /> for <MetroLink metro={m.to.metro} slug={m.to.metro_slug} />.
                  {m.replaced_by ? (
                    <> <MetroLink metro={m.from.metro} slug={m.from.metro_slug} /> was replaced by the <span className="text-[var(--text)]">{m.replaced_by.name}</span> ({m.replaced_by.year}).</>
                  ) : (
                    <> The franchise later played in <MetroLink metro={m.from.metro} slug={m.from.metro_slug} /> again.</>
                  )}
                </div>
              </div>
            ))}
          />
        </div>
      </section>

      {/* Section 6b: temporary homes - a displacement, not a relocation */}
      <section id="temporary-homes" className="mb-12 scroll-mt-24">
        <SectionHead
          title="Temporary homes"
          sub="Seasons played away from home and then home again: not relocations."
        />
        <div className="grid grid-cols-1 gap-2">
          <CappedList
            initial={10}
            noun="episodes"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={temporary.map((t, i) => (
              <div key={`${t.league}-${t.franchise_slug}-${i}`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <Link href={t.href} className="font-semibold hover:text-[var(--accent)]">{t.franchise_now}</Link>
                  <span className="text-xs tabular-nums text-[var(--text-dim)]" style={MONO}>{t.years}</span>
                </div>
                <div className="text-sm text-[var(--text-muted)] mt-1">
                  <MetroLink metro={t.home.metro} slug={t.home.metro_slug} /> away to{" "}
                  {t.temporary.map((x, j) => (
                    <span key={x.metro_slug ?? x.metro}>
                      {j > 0 ? " and " : ""}
                      <MetroLink metro={x.metro} slug={x.metro_slug} /> ({x.seasons} season{x.seasons === 1 ? "" : "s"})
                    </span>
                  ))}
                  , then home to <MetroLink metro={t.home.metro} slug={t.home.metro_slug} /> again.
                </div>
              </div>
            ))}
          />
        </div>
      </section>

      {/* Section 7: three species of erasure, unchanged prose, with ledger */}
      {SPECIES_ORDER.map((species) => {
        const rows = ghostsBySpecies(species);
        const meta = GHOST_SPECIES[species];
        return (
          <section key={species} id={species} className="mb-12 scroll-mt-24">
            <SectionHead title={meta.label} sub={meta.sub} more={meta.blurb} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rows.map((g) => {
                const href = ghostTeamHref(g);
                const relatedMoves = movesByLeagueSlug.get(`${g.league}:${g.slug}`) ?? [];
                const inner = (
                  <div
                    className={`rounded-xl border p-5 h-full transition-colors ${
                      href ? "group hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" : "opacity-80"
                    }`}
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <div className={`font-semibold text-lg tracking-tight ${href ? "group-hover:text-[var(--accent)]" : ""}`}>
                        {g.name}
                      </div>
                      <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] whitespace-nowrap">
                        {g.sport}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mb-2">
                      {g.metro}
                      {g.heir ? <> to now <span className="text-[var(--text)]">{g.heir}</span></> : null}
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">{g.note}</p>
                    <div className="mt-3 text-xs font-semibold">
                      {href ? (
                        <span className="text-[var(--accent)]">View team page &rarr;</span>
                      ) : (
                        <span className="text-[var(--text-dim)]">Team page coming soon</span>
                      )}
                    </div>
                  </div>
                );
                return (
                  <div key={g.league + g.slug}>
                    {href ? <Link href={href} className="block">{inner}</Link> : inner}
                    {relatedMoves.length > 0 ? (
                      <ul className="mt-1.5 pl-1 text-xs text-[var(--text-dim)] space-y-0.5">
                        {relatedMoves.map((m, i) => (
                          <li key={i} style={MONO}>
                            {m.year} · {m.from.metro} &rarr; {m.to.metro}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Section 8: complete ledger */}
      <section id="ledger" className="mb-12 scroll-mt-24">
        <SectionHead
          title="The complete ledger"
          sub="Every move the site can document, newest first. Sortable by year, league, franchise, or distance."
        />
        <MovesLedgerTable moves={moves} />
      </section>

      <Disclosure title="Where these numbers come from" desktopOpen={false}>
        <div className="p-4 text-[13.5px] text-[var(--text-muted)] leading-relaxed space-y-2">
          <p>
            A move is a change of metro area, never a rename or a spelling variant within the same one. The big
            four (NFL, NBA, NHL, MLB) come from the site&apos;s own metro-keyed relocation tiles (built from each
            workbook&apos;s Metro Area column): every metro a franchise has called home, sorted into order and
            walked for a change of metro, dated to the arrival year. A franchise renamed in place, such as the
            Boston Patriots becoming the New England Patriots or the Phoenix Cardinals becoming the Arizona
            Cardinals, carries no tile of its own and so produces no row here. Every other league on record (NRL,
            CFL, WNBA, IPL, AFL, football, rugby, NPB, T20) comes from the same relocations ledger, which is
            thinner for those leagues, so their share of the {total} moves here is small relative to how many
            relocations those sports have actually had historically. A row whose destination metro cannot be
            resolved is dropped rather than guessed; the build prints which and why.
          </p>
          <p>
            Distance is the straight-line gap between metro centers, not a road or flight distance. Titles before
            and after a move are drawn from the franchise&apos;s own championship total, split at the point of the
            move, so they run out (never negative) rather than double count. The three species below (true
            deaths, relocation laundering, living exile) are a curated editorial taxonomy, matched here to the
            ledger rows for that franchise where the data supports the match.
          </p>
          <p>
            Built by <code>scripts/build-moves.py</code>. Companion essay on{" "}
            <a href={SUBSTACK_URL} className="text-[var(--accent)] hover:underline" target="_blank" rel="noopener noreferrer">
              Citizen of Nowhere
            </a>
            .
          </p>
        </div>
      </Disclosure>
    </main>
  );
}
