import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";

const PAGE_PATH = "/geography";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Geography";
const PAGE_DESCRIPTION =
  "The atlas of where power lives: every metro, country, and subdivision on Earth, the people and offices that run them, the alliances and wars between them, and a 235-year ranking of national power.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

type Card = { emoji: string; title: string; desc: string; href: string; tag?: string };

const PLACES: Card[] = [
  { emoji: "🌐", title: "Metro Power Rankings", desc: "Every metro on Earth, scored across sixteen weighted dimensions.", href: "/rankings" },
  { emoji: "🏳️", title: "Countries", desc: "Every sovereign state and territory, with leaders, economy, teams, and power.", href: "/countries" },
  { emoji: "🗺️", title: "States & Provinces", desc: "First-level subdivisions and the metro strength inside each.", href: "/states" },
  { emoji: "🧭", title: "Expandable Map", desc: "Pan and zoom the ranked world, metro by metro.", href: "/expandable-map" },
  { emoji: "⚖️", title: "Compare Metros", desc: "Put any two metros side by side, dimension by dimension.", href: "/compare" },
  { emoji: "🥊", title: "Matchups", desc: "Head-to-head metro showdowns, London versus New York and beyond.", href: "/matchups/london-vs-new-york" },
  { emoji: "🏘️", title: "Neighborhoods", desc: "Inside the metros: districts, boroughs, and the neighborhoods that make them.", href: "/neighborhoods" },
];
const PEOPLE: Card[] = [
  { emoji: "👑", title: "The Nowhere 100", desc: "The hundred most powerful people alive, on one Metro Power scale.", href: "/power" },
  { emoji: "🎖️", title: "World Leaders", desc: "Every head of state and government, with a time machine back to antiquity.", href: "/leaders" },
  { emoji: "💰", title: "Billionaires", desc: "The world's wealthiest, placed on the metros that made them.", href: "/billionaires" },
  { emoji: "🏛️", title: "US Political Leadership", desc: "The executive, Congress, the Supreme Court, and the fifty governors.", href: "/us-political-leadership" },
  { emoji: "🏛️", title: "UK Political Leadership", desc: "The Crown, Prime Minister, Parliament and devolved nations.", href: "/uk-political-leadership" },
  { emoji: "🗳️", title: "Elections", desc: "Every election in 35 countries and the EU, from the US and UK to Brazil, Japan, and beyond.", href: "/elections" },
  { emoji: "🏙️", title: "Mayors of the World", desc: "Who runs the great cities, capital by capital.", href: "/mayors" },
];
const GEOPOLITICS: Card[] = [
  { emoji: "🤝", title: "Alliances & Orgs", desc: "NATO, the UN, the EU, and the blocs that bind states together.", href: "/orgs" },
  { emoji: "⚔️", title: "Interstate Wars", desc: "The wars fought between states, mapped and ranked.", href: "/conflicts" },
];
const MORE: Card[] = [
  { emoji: "🏅", title: "Badges", desc: "The same geography reframed through categorical lenses.", href: "/badges" },
  { emoji: "🎲", title: "Random Metro", desc: "Not sure where to start? Jump somewhere on the map.", href: "/random" },
];

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
      {cards.map((c) => (
        <Link key={c.href} href={c.href} className="flex flex-col gap-2 p-5 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
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

function SectionHead({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] uppercase tracking-widest mb-2" style={{ ...mono, color: "var(--accent)" }}>{eyebrow}</p>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">{blurb}</p>
    </div>
  );
}

export default function GeographyHubPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={mono}>&larr; Back to rankings</Link>
          <Link href="/sports" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={mono}>Sports hub &rarr;</Link>
          <Link href="/sound" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={mono}>Sound hub &rarr;</Link>
        </nav>

        <header className="mb-8 border-b border-[var(--border)] pb-8">
          <p className="text-xs tracking-widest text-[var(--text-muted)] mb-3" style={mono}>GEOGRAPHY</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">The atlas of where power lives.</h1>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
            Everything on the site that maps the world: the metros that concentrate civilization, the countries and
            states that contain them, the people and offices that run them, the alliances and wars between them, and a
            year-by-year ranking of national power stretching back to 1500.
          </p>
        </header>

        <HubNav items={[
          { label: "Places & directories", href: "#places" },
          { label: "People & power", href: "#people" },
          { label: "Geopolitics", href: "#geopolitics" },
          { label: "More", href: "#more" },
        ]} />

        {/* Featured: The Power Atlas */}
        <Link href="/power-atlas" className="group block rounded-xl border p-6 mb-10 transition-colors hover:bg-[var(--bg-card-hover)]" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", borderLeftWidth: "4px", borderLeftColor: "var(--accent)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ ...mono, color: "var(--accent)", background: "rgba(78,205,196,0.16)" }}>New · Featured</span>
          </div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-2"><span aria-hidden>🏛️</span> The Power Atlas</h2>
          <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
            A single index of national power, computed for every state from 1500 to today and ranked against its
            contemporaries. Slide through five centuries and watch empires rise and fall, from the Age of Discovery
            through Pax Britannica and the bipolar Cold War to now, with latent-versus-recognised lenses and a
            rising-and-fading divergence view.
          </p>
          <span className="inline-flex items-center gap-1 mt-3 text-xs" style={{ ...mono, color: "var(--accent)" }}>Open the atlas <span aria-hidden>→</span></span>
        </Link>

        <section id="places" className="mb-12 scroll-mt-24">
          <SectionHead eyebrow="Places & directories" title="The map itself" blurb="Metros, countries, and subdivisions, plus the tools to explore and compare them." />
          <CardGrid cards={PLACES} />
        </section>

        <section id="people" className="mb-12 scroll-mt-24">
          <SectionHead eyebrow="People & power" title="Who holds it" blurb="The powerful, the wealthy, and the elected, from the hundred most powerful people to every head of state, mapped to the places they run." />
          <CardGrid cards={PEOPLE} />
        </section>

        <section id="geopolitics" className="mb-12 scroll-mt-24">
          <SectionHead eyebrow="Geopolitics" title="Between states" blurb="The alliances that bind states and the wars that divide them." />
          <CardGrid cards={GEOPOLITICS} />
        </section>

        <section id="more" className="mb-4 scroll-mt-24">
          <SectionHead eyebrow="More" title="Ways in" blurb="Categorical lenses on the same data, and a door chosen at random." />
          <CardGrid cards={MORE} />
        </section>
      </main>
    </>
  );
}
