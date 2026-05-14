"use client";

// MLB league map. Renders the 30 active franchises as markers at their
// home-ballpark coordinates. Mirrors the NBA LeagueMap pattern; coords
// hardcoded for the 30 current ballparks as of 2025. v2 should pull these
// from the workbook's Team List / Stadiums columns so the ETL keeps them
// fresh automatically.

import MetroMap, { type MapPoint } from "../../MetroMap";
import type { Franchise } from "@/lib/mlb";

type Props = {
  franchises: Franchise[];
};

const BALLPARK_COORDS: Record<string, { lat: number; lon: number }> = {
  // AL East
  "yankees":       { lat: 40.8296, lon: -73.9262 },  // Yankee Stadium
  "red-sox":       { lat: 42.3467, lon: -71.0972 },  // Fenway Park
  "blue-jays":     { lat: 43.6414, lon: -79.3894 },  // Rogers Centre
  "rays":          { lat: 27.7682, lon: -82.6534 },  // Tropicana Field
  "orioles":       { lat: 39.2839, lon: -76.6217 },  // Oriole Park at Camden Yards
  // AL Central
  "guardians":     { lat: 41.4962, lon: -81.6852 },  // Progressive Field
  "tigers":        { lat: 42.3390, lon: -83.0485 },  // Comerica Park
  "white-sox":     { lat: 41.8300, lon: -87.6338 },  // Guaranteed Rate Field
  "twins":         { lat: 44.9817, lon: -93.2776 },  // Target Field
  "royals":        { lat: 39.0517, lon: -94.4803 },  // Kauffman Stadium
  // AL West
  "astros":        { lat: 29.7572, lon: -95.3556 },  // Minute Maid Park
  "angels":        { lat: 33.8003, lon: -117.8827 }, // Angel Stadium
  "athletics":     { lat: 38.5404, lon: -121.5024 }, // Sutter Health Park (West Sac, interim)
  "mariners":      { lat: 47.5915, lon: -122.3326 }, // T-Mobile Park
  "rangers":       { lat: 32.7473, lon: -97.0846 },  // Globe Life Field
  // NL East
  "mets":          { lat: 40.7571, lon: -73.8458 },  // Citi Field
  "phillies":      { lat: 39.9061, lon: -75.1665 },  // Citizens Bank Park
  "braves":        { lat: 33.8908, lon: -84.4678 },  // Truist Park
  "nationals":     { lat: 38.8730, lon: -77.0074 },  // Nationals Park
  "marlins":       { lat: 25.7781, lon: -80.2197 },  // loanDepot park
  // NL Central
  "cubs":          { lat: 41.9484, lon: -87.6553 },  // Wrigley Field
  "cardinals":     { lat: 38.6226, lon: -90.1928 },  // Busch Stadium
  "reds":          { lat: 39.0975, lon: -84.5070 },  // Great American Ball Park
  "brewers":       { lat: 43.0280, lon: -87.9712 },  // American Family Field
  "pirates":       { lat: 40.4469, lon: -80.0057 },  // PNC Park
  // NL West
  "dodgers":       { lat: 34.0739, lon: -118.2400 }, // Dodger Stadium
  "giants":        { lat: 37.7786, lon: -122.3893 }, // Oracle Park
  "padres":        { lat: 32.7077, lon: -117.1571 }, // Petco Park
  "diamondbacks":  { lat: 33.4453, lon: -112.0667 }, // Chase Field
  "rockies":       { lat: 39.7559, lon: -104.9942 }, // Coors Field
};

export default function LeagueMap({ franchises }: Props) {
  const points: MapPoint[] = franchises
    .map((f) => {
      const coords = BALLPARK_COORDS[f.slug];
      if (!coords) return null;
      return {
        slug: f.slug,
        name: f.display_name,
        lat: coords.lat,
        lon: coords.lon,
      } as MapPoint;
    })
    .filter((p): p is MapPoint => p !== null);

  return (
    <section className="mb-6">
      <MetroMap points={points} height={420} showConnections={false} />
    </section>
  );
}
