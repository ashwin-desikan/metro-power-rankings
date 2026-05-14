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

const STADIUM_COORDS: Record<string, { lat: number; lon: number }> = {
  // AFC East
  "bills":          { lat: 42.7738, lon: -78.7869 }, // Highmark Stadium
  "dolphins":       { lat: 25.9580, lon: -80.2389 }, // Hard Rock Stadium
  "patriots":       { lat: 42.0909, lon: -71.2643 }, // Gillette Stadium
  "jets":           { lat: 40.8136, lon: -74.0744 }, // MetLife Stadium (shared)
  // AFC North
  "ravens":         { lat: 39.2780, lon: -76.6228 }, // M&T Bank Stadium
  "bengals":        { lat: 39.0954, lon: -84.5160 }, // Paycor Stadium
  "browns":         { lat: 41.5061, lon: -81.6995 }, // Huntington Bank Field
  "steelers":       { lat: 40.4468, lon: -80.0158 }, // Acrisure Stadium
  // AFC South
  "texans":         { lat: 29.6847, lon: -95.4107 }, // NRG Stadium
  "colts":          { lat: 39.7601, lon: -86.1639 }, // Lucas Oil Stadium
  "jaguars":        { lat: 30.3239, lon: -81.6373 }, // EverBank Stadium
  "titans":         { lat: 36.1665, lon: -86.7713 }, // Nissan Stadium
  // AFC West
  "broncos":        { lat: 39.7439, lon: -105.0201 }, // Empower Field at Mile High
  "chiefs":         { lat: 39.0489, lon: -94.4839 },  // GEHA Field at Arrowhead Stadium
  "raiders":        { lat: 36.0908, lon: -115.1838 }, // Allegiant Stadium
  "chargers":       { lat: 33.9534, lon: -118.3392 }, // SoFi Stadium (shared)
  // NFC East
  "cowboys":        { lat: 32.7473, lon: -97.0945 }, // AT&T Stadium
  "giants":         { lat: 40.8136, lon: -74.0744 }, // MetLife Stadium (shared)
  "eagles":         { lat: 39.9008, lon: -75.1675 }, // Lincoln Financial Field
  "commanders":     { lat: 38.9078, lon: -76.8645 }, // Northwest Stadium
  // NFC North
  "bears":          { lat: 41.8623, lon: -87.6167 }, // Soldier Field
  "lions":          { lat: 42.3400, lon: -83.0456 }, // Ford Field
  "packers":        { lat: 44.5013, lon: -88.0622 }, // Lambeau Field
  "vikings":        { lat: 44.9738, lon: -93.2581 }, // U.S. Bank Stadium
  // NFC South
  "falcons":        { lat: 33.7553, lon: -84.4006 }, // Mercedes-Benz Stadium
  "panthers":       { lat: 35.2258, lon: -80.8528 }, // Bank of America Stadium
  "saints":         { lat: 29.9511, lon: -90.0812 }, // Caesars Superdome
  "buccaneers":     { lat: 27.9759, lon: -82.5033 }, // Raymond James Stadium
  // NFC West
  "cardinals":      { lat: 33.5275, lon: -112.2625 }, // State Farm Stadium
  "rams":           { lat: 33.9534, lon: -118.3392 }, // SoFi Stadium (shared)
  "49ers":          { lat: 37.4030, lon: -121.9698 }, // Levi's Stadium
  "seahawks":       { lat: 47.5952, lon: -122.3316 }, // Lumen Field
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
    <section className="mb-6">
      <MetroMap points={points} height={280} showConnections={false} />
    </section>
  );
}
