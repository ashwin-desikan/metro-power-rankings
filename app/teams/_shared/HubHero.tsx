import type { ReactNode } from "react";

// Banded hero header shared by every sport hub. Replaces the plain
// "text-3xl font-semibold" H1 + muted paragraph every page used to open with.
// `accent` defaults to the site teal but club pages pass a per-club brand
// color (lib/football-colors.ts' colorForFootballClub) for a distinctive
// per-club look; hub-level chrome/nav/badges stay teal.
//
// 🔴 ONE HERO, NOT ONE PER SPORT. This was FootballHero until 2026-09-06 and
// sat in teams/_shared the whole time, which is the tell: nothing in it was
// ever about football. A second copy for the NFL would have been the second of
// nine dialects of the same header.
//
// `icon` is the sport's own glyph, sized as a tile so a reader lands on the
// page and knows what sport it is before reading a word. It is decorative by
// construction - the h1 always names the sport - so it is aria-hidden.
export function HubHero({
  eyebrow,
  title,
  subtitle,
  accent = "var(--accent)",
  icon,
  stats,
  cta,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  /** The sport's glyph. Rendered as a tile to the left of the eyebrow. */
  icon?: ReactNode;
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
          <div className="min-w-0 flex items-start gap-3 sm:gap-4">
            {icon ? (
              <span
                aria-hidden
                className="hidden sm:grid place-items-center rounded-xl border flex-shrink-0 text-[28px] leading-none"
                style={{ width: 56, height: 56, borderColor: "var(--border)", background: "var(--bg-card-hover)" }}
              >
                {icon}
              </span>
            ) : null}
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: accent }}>
                {eyebrow}
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">{title}</div>
            {subtitle && <p className="mt-1.5 text-sm text-[var(--text-muted)] max-w-2xl">{subtitle}</p>}
          </div>
          </div>
          {cta}
        </div>
        {children}
        {stats}
      </div>
    </header>
  );
}
