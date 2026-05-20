import Link from 'next/link';
import { getSubstackPosts } from '@/lib/substack';

// Home discovery strip. Sits between the hero and the rankings table.
// Four cards that point at the parts of the site that are otherwise only
// reachable from the nav: the badge taxonomy, the sports cartography
// layer, the top-teams reference essay, and the latest Substack essay.
//
// Each card is a Link with a colored accent rule on the left edge, a
// title, and a one-line subtitle. No counts in the copy (the workbook
// changes too often). The Substack card pulls the most recent post from
// the same loader the Featured Articles strip below uses, so the title
// stays fresh without any new infrastructure.
//
// Server component — Substack RSS is fetched at build time / on ISR
// revalidate, never at request time.

type Card = {
  title: string;
  subtitle: string;
  href: string;
  external?: boolean;
  accent: string;
  eyebrow: string;
};

export default async function HomeConsole() {
  const posts = await getSubstackPosts(1);
  const latest = posts[0];

  const cards: Card[] = [
    {
      eyebrow: 'Badges',
      title: 'Explore by lens',
      subtitle:
        'Alternate views of the same dataset: Greying Power, Cosmopolitan Capital, Velvet Rock, and more.',
      href: '/badges',
      accent: '#7c3aed',
    },
    {
      eyebrow: 'Sports',
      title: 'Every team on one map',
      subtitle:
        'Cartography across the tracked sports, with per-franchise pages for NFL, NBA, MLB, and NHL.',
      href: '/sports',
      accent: '#2563eb',
    },
    {
      eyebrow: 'Reference',
      title: 'The team that wins the city',
      subtitle:
        'One crest per metro: the single franchise whose disappearance would change what the city is.',
      href: '/top-teams',
      accent: '#0891b2',
    },
    latest
      ? {
          eyebrow: 'From the journal',
          title: latest.title,
          subtitle:
            latest.description?.trim() ||
            'Long-form essays on civic geography, sports business, and the indices behind both.',
          href: latest.url,
          external: true,
          accent: '#16a34a',
        }
      : {
          eyebrow: 'From the journal',
          title: 'Citizen of Nowhere on Substack',
          subtitle:
            'Long-form essays on civic geography, sports business, and the indices behind both.',
          href: 'https://citizenofnowhere.substack.com',
          external: true,
          accent: '#16a34a',
        },
  ];

  return (
    <section
      className="px-4 sm:px-6 lg:px-8 pb-6 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="max-w-7xl mx-auto">
        <div
          className="text-[11px] tracking-widest uppercase mb-3"
          style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
        >
          Discover
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card, i) =>
            card.external ? (
              <a
                key={i}
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg border p-4 transition-colors hover:border-[var(--accent)]"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  borderLeftWidth: '3px',
                  borderLeftColor: card.accent,
                }}
              >
                <DiscoveryCardBody card={card} external />
              </a>
            ) : (
              <Link
                key={i}
                href={card.href}
                className="group block rounded-lg border p-4 transition-colors hover:border-[var(--accent)]"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  borderLeftWidth: '3px',
                  borderLeftColor: card.accent,
                }}
              >
                <DiscoveryCardBody card={card} />
              </Link>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function DiscoveryCardBody({ card, external }: { card: Card; external?: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[10px] tracking-widest uppercase"
          style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
        >
          {card.eyebrow}
        </span>
        <span
          className="text-xs transition-transform group-hover:translate-x-0.5"
          style={{ color: 'var(--text-muted)' }}
          aria-hidden="true"
        >
          {external ? '↗' : '→'}
        </span>
      </div>
      <div className="text-sm sm:text-[15px] font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
        {card.title}
      </div>
      <div
        className="text-xs leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
      >
        {card.subtitle}
      </div>
    </>
  );
}
