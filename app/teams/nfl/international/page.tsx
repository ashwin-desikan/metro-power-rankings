import type { Metadata } from "next";
import Link from "next/link";
import {
  getNflEurope,
  getNflEuropeFranchises,
  getNflEuropeWorldBowls,
  getNflEuropeSeasonsByYear,
  nflEuropeFranchiseSlug,
  getNflInternationalSeries,
  type NflIntlTeam,
} from "@/lib/nflEurope";
import HubNav from "@/app/teams/HubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { CappedList } from "@/app/_shared/Disclosure";

export const dynamicParams = false;

const PAGE_PATH = "/teams/nfl/international";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "NFL International";
const PAGE_DESCRIPTION =
  "Every NFL game played outside the United States: the modern International Series mapped to host metros and countries, plus the full record of NFL Europe / WLAF (1991-2007).";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function rec(w: number, l: number, t: number) {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function MetroLink({ name, slug }: { name: string; slug: string | null }) {
  if (!slug) return <span>{name}</span>;
  return (
    <Link href={`/rankings/${slug}`} className="text-[var(--accent)] hover:underline">
      {name}
    </Link>
  );
}

function TeamLink({ team }: { team: NflIntlTeam }) {
  if (!team.slug) return <span>{team.name}</span>;
  return (
    <Link href={`/teams/nfl/${team.slug}`} className="text-[var(--text)] hover:text-[var(--accent)] hover:underline">
      {team.name}
    </Link>
  );
}

function CountryLink({ name, slug }: { name: string | null; slug: string | null }) {
  if (!name) return null;
  if (!slug) return <span>{name}</span>;
  return (
    <Link href={`/countries/${slug}`} className="text-[var(--accent)] hover:underline">
      {name}
    </Link>
  );
}

export default function NflInternationalPage() {
  const { meta } = getNflEurope();
  const franchises = getNflEuropeFranchises();
  const worldBowls = getNflEuropeWorldBowls().slice().sort((a, b) => b.season - a.season);
  const seasons = getNflEuropeSeasonsByYear();
  const intl = getNflInternationalSeries();
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          <Link href="/teams/nfl" className="hover:text-[var(--text-muted)]">NFL</Link>
          <span className="mx-1.5">›</span>International
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">NFL International</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          NFL games played outside the United States: the modern International Series, and the full record of
          NFL Europe (1991&ndash;2007).
        </p>
      </header>

      <HubNav
        items={[
          { label: "International Series", href: "#international-series" },
          { label: "World Bowls", href: "#world-bowls" },
          { label: "Franchises", href: "#franchises" },
          { label: "Season Standings", href: "#standings" },
        ]}
      />

      {/* ---------- Modern International Series ---------- */}
      <section id="international-series" className="mb-12">
        <div className="flex items-baseline justify-between flex-wrap gap-x-4 gap-y-1 mb-3">
          <h2 className="text-2xl font-bold tracking-tight">International Series</h2>
          <span className="text-xs text-[var(--text-dim)]">{intl.meta.count} games · {intl.meta.countries.length} countries · {intl.meta.first_season}&ndash;{intl.meta.last_season} · home team listed second</span>
        </div>
        {/* Mobile: one card per game instead of a 5-column table. Same
            intl.games data/order as the desktop table below. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={12}
            noun="games"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={intl.games.map((g, i) => (
            <div
              key={`${i}-card`}
              className="rounded-lg border p-3"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span>{g.date_display}</span>
                {g.date > todayIso && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}>upcoming</span>
                )}
              </div>
              <div className="text-sm mt-1">
                <TeamLink team={g.visitor} />
                <span className="text-[var(--text-dim)] mx-1.5">at</span>
                <TeamLink team={g.home} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Stadium</div>
                  <div className="text-[var(--text-muted)]">{g.stadium}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Metro</div>
                  <div><MetroLink name={g.metro.name} slug={g.metro.slug} /></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Country</div>
                  <div><CountryLink name={g.country.name} slug={g.country.slug} /></div>
                </div>
              </div>
            </div>
          ))}
          />
        </div>

        <div className="overflow-x-auto border border-[var(--border)] rounded-lg hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-dim)] text-xs uppercase tracking-wide border-b border-[var(--border)]">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Matchup</th>
                <th className="px-3 py-2 font-medium">Stadium</th>
                <th className="px-3 py-2 font-medium">Metro</th>
                <th className="px-3 py-2 font-medium">Country</th>
              </tr>
            </thead>
            <tbody>
              {intl.games.map((g, i) => (
                <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-hover)]">
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">
                    {g.date_display}
                    {g.date > todayIso && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded align-middle" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}>upcoming</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <TeamLink team={g.visitor} />
                    <span className="text-[var(--text-dim)] mx-1.5">at</span>
                    <TeamLink team={g.home} />
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{g.stadium}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><MetroLink name={g.metro.name} slug={g.metro.slug} /></td>
                  <td className="px-3 py-2 whitespace-nowrap"><CountryLink name={g.country.name} slug={g.country.slug} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[var(--text-dim)] mt-2">{intl.meta.blurb}</p>
      </section>

      {/* ---------- World Bowls ---------- */}
      <section id="world-bowls" className="mb-12">
        <h2 className="text-2xl font-bold tracking-tight mb-3">World Bowl champions</h2>
        {/* Mobile: one card per World Bowl instead of a 6-column table.
            Same worldBowls data/order as the desktop table below. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={12}
            noun="finals"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={worldBowls.map((g) => (
            <div
              key={g.season}
              className="rounded-lg border p-3"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span className="tabular-nums">{g.season}</span>
                <span>{g.game}</span>
              </div>
              <div className="text-sm font-semibold text-[var(--text)] mt-1">
                <span aria-hidden className="mr-1.5" style={{ color: "#d4af37" }}>●</span>{g.champion}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                def. {g.runner_up} <span className="tabular-nums">{g.score}</span>
              </div>
              <div className="text-[10px] text-[var(--text-dim)] mt-1">{g.city}{g.venue ? ` · ${g.venue}` : ""}</div>
            </div>
          ))}
          />
        </div>

        <div className="overflow-x-auto border border-[var(--border)] rounded-lg hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-dim)] text-xs uppercase tracking-wide border-b border-[var(--border)]">
                <th className="px-3 py-2 font-medium">Season</th>
                <th className="px-3 py-2 font-medium">Game</th>
                <th className="px-3 py-2 font-medium">Champion</th>
                <th className="px-3 py-2 font-medium">Runner-up</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Host</th>
              </tr>
            </thead>
            <tbody>
              {worldBowls.map((g) => (
                <tr key={g.season} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-hover)]">
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">{g.season}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{g.game}</td>
                  <td className="px-3 py-2 font-semibold text-[var(--text)] whitespace-nowrap">
                    <span aria-hidden className="mr-1.5" style={{ color: "#d4af37" }}>●</span>{g.champion}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{g.runner_up}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{g.score}</td>
                  <td className="px-3 py-2 text-[var(--text-dim)] text-xs">{g.city}{g.venue ? ` · ${g.venue}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Franchises ---------- */}
      <section id="franchises" className="mb-12">
        <div className="flex items-baseline justify-between flex-wrap gap-x-4 gap-y-1 mb-3">
          <h2 className="text-2xl font-bold tracking-tight">Franchises</h2>
          <span className="text-xs text-[var(--text-dim)]">{franchises.length} clubs · relocations show under both metros</span>
        </div>
        {/* Mobile: one card per franchise instead of a 6-column table.
            Same franchises data/order as the desktop table below. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={12}
            noun="franchises"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={franchises.map((f) => (
            <div
              key={f.canonical}
              id={nflEuropeFranchiseSlug(f.canonical)}
              className="rounded-lg border p-3 scroll-mt-24"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="font-semibold text-sm text-[var(--text)]">
                {f.canonical}
                {f.wb_titles > 0 && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold align-middle" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}>
                    {f.wb_titles}×
                  </span>
                )}
              </div>
              <div className="text-xs mt-1 space-y-0.5">
                {f.metros.map((m, i) => (
                  <div key={m.metro} className={i > 0 ? "text-[var(--text-dim)]" : ""}>
                    <MetroLink name={m.metro} slug={m.metro_slug} />
                    {f.relocated && (
                      <span className="text-[var(--text-dim)]"> ({m.team}, {m.first_year}&ndash;{m.last_year})</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Years</div>
                  <div className="tabular-nums text-[var(--text-muted)]">
                    {f.first_year === f.last_year ? f.first_year : `${f.first_year}–${f.last_year}`}
                    <div className="text-[var(--text-dim)]">{f.seasons} seas.</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Record</div>
                  <div className="tabular-nums">{rec(f.w, f.l, f.t)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Win%</div>
                  <div className="tabular-nums text-[var(--text-muted)]">{f.win_pct.toFixed(3)}</div>
                </div>
                <div className="col-span-3">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">World Bowls</div>
                  <div className="tabular-nums">
                    <span className="text-[var(--text)] font-semibold">{f.wb_titles}</span>
                    <span className="text-[var(--text-dim)]"> / {f.wb_apps} app{f.wb_apps === 1 ? "" : "s"}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          />
        </div>

        <div className="overflow-x-auto border border-[var(--border)] rounded-lg hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-dim)] text-xs uppercase tracking-wide border-b border-[var(--border)]">
                <th className="px-3 py-2 font-medium">Franchise</th>
                <th className="px-3 py-2 font-medium">Metro</th>
                <th className="px-3 py-2 font-medium">Years</th>
                <th className="px-3 py-2 font-medium text-right">Record</th>
                <th className="px-3 py-2 font-medium text-right">Win%</th>
                <th className="px-3 py-2 font-medium text-right">World Bowls</th>
              </tr>
            </thead>
            <tbody>
              {franchises.map((f) => (
                <tr key={f.canonical} id={`${nflEuropeFranchiseSlug(f.canonical)}-desktop`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-hover)] scroll-mt-24 align-top">
                  <td className="px-3 py-2 font-semibold text-[var(--text)] whitespace-nowrap">
                    {f.canonical}
                    {f.wb_titles > 0 && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold align-middle" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}>
                        {f.wb_titles}×
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {f.metros.map((m, i) => (
                      <div key={m.metro} className={i > 0 ? "text-[var(--text-dim)]" : ""}>
                        <MetroLink name={m.metro} slug={m.metro_slug} />
                        {f.relocated && (
                          <span className="text-[var(--text-dim)]"> ({m.team}, {m.first_year}&ndash;{m.last_year})</span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                    {f.first_year === f.last_year ? f.first_year : `${f.first_year}–${f.last_year}`}
                    <span className="text-[var(--text-dim)]"> · {f.seasons} seas.</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-right whitespace-nowrap">{rec(f.w, f.l, f.t)}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-[var(--text-muted)]">{f.win_pct.toFixed(3)}</td>
                  <td className="px-3 py-2 tabular-nums text-right whitespace-nowrap">
                    <span className="text-[var(--text)] font-semibold">{f.wb_titles}</span>
                    <span className="text-[var(--text-dim)]"> / {f.wb_apps} app{f.wb_apps === 1 ? "" : "s"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Season standings ---------- */}
      <section id="standings" className="mb-12">
        <h2 className="text-2xl font-bold tracking-tight mb-3">Season standings</h2>
        <div className="space-y-2">
          {seasons.map(({ year, rows }, idx) => (
            <details key={year} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group" open={idx === 0}>
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none">
                <span className="font-semibold text-[var(--text)]">{year}</span>
                <span className="text-xs text-[var(--text-dim)]">{rows.length} teams</span>
              </summary>
              {/* Mobile: one card per team instead of a 7-column table.
                  Same rows data/order as the desktop table below. */}
              <div className="border-t border-[var(--border)] p-2 grid grid-cols-1 gap-2 sm:hidden">
                <CappedList
                  initial={12}
                  noun="rows"
                  className="rounded-lg border border-[var(--border)]"
                  bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
                  items={rows.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border p-3"
                    style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--text)] flex items-center gap-1.5">
                          <span className="text-[var(--text-dim)] tabular-nums text-xs">#{s.pos}</span>
                          {s.team}
                        </div>
                        <div className="text-xs mt-0.5"><MetroLink name={s.metro ?? ""} slug={s.metro_slug} /></div>
                      </div>
                      {(s.wb_champ || s.wb_app || s.playoff) && (
                        <span className="text-[10px] whitespace-nowrap flex-shrink-0" style={s.wb_champ ? { color: "#d4af37", fontWeight: 600 } : { color: s.wb_app ? "var(--text-muted)" : "var(--text-dim)" }}>
                          {s.wb_champ ? "WB champion" : s.wb_app ? "World Bowl" : "Playoff"}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W-L-T</div>
                        <div className="tabular-nums">{rec(s.w, s.l, s.t)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">PF</div>
                        <div className="tabular-nums text-[var(--text-muted)]">{s.pf}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">PA</div>
                        <div className="tabular-nums text-[var(--text-muted)]">{s.pa}</div>
                      </div>
                    </div>
                  </div>
                ))}
                />
              </div>

              <div className="border-t border-[var(--border)] overflow-x-auto hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-dim)] text-xs uppercase tracking-wide border-b border-[var(--border)]">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Team</th>
                      <th className="px-3 py-2 font-medium">Metro</th>
                      <th className="px-3 py-2 font-medium text-right">W-L-T</th>
                      <th className="px-3 py-2 font-medium text-right">PF</th>
                      <th className="px-3 py-2 font-medium text-right">PA</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2 tabular-nums text-[var(--text-dim)]">{s.pos}</td>
                        <td className="px-3 py-2 font-medium text-[var(--text)] whitespace-nowrap">{s.team}</td>
                        <td className="px-3 py-2 text-xs"><MetroLink name={s.metro ?? ""} slug={s.metro_slug} /></td>
                        <td className="px-3 py-2 tabular-nums text-right whitespace-nowrap">{rec(s.w, s.l, s.t)}</td>
                        <td className="px-3 py-2 tabular-nums text-right text-[var(--text-muted)]">{s.pf}</td>
                        <td className="px-3 py-2 tabular-nums text-right text-[var(--text-muted)]">{s.pa}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {s.wb_champ ? (
                            <span style={{ color: "#d4af37" }} className="font-semibold">World Bowl champion</span>
                          ) : s.wb_app ? (
                            <span className="text-[var(--text-muted)]">World Bowl</span>
                          ) : s.playoff ? (
                            <span className="text-[var(--text-dim)]">Playoff</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Source: {meta.source} See the <a href="/methodology" className="hover:text-[var(--text-muted)]">methodology</a>.
      </p>
    </main>
  );
}
