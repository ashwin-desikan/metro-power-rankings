#!/usr/bin/env python3
"""
Deep Dives hub + registry + nav rename. Run from the repo root:

    python scripts/deep-dives-hub.py

1. lib/deepDives.ts: single source of truth for editorial deep dives (on-site
   interactive features), each with an optional matching Substack URL.
2. app/deep-dives/page.tsx: a hub with two zones (Features = on-site pieces with
   a pinned spotlight; Writing = the live Substack feed, deduped against any
   essay already represented as a Feature). Mirrors the CoN Work/Writing split.
3. app/DesktopNav.tsx: the "Articles" menu becomes "Deep Dives", listing the
   features + an All deep dives link + On Substack, title-only (no busy hints).

Idempotent; backs up DesktopNav to *.v7.bak. page.tsx (/sports) untouched (its
band still uses its local list; unifying it onto this registry is a fast-follow).
Nothing committed.
"""
import os, sys, shutil

LIB = os.path.join("lib", "deepDives.ts")
HUB_DIR = os.path.join("app", "deep-dives")
HUB = os.path.join(HUB_DIR, "page.tsx")
NAV = os.path.join("app", "DesktopNav.tsx")

LIB_TS = r'''// Unified registry of editorial "deep dives": interactive on-site features
// that may also exist as a Substack essay. Single source of truth for the
// /deep-dives hub and the Deep Dives nav. Pure data (client- and server-safe).

export type DeepDiveDomain = "sports" | "metros" | "culture";

export type DeepDive = {
  slug: string;
  title: string;
  dek: string;
  href: string; // canonical on-site page
  tag: string;
  domain: DeepDiveDomain;
  accent: string;
  substackUrl?: string; // matching essay, if any (dedup + cross-link)
  featured?: boolean; // pinned spotlight on the hub
};

export const DEEP_DIVES: DeepDive[] = [
  {
    slug: "geography-of-erasure",
    title: "The Geography of Erasure",
    dek: "The champions the map forgot: dominant clubs erased when the metro behind them was outgrown by the modern league.",
    href: "/sports/geography-of-erasure",
    tag: "Ghost franchises",
    domain: "sports",
    accent: "#4ECDC4",
    substackUrl: "https://citizenofnowhere.substack.com/p/the-geography-of-erasure",
    featured: true,
  },
  {
    slug: "greatest-games",
    title: "The Greatest Games",
    dek: "The top games of all-time by Game Score across the NFL, NBA and MLB, plus every Stanley Cup presentation game.",
    href: "/sports/games",
    tag: "Cross-sport",
    domain: "sports",
    accent: "#a855f7",
  },
  {
    slug: "team-valuations",
    title: "Team Valuations",
    dek: "Franchise values across the NFL, NBA, MLB, NHL and global soccer, on one sortable board.",
    href: "/sports/valuations",
    tag: "Cross-sport",
    domain: "sports",
    accent: "#f59e0b",
  },
  {
    slug: "team-that-wins-the-city",
    title: "The Team That Wins the City",
    dek: "One crest per metro: the club whose disappearance would change what the metro is, not the one with the most trophies.",
    href: "/top-teams",
    tag: "Every metro",
    domain: "sports",
    accent: "#D4537E",
  },
  {
    slug: "last-of-the-marylebones",
    title: "The Last of the Marylebones",
    dek: "A taxonomy of the world's dense, historic, walkable, elite residential neighborhoods. A small qualifying set out of the full metro corpus.",
    href: "/neighborhoods",
    tag: "Global neighborhoods",
    domain: "metros",
    accent: "#639922",
  },
  {
    slug: "velvet-rock-capital",
    title: "Velvet Rock Capital",
    dek: "The producer-driven adult-pop catalog of 1974 to 1989, mapped: six cities and two islands that yacht rock flattened into a beach trope.",
    href: "/badges/velvet-rock-capital",
    tag: "Cultural geography",
    domain: "culture",
    accent: "#378ADD",
    substackUrl: "https://citizenofnowhere.substack.com/p/velvet-rock-the-map-yacht-rock-erased",
  },
];

export function featuredDeepDive(): DeepDive {
  return DEEP_DIVES.find((d) => d.featured) ?? DEEP_DIVES[0];
}

// Substack URLs already represented by an on-site feature, so the Writing
// zone can drop them and avoid showing a piece twice.
export const DEEP_DIVE_SUBSTACK_URLS = new Set(
  DEEP_DIVES.map((d) => d.substackUrl).filter((u): u is string => !!u),
);
'''

HUB_TSX = r'''import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import { getSubstackPosts } from "@/lib/substack";
import { DEEP_DIVES, featuredDeepDive, DEEP_DIVE_SUBSTACK_URLS, type DeepDive } from "@/lib/deepDives";

// Regenerate hourly so new Substack posts surface in the Writing zone without
// a rebuild (same ISR approach as the home page).
export const revalidate = 3600;

const PAGE_PATH = "/deep-dives";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Deep Dives";
const PAGE_DESCRIPTION =
  "Interactive features and essays behind the Global Metro Power Rankings: ghost sports franchises, the team that wins each city, the geography of producer-driven music, and more.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function formatMonthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function FeatureCard({ d, featured = false }: { d: DeepDive; featured?: boolean }) {
  return (
    <div
      className={`rounded-xl border transition-colors hover:bg-[var(--bg-card-hover)] ${featured ? "p-6" : "p-5"}`}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderLeftWidth: featured ? "4px" : "3px", borderLeftColor: d.accent }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: d.accent }}>{d.tag}</span>
        {featured && <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Featured</span>}
      </div>
      <Link href={d.href} className="group block">
        <div className={`font-bold tracking-tight mb-2 group-hover:text-[var(--accent)] ${featured ? "text-2xl" : "text-lg"}`}>{d.title}</div>
      </Link>
      <p className="text-sm text-[var(--text-muted)] max-w-2xl">{d.dek}</p>
      <div className="mt-3 flex items-center gap-4 text-xs font-semibold">
        <Link href={d.href} style={{ color: d.accent }}>Explore &rarr;</Link>
        {d.substackUrl && (
          <a href={d.substackUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-muted)] hover:text-[var(--accent)]">
            Essay on Substack &#8599;
          </a>
        )}
      </div>
    </div>
  );
}

export default async function DeepDivesPage() {
  const featured = featuredDeepDive();
  const rest = DEEP_DIVES.filter((d) => d.slug !== featured.slug);
  const posts = await getSubstackPosts(30);
  const writing = posts.filter((p) => !DEEP_DIVE_SUBSTACK_URLS.has(p.url));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Editorial</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Deep Dives</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          The interactive features and essays behind the rankings. Some of the thinking becomes software; some becomes writing.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Features", href: "#features" },
          { label: "Writing", href: "#writing" },
        ]}
      />

      <section id="features" className="mb-14 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">Features</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Interactive pieces you can explore on the site.</p>
        <div className="mb-3">
          <FeatureCard d={featured} featured />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rest.map((d) => (
            <FeatureCard key={d.slug} d={d} />
          ))}
        </div>
      </section>

      <section id="writing" className="mb-10 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">Writing</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Notes, essays, and field reports on Substack.</p>
        {writing.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {writing.map((p) => (
              <li key={p.slug} className="py-4 first:pt-0">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="group block">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatMonthYear(p.pubDate)} &middot; Substack
                  </div>
                  <div className="text-lg font-semibold tracking-tight group-hover:text-[var(--accent)]">
                    {p.title} <span className="text-[var(--text-muted)]" aria-hidden>&#8599;</span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] max-w-2xl mt-1">{p.description}</p>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">The Substack feed is unavailable right now. Read everything on{" "}
            <a href="https://citizenofnowhere.substack.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]">Citizen of Nowhere</a>.
          </p>
        )}
        <a
          href="https://citizenofnowhere.substack.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-6 text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          Read and subscribe on Substack &#8599;
        </a>
      </section>
    </main>
  );
}
'''

NAV_OLD = '''      <Dropdown id="articles" label="Articles" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="https://citizenofnowhere.substack.com" external title="Citizen of Nowhere" hint="All essays on Substack" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/neighborhoods" title="The Last of the Marylebones" hint="Global neighborhoods reference" />
        <DropdownItem href="/top-teams" title="The Team That Wins the City" hint="Top sports team by metro" />
      </Dropdown>'''
NAV_NEW = '''      <Dropdown id="articles" label="Deep Dives" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/deep-dives" title="All deep dives →" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/sports/geography-of-erasure" title="The Geography of Erasure" />
        <DropdownItem href="/sports/games" title="The Greatest Games" />
        <DropdownItem href="/sports/valuations" title="Team Valuations" />
        <DropdownItem href="/top-teams" title="The Team That Wins the City" />
        <DropdownItem href="/neighborhoods" title="The Last of the Marylebones" />
        <DropdownItem href="/badges/velvet-rock-capital" title="Velvet Rock Capital" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="https://citizenofnowhere.substack.com" external title="On Substack" />
      </Dropdown>'''


def fail(m): print("ABORTED: " + m); sys.exit(1)

def write_if_changed(path, content, label):
    if os.path.isfile(path) and open(path, encoding="utf-8").read() == content:
        print("  skip    " + path + " (unchanged)"); return
    if os.path.isfile(path):
        shutil.copyfile(path, path + ".v7.bak")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8", newline="\n").write(content)
    print("  wrote   " + path + " (" + label + ")")

def main():
    write_if_changed(LIB, LIB_TS, "deep dives registry")
    write_if_changed(HUB, HUB_TSX, "deep dives hub page")
    # DesktopNav rename
    if not os.path.isfile(NAV): fail(NAV + " not found. Run from the repo root.")
    nav = open(NAV, encoding="utf-8").read()
    if 'label="Deep Dives"' in nav:
        print("  skip    " + NAV + " (already renamed)")
    elif NAV_OLD not in nav:
        fail("Articles dropdown anchor not found in " + NAV + ". Send me the current file.")
    else:
        shutil.copyfile(NAV, NAV + ".v7.bak")
        open(NAV, "w", encoding="utf-8", newline="\n").write(nav.replace(NAV_OLD, NAV_NEW, 1))
        print("  patched " + NAV + " (Articles -> Deep Dives)")
    print()
    print("Done. Run your TS type check, then preview /deep-dives + the nav before committing.")

if __name__ == "__main__":
    main()
