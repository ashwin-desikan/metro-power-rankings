// Client-safe football color + monogram helpers. Extracted from lib/football.ts
// (which is server-only) so "use client" components can import the pure
// color logic without pulling fs into the client bundle.

// Curated primary colors for marquee clubs across the in-scope countries.
// Slug keys. Foreground is
// chosen for contrast against the background; in most cases this is
// off-white for dark backgrounds and near-black for light backgrounds.
// If you add a club, follow the workbook's slugified Cur. Name as the key.
const CURATED_CLUB_COLORS: Record<string, { bg: string; fg: string }> = {
  // England - Premier League regulars + historic top-flight clubs
  "arsenal": { bg: "#EF0107", fg: "#FFFFFF" },
  "manchester-united": { bg: "#DA291C", fg: "#FFE500" },
  "manchester-city": { bg: "#6CABDD", fg: "#1C2C5B" },
  "liverpool": { bg: "#C8102E", fg: "#FFFFFF" },
  "chelsea": { bg: "#034694", fg: "#FFFFFF" },
  "tottenham-hotspur": { bg: "#132257", fg: "#FFFFFF" },
  "newcastle-united": { bg: "#241F20", fg: "#FFFFFF" },
  "aston-villa": { bg: "#670E36", fg: "#94BEE5" },
  "everton": { bg: "#003399", fg: "#FFFFFF" },
  "leeds-united": { bg: "#FFCD00", fg: "#1D428A" },
  "west-ham-united": { bg: "#7A263A", fg: "#1BB1E7" },
  "nottingham-forest": { bg: "#DD0000", fg: "#FFFFFF" },
  "brighton-hove-albion": { bg: "#0057B8", fg: "#FFFFFF" },
  "crystal-palace": { bg: "#1B458F", fg: "#C4122E" },
  "wolverhampton-wanderers": { bg: "#FDB913", fg: "#231F20" },
  "southampton": { bg: "#D71920", fg: "#FFFFFF" },
  "leicester-city": { bg: "#003090", fg: "#FDBE11" },
  "sunderland": { bg: "#EB172B", fg: "#FFFFFF" },
  "sheffield-united": { bg: "#EE2737", fg: "#FFFFFF" },
  "sheffield-wednesday": { bg: "#0E4C92", fg: "#FFFFFF" },
  "derby-county": { bg: "#000000", fg: "#FFFFFF" },
  "middlesbrough": { bg: "#E2231A", fg: "#FFFFFF" },
  "preston-north-end": { bg: "#FFFFFF", fg: "#1F4193" },
  "afc-bournemouth": { bg: "#DA291C", fg: "#000000" },
  "fulham": { bg: "#000000", fg: "#FFFFFF" },
  "brentford": { bg: "#E30613", fg: "#FFFFFF" },
  // Spain - La Liga marquees
  "real-madrid": { bg: "#FEBE10", fg: "#00529F" },
  "fc-barcelona": { bg: "#A50044", fg: "#004D98" },
  "atletico-de-madrid": { bg: "#CB3524", fg: "#FFFFFF" },
  "sevilla": { bg: "#D71920", fg: "#FFFFFF" },
  "valencia": { bg: "#FF7F00", fg: "#000000" },
  "real-sociedad": { bg: "#003F87", fg: "#FFFFFF" },
  "athletic-bilbao": { bg: "#EE2523", fg: "#FFFFFF" },
  "villarreal": { bg: "#FFE667", fg: "#005187" },
  "real-betis": { bg: "#00954C", fg: "#FFFFFF" },
  "celta-de-vigo": { bg: "#8AC7E8", fg: "#C81C2C" },
  "deportivo-de-la-coruna": { bg: "#0072CE", fg: "#FFFFFF" },
  "rcd-espanyol": { bg: "#005EB8", fg: "#FFFFFF" },
  "real-zaragoza": { bg: "#FFFFFF", fg: "#003DA5" },
  // Italy - Serie A marquees
  "juventus": { bg: "#000000", fg: "#FFFFFF" },
  "ac-milan": { bg: "#FB090B", fg: "#000000" },
  "internazionale": { bg: "#0068A8", fg: "#000000" },
  "ssc-napoli": { bg: "#12A0D7", fg: "#FFFFFF" },
  "as-roma": { bg: "#8E1F2F", fg: "#F0BC42" },
  "lazio": { bg: "#87CEEB", fg: "#FFFFFF" },
  "atalanta": { bg: "#1C1F4F", fg: "#FFFFFF" },
  "fiorentina": { bg: "#482F92", fg: "#FFFFFF" },
  "torino": { bg: "#8B0000", fg: "#FFFFFF" },
  "sampdoria": { bg: "#1F3A93", fg: "#FFFFFF" },
  "genoa": { bg: "#C8102E", fg: "#003DA5" },
  "bologna": { bg: "#911F2F", fg: "#1B468C" },
  "udinese": { bg: "#000000", fg: "#FFFFFF" },
  // Germany - Bundesliga marquees + pre-Bundesliga giants
  "bayern-munich": { bg: "#DC052D", fg: "#FFFFFF" },
  "borussia-dortmund": { bg: "#FDE100", fg: "#000000" },
  "rb-leipzig": { bg: "#DD0741", fg: "#FFFFFF" },
  "bayer-leverkusen": { bg: "#E32221", fg: "#000000" },
  "eintracht-frankfurt": { bg: "#E1000F", fg: "#000000" },
  "vfb-stuttgart": { bg: "#E32219", fg: "#FFFFFF" },
  "borussia-monchengladbach": { bg: "#000000", fg: "#00B050" },
  "werder-bremen": { bg: "#1D9053", fg: "#FFFFFF" },
  "1-fc-koln": { bg: "#ED1C24", fg: "#FFFFFF" },
  "fc-schalke-04": { bg: "#004D9E", fg: "#FFFFFF" },
  "hertha-bsc": { bg: "#005CA9", fg: "#FFFFFF" },
  "hamburger-sv": { bg: "#003C8F", fg: "#FFFFFF" },
  "1-fc-nurnberg": { bg: "#8B1A1A", fg: "#FFFFFF" },
  "vfl-wolfsburg": { bg: "#65B32E", fg: "#FFFFFF" },
  // France - Ligue 1 marquees
  "paris-saint-germain": { bg: "#004170", fg: "#ED1C24" },
  "olympique-marseille": { bg: "#2FAEE0", fg: "#FFFFFF" },
  "as-monaco": { bg: "#ED1C24", fg: "#FFFFFF" },
  "olympique-lyonnais": { bg: "#DA001A", fg: "#1B449C" },
  "lille-osc": { bg: "#DA291C", fg: "#003DA5" },
  "as-saint-etienne": { bg: "#0F8A3F", fg: "#FFFFFF" },
  "rc-lens": { bg: "#FFCC00", fg: "#DA0023" },
  "ogc-nice": { bg: "#ED1C24", fg: "#000000" },
  "stade-rennais": { bg: "#D90D2E", fg: "#000000" },
  "fc-girondins-de-bordeaux": { bg: "#001489", fg: "#FFFFFF" },
  "fc-nantes": { bg: "#FFCD00", fg: "#008752" },
  "toulouse-fc": { bg: "#5F259F", fg: "#FFFFFF" },
  "montpellier-hsc": { bg: "#F46D1D", fg: "#1F3F88" },
  "strasbourg": { bg: "#005EB8", fg: "#FFFFFF" },
};

// 12-hue fallback palette for the long tail. Picked for distinguishability
// across the wheel; each pairs with a tested foreground for legibility.
const HASH_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "#15803d", fg: "#ecfdf5" }, // forest
  { bg: "#7c3aed", fg: "#f5f3ff" }, // violet
  { bg: "#0ea5e9", fg: "#f0f9ff" }, // sky
  { bg: "#ea580c", fg: "#fff7ed" }, // orange
  { bg: "#be185d", fg: "#fdf2f8" }, // pink
  { bg: "#0d9488", fg: "#f0fdfa" }, // teal
  { bg: "#a16207", fg: "#fefce8" }, // amber
  { bg: "#4338ca", fg: "#eef2ff" }, // indigo
  { bg: "#65a30d", fg: "#f7fee7" }, // lime
  { bg: "#9d174d", fg: "#fdf2f8" }, // rose
  { bg: "#1e3a8a", fg: "#dbeafe" }, // deep blue
  { bg: "#525252", fg: "#fafafa" }, // neutral
];

function slugHash(slug: string): number {
  // Stable FNV-1a 32-bit hash. Deterministic across server + client and
  // across rebuilds.
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

// Two-letter monogram derived from the canonical name plus a color from
// either the curated map (marquee clubs) or a deterministic hash-derived
// palette pick (long tail). Same shape as the NFL / NBA / NHL / MLB
// monogram helpers so it slots into the existing TeamCard renderer.
export function monogramForFootball(name: string, slug?: string): { bg: string; fg: string; mono: string } {
  const cleaned = (name ?? "").replace(/^(FC|AFC|SC|SV|AS|AC|US|SK|VfB|VfL|SSC|RC|CF|UD|Real|Atletico)\s+/i, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let mono = "";
  if (tokens.length === 0) mono = (name ?? "FC").slice(0, 2).toUpperCase();
  else if (tokens.length === 1) mono = tokens[0].slice(0, 2).toUpperCase();
  else mono = (tokens[0][0] + tokens[1][0]).toUpperCase();
  const lookup = slug ? CURATED_CLUB_COLORS[slug] : null;
  if (lookup) return { ...lookup, mono };
  const palette = HASH_PALETTE[slug ? slugHash(slug) % HASH_PALETTE.length : 0];
  return { ...palette, mono };
}

// Lightweight version that only returns the colors (no monogram), useful
// for the small circular indicator on the index list.
export function colorForFootballClub(slug: string): { bg: string; fg: string } {
  const lookup = CURATED_CLUB_COLORS[slug];
  if (lookup) return lookup;
  return HASH_PALETTE[slugHash(slug) % HASH_PALETTE.length];
}
