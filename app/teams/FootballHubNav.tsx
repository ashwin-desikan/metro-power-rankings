import Link from "next/link";

// Shared cross-hub navigation for every Club Football page: a persistent "back
// to Club Football" button plus a chip row linking the main sections, with the
// current section highlighted. Kept in one place so every hub (index, 2026-27,
// seasons, leagues, competitions, cups, worldwide table, and club pages) carries
// the same nav and back affordance. Server component (no client state).

type Dest = { key: string; label: string; href: string };

const DESTS: Dest[] = [
  { key: "overview", label: "Overview", href: "/teams/football" },
  { key: "season", label: "2026-27", href: "/teams/football/2026-27" },
  { key: "seasons", label: "Seasons", href: "/teams/football/seasons" },
  { key: "leagues", label: "Leagues", href: "/teams/football#leagues" },
  { key: "competitions", label: "Competitions", href: "/teams/football/tournaments" },
  { key: "domestic", label: "Worldwide Table", href: "/teams/football/domestic" },
  { key: "cups", label: "Cups", href: "/teams/football/cups" },
  { key: "predictions", label: "🔮 Predictions", href: "/predictions/pl" },
];

export default function FootballHubNav({
  current,
  backHref = "/teams/football",
  backLabel = "Club Football",
  showBack = true,
}: {
  current?: string;
  backHref?: string;
  backLabel?: string;
  showBack?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      {showBack && (
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <span aria-hidden>←</span> {backLabel}
          </Link>
        </div>
      )}
      <nav aria-label="Club Football sections" className="flex flex-wrap items-center gap-2">
        {DESTS.map((d) => {
          const on = d.key === current;
          return (
            <Link
              key={d.key}
              href={d.href}
              aria-current={on ? "page" : undefined}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${on ? "font-semibold" : "hover:text-[var(--text)] hover:border-[var(--text-dim)]"}`}
              style={{
                background: "var(--bg-card)",
                color: on ? "var(--accent)" : "var(--text-muted)",
                borderColor: on ? "var(--accent)" : "var(--border)",
              }}
            >
              {d.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
