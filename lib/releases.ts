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
    date: "2026-08-27",
    headline: "The champions board learns when a title goes unrecorded",
    items: [
      "Auckland City's fifth straight OFC Champions League title joins the board. The final was played on 22 August, on exactly the date the board was already showing as the next one.",
      "Every current champion now carries a next-title date. Where none has been announced, the board estimates a year on from the last title and marks it as an estimate rather than leaving the column empty.",
      "A date that passes with no new champion now reads as overdue, and a watchdog raises it, so a title that goes unrecorded says so instead of sitting quietly.",
      "The US Open finals and the Rugby League World Cup move to their real dates.",
    ],
  },
  {
    date: "2026-08-25",
    headline: "September belongs to the finals: AFL and NRL brackets go live",
    items: [
      "The AFL and NRL hubs now carry a live finals bracket: every tie from the wildcard round to the Grand Final with venues, dates and scores, and each club's premiership odds alongside until the cup is decided.",
      "Live Standings gains a finals strip for both codes, so results land on the same page as the ladders they settled.",
      "Minor premierships now award themselves the moment the home-and-away season ends, and the Grand Final writes its own history: premiers, honours and the champions ledger update with no hand on the wheel.",
    ],
  },
  {
    date: "2026-08-22",
    headline: "Every forecast we publish, now scored in public",
    items: [
      "The Ledger collects every forecast this site makes and scores it against the price the betting market closed at, nearly twenty-one thousand games that carried a price.",
      "It opens with the unflattering number: across a century of English football and the NFL the market has been closer than our model, and the seasons we did win are named one by one.",
      "A calibration table asks whether seventy per cent has actually meant seventy per cent, across every probability bin the model has ever used.",
      "This season's hubs sit alongside the history, empty for now and saying so, each with the date its first result grades.",
    ],
  },
  {
    date: "2026-08-21",
    headline: "Every English club, measured against what was expected of it",
    items: [
      "English club pages now carry their whole top-flight life against the odds: a bar for every season above or below par since 1888, with the year the club most outran its rating and the year it most fell short.",
      "Leicester's 2015-16 is the largest gap in 127 seasons, and the longest odds ever beaten belong to a Leicester side that went down that year and won at Anfield anyway.",
      "Metro pages now answer for both sports in one place, football and the NFL, each in its own unit because a win has been worth two points and three and never the same as a touchdown.",
      "Against Expectation collects it all, and finds home advantage collapsing in English football and the NFL alike: both peaked a century ago and have fallen ever since.",
    ],
  },
  {
    date: "2026-08-20",
    headline: "A century of expectation, season by season, yours to join",
    items: [
      "Every NFL season since 1920 now has its own page: the game log with what each result was supposed to be, the teams that beat their year, and the results nobody saw coming. The model-vs-market table now runs live.",
      "Your picks land on the same axis: My Season scores your hard calls with the very Brier the 1920 ledger uses, and each NFL metro's page carries its century against expectation.",
      "The company rankings join the Time Machine, with period-correct names on 500 more headline years; the year view adds the biggest company, the year's leaders, and Olympic crowns that no longer outstay their Games.",
      "October is built early: MLB postseason series picks wait ready for the bracket, and every prediction hub is now linked from its sport's own pages.",
    ],
  },
  {
    date: "2026-08-19",
    headline: "College Football called, and every NFL game against expectation",
    items: [
      "College Football joins the prediction hubs and Citizen of Nowhere Picks: playoff, conference and national title odds for every FBS program, with the week's AP Top 25 games called and playable once each poll drops.",
      "A new NFL board keeps the other half of the record: what each game was expected to do before it was played, and the model against the closing market since 1979. Green Bay have beaten expectation more than anywhere.",
      "Domestic T20 champions now carry the name each club held that season, so The Hundred reads Oval Invincibles from 2023 to 2025 and Manchester Super Giants for 2026, whose first title now shows on Manchester's honours.",
      "The baseball playoff board now shows each club's record, run difference and real position, so it is clear the order comes from the model rather than the table.",
    ],
  },
  {
    date: "2026-08-18",
    headline: "Formula 1 teams, where they build, and two valuation houses",
    items: [
      "Formula 1 teams get their own pages, counted as continuous organisations rather than chassis names. Team Lotus's 79 wins sit in one place at last, and Mercedes traces back through Brawn, Honda, BAR and Tyrrell.",
      "Each team now shows where its cars were actually built, town by town and sourced. Ten of the eleven teams racing have a facility in England, and the six English factories fit inside sixty miles.",
      "Every team page now settles the teammate argument, with qualifying and race head-to-head for each pairing. Schumacher out-qualified Barrichello 79 to 25 at Ferrari, and Albon beat Sargeant 33 to 1 at Williams.",
      "The valuations board now carries two houses and shows the higher figure per team, source marked on every row. Formula 1, the WNBA and the NWSL join it, and the Owners board gains a researched owner for each new club.",
    ],
  },
  {
    date: "2026-08-17",
    headline: "The biggest companies, placed where they actually were",
    items: [
      "Every company on the rankings board now shows the metro area it was headquartered in that year, not today. Mobil counts for New York in 1980 and Washington in 1992; Georgia-Pacific leaves Portland for Atlanta.",
      "A second board totals each year by metro. New York held 34 of 1955's hundred largest companies and holds 20 of 2026's, while San Francisco-San Jose rises from two to eleven and second place.",
      "Open any metro row to see the places inside it: Detroit breaks into Highland Park, Auburn Hills, Southfield and Dearborn, each with its own companies, revenue and best rank.",
      "217 companies had their headquarters researched into dated eras, so every one of the 7,176 rows on the board now sits in a metro, and no name is left that we can prove wrong for its year.",
    ],
  },
  {
    date: "2026-08-16",
    headline: "Every year's biggest companies, back to 1955",
    items: [
      "A new board holds the largest American companies of every year since 1955, as the list was published at the time. Bethlehem Steel, Pan Am and Enron are all on it, because in their year they were giants.",
      "Pick a year and read it straight down. 1955 opens with General Motors, Standard Oil of New Jersey and U.S. Steel. 2026 opens with Amazon, Walmart and UnitedHealth.",
      "Companies are not merged across mergers. Exxon and Mobil each end in 1999 and ExxonMobil begins in 2000, because folding them together would erase the forty years Mobil stood on its own.",
      "Names are marked rather than assumed. Our sources stamp each company's present-day name on all of its earlier years, so the board separates a name it can prove wrong from one it simply cannot date.",
    ],
  },
  {
    date: "2026-08-14",
    headline: "One hub for every time machine, and the Heartbreak Index",
    items: [
      "The Time Machine gathers the sixteen boards where you pick a moment and see the world at it. Choose a year and it answers from all of them, marks how fine a slice each board takes, and rotates the champions it shows.",
      "The Heartbreak Index is open: one formula scoring every club we cover on droughts, lost finals, relegation and playoff exile. Toronto's Maple Leafs lead the world, and the IPL joins the board.",
      "The countries board stops using today's names for yesterday's places. A 1900 view now reads Persia, Siam, Ceylon, the Gold Coast and the Dutch East Indies. In 1946 it reads Siam again.",
      "East and West Germany gain thirty-five years of population each, the two Yemens fill their gaps, Vietnam splits into North and South, and the world total now runs to the current year instead of stopping short.",
    ],
  },
  {
    date: "2026-08-13",
    headline: "A century of markets, and baseball's rival leagues pulled apart",
    items: [
      "Every index and commodity now opens its own daily history. The Dow's runs back to 1885: 38,612 closes, including the Saturday sessions the New York exchange traded until 1952.",
      "A comparison view puts any eight of the 39 indices, commodities and currencies on one axis, rebased to a common date, because a chart of the Nikkei beside the FTSE otherwise compares nothing.",
      "Baseball's rival leagues now stand apart: October 1890 carries four championships at once. Brazil's two national titles of 1967 and 1968 separate too, and from November 1903 the World Series stands alone.",
      "The Women's Super League and Liga F tables carry our own club names, Chicago Stars FC is renamed throughout, and the ownership board records the agreed sale of the Lakers.",
    ],
  },
  {
    date: "2026-08-12",
    headline: "Heavyweight boxing, era-correct champions, and NWSL odds",
    items: [
      "Every world heavyweight champion since 1885 is on the board, and because boxing recognises several at once you now see all of them: in June 2015 the unified belts and the WBC, held by different men.",
      "The Time Machine names competitions as they were known at the time, with that era's tier: October 1983 reads European Cup and VFL Premiership. Rival leagues split too, so 1969 shows the Celtics and the ABA apart.",
      "The Next title column works again, so every reigning champion shows the date their crown is next contested.",
      "The NWSL joins the daily playoff and title odds, on Live Standings and the United States hub, and its tables now carry our own club names rather than the data provider's.",
    ],
  },
  {
    date: "2026-08-11",
    headline: "A time machine for champions: any month, any year",
    items: [
      "The Champions board gains a Time Machine. Pick a month and year and see who held every trophy at that moment, across 108 competitions and back to 1860.",
      "Split titles are listed in full rather than collapsed to the latest - Michigan and Nebraska both held the 1997 college football title, each shown with the date it was won.",
      "A month containing a handover shows both holders: in July 1990 Argentina hold the World Cup until the 8th, then Germany.",
      "Competitions retire from the board once they stop being contested, so a month only ever shows the trophies that were genuinely being held in it.",
    ],
  },
  {
    date: "2026-08-11",
    headline: "Playoff races, marked and measured, across seven leagues",
    items: [
      "Every table on Live Standings now shades the teams in playoff position and draws the cut line, updated daily - from the NFL to the AFL's new ten-team wildcard finals and the CFL's crossover rule.",
      "The AFL, NRL, WNBA, CFL, NPB and MLS join MLB with daily simulated odds: chance to make the playoffs and chance to win it all, computed from each club's remaining schedule and shown on Live Standings.",
      "The AFL, NRL, WNBA, CFL and NPB hub standings carry the same odds columns and playoff shading, with each league's real finals format simulated - wildcard rounds, Climax Series advantage and all.",
      "MLB standings now show World Series odds alongside playoff odds, on the hub and on Live Standings.",
    ],
  },
  {
    date: "2026-08-11",
    headline: "Supertall Skyscrapers: the vertical world, measured honestly",
    items: [
      "A new Geography page ranks every building over 350 metres and every standing structure past that height - television masts, chimneys and oil platforms included, filterable by type.",
      "The two boards use different height measures, spelled out on the page: architectural height for buildings, tip-of-the-antenna pinnacle height for structures. Willis Tower is 442 metres by one and 527 by the other.",
      "Skyline density boards show which metros actually built their towers, and when: half of Dubai's skyline has risen since 2010, against a quarter of Hong Kong's.",
      "Every structure links to its metro page, placed by coordinates against our metro boundaries.",
    ],
  },
  {
    date: "2026-08-10",
    headline: "Citizen of Nowhere Picks: call the games, beat the model",
    items: [
      "A new weekly pick'em replaces Beat the Model in the arcade. Call every Premier League and NFL game blind - the model's probabilities reveal only after you commit - then watch the season grade you both by the same rules.",
      "Rank your calls in the confidence pool for bonus points, and take a side on the Upset Radar: the games where our model and the betting market disagree most.",
      "Sign in with Google to join the global leaderboard; the model plays as the house entry, so there is always someone to beat.",
      "Premier League matchweek one locks August 21. The NFL joins September 10; college football, the Champions League and an MLB postseason edition follow.",
    ],
  },
  {
    date: "2026-08-09",
    headline: "Metros with accented names get their real addresses back",
    items: [
      "Metro pages whose names carry accents had web addresses that silently dropped them: Lodz was reachable only as /od, Hue as /hu. All 142 now read properly, and every old link redirects.",
      "The damage clustered in Poland, Romania, Turkey, Czechia and Bosnia, because the rule behind it only ever handled Western European spelling.",
      "Six competition pages are corrected the same way, among them Copa America and Brasileiro Serie A.",
      "Six metros that share a name with another, Kochi and Cordoba among them, were missing their dimension rankings entirely. Those now show correctly.",
    ],
  },
  {
    date: "2026-08-08",
    headline: "The map gets honest: hundreds of metro boundaries corrected",
    items: [
      "An audit of every mapped boundary found metros measured over the wrong ground - a ring around the city, a namesake province far away, a shared county. Hundreds of boundaries are redrawn from better matches.",
      "The Ground Floor follows the fix: air, nitrogen dioxide and water are now averaged over corrected territory, from Bogota and Minsk to Sarajevo, Windhoek and Davao.",
      "Measured land area and population density update on every corrected metro page.",
      "Three new reasoning games join Play & Learn: letter puzzles in Word Machine, number trains in Spot the Pattern and match-day logic in Riddle Stadium - every puzzle machine-checked to a single right answer.",
    ],
  },
  {
    date: "2026-08-07",
    headline: "Every Ground Floor measure now follows the people",
    items: [
      "Air, nitrogen dioxide and water were each read at one point, the metro's centre. All three are now averaged across the whole metro, weighted by where its people actually live.",
      "That point flattered nobody. For most large metros the old centre reading sat in the worst tenth of anything residents breathe, and 1,720 metros have moved more than a hundred places.",
      "Every metro page now carries its measured land area and the population density that follows, taken from its own mapped boundary rather than an administrative figure.",
      "Two badge links from older essays work again, and Sound of the Metros, international rugby, cricket and basketball now refresh the week they are rebuilt.",
    ],
  },
  {
    date: "2026-08-06",
    headline: "The Ground Floor, and Play & Learn grows up",
    items: [
      "A second scoreboard opens. The Ground Floor ranks 4,269 metros not on what they have accumulated but on what they deliver: clean air, breathable streets, water you can count on.",
      "Every metro now carries a gap - its power ranking against its ground ranking. The two are never merged, because the distance between them is the finding.",
      "Play & Learn grows up: four new games past the easy tier, from Boolean logic on world alliances to binary search on a number line, plus an Expert level on the maths core four.",
      "Champions Duel now spans 459 real finals across eight competitions, Be the Ref goes fully visual, and the games hub gains challenge and topic filters.",
    ],
  },
  {
    date: "2026-08-05",
    headline: "Live standings stay up even when the feed goes down",
    items: [
      "The US league boards - MLB, NFL, WNBA, MLS and the college football polls - now fall back to a snapshot refreshed every three hours, so an upstream outage no longer empties whole sections of Live Standings.",
    ],
  },
  {
    date: "2026-08-04",
    headline: "MLB playoff odds, currency history, and country pages rebuilt",
    items: [
      "A new MLB prediction hub joins the NFL and Premier League: World Series, pennant and playoff odds from 20,000 simulations of every game left on the schedule, with the races still open picked out.",
      "Every country page is rebuilt around its map and its metro areas, with a jump-to nav, filterable and sortable tables, percentile context on each figure, and sections that stay short on a phone.",
      "Every major currency card now opens a full history page: the euro from launch, the yen from its 360-to-the-dollar era, each charted daily against the dollar with its highs, lows and the countries that spend it.",
      "Business boards and the music charts now read properly on a phone, the UEFA Nations League and the 2027 Asian Cup join Live Standings, and every shared link renders one consistent card.",
    ],
  },
  {
    date: "2026-08-03",
    headline: "The Owners: who actually holds the market",
    items: [
      "A ninth Business tab reduces every quarterly SEC 13F filing - 8,760 of them, $65 trillion reported - to a manager league table, from BlackRock's $5.7T down.",
      "Asset-manager capitals rank metros by the money their institutions run: New York's $16T vault, then Boston and Vanguard's Philadelphia ahead of Chicago and London.",
      "Who owns the giants shows the top holders of each of the world's biggest companies, and the most-widely-held board counts which stocks nearly every institution owns.",
      "The business leaders board is now complete: all 107 seats resolved, with every CEO, fund chief and central banker verified and current.",
    ],
  },
  {
    date: "2026-08-02",
    headline: "Prediction hubs, and Business of the Metros: a full money hub",
    items: [
      "Prediction hubs go live: the Premier League simulated 20,000 times blending site data with market odds, and the NFL played through its real 272-game schedule to Super Bowl LXI - every pick frozen and graded all season.",
      "Business of the Metros launches at /business: the Money Table ranks metros by headquartered market value, with the race to the first $5 trillion company, weekly movers, and country and region rollups.",
      "Tabs for the top 500 companies (searchable to the full universe), 1,400 unicorns and their IPO graduates, the S&P 500 as a geography, benchmark indices tied to home metros, and every currency linked to its countries.",
      "Business leaders tracked like political ones (CEOs, fund chiefs, central bankers, with a change log), plus crossovers: sporting vs corporate giants, state money with election links, and the owners of Sound and Screen.",
    ],
  },
  {
    date: "2026-08-01",
    headline: "Fourteen new kids games, and college football ready for kickoff",
    items: [
      "Fourteen new games on Play & Learn: Penalty Shootout, Crest Sort, Flag Flash, Champions Duel, a Who Runs the Country? civics trio, and a seven-game Year 3–4 maths arcade built from real crowds, badges and skylines.",
      "The maths games cover the full primary syllabus – place value, times tables, fractions, shapes, time and charts – each with a Year 3 and a Year 4 level. Offside or Onside? is now a fully visual linesman game.",
      "Count & Think games now show real club badges and country flags; Trophy Count counts real league titles. Every game's finish screen gains an All games button, and Capital Match adds a Quick trip mode.",
      "College football is wired for kickoff: FBS conference standings and the AP, Coaches and CFP polls on the hub, with rankings joining Live Standings from 27 August. The 2026 US governors forecast joins the forecast page.",
    ],
  },
  {
    date: "2026-07-29",
    headline: "Club rankings reach back to 2006-07, cup matches included",
    items: [
      "The completed-season hubs now reach back to 2006-07: seven seasons from 2006-07 through 2012-13 join the run, each with country coefficients, round-by-round Europe, every league table and the cup finals.",
      "Every season's power ranking now covers its full top-flight field. Clubs from leagues without match-by-match data are folded in from their final tables, so a season ranks around 700 clubs, not a partial few hundred.",
      "A club's season record now folds in its domestic cup, super cup and intercontinental matches alongside league and Europe, and cup winners earn a trophy bonus, so results reflect the whole campaign.",
      "The era's biggest winners lead their seasons: AC Milan in 2006-07, Manchester United in 2007-08, Barcelona's 2008-09 treble and Bayern Munich's 2012-13 treble.",
    ],
  },
  {
    date: "2026-07-28",
    headline: "Champions starred, and Europe told round by round",
    items: [
      "Every domestic league table across the completed-season hubs now marks its champion with a gold star, from the top five leagues down to the smallest.",
      "Each hub's European and continental competitions are retold round by round, final first, with qualifying, group and knockout stages laid out clearly.",
      "Club names across those tables now appear in their canonical modern form for consistency.",
    ],
  },
  {
    date: "2026-07-27",
    headline: "Completed-season club football hubs, a decade deep, with trends",
    items: [
      "Completed-season club football hubs now span 2016-17 through 2025-26: a club power ranking from form, pedigree and a trophy bonus, filterable by country, with a decade-grouped season index and previous/next links.",
      "Each hub adds the five-year UEFA country coefficients, the European competitions with qualifying, group and knockout results, every final domestic table, and every cup winner including the old Club World Cup.",
      "The Champions League winner tops each season \u2014 City's 2022-23 treble, Real Madrid in 2023-24, PSG in 2024-25 and 2025-26 \u2014 with each club's trophy contribution shown alongside its score.",
      "A new Trends section charts the country coefficient race, club rankings season by season in club colours, and a form-versus-pedigree view, filterable by year range, country and top-N.",
    ],
  },
  {
    date: "2026-07-26",
    headline: "A live women's season hub, cleaner Club Football, and champions fixes",
    items: [
      "The women's club page gains a live 2026-27 hub: standings for Spain's Liga F, the NWSL and England's WSL plus the Women's Champions League, echoed on each country hub and the UWCL page.",
      "Every Club Football page now carries the same section navigation and a back button, and the 2026-27 hub splits UEFA into three coefficient tiers with a collapsed Copa Libertadores.",
      "The home page promotes Club Football under live standings and its in-season board self-updates, now adding the NFL, college football and college basketball, with UEFA competitions shown as live.",
      "Champions now read from a single source: the Tour de France updates to its 2026 winner, and every reigning champion shows the date its crown is next contested.",
    ],
  },
  {
    date: "2026-07-23",
    headline: "The Screen of the Metros: a century of film, by metro",
    items: [
      "A new nine-tab film hub ranks metros, people and films on a century of US box office with Oscar prestige layered on top — era-normalized, director-weighted, and joined throughout by IMDb identity.",
      "Every US number-one film since 1946 — 4,181 chart weeks browsable by decade, with reign leaderboards — alongside year-by-year box office almanacs carrying genres, directors and TMDB ratings.",
      "Every Academy Awards ceremony since 1929, one night at a time — the Big Six with every nominee, winners in gold — plus the 500 greatest films mapped to the metros they are set or filmed in.",
      "Sound and Screen now share a curated Culture menu in the top bar, and film joins the home page as Index 07.",
    ],
  },
  {
    date: "2026-07-22",
    headline: "Thirty-five election hubs, plus honest forecasts for the next elections",
    items: [
      "Twenty-six new election hubs in one day: thirty-five polities, 1,300+ contests — from royal Poland and 964 years of papal conclaves to Denmark's March 2026 snap vote, with a compact tier built for many more.",
      "Unfree and managed votes recorded honestly throughout — Soviet single lists, Saddam's referendums, Singapore's tilted dominance — every entry carrying its label, with Russia, China and the Vatican badged on the card.",
      "The conflicts atlas now spans 1500 to today with civil wars labelled and wartime elections marked, gathered on Elections Under Fire — plus landmark referendums, leader profiles, a world map and sortable tables.",
      "New: election forecasts — seat ranges from thousands of simulations for the 2026 US midterms and the next UK vote, plus Brazil, Israel and New Zealand 2026 and France 2027, refreshed weekly and labelled as speculation.",
    ],
  },
  {
    date: "2026-07-21",
    headline: "Election history hubs: Britain, America, Canada and Europe",
    items: [
      "Four election hubs now chart every UK general election since 1802, every US presidential race since 1788, every Canadian federal election since 1867, and every European Parliament election since the first in 1979.",
      "All 173 contests get their own page and story, now with the full sub-national picture: every UK constituency since 1918, every Canadian province back to 1867, and every EU member state's delegation by group.",
      "Every chart is interactive and every chronology now runs newest first, from turnout arcs on four continents and the two-party grip to the Electoral College amplifier and the erosion of Europe's grand coalition.",
      "New US and UK political leadership pages show who holds power now, including the full Supreme Court bench past and present, with time machines back through history, and country pages link it all.",
    ],
  },
  {
    date: "2026-07-20",
    headline: "World Cup champions, Nowhere 100 movement, leaders tracker, Zone Zero fixes",
    items: [
      "Spain's 2026 World Cup win now runs through the site: it joins Champions, national team pages show the final result instead of a live bracket, and the final enters the all-time Greatest Games top fifteen.",
      "Wimbledon's Jannik Sinner and Linda Noskova and The Open's Ryan Fox join Champions, Andy Burnham replaces Keir Starmer as UK Prime Minister, and a new Leadership changes page logs each switch.",
      "The Nowhere 100 now tracks week-to-week movement: everyone shows how many places they climbed or fell, new entries are flagged, and anyone who dropped off the list is named beneath the table.",
      "The Zone Zero Cup is corrected and now refreshes weekly: Spain's World Cup lifts them to fourth overall, and a fault that had emptied tournament finals across national team pages is repaired.",
    ],
  },
  {
    date: "2026-07-10",
    headline: "Country facts, flags, dual units, and data corrections",
    items: [
      "Every country page gains an At a glance panel with its flag, official languages, currency, government, time zones, national anthem and more, and every section now collapses for easier phone reading.",
      "Distances and elevations across the site now show both metric and imperial, so kilometres and metres always sit beside miles and feet.",
      "Fixed missing economy figures for several countries including Egypt and Slovakia, and MLB standings now show the current season instead of jumping a year ahead.",
      "Amsterdam now absorbs Almere and Lelystad into one metro, the countries list sorts by score by default, and the Power Atlas is correctly dated from 1500.",
    ],
  },
  {
    date: "2026-07-09",
    headline: "Mobile tables, kids games, Origin 2026, and Tour de France in Champions",
    items: [
      "Every ranking and stats table across the site now has a phone-friendly card view, with sticky sort controls and screen-reader support, so data reads and sorts on mobile instead of overflowing sideways.",
      "New South Wales win the 2026 State of Origin series 2-1 at Suncorp Stadium, and Google sign-in on the Following page now stays signed in and syncs your followed metros and teams across every device.",
      "A new Play & Learn section adds curriculum-aligned games for ages 5 to 10: find the oceans and continents, match world capitals, place ancient empires on the map, and more, built from the site's own data.",
      "The Tour de France joins Champions with its full honour roll of winners back to 1903 and the reigning champion, and the Leaders time machine adds India's Shunga and Satavahana dynasties.",
    ],
  },
  {
    date: "2026-07-08",
    headline: "European club competitions join Live Standings, football tidied",
    items: [
      "Champions League, Europa League, and Conference League fixtures now show on their tournament pages and on Live Standings, which lays football out as internationals and European cups beside the domestic leagues.",
      "In-season competitions keep a green live marker even when collapsed, so you can tell at a glance what is currently running.",
      "Golf's majors now list the missing Open venues, with Royal Portrush and Turnberry joined to their metros, and Portugal's leadership history runs back to Afonso I in 1139.",
      "The Leaders time machine now spans antiquity with 42 new historical powers, and the Power Atlas extends to 1500: benchmark-based shares for the age of Ming China, the Mughals, the Ottomans and the Habsburgs.",
    ],
  },
  {
    date: "2026-07-07",
    headline: "Google sign-in now returns you to the right page",
    items: [
      "Signing in with Google now keeps you logged in and returns you to the page you were on, instead of bouncing back with an error.",
    ],
  },
  {
    date: "2026-07-06",
    headline: "Velvet Rock goes trans-Pacific with Tokyo and city pop",
    items: [
      "Velvet Rock is rewritten as a trans-Pacific story: Tokyo joins Los Angeles, New York, and London as a fourth primary capital, and Japanese city pop enters the Master Tape, reshaping the affinity table.",
      "On phones, the radial World Cup knockout bracket now shows the flags for the quarterfinals, semifinals, and final, matching the desktop view instead of collapsing them to dots.",
    ],
  },
  {
    date: "2026-07-05",
    headline: "Sortable #1 singles per metro, plus Power Atlas year steps",
    items: [
      "Every metro's Sound page now lists its chart-topping #1 singles as a sortable table, newest first by default, with click-to-sort by year, single, artist, or chart.",
      "The Power Atlas year selector gains previous and next arrows, so you can step through history one year at a time alongside the slider.",
      "Privacy now sits in the About menu for easy access.",
    ],
  },
  {
    date: "2026-07-04",
    headline: "Homepage polish: clearer intro and roomier layout",
    items: [
      "The homepage masthead now clears the navigation with room to breathe on mobile, each Explore shortcut gains a one-line description with a fuller tooltip, and the live sports and live music links are cleanly separated.",
    ],
  },
  {
    date: "2026-07-03",
    headline: "The Power Atlas: 235 years of world power, ranked",
    items: [
      "The Power Atlas, a new hub at /power-atlas, ranks every country's share of world power year by year from 1789 to today, with latent-versus-recognised lenses and a rising-and-fading divergence view.",
      "Power now runs through the site: the Leaders time machine sorts any year by its share of world power, the Countries directory gains a power column, and every country page charts its latent-versus-recognised arc.",
      "The Leaders directory goes deep: succession back to each state's founding, defunct empires from Rome and the Ottomans to Prussia and the Soviet Union, plus support for BC dates.",
      "Also shipped: cricket and rugby union Greatest Games, a daily Live Charts hub, a new Geography hub at /geography, and a rebuilt directory-forward homepage with the metro rankings now at /rankings.",
    ],
  },
  {
    date: "2026-07-02",
    headline: "The Sound of the Metros: where the hits come from",
    items: [
      "A new Sound of the Metros hub ranks cities by their artists' chart success on the US Billboard and UK top ten since 1958, blended with worldwide album sales and tied to every metro on the map.",
      "It spans three lenses, artist profiles with per-single billing, decade and year filters, scenes, number-one machines, longest reigns, chart disagreements, and the transatlantic divide.",
      "Metro pages gain a signature era, a distinctiveness and per-artist reading, and recent songs mature over two years so streaming-era staying power no longer eclipses a finished career.",
      "Artist rankings now blend Grammy prestige with the BRIT, American Music, MTV Video and Europe, ARIA and Juno awards and Rolling Stone's 500 Greatest Albums, shown in an Awards History hub with per-artist badges.",
    ],
  },
  {
    date: "2026-07-01",
    headline: "World Cup results now go live within the half-hour",
    items: [
      "The power ranking is now The Nowhere 100: a dated, filterable Top 100 across politics, finance, corporate, media, sport, culture, faith and law, each row linked to its metro and jurisdiction, with a gold seal.",
      "The Geography and Sports menus were reorganised: Geography now groups places, power and people, and geopolitics, and Sports opens to the full league directory by sport family plus every cross-sport tool.",
      "World Cup results update from the live feed within about 30 minutes, advancing the bracket automatically; knockout fixtures now show kickoff times in your timezone and sort in match order.",
      "The World Cup section is now tabbed for bracket, title odds and groups; the radial bracket reveals each matchup, kickoff and venue on hover, and title odds now drop every eliminated team.",
    ],
  },
  {
    date: "2026-06-30",
    headline: "Most Powerful People ranking, States directory, US leadership",
    items: [
      "A new Most Powerful People ranking places the world's leaders, central bankers, institution heads, mayors, and billionaires on one Metro Power scale with a published methodology.",
      "A new States directory ranks first-level subdivisions worldwide the way Countries does, dividing each metro's score across the states it spans by their share of its population.",
      "The US page now spans the full federal government \u2014 President and Cabinet, 100 senators with party balance, House leadership, and governors for all 50 states and five territories.",
      "Organisation hubs gained current leaders and histories for NATO, the UN, and the EU; Palestine, Kosovo, and the Vatican's papal line were added; realms now list their PM first.",
    ],
  },
  {
    date: "2026-06-29",
    headline: "World Cup fixes, more leader history, mobile Countries data",
    items: [
      "World Cup group tables are now computed from match results and reorder by the official tiebreakers, and the Round of 32 shows the real fixtures as drawn.",
      "The Live Standings page now follows the World Cup into the knockout rounds once the group stage is complete, rather than holding on the group tables.",
      "Added Romania's leadership history and extended Austria's to the 1526 Habsburg Monarchy; Iran's current Supreme Leader now carries the warning mark.",
      "On phones, the Countries directory now reveals the columns hidden on small screens (Score, Metros, Leader, Continent) when you tap a country.",
    ],
  },
  {
    date: "2026-06-28",
    headline: "Deeper leadership histories, a Since column, and Interstate Wars",
    items: [
      "Leadership history now spans ~100 countries, several traced to their founding dynasties (France to Charlemagne, Russia to Ivan III), with a sortable in-office date for each current leader.",
      "The directory leads with the head of government where the president is ceremonial, with crowns for monarchs and warning marks for leaders tied to atrocities, constitutional subversion, or criminal conviction.",
      "Two new hubs: Interstate Wars since 1945 (wars between states, belligerents linked) and Billionaires (the Forbes real-time list by net worth, country and industry), each also on country pages.",
      "The leaders, interstate-wars and billionaires datasets all refresh automatically from open data (weekly or monthly) and update the site with no deploy.",
    ],
  },
  {
    date: "2026-06-27",
    headline: "WC2026 bracket, country leadership history, and Alliances & Orgs",
    items: [
      "The World Cup section transitions automatically from group tables to a full knockout bracket as results arrive — no manual update or Vercel deploy required.",
      "Every unplayed match card shows a model win probability (Elo + market odds blend), shifting to Elo-dominant weighting once the group stage is complete.",
      "Country pages now show a collapsible leadership history table covering heads of state and government since independence or earliest recorded office.",
      "New Alliances & Orgs hub: maps every country's standing across 18 international organisations from NATO to OPEC, with gold badges for full members.",
    ],
  },
  {
    date: "2026-06-26",
    headline: "All-Time Champions honour rolls, plus an NFL Europe hub",
    items: [
      "Current Champions gains an All-Time toggle: full honour rolls for every competition we track, each champion linked to its team and home metro, plus a Championship History on every metro and country page.",
      "New NFL International hub documents NFL Europe / WLAF (1991-2007) in full: every World Bowl, every franchise ranked by titles, and season-by-season standings, linked from the NFL page.",
      "Every franchise now appears as a defunct team on its host metro pages, from Frankfurt to Sacramento; relocations like Birmingham to Rhein and Edinburgh to Glasgow show under both metros.",
      "The hub also maps the modern NFL International Series, every regular-season game played abroad since 2007, each linked to its host metro and country.",
    ],
  },
  {
    date: "2026-06-25",
    headline: "Live Standings hub, live golf, tennis, cricket, and an NFL Rules Lab",
    items: [
      "New Live Standings page: every league we track on one page, the four majors, MLS, NWSL, WNBA, CFL, NPB, AFL, NRL, F1 and the World Cup, grouped by sport and refreshed in season.",
      "Live golf and tennis majors join it during The Open and the Slams, alongside the ICC World Test Championship table (now also on the cricket hub), live NPB standings, plus an NHL offseason display fix.",
      "New NFL Rules Lab with a Catch Lab, key rules, real calls and a rules timeline, plus a kids Catch or No Catch game, joining the football, cricket and baseball labs.",
      "Club crests and flags expanded sitewide, a new College Baseball hub on the College World Series, ABA titles split out on NBA pages, and a State of Origin table on the NRL hub.",
    ],
  },
  {
    date: "2026-06-24",
    headline: "Club crests sitewide and national-team flags, plus Play & Learn",
    items: [
      "Real club crests now appear wherever a team is listed: club pages, league ladders, hub and all-time tables, the Current Champions board and metro team lists, each with a monogram fallback.",
      "Crest coverage spans the US majors, European and English football, AFL, NRL, CFL, IPL and domestic T20, WNBA, NWSL, EuroLeague, CBA, handball and college sport, plus new F1 constructor logos.",
      "Current Champions now shows a flag for every national-team title, metro team lists group by sport then titles, and women's college programs reuse their school crest.",
      "Also new: a /play hub of kids and adults rules games, plus a Games arcade with Beat the Model, Metro Globle and the daily Metro and Sports grids.",
    ],
  },
  {
    date: "2026-06-23",
    headline: "Rivalries reach women's basketball and football",
    items: [
      "New International Football greatest games: a top-25 board with decade filter on the international hub, a top-10 list on every national team page, and the section leading the cross-sport Greatest Games page.",
      "Women's College Basketball team pages now carry the Rivalries row, with UConn–Tennessee and UConn–South Carolina flagged Top Rivalry alongside Stanford, Notre Dame and the SEC ties.",
      "Women's Football club pages gain rivalries too: the North London Derby, El Clásico, the Manchester, Merseyside and Madrid derbies, and the NWSL's Cascadia rivalry.",
      "Both new sports join the /sports/rivalries board, sortable and filterable alongside the existing thirteen.",
    ],
  },
  {
    date: "2026-06-22",
    headline: "Sports Rivalries across every league",
    items: [
      "New Sports Rivalries hub at /sports/rivalries: a filterable, sortable board of 300+ named rivalries across 13 sports, each linked to its team page and flagged Top Rivalry, two-way or one-way.",
      "Every team page now carries a Rivalries badge row: its biggest rivals, named (Iron Bowl, El Clásico, The Ashes), marked mutual or one-sided and linked to the rival.",
      "Covers the Gold Standard leagues, College Football and basketball, cricket and rugby nations, plus AFL, NRL, CFL, WNBA and the Americas football derbies.",
      "Fixed the World Cup 2026 projected-points column so it never exceeds the maximum a team can still reach from the live group standings.",
    ],
  },
  {
    date: "2026-06-21",
    headline: "Domestic Leagues and F1 hubs, champions tiers, and UI polish",
    items: [
      "New Domestic Leagues Worldwide hub: every club to play a tracked first division across 76 countries (all UEFA associations plus selected leagues elsewhere), with titles, cups and continental pedigree.",
      "New Formula 1 hub: live drivers' and constructors' standings, every World Champion since 1950, all-time wins, per-circuit history, and host-metro links from every Grand Prix card.",
      "The Current Champions board adds a sortable tier column and full award dates, and fixes the Gold Standard badges and regions for MLB, F1, golf, tennis and the Olympics.",
      "Plus richer metro team cards, a home-search reset, a streamlined mobile sports menu with reordered families, and a World Cup head-to-head tiebreaker.",
    ],
  },
  {
    date: "2026-06-20",
    headline: "New golf and tennis hubs, and a broader Zone Zero Cup",
    items: [
      "New golf and tennis hubs: every major champion, the Ryder and Davis Cups, all-time leaders, and men's and women's Grand Slam winners, each linked to the metro that hosted the title.",
      "The Zone Zero Cup now scores golf and tennis, water polo, futsal, table tennis, badminton, lacrosse, and a women's layer with women's basketball built from Olympic medal history.",
      "Sports that loom large in one country now weigh more there: rugby league in Australia, field hockey in India and Pakistan, baseball in Cuba and Taiwan, plus Papua New Guinea and Poland tokens.",
      "The golf and tennis hubs light up live during each major, and the Wales page now shows the England and Wales cricket team.",
    ],
  },
  {
    date: "2026-06-19",
    headline: "The Zone Zero Cup: a national sporting-merit ranking",
    items: [
      "New Zone Zero Cup at /sports/zone-zero-cup ranks every nation's sporting merit across twelve sport pillars, blending decayed achievement with live world rankings, in overall, per-capita and per-GDP views.",
      "Built like a Directors' Cup for nations: each country's best ten sports, recency weighted hard, flagship World Cups boosted, Winter discounted, and suspended nations decayed. Sortable, filterable, methodology published.",
      "Current world rankings added to their hubs: IIHF men's ice hockey, WBSC baseball, and the FIFA Women's World Ranking, with the hockey and baseball rankings also feeding the Zone Zero Cup's live-standing layer.",
      "Adds a twelfth Cup pillar, Women's Football (World Cup, Euros, Finalissima, FIFA ranking), and weights men's continental titles by confederation strength, so a Gold Cup counts below a European Championship.",
    ],
  },
  {
    date: "2026-06-18",
    headline: "Champions board, the Studio, and country economic profiles",
    items: [
      "Current Champions is now one board you can filter by scope, sport and region, sort by any column and reset in a click, ordered by a curated tier, with a column for when each title is next awarded.",
      "New Studio at /studio: a martech reference implementation running the full first-party fan-data lifecycle, from audience building and identity to consent, activation and lift, on the metro dataset, labeled synthetic.",
      "Every country page gains an Economy and development panel: GDP, income tier, HDI, life expectancy, urbanization and more, each with its global rank and a gold mark for top-5% finishes.",
      "The UK page now lists its England, Scotland, Wales and Northern Ireland teams; national-team ELO and the post-Finals NBA top games are refreshed, with new featured clips on the Games hub.",
    ],
  },
  {
    date: "2026-06-17",
    headline: "Current Champions hub, women's college hoops, college hockey",
    items: [
      "New Current Champions hub at /sports/champions: every reigning champion across the Gold Standard and selected leagues, each linked to its team page and league hub.",
      "Gold Standard champion badges now appear on metro and country cards wherever a current title-holder is based.",
      "New Women's College Basketball hub at /teams/cbb-w with team pages, and college hockey now appears on metro cards.",
      "Lokomotiv Yaroslavl added as 2026 KHL Gagarin Cup champion; Olympic edition pages now show per-sport nation medal tables.",
    ],
  },
  {
    date: "2026-06-16",
    headline: "Most similar metros, plus Stanley Cup games return",
    items: [
      "Every metro page now lists its most similar metros by overall profile across the 16 dimensions, with a Stands out for line flagging the dimensions where it most leads the field.",
      "Every Stanley Cup presentation game is back on the Greatest Games hub, alongside the NFL, NBA and MLB top games.",
      "Men's college basketball joins the Greatest Games hub, with its classic tournament games filterable by decade.",
      "Each metro's college teams now sit in one Major League Teams and Venues group for a cleaner profile.",
    ],
  },
  {
    date: "2026-06-15",
    headline: "Hurricanes lift the Cup, college hoops grows",
    items: [
      "The Carolina Hurricanes are 2026 Stanley Cup champions; NHL pages, all-time tables and metro cards reflect the title, and the Sports nav shows a gold Hurricanes banner for the week.",
      "Men's college basketball reaches metro pages: a Major College Teams group merges FBS football and tournament-pedigree Division I programs ranked by national titles, with championships, Final Fours, seasons and win pct.",
      "Every Division I program now carries its real brand colors, and the National Champions table adds the title-game runner-up and the other two Final Four teams for each year.",
      "College Top Team picks are now sport-specific, so a metro's pick highlights only the right sport (Texas football in Austin, not every Longhorns team).",
    ],
  },
  {
    date: "2026-06-14",
    headline: "Knicks crowned 2026 NBA champions",
    items: [
      "The New York Knicks are 2026 NBA champions, their third title and first since 1973; team pages, all-time tables and metro cards now reflect the crown.",
      "The Sports menu and league sidebar show a gold Knicks - NBA Champions tag through June 22, then revert to offseason; the NHL gets the same once the Stanley Cup is awarded.",
      "A-League clubs across Sydney, Melbourne and other Australian and New Zealand metros are promoted to major-team status.",
      "Market capitalization data refreshed across hundreds of metros, updating economic ranks.",
    ],
  },
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
