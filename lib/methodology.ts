// The sixteen-dimension scoring methodology, shared by the /methodology
// page and the MCP server's get_methodology tool.

export type Dimension = {
  id: string;
  name: string;
  weight: string;
  shape: string;
  rationale: string;
  source: string;
};

export const DIMENSIONS: Dimension[] = [
  {
    id: "population",
    name: "Population",
    weight: "pop / 3,000,000",
    shape: "linear",
    rationale:
      "Sets a baseline floor. A metro with thirty million people gets credit for that scale before any other dimension is counted. The 3M divisor keeps the contribution moderate so population alone never decides the ranking.",
    source: "citypopulation.de for both municipality-level data (the set of countries with full municipality coverage: US, Canada, UK, Germany, France, Spain, Italy, Japan, South Korea, Australia, Brazil, Mexico, China, India, Russia, Turkey, Poland, Netherlands, Belgium, Austria, Switzerland, Sweden, Norway, Denmark, Finland, Czech Republic, Portugal, Ireland, New Zealand, South Africa, Argentina, Colombia, Chile) and county/district-level data used as the secondary lookup for everywhere else. Country-level totals reconciled against Wikipedia's 'List of countries and dependencies by population' (en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population).",
  },
  {
    id: "major-league-teams",
    name: "Major league teams",
    weight: "raw count, capped at 10",
    shape: "capped",
    rationale:
      "Top-tier franchises signal civic identity, broadcast economy, and cultural reach. The cap stops a metro with eight or more major-league teams from sweeping the score on this dimension alone.",
    source: "Official league websites for NFL, NBA, NHL, MLB, and MLS, plus Wikipedia season articles for every other tracked competition: European top-flight football (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga, and equivalents), EuroLeague basketball, AFL, CFL, top-flight rugby union (Premiership, Top 14, URC, Super Rugby Pacific), top-flight rugby league (NRL, Super League), and IPL plus other major T20 cricket leagues.",
  },
  {
    id: "other-teams",
    name: "Other professional teams",
    weight: "(total teams − major league) × 0.25, capped at 10",
    shape: "capped, low weight",
    rationale:
      "Second-tier and minor-league teams count, but at a fraction of the marquee franchises. The 0.25 multiplier and the 40-team pre-cap reflect that.",
    source: "Wikipedia season articles for second-division and minor-league rosters across every sport listed above, plus Wikipedia NCAA program lists by conference (FBS, FCS, basketball).",
  },
  {
    id: "market-cap",
    name: "Market capitalization",
    weight: "USD / 700,000,000,000",
    shape: "linear",
    rationale:
      "Total enterprise value of public and large private companies headquartered in the metro. The $700B divisor is calibrated so a single trillion-dollar company adds roughly 1.4 points to the score, not 14.",
    source: "Three upstream sources by company type. Public companies: companiesmarketcap.com. Private companies: Wikipedia's 'List of largest private non-governmental companies by revenue' and the Forbes Largest Private Companies list (forbes.com). Unicorns: CB Insights' Research Unicorn Companies (cbinsights.com). Refreshed roughly weekly.",
  },
  {
    id: "companies-count",
    name: "Number of major companies",
    weight: "implicit, via market cap accumulation",
    shape: "linear",
    rationale:
      "Every company above the inclusion threshold is in the corpus. Count is not weighted separately because count and total market cap are tightly correlated, and double-counting would bias the result toward US tech-heavy metros.",
    source: "Same three upstream sources as Market capitalization above (companiesmarketcap.com, Wikipedia / Forbes for private companies, CB Insights for unicorns). Count is informational only; the score uses cumulative market cap, not the count, to avoid double-rewarding metros with many small public companies.",
  },
  {
    id: "cultural-events",
    name: "Major cultural events",
    weight: "× 0.65 (combined with museums and infrastructure)",
    shape: "linear",
    rationale:
      "World expos, NATO summits, G7 and G20 hostings, World's Fairs, royal weddings, papal events. One-off cultural moments that put a metro at the center of global attention for a period of days.",
    source: "Manually compiled from Wikipedia lists for World Expos, World's Fairs, NATO summits, G7 and G20 hostings, plus Vatican press records for papal events, royal-wedding press records, the World Marathon Majors organizers, the Cannes Film Festival, Oktoberfest, the Tour de France, the Masters Tournament, the Tennis Grand Slam organizers, and individual festival/biennial organizers. Historical Events sub-category (added 2026-05-01) is sourced manually from Wikipedia and primary historical references.",
  },
  {
    id: "museums-landmarks",
    name: "Museums and landmarks",
    weight: "× 0.65 (combined with cultural events and infrastructure)",
    shape: "linear",
    rationale:
      "Museums, opera houses, concert halls, parks, religious sites, theme parks, world heritage sites, plus iconic bridges, tunnels, dams, and canals. The durable cultural and engineering assets that draw visitors and signal civic priority.",
    source: "museumworldranking.net (Top 426 museums globally), TEA/AECOM Global Experience Index 2024 (theme parks), TripAdvisor plus TEA plus AZA/EAZA accreditation (zoos and aquariums), Wikipedia 'List of contemporary amphitheatres', Wikipedia 'List of concert halls', Wikipedia 'List of opera houses', Wikipedia 'List of the world's largest libraries' (10M+ items), and US National Park Service 2024 visitor data for US national parks. Bridges, tunnels, dams, and canals from Wikipedia (longest bridges, longest tunnels, largest dams, ship canals), ASCE Monuments of the Millennium (asce.org), and ICOLD for major dams. UNESCO World Heritage Sites integration is in progress.",
  },
  {
    id: "infrastructure",
    name: "Ports, exchanges, and other infrastructure",
    weight: "× 0.65 (combined with cultural events and museums)",
    shape: "linear",
    rationale:
      "Container ports, stock exchanges, internet exchanges, military bases, central banks, data center hubs, agricultural and extraction hubs, and trade venues. The plumbing of a globally relevant metro.",
    source: "Container ports: Lloyd's List Top 100, World Shipping Council Top 50, and AJOT Top 100. Passenger ports: CLIA State of the Cruise Industry Report 2025 plus AAA Cruise Forecast 2025. Trade venues: UFI World Map of Exhibition Venues 2025 (80,000 square metre minimum). Stock exchanges: World Federation of Exchanges (WFE) member list (world-exchanges.org) plus Wikipedia commodity-exchange lists. Internet exchanges: DE-CIX (de-cix.net), AMS-IX (ams-ix.net), IX.br, PeeringDB (peeringdb.com), Internet Society Pulse (pulse.internetsociety.org), and the Newby Ventures IXP directory. Data center hubs: Cushman & Wakefield Global Data Center Market Comparison (cushmanwakefield.com) plus Cloudscene (cloudscene.com). Central banks: BIS member directory (bis.org) plus Wikipedia 'List of central banks'. Military bases: DMDC (dmdc.osd.mil), Pentagon Base Structure Report 2024, Congressional Research Service reports, plus Wikipedia country-specific lists. Agriculture and extraction: FAO GIAHS Programme (fao.org/giahs), OriGIn geographic indications (origin-gi.com), CGIAR research centres (cgiar.org), MINING.com, USGS, plus company filings.",
  },
  {
    id: "airport-score",
    name: "Airport score",
    weight: "× 0.25",
    shape: "linear, low weight",
    rationale:
      "Tier-1 mega-hubs (JFK, Heathrow, Hong Kong) score higher than tier-2 international gateways, which score higher than tier-3 regional airports. The weight is low because international connectivity is already partly captured by other dimensions.",
    source: "ACI World Airport Traffic Dataset 2024 (final, released July 2025), supplemented by Wikipedia 'List of busiest airports by passenger traffic' and FAA classifications. Each entry is tier-classified 1 (mega-hub) through 5 (regional) using a composite of passenger volume, freight volume, and international destination count.",
  },
  {
    id: "universities-top50",
    name: "Top-50 universities",
    weight: "× 3.5 per qualifying institution",
    shape: "linear, high weight",
    rationale:
      "A top-50 global university is a generational asset. Boston ranks far higher than its population would predict because of the Harvard and MIT cluster, and the formula reflects that.",
    source: "Center for World University Rankings 2024 (cwur.org), filtered to global rank ≤ 50.",
  },
  {
    id: "universities-top500",
    name: "Other top-500 universities, hospitals, research",
    weight: "× 2.2 per institution (top-500 minus top-50)",
    shape: "linear",
    rationale:
      "Universities ranked 51 to 500, top-250 hospitals, and major research institutions. Hospitals and research institutes carry half the weight of a university because they cluster less around a single peak ranking.",
    source: "Center for World University Rankings 2024 (cwur.org) for ranks 51 to 500, Newsweek World's Best Hospitals 2024 (Top 250), and a manually-curated set of research institutions (47 entries across biomedical research institutes, applied research labs, national laboratories, independent think tanks, and policy research institutes) verified against each institution's own publicly-published profile.",
  },
  {
    id: "metro-stations",
    name: "Metro and subway stations",
    weight: "log(stations)",
    shape: "log-scaled",
    rationale:
      "Log-scaled because adding the 200th station matters much less than adding the 20th. Tokyo at over 1,000 stations should not overwhelm London at 270.",
    source: "Wikipedia 'List of metro systems' (en.wikipedia.org/wiki/List_of_metro_systems). Subway, light rail, and tram lines all counted; per-line station counts preserved.",
  },
  {
    id: "suburb-stations",
    name: "Commuter rail stations",
    weight: "log(stations) × 0.5",
    shape: "log-scaled, low weight",
    rationale:
      "Suburban rail extends a metro's effective catchment. The 0.5 multiplier is half the metro-stations weight because commuter rail is functionally less central to daily urban life than the subway.",
    source: "Wikipedia 'List of suburban and commuter rail systems' (en.wikipedia.org/wiki/List_of_suburban_and_commuter_rail_systems).",
  },
  {
    id: "train-hubs",
    name: "Intercity train hubs",
    weight: "log(hubs) × 2",
    shape: "log-scaled, high weight",
    rationale:
      "Major intercity rail hubs (London King's Cross, Tokyo Station, Gare du Nord) require both a dense national rail network and a metro worth converging on, which is why they sit at high weight.",
    source: "Wikipedia 'List of busiest railway stations' (en.wikipedia.org/wiki/List_of_busiest_railway_stations). Threshold is roughly 30 million or more passengers per year.",
  },
  {
    id: "skyscrapers",
    name: "Skyscrapers and towers",
    weight: "log(150m+ count) × 5.7",
    shape: "log-scaled, high weight",
    rationale:
      "Buildings over 150m are a near-universal indicator of capital concentration and land-value pressure. The high multiplier reflects how hard this metric is to fake. Building tall requires sustained economic and political consensus.",
    source: "Council on Tall Buildings and Urban Habitat (CTBUH) via skyscrapercenter.com. 150m+ buildings only; tier counts (150m+ / 200m+ / 300m+) preserved per metro.",
  },
  {
    id: "luxury-stars",
    name: "Luxury hospitality (Michelin and Forbes Travel Guide)",
    weight: "log(stars) × 3",
    shape: "log-scaled",
    rationale:
      "Michelin 2- and 3-star restaurants plus Forbes Travel Guide 4- and 5-star hotels. A density measure of high-end consumption that tracks discretionary income, tourism, and cultural prestige.",
    source: "Michelin Guide 2025 (442 two- and three-star restaurants across 105 metros) plus Forbes Travel Guide 2026 Star Awards (forbestravelguide.com): 343 Five-Star and 708 Four-Star hotels. Star count weighted 3-star × 3 + 2-star × 2 for restaurants; Five-Star × 3 + Four-Star × 2 for hotels.",
  },
  {
    id: "major-sporting-events",
    name: "Major sporting events",
    weight: "× 0.2, capped at 4",
    shape: "capped, low weight",
    rationale:
      "Olympic and multi-sport hosting plus championship finals. Capped at 4 so a metro that hosted three Olympics last century cannot outrank a finance capital on this dimension alone.",
    source: "Wikipedia season and event articles for Olympic Games, FIFA World Cup, tennis Grand Slams, Formula 1 Grands Prix, and NASCAR Cup Series, plus continental finals (UEFA Champions League, Copa Libertadores, AFC Champions League, CAF Champions League, and equivalents).",
  },
  {
    id: "annual-events",
    name: "Annual recurring events",
    weight: "raw count",
    shape: "linear",
    rationale:
      "F1 Grands Prix, marathons, tennis Grand Slams, the Cannes Film Festival. Each annual draw is one point, with no cap, because a metro hosting five different marquee fixtures should get the cumulative credit.",
    source: "Per-fixture official sources: the Formula 1 official calendar, the Wikipedia NASCAR Cup Series season articles, the World Marathon Majors organizers, the Tennis Grand Slam organizers, the BWF World Tour calendar (badminton), WTT (table tennis), Riot Games (esports), evo.gg (fighting games), the Cannes Film Festival, and the European Broadcasting Union for Eurovision.",
  },
  {
    id: "gdp",
    name: "GDP tier bonus",
    weight: "+3 / +2 / +1 / +0.5 / 0",
    shape: "tiered bonus",
    rationale:
      "Economic mass that the rest of the formula does not directly capture. Above $500B gets +3, $200B to $500B gets +2, $50B to $200B gets +1, $10B to $50B gets +0.5. Tiered rather than linear because US and Japanese metro-GDP estimates run unusually high and a linear bonus would skew the result.",
    source: "Wikipedia 'List of cities by GDP' (en.wikipedia.org/wiki/List_of_cities_by_GDP). Reference years vary 2019-2025 by metro; each figure is in billions USD.",
  },
  {
    id: "gawc-class",
    name: "GaWC class adjustment",
    weight: "12 × (1 / GaWC class)",
    shape: "inverse, capped",
    rationale:
      "The Globalization and World Cities Research Network's tier (1, 2, 3, 4, 5, 6) is a 25-year academic standard for ranking cities by global integration. Class 1 metros get +12, class 2 get +6, and so on. It is the only externally-sourced rank that feeds the composite, and it acts as a check on the dimension-level math.",
    source: "Globalization and World Cities Research Network 2024 World Cities Index (lboro.ac.uk/microsites/geography/gawc). Class 1 = Alpha++ down to Class 12 = Sufficiency. Approximately 280 metros classified.",
  },
];
