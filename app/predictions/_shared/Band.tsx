import type { NflBand } from "@/lib/nflSim";

// Chip for a playoff-odds band (see the p_playoffs thresholds documented in
// lib/nflSim.ts / the sim builder). Colour comes entirely from the
// --band-* CSS custom properties in app/globals.css, and the label text is
// always present, so the chip degrades to plain text with any styling lost.

const LABEL: Record<NflBand, string> = {
  solid: "Solid",
  likely: "Likely",
  lean: "Lean",
  tossup: "Toss-up",
  unlikely: "Unlikely",
  out: "Out",
};

const VAR: Record<NflBand, string> = {
  solid: "var(--band-solid)",
  likely: "var(--band-likely)",
  lean: "var(--band-lean)",
  tossup: "var(--band-tossup)",
  unlikely: "var(--band-unlikely)",
  out: "var(--band-out)",
};

export function Band({ band, className = "" }: { band: NflBand; className?: string }) {
  const color = VAR[band];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
      style={{ color, border: `1px solid ${color}`, backgroundColor: "color-mix(in srgb, " + color + " 14%, transparent)" }}
    >
      {LABEL[band]}
    </span>
  );
}
