// Shared "on this page" anchor nav for the sports hub pages. Renders a row of
// chip links that jump to each hub's major sections so visitors can see at a
// glance what the page contains. Server component; each target section just
// needs a matching id (the global [id] scroll-margin handles the sticky-header
// offset, and html { scroll-behavior: smooth } animates the jump).

export type HubNavItem = { label: string; href: string };

export default function HubNav({ items }: { items: HubNavItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <nav
      aria-label="On this page"
      className="mb-8 flex flex-wrap items-center gap-2"
    >
      <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mr-1">
        On this page
      </span>
      {items.map((it) => (
        <a
          key={it.href}
          href={it.href}
          className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:text-[var(--text)] hover:border-[var(--text-dim)]"
          style={{
            background: "var(--bg-card)",
            color: "var(--text-muted)",
            borderColor: "var(--border)",
          }}
        >
          {it.label}
        </a>
      ))}
    </nav>
  );
}
