import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { SectionHead } from "@/app/_shared/SectionHead";
import { getOrderGrid, getRecognitionGap, getTrajectory } from "@/lib/order";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";

const PATH = "/order";
const TITLE = "Order";
const DESC =
  "The instruments of political order: a force and integrity grid for every state, the gap between what a country is and what it is recognised as, and the ledgers of power, law, capital, sport and culture behind them.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC, images: ["/og-default.png"] },
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

type Card = { emoji: string; title: string; desc: string; href: string };

const LEDGERS: Card[] = [
  { emoji: "⚔️", title: "Force", desc: "Recognised and latent power for every state since 1500, plus the wars and the alliances between them.", href: "/power-atlas" },
  { emoji: "📜", title: "Rule", desc: "Constitutions since 1789, their lifespans, suspensions and amendment rates.", href: "/constitutions" },
  { emoji: "🗳️", title: "Accountability", desc: "Every election in 35 countries and the EU, with turnout and how far seats stray from votes.", href: "/elections" },
  { emoji: "💵", title: "Capital", desc: "The companies, owners, currencies and central bankers, and the corporate ranking back to 1955.", href: "/business" },
  { emoji: "🏅", title: "Glory", desc: "National sporting merit across 96 disciplines, including nations that no longer exist and one that has no territory.", href: "/sports/zone-zero-cup" },
  { emoji: "🎬", title: "Culture", desc: "A century of screen and seventy years of charts, attributed to the places that produced them.", href: "/sound" },
];

function Cards({ cards }: { cards: Card[] }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
      {cards.map((c) => (
        <Link key={c.href} href={c.href} className="flex flex-col gap-2 p-5 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={CARD}>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none" aria-hidden>{c.emoji}</span>
            <h3 className="text-lg font-bold">{c.title}</h3>
          </div>
          <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{c.desc}</p>
        </Link>
      ))}
    </div>
  );
}

export default function OrderHubPage() {
  const grid = getOrderGrid();
  const gap = getRecognitionGap();
  const traj = getTrajectory();
  const cov = grid.meta.coverage;
  const tcov = traj.meta.coverage;
  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TITLE,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={MONO}>
          <Link href="/" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">&larr; Back to rankings</Link>
          <Link href="/geography" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Geography hub &rarr;</Link>
          <Link href="/order/about" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">What this is &rarr;</Link>
        </nav>

        <header className="mb-8 border-b pb-8" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs tracking-widest text-[var(--text-muted)] mb-3" style={MONO}>ORDER</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">No country is finished.</h1>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
            Political order has three legs: a state that can act, a law that binds the ruler, and a way for society to
            hold both to account. This layer measures them, refuses to call any arrangement final, and puts a date on
            every claim.{" "}
            <Link href="/order/about" className="underline hover:text-[var(--accent)]">Read the argument</Link>.
          </p>
        </header>

        <HubNav items={[
          { label: "Instruments", href: "#instruments" },
          { label: "The ledgers", href: "#ledgers" },
          { label: "What is missing", href: "#missing" },
        ]} />

        <section id="instruments" className="mb-12 scroll-mt-24">
          <SectionHead
            title="Instruments"
            sub="Boards that stay true after the essay is old."
            eyebrow="Measured"
          />
          <Link href="/order/grid" className="group block rounded-xl border p-6 mb-4 transition-colors hover:bg-[var(--bg-card-hover)]" style={{ ...CARD, borderLeftWidth: "4px", borderLeftColor: "var(--accent)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ ...MONO, color: "var(--accent)", background: "rgba(78,205,196,0.16)" }}>New</span>
            </div>
            <h3 className="text-2xl font-bold mb-1 flex items-center gap-2"><span aria-hidden>🧭</span> The Order Grid</h3>
            <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
              Every state placed on two measures at once: what it can do, and what binds it. {cov.scored} states across
              nine positions in {grid.year}, and a tenth, the Vanguard, that stays empty. The nearest anything gets to it
              is {cov.closestName} at {cov.closestDistance} on a scale where zero is the corner, and the median state
              sits {cov.medianDistance} away.
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs" style={{ ...MONO, color: "var(--accent)" }}>Open the grid <span aria-hidden>→</span></span>
          </Link>
          <Link href="/order/trajectory" className="group block rounded-xl border p-6 mb-4 transition-colors hover:bg-[var(--bg-card-hover)]" style={{ ...CARD, borderLeftWidth: "4px", borderLeftColor: "var(--cat-3)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ ...MONO, color: "var(--accent)", background: "rgba(78,205,196,0.16)" }}>New</span>
            </div>
            <h3 className="text-2xl font-bold mb-1 flex items-center gap-2"><span aria-hidden>📉</span> Direction of Travel</h3>
            <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
              Where a country stands matters less than which way it is going. Flagged leadership across {tcov.withFlagHistory} countries
              since {traj.meta.windows.panelFrom}, constitutional ruptures, and turnout measured against each country&apos;s own
              post-war record. {tcov.newlyFlagged} states entered a flagged period in the last decade.
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs" style={{ ...MONO, color: "var(--accent)" }}>Open the board <span aria-hidden>→</span></span>
          </Link>
          <Link href="/order/recognition-gap" className="group block rounded-xl border p-6 transition-colors hover:bg-[var(--bg-card-hover)]" style={CARD}>
            <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><span aria-hidden>⚖️</span> The Recognition Gap</h3>
            <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
              The distance between what a country weighs and what it is treated as weighing, for {gap.current.length} states
              in {gap.year} and back to {gap.meta.seriesFrom} for the powers that have led the table.
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs" style={{ ...MONO, color: "var(--accent)" }}>Open the board <span aria-hidden>→</span></span>
          </Link>
        </section>

        <section id="ledgers" className="mb-12 scroll-mt-24">
          <SectionHead
            title="The ledgers"
            sub="Six currencies of recognition, each already built somewhere on this site."
            eyebrow="Sources"
            more={
              <p>
                A society gives its most ambitious people somewhere to go. Fukuyama&apos;s argument for capitalism was that it
                offered an alternative to politics, so the contest for power did not have to be zero sum. Whether that still
                holds is a question about channels, and these six are the channels this site can already measure. The{" "}
                <Link href="/power" className="underline hover:text-[var(--accent)]">Nowhere 100</Link> already blends all of
                them into a single score.
              </p>
            }
          />
          <Cards cards={LEDGERS} />
        </section>

        <section id="missing" className="mb-4 scroll-mt-24">
          <SectionHead
            title="What is missing"
            sub="Stated here rather than filled in with a plausible number."
            eyebrow="Gaps"
          />
          <ul className="text-[15px] text-[var(--text-muted)] leading-relaxed space-y-2 list-disc pl-5 max-w-3xl">
            <li>
              Fiscal capacity. What a state raises in tax is the standard measure of what it can actually do, and this site
              has none of it yet. The country indicators build has been wired for it and it lands on the next run.
            </li>
            <li>
              A time series for integrity. The rule of law reading is one recent cross-section, so the grid is a snapshot of{" "}
              {grid.year} and not yet a history.
            </li>
            <li>
              {cov.unscored} states in the Power Atlas have no rule of law reading and sit off the grid. They are named on the
              grid page rather than quietly dropped.
            </li>
            <li>
              Whether the recognition gap leads a war is an open question here, not a finding. It needs a coding of who
              started what, which the war dataset does not carry.
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
