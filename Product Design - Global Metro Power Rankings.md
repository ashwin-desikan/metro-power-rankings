# Global Metro Power Rankings: Product Design Document

**Version:** 1.0
**Date:** April 13, 2026
**Author:** Ashwin

---

## Product Vision

A hybrid editorial + interactive data explorer that makes the Global Metro Power Rankings dataset publicly accessible. The site serves two audiences simultaneously: Substack readers who want deeper engagement with the analysis, and a broader public discovering the product through search, social sharing, and city-specific pages.

The product should feel like a blend of **The Economist's data visualizations** and **Nate Silver's data journalism**: opinionated editorial content supported by a powerful, explorable dataset underneath.

---

## Architecture Recommendation: Static Pre-Built + PWA

### Why No Backend

The core dataset is 4,285 metros with ~30 scoring columns. Pre-processed to JSON, this compresses to roughly 800KB-1MB gzipped, which is fast enough for client-side search and filtering. The detail tables (teams, universities, cultural assets, hospitality) can be code-split and lazy-loaded when a user drills into a specific metro.

This means:

- **Zero hosting cost** on Vercel or Netlify (free tier covers this easily)
- **No database to manage, no API to maintain, no auth complexity**
- **Near-instant page loads** via static generation + CDN edge caching
- **PWA installability** for offline access and app-like feel on mobile
- **SEO-friendly** because every metro gets its own statically-generated page

If you later want user accounts (saved comparisons, personalized dashboards), you can bolt on Supabase or Clerk without rearchitecting.

### Recommended Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Static generation for 4,285 metro pages, excellent SEO, built-in PWA support via next-pwa |
| Styling | **Tailwind CSS** | Fast iteration, responsive by default, matches the data-dense UI needed |
| Charts | **Recharts** or **D3** | Recharts for standard charts, D3 for the globe/map visualization |
| Map | **Mapbox GL JS** or **Deck.gl** | Interactive globe with metro points sized by score |
| Search | **Fuse.js** | Client-side fuzzy search across 4,285 metro names, zero API calls |
| Data | **Pre-built JSON from Excel** | Build script converts .xlsx to typed JSON at build time |
| Hosting | **Vercel** | Free tier, automatic deploys from GitHub, edge CDN, analytics |
| PWA | **next-pwa** | Service worker, offline support, installable on mobile |
| Analytics | **Plausible** or **Vercel Analytics** | Privacy-friendly, no cookie banners needed |
| Domain | **metropowerrankings.com** (or similar) | Check availability |

### Build Pipeline

```
MetroAreas.xlsx
    → Python script at build time
    → /data/metros.json (main rankings, ~800KB gzipped)
    → /data/details/[metro-slug].json (per-metro detail files)
    → /data/regions.json (aggregated regional stats)
    → Next.js static generation consumes JSON
    → 4,285+ statically generated pages
    → Deploy to Vercel
```

When you update the Excel file, you push to GitHub, the build script re-extracts, and Vercel redeploys. No manual data pipeline.

---

## Information Architecture

### Site Map

```
/                           → Homepage (hero + top 25 + globe)
/rankings                   → Full searchable/filterable table (4,285 metros)
/rankings/[metro-slug]      → Individual metro profile page
/compare                    → Side-by-side metro comparison tool
/regions                    → Regional analysis (11 regions or 6 continents)
/regions/[region-slug]      → Regional deep-dive
/articles                   → Editorial content (synced from or linking to Substack)
/articles/[slug]            → Individual article
/methodology                → Scoring methodology explainer
/about                      → About the project + author
```

### Navigation

Primary nav: **Rankings | Compare | Regions | Articles | Methodology**

Persistent search bar in the header (Fuse.js, type-ahead with top results).

---

## Page-by-Page Design

### 1. Homepage

**Goal:** Instantly communicate the scale and ambition of the dataset, then invite exploration.

**Layout (top to bottom):**

1. **Hero section:** Dark background, large title "Global Metro Power Rankings," subtitle "16 dimensions. 4,285 metros. 237 countries." Animated counter or subtle globe rotation behind the text.

2. **Interactive globe:** A 3D or 2D map with dots for every scored metro, sized proportional to score, colored by region. Hovering shows metro name + score. Clicking navigates to the metro page. This is the "wow" moment.

3. **Top 25 table:** The flagship ranking, styled cleanly. Columns: Rank, Metro, Country, Population, Score. Each row links to the metro profile. Regional filter chips above.

4. **Editorial preview:** Cards linking to the latest 2-3 articles. "The San Francisco Anomaly," "New York vs. London," etc.

5. **Score distribution chart:** The skew visualization (70.7% below 1.0). This communicates the dataset's insight instantly.

6. **Footer:** Links to Substack, methodology, about, data download option.

### 2. Full Rankings Table (/rankings)

**Goal:** Let anyone search, sort, filter, and explore all 4,285 metros.

**Features:**

- **Search bar** (fuzzy, matches metro name, country, or region)
- **Filter sidebar/drawer:**
  - Score range slider (0-176)
  - Population range slider
  - Continent/Region multi-select
  - Country multi-select
  - Dimension filters (e.g., "has stock exchange," "has metro transit," "score > 50 in market cap")
- **Sortable columns:** Click any column header to sort
- **Virtualized list:** Only renders visible rows (react-window) for performance with 4,285 rows
- **Column toggle:** Let users show/hide dimension columns
- **Export:** Download filtered results as CSV

### 3. Metro Profile Page (/rankings/[metro-slug])

**Goal:** Deep dive into a single metro. This is the most SEO-valuable page type (4,285 unique pages, each targeting "[City Name] global ranking" queries).

**Layout:**

1. **Header:** Metro name, country flag, region, population, overall rank, score (large)
2. **Radar chart:** 16-dimension spider chart showing the metro's scoring profile
3. **Dimension breakdown table:** Each of the 16 dimensions with raw value, weighted score, and percentile rank
4. **"What's here" detail sections** (lazy-loaded):
   - Sports teams (from Team List sheet)
   - Universities (from Universities sheet)
   - Cultural assets (from Culture-Infra sheet)
   - Skyscrapers (from Skyscrapers sheet)
   - Luxury hospitality (from Luxury Hospitality sheet)
   - Sporting events hosted (from Golf-Tennis-F1 sheet)
5. **Mini-map:** Mapbox centered on the metro's lat/long
6. **"Similar metros" recommendations:** 3-5 metros with similar composite scores or scoring profiles
7. **Share button:** Pre-formatted social card ("New York ranks #1 globally with a score of 175.7")

### 4. Comparison Tool (/compare)

**Goal:** Side-by-side comparison of 2-4 metros.

**Features:**

- Search/select up to 4 metros
- Overlaid radar charts
- Dimension-by-dimension bar chart comparison
- Highlighted advantages per metro
- Shareable URL (e.g., /compare?metros=new-york,london,tokyo)
- Pre-built "popular comparisons" (NY vs London, Singapore vs Hong Kong, etc.)

### 5. Regional Analysis (/regions)

**Goal:** The continental and 11-region analysis from the article, but interactive.

**Features:**

- Toggle between 6-continent and 11-region views
- Regional summary cards (champion, #2, #3, metro count, metros above 50)
- Click into a region for its full metro table
- Cross-regional comparison charts (median score, top score, depth metrics)

### 6. Articles (/articles)

**Goal:** House the editorial content. Two options:

- **Option A:** Embed Substack posts via oEmbed/API and keep Substack as the CMS
- **Option B:** Write articles in MDX within the Next.js repo, with interactive charts inline

Option B is stronger for the product (inline interactivity, no iframe jank, better SEO) but means maintaining two publishing surfaces. A reasonable hybrid: publish on Substack for the newsletter audience, and republish enhanced versions on the site with interactive elements.

---

## Visual Design Direction

### Aesthetic

Dark mode primary (like Bloomberg Terminal meets The Pudding). Clean typography, data-dense but not cluttered. The editorial content should feel like longform data journalism; the explorer should feel like a professional tool.

### Typography

- Headlines: **Space Grotesk** or **Inter** (geometric, modern, good with numbers)
- Body: **Inter** or **Source Serif Pro** for editorial content
- Data/tables: **JetBrains Mono** or **Tabular figures in Inter**

### Color Palette

- Background: #0A0A0F (near-black) with #1A1A2E cards
- Accent: #4ECDC4 (teal) for primary actions and highlights
- Region colors: Distinct, accessible palette for the 11 regions (used consistently on map, charts, tables)
- Score gradient: Red (low) through yellow to green (high) for heatmap-style scoring

### Responsive Behavior

- Desktop: Full table layouts, side-by-side comparisons, globe visualization
- Tablet: Stacked cards, collapsible filters, simplified charts
- Mobile: Single-column, swipeable cards, bottom sheet for filters, simplified data views

---

## PWA Specifications

- **Installable** from browser on iOS, Android, and desktop
- **Offline capable:** Cache the main rankings JSON and static pages via service worker
- **App-like navigation:** No browser chrome when installed
- **Share target:** Accept shares from other apps to pre-populate comparison tool
- **Splash screen and icons:** Branded, consistent with the dark theme

---

## SEO Strategy

Each of the 4,285 metro pages is a unique, indexable URL with structured data. Target queries like:

- "[City] world ranking"
- "[City] vs [City] comparison"
- "best cities in [Region]"
- "global city rankings 2026"

Use JSON-LD structured data for each metro (Place schema with aggregateRating). Generate Open Graph images dynamically (metro name, rank, score on a branded card) for social sharing.

---

## Data Update Workflow

1. Update MetroAreas.xlsx locally
2. Run `npm run extract-data` (Python script that reads Excel, outputs JSON)
3. Commit updated JSON to GitHub
4. Vercel auto-deploys in ~60 seconds
5. Service worker updates cached data on next visit

No database migrations, no API versioning, no downtime.

---

## Phase Roadmap

### Phase 1: MVP (4-6 weeks)

- Homepage with top 25 table and score distribution chart
- Full rankings table with search, sort, and basic filters
- Metro profile pages (all 4,285)
- Methodology page
- PWA setup
- Deploy to Vercel

### Phase 2: Rich Features (4-6 weeks)

- Interactive globe/map visualization
- Comparison tool
- Regional analysis pages
- Radar charts on metro profiles
- Social sharing with dynamic OG images

### Phase 3: Editorial Integration (2-4 weeks)

- Articles section with MDX
- Enhanced Substack cross-posting
- Interactive inline charts in articles
- Newsletter signup integration

### Phase 4: Community (Optional, future)

- User accounts (Supabase)
- Saved comparisons and custom rankings
- Comments or annotations
- API access for researchers
- Embeddable widgets for other sites

---

## Open Questions

1. **Domain name?** metropowerrankings.com, metrorankings.com, cityscorecard.com, etc.
2. **Data licensing?** Will the raw data be downloadable, or is the site the only access point?
3. **Substack relationship?** Keep the newsletter as the primary editorial channel with the site as companion, or gradually shift editorial to the site?
4. **Monetization (if any)?** Sponsorship, premium data access, consulting, or purely a portfolio/thought-leadership piece?
