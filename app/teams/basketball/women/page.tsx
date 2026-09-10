import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import {
  getAllWBasketballNations,
  getWBasketballHub,
  getWFibaRanking,
} from "@/lib/wbasketball";
import { flagCdnUrl, HISTORICAL_FLAG } from "@/lib/international-display";
import FibaRankingTable from "../FibaRankingTable";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { CappedList, Disclosure } from "@/app/_shared/Disclosure";
import { SportBadge } from "@/app/teams/_shared/SportIcon";

export const dynamicParams = false;
const PATH = "/teams/basketball/women";
const TITLE = "Women's International Basketball";
const DESC =
  "The women's national-team game: every FIBA Women's Basketball World Cup final four since 1953, every Olympic podium since Montreal 1976, and the current FIBA Women's World Ranking.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: [ogImage(TITLE, PATH)], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

export default async function WomensBasketballHubPage() {
  const hub = await getWBasketballHub();
  const nations = await getAllWBasketballNations();
  const fiba = await getWFibaRanking();
  if (!hub) return null;

  const slugByName = new Map(nations.map((t) => [t.name, t.slug]));
  // Former names (Soviet Union, Unified Team, Yugoslavia, Czechoslovakia,
  // East Germany) link to the modern node they fold into.
  const lineageSlug = new Map<string, string>();
  for (const t of nations) {
    for (const former of t.lineage ?? []) lineageSlug.set(former, t.slug);
  }
  const flagFor = (name: string) => {
    const ownSlug = slugByName.get(name);
    const url = ownSlug ? flagCdnUrl(ownSlug) : null;
    if (url) return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" loading="lazy" decoding="async" />;
    if (lineageSlug.has(name)) return <span aria-hidden className="mr-1">{HISTORICAL_FLAG}</span>;
    return null;
  };
  const teamLink = (name: string | null, className?: string) => {
    if (!name) return <span className="text-[var(--text-dim)]">—</span>;
    const slug = slugByName.get(name) ?? lineageSlug.get(name);
    const label = <>{flagFor(name)}{name}</>;
    return slug ? (
      <Link href={`/teams/basketball/women/${slug}`} className={`hover:text-[var(--accent)] ${className ?? ""}`}>
        {label}
      </Link>
    ) : (
      <span className={className}>{label}</span>
    );
  };

  const wcYears = hub.wc_editions_on_file;
  const stamp = [
    `As of ${fiba ? fiba.label : "the latest release"}`,
    `${hub.totals.wc_editions} World Cups`,
    `${hub.totals.podium_editions} Olympic podiums`,
    `${hub.totals.nations} nations`,
    "Wikipedia + FIBA",
  ].join("  ·  ");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <Link href="/teams/basketball" className="hover:underline">International Basketball</Link>
        {" / "}
        <span>Women</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <SportBadge sport="basketball" />
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Women&apos;s International Basketball</h1>
        </div>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          Every World Cup final four since 1953 and every Olympic podium since
          Montreal 1976, for all {hub.totals.nations} nations that have reached one.
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Looking for the men&apos;s game?{" "}
          <Link href="/teams/basketball" className="underline hover:text-[var(--accent)]">
            International Basketball
          </Link>
          .
        </p>
        <p className="mt-3 text-[10px] uppercase tracking-widest" style={{ ...mono, color: "var(--text-dim)" }}>
          {stamp}
        </p>
      </header>

      <HubNav
        items={[
          ...(fiba ? [{ label: "FIBA Ranking", href: "#fiba-ranking" }] : []),
          { label: "Olympic Podiums", href: "#olympics" },
          { label: "World Cup", href: "#world-cup" },
          { label: "Nations", href: "#nations" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- FIBA Women's World Ranking ---------------- */}
      {fiba ? (
        <section className="mb-10">
          <h2 id="fiba-ranking" className="text-2xl font-bold mb-1">FIBA Women&apos;s World Ranking</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl">
            All {fiba.teams.length} ranked nations, filterable by FIBA zone, as of {fiba.label}.
          </p>
          <FibaRankingTable ranking={fiba} gender="women" teamHrefBase="/teams/basketball/women" />
        </section>
      ) : null}

      {/* ---------------- Olympics ---------------- */}
      <section className="mb-10">
        <h2 id="olympics" className="text-2xl font-bold mb-1">Olympic podiums</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl">
          Every women&apos;s Olympic basketball podium since the event was added at Montreal 1976.
        </p>
        {/* Mobile: one card per Games instead of a cramped 5-column table */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={8}
            noun="podiums"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={hub.podiums.map((p) => (
              <div key={p.year} className="rounded-lg border p-3" style={card}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm tabular-nums" style={mono}>{p.year}</span>
                  <span className="text-[11px] text-[var(--text-dim)]">{p.host ?? ""}</span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-y-1.5 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: GOLD }}>Gold</div>
                    <div className="font-semibold" style={{ color: GOLD }}>{teamLink(p.gold)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Silver</div>
                    <div>{teamLink(p.silver)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Bronze</div>
                    <div>{teamLink(p.bronze)}</div>
                  </div>
                </div>
              </div>
            ))}
          />
        </div>

        <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Games</th>
                <th className="py-2 px-3 font-medium" style={{ color: GOLD }}>Gold</th>
                <th className="py-2 px-3 font-medium">Silver</th>
                <th className="py-2 px-3 font-medium">Bronze</th>
                <th className="py-2 px-3 font-medium hidden sm:table-cell">Host</th>
              </tr>
            </thead>
            <tbody>
              {hub.podiums.map((p) => (
                <tr key={p.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{p.year}</td>
                  <td className="py-1.5 px-3 font-semibold" style={{ color: GOLD }}>{teamLink(p.gold)}</td>
                  <td className="py-1.5 px-3">{teamLink(p.silver)}</td>
                  <td className="py-1.5 px-3">{teamLink(p.bronze)}</td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-muted)] hidden sm:table-cell">{p.host ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- World Cup ---------------- */}
      <section className="mb-10">
        <h2 id="world-cup" className="text-2xl font-bold mb-1">World Cup finals</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl">
          Champion, runner-up and the bronze game, every edition from {wcYears[0]} to{" "}
          {wcYears[wcYears.length - 1]}.
          {hub.wc_scheduled.length > 0
            ? ` The ${hub.wc_scheduled[0].year} edition in ${hub.wc_scheduled[0].host} is not yet decided.`
            : ""}
        </p>
        {/* Mobile: one card per final instead of a cramped 7-column table */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={8}
            noun="finals"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={hub.wc_finals.map((f) => (
              <div key={f.year} className="rounded-lg border p-3" style={card}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm" style={{ color: GOLD }}>{teamLink(f.champion)}</span>
                  <span className="text-xs tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>{f.year}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Score</div>
                    <div className="tabular-nums" style={mono}>{f.score}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                    <div>{teamLink(f.runner_up)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Third</div>
                    <div>{teamLink(f.third)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Fourth</div>
                    <div>{teamLink(f.fourth)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Host</div>
                    <div>{f.host}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Teams</div>
                    <div className="tabular-nums" style={mono}>{f.teams ?? "—"}</div>
                  </div>
                </div>
              </div>
            ))}
          />
        </div>

        <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Champion</th>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
                <th className="py-2 px-3 font-medium">Third</th>
                <th className="py-2 px-3 font-medium">Fourth</th>
                <th className="py-2 px-3 font-medium hidden sm:table-cell">Host</th>
                <th className="py-2 px-3 text-right font-medium">Teams</th>
              </tr>
            </thead>
            <tbody>
              {hub.wc_finals.map((f) => (
                <tr key={f.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.year}</td>
                  <td className="py-2 px-3 font-semibold" style={{ color: GOLD }}>{teamLink(f.champion)}</td>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.score}</td>
                  <td className="py-2 px-3">{teamLink(f.runner_up)}</td>
                  <td className="py-2 px-3">{teamLink(f.third)}</td>
                  <td className="py-2 px-3">{teamLink(f.fourth)}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)] hidden sm:table-cell">{f.host}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{f.teams ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Nations ---------------- */}
      <section className="mb-10">
        <h2 id="nations" className="text-2xl font-bold mb-1">Nations</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl">
          Every nation that has won an Olympic medal or reached a World Cup final four.
        </p>
        {/* Mobile: one card per nation instead of a cramped 5-column table */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={12}
            noun="nations"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={nations.map((t) => (
              <div key={t.slug} className="rounded-lg border p-3" style={card}>
                <div className="flex items-center gap-1.5 min-w-0 font-medium text-sm">
                  {flagCdnUrl(t.slug) && (
                    <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" loading="lazy" decoding="async" />
                  )}
                  <Link href={`/teams/basketball/women/${t.slug}`} className="hover:text-[var(--accent)] truncate">
                    {t.name}
                  </Link>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Oly Gold</div>
                    <div className="tabular-nums font-semibold" style={{ ...mono, color: t.gold > 0 ? GOLD : "var(--text-dim)" }}>{t.gold}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Oly Medals</div>
                    <div className="tabular-nums" style={mono}>{t.medals}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">WC Titles</div>
                    <div className="tabular-nums" style={mono}>{t.wc_titles}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Final fours</div>
                    <div className="tabular-nums" style={mono}>{t.wc_final_fours}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">FIBA</div>
                    <div className="tabular-nums" style={mono}>{t.fiba_rank ? `#${t.fiba_rank}` : "—"}</div>
                  </div>
                </div>
              </div>
            ))}
          />
        </div>

        <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Oly Gold</th>
                <th className="py-2 px-3 text-right font-medium">Oly Medals</th>
                <th className="py-2 px-3 text-right font-medium">WC Titles</th>
                <th className="py-2 px-3 text-right font-medium">Final fours</th>
                <th className="py-2 px-3 text-right font-medium hidden sm:table-cell">FIBA</th>
              </tr>
            </thead>
            <tbody>
              {nations.map((t) => (
                <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {flagCdnUrl(t.slug) && (
                        <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block" loading="lazy" decoding="async" />
                      )}
                      <Link href={`/teams/basketball/women/${t.slug}`} className="hover:text-[var(--accent)]">
                        {t.name}
                      </Link>
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: t.gold > 0 ? GOLD : "var(--text-dim)" }}>{t.gold}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.medals}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.wc_titles}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.wc_final_fours}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums hidden sm:table-cell" style={mono}>{t.fiba_rank ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Methodology ---------------- */}
      <Disclosure
        id="methodology"
        title="Where these numbers come from"
        className="mb-10"
        bodyClassName="p-5 text-[13.5px] text-[var(--text-muted)] space-y-2"
      >
        <p>
          World Cup results come from the FIBA Women&apos;s Basketball World Cup
          results summary, 1953 to 2022. That source lists each edition&apos;s final
          four and nothing else, so there is no appearance count to derive: the
          nations table shows final fours reached, and the appearance field is
          left empty rather than filled with a number that would read as a
          tournament count. Olympic podiums cover all{" "}
          {hub.totals.podium_editions} women&apos;s tournaments from Montreal 1976,
          read from the per-edition medal games, brackets and final standings.
        </p>
        <p>
          Soviet Union and Unified Team results fold into Russia, Yugoslav
          lineages into Serbia, Czechoslovakia into the Czech Republic and East
          Germany into Germany, each edition keeping its own attribution. The
          ranking is the FIBA Women&apos;s World Ranking presented by Nike, as of{" "}
          {fiba ? fiba.label : "the latest release"}; it is refreshed weekly and
          Russia is currently absent from it.
        </p>
      </Disclosure>
    </main>
  );
}
