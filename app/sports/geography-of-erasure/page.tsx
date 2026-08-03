import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import {
  GHOST_FRANCHISES,
  GHOST_SPECIES,
  ghostsBySpecies,
  ghostTeamHref,
  type GhostSpecies,
} from "@/lib/ghostFranchises";

export const dynamicParams = false;

const PAGE_PATH = "/sports/geography-of-erasure";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "The Geography of Erasure";
const PAGE_DESCRIPTION =
  "Ghost franchises: the champions the map forgot. Dominant clubs erased because the metro behind them was outgrown by the modern corporate league. Grouped into true deaths, relocation laundering, and living in exile.";
const SUBSTACK_URL = "https://citizenofnowhere.substack.com";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
  },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

const SPECIES_ORDER: GhostSpecies[] = ["true-death", "relocation-laundering", "living-exile"];

export default function GeographyOfErasurePage() {
  const total = GHOST_FRANCHISES.length;
  const leagues = new Set(GHOST_FRANCHISES.map((g) => g.league)).size;
  const live = GHOST_FRANCHISES.filter((g) => !g.pageComing).length;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          <Link href="/sports" className="hover:text-[var(--accent)]">All Sports</Link> &middot; Ghost Franchises
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">The Geography of Erasure</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Sport sells itself as a meritocracy. It is closer to a real estate game. Sporting history is not written by
          the winners but by the markets that survived. When a champion is based in a metro the modern corporate league
          has outgrown, the legacy does not get an asterisk. It gets deleted. These are the ghost franchises, the
          champions the map forgot, sorted by how they died.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{total}</strong> franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{leagues}</strong> leagues</div>
          <div><strong className="text-[var(--text)] text-sm">3</strong> species of erasure</div>
          <div><strong className="text-[var(--text)] text-sm">{live}</strong> with live team pages</div>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-4">
          Companion to the essay on{" "}
          <a href={SUBSTACK_URL} className="text-[var(--accent)] hover:underline" target="_blank" rel="noopener noreferrer">
            Citizen of Nowhere
          </a>
          . Every franchise below links to its page on this site.
        </p>
      </header>

      <HubNav
        items={SPECIES_ORDER.map((s) => ({ label: GHOST_SPECIES[s].label, href: `#${s}` }))}
      />

      {SPECIES_ORDER.map((species) => {
        const rows = ghostsBySpecies(species);
        const meta = GHOST_SPECIES[species];
        return (
          <section key={species} id={species} className="mb-12">
            <h2 className="text-lg font-semibold mb-1">{meta.label}</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">{meta.blurb}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rows.map((g) => {
                const href = ghostTeamHref(g);
                const inner = (
                  <div
                    className={`rounded-xl border p-5 h-full transition-colors ${
                      href ? "group hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" : "opacity-80"
                    }`}
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <div className={`font-semibold text-lg tracking-tight ${href ? "group-hover:text-[var(--accent)]" : ""}`}>
                        {g.name}
                      </div>
                      <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] whitespace-nowrap">
                        {g.sport}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mb-2">
                      {g.metro}
                      {g.heir ? <> &rarr; now <span className="text-[var(--text)]">{g.heir}</span></> : null}
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">{g.note}</p>
                    <div className="mt-3 text-xs font-semibold">
                      {href ? (
                        <span className="text-[var(--accent)]">View team page &rarr;</span>
                      ) : (
                        <span className="text-[var(--text-dim)]">Team page coming soon</span>
                      )}
                    </div>
                  </div>
                );
                return href ? (
                  <Link key={g.league + g.slug} href={href} className="block">
                    {inner}
                  </Link>
                ) : (
                  <div key={g.league + g.slug}>{inner}</div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="text-xs text-[var(--text-dim)] mt-4 max-w-3xl">
        A curated, non-exhaustive list. Franchise records and championship counts are drawn from the same workbook that
        powers the team pages linked above. The three species are an editorial taxonomy: a true death folds with no
        heir, relocation laundering moves and renames a surviving lineage, and a club living in exile endures but is
        locked out of the top tier.
      </p>
    </main>
  );
}
