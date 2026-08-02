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
//
// "Updated" semantics: this is the date a reader sees and trusts as "how
// fresh is this site". We surface the MOST RECENT of:
//   - The workbook's lastUpdate (set by scripts/extract.py from the
//     MetroAreas.xlsx mtime; reflects when the underlying metros dataset
//     was last refreshed).
//   - Today's build date (this server component re-evaluates on every
//     Vercel build, including the 08:00 UTC daily refresh).
// Whichever is later wins. This way the badge advances daily even when
// the workbook hasn't changed (because live standings / Substack / etc.
// still re-fetch every build), but it sticks to a workbook date if some-
// how the workbook was just touched and the build hasn't run yet.
function maxIsoDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

export default function SiteNav() {
  const meta = getMeta();
  const todayIso = new Date().toISOString().slice(0, 10);
  const newestIso = maxIsoDate(meta.lastUpdate || "", todayIso);
  const updated = newestIso ? formatIsoDate(newestIso) : null;

  return (
    <nav
      // STICKY, not fixed, by design standard: the nav occupies its own layout space, so page
      // content can never start underneath it — on any viewport, on any page, with zero per-page
      // clearance padding. (The old fixed nav needed every page to hand-add pt-24-style offsets;
      // ~180 newer pages used py-8 and their first lines sat under the bar on mobile.) Pages start
      // their content with ordinary whitespace (pt-8/py-8); NEVER add nav-clearance padding, and
      // never switch this back to `fixed`. Anchor jumps still need [id]{scroll-margin-top} in
      // globals.css because the bar overlays scrolled content.
      className="sticky top-0 z-50 backdrop-blur-md border-b"
      style={{
        backgroundColor: "rgba(8, 8, 13, 0.8)",
        borderColor: "var(--border)",
      }}
    >
      <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4 lg:gap-6">
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
            Rankings and Reference
          </a>
        </div>

        <DesktopNav updated={updated} />
        <MobileMenu updated={updated} />
      </div>
    </nav>
  );
}
