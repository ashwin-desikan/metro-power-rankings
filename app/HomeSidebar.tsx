import Link from 'next/link';
import { getSubstackPosts } from '@/lib/substack';
import { RELEASES } from '@/lib/releases';

// Home sidebar / side feed. Sits alongside the rankings table at lg+ and
// stacks below at smaller widths. Surfaces the surfaces that would
// otherwise live only in the nav:
//   1. Discover — categorical entry points (Badges, Sports, Top Teams, Compare)
//   2. From the journal — latest Substack essays (chronological)
//   3. Recently shipped — last few /updates headlines (chronological)
//   4. Random metro CTA at the foot
//
// Server component. Substack RSS is fetched at build time / ISR
// revalidate; releases come from the shared lib/releases module.

type DiscoverCard = {
  eyebrow: string;
  title: string;
  href: string;
  external?: boolean;
  accent: string;
};

const DISCOVER: DiscoverCard[] = [
  {
    eyebrow: 'Badges',
    title: 'Explore by lens',
    href: '/badges',
    accent: '#7c3aed',
  },
  {
    eyebrow: 'Sports',
    title: 'Every team on one map',
    href: '/sports',
    accent: '#2563eb',
  },
  {
    eyebrow: 'Reference',
    title: 'The team that wins the city',
    href: '/top-teams',
    accent: '#0891b2',
  },
  {
    eyebrow: 'Compare',
    title: 'Two metros side by side',
    href: '/compare',
    accent: '#16a34a',
  },
];

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}`;
}

export default async function HomeSidebar() {
  const posts = await getSubstackPosts(3);
  const recentReleases = RELEASES.slice(0, 3);

  return (
    <aside
      className="space-y-5 lg:sticky lg:top-20"
      style={{ alignSelf: 'start' }}
    >
      <Section title="Discover">
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
          {DISCOVER.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group block rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--accent)]"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                borderLeftWidth: '3px',
                borderLeftColor: c.accent,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="text-[10px] tracking-widest uppercase"
                    style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {c.eyebrow}
                  </div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {c.title}
                  </div>
                </div>
                <span
                  className="text-xs transition-transform group-hover:translate-x-0.5"
                  style={{ color: 'var(--text-muted)' }}
                  aria-hidden="true"
                >
                  &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {posts.length > 0 && (
        <Section title="From the journal">
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.slug}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div
                    className="text-[10px] mb-0.5"
                    style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {formatDate(p.pubDate)} &middot; Substack
                  </div>
                  <div className="text-sm font-medium leading-snug group-hover:text-[var(--accent)] transition-colors" style={{ color: 'var(--text)' }}>
                    {p.title} <span style={{ color: 'var(--text-muted)' }}>&nbsp;&#8599;</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
          <a
            href="https://citizenofnowhere.substack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-[11px] hover:text-[var(--accent)] transition-colors"
            style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            All essays &#8599;
          </a>
        </Section>
      )}

      {recentReleases.length > 0 && (
        <Section title="Recently shipped">
          <ul className="space-y-2">
            {recentReleases.map((r, i) => (
              <li key={`${r.date}-${i}`}>
                <div
                  className="text-[10px] mb-0.5"
                  style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatDate(r.date)}
                </div>
                <div className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>
                  {r.headline}
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/updates"
            className="inline-block mt-2 text-[11px] hover:text-[var(--accent)] transition-colors"
            style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            All updates &rarr;
          </Link>
        </Section>
      )}

      <div className="flex items-center gap-2 text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <Link
          href="/random"
          className="flex-1 text-center rounded-md border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Random metro &rarr;
        </Link>
        <Link
          href="/methodology"
          className="flex-1 text-center rounded-md border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Methodology &rarr;
        </Link>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[10px] tracking-widest uppercase mb-2"
        style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
