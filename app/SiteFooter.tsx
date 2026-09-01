import Link from "next/link";
import ReportIssue from "./_shared/ReportIssue";

// Site footer. New on 2026-09-01, and the site went without one for a reason,
// so it earns its place under a constraint: it renders on ~600 routes, and
// DESIGN-STANDARDS §2 judges pages by phone screens, so every pixel here is
// paid for six hundred times. It is therefore ONE row of links plus one
// collapsed control, and it must stay that way. Anything richer belongs on
// /about.
//
// ReportIssue is the only client island in here; the rest is static so the
// footer costs nothing on the critical path.

const links = [
  { href: "/about", label: "About" },
  { href: "/methodology", label: "Methodology" },
  { href: "/updates", label: "Updates" },
  { href: "/privacy", label: "Privacy" },
];

export default function SiteFooter() {
  return (
    <footer
      className="border-t mt-12"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              prefetch={false}
              // Standalone links are controls under DESIGN-STANDARDS §6, not body
              // text, so they carry the 44px target. Without min-h-11 the probe
              // counted four sub-40px offenders on every route on the site.
              className="inline-flex items-center min-h-11 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <ReportIssue />
      </div>
    </footer>
  );
}
