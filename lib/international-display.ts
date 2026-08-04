// Client-safe display constants and pure helpers for International Football.
// Anything imported by /teams/national client components (NationalIndexClient,
// NationalMapInner) lives here so the server-only lib/international module
// stays uncontaminated by client imports.
//
// No fs, no server-only. Pure data + pure functions.

export type TournamentCategory = "WC" | "EUROS" | "COPA" | "AFCON" | "ASIAN"
  | "GOLD" | "OFC" | "INTER" | "OTHER";

// Visual ordering for tournament hubs on the index and in nav. Matches the
// editorial hierarchy: World Cup first, continental cups by global prestige,
// intercontinental at the end.
export const TOURNAMENT_HUB_ORDER: string[] = [
  "world-cup",
  "euros",
  "copa-america",
  "afcon",
  "asian-cup",
  "gold-cup",
  "ofc-nations-cup",
  "intercontinental",
  "other-tournaments",
];

// Continent colors for index map markers and group section headers.
export const CONTINENT_COLORS: Record<string, string> = {
  Europe: "#1d4ed8",          // navy
  "South America": "#15803d", // green
  Africa: "#eab308",          // gold
  Asia: "#dc2626",            // red
  "North America": "#0ea5e9", // sky
  Oceania: "#a855f7",         // purple
  World: "#525252",           // neutral fallback
};

// Sort priority within the appearance table.
export function appearanceCategorySortKey(c: TournamentCategory): number {
  switch (c) {
    case "WC": return 1;
    case "EUROS":
    case "COPA":
    case "AFCON":
    case "ASIAN":
    case "GOLD":
    case "OFC": return 2;
    case "INTER": return 3;
    case "OTHER": return 4;
    default: return 99;
  }
}

// Flag emoji per national-team slug. Hand-curated. Empty string for teams
// without a standard ISO 3166-1 flag (defunct teams that don't map to a
// modern country emoji, B-teams, composite entities). The helper
// flagForTeam() returns "" for unmapped slugs so the UI renders cleanly.
export const COUNTRY_FLAGS: Record<string, string> = {
  afghanistan: "🇦🇫", albania: "🇦🇱", algeria: "🇩🇿", "american-samoa": "🇦🇸",
  andorra: "🇦🇩", angola: "🇦🇴", anguilla: "🇦🇮", "antigua-and-barbuda": "🇦🇬",
  argentina: "🇦🇷", armenia: "🇦🇲", aruba: "🇦🇼", australia: "🇦🇺",
  austria: "🇦🇹", azerbaijan: "🇦🇿", bahamas: "🇧🇸", bahrain: "🇧🇭",
  bangladesh: "🇧🇩", barbados: "🇧🇧", belarus: "🇧🇾", belgium: "🇧🇪",
  belize: "🇧🇿", benin: "🇧🇯", bermuda: "🇧🇲", bhutan: "🇧🇹",
  bolivia: "🇧🇴", bonaire: "🇧🇶", "bosnia-herzegovina": "🇧🇦", botswana: "🇧🇼",
  brazil: "🇧🇷", "british-virgin-islands": "🇻🇬", brunei: "🇧🇳", bulgaria: "🇧🇬",
  "burkina-faso": "🇧🇫", burundi: "🇧🇮", cambodia: "🇰🇭", cameroon: "🇨🇲",
  canada: "🇨🇦", "cape-verde": "🇨🇻", "cayman-islands": "🇰🇾",
  "central-african-republic": "🇨🇫", chad: "🇹🇩", chile: "🇨🇱",
  china: "🇨🇳", colombia: "🇨🇴", comoros: "🇰🇲", congo: "🇨🇬",
  "congo-dr": "🇨🇩", "cook-islands": "🇨🇰", "costa-rica": "🇨🇷",
  "cote-d-ivoire": "🇨🇮", croatia: "🇭🇷", cuba: "🇨🇺", curacao: "🇨🇼",
  cyprus: "🇨🇾", "czech-republic": "🇨🇿", denmark: "🇩🇰", djibouti: "🇩🇯",
  dominica: "🇩🇲", "dominican-republic": "🇩🇴", "east-timor": "🇹🇱",
  ecuador: "🇪🇨", egypt: "🇪🇬", "el-salvador": "🇸🇻", england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "equatorial-guinea": "🇬🇶", eritrea: "🇪🇷", estonia: "🇪🇪", eswatini: "🇸🇿",
  ethiopia: "🇪🇹", "faroe-islands": "🇫🇴",
  // Defunct national teams (no continuous current-form successor). Each
  // gets the historical-entity marker since no standard Unicode flag emoji
  // exists for the East German, South Yemeni, or South Vietnamese flags.
  "east-germany": "🏛️", "south-yemen": "🏛️", "south-vietnam": "🏛️",
  "federated-states-of-micronesia": "🇫🇲", fiji: "🇫🇯", finland: "🇫🇮",
  france: "🇫🇷", "france-b": "🇫🇷", "french-guiana": "🇬🇫",
  gabon: "🇬🇦", gambia: "🇬🇲", georgia: "🇬🇪", germany: "🇩🇪",
  ghana: "🇬🇭", greece: "🇬🇷", greenland: "🇬🇱", grenada: "🇬🇩",
  guadeloupe: "🇬🇵", guam: "🇬🇺", guatemala: "🇬🇹", guinea: "🇬🇳",
  "guinea-bissau": "🇬🇼", guyana: "🇬🇾", haiti: "🇭🇹", honduras: "🇭🇳",
  "hong-kong": "🇭🇰", hungary: "🇭🇺", iceland: "🇮🇸", india: "🇮🇳",
  indonesia: "🇮🇩", iran: "🇮🇷", iraq: "🇮🇶", ireland: "🇮🇪",
  israel: "🇮🇱", italy: "🇮🇹", jamaica: "🇯🇲", japan: "🇯🇵",
  jordan: "🇯🇴", kazakhstan: "🇰🇿", kenya: "🇰🇪", kiribati: "🇰🇮",
  kuwait: "🇰🇼", kyrgyzstan: "🇰🇬", laos: "🇱🇦", latvia: "🇱🇻",
  lebanon: "🇱🇧", "lebanon-yemen": "", lesotho: "🇱🇸", liberia: "🇱🇷",
  libya: "🇱🇾", liechtenstein: "🇱🇮", lithuania: "🇱🇹", luxembourg: "🇱🇺",
  macau: "🇲🇴", madagascar: "🇲🇬", malawi: "🇲🇼", malaysia: "🇲🇾",
  maldives: "🇲🇻", mali: "🇲🇱", malta: "🇲🇹", martinique: "🇲🇶",
  mauritania: "🇲🇷", mauritius: "🇲🇺", mayotte: "🇾🇹", mexico: "🇲🇽",
  moldova: "🇲🇩", monaco: "🇲🇨", mongolia: "🇲🇳", montenegro: "🇲🇪",
  montserrat: "🇲🇸", morocco: "🇲🇦", mozambique: "🇲🇿", myanmar: "🇲🇲",
  namibia: "🇳🇦", nepal: "🇳🇵", netherlands: "🇳🇱", "new-caledonia": "🇳🇨",
  "new-zealand": "🇳🇿", nicaragua: "🇳🇮", niger: "🇳🇪", nigeria: "🇳🇬",
  niue: "🇳🇺", "north-korea": "🇰🇵", "north-macedonia": "🇲🇰",
  "northern-cyprus": "", "northern-ireland": "🏴󠁧󠁢󠁮󠁩󠁲󠁿",
  "northern-mariana-islands": "🇲🇵", norway: "🇳🇴", oman: "🇴🇲",
  pakistan: "🇵🇰", palau: "🇵🇼", palestine: "🇵🇸", panama: "🇵🇦",
  "papua-new-guinea": "🇵🇬", paraguay: "🇵🇾", peru: "🇵🇪", philippines: "🇵🇭",
  poland: "🇵🇱", portugal: "🇵🇹", "puerto-rico": "🇵🇷", qatar: "🇶🇦",
  reunion: "🇷🇪", romania: "🇷🇴", russia: "🇷🇺", rwanda: "🇷🇼",
  "saint-barthelemy": "🇧🇱", "saint-lucia": "🇱🇨", "saint-martin": "🇲🇫",
  "saint-pierre-and-miquelon": "🇵🇲", samoa: "🇼🇸", "san-marino": "🇸🇲",
  "sao-tome-and-principe": "🇸🇹", "saudi-arabia": "🇸🇦",
  scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", senegal: "🇸🇳", serbia: "🇷🇸",
  seychelles: "🇸🇨", "sierra-leone": "🇸🇱", singapore: "🇸🇬",
  "sint-maarten": "🇸🇽", slovakia: "🇸🇰", slovenia: "🇸🇮",
  "solomon-islands": "🇸🇧", somalia: "🇸🇴", "south-africa": "🇿🇦",
  "south-korea": "🇰🇷", "south-sudan": "🇸🇸", spain: "🇪🇸",
  "sri-lanka": "🇱🇰", "st-kitts-and-nevis": "🇰🇳",
  "st-vincent-and-the-grenadines": "🇻🇨", sudan: "🇸🇩", suriname: "🇸🇷",
  sweden: "🇸🇪", switzerland: "🇨🇭", syria: "🇸🇾", tahiti: "🇵🇫",
  taiwan: "🇹🇼", tajikistan: "🇹🇯", tanzania: "🇹🇿", thailand: "🇹🇭",
  tibet: "", togo: "🇹🇬", tonga: "🇹🇴", "trinidad-and-tobago": "🇹🇹",
  tunisia: "🇹🇳", turkey: "🇹🇷", turkmenistan: "🇹🇲",
  "turks-and-caicos-islands": "🇹🇨", tuvalu: "🇹🇻", uganda: "🇺🇬",
  ukraine: "🇺🇦", "united-arab-emirates": "🇦🇪", "united-states": "🇺🇸",
  uruguay: "🇺🇾", "us-virgin-islands": "🇻🇮", uzbekistan: "🇺🇿",
  vanuatu: "🇻🇺", "vatican-city": "🇻🇦", venezuela: "🇻🇪",
  vietnam: "🇻🇳", wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "wallis-and-futuna": "🇼🇫",
  yemen: "🇾🇪", zambia: "🇿🇲", zanzibar: "", zimbabwe: "🇿🇼",
  // Defunct teams that inherit history into a successor's page use that
  // page's slug (so Soviet Union rows live on Russia, etc.). East Germany
  // is kept distinct per workbook editorial — no standard emoji exists, so
  // we render an empty flag and rely on the Defunct badge.
};

export function flagForTeam(slug: string): string {
  return COUNTRY_FLAGS[slug] ?? "";
}
// Subdivision emoji need explicit CDN code overrides (no ISO 3166-1 alpha-2).
// Also carries direct flagcdn codes for cricket/rugby nations whose slugs
// have no COUNTRY_FLAGS entry (crown dependencies, territories, variants).
const SUBDIVISION_CDN_CODES: Record<string, string> = {
  england: "gb-eng",
  scotland: "gb-sct",
  wales: "gb-wls",
  "northern-ireland": "gb-nir",
  gibraltar: "gi",
  guernsey: "gg",
  "isle-of-man": "im",
  jersey: "je",
  "st-helena": "sh",
  "timor-leste": "tl",
  "ivory-coast": "ci",
  // Baseball/WBC entities. Chinese Taipei is intentionally absent: the team
  // competes under the Chinese Taipei Olympic flag, which flagcdn lacks.
  "great-britain": "gb",
  czechia: "cz",

  // === api-football national-team name variants (added 2026-08-04) =========
  // These render flagless in the UEFA Nations League / Asian Cup standings
  // because COUNTRY_FLAGS is keyed by OUR slug while these rows carry
  // api-football's own spelling, which slugifies differently. Fixing it here
  // rather than in COUNTRY_FLAGS because this table is consulted first and
  // takes a direct flagcdn code, which also covers entities that have no
  // regional-indicator emoji at all.
  //
  // Türkiye: api-football uses the post-2021 endonym, so the slug is
  // "turkiye" while COUNTRY_FLAGS has "turkey".
  turkiye: "tr",
  // Kosovo has NO ISO 3166-1 alpha-2 code and therefore no flag emoji, so it
  // can never resolve via COUNTRY_FLAGS. flagcdn serves the user-assigned
  // "xk", which lib/flags.ts already uses for the same country.
  kosovo: "xk",
  // Legacy/abbreviated forms still used by the feed.
  "fyr-macedonia": "mk",
  "rep-of-ireland": "ie",
};

// Convert a team slug to a flagcdn.com PNG URL.
// size: "20x15" for table rows, "40x30" for headers.
// Returns null for defunct / unmapped / subdivision-flag teams.
export function flagCdnUrl(slug: string, size: "20x15" | "40x30" = "20x15"): string | null {
  if (SUBDIVISION_CDN_CODES[slug]) {
    return `https://flagcdn.com/${size}/${SUBDIVISION_CDN_CODES[slug]}.png`;
  }
  const emoji = COUNTRY_FLAGS[slug];
  if (!emoji) return null;
  // Regional indicator pairs encode the ISO alpha-2 code in their codepoints.
  // U+1F1E6 (🇦) = A, ..., U+1F1FF (🇿) = Z.
  const cps = [...emoji].map(c => c.codePointAt(0)!);
  if (cps.length >= 2 && cps[0] >= 0x1F1E6 && cps[0] <= 0x1F1FF) {
    const a = String.fromCharCode(cps[0] - 0x1F1E6 + 65);
    const b = String.fromCharCode(cps[1] - 0x1F1E6 + 65);
    return `https://flagcdn.com/${size}/${(a + b).toLowerCase()}.png`;
  }
  return null; // Subdivision tag sequence or blank (historical teams)
}

// Generic historical-entity marker shown next to predecessor identities
// (Soviet Union, Yugoslavia, Czechoslovakia, etc.) in attribution columns.
// Unicode doesn't carry stable emoji for those defunct flags, so we pick
// a single neutral glyph and apply it consistently.
export const HISTORICAL_FLAG = "🏛️";

// Display-name overrides for countries that officially adopted a new name
// and want it reflected across the Sports product. Slugs stay unchanged
// so URLs and data joins remain stable. Scope is intentionally narrow:
// only the Sports product surfaces; the broader MetroAreas display is a
// separate decision.
//   Czech Republic -> Czechia (officially adopted 2016, mainstream by 2023
//     when FIFA and most major sports bodies switched).
//   Turkey -> Türkiye (UN-approved rename December 2021).
export const TEAM_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "czech-republic": "Czechia",
  turkey: "Türkiye",
};

export function displayNameForTeam(slug: string, fallback: string): string {
  return TEAM_DISPLAY_NAME_OVERRIDES[slug] ?? fallback;
}

// The /countries product slugifies composite names by dropping "and" and
// collapsing certain joiner sequences, while the international product
// keeps the natural-language "and". This map resolves the international
// team slug to the actual /countries slug for cross-product linking.
// Unmapped slugs pass through unchanged.
export const COUNTRY_PAGE_SLUG_OVERRIDES: Record<string, string> = {
  "antigua-and-barbuda": "antigua-barbuda",
  "trinidad-and-tobago": "trinidad-tobago",
  "st-kitts-and-nevis": "st-kitts-nevis",
  "st-vincent-and-the-grenadines": "st-vincent-the-grenadines",
  "turks-and-caicos-islands": "turks-caicos-islands",
  "cote-d-ivoire": "cote-divoire",
};

export function countryPageSlugFor(intlSlug: string): string {
  return COUNTRY_PAGE_SLUG_OVERRIDES[intlSlug] ?? intlSlug;
}

// Short category label for round/category badges.
export const CATEGORY_SHORT_LABEL: Record<TournamentCategory, string> = {
  WC: "WC",
  EUROS: "Euros",
  COPA: "Copa",
  AFCON: "AFCON",
  ASIAN: "Asian",
  GOLD: "Gold",
  OFC: "OFC",
  INTER: "Inter",
  OTHER: "Other",
};

// Country centroid coordinates for the index map. Hand-curated for v1.
// Keyed by lowercase slug.
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  // Europe
  england: [52.5, -1.5],
  scotland: [56.5, -4.2],
  wales: [52.3, -3.7],
  "northern-ireland": [54.7, -6.8],
  ireland: [53.4, -8.0],
  france: [46.6, 2.2],
  germany: [51.2, 10.5],
  spain: [40.4, -3.7],
  italy: [42.8, 12.8],
  portugal: [39.6, -8.0],
  netherlands: [52.1, 5.3],
  belgium: [50.8, 4.5],
  switzerland: [46.8, 8.2],
  austria: [47.6, 14.6],
  denmark: [56.0, 10.0],
  sweden: [62.0, 15.0],
  norway: [64.0, 11.0],
  finland: [64.0, 26.0],
  iceland: [64.9, -18.5],
  poland: [52.0, 19.5],
  czechia: [49.8, 15.5],
  "czech-republic": [49.8, 15.5],
  slovakia: [48.7, 19.7],
  hungary: [47.2, 19.5],
  romania: [45.9, 25.0],
  bulgaria: [42.7, 25.5],
  greece: [39.0, 22.0],
  croatia: [45.1, 15.5],
  serbia: [44.0, 21.0],
  "bosnia-herzegovina": [44.0, 17.7],
  slovenia: [46.1, 14.8],
  "north-macedonia": [41.6, 21.7],
  albania: [41.0, 20.0],
  kosovo: [42.6, 20.9],
  montenegro: [42.7, 19.3],
  russia: [60.0, 100.0],
  ukraine: [49.0, 32.0],
  belarus: [53.7, 27.9],
  moldova: [47.0, 28.9],
  lithuania: [55.2, 24.0],
  latvia: [56.9, 24.6],
  estonia: [58.6, 25.0],
  malta: [35.9, 14.5],
  cyprus: [35.0, 33.0],
  luxembourg: [49.6, 6.1],
  liechtenstein: [47.2, 9.5],
  "san-marino": [43.9, 12.5],
  andorra: [42.5, 1.5],
  "faroe-islands": [62.0, -7.0],
  gibraltar: [36.1, -5.4],
  azerbaijan: [40.1, 47.6],
  armenia: [40.1, 45.0],
  georgia: [42.3, 43.4],
  kazakhstan: [48.0, 67.0],
  turkey: [39.0, 35.0],
  israel: [31.0, 34.9],
  "east-germany": [51.2, 12.5],
  // South America
  brazil: [-10.0, -55.0],
  argentina: [-34.0, -64.0],
  uruguay: [-32.5, -55.8],
  paraguay: [-23.4, -58.4],
  chile: [-35.7, -71.5],
  bolivia: [-16.3, -65.0],
  peru: [-9.2, -75.0],
  ecuador: [-1.4, -78.2],
  colombia: [4.6, -74.1],
  venezuela: [7.0, -66.0],
  // Africa
  egypt: [26.8, 30.8],
  morocco: [31.8, -7.1],
  algeria: [28.0, 1.7],
  tunisia: [34.0, 9.5],
  libya: [27.0, 17.2],
  nigeria: [9.1, 8.7],
  ghana: [7.9, -1.0],
  "cote-d-ivoire": [7.5, -5.5],
  "ivory-coast": [7.5, -5.5],
  senegal: [14.5, -14.5],
  cameroon: [7.4, 12.4],
  "south-africa": [-30.6, 22.9],
  kenya: [-0.0, 37.9],
  tanzania: [-6.4, 34.9],
  ethiopia: [9.1, 40.5],
  sudan: [12.9, 30.2],
  "congo-dr": [-4.0, 21.8],
  congo: [-0.2, 15.8],
  uganda: [1.4, 32.3],
  zambia: [-13.1, 27.8],
  zimbabwe: [-19.0, 29.9],
  angola: [-11.2, 17.9],
  mozambique: [-18.7, 35.5],
  madagascar: [-19.0, 47.0],
  mali: [17.6, -4.0],
  "burkina-faso": [12.2, -1.6],
  guinea: [9.9, -10.0],
  "sierra-leone": [8.5, -11.8],
  liberia: [6.4, -9.4],
  benin: [9.3, 2.3],
  togo: [8.6, 0.8],
  niger: [17.6, 8.1],
  chad: [15.5, 18.7],
  "central-african-republic": [6.6, 20.9],
  gabon: [-0.8, 11.6],
  "equatorial-guinea": [1.7, 10.3],
  "cape-verde": [16.0, -24.0],
  comoros: [-11.9, 43.9],
  mauritania: [21.0, -10.9],
  gambia: [13.4, -15.5],
  "guinea-bissau": [11.8, -15.2],
  eritrea: [15.2, 39.8],
  djibouti: [11.8, 42.6],
  somalia: [5.2, 46.2],
  rwanda: [-1.9, 29.9],
  burundi: [-3.4, 29.9],
  malawi: [-13.3, 34.3],
  botswana: [-22.3, 24.7],
  namibia: [-22.6, 17.1],
  lesotho: [-29.6, 28.2],
  eswatini: [-26.5, 31.5],
  "sao-tome-and-principe": [0.2, 6.6],
  seychelles: [-4.7, 55.5],
  mauritius: [-20.3, 57.6],
  // Asia
  japan: [36.2, 138.3],
  "south-korea": [36.0, 127.8],
  "north-korea": [40.3, 127.5],
  china: [35.0, 105.0],
  india: [22.0, 79.0],
  pakistan: [30.4, 69.3],
  bangladesh: [23.7, 90.4],
  "sri-lanka": [7.9, 80.8],
  nepal: [28.4, 84.1],
  bhutan: [27.5, 90.4],
  myanmar: [21.9, 95.9],
  thailand: [15.9, 100.9],
  vietnam: [14.1, 108.3],
  cambodia: [12.6, 104.9],
  laos: [19.9, 102.5],
  malaysia: [4.2, 102.0],
  singapore: [1.4, 103.8],
  indonesia: [-0.8, 113.9],
  philippines: [12.9, 121.8],
  brunei: [4.5, 114.7],
  "timor-leste": [-8.9, 125.7],
  iran: [32.4, 53.7],
  iraq: [33.2, 43.7],
  "saudi-arabia": [23.9, 45.1],
  yemen: [15.6, 48.5],
  oman: [21.5, 55.9],
  "united-arab-emirates": [23.4, 53.8],
  qatar: [25.4, 51.2],
  bahrain: [26.0, 50.6],
  kuwait: [29.3, 47.5],
  jordan: [30.6, 36.2],
  lebanon: [33.9, 35.9],
  syria: [34.8, 38.9],
  palestine: [31.9, 35.2],
  afghanistan: [33.9, 67.7],
  uzbekistan: [41.4, 64.6],
  turkmenistan: [38.9, 59.6],
  tajikistan: [38.9, 71.3],
  kyrgyzstan: [41.2, 74.8],
  mongolia: [46.9, 103.8],
  "chinese-taipei": [23.7, 121.0],
  "hong-kong": [22.3, 114.2],
  macau: [22.2, 113.5],
  maldives: [3.2, 73.2],
  // North + Central America + Caribbean
  "united-states": [39.8, -100.0],
  mexico: [23.6, -102.6],
  canada: [56.1, -106.3],
  guatemala: [15.8, -90.2],
  honduras: [15.2, -86.2],
  "el-salvador": [13.8, -88.9],
  nicaragua: [12.9, -85.2],
  "costa-rica": [9.7, -83.8],
  panama: [8.5, -80.8],
  belize: [17.2, -88.5],
  cuba: [21.5, -77.8],
  jamaica: [18.1, -77.3],
  haiti: [18.9, -72.3],
  "dominican-republic": [18.7, -70.2],
  "puerto-rico": [18.2, -66.6],
  "trinidad-and-tobago": [10.7, -61.3],
  barbados: [13.2, -59.5],
  bahamas: [25.0, -77.4],
  bermuda: [32.3, -64.8],
  grenada: [12.1, -61.7],
  "saint-lucia": [13.9, -60.9],
  "saint-vincent-and-the-grenadines": [13.0, -61.2],
  "st-vincent-and-the-grenadines": [13.0, -61.2],
  "antigua-and-barbuda": [17.1, -61.8],
  "saint-kitts-and-nevis": [17.4, -62.8],
  "st-kitts-and-nevis": [17.4, -62.8],
  dominica: [15.4, -61.4],
  curacao: [12.2, -69.0],
  aruba: [12.5, -69.9],
  "cayman-islands": [19.5, -80.6],
  "us-virgin-islands": [18.4, -64.9],
  "british-virgin-islands": [18.4, -64.6],
  anguilla: [18.2, -63.0],
  montserrat: [16.7, -62.2],
  guyana: [4.9, -58.9],
  suriname: [3.9, -56.0],
  // Oceania
  australia: [-25.3, 133.8],
  "new-zealand": [-40.9, 174.9],
  fiji: [-17.7, 178.0],
  "papua-new-guinea": [-6.3, 143.9],
  "solomon-islands": [-9.6, 160.2],
  vanuatu: [-15.4, 166.9],
  "new-caledonia": [-20.9, 165.6],
  tahiti: [-17.7, -149.4],
  samoa: [-13.8, -172.1],
  tonga: [-21.2, -175.2],
  "cook-islands": [-21.2, -159.8],
  // Defunct
  "soviet-union": [60.0, 100.0],
  yugoslavia: [44.0, 21.0],
  czechoslovakia: [49.8, 15.5],
  zaire: [-4.0, 21.8],
  cis: [55.0, 38.0],
};

export const CONTINENT_CENTROIDS: Record<string, [number, number]> = {
  Europe: [54.5, 15.3],
  "South America": [-15.6, -56.1],
  Africa: [0.0, 20.0],
  Asia: [34.0, 80.0],
  "North America": [40.0, -100.0],
  Oceania: [-25.0, 155.0],
  World: [0.0, 0.0],
};

export function centroidForTeam(team: { slug: string; continent: string | null }): [number, number] | null {
  const curated = COUNTRY_CENTROIDS[team.slug];
  if (curated) return curated;
  if (team.continent && CONTINENT_CENTROIDS[team.continent]) {
    return CONTINENT_CENTROIDS[team.continent];
  }
  return null;
}
