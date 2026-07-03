import Link from "next/link";

type IndexKey = "metros" | "people" | "countries" | "artists";

const INDICES: { n: string; label: string; href: string; key: IndexKey }[] = [
  { n: "01", label: "Metros", href: "/rankings", key: "metros" },
  { n: "02", label: "People", href: "/power", key: "people" },
  { n: "03", label: "Countries", href: "/sports/zone-zero-cup", key: "countries" },
  { n: "04", label: "Artists", href: "/sound/artists", key: "artists" },
];

// Shared sibling-index switcher shown at the top of each of the four ranked
// index hubs (Metros, People, Countries, Artists). The current index is
// highlighted with the "Index /" prefix; the others are links to their hubs.
export default function IndexSwitcher({ current }: { current: IndexKey }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {INDICES.map((i) =>
        i.key === current ? (
          <span key={i.key} className="uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            Index / {i.n} {i.label}
          </span>
        ) : (
          <Link
            key={i.key}
            href={i.href}
            className="uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
          >
            {i.n} {i.label}
          </Link>
        ),
      )}
    </div>
  );
}
