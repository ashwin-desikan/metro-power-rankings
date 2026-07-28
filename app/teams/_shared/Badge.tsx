import type { ReactNode } from "react";

// Small uppercase status pill (live/offseason/defunct/champion/custom color).
// Centralizes the inline rgba() pill styling that used to be copy-pasted
// across the football hub (overview cards, 2026-27 hub, league tables, club
// pages) so a palette tweak lands in one place.

export type BadgeVariant = "live" | "offseason" | "defunct" | "champion" | "neutral";

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; fg: string }> = {
  live: { bg: "rgba(16,185,129,0.18)", fg: "#10b981" },
  offseason: { bg: "rgba(120,120,140,0.12)", fg: "var(--text-dim)" },
  defunct: { bg: "rgba(120,120,140,0.18)", fg: "var(--text-muted)" },
  champion: { bg: "rgba(245,215,110,0.18)", fg: "#b58900" },
  neutral: { bg: "var(--bg-card-hover)", fg: "var(--text-muted)" },
};

export function Badge({
  children,
  variant = "neutral",
  color,
  dot = false,
  className = "",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  color?: { bg: string; fg: string };
  dot?: boolean;
  className?: string;
}) {
  const style = color ?? VARIANT_STYLES[variant];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold whitespace-nowrap ${className}`}
      style={{ background: style.bg, color: style.fg }}
    >
      {dot && (
        <span
          aria-hidden
          className={`inline-block w-1.5 h-1.5 rounded-full ${variant === "live" ? "animate-pulse" : ""}`}
          style={{ background: style.fg }}
        />
      )}
      {children}
    </span>
  );
}
