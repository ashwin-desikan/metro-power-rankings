import Link from "next/link";
import { getLeagueHubsForCountry } from "@/lib/leagueHubs";

// Renders the domestic league hubs we have built that operate in this country.
// Pure-data lookup (no fs), so this stays a server component. Renders nothing
// for countries with no league hub yet.
export default function LeagueHubsSection({
  countrySlug,
  countryName,
}: {
  countrySlug: string;
  countryName: string;
}) {
  const hubs = getLeagueHubsForCountry(countrySlug);
  if (hubs.length === 0) return null;

  return (
    <section className="mb-12" id="league-hubs">
      <h2 className="text-xl font-bold mb-3">League Hubs</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Domestic league portals that operate in {countryName}:{" "}
        {hubs.length} {hubs.length === 1 ? "league" : "leagues"}.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {hubs.map((h) => (
          <Link
            key={h.key}
            href={h.href}
            className="flex items-center gap-3 rounded-lg border p-3 transition hover:border-[var(--accent)]"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <span aria-hidden className="text-xl leading-none">{h.icon}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-sm leading-tight">{h.label}</span>
              <span className="block text-xs text-[var(--text-muted)]">{h.sport}</span>
            </span>
            <span aria-hidden className="ml-auto text-[var(--text-dim)]">→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
