"use client";

// NFL league map. Renders the 32 active franchises as markers at their
// home-stadium coordinates. Mirrors the NBA LeagueMap pattern; coords
// hardcoded for the 32 current stadiums as of 2025. v2 should pull these
// from the workbook's Team List columns so the ETL keeps them fresh.

import MetroMap, { type MapPoint } from "../../MetroMap";
import type { Franchise } from "@/lib/nfl";

type Props = {
  franchises: Franchise[];
};

// Keys are FULL franchise slugs ("green-bay-packers"), matching the values
// emitted by the ETL into public/data/nfl/franchises.json. The earlier short-
// key form ("packers") never matched f.slug, so every point was filtered out
// and the map silently rendered nothing. v2 should pull these from the
// MetroAreas Team List so the ETL keeps them fresh (matching NBA's pattern).
const STADIUM_COORDS: Record<string, { lat: number; lon: number }> = {
  // AFC East
  "buffalo-bills":          { lat: 42.7738, lon: -78.7869 }, // Highmark Stadium
  "miami-dolphins":         { lat: 25.9580, lon: -80.2389 }, // Hard Rock Stadium
  "new-england-patriots":   { lat: 42.0909, lon: -71.2643 }, // Gillette Stadium
  "new-york-jets":          { lat: 40.8136, lon: -74.0744 }, // MetLife Stadium (shared)
  // AFC North
  "baltimore-ravens":       { lat: 39.2780, lon: -76.6228 }, // M&T Bank Stadium
  "cincinnati-bengals":     { lat: 39.0954, lon: -84.5160 }, // Paycor Stadium
  "cleveland-browns":       { lat: 41.5061, lon: -81.6995 }, // Huntington Bank Field
  "pittsburgh-steelers":    { lat: 40.4468, lon: -80.0158 }, // Acrisure Stadium
  // AFC South
  "houston-texans":         { lat: 29.6847, lon: -95.4107 }, // NRG Stadium
  "indianapolis-colts":     { lat: 39.7601, lon: -86.1639 }, // Lucas Oil Stadium
  "jacksonville-jaguars":   { lat: 30.3239, lon: -81.6373 }, // EverBank Stadium
  "tennessee-titans":       { lat: 36.1665, lon: -86.7713 }, // Nissan Stadium
  // AFC West
  "denver-broncos":         { lat: 39.7439, lon: -105.0201 }, // Empower Field at Mile High
  "kansas-city-chiefs":     { lat: 39.0489, lon: -94.4839 },  // GEHA Field at Arrowhead Stadium
  "las-vegas-raiders":      { lat: 36.0908, lon: -115.1838 }, // Allegiant Stadium
  "los-angeles-chargers":   { lat: 33.9534, lon: -118.3392 }, // SoFi Stadium (shared)
  // NFC East
  "dallas-cowboys":         { lat: 32.7473, lon: -97.0945 }, // AT&T Stadium
  "new-york-giants":        { lat: 40.8136, lon: -74.0744 }, // MetLife Stadium (shared)
  "philadelphia-eagles":    { lat: 39.9008, lon: -75.1675 }, // Lincoln Financial Field
  "washington-commanders":  { lat: 38.9078, lon: -76.8645 }, // Northwest Stadium
  // NFC North
  "chicago-bears":          { lat: 41.8623, lon: -87.6167 }, // Soldier Field
  "detroit-lions":          { lat: 42.3400, lon: -83.0456 }, // Ford Field
  "green-bay-packers":      { lat: 44.5013, lon: -88.0622 }, // Lambeau Field
  "minnesota-vikings":      { lat: 44.9738, lon: -93.2581 }, // U.S. Bank Stadium
  // NFC South
  "atlanta-falcons":        { lat: 33.7553, lon: -84.4006 }, // Mercedes-Benz Stadium
  "carolina-panthers":      { lat: 35.2258, lon: -80.8528 }, // Bank of America Stadium
  "new-orleans-saints":     { lat: 29.9511, lon: -90.0812 }, // Caesars Superdome
  "tampa-bay-buccaneers":   { lat: 27.9759, lon: -82.5033 }, // Raymond James Stadium
  // NFC West
  "arizona-cardinals":      { lat: 33.5275, lon: -112.2625 }, // State Farm Stadium
  "los-angeles-rams":       { lat: 33.9534, lon: -118.3392 }, // SoFi Stadium (shared)
  "san-francisco-49ers":    { lat: 37.4030, lon: -121.9698 }, // Levi's Stadium
  "seattle-seahawks":       { lat: 47.5952, lon: -122.3316 }, // Lumen Field
};

export default function LeagueMap({ franchises }: Props) {
  const points: MapPoint[] = franchises
    .map((f) => {
      const coords = STADIUM_COORDS[f.slug];
      if (!coords) return null;
      return {
        slug: f.slug,
        name: f.name,
        lat: coords.lat,
        lon: coords.lon,
      } as MapPoint;
    })
    .filter((p): p is MapPoint => p !== null);

  return (
    <section className="mb-6 mx-auto max-w-3xl">
      <MetroMap points={points} height={280} showConnections={false} />
    </section>
  );
}
