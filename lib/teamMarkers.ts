// Classifies Team List + FootballClub_Data entries into the three
// marker categories used on the metro detail page map. Mirrors the
// Major-League-takes-precedence rule the user established 2026-05-05:
//
//   - "majorLeague" → major === true. Wins over the Notable Venues / Historic
//                     Venues league tag so Beaver Stadium, Cotton Bowl, and
//                     other major-quality venues read as Major League.
//   - "venue"       → League === "Notable Venues" or "Historic Venues" with
//                     major !== true, OR annual === true (F1 GPs, NASCAR,
//                     sailing regattas, all venue-anchored recurring events).
//   - "otherTeam"   → everything else (minor leagues, college, women's,
//                     international, foreign top flights without ML flag).
//
// The map renders only entries with valid lat/lng. Entries without
// coordinates fall back to the written sections only.

export type MarkerCategory = "majorLeague" | "otherTeam" | "venue" | "university";

export type TeamMarker = {
  lat: number;
  lng: number;
  name: string;
  sport: string;
  league: string;
  level?: string;
  // Primary category drives marker color and z-order. Major League takes
  // precedence over the venue label, so Beaver Stadium / MSG / Wembley
  // render in emerald.
  category: MarkerCategory;
  // Every category this marker satisfies. A major-quality venue carries
  // both "majorLeague" and "venue" so it surfaces under either filter.
  // Used by the filter UI for ANY-match visibility.
  categories: MarkerCategory[];
  // Optional override for the second tooltip line. When set, the tooltip
  // shows this string instead of `${sport} · ${league}`. Used by the
  // university marker category to render "Global #N" without abusing
  // the sport/league fields.
  subtitle?: string;
  // Optional outbound link rendered as the bottom-row category label
  // when present. Universities link to the CWUR index; teams have none.
  href?: string;
};

type TeamLike = {
  sport: string;
  league: string;
  team: string;
  major: boolean;
  annual?: boolean;
  level?: string;
  lat?: number;
  lng?: number;
};

export function classifyTeam(t: TeamLike): MarkerCategory {
  // Major League precedence: a flagged row is always Major League regardless
  // of its league label, so a Notable Venue with major=Y (e.g. Beaver Stadium)
  // surfaces as emerald rather than amber.
  if (t.major) return "majorLeague";
  if (t.league === "Notable Venues" || t.league === "Historic Venues") return "venue";
  if (t.annual === true) return "venue";
  return "otherTeam";
}

// All categories the marker satisfies. The primary `category` is one of
// these; venues that are also major-quality get tagged with both so the
// Venues filter shows them alongside non-major venues.
export function deriveCategories(t: TeamLike): MarkerCategory[] {
  const isVenueLeague = t.league === "Notable Venues" || t.league === "Historic Venues";
  const isAnnual = t.annual === true;
  const isVenue = isVenueLeague || isAnnual;
  const out: MarkerCategory[] = [];
  if (t.major) out.push("majorLeague");
  if (isVenue) out.push("venue");
  if (!t.major && !isVenue) out.push("otherTeam");
  return out;
}

// The filter category determines which single chip controls a marker's
// visibility. Venue beats majorLeague: a Major League Venue (Beaver Stadium,
// MSG, Wembley) is governed by the Venues toggle alone — turning Major
// League on without Venues will NOT surface it. This satisfies the rule:
//   Both ML and V on  → all categories visible
//   ML on, V off       → only pure-team Major League rows; no venues
//   ML off, V on       → all venues (including major-quality)
//   Both off            → nothing
// Each marker counts toward exactly one chip count under this rule, so
// totals don't double-count.
export function filterCategoryFor(m: TeamMarker): MarkerCategory {
  if (m.categories.includes("university")) return "university";
  if (m.categories.includes("venue")) return "venue";
  if (m.categories.includes("majorLeague")) return "majorLeague";
  return "otherTeam";
}

// Build markers from a metro's `details.universities` array. Each entry
// must carry numeric lat/lng (the ETL only attaches them when both are
// present in the workbook). The CWUR top-500 had ~100% coverage as of
// 2026-05-09; ranks 501+ surface only in the written list, not on the map.
export type UniversityLike = {
  rank?: number;
  name?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
};

const CWUR_INDEX_URL = "https://cwur.org/2025.php";

export function buildUniversityMarkers(unis: readonly UniversityLike[] | undefined): TeamMarker[] {
  if (!unis) return [];
  const out: TeamMarker[] = [];
  for (const u of unis) {
    if (typeof u.lat !== "number" || typeof u.lng !== "number") continue;
    if (!Number.isFinite(u.lat) || !Number.isFinite(u.lng)) continue;
    if (u.lat === 0 && u.lng === 0) continue;
    if (!u.name) continue;
    const rankStr = u.rank ? `Global #${u.rank}` : "Top-ranked";
    out.push({
      lat: u.lat,
      lng: u.lng,
      name: u.name,
      sport: "",
      league: "",
      category: "university",
      categories: ["university"],
      subtitle: rankStr,
      href: CWUR_INDEX_URL,
    });
  }
  return spreadColocated(dedupeIdentical(out));
}

export function buildMarkers(teams: readonly TeamLike[] | undefined): TeamMarker[] {
  if (!teams) return [];
  const out: TeamMarker[] = [];
  for (const t of teams) {
    if (typeof t.lat !== "number" || typeof t.lng !== "number") continue;
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) continue;
    if (t.lat === 0 && t.lng === 0) continue;
    out.push({
      lat: t.lat,
      lng: t.lng,
      name: t.team,
      sport: t.sport,
      league: t.league,
      level: t.level && t.level !== "" ? t.level : undefined,
      category: classifyTeam(t),
      categories: deriveCategories(t),
    });
  }
  return spreadColocated(dedupeIdentical(out));
}

// Workbook-level duplicates: the same physical venue is sometimes listed
// once per sport under "Notable Venues" (Madison Square Garden appears 4x
// for NBA/NHL/combat/etc.). Collapse those to one marker. We dedupe only
// when name + league + quantized coords all match, so distinct entries
// like Penn State football vs Penn State hockey (same name, different
// league) survive and fan out via spreadColocated.
function dedupeIdentical(markers: TeamMarker[]): TeamMarker[] {
  const seen = new Set<string>();
  const out: TeamMarker[] = [];
  for (const m of markers) {
    const key = `${m.name}|${m.league}|${Math.round(m.lat * COLOCATION_QUANT)}|${Math.round(m.lng * COLOCATION_QUANT)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// Spread markers that share (or near-share) coordinates so every entry is
// independently hoverable. Stadiums with multiple resident teams (Jets +
// Giants at MetLife, Inter + Milan at San Siro, Yankees + their training
// affiliates) collapse to a single visible dot otherwise. Grouping
// quantizes to ~100m at the equator (3 decimals); same-group markers
// fan out on a circle of radius ~110m which reads cleanly at metro zoom
// without misrepresenting position at continent zoom.
const COLOCATION_QUANT = 1000; // 1 / 0.001 degrees ≈ 110m
const FAN_OUT_RADIUS_DEG = 0.001; // ≈ 110m

function spreadColocated(markers: TeamMarker[]): TeamMarker[] {
  if (markers.length < 2) return markers;
  const groups = new Map<string, TeamMarker[]>();
  for (const m of markers) {
    const key = `${Math.round(m.lat * COLOCATION_QUANT)},${Math.round(m.lng * COLOCATION_QUANT)}`;
    const arr = groups.get(key);
    if (arr) arr.push(m);
    else groups.set(key, [m]);
  }
  const out: TeamMarker[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    // Sort group so the highest-priority marker takes the topmost slot in
    // the fan (12 o'clock). Within a tier, longer team names go later so
    // the visual cluster has its most-recognizable label in the prime
    // position. categoryOrder higher = drawn later = on top in z-order.
    const sorted = [...group].sort((a, b) => {
      const dr = CATEGORY_RENDER_ORDER[b.category] - CATEGORY_RENDER_ORDER[a.category];
      if (dr !== 0) return dr;
      return a.name.length - b.name.length;
    });
    const cx = group.reduce((s, m) => s + m.lat, 0) / group.length;
    const cy = group.reduce((s, m) => s + m.lng, 0) / group.length;
    const n = sorted.length;
    for (let i = 0; i < n; i++) {
      // Start at 12 o'clock (–π/2) and rotate clockwise.
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      out.push({
        ...sorted[i],
        lat: cx + FAN_OUT_RADIUS_DEG * Math.cos(angle),
        lng: cy + FAN_OUT_RADIUS_DEG * Math.sin(angle),
      });
    }
  }
  return out;
}

// Render priority. Higher = drawn later = appears on top when icons
// stack. Major League always wins z-order so the gold icon is the
// one the user sees first when an Other-team marker happens to share
// pixels with a Major League marker. Universities sit just under venues
// so a university campus colocated with a stadium does not steal focus.
export const CATEGORY_RENDER_ORDER: Record<MarkerCategory, number> = {
  otherTeam: 0,
  university: 1,
  venue: 2,
  majorLeague: 3,
};

export function sortForRender(markers: TeamMarker[]): TeamMarker[] {
  return [...markers].sort(
    (a, b) => CATEGORY_RENDER_ORDER[a.category] - CATEGORY_RENDER_ORDER[b.category]
  );
}

// Visual palette. Picked to read against the dark CARTO basemap AND the
// teal #4ECDC4 boundary polygon so no marker color competes with the
// metro footprint.
export const MARKER_COLORS: Record<MarkerCategory, string> = {
  majorLeague: "#fbbf24", // amber-400 / warm gold
  venue: "#ec4899",       // pink-500 / magenta
  otherTeam: "#cbd5e1",   // slate-300 / soft neutral
  university: "#6366f1",  // indigo-500 / academic blue
};

export const MARKER_LABELS: Record<MarkerCategory, string> = {
  majorLeague: "Major League",
  otherTeam: "Other teams",
  venue: "Venues",
  university: "Universities",
};

// Format a level value for the tooltip. Pure integers render as
// "Level N"; everything else renders as-is. Empty / undefined returns
// null so the caller can omit the line entirely.
export function formatLevel(level: string | undefined): string | null {
  if (!level) return null;
  const trimmed = level.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return `Level ${trimmed}`;
  return trimmed;
}
