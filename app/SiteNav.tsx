import { getMeta } from '@/lib/data';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[parseInt(m[2], 10) - 1];
  const day = parseInt(m[3], 10);
  const year = m[1];
  return `${month} ${day}, ${year}`;
}

export default function SiteNav() {
  const meta = getMeta();
  const updated = meta.lastUpdate ? formatIsoDate(meta.lastUpdate) : null;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
      style={{
        backgroundColor: 'rgba(8, 8, 13, 0.8)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
        <a
          href="/"
          className="text-lg font-bold tracking-tight hover:opacity-80 transition whitespace-nowrap"
          style={{
            color: 'var(--accent)',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          METRO POWER RANKINGS
        </a>
        <div className="hidden md:flex gap-6 items-center">
          <a
            href="/#rankings"
            className="text-sm hover:text-[var(--accent)] transition-colors"
          >
            Rankings
          </a>
          <a
            href="/compare"
            className="text-sm hover:text-[var(--accent)] transition-colors"
          >
            Compare
          </a>
          <a
            href="/#regions"
            className="text-sm hover:text-[var(--accent)] transition-colors"
          >
            Regions
          </a>
          <a
            href="https://citizenofnowhere.substack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:text-[var(--accent)] transition-colors"
          >
            Articles
          </a>
          <a
            href="/#methodology"
            className="text-sm hover:text-[var(--accent)] transition-colors"
          >
            Methodology
          </a>
          {updated && (
            <span
              className="hidden lg:inline-block text-xs text-[var(--text-muted)] border rounded px-2 py-1 whitespace-nowrap"
              style={{
                borderColor: 'var(--border)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
              title={`Source data last updated ${updated}`}
            >
              Updated {updated}
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
