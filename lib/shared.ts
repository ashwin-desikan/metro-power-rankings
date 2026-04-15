// Shared types and utilities - safe for both server and client components

export interface Metro {
  rank: number;
  slug: string;
  name: string;
  country: string;
  subCountry?: string;
  primaryState?: string;
  state2?: string;
  state3?: string;
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
