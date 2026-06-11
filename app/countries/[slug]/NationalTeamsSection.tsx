import Link from "next/link";
import { getNationalTeamsForCountry } from "@/lib/nationalTeamsForCountry";

// "National Teams" section on country hub pages. v1: men's football +
// women's football (WWC nations). Server component; renders nothing when the
// country has no teams. Sport-keyed card layout so cricket and other national
// portals can add rows later without restructuring.

const chipStyle = {
  backgroundColor: "var(--bg-card)",
  borderColor: "var(--border)",
  fontFamily: "'JetBrains Mono', monospace",
} as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-[var(--text-dim)]">{label} </span>
      <span className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

export default function NationalTeamsSection({ countryName }: { countryName: string }) {
  const { men, women } = getNationalTeamsForCountry(countryName);
  if (!men && !women) return null;

  return (
    <section className="mb-12" id="national-teams">
      <h2 className="text-xl font-bold mb-3">National Teams</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {countryName} on the international stage. Click a card for the full tournament record.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {men ? (
          <Link href={`/teams/national/${men.slug}`}
                className="block border rounded-lg p-4 transition-colors hover:border-[var(--accent)]"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border" style={chipStyle}>
                Men&apos;s Football
              </span>
              {men.federation ? (
                <span className="text-[10px] text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {men.federation}
                </span>
              ) : null}
            </div>
            <div className="font-semibold mb-2">{men.cur_name || men.name}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {men.fifa_rank != null ? <Stat label="FIFA" value={`#${men.fifa_rank}`} /> : null}
              {men.elo_rank != null ? <Stat label="ELO" value={`#${men.elo_rank}`} /> : null}
              <Stat label="WC apps" value={`${men.world_cup.app}`} />
              {men.totals.major_trophies > 0 ? (
                <Stat label="Major trophies" value={`${men.totals.major_trophies}`} />
              ) : null}
            </div>
          </Link>
        ) : null}
        {women ? (
          <Link href={`/teams/national/womens-world-cup/${women.slug}`}
                className="block border rounded-lg p-4 transition-colors hover:border-[var(--accent)]"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border" style={chipStyle}>
                Women&apos;s Football
              </span>
            </div>
            <div className="font-semibold mb-2">{women.name}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Stat label="WWC apps" value={`${women.appearances}`} />
              {women.titles > 0 ? <Stat label="Titles" value={`${women.titles}`} /> : null}
              {women.best_finish ? <Stat label="Best" value={women.best_finish} /> : null}
            </div>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
