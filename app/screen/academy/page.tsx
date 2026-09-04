import type { Metadata } from "next";
import { getScreen } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ScreenNav from "../ScreenNav";

export const dynamic = "force-static";

const TITLE = "Screen of the Metros: The Academy";
const DESC =
  "The Academy versus the box office: how Best Picture winners stopped being hits, decade by decade, and where the Academy's nominees are born, from a Hollywood company town to a global institution.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/academy" },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/academy`, type: "website" },
};

const DEC_COLORS: Record<string, string> = { us: "#5B8DEF", ukie: "#E06C75", europe: "#02A95B", world: "#D9A038" };
const DEC_NAMES: Record<string, string> = { us: "United States", ukie: "UK & Ireland", europe: "Continental Europe", world: "Rest of the world" };

function DecadesChart({ decades }: { decades: { decade: number; us: number; ukie: number; europe: number; world: number }[] }) {
  const W = 720, H = 240, PAD = 36;
  const xs = decades.map((d) => d.decade);
  const x = (v: number) => PAD + ((v - xs[0]) / (xs[xs.length - 1] - xs[0])) * (W - PAD * 2);
  const yMax = 80;
  const y = (v: number) => H - PAD + 10 - (v / yMax) * (H - PAD * 2);
  const series = (["us", "ukie", "europe", "world"] as const).map((k) => ({
    k,
    pts: decades.map((d) => `${x(d.decade).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" "),
  }));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Nominee birthplaces by decade">
        {[0, 20, 40, 60, 80].map((t) => (
          <g key={t}>
            <line x1={PAD} x2={W - PAD} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--text-dim)">{t}%</text>
          </g>
        ))}
        {xs.map((d) => (
          <text key={d} x={x(d)} y={H - PAD + 24} textAnchor="middle" fontSize="9" fill="var(--text-dim)">{`${d}s`}</text>
        ))}
        {series.map((s) => (
          <polyline key={s.k} points={s.pts} fill="none" stroke={DEC_COLORS[s.k]} strokeWidth="2.25" strokeLinejoin="round" />
        ))}
        {series.map((s) =>
          decades.map((d) => (
            <circle key={`${s.k}${d.decade}`} cx={x(d.decade)} cy={y(d[s.k])} r="2.5" fill={DEC_COLORS[s.k]} />
          )),
        )}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mt-1">
        {(["us", "ukie", "europe", "world"] as const).map((k) => (
          <span key={k}>
            <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: DEC_COLORS[k] }} />
            <span className="text-[var(--text-muted)]">{DEC_NAMES[k]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ScreenAcademyPage() {
  const f = getScreen();
  if (!f) return <main className="mx-auto max-w-6xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">The Academy</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">{DESC}</p>
      </header>

      {f.academy ? (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-1 text-[var(--text)]">The Academy vs the box office</h2>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
            Share of Best Picture winners that were also top-ten grossers of their year. The
            Academy and the audience agreed for half a century. Every 1970s winner was a box
            office hit, then parted ways: not one 2010s Best Picture cracked its year&apos;s top
            ten worldwide.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              {/* min-w-0 on each bar: a flex item's automatic minimum size is
                  its content, so eleven "1920s" labels refused to shrink and
                  pushed the page to 402px at 390px wide. Tighter gap on
                  phones buys the labels the room they need. */}
              <div className="flex items-end gap-1 sm:gap-2 h-40">
                {f.academy.decades.map((d) => (
                  <div key={d.decade} className="min-w-0 flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-[10px] tabular-nums text-[var(--text-muted)] mb-0.5">{Math.round(d.pctTop10)}%</span>
                    <div className="w-full rounded-t" style={{ height: `${Math.max(2, d.pctTop10)}%`, backgroundColor: d.pctTop10 >= 50 ? "#5B8DEF" : "#E06C75" }} />
                    <span className="text-[9px] text-[var(--text-dim)] mt-1">{`${d.decade}s`}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--text-dim)] mt-3">
                Blue decades: the winner was usually a hit. Red: prestige and popularity had split.
              </p>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-semibold text-sm text-[var(--text)] mb-2">The last twenty winners</h3>
              <div className="grid gap-1 text-xs">
                {f.academy.winners.slice(-20).reverse().map((w) => (
                  <div key={w.year} className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--text)] font-semibold truncate">{w.title} <span className="font-normal text-[var(--text-dim)]">{w.year}</span></span>
                    <span className="tabular-nums shrink-0" style={{ color: w.rank != null ? "#5B8DEF" : "var(--text-dim)" }}>
                      {w.rank != null ? `#${w.rank} grosser of its year` : "outside the top ten"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-6">
        <h2 className="text-xl font-bold mb-1 text-[var(--text)]">Where the Academy&apos;s nominees are born</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
          Share of Oscar nomination slots by nominees&apos; birthplace, per decade. The American
          share has fallen from three-quarters in the 1950s to under half in the 2020s: the
          Academy&apos;s slow globalisation, visible in one chart.
        </p>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <DecadesChart decades={f.decades} />
        </div>
      </section>
    </main>
  );
}
