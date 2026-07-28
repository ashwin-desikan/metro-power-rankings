import type { ReactNode } from "react";

// Banded hero header shared by every Club Football hub page. Replaces the
// plain "text-3xl font-semibold" H1 + muted paragraph every page used to
// open with. `accent` defaults to the site teal but club pages pass a
// per-club brand color (lib/football-colors.ts' colorForFootballClub) for a
// distinctive per-club look; hub-level chrome/nav/badges stay teal.
export function FootballHero({
  eyebrow,
  title,
  subtitle,
  accent = "var(--accent)",
  stats,
  cta,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  stats?: ReactNode;
  cta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header
      className="mb-8 rounded-2xl border p-5 sm:p-6 relative overflow-hidden"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: accent }}>
                {eyebrow}
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">{title}</div>
            {subtitle && <p className="mt-1.5 text-sm text-[var(--text-muted)] max-w-2xl">{subtitle}</p>}
          </div>
          {cta}
        </div>
        {children}
        {stats}
      </div>
    </header>
  );
}
