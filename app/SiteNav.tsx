import { getMeta } from "@/lib/data";
import MobileMenu from "./MobileMenu";
import DesktopNav from "./DesktopNav";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[parseInt(m[2], 10) - 1];
  const day = parseInt(m[3], 10);
  const year = m[1];
  return `${month} ${day}, ${year}`;
}

// Server shell: reads meta from disk and passes the formatted date prop
// down to the client DesktopNav (which owns the stateful dropdowns) and
// MobileMenu. Keeping the data read on the server avoids shipping the
// meta.json contents to the client bundle.
export default function SiteNav() {
  const meta = getMeta();
  const updated = meta.lastUpdate ? formatIsoDate(meta.lastUpdate) : null;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
      style={{
        backgroundColor: "rgba(8, 8, 13, 0.8)",
        borderColor: "var(--border)",
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
              color: "var(--accent)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            METRO POWER RANKINGS
          </a>
        </div>

        <DesktopNav updated={updated} />
        <MobileMenu updated={updated} />
      </div>
    </nav>
  );
}
