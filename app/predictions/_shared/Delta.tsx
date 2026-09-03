// Small "change since" indicator: a triangle plus the magnitude. Muted when
// the move is small enough to be noise rather than signal.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const UP = "var(--band-solid)";
const DOWN = "var(--band-out)";
const MUTE_THRESHOLD = 0.5;

export function Delta({
  value,
  unit = "pp",
  className = "",
}: {
  /** Signed change; null/undefined renders nothing (no history to compare against). */
  value: number | null | undefined;
  /** "pp" for a percentage-point change, "w" for a wins change. */
  unit?: "pp" | "w";
  className?: string;
}) {
  if (value == null || Number.isNaN(value)) return null;

  const muted = Math.abs(value) < MUTE_THRESHOLD;
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "=";
  const label = unit === "pp" ? "percentage points" : "wins";
  const direction = value > 0 ? "up" : value < 0 ? "down" : "unchanged";
  const suffix = unit === "pp" ? "pp" : "w";

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${className}`}
      style={{ ...MONO, color: muted ? "var(--text-dim)" : value > 0 ? UP : DOWN }}
      aria-label={`${direction} ${rounded} ${label} over the last week`}
    >
      <span aria-hidden>{arrow}</span>
      {rounded > 0 ? `${rounded}${suffix}` : `0${suffix}`}
    </span>
  );
}
