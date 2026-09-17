// Club colour for a chart line, COMPUTED and never chosen.
//
// DESIGN-STANDARDS: "Chart colour is computed, never chosen." A team's own
// colour is allowed to break the six-way categorical cap because the ORDER of
// a categorical palette is what carries colourblind safety, and a club colour
// carries identity instead. Identity is then reinforced twice more, by the end
// label and by the readout, so nothing depends on telling two blues apart.
//
// The ladder, in order:
//   1. The primary, if it clears the contrast floor against the card.
//   2. Else the secondary, if it clears AND is not near-white. This gives a
//      club its real second colour rather than a wash.
//   3. Else the primary lifted along its OWN hue until it clears. A lifted
//      navy is still that club's blue; white is nobody's.
//   4. Else nothing. A franchise with no usable stored colour returns null and
//      renders neutral: inventing a club colour is worse than not having one.
//
// 🔴 DELIBERATE DUPLICATION, WITH AN OWNER. lib/nfl.ts:772 holds an identical
// implementation (nflLineColor) that predates this file. It is NOT imported
// from here on purpose: folding it in means editing lib/nfl.ts during a live
// NFL season, and these are pure functions whose only risk is being changed
// for no reason. Fold the NFL onto this module at the season break, delete
// the copy there, and this note with it. Until then, ANY change here must be
// made in both places or the two sports' charts will drift apart.

const CARD_L = 0.012; // approximate relative luminance of --bg-card
const MIN_CONTRAST = 3; // the non-text contrast floor
const NEAR_WHITE = 0.75; // luminance above which a colour is "white enough"

export type Monogram = { bg: string; fg: string; mono: string };

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbOf(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function luminance(hex: string): number {
  const rgb = rgbOf(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(hex: string): number {
  const l = luminance(hex);
  return (Math.max(l, CARD_L) + 0.05) / (Math.min(l, CARD_L) + 0.05);
}

function toHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Lift a colour along its own hue until it clears the contrast floor. */
function liftToContrast(hex: string): string | null {
  const hsl = toHsl(hex);
  if (!hsl) return null;
  // A pure black primary has no hue to lift, so it stays neutral rather than
  // becoming an arbitrary grey pretending to be a colour.
  if (hsl.s < 0.05) return null;
  for (let l = hsl.l; l <= 0.9; l += 0.02) {
    const c = hslToHex(hsl.h, Math.max(hsl.s, 0.45), l);
    if (contrast(c) >= MIN_CONTRAST) return c;
  }
  return null;
}

/** The line colour for one club's stored monogram, or null for none usable. */
export function lineColorFrom(m: Monogram | undefined): string | null {
  if (!m) return null;
  const valid = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  const primary = valid(m.bg) ? m.bg : null;
  const secondary = valid(m.fg) ? m.fg : null;

  if (primary && contrast(primary) >= MIN_CONTRAST) return primary;
  if (secondary && luminance(secondary) < NEAR_WHITE && contrast(secondary) >= MIN_CONTRAST) {
    return secondary;
  }
  if (primary) {
    const lifted = liftToContrast(primary);
    if (lifted) return lifted;
  }
  if (secondary && contrast(secondary) >= MIN_CONTRAST) return secondary;
  return null;
}
