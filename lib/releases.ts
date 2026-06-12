import "server-only";

// Shared release-notes data. Single source of truth, imported by both the
// /updates page renderer (full list, brevity-validated) and the home-page
// sidebar (latest few items). Keep the same shape and same ordering rules:
//   - Newest entry at index 0
//   - One date block per shipping day; if multiple bundles ship same-day
//     they get amended into a single entry per the brevity discipline
//   - Headlines under 12 words, bullets under 220 chars, 4 bullets max
// Validation lives on /updates so /updates remains the single failure
// surface; the sidebar is purely a reader.

export type Release = {
  date: string; // ISO yyyy-mm-dd
  headline: string;
  items: string[];
};

export const RELEASES: Release[] = [
  {
    date: "2026-06-12",
    headline: "Baseball and the Olympics arrive",
    items: [
      "Three new international portals: the Olympics (every Games since 1896, lineages folded into modern nations), the World Baseball Classic, and basketball with FIBA World Cup and Olympic podium history.",
      "The EuroLeague joins as basketball's club crown: 69 seasons of champions, Final Four history, the all-time table, and gold title chips on metro cards.",
      "Domestic honours arrive for club rugby and franchise T20 cricket: winners-only hubs for 7 rugby and 11 T20 competitions, gold title chips and club colors on metro cards, and defunct clubs on their metros.",
      "World Cup 2026 group tables now update live from ESPN, cricket rankings carry the Citizen of Nowhere name, and country pages lead with National Teams cards linking countries, teams, and sport hubs.",
    ],
  },
  {
    date: "2026-06-11",
    headline: "National teams: football, cricket, rugby union",
    items: [
      "Every country page now has a National Teams section: a men's football card with federation, FIFA and ELO ranks, World Cup appearances and major trophies, plus a women's card with World Cup history.",
      "Cards link straight to each team's full tournament record, covering 230 men's national teams and all 44 Women's World Cup nations.",
      "New International Cricket portal: every men's international since 1877 for all 110 nations, with recomputed monthly ICC rankings, number-one reigns, major honours, and the named series trophies.",
      "New Rugby Union portal: test rugby since 1871, every Six Nations and Rugby Championship season, all ten World Cup finals, and weekly world rankings since 2003; both sports join the country-hub cards.",
    ],
  },
  {
    date: "2026-06-10",
    headline: "College Football: bowls, champions, former programs",
    items: [
      "Season tables now show a clearer Bowl column (a check for a bowl, a Major tag, and the era: Bowl Coalition, Bowl Alliance, BCS, or CFP) and link each season to Sports Reference.",
      "National-title seasons get a gold champion tag, Heisman counts now reflect winners only (not finalists), and the Award winners table has a sticky header.",
      "New National Champions table on the College Football hub: every season with its Heisman winner, each school linking to its program page.",
      "Season tables now have sticky headers site-wide and open by default on NFL, NBA and MLB; metro cards gain a per-sport icon, former FBS programs appear under Defunct Teams, and pre-1900 games show dates.",
    ],
  },
  {
    date: "2026-06-09",
    headline: "College Football hub, AFL and NRL portals",
    items: [
      "New College Football hub at /teams/cfb: every major program through history with national titles, conference championships, and the greatest games by Game Score, filterable by decade with video for the classics.",
      "FBS programs now lead each metro's college teams with team colors, national titles, conference titles, and major seasons; once-major FCS schools carry the same detail in College/University.",
      "New AFL and NRL portals: every VFL/AFL (1897+) and NSWRL/NRL (1908+) club with all-time premierships, the latest ladder, an honours table, and the full Grand Final roll; defunct clubs get pages and metro cards.",
      "Australian football and rugby league histories sourced from afltables.com.",
    ],
  },
  {
    date: "2026-06-08",
    headline: "CFL portal and richer defunct-team history",
    items: [
      "New CFL portal: every franchise, live standings from CFL.ca, full season-by-season records, and the complete Grey Cup history back to 1909.",
      "Defunct and relocated team cards now show a franchise's titles, finals, and record for only the years it spent in that city, across the NFL, MLB, NBA, NHL, CFL, WNBA, and MLS.",
      "Relocated and defunct teams carry the exact name, years, and tags for each city, rebuilt season by season so a franchise's separate eras stay separate.",
      "The main rankings filters (Top 25/100, region, continent, search) now persist as you browse and reset only on a new session.",
    ],
  },
  {
    date: "2026-06-07",
    headline: "Relocated and defunct teams on metro pages",
    items: [
      "Each metro now lists the teams that once played there, relocated or folded, with the era name, the years, and a link to its current or final page.",
      "Added more international tournament finals to the national-team history.",
      "Refreshed each metro's teams, venues, and events from the latest source workbook.",
    ],
  },
  {
    date: "2026-06-06",
    headline: "World Cup 2026 projections: group odds and title odds",
    items: [
      "The World Cup 2026 section now shows projected points and round-of-32 odds for every team.",
      "A new Title Odds table gives each nation's chance of the semifinals, the final, and lifting the trophy.",
      "Built from tens of thousands of Monte Carlo simulations blending market odds with our Elo ranking; refreshed daily.",
    ],
  },
  {
    date: "2026-06-05",
    headline: "Greatest Games, Geography of Erasure, and English Domestic Cups hubs",
    items: [
      "New Greatest Games hub at /sports/games gathers the top NFL, NBA and MLB games by Game Score plus every Stanley Cup presentation game, each filterable by decade and linked to its franchise.",
      "The Greatest Games hub launches with a by-sport view (a unified cross-sport ranking is coming) and inline Watch buttons of channel-verified clips on the NFL/NBA/MLB top-games rows and the NHL Cup-presentation reel.",
      "New Sports Deep-Dive 'The Geography of Erasure' at /sports/geography-of-erasure: 18 ghost franchises, champions erased when their metro was outgrown, grouped by how they died and each tagged on its own team page.",
      "New English Domestic Cups hub at /teams/football/cups: every FA Cup (from 1871-72) and League Cup (from 1960-61) semifinal and final, with semifinal markers on club season tables and pages for 14 Victorian cup clubs.",
    ],
  },
  {
    date: "2026-06-04",
    headline: "Team Valuations board, International ratings refresh, sports polish",
    items: [
      "New Team Valuations board at /sports/valuations: 187 teams across the NFL, NBA, MLB, NHL and global football, sortable and filterable, each also surfaced as a clickable valuation chip in its team page header.",
      "The Sports hub is reordered with a Deep-Dives section (Team Valuations and The Team That Wins the City) and on-this-page nav up top, then the league directory, then the team map.",
      "International Football ELO and FIFA rankings and their as-of dates are refreshed from the latest workbook, and the 1997 Other Tournaments edition is now correctly labeled the Tournoi de France.",
      "NHL Stanley Cup presentation games now show which game of the series clinched the Cup; the NBA all-time top games flag overtime, including the multi-OT classics (2OT, 3OT).",
    ],
  },
  {
    date: "2026-06-03",
    headline: "NBA Game Score, NFL standings and table fixes, hub navigation",
    items: [
      "NBA top games are now ranked by the workbook's documented Game Score (team strength, competitiveness, stakes, seeding), surfacing the real all-time classics.",
      "NFL standings zero out during the offseason instead of displaying last season's final records as if they were live.",
      "Every sports hub gains an on-this-page nav (for the NFL: Current Standings, Map, All-Time Table, Top Games) so you can jump straight to any section.",
      "All-time tables gain a Current/All filter folding in defunct franchises (now each with its own team page, tagged), plus Metro for NBA/NHL/MLS, an NFL Champ App column, and full-width NFL/MLB standings.",
    ],
  },
  {
    date: "2026-06-02",
    headline: "Club Football hubs, live WNBA/NFL/MLS standings, compact metro dimensions, and fixes",
    items: [
      "Live 2026 standings: WNBA team pages now pin the current season atop Season by Season, and the NFL hub gains a Standings board across all eight divisions, both live from ESPN and refreshed hourly.",
      "Club Football adds Copa Libertadores with a live 2026 bracket, Other Continental, and a full MLS hub, plus club pages, colors, season history, and metro trophy badges for 400+ continental and MLS teams.",
      "Football tables now read \"Not Promoted (PO)\" and tag semifinal exits \"Playoffs\"; NWSL Gotham FC and OL Reign deep-link to their clubs; MLB, NBA, NFL season tables scroll cleanly on mobile.",
      "Metro pages get a compact Dimension Breakdown (16 dimensions with global rank, replacing Key Statistics), refreshed rankings from the latest workbook, and updated top-team picks (LA now Lakers and Dodgers).",
    ],
  },
  {
    date: "2026-06-01",
    headline: "Women's Football portal, WNBA hub, and live standings",
    items: [
      "New Women's Football portal at /teams/wfootball: tournament and league hubs (UWCL, FIFA Women's Champions Cup, WSL, Women's FA Cup, Liga F, NWSL) plus a page for every current NWSL, WSL, and Liga F club.",
      "New WNBA hub at /teams/wnba with every current and defunct franchise, all-time records, champions since 1997, per-team pages, and the live 2026 standings from ESPN.",
      "New FIFA Women's World Cup hub at /teams/national/womens-world-cup: all nine editions from 1991 to 2023 with champions and finals, plus a per-nation team page for each country.",
      "Live NWSL and WNBA standings on their hubs; the All Sports directory and menu now tag each league's season state; Gold Standard now covers Rugby Union, Volleyball, Handball, and WNBA.",
    ],
  },
  {
    date: "2026-05-31",
    headline: "IPL hub, football overhaul, Spurs reach NBA Finals",
    items: [
      "New IPL hub at /teams/ipl: franchise pages for all 10 active clubs and 5 defunct, all-time champions, finals history, playoff results, and metro area links.",
      "Football league standings now match season-by-season column order; Eur Comp cells show winner and finalist badges; playoff and playout chips (CF/CG) wired across all 8 leagues.",
      "Sports directory cleanup: AFL, NRL, CFL, NWSL, WSL removed; Women's Football added as coming soon; Club World Cup 2025-26 competition labels corrected.",
      "NBA: Spurs upset Thunder 4-3 in the West; Knicks swept Cleveland 4-0 in the East. Finals matchup is Spurs vs Knicks.",
    ],
  },
  {
    date: "2026-05-30",
    headline: "PSG repeats as UCL champion, Other Tournaments hub, NHL Final set",
    items: [
      "Champions League: PSG named 2026 winner, completing back-to-back after 2025. The hub's All-time champions list, the PSG club page, and Ligue 1's index all pick up the new edition.",
      "New Other Tournaments hub lists Olympic Football, Central European Cup, Pan-American Championship, Nations League Finals, King Hassan II, and European Nations Group, all named per edition.",
      "Intercontinental Tournaments table now names each edition: Mundialito 1981, Artemio Franchi 1985, King Fahd Cups 1992-1995, Confederations Cups 1997-2017, Finalissima 2022.",
      "NHL: Carolina sweeps Montreal in the Eastern Conference Final and meets Vegas in the Stanley Cup Final, Game 1 on June 4. Montreal correctly flips to Eliminated Conference Finals via yesterday's CF-pairing fix.",
    ],
  },
  {
    date: "2026-05-28",
    headline: "NHL Conference Finals elimination fix and football refresh",
    items: [
      "Vegas advances to the Stanley Cup Final and Colorado correctly flips to Eliminated Conference Finals on every NHL franchise page after a sweep in the Western Final.",
      "Patched the playoff-state builder so any Conference Finals loser is marked eliminated as soon as the opposing finalist clinches; previously the loser stayed flagged active until the next round opened.",
      "Refreshed club football data: European tournaments, the five-plus-three league hubs, season tables, and the global club index now reflect the latest workbook state.",
    ],
  },
  {
    date: "2026-05-27",
    headline: "European tournament hubs, comparable programs, and quiz",
    items: [
      "New /teams/football/tournaments: hubs for the Champions League, Europa League, Conference League, Cup Winners' Cup, Fairs Cup, Super Cup, and Club World Cup. Round-by-round 2025-26 bracket on active runs.",
      "Every national-team page now surfaces five Comparable Programs: the closest historical cohort by honors profile and footprint. Croatia clusters with Sweden and Portugal; Hungary with Czechia and Netherlands.",
      "New honors quiz at /teams/national/quiz. Five fingerprints, names and flags stripped, four options. The final screen surfaces the comp set for every team you missed.",
      "All Sports directory wires up Club Football and International Football as live cards; College Football and College Basketball coming soon. The 2026 World Cup widget collapses by default.",
    ],
  },
  {
    date: "2026-05-26",
    headline: "International Football launches; European league expansion and polish",
    items: [
      "International Football v1: sortable ELO/FIFA team table; per-team tournament history and finals; eight tournament hubs; live 2026 World Cup standings and bracket; Czechia and T├╝rkiye display correctly.",
      "Club Football now covers the Eredivisie, Primeira Liga, and Scottish Premiership alongside the existing five top flights; Scotland is wired down to League Two.",
      "Club season tables flag Domestic Cup and European finals inline: filled pill plus star for winners, outlined pill plus open star for runners-up; major cups use country labels, secondary cups read Lg Cup.",
      "Club page polish: standings on phone hide secondary columns; desktop numeric columns space evenly; European competition pills use era-correct abbreviations (EC, UC, ICFC) and sort within a season.",
    ],
  },
  {
    date: "2026-05-25",
    headline: "Football v0 plus polish: maps, filters, badges, deep links",
    items: [
      "Canonical pages for every club that has played top-flight football in England, Spain, Italy, Germany, or France, plus full coverage of the English pyramid through National League.",
      "Each club page renders season-by-season standings, cup finals, and European appearances with star-marked gold/silver Cup Winner badges and team color balls throughout.",
      "Five league hubs (Premier League, La Liga, Serie A, Bundesliga, Ligue 1) carry current standings with Champion / Promoted / Relegated / Eur Qual pills, all-time national champions across every era, and a country map.",
      "Filterable map on /teams/football with country chips, multi-select level, and year slider plus step buttons; deep-linked from /sports, the Sports menu, and every metro page team card.",
    ],
  },
  {
    date: "2026-05-25",
    headline: "Capital-district polygons resolve via name fallback",
    items: [
      "Belgrade and other capital-district metros where Overture lacks an ISO 3166-2 sub-region tag now resolve to polygons automatically, with no manual workbook fills required.",
      "Monaco and Vatican City route through the correct sheet so their quarter and parish rows feed the polygon build instead of being silently filtered.",
      "Cache invalidation now picks up wiring changes on its own: routing maps, sheet maps, REGIONLESS membership, and sheet schemas all feed the version hash so a forgotten --force can no longer mask a rebuild.",
      "Newly resolved to polygons: Pakistan, Vietnam, Ethiopia, Sierra Leone, North Korea, Zimbabwe, Samoa, Fiji, Niger, Congo, C├┤te d'Ivoire, Barbados, Bhutan, plus Cayenne in French Guiana via a sheet-routing fix.",
    ],
  },
  {
    date: "2026-05-24",
    headline: "Eight more countries resolve to polygons, plus pre-push coverage check",
    items: [
      "Albania, Armenia, Aruba, Bolivia, Bosnia-Herzegovina, Cameroon, Cyprus, and Zambia newly resolve to administrative polygons across the home, country, and Expandable Map views.",
      "Boundary build pipeline gains a public-data sanity check that flags newly-keyed countries producing zero polygons pre-push rather than post-deploy.",
      "Home rankings overlay now uses the same combined-boundaries fetch as the Expandable Map, dropping the per-page request burst that was tripping edge protections.",
    ],
  },
  {
    date: "2026-05-24",
    headline: "Mass boundary expansion across dependencies, territories, and small states",
    items: [
      "West Bank and Gaza now render after a cross-border join-key fix; Israeli West Bank settlements union into the Jerusalem metro polygon via the same route.",
      "Dozens of newly resolved jurisdictions: Bermuda, Turks and Caicos, BVI, Gibraltar, Anguilla, Saint Helena, Montserrat, Falklands, Macau, Guam, US Virgin Islands, Jersey, Guernsey, and ├àland.",
      "Mass mid-size country wiring: Madagascar, Mozambique, Mongolia, Kazakhstan, Tanzania, Morocco, Slovakia, Czech Republic, Lithuania, Slovenia, Iceland, and roughly thirty-five more newly resolve to polygons.",
      "Expandable Map: one combined-boundaries fetch instead of thousands, multi-select Regions on home and Expandable Map, tier toggles preserve the map viewport, and a new None button clears all tiers.",
    ],
  },
  {
    date: "2026-05-23",
    headline: "Middle East and Central Asia boundary expansion",
    items: [
      "Eleven countries newly resolve to administrative polygons: Afghanistan, Azerbaijan, Bahrain, Iran, Iraq, Kuwait, Lebanon, Oman, Saudi Arabia, Syria, and the United Arab Emirates.",
      "Palestinian territories render with West Bank and Gaza Strip governorates handled through dedicated Overture extracts; Israeli West Bank settlements render via the same cross-border routing.",
      "UAE metros use city-level polygons where Overture has them and hand-curated polygons for the Dubai-Sharjah-Ajman conurbation and Al Ain, replacing the oversized emirate fallbacks.",
      "Country populations refreshed for roughly thirty countries with 2025 and early-2026 national estimates; per-metro detail pages refresh against the latest workbook edits.",
    ],
  },
  {
    date: "2026-05-22",
    headline: "Sweeping boundary expansion across continents and territories",
    items: [
      "A wider cohort of countries resolves to administrative polygons: Bangladesh, Chile, New Zealand, Nepal, Philippines, Senegal, Serbia, Thailand, Uruguay, and a tail of Caribbean and Pacific states.",
      "Small territories and city-states pick up their first polygons: Hong Kong, Isle of Man, R├⌐union, Martinique, Guadeloupe, Mayotte, Cayman Islands, and most Pacific micronations.",
      "Greece, Indonesia, and Taiwan complete their polygon fills from the prior matcher batch and now render administrative shapes alongside their newly added peers.",
      "Per-metro detail pages refresh against the latest workbook edits to Universities, Top Sports Teams, and stadium data.",
    ],
  },
  {
    date: "2026-05-21",
    headline: "Country boundary expansion, small-jurisdiction polygons, top-teams fixes",
    items: [
      "Argentina, Algeria, Bulgaria, Denmark, Finland, Ghana, Hungary, Moldova, Puerto Rico, and Venezuela now resolve to administrative polygons rather than single coordinate pins on the rankings and metro maps.",
      "Singapore and Puerto Rico now resolve to their full administrative footprints instead of single pins; Singapore population corrected to roughly 6.1M, with the score and ASEAN regional shares recomputed downstream.",
      "Malta and Liechtenstein pick up polygons; ISO 3166-2 region codes wired so the boundary builder resolves every subdivision. Vatican City still pending a matcher tweak for its country-subtype row.",
      "Top Sports Teams: Berlin (Alba Berlin) and Buenos Aires (Boca / River) rationales corrected after a cross-paste sent Real Madrid and Bayern Munich content into the wrong rows; Arsenal stat refreshed on London.",
    ],
  },
  {
    date: "2026-05-20",
    headline: "Badge maps for every badge, deeper map zoom-out",
    items: [
      "Every badge page now ships a filtered map under the hero: tier-colored markers, continent and tier toggles, click-through to /rankings, and bounds refit so filter changes zoom in on the visible set.",
      "Map applies automatically to every live badge in lib/badges.ts BADGES; adding a new badge to the registry gives that badge a map with zero per-badge wiring.",
      "Shared formatContextValue helper moved from the badge page into lib/badges so the map tooltip and the row list format the per-row value (population, market cap, distance, percentage, score) identically.",
      "All maps: zoom moves to bottom-right and attribution to a discreet bottom-left line so neither covers corner markers; minZoom drops from 2 to 1 so readers can pull out to a full planet view.",
    ],
  },
  {
    date: "2026-05-20",
    headline: "Side feed, map fixes: pin, refit, world-wrap",
    items: [
      "New sticky side feed sits next to the rankings at lg+: Discover (Sports first), every live badge in a compact grid, latest essays from the journal, and Random metro plus Methodology CTAs. Wraps below the table on tablet.",
      "Map: primary metro pin and its tooltip move to custom Leaflet panes above the boundary polygon (pin z-index 670, tooltip 690); hover and click work at every zoom and the tooltip floats above the pin itself.",
      "Map: filter changes zoom into the visible set more aggressively (padding tightened from 15% span to 6%); animated 0.5s fit so toggles read as motion rather than a jump cut.",
      "Map: world-wrap on. Continents repeat horizontally and worldCopyJump keeps markers seamless when the user pans across the antimeridian; no more hard edge of the world.",
    ],
  },
  {
    date: "2026-05-20",
    headline: "Home reordered: rankings land in the first viewport",
    items: [
      "Hero tightened to three rendered lines (eyebrow, headline, subhead); the rankings table now sits roughly 160 pixels below the top of the content area on a typical laptop.",
      "Hero search input removed; the RankingsTable's built-in search owns the affordance, and the '/' keystroke shortcut now focuses that input from anywhere on the page.",
      "Discovery strip (Badges, Sports, Top Teams, Latest essay) moves below the rankings table so readers see the data first and the entry points second.",
    ],
  },
  {
    date: "2026-05-20",
    headline: "Vocabulary sweep: metro replaces city across the site",
    items: [
      "Descriptive copy across home, about, methodology, neighborhoods, top-teams, llms.txt, and league pages now refers to metros / metropolitan areas / urban areas; generic 'city' is dropped as the unit of analysis.",
      "Tier names rename City to Metro across Continental, Established, Emerging, and Local; URL slugs unchanged so inbound links and share cards keep working.",
      "Allowed exceptions kept: Primary City as a data field, GaWC World Cities, Oxford Global Cities Index, and other proper-noun citations; literal city names like Mexico City, Kansas City, Quebec City.",
      "Search placeholders updated: Find a metro on the home page, Search team or metro on the sports page. The Team That Wins the City essay title preserved for inbound-link integrity.",
    ],
  },
  {
    date: "2026-05-20",
    headline: "Home redesigned: search hero, discovery strip, filtered map",
    items: [
      "Hero compressed to three lines plus an inline search-with-autocomplete; keyboard '/' focuses the input from anywhere on the page.",
      "Discovery strip between hero and rankings: four cards point at Badges, Sports, Top Teams, and the latest Substack essay so the surfaces buried in the menu now have a home-page entry.",
      "Map moves back inside the rankings table block and tracks whatever filter is active (Top 25 by default, narrows with continent/region/search) instead of showing a fixed top-N slice.",
      "Rankings table columns and behavior are unchanged: Rank, Metro Area, Region, Primary City, State, Population, Score.",
    ],
  },
  {
    date: "2026-05-20",
    headline: "Scope copy, sitemap, team JSON-LD, error pages, country-link fix",
    items: [
      "Scope copy across the site drops hardcoded counts for qualitative language; home stats grid reshaped from brittle counts to positioning tiles (Global / Composite / Curated / Open).",
      "Sitemap adds the per-state route system, four /teams/{league} indexes and historical pages, every franchise page, and /sports; SportsTeam JSON-LD now ships on every franchise page.",
      "Root not-found and error pages added; uncaught exceptions and missing slugs now render a navigable fallback with site nav rather than the default Next bare screen.",
      "Country links from state pages now resolve correctly; the slug builder was producing values like antigua-&-barbuda that did not match countries.json. 123 references repaired.",
    ],
  },
  {
    date: "2026-05-19",
    headline: "Round 2 playoffs, arena fix, data refresh, RU/IE/BE polygons",
    items: [
      "Conference Finals chips now appear on NBA and NHL team pages; brackets reflect the live Round 2 results across both leagues.",
      "NBA stadium-history regains five multi-tenant arenas that previously rendered with blank city, metro, and state on historical franchise pages.",
      "Workbook-driven refresh sweeps season stats, awards, and roster data across every team page in the four leagues; metro chips update in lockstep.",
      "311 new boundary polygons render for Russia (264), Ireland (16), and Belgium (31) across the rankings map, country pages, and metro detail maps.",
    ],
  },
  {
    date: "2026-05-17",
    headline: "Velvet Rock Index launched: the geography of producer-driven music, 1974 to 1989",
    items: [
      "New essay Velvet Rock: The Map Yacht Rock Erased argues yacht rock is the wrong frame; six cities and two islands anchored the producer-driven recording economy of 1974 to 1989.",
      "New Velvet Rock Capital badge flags eight metros (LA, NY, London, Nassau, Brades, Bath, Philadelphia, Stockholm) across primary, satellite, and offshore-island tiers; chips appear on each metro page.",
      "Methodology adds a #velvet-rock section on the four-dimension construction and the September 17, 1989 close, when Hurricane Hugo destroyed AIR Studios Montserrat.",
    ],
  },
  {
    date: "2026-05-16",
    headline: "/sports: Gold Standard, Special Filters, Federation + Level, medal badges",
    items: [
      "Four mutually exclusive Presets (Gold Standard 361 / Major League 929 / Other 7,735 / All 8,664). Power Conferences and International Teams now Special Filters, surfacing only when the relevant Sport is selected.",
      "League chips wear ≡ƒÑç for Gold Standard (sport apex) and ≡ƒÑê for Major League non-Gold; sort gold > silver > other. Same medals now appear on metro page TeamCards next to each team's league.",
      "Federation sub-filter (UEFA / CAF / AFC / CONCACAF / OFC / CONMEBOL) appears when the International Teams Special Filter is on; Level filter uses the workbook column (1/2/3, College, Junior, etc).",
      "Filter chips light up when an upstream filter narrows scope; per-category Clear links. Tooltip shows team / sport ┬╖ league ┬╖ level / location. NBA playoff badges link to Wikipedia; ABA in slate.",
    ],
  },
  {
    date: "2026-05-15",
    headline: "NHL franchises live, Sovereign City Index, /sports overhaul",
    items: [
      "All 32 NHL franchises at /teams/nhl with Stanley Cups from 1910 in gold, WHA Avco Cups in slate, Presidents' Trophy seasons, eight major trophies per franchise, arena history, and live ESPN division standings.",
      "New essay The Sovereign City Index ranks twelve planned cities (NEOM, Nusantara, NAC, and nine more) on the announcement-to-reality gap.",
      "New /sports landing page plots 1,389 teams (Major League plus FBS football and NCAA Division I basketball) on a filterable global map, with conference-colored markers and a Power 4 cap by default.",
      "Live league widgets refresh hourly: NBA East/West playoff ladder, MLB division standings, and NHL division grids; NFL adds 14 international venues including the Bernab├⌐u; ABA and Avco cups in slate.",
    ],
  },
  {
    date: "2026-05-14",
    headline: "NBA franchises launched with live playoff status",
    items: [
      "All 30 NBA franchises live at /teams/nba with championships, Finals, Conference Finals, Season-by-season, arena history, and Wikipedia embeds; 23 defunct franchises at /teams/nba/historical including 8 ABA-only clubs.",
      "ABA championships render in slate (rival league 1968-76, merged into NBA in 1976) and BAA + NBA cups in gold; Pacers surface 3 ABA titles, Nets 2.",
      "Each team page adds an All-NBA Selections block by year and player, career All-Star count in the hero, and award rolls for MVP, DPOY, ROY, COY, MIP, Sixth Man, and Clutch Player.",
      "Index page shows a live 2026 playoff-status chip on every franchise still in the bracket plus a Leaflet team map shared with NFL and MLB.",
    ],
  },
  {
    date: "2026-05-13",
    headline: "MLB franchises launched, Wikipedia/Wikidata + Top Team on every team",
    items: [
      "All 30 MLB franchises live at /teams/mlb with championships, pennants, Season-by-season, top postseason games, stadium history, and MVP/Cy Young rolls; 40 defunct clubs at /teams/mlb/historical.",
      "Both NFL and MLB team pages now fold live ESPN standings into Season-by-season as an in-progress 'as of yesterday' row, gated on real games played; ESPN refreshes daily at 08:00 UTC.",
      "Every team page now shows Wikipedia and Wikidata badges, a Top Team chip when the franchise is that metro's named pick (cross-metro picks like the Packers for Milwaukee included), and a back-to-league link.",
      "Hero says 'Founded: / Metro Area:' separately so it no longer implies the franchise was founded in its current metro; metro pages show MLB chips and links alongside NFL; stadium names deep-link to the metro map.",
    ],
  },
  {
    date: "2026-05-12",
    headline: "NFL team pages with championships, awards, and the Pottsville asterisk",
    items: [
      "Every NFL franchise has its own page at /teams/nfl/[slug] with color-coded championship chips, championship appearances, all-time record, stadium history, and award winners.",
      "Top 12 games per franchise and a top 50 of all-time list at /teams/nfl, ranked by the site's DU Game Score with a decade filter.",
      "Defunct franchises live at /teams/nfl/historical, including the Pottsville Maroons' 1925 stolen championship.",
      "New Sports menu in the top nav; Data and Articles dropdowns now work properly on touch.",
    ],
  },
  {
    date: "2026-05-10",
    headline: "498 new boundaries plus football markers and Tokyo refresh",
    items: [
      "Real polygons now render for Brazil (218), China (172), Switzerland (32), Australia (31), Austria (27), and South Korea (18); 498 new boundaries in total.",
      "Football clubs plot as Major League markers on every metro map, with stadium coordinates backfilled for 499 top-flight clubs.",
      "Tokyo polygon rebuilt with the 23 special wards correctly inside the metro footprint; new refreshment protocol catches this kind of staleness automatically.",
      "New essay Greying Power: When Demographic Decline Buys Stability published on Substack, pairing with the existing badge.",
    ],
  },
  {
    date: "2026-05-09",
    headline: "Frozen Conurbations badge and Substack auto-sync",
    items: [
      "New /badges/frozen-conurbations surfaces five paired cities severed by border, missing bridge, or political division: Lahore-Amritsar, Nicosia-North Nicosia, Kinshasa-Brazzaville, Detroit-Windsor, San Diego-Tijuana.",
      "Chips appear on each affected metro page, linking back to the case set.",
      "Home page Featured Articles strip now auto-syncs with Substack so new posts appear within 24 hours without a manual deploy.",
      "Internal: BACKLOG.md reconciled, news peg watchlist seeded, Greater Bay Area conurbation audit documented.",
    ],
  },
  {
    date: "2026-05-08",
    headline: "Boundary expansion staged for 43 new countries",
    items: [
      "Real polygon boundaries unlocked for 555 metros across 43 new countries, led by India, Romania, Portugal, Turkey, Colombia, and Nigeria.",
      "Builder routing wired in code; polygons render once the next boundary build runs.",
      "New essay Reading the Oxford Economics Index Against Our Own published on Substack, anchoring the new peer-comparison section on /methodology.",
    ],
  },
  {
    date: "2026-05-07",
    headline: "Methodology peer-index comparison plus three archetype badges",
    items: [
      "New peer-comparison section on /methodology positions this index against Oxford Economics GCI, GaWC, Mori GPCI, EIU Liveability, Mercer, and Z/Yen GFCI.",
      "Three new badges launch: Greying Power (21 metros), Cosmopolitan Capital (20), and Emerging Standout (18), inspired by the Oxford Economics city archetypes.",
    ],
  },
  {
    date: "2026-05-05",
    headline: "Country pages, state pages, team markers, six more countries",
    items: [
      "Every country and every state with metros now has its own page, with a tier-colored map of all member metros and a full ranked table.",
      "Metro maps now show team and venue markers (Major League gold, other teams slate, venues magenta) with a sport filter, and Football/Soccer is unified as one label everywhere.",
      "Real administrative boundaries added for Italy (84 metros), Spain (103), Poland (71), Andorra, San Marino, and Vatican City; the polygon map now spans 12 countries.",
      "Country, state, and region names across the site now link to their canonical pages; Warrington merges into Liverpool (UK 179 metros, total 4,283).",
    ],
  },
  {
    date: "2026-05-04",
    headline: "Real boundaries for North America, the UK, France, and Germany",
    items: [
      "Maps now render true administrative polygons for 595 US, 93 Mexican, 83 Canadian, 179 UK, 113 French, and 73 German metros (1,136 total) instead of city-center pins.",
      "Lewes merges into Brighton & Hove and Warrington into Liverpool; remote oceanic outposts are trimmed so Honolulu no longer drags thousand-mile administrative tails.",
      "Boundaries come straight from Overture Maps, so editorial updates flow through with one rebuild.",
      "New essay The 85% Illusion: When Cities Build Skylines Instead of Economies published on Substack, anchored by the Skyline City badge.",
    ],
  },
  {
    date: "2026-05-03",
    headline: "Conurbations get proper editorial names",
    items: [
      "60+ conurbations now display under their civic, geographic, or political names: Bodensee, Lowcountry, SIJORI Triangle, Tuscany, C├┤te d'Azur, Borderplex, M├ñlardalen, Mindong, Greater Golden Horseshoe, plus many more.",
      "Tier B for Conurbations renamed Continental (was World); the metro tier World City likewise becomes Continental Metro to sharpen the editorial vocabulary.",
      "Davos cluster fixed: the 138 km transitive bridge-chain is replaced by Bodensee, a real cross-border Lake Constance conurbation. Davos and St. Moritz now solo.",
      "Leaflet maps embed on matchup pages (two-point derby view), metro detail pages (cluster context or single-point location pin), and the conurbations badge page (click-to-expand per cluster).",
    ],
  },
  {
    date: "2026-05-02",
    headline: "Badges launch: 11 categorical lenses on the dataset",
    items: [
      "New /badges section launches with 11 categorical lenses including University Town (103 metros), Skyline City (82), Megacity, Overperformer, and the seven below.",
      "Conurbations groups metros by 75 km clustering with 5 named megaregions, ~55 editorial overrides with civic names, tiers aligned with the metro scale (Global / World / Major / Regional).",
      "Isolated Capital lists national capitals more than 240 km from any peer in the same composite tier or higher; surfaces deliberate planned capitals and continental-gravity capitals.",
      "Global Gateway, Finance Capital, Culture Capital, Sports Mecca, Rail Hub launch with significance thresholds in place of top-100 caps; Culture Capital adds a regional top-3 fallback.",
    ],
  },
  {
    date: "2026-05-01",
    headline: "Methodology, score tiers, share cards, matchup pages",
    items: [
      "New /methodology page documents every dimension, weight, source, and editorial choice; score tiers (Global Capital through Local Metro) now appear on every metro page.",
      "Per-metro and comparison Open Graph share cards now generate automatically, with Reddit and LinkedIn share buttons on every metro and matchup page.",
      "New /matchups/[a-vs-b] route with 300 pre-rendered head-to-head pages for the top 25 metros, each with a tier verdict and dimension-by-dimension winner grid.",
      "New essay Company Towns of the Mind: The Academic Gravity Wells published on Substack, anchored by the new badge.",
    ],
  },
  {
    date: "2026-04-28",
    headline: "Top Teams reference",
    items: [
      "Launched the Top Teams page: one defining sporting franchise per metro, with co-equal tags for contested calls.",
      "Top Team card now appears on metro profiles alongside Walkable Elite Quarters.",
      "New essay The Team That Wins the City published on Substack, anchored by the Top Teams reference.",
    ],
  },
  {
    date: "2026-04-24",
    headline: "Wikidata linking on Top 25 metros and US major leagues",
    items: [
      "Top 25 metro profiles now carry Wikidata and Wikipedia structured data.",
      "All US major league teams plus Canadian NHL and Toronto MLB/NBA franchises emit SportsTeam schema; 124 teams linked.",
    ],
  },
  {
    date: "2026-04-23",
    headline: "Historic Venues, Annual Events",
    items: [
      "New Historic Venues collapsible on metro profiles (41 sites).",
      "Annual Sporting Events route into their own category.",
    ],
  },
  {
    date: "2026-04-22",
    headline: "All-Star Games category, NCAA bucketing",
    items: [
      "All-Star Games now their own category, separated from championship finals.",
      "NCAA minor-sport teams routed correctly into College and University Teams.",
    ],
  },
  {
    date: "2026-04-21",
    headline: "Walkable Elite Quarters card",
    items: [
      "Walkable Elite Quarters card now appears on profiles for the 103 qualifying metros.",
      "New essay The Last of the Marylebones published on Substack, taxonomy of walkable elite neighborhoods anchoring the card.",
    ],
  },
  {
    date: "2026-04-20",
    headline: "Neighborhoods reference, nav restructure",
    items: [
      "Launched the Neighborhoods page: 103 walkable-elite quarters out of 4,200+ metros.",
      "Articles dropdown added to top nav.",
      "Companion essay The Global Metro Power Rankings Site Is Live published on Substack, announcing the launch.",
    ],
  },
  {
    date: "2026-04-18",
    headline: "Supertall Structures, venue dedupe",
    items: [
      "New Supertall Structures (350m+) section on metro profiles.",
      "Multi-sport venues no longer duplicated in the Notable Venues block.",
      "Annual events split from one-off championships; subgroups collapsed by default.",
    ],
  },
  {
    date: "2026-04-17",
    headline: "Compare tool, AI/LLM discoverability",
    items: [
      "Launched the Compare tool: pick 2-3 metros and see their dimensional ranks side by side.",
      "Top-level navigation with last-updated chip.",
      "Full AI/LLM discoverability shipped (robots.txt, llms.txt, sitemap, JSON-LD).",
      "Composite score licensed CC-BY.",
    ],
  },
  {
    date: "2026-04-15",
    headline: "Breakdown table, continent filter",
    items: [
      "Breakdown table now searchable by state and dimension rank.",
      "Continent filter on rankings; primary city and event aggregations on profiles.",
    ],
  },
  {
    date: "2026-04-14",
    headline: "Bug fixes",
    items: [
      "Team badges, percentage displays, events aggregation, and football team naming corrected.",
    ],
  },
  {
    date: "2026-04-13",
    headline: "Launch",
    items: [
      "Initial release: 4,200+ metros, 16 dimensions, ranked by composite score.",
      "Metro profile pages with company names, sources, market cap, GDP, and dimension breakdowns.",
    ],
  },
  {
    date: "2026-04-12",
    headline: "Series opener Substack published",
    items: [
      "Inaugural essay The Global Metro Power Rankings: Measuring What Makes a City Matter published on Substack, introducing the dimension-based composite framework one day before the site went live.",
    ],
  },
];
