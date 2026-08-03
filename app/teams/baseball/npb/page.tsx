import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import ClubsTable from "./ClubsTable";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { getAllNpbTeams, getNpbDefunct, getNpbHub } from "@/lib/npb";
import { getNpbStandings, type NpbStandingRow } from "@/lib/npbStandings";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
// Live standings are fetched at request time from SPAIA and cached by ISR, so
// they refresh hourly with no rebuild. Same mechanism as the F1 hub.
export const revalidate = 3600;
const PATH = "/teams/baseball/npb";
const TITLE = "Nippon Professional Baseball (NPB)";
const DESC =
  "Japan's top baseball league: every Japan Series champion since 1950, Central and Pacific League pennants, and the all-time record of the 12 clubs — historical franchises folded into their modern successors.";

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

function StandingsTable({
  title,
  rows,
  teamLink,
}: {
  title: string;
  rows: NpbStandingRow[];
  teamLink: (name: string | null) => ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border overflow-hidden" style={card}>
      <div className="px-3 pt-3 pb-1 text-xs font-semibold text-[var(--text-muted)]">{title}</div>

      {/* Mobile: one card per club instead of a 7-column table. Same `rows`
          data as the desktop table below. */}
      <div className="grid grid-cols-1 gap-2 p-3 sm:hidden">
        {rows.map((r) => (
          <div
            key={(r.slug ?? r.name) + "-card"}
            className="rounded-lg border p-3"
            style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm">{teamLink(r.name)}</div>
              <span className="text-xs tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>#{r.rank}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W–L–T</div>
                <div className="tabular-nums" style={mono}>{r.win}–{r.lose}–{r.draw}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">PCT</div>
                <div className="tabular-nums" style={mono}>{r.pct}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">GB</div>
                <div className="tabular-nums text-[var(--text-muted)]" style={mono}>{r.gamesBehind}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm min-w-[360px]">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">Club</th>
              <th className="py-2 px-2 font-medium text-right">W</th>
              <th className="py-2 px-2 font-medium text-right">L</th>
              <th className="py-2 px-2 font-medium text-right">T</th>
              <th className="py-2 px-2 font-medium text-right">PCT</th>
              <th className="py-2 px-3 font-medium text-right">GB</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug ?? r.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank}</td>
                <td className="py-1.5 px-3 font-medium">{teamLink(r.name)}</td>
                <td className="py-1.5 px-2 tabular-nums text-right" style={mono}>{r.win}</td>
                <td className="py-1.5 px-2 tabular-nums text-right" style={mono}>{r.lose}</td>
                <td className="py-1.5 px-2 tabular-nums text-right" style={mono}>{r.draw}</td>
                <td className="py-1.5 px-2 tabular-nums text-right" style={mono}>{r.pct}</td>
                <td className="py-1.5 px-3 tabular-nums text-right text-[var(--text-muted)]" style={mono}>{r.gamesBehind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function NpbHubPage() {
  const hub = getNpbHub();
  const teams = getAllNpbTeams();
  const defunct = getNpbDefunct();
  const standings = await getNpbStandings();
  const hasStandings = !!standings && (standings.central.length > 0 || standings.pacific.length > 0);
  if (!hub) return null;

  const slugByName = new Map(teams.map((t) => [t.name, t.slug]));
  const teamLink = (name: string | null) => {
    if (!name) return <span className="text-[var(--text-dim)]">—</span>;
    const slug = slugByName.get(name);
    return (
      <span className="inline-flex items-center">
        <CrestIcon name={name} size={18} className="mr-1.5 align-middle" />
        {slug
          ? <Link href={`/teams/baseball/npb/${slug}`} className="hover:text-[var(--accent)]">{name}</Link>
          : <span>{name}</span>}
      </span>
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/baseball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span>
          Back to International Baseball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <Link href="/teams/baseball" className="hover:underline">International Baseball</Link>
        {" / "}
        <span>NPB</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Nippon Professional Baseball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Japan&apos;s top flight, split into the Central and Pacific Leagues. Every Japan
          Series champion since 1950 — the headline honour — alongside league pennants and
          the all-time record of the 12 clubs, with historical franchises folded into their
          modern successors.
        </p>
      </header>

      <HubNav
        items={[
          ...(hasStandings ? [{ label: `${standings!.year} Standings`, href: "#standings" }] : []),
          { label: "Japan Series", href: "#japan-series" },
          { label: "All-time Clubs", href: "#clubs" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- Live standings (SPAIA, ISR) ---------------- */}
      {hasStandings && (
        <section className="mb-10">
          <h2 id="standings" className="text-lg font-semibold mb-1">
            {standings!.year} Standings
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Current Central and Pacific League tables, refreshed through the season.
            Live data from SPAIA.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <StandingsTable title="Central League" rows={standings!.central} teamLink={teamLink} />
            <StandingsTable title="Pacific League" rows={standings!.pacific} teamLink={teamLink} />
          </div>
        </section>
      )}

      {/* ---------------- Japan Series roll ---------------- */}
      <section className="mb-10">
        <h2 id="japan-series" className="text-lg font-semibold mb-1">Japan Series</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          The championship: a best-of-seven between the Central and Pacific pennant winners
          (the Climax Series winners since 2007). {hub.totals.js_editions} editions.
        </p>
        {/* Mobile: one card per Japan Series instead of a 3-column table.
            Same `hub.japan_series` data as the desktop table below. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[460px] overflow-y-auto pr-0.5">
          {hub.japan_series.map((s) => (
            <div
              key={s.year + "-card"}
              className="rounded-lg border p-3"
              style={card}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-sm">{teamLink(s.champion)}</div>
                <span className="text-xs tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>{s.year}</span>
              </div>
              <div className="mt-2 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                <div className="text-[var(--text-muted)]">{teamLink(s.runner_up)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[420px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium" style={{ color: GOLD }}>Champion</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
              </tr>
            </thead>
            <tbody>
              {hub.japan_series.map((s) => (
                <tr key={s.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{s.year}</td>
                  <td className="py-1.5 px-3 font-semibold" style={{ color: GOLD }}>{teamLink(s.champion)}</td>
                  <td className="py-1.5 px-3 text-[var(--text-muted)]">{teamLink(s.runner_up)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- All-time clubs ---------------- */}
      <section className="mb-10">
        <h2 id="clubs" className="text-lg font-semibold mb-1">All-time clubs</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          The 12 current franchises, ranked by Japan Series titles then pennants. Records and
          honours include each club&apos;s earlier identities. Switch to <strong>All</strong> to add
          defunct franchises with no modern successor (Kintetsu Buffaloes and the 1950s Unions/Stars).
        </p>
        <ClubsTable active={teams} defunct={defunct} />
      </section>

      {/* ---------------- Methodology ---------------- */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          Standings, postseason results, and franchise lineages from a season-by-season
          Wikipedia extract, 1950-2025. Each Japan Series champion is determined from the
          best-of-seven between the two league finalists; pennants are regular-season league
          titles. Defunct and renamed franchises (Nankai Hawks, Hankyu Braves, Nishitetsu
          Lions, Taiyo Whales, and others) fold into their modern successors, so a club&apos;s
          record and titles span its full history. Japan Series titles are the headline honour.
        </p>
      </section>
    </main>
  );
}
