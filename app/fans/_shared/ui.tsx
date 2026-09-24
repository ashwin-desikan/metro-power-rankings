import Link from "next/link";
import { MONO, TabHeader, SectionHead } from "@/app/business/ui";

// Shared shell for the /fans family (index + methodology). Copies the
// business/predictions idiom rather than hand-rolling a variant: Crumbs,
// TabHeader and SectionHead are the site's standard page skeleton pieces
// (DESIGN-STANDARDS.md section 1).
export { MONO, TabHeader, SectionHead };

export function FansCrumbs({ tab }: { tab?: string }) {
  return (
    <nav className="text-xs text-[var(--text-muted)] mb-4">
      <Link href="/" className="inline-flex items-center min-h-[44px] -my-2 hover:underline">Home</Link>
      {" / "}
      {tab ? (
        <>
          <Link href="/fans" className="inline-flex items-center min-h-[44px] -my-2 hover:underline">Fan Attention Index</Link>
          {" / "}
          <span>{tab}</span>
        </>
      ) : (
        <span>Fan Attention Index</span>
      )}
    </nav>
  );
}

export function FansNav({ active }: { active: "index" | "methodology" | "trends" }) {
  const tabs: { key: "index" | "methodology" | "trends"; href: string; label: string }[] = [
    { key: "index", href: "/fans", label: "Index" },
    { key: "trends", href: "/fans/trends", label: "Attention over time" },
    { key: "methodology", href: "/fans/methodology", label: "Methodology" },
  ];
  return (
    <nav className="flex flex-wrap gap-x-1 border-b mb-6" style={{ borderColor: "var(--border)" }}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className="px-3 py-2 text-sm font-semibold transition-colors"
          style={{
            borderBottom: t.key === active ? "2px solid var(--accent)" : "2px solid transparent",
            color: t.key === active ? "var(--text)" : "var(--text-muted)",
          }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
