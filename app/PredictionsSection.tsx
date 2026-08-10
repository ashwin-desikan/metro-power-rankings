import Link from "next/link";
import { getForecast } from "@/lib/forecast";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Home-page "Predictions" band (sits where the Activity rail used to). Three
// entries: the live election forecasts, the (placeholder) league Prediction
// Hubs modeled on the World Cup simulator, and the Beat-the-Model game.
// Server component; the only async work is the shared forecast ISR read.
export default async function PredictionsSection() {
  const f = await getForecast();
  const us = f?.us ?? null;
  const usLine = us
    ? `Generic ballot D${us.margin >= 0 ? "+" : ""}${us.margin.toFixed(1)} - Democrats take the House in ${us.pDemHouse}% of simulations`
    : "Weighted polling averages and seat ranges from thousands of simulations.";

  const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

  return (
    <section id="predictions" className="py-14 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline justify-between gap-4 mb-2 flex-wrap">
          <p className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--accent)" }}>Predictions</p>
          <Link href="/predictions" className="text-[13px]" style={{ ...MONO, color: "var(--accent)" }}>All predictions <span aria-hidden>&rarr;</span></Link>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Where the models are pointing</h2>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl mb-8">
          Forecasts stated honestly: weighted averages, ranges from thousands of simulations, and the
          odds laid out so you can take the other side. Elections, the Premier League and the NFL now;
          College Football and the Champions League next.
        </p>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {/* Election forecasts - live */}
          <Link href="/elections/forecast" className="flex flex-col p-6 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={CARD}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--text-muted)" }}>Elections</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
                <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-2xl leading-none" aria-hidden>&#128499;&#65039;</span>
              <h3 className="text-lg font-bold">Election Forecasts</h3>
            </div>
            <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{usLine}</p>
            <div className="flex items-center justify-between mt-auto pt-3.5 border-t" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs" style={{ ...MONO, color: "var(--accent)" }}>US midterms - UK - BR - IL - NZ - FR</span>
              <span className="text-[var(--text-dim)]" aria-hidden>See all &rarr;</span>
            </div>
          </Link>

          {/* League prediction hubs - placeholder */}
          <Link href="/predictions" className="flex flex-col p-6 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={CARD}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--text-muted)" }}>Sports</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
                <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>PL + NFL LIVE</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-2xl leading-none" aria-hidden>&#127942;</span>
              <h3 className="text-lg font-bold">Prediction Hubs</h3>
            </div>
            <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
              The Premier League and NFL hubs are live: season odds from 20,000 simulations each, weekly
              picks graded against results. College Football and the Champions League follow.
            </p>
            <div className="flex items-center justify-between mt-auto pt-3.5 border-t" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs" style={{ ...MONO, color: "var(--accent)" }}>NFL - CFB - PL - UCL</span>
              <span className="text-[var(--text-dim)]" aria-hidden>Preview &rarr;</span>
            </div>
          </Link>

          {/* Citizen of Nowhere Picks - weekly pick'em against the models */}
          <Link href="/play/picks" className="flex flex-col p-6 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={CARD}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--text-muted)" }}>Play</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
                <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-2xl leading-none" aria-hidden>&#127919;</span>
              <h3 className="text-lg font-bold">Citizen of Nowhere Picks</h3>
            </div>
            <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
              Call every game blind, rank your confidence, and take a side where the model and the market
              disagree. The model plays its own card, graded by the same rules.
            </p>
            <div className="flex items-center justify-between mt-auto pt-3.5 border-t" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs" style={{ ...MONO, color: "var(--accent)" }}>Premier League &middot; NFL</span>
              <span className="text-[var(--text-dim)]" aria-hidden>Play &rarr;</span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
