import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import HubNav from "@/app/teams/HubNav";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getNflExpectation, type TeamSeasonRow } from "@/lib/nflExpectation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PAGE_PATH = "/teams/nfl/expectation";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "What the NFL was supposed to do";
const PAGE_DESCRIPTION =
  "Every NFL game since 1920 scored against the chance it was given beforehand: the longest odds ever beaten, the seasons that most outran expectation, and which metros have quietly beaten the odds for a century.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const card: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };
const UP = "#10b981";
const DOWN = "#E2628B";

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function signed(n: number, dp = 2) {
  return `${n > 0 ? "+" : ""}${n.toFixed(dp)}`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4 min-w-0" style={card}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={mono}>{value}</div>
      {sub ? <div className="text-xs text-[var(--text-muted)] mt-1 truncate">{sub}</div> : null}
    </div>
  );
}

function TeamLink({ name, slug }: { name: string; slug: string | null }) {
  if (!slug) return <span>{name}</span>;
  return (
    <Link href={`/teams/nfl/${slug}`} className="text-[var(--accent)] hover:underline">
      {name}
    </Link>
  );
}

function SeasonTable({ rows, caption }: { rows: TeamSeasonRow[]; caption: string }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold mb-2">{caption}</h3>
      <TableScroll className="rounded-xl border" style={card}>
        <table className="w-full text-xs" data-sticky-col="2">
          <thead>
            <tr className="text-[var(--text-dim)] text-left">
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">Team</th>
              <th className="py-2 px-3 font-medium text-right">vs expected</th>
              <th className="py-2 px-3 font-medium text-right">Won</th>
              <th className="py-2 px-3 font-medium text-right">Expected</th>
              <th className="py-2 px-3 font-medium hidden sm:table-cell">Metro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.season}-${r.key}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={mono}>{i + 1}</td>
                <td className="py-1.5 px-3 whitespace-nowrap">
                  <span className="tabular-nums text-[var(--text-dim)] mr-1.5" style={mono}>{r.season}</span>
                  <TeamLink name={r.team} slug={r.slug} />
                </td>
                <td
                  className="py-1.5 px-3 text-right tabular-nums font-semibold"
                  style={{ ...mono, color: (r.wae ?? 0) > 0 ? UP : DOWN }}
                >
                  {signed(r.wae ?? 0)}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.wins}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>
                  {r.exp_wins?.toFixed(2)}
                </td>
                <td className="py-1.5 px-3 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">
                  {r.metro_slug ? (
                    <Link href={`/rankings/${r.metro_slug}`} className="hover:underline">{r.metro}</Link>
                  ) : (r.metro ?? "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

export default async function NflExpectationPage() {
  const data = await getNflExpectation();

  if (!data) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold mb-3">{PAGE_TITLE}</h1>
        <p className="text-[var(--text-muted)] text-sm">
          The expectation ledger has not loaded. It lives at{" "}
          <code>/data/nfl/expectation/index.json</code> and is rebuilt by{" "}
          <code>scripts/nfl/build_expectation.py</code>.
        </p>
      </main>
    );
  }

  const { meta, upsets, best_seasons, worst_seasons, metros, seasons } = data;
  const h2h = meta.head_to_head;
  // 🔴 DO NOT FILTER THIS TABLE TO SEASONS THAT HAVE MARKET DATA. Doing so made
  // it stop dead at 2023 with the reason buried in a card at the foot of the
  // page, so a reader could only conclude the record ends there. Every season
  // from the first usable spread onward is listed, and one without a market
  // number says on its own row why not.
  const firstMarket = seasons.find((s) => s.market_games > 0)?.season ?? 0;
  const marketSeasons = seasons.filter((s) => s.season >= firstMarket);
  const noMarketReason = new Map<number, string>();
  for (const m of meta.market_excluded) noMarketReason.set(m.season, "sign reversed in source");
  for (const m of meta.market_unconfirmed) noMarketReason.set(m.season, "too few games to confirm");
  for (const s of marketSeasons) {
    if (s.market_games === 0 && !noMarketReason.has(s.season)) {
      noMarketReason.set(s.season, "no spread in source");
    }
  }
  const topUpsets = upsets.slice(0, 25);
  const metroTop = metros.slice(0, 12);
  const metroBottom = metros.slice(-12).reverse();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs text-[var(--text-dim)] mb-4">
        <Link href="/teams/nfl" className="hover:underline">NFL</Link>
        <span className="mx-1.5">/</span>
        <span>Expectation</span>
      </nav>

      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          National Football League
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">{PAGE_TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Results are the easy half of the record. This board keeps the other half: what each game
          was expected to do before it was played, and how far it missed. Every NFL game since 1920
          carries a pre-game win probability, so a century of football can be scored exactly the way
          we score a reader picking this weekend.
        </p>
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-4" style={mono}>
          {meta.seasons[0]}&ndash;{meta.seasons[1]} · {meta.games.toLocaleString()} games ·{" "}
          {meta.games_scored.toLocaleString()} scored · source {meta.source} · built{" "}
          {meta.generated_at}
        </div>
      </header>

      <HubNav
        items={[
          { label: "Longest odds", href: "#upsets" },
          { label: "Against expectation", href: "#seasons" },
          { label: "By metro", href: "#metros" },
          { label: "Model vs market", href: "#market" },
          { label: "Back to the hub", href: "/teams/nfl" },
        ]}
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        <Tile
          label="Games scored"
          value={meta.games_scored.toLocaleString()}
          sub={`${meta.seasons[0]} to ${meta.seasons[1]}`}
        />
        <Tile
          label="Longest odds beaten"
          value={pct(topUpsets[0]?.p_winner ?? 0)}
          sub={topUpsets[0] ? `${topUpsets[0].winner}, ${topUpsets[0].season}` : undefined}
        />
        <Tile
          label="Model Brier"
          value={h2h.model_brier?.toFixed(4) ?? "—"}
          sub={`on ${h2h.games.toLocaleString()} shared games`}
        />
        <Tile
          label="Market Brier"
          value={h2h.market_brier?.toFixed(4) ?? "—"}
          sub={`model closer in ${h2h.seasons_model_better} of ${h2h.seasons_compared} seasons`}
        />
      </section>

      <section id="upsets" className="mb-12">
        <h2 className="text-2xl font-bold mb-1">The longest odds ever beaten</h2>
        <p className="text-[var(--text-muted)] text-sm max-w-3xl mb-4">
          Ranked by the chance the winner was given before kick-off, not by how well the game is
          remembered.
        </p>
        <TableScroll className="rounded-xl border" style={card}>
          <table className="w-full text-xs" data-sticky-col="2">
            <thead>
              <tr className="text-[var(--text-dim)] text-left">
                <th className="py-2 px-3 font-medium">#</th>
                <th className="py-2 px-3 font-medium">Winner</th>
                <th className="py-2 px-3 font-medium text-right">Chance</th>
                <th className="py-2 px-3 font-medium text-right">Score</th>
                <th className="py-2 px-3 font-medium">Beat</th>
                <th className="py-2 px-3 font-medium hidden sm:table-cell">Metro</th>
              </tr>
            </thead>
            <tbody>
              {topUpsets.map((u, i) => (
                <tr key={u.game_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={mono}>{i + 1}</td>
                  <td className="py-1.5 px-3 whitespace-nowrap">
                    <span className="tabular-nums text-[var(--text-dim)] mr-1.5" style={mono}>{u.season}</span>
                    <TeamLink name={u.winner} slug={u.winner_slug} />
                    {u.playoff ? (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">
                        {u.round ?? "playoff"}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: UP }}>
                    {pct(u.p_winner)}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{u.score ?? ""}</td>
                  <td className="py-1.5 px-3 whitespace-nowrap text-[var(--text-muted)]">
                    <TeamLink name={u.loser} slug={u.loser_slug} />
                  </td>
                  <td className="py-1.5 px-3 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">
                    {u.metro ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section id="seasons" className="mb-12">
        <h2 className="text-2xl font-bold mb-1">The seasons that broke the model</h2>
        <p className="text-[var(--text-muted)] text-sm max-w-3xl mb-4">
          Expected wins are the pre-game probabilities of a team&apos;s own games added up. The gap is
          the part nobody saw coming, in either direction.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SeasonTable rows={best_seasons.slice(0, 15)} caption="Most wins above expectation" />
          <SeasonTable rows={worst_seasons.slice(0, 15)} caption="Most wins below expectation" />
        </div>
      </section>

      <section id="metros" className="mb-12">
        <h2 className="text-2xl font-bold mb-1">A century of it, by metro</h2>
        <p className="text-[var(--text-muted)] text-sm max-w-3xl mb-4">
          Every team-season a metro has hosted, added together. Over this many games the noise
          should wash out, which is what makes the two ends of this table worth arguing about.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { key: "top", rows: metroTop, caption: "Beat expectation by most" },
            { key: "bottom", rows: metroBottom, caption: "Fell short by most" },
          ].map(({ key, rows, caption }) => (
            <div key={key} className="min-w-0">
              <h3 className="text-sm font-semibold mb-2">{caption}</h3>
              <TableScroll className="rounded-xl border" style={card}>
                <table className="w-full text-xs" data-sticky-col="2">
                  <thead>
                    <tr className="text-[var(--text-dim)] text-left">
                      <th className="py-2 px-3 font-medium">#</th>
                      <th className="py-2 px-3 font-medium">Metro</th>
                      <th className="py-2 px-3 font-medium text-right">vs expected</th>
                      <th className="py-2 px-3 font-medium text-right">Won</th>
                      <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Seasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m, i) => (
                      <tr key={m.metro} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={mono}>{i + 1}</td>
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          {m.metro_slug ? (
                            <Link href={`/rankings/${m.metro_slug}`} className="text-[var(--accent)] hover:underline">
                              {m.metro}
                            </Link>
                          ) : m.metro}
                        </td>
                        <td
                          className="py-1.5 px-3 text-right tabular-nums font-semibold"
                          style={{ ...mono, color: m.wae > 0 ? UP : DOWN }}
                        >
                          {signed(m.wae, 1)}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{m.wins}</td>
                        <td
                          className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell"
                          style={mono}
                        >
                          {m.seasons}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          ))}
        </div>
      </section>

      <section id="market" className="mb-12">
        <h2 className="text-2xl font-bold mb-1">The model against the market</h2>
        <p className="text-[var(--text-muted)] text-sm max-w-3xl mb-4">
          Where the record holds a closing spread as well as a rating, the two can be scored on the
          same games. Lower is better. The market usually wins, which is the honest answer and most
          of the reason the picks game is worth playing.
        </p>
        <TableScroll className="rounded-xl border" style={card}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-dim)] text-left">
                <th className="py-2 px-3 font-medium">Season</th>
                <th className="py-2 px-3 font-medium text-right">Model</th>
                <th className="py-2 px-3 font-medium text-right">Market</th>
                <th className="py-2 px-3 font-medium">Closer</th>
                <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Games</th>
              </tr>
            </thead>
            <tbody>
              {marketSeasons.map((s) => {
                // A season with no market number has no winner. Saying "Model"
                // there would claim the model beat a market that never had a
                // view, which is the same sin as letting absence read as a
                // result. Print why the column is empty instead.
                const reason = s.market_brier === null ? noMarketReason.get(s.season) : undefined;
                const modelBetter =
                  s.market_brier !== null && (s.model_brier ?? 1) < s.market_brier;
                return (
                  <tr key={s.season} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums" style={mono}>{s.season}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>
                      {s.model_brier?.toFixed(4)}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>
                      {s.market_brier === null ? (
                        <span className="text-[var(--text-dim)]">&mdash;</span>
                      ) : (
                        s.market_brier.toFixed(4)
                      )}
                    </td>
                    <td
                      className="py-1.5 px-3"
                      style={{ color: reason ? "var(--text-dim)" : modelBetter ? UP : "var(--text-muted)" }}
                    >
                      {reason ? <span className="text-[11px]">{reason}</span> : modelBetter ? "Model" : "Market"}
                    </td>
                    <td
                      className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell"
                      style={mono}
                    >
                      {s.market_games}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section className="rounded-xl border p-5 text-[13.5px] leading-relaxed" style={card}>
        <h2 className="text-base font-semibold mb-2">How this board works</h2>
        <p className="text-[var(--text-muted)]">
          Every game carries a pre-game win probability from the ratings held in{" "}
          <code>{meta.source}</code>. Expected wins are those probabilities added up over a
          team&apos;s own games, and the gap against real wins is what the board ranks. A tie counts
          as half a win to each side. The two sides of {meta.excluded_probability} games out of{" "}
          {meta.games.toLocaleString()} disagree on their own probabilities, and those are left out
          of scoring rather than patched. Scores are Brier scores, the same measure the picks game
          applies to a reader, so a 1958 afternoon and this weekend sit on one axis.
        </p>
        <p className="text-[var(--text-muted)] mt-3">
          The market column turns a closing spread into a win probability through a normal curve
          whose width was fitted on these games rather than borrowed from elsewhere:{" "}
          {meta.market_sigma} points, from {meta.market_sigma_fit_rows.toLocaleString()} results.
          Only seasons whose spreads pass an orientation check are used.{" "}
          {meta.market_too_sparse.length > 0 ? (
            <>
              {meta.market_too_sparse.length} early seasons carry a spread on too few games to test,
              and are left out.{" "}
            </>
          ) : null}
          {meta.market_excluded.length > 0 ? (
            <>
              {meta.market_excluded.map((m) => m.season).join(" and ")} are withheld because the
              favourite wins under half the time in the source, which means the sign is reversed
              there. The board refuses those seasons rather than quietly flipping them.{" "}
            </>
          ) : null}
          {meta.market_unconfirmed.length > 0 ? (
            <>
              {meta.market_unconfirmed.map((m) => m.season).join(" and ")} point the right way but
              on too few games to be sure, so they are held back as well.
            </>
          ) : null}
        </p>
        <p className="text-[var(--text-muted)] mt-3">
          Teams are printed under the name they carried at the time and linked to the franchise that
          owns the record, so the 1920 Decatur Staleys stand under their own name and still count
          for the Bears.
        </p>
      </section>
    </main>
  );
}
