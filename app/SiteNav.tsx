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
        <div className="flex items-center gap-4 min-w-0">
          <a
            href="https://citizenofnowhere.org"
            className="hidden sm:inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors whitespace-nowrap"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
            title="Back to Citizen of Nowhere"
          >
            <span aria-hidden="true">&larr;</span>
            <span>Citizen of Nowhere</span>
          </a>
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
        </div>
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
          <div className="relative group">
            <button
              type="button"
              className="text-sm hover:text-[var(--accent)] transition-colors flex items-center gap-1 py-1"
              aria-haspopup="true"
            >
              Articles
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <div
              className="invisible opacity-0 group-hover:visible group-hover:opacity-100 focus-within:visible focus-within:opacity-100 absolute right-0 top-full pt-2 transition-opacity duration-150"
              style={{ minWidth: "260px" }}
            >
              <div
                className="border rounded-md shadow-xl backdrop-blur-md overflow-hidden"
                style={{
                  backgroundColor: "rgba(8, 8, 13, 0.95)",
                  borderColor: "var(--border)",
                }}
              >
                <a
                  href="https://citizenofnowhere.substack.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 text-sm hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
                >
                  <div className="font-medium">Citizen of Nowhere</div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    All essays on Substack
                  </div>
                </a>
                <div className="border-t" style={{ borderColor: "var(--border)" }} />
                <a
                  href="/neighborhoods"
                  className="block px-4 py-3 text-sm hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
                >
                  <div className="font-medium">The Last of the Marylebones</div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Global neighborhoods reference
                  </div>
                </a>
              </div>
            </div>
          </div>
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
