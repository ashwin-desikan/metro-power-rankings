"use client";

// MLB league map. Renders the 30 active franchises as markers at their
// home-ballpark coordinates. Mirrors the NBA LeagueMap pattern; coords
// hardcoded for the 30 current ballparks as of 2025. v2 should pull these
// from the workbook's Team List / Stadiums columns so the ETL keeps them
// fresh automatically.

import { useMemo, useState } from "react";
import MetroMap, { type MapPoint } from "../../MetroMap";
import type { Franchise } from "@/lib/mlb";
import YearFilterBar from "../_shared/YearFilterBar";

type Props = {
  franchises: Franchise[];
};

// Marker color contract. Gold for home ballparks matches the NBA + NHL
// LeagueMap pattern; pink for international venues so the two categories
// read at a glance. Both kept in sync with the legend chips below the map.
const TEAM_COLOR = "#d4af37";
const VENUE_COLOR = "#ec4899";

// MLB Global Games venues (regular-season + spring-training international
// games), 1996 to present. Coordinates either pulled from MetroAreas.xlsx
// Team List (when the venue already exists as a Notable Venues row) or
// sourced via training-data lookup and flagged for editorial verification.
// Tokyo Dome, Sydney Cricket Ground, London Stadium, and Gocheok Sky Dome
// carry workbook coords; Estadio de Béisbol Monterrey and Estadio Alfredo
// Harp Helú are researched values that should land in Team List on the
// next workbook edit so the rest of the site picks them up via ETL.
const GLOBAL_GAMES_VENUES: Array<{ name: string; lat: number; lng: number; city: string }> = [
  { name: "Tokyo Dome",                     lat: 35.70564,   lng: 139.751891, city: "Tokyo, Japan" },
  { name: "Gocheok Sky Dome",               lat: 37.4982,    lng: 126.8671,   city: "Seoul, South Korea" },
  { name: "Sydney Cricket Ground",          lat: -33.891667, lng: 151.224722, city: "Sydney, Australia" },
  { name: "London Stadium",                 lat: 51.5386,    lng: -0.0166,    city: "London, United Kingdom" },
  { name: "Estadio de Béisbol Monterrey",   lat: 25.7194,    lng: -100.3094,  city: "Monterrey, Mexico" },
  { name: "Estadio Alfredo Harp Helú",      lat: 19.4046,    lng: -99.1058,   city: "Mexico City, Mexico" },
];

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
  const [seasonYear, setSeasonYear] = useState<string>("");
  const { minYear, maxYear } = useMemo(() => {
    let lo = 9999, hi = 0;
    for (const f of franchises) {
      const fy = f.founding_year ?? null;
      if (fy && fy < lo) lo = fy;
      if (fy && fy > hi) hi = fy;
    }
    return { minYear: lo === 9999 ? 1876 : lo, maxYear: hi === 0 ? 2026 : Math.max(hi, 2026) };
  }, [franchises]);

  const sy = seasonYear ? parseInt(seasonYear, 10) : null;
  const teamPoints: MapPoint[] = franchises
    .map((f) => {
      if (sy !== null && (f.founding_year ?? 9999) > sy) return null;
      const coords = BALLPARK_COORDS[f.slug];
      if (!coords) return null;
      return {
        slug: f.slug,
        name: f.display_name,
        lat: coords.lat,
        lon: coords.lon,
        color: TEAM_COLOR,
      } as MapPoint;
    })
    .filter((p): p is MapPoint => p !== null);

  // Global Games venues only when ALL year (= sy null).
  const venuePoints: MapPoint[] = sy === null
    ? GLOBAL_GAMES_VENUES.map((v, i) => ({
        slug: `intl-venue-${i}`,
        name: `${v.name} — ${v.city}`,
        lat: v.lat,
        lon: v.lng,
        color: VENUE_COLOR,
      } as MapPoint))
    : [];

  const points: MapPoint[] = [...teamPoints, ...venuePoints];

  return (
    <section className="mb-6 mx-auto max-w-3xl">
      <MetroMap points={points} height={280} showConnections={false} />
      {/* Year filter UI temporarily disabled; see NFL LeagueMap note + BACKLOG. */}
      {/* <YearFilterBar seasonYear={seasonYear} setSeasonYear={setSeasonYear} minYear={minYear} maxYear={maxYear} /> */}
      <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: TEAM_COLOR }} />
          MLB home ballparks ({teamPoints.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: VENUE_COLOR }} />
          Global Games venues
        </span>
      </div>
    </section>
  );
}
