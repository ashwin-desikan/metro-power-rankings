// One glyph per sport, defined once.
//
// 🔴 A REGISTRY, NOT AN EMOJI TYPED INTO THIRTY HEADERS. Ashwin asked for a
// sport icon on every sports hub. Thirty hand-placed emoji is thirty chances to
// pick a different ball for the same sport, and no way to change one of them
// later. The hub passes its own key and gets whatever this file says.
//
// 🔴 DECORATIVE BY CONSTRUCTION. Every hub's h1 names the sport in words, so
// the glyph adds no information a screen reader needs and HubHero renders it
// aria-hidden. It is wayfinding for the eye: colour and shape at the top-left
// of the card, so a reader knows which of thirty hubs they landed on before
// reading anything.

export const SPORT_GLYPH: Record<string, string> = {
  nfl: "🏈", cfb: "🏈", cfl: "🏈",
  football: "⚽", wfootball: "⚽", national: "⚽", wnational: "⚽",
  mlb: "⚾", baseball: "⚾",
  nba: "🏀", wnba: "🏀", basketball: "🏀", cbb: "🏀", "cbb-w": "🏀",
  nhl: "🏒", hockey: "🏒",
  cricket: "🏏", ipl: "🏏",
  f1: "🏎️",
  golf: "⛳",
  tennis: "🎾",
  "rugby-union": "🏉", "rugby-league": "🏉", nrl: "🏉",
  afl: "🏉",
  handball: "🤾",
  volleyball: "🏐",
  olympics: "🏅",
  sports: "🏆",
};

/** The glyph for a hub key, or the generic trophy. Never an empty string. */
export function sportGlyph(key: string): string {
  return SPORT_GLYPH[key] ?? SPORT_GLYPH.sports;
}

/**
 * The sport's glyph as a tile, for a hub that opens with a bare <h1> rather
 * than the banded HubHero.
 *
 * Wrap the two together so the tile sits beside the heading and not above it:
 *
 * ```tsx
 * <div className="flex items-center gap-3">
 *   <SportBadge sport="nhl" />
 *   <h1 className="text-3xl font-semibold tracking-tight">NHL franchises</h1>
 * </div>
 * ```
 */
export function SportBadge({ sport, size = 40 }: { sport: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-xl border flex-shrink-0 leading-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
        borderColor: "var(--border)",
        background: "var(--bg-card-hover)",
      }}
    >
      {sportGlyph(sport)}
    </span>
  );
}
