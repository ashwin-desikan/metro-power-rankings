import type { Metadata } from "next";
import Link from "next/link";
import { getForecast } from "@/lib/forecast";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const revalidate = 21600; // pick up the forecast refresh without a build

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const PATH = "/predictions";
const TITLE = "Predictions";
const DESC =
  "Forecasts across politics and sport: live election models, and simulated title races for the NFL, College Football, the Premier League and the Champions League, modeled on the 2026 World Cup simulator. Ranges first, probabilities second, humility throughout.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

// The four league prediction hubs, coming soon. Each will get a title-odds
// simulator (like /teams/national#wc2026) and its own Beat-the-Model game that
// reads a per-league sim JSON (/data/<key>-sim.json) once the model is built.
const LEAGUE_HUBS: { key: string; emoji: string; name: string; season: string; blurb: string }[] = [
  { key: "nfl", emoji: "\u{1F3C8}", name: "NFL", season: "2026 season", blurb: "Super Bowl LXI title odds, conference and division races, and a weekly Beat-the-Model card." },
  { key: "cfb", emoji: "\u{1F3C8}", name: "College Football", season: "2026 season", blurb: "Playoff and national-title odds across the twelve-team field, conference by conference." },
  { key: "pl", emoji: "⚽", name: "Premier League", season: "2026-27 season", blurb: "Title, top-four and relegation odds from a full-season simulation." },
  { key: "ucl", emoji: "\u{1F3C6}", name: "Champions League", season: "2026-27 season", blurb: "Knockout-bracket odds from the league phase to the final, updated as it plays out." },
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
          of simulations, and the odds laid out so you can take the other side. Elections are live now;
          the league title-race hubs are on the way, modeled on the World Cup simulator.
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

      {/* League prediction hubs - coming soon */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
          <h2 className="text-2xl font-bold flex items-center gap-2"><span aria-hidden>&#127942;</span> League Prediction Hubs</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ ...MONO, color: "var(--accent)", background: "rgba(78,205,196,0.16)" }}>COMING SOON</span>
        </div>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-5">
          Each hub will run tens of thousands of simulated seasons and publish every team&apos;s title
          odds at each stage, with a Beat-the-Model card, exactly like the 2026 World Cup simulator below.
        </p>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {LEAGUE_HUBS.map((h) => (
            <div key={h.key} className="flex flex-col p-6 rounded-lg border opacity-90" style={CARD}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--text-muted)" }}>{h.season}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ ...MONO, color: "var(--text-dim)", background: "var(--bg-card-hover)" }}>SOON</span>
              </div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-2xl leading-none" aria-hidden>{h.emoji}</span>
                <h3 className="text-lg font-bold">{h.name}</h3>
              </div>
              <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{h.blurb}</p>
              <div className="mt-auto pt-3.5 border-t text-xs" style={{ ...MONO, color: "var(--text-dim)", borderColor: "var(--border)" }}>
                Simulator + Beat the Model
              </div>
            </div>
          ))}
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
          <Link href="/play/beat-the-model.html" className="inline-flex items-center gap-1.5 rounded-lg border font-semibold text-sm px-4 py-2 hover:border-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            Play Beat the Model <span aria-hidden>&rarr;</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
