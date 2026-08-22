import type { Metadata } from "next";
import Link from "next/link";
import { getForecast } from "@/lib/forecast";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const revalidate = 21600; // pick up the forecast refresh without a build

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const PATH = "/predictions";
const TITLE = "Predictions";
const DESC =
  "Forecasts across politics and sport, scored in public: live election models, simulated title races for the NFL, MLB, College Football and the Premier League.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

// The league prediction hubs. Each gets a title-odds simulator (like
// /teams/national#wc2026) reading a per-league sim JSON (/data/<key>-sim.json).
// `href` set = the model is built and the hub is live; the rest stay
// coming-soon cards. `game: false` = no Beat-the-Model card yet, so the footer
// must not promise one (MLB ships the simulator first).
const LEAGUE_HUBS: { key: string; emoji: string; name: string; season: string; blurb: string; href?: string; game?: boolean }[] = [
  { key: "nfl", emoji: "\u{1F3C8}", name: "NFL", season: "2026 season", blurb: "Super Bowl LXI, conference, division and playoff odds from the real 272-game schedule, with weekly game picks graded all season.", href: "/predictions/nfl" },
  { key: "mlb", emoji: "⚾", name: "MLB", season: "2026 season", blurb: "World Series, pennant, division and playoff odds from the real remaining schedule and the full twelve-team bracket, refreshed daily, with every race still open called out.", href: "/predictions/mlb", game: false },
  { key: "cfb", emoji: "\u{1F3C8}", name: "College Football", season: "2026 season", blurb: "Playoff, conference title and national championship odds across the twelve-team field, with every AP Top 25 game called weekly from the preseason poll on.", href: "/predictions/cfb", game: false },
  { key: "pl", emoji: "⚽", name: "Premier League", season: "2026-27 season", blurb: "Title, top-five and relegation odds from 20,000 simulated seasons blending site data with market odds, plus fixture picks graded all season.", href: "/predictions/pl" },
  { key: "ucl", emoji: "\u{1F3C6}", name: "Champions League", season: "2026-27 season", blurb: "Knockout-bracket odds from the league phase to the final. Arrives once the late-August draw sets the field." },
];

export default async function PredictionsPage() {
  const f = await getForecast();
  const us = f?.us ?? null;
  const sen = us?.senate ?? null;
  const gov = us?.governors ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <span>Predictions</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Predictions</h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          Forecasts across politics and sport, stated honestly: weighted averages, ranges from thousands
          of simulations, and the odds laid out so you can take the other side. Elections, the NFL, MLB,
          College Football and the Premier League are all live, and every call is scored afterwards
          against the price the market closed at.
        </p>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
          Ranges first, probabilities second, humility throughout
        </p>
      </header>

      {/* Elections - live */}
      <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-2xl font-bold flex items-center gap-2"><span aria-hidden>&#128499;&#65039;</span> Election Forecasts</h2>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
            <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
          The 2026 US midterms (House, Senate and governors), the next UK general election, and the 2026
          votes in Brazil, Israel and New Zealand, plus an early read on France 2027.
        </p>
        {us && (
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <div className="rounded-xl border p-4" style={CARD}>
              <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>US House</div>
              <div className="text-2xl font-bold" style={MONO}>{us.pDemHouse}%</div>
              <div className="text-xs text-[var(--text-muted)]">Democrats win control</div>
            </div>
            {sen && (
              <div className="rounded-xl border p-4" style={CARD}>
                <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>US Senate</div>
                <div className="text-2xl font-bold" style={MONO}>{sen.pDemControl}%</div>
                <div className="text-xs text-[var(--text-muted)]">Democratic control</div>
              </div>
            )}
            {gov && (
              <div className="rounded-xl border p-4" style={CARD}>
                <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>US Governors</div>
                <div className="text-2xl font-bold" style={MONO}>{gov.demSeats.median}</div>
                <div className="text-xs text-[var(--text-muted)]">Median D governorships (of 50)</div>
              </div>
            )}
          </div>
        )}
        <Link href="/elections/forecast" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--accent)" }}>
          Full election forecasts <span aria-hidden>&rarr;</span>
        </Link>
      </section>

      {/* The Ledger - the accountability surface for everything else on this page */}
      <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-2xl font-bold flex items-center gap-2"><span aria-hidden>&#128211;</span> The Ledger</h2>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
            <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
          Anyone can publish a probability. This is the record: every forecast scored against the price
          the betting market closed at, the probability bins showing whether seventy per cent has meant
          seventy per cent, and the seasons the model beat the market named one by one. Over twenty
          thousand priced games, the market is still ahead.
        </p>
        <Link href="/predictions/scoreboard" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--accent)" }}>
          See how the models have done <span aria-hidden>&rarr;</span>
        </Link>
      </section>

      {/* League prediction hubs */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
          <h2 className="text-2xl font-bold flex items-center gap-2"><span aria-hidden>&#127942;</span> League Prediction Hubs</h2>
        </div>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-5">
          Each hub runs tens of thousands of simulated seasons and publishes every team&apos;s odds
          at each stage, most with a Beat-the-Model card, exactly like the 2026 World Cup simulator
          below. The NFL, MLB, College Football and the Premier League are live; the Champions League
          arrives with the late-August draw.
        </p>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {LEAGUE_HUBS.map((h) => {
            const inner = (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--text-muted)" }}>{h.season}</span>
                  {h.href ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
                      <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ ...MONO, color: "var(--text-dim)", background: "var(--bg-card-hover)" }}>SOON</span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="text-2xl leading-none" aria-hidden>{h.emoji}</span>
                  <h3 className="text-lg font-bold">{h.name}</h3>
                </div>
                <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{h.blurb}</p>
                <div className="mt-auto pt-3.5 border-t text-xs" style={{ ...MONO, color: h.href ? "var(--accent)" : "var(--text-dim)", borderColor: "var(--border)" }}>
                  {h.game === false ? "Simulator" : "Simulator + Beat the Model"}
                  {h.href ? <span aria-hidden> &rarr;</span> : null}
                </div>
              </>
            );
            return h.href ? (
              <Link key={h.key} href={h.href} className="flex flex-col p-6 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={CARD}>
                {inner}
              </Link>
            ) : (
              <div key={h.key} className="flex flex-col p-6 rounded-lg border opacity-90" style={CARD}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* Working example - WC2026 */}
      <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-2xl font-bold flex items-center gap-2"><span aria-hidden>&#9917;</span> The template: World Cup 2026</h2>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
            <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
          The 2026 World Cup simulator is the working model the league hubs are built from: title odds for
          every nation, updated as the tournament plays out, and a Beat-the-Model card where you back the
          calls the simulator is least sure about.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/teams/national#wc2026" className="inline-flex items-center gap-1.5 rounded-lg font-semibold text-sm px-4 py-2" style={{ backgroundColor: "var(--accent)", color: "#08080D" }}>
            The World Cup simulator <span aria-hidden>&rarr;</span>
          </Link>
          <Link href="/play/picks" className="inline-flex items-center gap-1.5 rounded-lg border font-semibold text-sm px-4 py-2 hover:border-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            Play Citizen of Nowhere Picks <span aria-hidden>&rarr;</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
