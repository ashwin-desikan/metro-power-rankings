// Shared types and utilities - safe for both server and client components

export interface Metro {
  rank: number;
  slug: string;
  name: string;
  country: string;
  // ETL-resolved slug for /countries/[slug]. Prefers UK constituent
  // (England / Scotland / Wales / Northern Ireland) when present; falls
  // back to the sovereign country. Set when the country name matches a
  // row in public/data/countries.json.
  countrySlug?: string;
  // Sovereign country slug for breadcrumb-style links when the metro is in
  // a constituent (e.g. Manchester's countrySlug = 'england', sovereignSlug
  // = 'united-kingdom'). Only set when the two differ.
  sovereignSlug?: string;
  subCountry?: string;
  primaryState?: string;
  state2?: string;
  state3?: string;
  // ETL-resolved state slugs from the (Country, Administrative Division)
  // match against the States sheet. Set when the corresponding state name
  // resolves to a row in public/data/states.json. The homepage rankings
  // table and country-page metro table read these directly.
  stateSlug?: string;
  state2Slug?: string;
  state3Slug?: string;
  // Editorial overrides for metros whose footprint extends beyond the
  // workbook's primary/state2/state3 slots (e.g. Greater London Built-Up
  // Area into Surrey/Hertfordshire/Berkshire). Each entry carries a name
  // and an optional slug; if slug is missing the override didn't resolve
  // and the name renders as plain text rather than a link.
  additionalStates?: { name: string; slug?: string }[];
  region: string;
  continent: string;
  pop: number;
  score: number;
  lat: number;
  lon: number;
  primaryCity: string;
  gdp: number;
  majorTeams: number;
  companies: number;
  marketCap: number;
  skyscrapers: number;
  metroStations: number;
  universities: number;
}

export interface Region {
  name: string;
  metros: number;
  above50: number;
  above20: number;
  totalScore: number;
  totalPop: number;
  totalMarketCap: number;
  medianScore: number;
  top3: { name: string; score: number; rank: number; slug: string }[];
}

export function formatPop(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

export function formatMarketCap(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(0) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

export function formatGdp(n: number): string {
  // GDP values are already in billions
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "T";
  if (n >= 1) return "$" + n.toFixed(0) + "B";
  if (n > 0) return "$" + (n * 1000).toFixed(0) + "M";
  return "N/A";
}

// Kebab-case slug for any free-text label (region names, etc.). Used to
// build anchor IDs on the homepage that the metro page links into.
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatDimValue(key: string, value: number): string {
  // Format large numbers cleanly instead of scientific notation
  if (key === "marketCap") return formatMarketCap(value);
  if (key === "airportScore" || key === "luxuryStars") return value.toFixed(1);
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(2);
}

export const regionColors: Record<string, string> = {
  "North America": "var(--region-na)",
  Europe: "var(--region-eu)",
  "East Asia": "var(--region-eastasia)",
  China: "var(--region-china)",
  Oceania: "var(--region-oceania)",
  ASEAN: "var(--region-asean)",
  "Latin America": "var(--region-latam)",
  MENA: "var(--region-mena)",
  Eurasia: "var(--region-eurasia)",
  "South Asia": "var(--region-southasia)",
  Africa: "var(--region-africa)",
};
