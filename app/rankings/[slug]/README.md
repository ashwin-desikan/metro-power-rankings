# Metro Detail Page (`[slug]/page.tsx`)

## Overview

This is a dynamic, server-side rendered metro profile page for the Global Metro Power Rankings site. It generates static pages for the top 500 metros at build time and serves remaining metros on-demand via ISR.

## Key Features

### 1. Static Generation & Performance
- **generateStaticParams()**: Pre-builds pages for top 500 metros (by score) at build time
- **dynamicParams = true**: Enables on-demand generation for remaining metros
- Balances fast initial load (top metros) with build time constraints

### 2. Dynamic Metadata
- Auto-generated OG tags with metro rank and score
- SEO-friendly titles: `"New York (#1) - Metro Power Rankings"`
- Description includes country, region, population, and score

### 3. Layout Sections

#### Hero Section
- Large metro name with region-based color (from `regionColors`)
- Meta information: country, region, population, GDP, GDP per capita, GAWC class
- Right-aligned rank/score card with region-colored left border
- Percentage of country score (if available)

#### Key Statistics Grid
- Responsive grid (2 cols on mobile, 4 cols on desktop)
- Only renders stats with non-zero values
- Major teams, companies, market cap, skyscrapers, transit infrastructure
- Uses monospace font for numeric values

#### Dimension Breakdown Table
- All 16 dimensions with raw values (no points calculation in UI)
- Alternating row backgrounds for readability
- Right-aligned monospace numbers
- Hover state for better interactivity
- Formatted dimension names mapped from raw keys

#### Teams Section
- Grouped by sport (via optional `TeamCategoryTabs` client component)
- Major teams separated from other professional teams
- Team cards show: sport, league, team name, city, major badge

#### Universities Section
- Ranked list of universities
- Sorted by ranking
- Shows university name, city, and country
- Grid layout (3 cols on large screens)

#### Cultural Assets Section
- Grouped by type (Museum/Landmark, Airport, Sporting Event, etc.)
- Each type shows count and items in grid layout
- Card shows asset name, city, and subtype
- Supports very large metro areas (100+ assets)

#### Luxury Hospitality Section
- Grouped by type (3-Star Michelin, 2-Star Michelin, FTG 5-Star, FTG 4-Star)
- Grid layout with hover effects
- Shows establishment name and city

#### Market Cap Section
- Top 10 public companies by market value
- Formatted currency values
- Summary with total market cap and company count

#### Major Events Section
- Sports events (Olympics, World Cup, etc.)
- Cards show: event name, sport, year, venue
- Grid layout (2 cols on large screens)

#### Similar Metros Section
- 5 metros with adjacent ranks (within 10 positions)
- Cards show rank, name, country, score
- Links to other metro detail pages
- Hover effects for navigation

### 4. Edge Case Handling
- Only renders sections if data exists (no empty sections)
- Handles metros with minimal data (e.g., score 0.3 with only population)
- Safe optional chaining throughout for missing fields
- Graceful degradation for missing detail JSON

### 5. Styling & Theme
- Uses CSS variables from `globals.css`:
  - `--bg`, `--bg-card`, `--bg-card-hover`, `--border`
  - `--text`, `--text-muted`, `--text-dim`, `--accent`
  - Region-specific colors: `--region-*`
- Tailwind CSS dark theme
- Monospace font (`JetBrains Mono`) for numbers via inline styles
- Accent color (#4ECDC4) for highlights and hover states

## File Structure

```
app/rankings/[slug]/
├── page.tsx              # Main server component (611 lines)
├── DetailTabs.tsx        # Optional client components for tabbed filtering
└── README.md             # This file
```

## Helper Components

### StatCard
Props:
- `label: string` - Stat label
- `value: string | number` - Formatted value

### TeamsSection
Props:
- `teams: Team[]` - Array of team objects

Internal:
- Separates major/other teams
- Uses `TeamCard` subcomponent

### TeamCard
Props:
- `team: Team` - Single team object

Renders:
- Sport & league badge
- Team name, city
- Major badge if applicable

## Utility Functions

### formatDimensionName(key)
Maps raw dimension keys to human-readable names:
- `majorLeagueTeams` → "Major League Teams"
- `luxuryStars` → "Luxury Stars (Michelin)"
- Auto-fallback for unmapped keys

### hasStatsToShow(detail)
Checks if any key stats exist to render the stats grid section

## Data Requirements

From `@/lib/data`:

### Interfaces Used
- `Metro` - Basic metro info for listing
- `MetroDetail` - Full profile data including all optional sections
- Helper functions: `formatPop()`, `formatMarketCap()`, `regionColors`

### Data Shape
```typescript
MetroDetail {
  metro: {
    slug, name, country, region, pop, score, rank,
    lat, lon, gdp, gdpPerCapita, primaryCity, gawcClass,
    dims: Record<string, number>,  // 16 dimensions
    pctOfCountry: number
  },
  teams?: Team[],
  universities?: University[],
  culture?: Record<string, CultureAsset[]>,
  skyscrapers?: SkyscraperStats,
  luxury?: LuxuryItem[],
  events?: Event[],
  marketCap?: MarketCapData,
  football?: FootballData
}
```

## Performance Considerations

1. **Build Time**: Only top 500 metros pre-built (score threshold ~5)
2. **File Size**: Server component (no client-side JS overhead)
3. **Data Loading**: Synchronous file reads (acceptable for SSR)
4. **Network**: Minimal - only required data is rendered
5. **Caching**: ISR can be configured in next.config.ts

## Breadcrumb Navigation

Format: `Rankings > Region > Country > Metro Name`
- Links to region pages (if implemented)
- Interactive navigation back to main rankings
- Current metro highlighted in accent color

## TypeScript Types

All imports from `@/lib/data` are properly typed:
```typescript
interface PageProps {
  params: Promise<{ slug: string }>;
}
```

Uses Next.js 15+ async params pattern.

## Future Enhancements

1. **Client Tabs**: Replace TeamsSection with TeamCategoryTabs for sport filtering
2. **Maps**: Add interactive map with metro location (lat/lon available)
3. **Comparisons**: Side-by-side metro comparisons
4. **Trends**: Historical score/rank changes
5. **Export**: PDF/PNG download of profile

## Optional Client Component Integration

The `DetailTabs.tsx` file provides two tabbed components if needed:
- `TeamCategoryTabs` - Filter teams by sport
- `CultureCategoryTabs` - Filter cultural assets by type

To use, import and replace sections in the main page:
```tsx
import { TeamCategoryTabs, CultureCategoryTabs } from "./DetailTabs";
```

## Testing Checklist

- [ ] Verify top 500 metros generate at build time
- [ ] Test on-demand generation for metro #501+
- [ ] Check all sections render correctly for New York (100+ assets)
- [ ] Test minimal metro with only population data
- [ ] Verify region color mapping for all regions
- [ ] Check responsive layout on mobile/tablet/desktop
- [ ] Test breadcrumb navigation links
- [ ] Verify similar metros links work
- [ ] Check metric formatting (population, market cap, etc.)
- [ ] Test hover states and transitions
