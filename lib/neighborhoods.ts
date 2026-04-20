// Global Neighborhoods reference data. Source of truth for /neighborhoods.
// Entries mirror the Substack essay "The Last of the Marylebones" and its
// appendix. Rank refers to the parent metro in the Global Metro Power
// Rankings. Rationale prose is authored; neighborhoods are the qualifying
// quarters inside that metro.

export interface NeighborhoodQualifier {
  rank: number;
  metro: string;
  neighborhoods: string[];
  rationale: string;
}

export interface NeighborhoodSkip {
  rank: number;
  metro: string;
  rationale: string;
}

export const QUALIFIERS: NeighborhoodQualifier[] = [
  {
    rank: 1,
    metro: "New York",
    neighborhoods: ["Upper West Side", "West Village"],
    rationale:
      "The Upper West Side is the benchmark: pre-war limestones and brownstones, Broadway and Columbus as double retail spines, Lincoln Center, Central Park, academic gravity from Columbia. A resident walks to coffee, bookstores, bakeries, museums, concerts, all within the neighborhood. The West Village is the downtown analogue: Federal and Greek Revival townhouses, Bleecker and Hudson as retail spines, genuinely elite residential stock. The Upper East Side is elite and historic but its daily retail is thin, residents walk to Midtown or the UWS. The East Village and central Village are vibrant but not elite-residential at this bar.",
  },
  {
    rank: 2,
    metro: "London",
    neighborhoods: ["Marylebone", "Chelsea", "South Kensington"],
    rationale:
      "Marylebone defines the category and calibrates this whole exercise. Chelsea delivers the same formula along the King's Road axis, pre-war density, sustained retail, elite residential. South Kensington pairs museum-cluster density (V&A, Natural History, Science) with a working High Street and residential fabric. Belgravia was dropped under the strict bar: elite, historic, dense, but residentially inert, residents leave the neighborhood to do anything, and a self-sufficient walking life inside its boundaries isn't possible.",
  },
  {
    rank: 3,
    metro: "Paris",
    neighborhoods: ["6e (Saint-Germain)", "7e"],
    rationale:
      "The 6e is the lived-in core: Rue de Rennes, Rue du Cherche-Midi, Rue de Buci as retail spines, bookstores, cafés, galleries, the Sorbonne, Luxembourg Gardens. A daily walking life happens inside boundaries. The 7e delivers runway the 6e can't: the Invalides, Champ de Mars, Tour Eiffel, Berges de Seine corridor is genuinely uninterrupted high-quality walking terrain, valuable specifically for sustaining 15-20 mile days. It's thin on residential retail (Rue Cler is short), so 7e is the runway-and-institutions quarter, 6e is the lived-in quarter. Use them together. The 16e stays dropped, same Belgravia failure mode.",
  },
  {
    rank: 4,
    metro: "Tokyo",
    neighborhoods: ["Azabu-Juban", "Kagurazaka"],
    rationale:
      "Azabu-Juban is a dense shotengai neighborhood with genuine daily retail, bakeries, greengrocers, small restaurants, wrapped around embassy-belt elite residential. Kagurazaka is Tokyo's closest spiritual match to the Left Bank: a hillside quarter with narrow lanes, historic ryōtei, bookstores, French bistros, and Waseda's academic adjacency. Hiroo dropped, genuinely elite but residentially quiet, residents walk to Azabu or Roppongi for daily life.",
  },
  {
    rank: 5,
    metro: "San Francisco-San Jose",
    neighborhoods: ["Nob Hill", "Russian Hill"],
    rationale:
      "Both neighborhoods are pre-1906 rebuild, with Polk Street and Hyde Street as the retail spines that make daily life walkable. Dense, historic, genuinely elite. Pacific Heights is more prestigious on paper but Fillmore Street alone doesn't sustain a Marylebone-style daily life, residents walk down to the Marina or across to Cow Hollow. San Jose skipped entirely: suburban, no comparable fabric.",
  },
  {
    rank: 7,
    metro: "Seoul",
    neighborhoods: ["Hannam-dong"],
    rationale:
      "Hannam-dong is the one. Embassy-belt elite with a genuine retail spine, cafés, restaurants, galleries, self-sufficient and network-embedded with Itaewon. Apgujeong and Cheongdam in Gangnam are vertical-elite but pod-like, master-planned luxury strips, not historic residential fabric, and a day's walk exhausts them. Gangbuk's Bukchon hanok village is historic but thin on daily retail and elite residential density.",
  },
  {
    rank: 9,
    metro: "Shanghai",
    neighborhoods: ["Former French Concession (Xuhui / Huaihai)"],
    rationale:
      "The FFC is the unambiguous answer: tree-lined streets, 1920s-30s shikumen and villas, genuine retail density along Huaihai Road and Wulumuqi Road, cafés, bookstores, galleries. Historic, dense, elite, self-sufficient. Xintiandi was dropped, it's a luxury redevelopment pod, not residential fabric.",
  },
  {
    rank: 11,
    metro: "Washington-Baltimore",
    neighborhoods: ["Georgetown", "Dupont Circle"],
    rationale:
      "Georgetown is Federal-era historic, cobblestones, brick rowhouses, M Street and Wisconsin as retail spines, university adjacency. Dupont Circle is the embassy-adjacent bookstore-and-café belt with Connecticut Avenue as its spine. Both sustain a daily walking life inside their boundaries. Kalorama dropped, elite and historic but pure residential-embassy, residents walk to Dupont or Adams Morgan.",
  },
  {
    rank: 12,
    metro: "Chicago",
    neighborhoods: ["Gold Coast", "Lincoln Park (east of Clark)"],
    rationale:
      "Gold Coast is Chicago's direct Upper West Side analogue: pre-war limestone and brownstone, Astor Street, Rush/Oak/State retail, lakefront adjacency, genuinely elite. East Lincoln Park adds a second self-sufficient node, historic residential stock with Halsted, Armitage, and Clark as retail spines. Streeterville dropped, Michigan Avenue is a retail corridor, not a lived-in neighborhood fabric.",
  },
  {
    rank: 13,
    metro: "Boston",
    neighborhoods: ["Back Bay", "Beacon Hill"],
    rationale:
      "Boston is the closest American city to Marylebone in feel. Back Bay: brownstones, Newbury Street retail, Commonwealth Avenue's linear park, Copley Square. Beacon Hill: Federal-era townhouses, Charles Street as a retail spine, Common and Public Garden adjacency. Both pre-war, dense, historic, elite, self-sufficient, and connected to each other on foot.",
  },
  {
    rank: 14,
    metro: "Osaka-Kyoto-Kobe",
    neighborhoods: ["Kyoto: Gion / Higashiyama / Kawaramachi-Pontocho"],
    rationale:
      "The fit is Kyoto, not Osaka. Machiya townhouses, Shijo and Kawaramachi as retail spines, the Pontocho alley, the Kamogawa riverfront, temples and teahouses within walking distance. Elite Kyoto actually lives here. Osaka lacks an elite historic walkable residential core, its density is commercial, not residential.",
  },
  {
    rank: 15,
    metro: "Sydney",
    neighborhoods: ["Potts Point", "Paddington"],
    rationale:
      "Potts Point is the densest neighborhood in Australia, Macleay Street's retail spine running through Art Deco apartment blocks and terrace houses, walk to Kings Cross and Rushcutters Bay. Paddington is Victorian terrace elite with Oxford Street as its spine. Woollahra is adjacent-elite to Paddington but Queen Street retail is too thin to sustain a self-sufficient day.",
  },
  {
    rank: 16,
    metro: "Toronto",
    neighborhoods: ["Yorkville", "The Annex"],
    rationale:
      "Yorkville is the Mink Mile, elite retail, dense residential, compact enough that Bloor Street sustains daily life. The Annex is Toronto's UWS: Victorian mansions converted to apartments, Bloor West and Harbord as retail spines, University of Toronto adjacency.",
  },
  {
    rank: 17,
    metro: "Moscow",
    neighborhoods: ["Patriarch's Ponds", "Ostozhenka (Golden Mile)"],
    rationale:
      "Patriarch's Ponds is Bulgakov's literary Moscow, pre-revolutionary apartment buildings, Malaya Bronnaya and Spiridonovka as retail spines, cafés and restaurants within the boundaries. Ostozhenka is the Golden Mile, Moscow's densest luxury residential strip, with walkable retail between the cathedral and the embassy belt.",
  },
  {
    rank: 18,
    metro: "Hong Kong",
    neighborhoods: ["Sheung Wan"],
    rationale:
      "Sheung Wan is the self-sufficient answer: historic dried-goods lanes, dense galleries and cafés along Tai Ping Shan and Hollywood Road, tram access, escalator adjacency to Central. Mid-Levels was dropped under the strict bar, it's residential-only and depends on the escalator to Central for daily life, which is a network-embedded pattern that doesn't meet self-sufficiency. Central itself is office-retail, not lived-in residential fabric.",
  },
  {
    rank: 19,
    metro: "Milan",
    neighborhoods: ["Brera", "Quadrilatero della Moda"],
    rationale:
      "Brera is Milan's bohemian-historic dense quarter: cafés, galleries, the Accademia, Pinacoteca, restaurants within boundaries. The Quadrilatero della Moda (Montenapoleone, Spiga, Sant'Andrea) is the fashion-elite dense core with enough ambient retail and dining to sustain a daily life. Magenta dropped, bourgeois residential but residents walk to Brera or the Duomo for daily fabric.",
  },
  {
    rank: 20,
    metro: "Madrid",
    neighborhoods: ["Salamanca", "Chamberí"],
    rationale:
      "Salamanca is Madrid's direct Marylebone analogue, grid layout of late-19th-century bourgeois apartment buildings, Serrano and Velázquez as retail spines, genuinely elite and self-sufficient. Chamberí is the quieter, more lived-in bourgeois twin with its own Calle Ponzano gastronomic corridor.",
  },
  {
    rank: 21,
    metro: "Istanbul",
    neighborhoods: ["Nişantaşı", "Cihangir"],
    rationale:
      "Nişantaşı is Istanbul's historic fashion-and-finance elite quarter, with sustained retail along Abdi İpekçi and Teşvikiye. Cihangir is the intellectual-bohemian hillside, pre-war apartment buildings, cafés, bookstores, Bosphorus views, walkable into Taksim and Galata. Both self-sufficient with genuine daily fabric.",
  },
  {
    rank: 22,
    metro: "Rhine-Ruhr",
    neighborhoods: ["Düsseldorf: Oberkassel / Carlstadt"],
    rationale:
      "Rhine-Ruhr is polycentric; the fit is Düsseldorf. Oberkassel is Gründerzeit elite-bourgeois dense residential with Luegplatz and Nordstraße retail, connected across the Rhine to Carlstadt's Altstadt density. Cologne's Altstadt dropped, too tourist-dominated for lived-in elite residential. The rest of the Ruhr is industrial-suburban.",
  },
  {
    rank: 23,
    metro: "Houston",
    neighborhoods: ["Montrose / Museum District"],
    rationale:
      "Houston's honest answer. Menil Collection, Rothko Chapel, Museum of Fine Arts Houston, Contemporary Arts Museum, a cultural cluster on par with much larger cities. Pre-war bungalows and apartment buildings, Westheimer as the retail spine, walkable between the museums. Heat is a real caveat but the neighborhood fabric is self-sufficient. Initially skipped on a global-prestige filter that wasn't the point.",
  },
  {
    rank: 24,
    metro: "São Paulo",
    neighborhoods: ["Jardins (Jardim Paulista / Jardim América)", "Higienópolis"],
    rationale:
      "Jardins is tree-lined elite density, Oscar Freire as the retail spine, genuine café and restaurant culture, embassy-belt residential. Higienópolis is the intellectual-bourgeois twin, pre-war apartment buildings, bookstores, the Jewish community's historic center, a genuine lived-in Paulista density. Safety is a real caveat for sustained walking, less severe than Rio or Johannesburg but real.",
  },
  {
    rank: 25,
    metro: "Singapore",
    neighborhoods: ["Tanjong Pagar / Duxton (marginal)", "Orchard / River Valley (marginal)"],
    rationale:
      "Singapore passes the strict bar only because its covered-walkway network genuinely substitutes for neighborhood-scale self-sufficiency, a resident can walk Tanjong Pagar to Chinatown to Raffles Place to Bras Basah to Orchard without ever hitting a car-severed edge. That's rare and it's why Singapore isn't in the Dubai/Miami pod category. Tanjong Pagar / Duxton is the stronger residential answer than Orchard, pre-war shophouses (the only substantial pre-1930s urban legacy in the metro), Duxton Hill's café-and-restaurant spine, vertical towers anchored to walkable ground-floor fabric, and direct connection into Chinatown and the CBD on foot. Orchard / River Valley is the secondary pick, vertical elite density, shopping corridor, thinner on historic legacy. Both are marginal at the strict bar and rely on the walkway network to pass.",
  },
  {
    rank: 26,
    metro: "Melbourne",
    neighborhoods: ["East Melbourne", "South Yarra"],
    rationale:
      "East Melbourne is Victorian terrace dense, Fitzroy Gardens-adjacent, genuinely historic-residential. South Yarra has Chapel Street as a retail spine with elite residential density north toward Toorak. Both self-sufficient within the metro.",
  },
  {
    rank: 28,
    metro: "Mexico City",
    neighborhoods: ["Polanco", "Condesa", "Roma Norte"],
    rationale:
      "CDMX has three self-sufficient elite historic walkable neighborhoods, a rarity. Polanco is tree-lined elite density with Masaryk as the retail spine, Chapultepec adjacency. Condesa is Art Deco dense bohemian, Parque México and Amsterdam Avenue's oval as the walking spine. Roma Norte is the Condesa twin with Álvaro Obregón as its spine. Altitude and pollution are real caveats on sustained walking but the fabric is the real thing.",
  },
  {
    rank: 29,
    metro: "Philadelphia",
    neighborhoods: ["Rittenhouse Square", "Society Hill"],
    rationale:
      "Rittenhouse Square is the clearest Marylebone analogue in the American mid-Atlantic, a park surrounded by pre-war apartment buildings, Walnut Street as the retail spine, bookstores, cafés, galleries, genuinely elite. Society Hill is Federal-era historic rowhouses, quieter, walkable to Old City.",
  },
  {
    rank: 30,
    metro: "Seattle",
    neighborhoods: ["Capitol Hill"],
    rationale:
      "Capitol Hill is Seattle's honest answer. Pre-war apartment buildings, Victorian mansions along 14th Avenue's Millionaires' Row, Volunteer Park and its conservatory, Pike-Pine as the retail spine, 15th Avenue and Broadway as the secondary spines. Genuinely lived-in historic dense urban fabric. Initially skipped on a global-prestige filter; it clears the actual bar.",
  },
  {
    rank: 31,
    metro: "Berlin",
    neighborhoods: ["Charlottenburg (Savignyplatz / Kurfürstendamm area)", "Mitte"],
    rationale:
      "Charlottenburg West is historic bourgeois Berlin, Altbau apartment buildings, Kurfürstendamm as the retail spine, Savignyplatz's café culture, the Berlin West intellectual tradition. Mitte is the institutional-historic dense core, Museum Island, Gendarmenmarkt, retail on Friedrichstraße and around Hackescher Markt. Both pass cleanly.",
  },
  {
    rank: 32,
    metro: "Barcelona",
    neighborhoods: ["Eixample Dret"],
    rationale:
      "The Eixample Dret is Ildefons Cerdà's 19th-century grid at its densest and most elite, Passeig de Gràcia as the spine, Modernista architecture (Casa Batlló, La Pedrera), Rambla de Catalunya, sustained retail and café culture. Sarrià-Sant Gervasi was dropped, lower-density elite, marginal at the strict bar.",
  },
  {
    rank: 34,
    metro: "Atlanta",
    neighborhoods: ["Midtown"],
    rationale:
      "Atlanta's honest answer. Piedmont Park, Woodruff Arts Center (High Museum, Alliance Theatre, Atlanta Symphony), Fox Theatre, SCAD, vertical residential towers with pre-war apartment stock along Peachtree. Cultural density is legitimate; walking network between Midtown, Piedmont Park, and Virginia-Highland sustains a genuine day on foot.",
  },
  {
    rank: 36,
    metro: "Mumbai",
    neighborhoods: ["Colaba / Fort / Kala Ghoda"],
    rationale:
      "Mumbai's honest answer. Gothic and Art Deco UNESCO fabric, Colaba Causeway as the retail spine, the Kala Ghoda arts district with its galleries and cafés, the Fort's commercial-residential mix. Elite residential, genuinely historic, walkable in winter months. Monsoon and peak-summer months compromise sustained walking. Malabar Hill is low-density elite; Worli is a vertical pod.",
  },
  {
    rank: 39,
    metro: "Amsterdam",
    neighborhoods: ["Grachtengordel (Canal Ring)", "Oud-Zuid (Museumkwartier)"],
    rationale:
      "The Canal Ring may be the densest historic walkable elite neighborhood per square kilometer on Earth, 17th-century merchant houses along four concentric canals, retail on Keizersgracht and the Nine Streets, galleries and cafés throughout. Oud-Zuid is the residential twin with Vondelpark, the Museumkwartier, and the Concertgebouw within boundaries.",
  },
  {
    rank: 40,
    metro: "Buenos Aires",
    neighborhoods: ["Recoleta"],
    rationale:
      "Recoleta is the direct Paris analogue in the Americas, French Beaux-Arts apartment buildings, Avenida Alvear as the retail spine, Avenida Quintana and Avenida Santa Fe for daily retail, the cemetery, museums, and cafés within boundaries. Palermo Chico dropped, elite embassy enclave but residentially inert, residents walk into Palermo for daily life.",
  },
  {
    rank: 41,
    metro: "Munich",
    neighborhoods: ["Altstadt-Lehel", "Maxvorstadt"],
    rationale:
      "Altstadt-Lehel is the imperial-residential dense core, Maximilianstraße, pre-war apartment buildings, the Englischer Garten adjacency. Maxvorstadt is the museum-and-university dense quarter, three Pinakotheken, LMU, Türkenstraße and Amalienstraße retail. Bogenhausen dropped, quieter and river-severed from the walking core.",
  },
  {
    rank: 42,
    metro: "Brussels",
    neighborhoods: ["Sablon", "Ixelles (Châtelain)"],
    rationale:
      "Sablon is the antiquarian-historic dense heart, Place du Grand Sablon's weekend market, chocolatiers, galleries, restaurants. Châtelain in Ixelles is Art Nouveau bourgeois dense, the Thursday market, Rue du Bailli, sustained café and retail density. Both self-sufficient.",
  },
  {
    rank: 45,
    metro: "Frankfurt",
    neighborhoods: ["Westend-Süd"],
    rationale:
      "Westend-Süd is the one pocket of Frankfurt that meets the bar, Gründerzeit villas and apartment buildings, Bockenheimer Landstraße as the spine, Palmengarten and Grüneburgpark adjacency, Goethe University proximity. Frankfurt broadly is thin for this criterion.",
  },
  {
    rank: 46,
    metro: "Vienna",
    neighborhoods: ["Innere Stadt (1st)", "Josefstadt (8th)"],
    rationale:
      "Innere Stadt is imperial-historic at unmatched density, Kohlmarkt, Graben, and Kärntner Straße as retail spines, every category of daily fabric inside the Ring. Josefstadt is the quieter academic-bourgeois twin, Josefstädter Straße retail, the Theater in der Josefstadt, elite residential. Wieden (4th) dropped under the strict bar, the Naschmarkt is adjacent, not within.",
  },
  {
    rank: 49,
    metro: "Rome",
    neighborhoods: ["Centro Storico"],
    rationale:
      "Centro Storico is the unmatched historic-dense answer, Piazza Navona, Pantheon, Campo de' Fiori, Via del Corso, Piazza del Popolo. Cafés, bookstores, restaurants, museums, and markets within a sustained walking grid. Parioli dropped, elite residential but residents walk down to Centro for daily life.",
  },
  {
    rank: 52,
    metro: "Cairo",
    neighborhoods: ["Zamalek"],
    rationale:
      "Zamalek is the island-elite embassy-heavy self-sufficient answer, 26th July Street as the retail spine, cafés, clubs, galleries, restaurants within boundaries. Belle Époque apartment buildings. Garden City dropped, Belle Époque dense historic but residents walk into Downtown or across to Zamalek for daily life.",
  },
  {
    rank: 53,
    metro: "Montreal",
    neighborhoods: ["Plateau Mont-Royal", "Outremont"],
    rationale:
      "The Plateau is Montreal's densest lived-in historic walkable core, Mont-Royal, Saint-Denis, and Saint-Laurent as triple retail spines, Victorian walk-up apartments, genuine daily fabric. Outremont is the Francophone elite twin, Bernard and Laurier as retail spines, tree-lined mansions, self-sufficient. Golden Square Mile dropped, now office-institutional, not lived-in residential.",
  },
  {
    rank: 55,
    metro: "Vancouver",
    neighborhoods: ["West End"],
    rationale:
      "West End is Canada's densest neighborhood, Davie Street, Denman Street, Robson Street as retail spines, Stanley Park and English Bay adjacency, genuine lived-in urban fabric. Coal Harbour was dropped, vertical waterfront pod with no historic legacy.",
  },
  {
    rank: 57,
    metro: "Denver",
    neighborhoods: ["LoDo (Lower Downtown) + Ballpark / RiNo / Golden Triangle"],
    rationale:
      "Denver's honest answer. LoDo is Denver's largest historic district, Victorian warehouse conversions, Larimer Square (the oldest block in the city), Union Station as a genuine cultural-transit anchor. Sustained walking across LoDo into Ballpark, RiNo, and the Golden Triangle museum cluster (Denver Art Museum, History Colorado, Clyfford Still Museum). Elite by local standard, loft-and-tower residential prestige, not Mayfair-tier but genuinely upper-tier within the metro.",
  },
  {
    rank: 58,
    metro: "Taipei",
    neighborhoods: ["Da'an (Yongkang / Dongmen section)"],
    rationale:
      "The Yongkang-Dongmen section of Da'an is the self-sufficient answer, Yongkang Street's café and restaurant spine, Dongmen Market, bookstores (including the flagship Eslite lineage), NTU and Taida academic gravity, dense mid-rise residential. The Xinyi-adjacent part of Da'an is pod-like and excluded.",
  },
  {
    rank: 59,
    metro: "Stockholm",
    neighborhoods: ["Östermalm", "Vasastan"],
    rationale:
      "Östermalm is the direct Marylebone analogue, bourgeois 19th-century apartment buildings, Östermalmstorg and its hall, Biblioteksgatan as the retail spine, museum adjacency. Vasastan is the quieter twin with Odengatan and Upplandsgatan as retail spines, genuinely lived-in.",
  },
  {
    rank: 61,
    metro: "Lisbon",
    neighborhoods: ["Chiado", "Príncipe Real"],
    rationale:
      "Chiado is the intellectual-historic dense heart, Rua Garrett, Livraria Bertrand (the oldest bookstore in the world), cafés, the Museu do Chiado. Príncipe Real is the elite walkable hillside, Rua da Escola Politécnica retail, the Praça do Príncipe Real's garden, design shops and cafés. The steep terrain is a feature for sustained walking. Lapa dropped, embassy-residential quiet, residents walk up to Príncipe Real.",
  },
  {
    rank: 63,
    metro: "Detroit",
    neighborhoods: ["Midtown (Cultural Center)"],
    rationale:
      "Detroit's honest answer. The Detroit Institute of Arts is a top-five American museum; the DSO, Detroit Historical Museum, and Michigan Science Center cluster around it. Wayne State University provides academic gravity. Pre-war apartment buildings along Cass and Woodward, adjacency to Boston-Edison and Palmer Park historic residential districts. Cultural density is genuinely global-tier; the lived-in urban fabric is recovering.",
  },
  {
    rank: 65,
    metro: "Minneapolis",
    neighborhoods: ["Loring Park / Lowry Hill"],
    rationale:
      "Minneapolis's honest answer. Walker Art Center and Minneapolis Sculpture Garden anchor Loring Park; Lowry Hill has Gilded Age mansions and pre-war apartment buildings, Hennepin Avenue as the retail spine. Lake of the Isles adjacency. Genuinely lived-in pre-war urban fabric, initially prestige-biased into skipping.",
  },
  {
    rank: 74,
    metro: "Rotterdam-The Hague",
    neighborhoods: ["The Hague: Statenkwartier / Archipel"],
    rationale:
      "The Hague's embassy belt, Statenkwartier and Archipel, is Art Nouveau and Jugendstil dense, walkable, with Frederik Hendriklaan as the retail spine. Self-sufficient for a Marylebone-style day. Rotterdam is a post-war modern city and doesn't fit.",
  },
  {
    rank: 75,
    metro: "Copenhagen",
    neighborhoods: ["Indre By", "Frederiksberg", "Østerbro"],
    rationale:
      "Indre By is the historic dense medieval core, Strøget and its offshoots, every category of daily retail. Frederiksberg is the bourgeois-elite municipality within, Frederiksberg Allé, Gammel Kongevej, the Palace and garden. Østerbro is the quieter residential twin with Østerbrogade as the spine. Three self-sufficient neighborhoods is rare.",
  },
  {
    rank: 77,
    metro: "Tel Aviv",
    neighborhoods: ["Rothschild Boulevard / White City"],
    rationale:
      "The White City around Rothschild Boulevard is a UNESCO Bauhaus ensemble, the world's largest collection of International Style buildings in one place. Dense, walkable, elite, self-sufficient, cafés and restaurants along Rothschild and Sheinkin, galleries, culture. Old North dropped, less elite and less dense than the Rothschild core.",
  },
  {
    rank: 80,
    metro: "Athens",
    neighborhoods: ["Kolonaki"],
    rationale:
      "Kolonaki is the direct elite-dense-walkable fit, Skoufa and Tsakalof as retail spines, bookstores, museums, cafés, genuine lived-in bourgeois density. Steep terrain supports sustained walking. Plaka dropped, tourist-dominated.",
  },
  {
    rank: 81,
    metro: "St. Louis",
    neighborhoods: ["Central West End"],
    rationale:
      "St. Louis's honest answer. Gilded Age mansions along Portland Place and Westmoreland Place (genuinely private-streets old-money), pre-war apartment buildings along Lindell and Kingshighway, Euclid Avenue as the retail spine. Forest Park adjacency with the Art Museum, History Museum, Zoo, and Science Center (all free) anchors genuine world-class cultural density. Cathedral Basilica. Old-money St. Louis lives here, prior skip was prestige-biased, not criteria-driven.",
  },
  {
    rank: 82,
    metro: "Zurich",
    neighborhoods: ["Kreis 1 (Altstadt)", "Kreis 8 (Seefeld)"],
    rationale:
      "Kreis 1 is the historic dense medieval core, Bahnhofstraße, the Niederdorf, museums, every category of daily retail. Kreis 8 (Seefeld) is the lakeside elite twin with Seefeldstrasse as the retail spine. Both self-sufficient. Enge dropped, lower-density elite, marginal at the strict bar.",
  },
  {
    rank: 83,
    metro: "Pittsburgh",
    neighborhoods: ["Shadyside"],
    rationale:
      "Pittsburgh's honest answer. Walnut Street and Ellsworth as retail spines, Victorian mansions, genuine old-money Pittsburgh residential fabric, CMU and Pitt academic gravity, Oakland's adjacent cultural cluster (Carnegie Museum of Art, Carnegie Museum of Natural History, Phipps Conservatory, Cathedral of Learning) within walking distance.",
  },
  {
    rank: 86,
    metro: "New Orleans",
    neighborhoods: ["Garden District + Lower Garden District (Magazine St corridor)"],
    rationale:
      "The Garden District and Lower Garden District together form a genuine lived-in historic elite walkable quarter, antebellum and Victorian mansions along the St. Charles Avenue streetcar line, Magazine Street as a six-mile retail and café spine (bookstores, galleries, restaurants, vintage). French Quarter excluded, historic and dense, but tourist-dominated in lived-in residential terms.",
  },
  {
    rank: 87,
    metro: "Warsaw",
    neighborhoods: ["Śródmieście Południowe"],
    rationale:
      "Warsaw's elite interwar-and-reconstructed dense residential core, Plac Zbawiciela, Marszałkowska, pre-war and post-war reconstructed apartment buildings, genuinely lived-in with retail and café density. The architectural legacy is compressed (war destruction plus reconstruction) but real.",
  },
  {
    rank: 88,
    metro: "Portland",
    neighborhoods: ["NW District / Nob Hill (NW 23rd)"],
    rationale:
      "Dense Victorian and Edwardian residential with NW 23rd Avenue as a retail spine, pre-war apartment buildings, Forest Park adjacency. The Pearl District extends the walking network into converted warehouses (Portland's LoDo analogue). Genuinely lived-in upper-tier urban fabric.",
  },
  {
    rank: 89,
    metro: "Dublin",
    neighborhoods: ["Georgian core (Merrion Square / Fitzwilliam / Baggot St)"],
    rationale:
      "The Georgian core is the direct answer, Georgian townhouses around Merrion Square and Fitzwilliam Square, Baggot Street and Merrion Row as retail and pub spines, the National Gallery, Leinster House, and the Shelbourne. Self-sufficient, historic, elite, walkable. Ballsbridge dropped, elite and embassy-heavy but residentially quiet.",
  },
  {
    rank: 90,
    metro: "Hamburg",
    neighborhoods: ["Rotherbaum"],
    rationale:
      "Rotherbaum along the Außenalster, Grindelallee as the retail spine, Hamburg University academic gravity, pre-war bourgeois apartment stock, sustained café culture. Harvestehude dropped, elite and historic but purely residential-bourgeois, residents walk into Rotherbaum or Eppendorf for daily life.",
  },
  {
    rank: 95,
    metro: "Santiago",
    neighborhoods: ["Providencia"],
    rationale:
      "Providencia is the self-sufficient answer, bourgeois historic density, Av. Providencia and Av. Pedro de Valdivia as retail spines, cafés, bookstores, genuine lived-in fabric. El Golf / Las Condes / Vitacura are either vertical pods or low-density elite sprawl.",
  },
  {
    rank: 97,
    metro: "Prague",
    neighborhoods: ["Malá Strana", "Vinohrady"],
    rationale:
      "Malá Strana is the unmatched historic-dense baroque quarter under the Castle, narrow lanes, embassies, cafés, churches, genuine lived-in fabric despite tourist pressure. Vinohrady is the Art Nouveau bourgeois residential twin, Náměstí Míru as the anchor, Vinohradská as the retail spine, bookstores, cafés, parks. Both self-sufficient.",
  },
  {
    rank: 98,
    metro: "Stuttgart",
    neighborhoods: ["Stuttgart-West"],
    rationale:
      "Stuttgart-West is the Gründerzeit Altbau dense walkable answer, Rotebühlplatz and Schwabstraße as retail spines, the university adjacency, elite residential stock. Stuttgart's genuine lived-in neighborhood at peer global standards.",
  },
  {
    rank: 100,
    metro: "Valencia",
    neighborhoods: ["Eixample (Ensanche)"],
    rationale:
      "Valencia's Eixample (Ensanche) is a genuine peer in form to Barcelona's, bourgeois 19th-century grid, Modernista architecture (Mercado de Colón, Finca Roja), Colón and Cirilo Amorós as retail spines. Less globally recognized, which is not the criterion. Self-sufficient, historic, dense, elite-within-metro.",
  },
  {
    rank: 101,
    metro: "Cape Town",
    neighborhoods: ["City Bowl: Gardens / Tamboerskloof"],
    rationale:
      "The Gardens neighborhood around the Company's Garden is the one. Victorian-era terraces and Art Deco apartment buildings on the slopes of Table Mountain, Kloof Street as the retail spine (cafés, restaurants, bookstores), the South African National Gallery and Iziko Museum cluster, Labia Theatre, Mount Nelson Hotel anchor. Self-sufficient lived-in density with steep urban grade. Safety is a real caveat, less severe than Johannesburg but not zero, which constrains the sustained-walking criterion.",
  },
  {
    rank: 105,
    metro: "St. Petersburg",
    neighborhoods: ["Historic Center (Central District / Admiralteysky)"],
    rationale:
      "Unambiguous fit. The Historic Center is a UNESCO ensemble of Imperial-era dense walkable fabric, Nevsky Prospekt as the retail spine, pre-revolutionary apartment buildings along the canals (Fontanka, Moika, Griboyedov), the Hermitage/Russian Museum cluster, cafés and bookstores and everything Marylebone requires. Elite residential stock genuinely survives here. One of the clearest European fits outside the top-100.",
  },
  {
    rank: 106,
    metro: "Padua-Venice",
    neighborhoods: ["Venice: Cannaregio / San Polo / Dorsoduro"],
    rationale:
      "Venice is sui generis but meets every criterion bluntly. Self-sufficient by definition (island-city), historic beyond dispute, dense (no car is physically possible), elite residential stock in Cannaregio (away from San Marco tourist concentration), San Polo, and Dorsoduro. Dorsoduro has the Peggy Guggenheim and Accademia; Cannaregio has the Jewish Ghetto and genuine lived-in fabric; San Polo sits in the middle with Rialto adjacency. Tourist pressure is the caveat but lived-in residential survives in these three sestieri.",
  },
  {
    rank: 109,
    metro: "Budapest",
    neighborhoods: [
      "District V (Belváros-Lipótváros)",
      "District VI (Terézváros)",
      "District VII (Erzsébetváros, Inner)",
    ],
    rationale:
      "Budapest delivers three self-sufficient neighborhoods inside the Pest center. District V is the imperial-historic core, Váci utca retail, the Parliament, the basilica. District VI runs along Andrássy (UNESCO boulevard) with the Opera House, coffeehouses, and pre-war apartment buildings. Inner District VII has the ruin-bar culture layered on historic fabric. Dense, walkable, lived-in, with genuine elite residential stock surviving.",
  },
  {
    rank: 114,
    metro: "Edinburgh",
    neighborhoods: ["New Town", "Old Town", "West End / Stockbridge"],
    rationale:
      "Edinburgh is a UNESCO Old+New Town city. New Town is Georgian planned elite, George Street, Thistle Street, Heriot Row, dense, walkable, self-sufficient. Old Town is medieval historic density along the Royal Mile. Stockbridge is the quieter bourgeois twin with its own retail spine along Raeburn Place. Three self-sufficient neighborhoods, all pre-war, all elite, all dense.",
  },
  {
    rank: 119,
    metro: "Lyon",
    neighborhoods: ["Presqu'île (2e)", "Vieux Lyon (5e)", "Croix-Rousse (1er / 4e)"],
    rationale:
      "Lyon's Presqu'île is the dense historic lived-in core between the Rhône and Saône, Rue de la République, Place Bellecour, the Opera, sustained retail. Vieux Lyon is Renaissance-dense and UNESCO-listed. Croix-Rousse is the silk-workers' hillside with its own lived-in bourgeois fabric. France's clearest second-city Marylebone analogue.",
  },
  {
    rank: 123,
    metro: "Naples",
    neighborhoods: ["Chiaia", "Vomero"],
    rationale:
      "Chiaia is the Belle Époque elite dense residential quarter along the bay, Via dei Mille, Via Filangieri, genuine retail density, Villa Comunale. Vomero sits on the hill above with its own retail spine (Via Luca Giordano, Via Scarlatti) and elite density. Both self-sufficient. The Centro Storico is historic-dense but chaotic and not lived-in-elite in the same sense.",
  },
  {
    rank: 124,
    metro: "Turin",
    neighborhoods: ["Centro (Quadrilatero Romano / Crocetta)"],
    rationale:
      "Turin's Centro is the unambiguous fit, Savoy-era arcades (Via Roma, Via Po), the Quadrilatero Romano's café-and-aperitivo culture, the Egyptian Museum and royal palaces. Crocetta is the elite residential twin along Corso Re Umberto. Genuine lived-in historic dense elite walkable.",
  },
  {
    rank: 128,
    metro: "Geneva",
    neighborhoods: ["Vieille-Ville", "Eaux-Vives / Rive"],
    rationale:
      "Geneva's Vieille-Ville is dense medieval-into-17th-century historic, Grand-Rue, Place du Bourg-de-Four, cafés and galleries. Eaux-Vives and Rive are the 19th-century elite-residential lakeside twins with Rue du Rhône, Rue de la Corraterie, and sustained retail. Genuinely self-sufficient.",
  },
  {
    rank: 129,
    metro: "Oslo",
    neighborhoods: ["Frogner", "Majorstuen"],
    rationale:
      "Frogner is Oslo's elite-bourgeois dense residential, Jugendstil apartment buildings, Bygdøy Allé and Frognerveien as retail spines, Vigeland Park. Majorstuen is the denser retail-forward twin with Bogstadveien. Both self-sufficient.",
  },
  {
    rank: 130,
    metro: "Porto",
    neighborhoods: ["Baixa / Cedofeita / Foz (Foz do Douro)"],
    rationale:
      "Porto's center, Baixa around Rua de Santa Catarina and the Ribeira, is UNESCO dense historic. Cedofeita is the arts-and-retail dense twin inland. Foz do Douro is the elite coastal-residential extension along the river mouth with its own retail spine. A genuine three-neighborhood network.",
  },
  {
    rank: 135,
    metro: "Helsinki",
    neighborhoods: ["Kruununhaka / Kaartinkaupunki", "Eira / Ullanlinna"],
    rationale:
      "Two pairs form the Helsinki answer. Kruununhaka and Kaartinkaupunki are the Empire-era historic dense core with Senate Square and Esplanadi. Eira and Ullanlinna are the Jugendstil elite-residential southern twin with Tehtaankatu and Merikatu, genuine seaside walkability. Self-sufficient.",
  },
  {
    rank: 140,
    metro: "Basel",
    neighborhoods: ["Grossbasel (Altstadt) / St. Alban"],
    rationale:
      "Basel's Altstadt is dense medieval-into-19th-century with Freie Strasse as the retail spine, the Kunstmuseum, the Münster. St. Alban is the elite residential twin with its own historic quarter. Genuinely lived-in Swiss density at the Marylebone bar.",
  },
  {
    rank: 141,
    metro: "Lausanne",
    neighborhoods: ["Centre-ville / Cité", "Ouchy"],
    rationale:
      "Lausanne's Cité and Centre are dense historic walkable with Rue de Bourg and Rue Saint-François as retail spines, the cathedral, steep terrain (walking cardio by default). Ouchy is the lakeside elite-residential twin. Self-sufficient.",
  },
  {
    rank: 142,
    metro: "Glasgow",
    neighborhoods: ["West End (Hillhead / Hyndland)"],
    rationale:
      "Glasgow's West End is genuinely elite-historic-dense-walkable, Victorian sandstone tenements and terraces, Byres Road as the retail spine, University of Glasgow's Gothic campus, Kelvingrove Museum and Art Gallery, Botanic Gardens. Self-sufficient bourgeois density.",
  },
  {
    rank: 145,
    metro: "Antwerp",
    neighborhoods: ["Historic Center / Zurenborg"],
    rationale:
      "Antwerp's Historic Center is dense medieval-into-19th-century walkable with the Grote Markt, Meir as the retail spine, Rubenshuis. Zurenborg is the Art Nouveau elite residential jewel, Cogels-Osylei's Jugendstil mansions on a compact dense grid. Together self-sufficient.",
  },
  {
    rank: 150,
    metro: "Florence",
    neighborhoods: ["Centro Storico / Santo Spirito (Oltrarno)"],
    rationale:
      "Florence's Centro Storico is unambiguously historic-dense-walkable-UNESCO. Santo Spirito across the Arno is the lived-in-residential twin, artisans' workshops, Piazza Santo Spirito's café culture, Boboli adjacency, genuine elite residential stock still surviving. Tourist pressure is the caveat but lived-in residential is real.",
  },
  {
    rank: 152,
    metro: "Nice",
    neighborhoods: ["Carré d'Or / Musiciens", "Vieux Nice"],
    rationale:
      "Nice's Carré d'Or and adjacent Musiciens quarter are Belle Époque elite dense residential, Rue de France, Rue Masséna, the Promenade des Anglais, genuine retail and café culture. Vieux Nice is the old town historic-dense twin. Self-sufficient.",
  },
  {
    rank: 158,
    metro: "Bilbao",
    neighborhoods: ["Abando / Indautxu"],
    rationale:
      "Bilbao's Abando and Indautxu quarters are the Ensanche bourgeois dense grid, Gran Vía as the retail spine, the Guggenheim adjacency, cafés and pintxos culture, Fine Arts Museum. Genuine lived-in elite walkable.",
  },
  {
    rank: 161,
    metro: "Cincinnati",
    neighborhoods: ["Over-the-Rhine + Mount Adams"],
    rationale:
      "Cincinnati's honest answer. Over-the-Rhine is the largest intact historic district in the US, Italianate row houses at genuine density, Findlay Market, Washington Park, Music Hall, Cincinnati Shakespeare, breweries and cafés along Vine and Main. Mount Adams sits on the hill above with Victorian elite residential density, St. Gregory's, restaurants, and the Cincinnati Art Museum in Eden Park adjacent. A genuine historic-dense walkable combination that few American cities can match at this scale.",
  },
  {
    rank: 168,
    metro: "Providence",
    neighborhoods: ["College Hill"],
    rationale:
      "Providence's honest answer. Brown University and RISD anchor College Hill, Thayer Street as the retail spine, Benefit Street's 'Mile of History' (Colonial and Federal-era houses at intact density), RISD Museum, First Baptist. Elite historic dense walkable with genuine academic gravity.",
  },
  {
    rank: 172,
    metro: "Nuremberg",
    neighborhoods: ["Altstadt (Sebald / Lorenz)"],
    rationale:
      "Nuremberg's Altstadt is medieval dense historic walkable, the reconstructed Gothic city, Kaiserburg, Hauptmarkt, museums clustered around the Germanic National Museum. Sebald (north) is more residential; Lorenz (south) more commercial. Together self-sufficient.",
  },
  {
    rank: 176,
    metro: "Bordeaux",
    neighborhoods: ["Centre historique (Saint-Pierre / Triangle d'Or / Chartrons)"],
    rationale:
      "Bordeaux is UNESCO. The Triangle d'Or is the elite 18th-century dense residential core with Cours de l'Intendance and Rue Sainte-Catherine as retail spines. Saint-Pierre is the medieval historic-dense twin. Chartrons is the former wine-merchants' quarter, now bourgeois-bohemian dense with its own retail. Three-neighborhood network.",
  },
  {
    rank: 178,
    metro: "Bologna",
    neighborhoods: ["Centro Storico (within the Viali)"],
    rationale:
      "Bologna's Centro Storico inside the ring roads is unambiguous, the porticoes (UNESCO), the university (Europe's oldest), Piazza Maggiore, genuine retail density along Via dell'Indipendenza and Via Rizzoli, the Quadrilatero's food markets. Elite historic dense walkable with academic gravity.",
  },
  {
    rank: 180,
    metro: "Bucharest",
    neighborhoods: ["Lipscani / Cotroceni / Primăverii"],
    rationale:
      "Bucharest's Lipscani is the historic dense walkable core, 19th-century commercial buildings, cafés and bookstores, museums, Stavropoleos. Cotroceni is the early-20th-century elite residential twin with Belle Époque villas and a genuine retail spine. Primăverii is the embassy-residential quarter (quieter, more network-embedded). Self-sufficient.",
  },
  {
    rank: 184,
    metro: "Lima",
    neighborhoods: ["Miraflores / Barranco"],
    rationale:
      "Lima's honest answer. Miraflores is the elite-dense walkable coastal quarter, Parque Kennedy, Larco as the retail spine, cafés and bookstores, Huaca Pucllana, genuine lived-in fabric. Barranco is the bohemian-historic twin along the cliff with Art Nouveau casonas, galleries, MATE, Parque Municipal. Together self-sufficient.",
  },
  {
    rank: 186,
    metro: "Jerusalem",
    neighborhoods: ["German Colony / Rehavia"],
    rationale:
      "Jerusalem's self-sufficient elite historic walkable answer. The German Colony (Emek Refaim as the retail spine, late-19th-century Templer stone houses) and Rehavia (1930s Bauhaus planned elite-bourgeois density) together form a genuine lived-in network. Academic gravity from Hebrew University's Givat Ram nearby. Political and security caveats are real but lived-in residential density is real.",
  },
  {
    rank: 188,
    metro: "Gothenburg",
    neighborhoods: ["Vasastaden / Linnéstaden"],
    rationale:
      "Gothenburg's Vasastaden is the bourgeois 19th-century dense residential quarter with Vasagatan as the retail spine. Linnéstaden is the denser retail-forward twin with Linnégatan. Together self-sufficient at Scandinavian standards.",
  },
  {
    rank: 194,
    metro: "Bern",
    neighborhoods: ["Altstadt"],
    rationale:
      "Bern's Altstadt is UNESCO medieval dense, the arcaded walking streets (Marktgasse, Kramgasse, Gerechtigkeitsgasse), the Zytglogge, cafés and bookstores under the arcades, Kunstmuseum, Paul Klee. Compact but self-sufficient.",
  },
  {
    rank: 200,
    metro: "Strasbourg",
    neighborhoods: ["Grande Île / Neustadt"],
    rationale:
      "Strasbourg's Grande Île is UNESCO medieval-dense with the cathedral, Petite France, Rue des Grandes Arcades. The Neustadt (Wilhelmian German-era planned extension) is UNESCO too, bourgeois dense with Avenue de la Marseillaise, Place de la République. Together self-sufficient.",
  },
  {
    rank: 213,
    metro: "Charleston",
    neighborhoods: ["South of Broad / Harleston Village / Ansonborough"],
    rationale:
      "Charleston's historic peninsula is unambiguous, antebellum single houses at intact density, Broad Street and King Street as retail spines, Rainbow Row, St. Philip's and St. Michael's, Gibbes Museum, Dock Street Theatre. South of Broad is the most elite-residential; Harleston Village adds lived-in density around the College of Charleston; Ansonborough continues it north. Genuine historic dense walkable elite.",
  },
  {
    rank: 218,
    metro: "Krakow",
    neighborhoods: ["Stare Miasto / Kazimierz"],
    rationale:
      "Krakow's Stare Miasto is UNESCO medieval dense, Rynek Główny (Europe's largest medieval square), Floriańska as the retail spine, the Cloth Hall, Jagiellonian University. Kazimierz is the historic Jewish quarter, now dense-lived-in-bohemian with Plac Nowy and Józefa. Together self-sufficient.",
  },
  {
    rank: 226,
    metro: "Genoa",
    neighborhoods: ["Centro Storico / Albaro"],
    rationale:
      "Genoa's Centro Storico is UNESCO, the caruggi (narrow lanes), the Strade Nuove with their Palazzi dei Rolli (Renaissance palaces now museums and residences), Via Garibaldi, Via XX Settembre as the retail spine. Albaro is the Belle Époque elite residential twin on the eastern hill. Together self-sufficient.",
  },
  {
    rank: 251,
    metro: "San Sebastián",
    neighborhoods: ["Parte Vieja / Centro (Área Romántica)"],
    rationale:
      "San Sebastián delivers a genuine two-neighborhood fit. The Parte Vieja (Old Town) is dense historic walkable with pintxos-bar density unmatched anywhere in Spain, small churches, and the fishing-port grain. The Centro (Área Romántica) is the 19th-century bourgeois grid extension, Avenida de la Libertad, dense Belle Époque apartment buildings, La Concha beach adjacency. Self-sufficient.",
  },
  {
    rank: 252,
    metro: "Verona",
    neighborhoods: ["Centro Storico"],
    rationale:
      "Verona's Centro Storico is UNESCO medieval-into-Renaissance dense, Piazza delle Erbe, Piazza Bra, the Arena, Via Mazzini as the retail spine. Elite residential stock survives along the Adige. Self-sufficient for a Marylebone-style day.",
  },
  {
    rank: 253,
    metro: "Montevideo",
    neighborhoods: ["Pocitos / Punta Carretas / Ciudad Vieja"],
    rationale:
      "Pocitos is the dense elite-residential coastal quarter, Avenida Brasil, tree-lined streets, Art Deco apartment buildings, beach adjacency, self-sufficient retail. Punta Carretas adjacent extends the walking network. Ciudad Vieja is the historic-dense colonial core with genuine lived-in recovery. Together self-sufficient.",
  },
  {
    rank: 265,
    metro: "Dresden",
    neighborhoods: ["Altstadt / Neustadt (Äußere Neustadt)"],
    rationale:
      "Dresden's Altstadt is the Baroque historic core rebuilt after WWII, Frauenkirche, Zwinger, Semper Opera, Brühl's Terrace, institutional-dense. The Äußere Neustadt is the 19th-century Gründerzeit dense-bohemian quarter that survived the war, cafés, bars, lived-in residential. Together self-sufficient.",
  },
  {
    rank: 290,
    metro: "New Haven",
    neighborhoods: ["East Rock / Downtown (Ninth Square / Chapel West)"],
    rationale:
      "New Haven's honest answer. East Rock has Victorian elite-bourgeois residential density with Orange Street and State Street as retail spines, genuine lived-in urban fabric, Yale-adjacent academic gravity. Downtown's Ninth Square and Chapel West add cultural density, the Yale University Art Gallery, Yale Center for British Art, Beinecke, Schubert Theatre. Together self-sufficient.",
  },
  {
    rank: 307,
    metro: "Richmond",
    neighborhoods: ["Fan District + Museum District"],
    rationale:
      "Richmond's honest answer. The Fan District is one of the largest intact Victorian neighborhoods in the US, brick rowhouses at genuine density, Grove Avenue and Main Street as retail spines, VCU academic gravity. The Museum District adjacent houses the Virginia Museum of Fine Arts and the Virginia Historical Society, with Monument Avenue as a boulevard spine. Together self-sufficient.",
  },
  {
    rank: 376,
    metro: "Quebec City",
    neighborhoods: ["Vieux-Québec (Haute-Ville / Basse-Ville)"],
    rationale:
      "Quebec City's Vieux-Québec is UNESCO, North America's only walled city north of Mexico, dense French-colonial-into-19th-century walkable with Rue Saint-Jean and Rue Saint-Louis as retail spines in Haute-Ville, the Quartier Petit Champlain in Basse-Ville. Château Frontenac anchor. Self-sufficient despite tourist pressure.",
  },
  {
    rank: 423,
    metro: "Savannah",
    neighborhoods: ["Historic District (around Forsyth Park / the wards)"],
    rationale:
      "Savannah's Historic District is the Oglethorpe grid, 22 surviving squares surrounded by antebellum and Victorian dense residential, Broughton Street and Bull Street as retail spines, SCAD academic gravity, Telfair and SCAD museums. Forsyth Park anchors the southern edge. Dense historic walkable elite, among America's clearest fits.",
  },
];

export const SKIPS: NeighborhoodSkip[] = [
  {
    rank: 6,
    metro: "Beijing",
    rationale:
      "Beijing has two kinds of neighborhoods and neither fits. The hutong quarters are historic and walkable but low-density and not elite residential stock. The Guomao CBD and Sanlitun are vertical pods, you can't sustain a lived-in daily walking life inside either without leaving. The historic-plus-elite-plus-dense-plus-walkable combination doesn't exist in Beijing's urban fabric.",
  },
  {
    rank: 8,
    metro: "Los Angeles",
    rationale:
      "LA fails walkability, full stop. The city was built around cars after the streetcar era ended, and there is no pre-war dense urban residential fabric at the 12-20 mile/day bar. Silver Lake has a walkable core but it's about 1.5 square miles, a single day exhausts it. Wilshire Corridor is a vertical strip, not a neighborhood. Santa Monica north of Montana is elite but low-density single-family. Every LA option compromises at least one criterion irrecoverably.",
  },
  {
    rank: 10,
    metro: "Guangzhou",
    rationale:
      "Zhujiang New Town is a corporate master-planned pod with no historic legacy and no residential-walkable fabric. The older city lacks an elite dense walkable residential core at this bar. Guangzhou is a real city but not a Marylebone city.",
  },
  {
    rank: 27,
    metro: "Miami",
    rationale:
      "South Beach is walkable but tourist-dominated, not elite residential in the lived-in sense. Brickell is a vertical pod severed by heat and arterials. Coral Gables is elite and has walkable cores but is fundamentally low-density garden-suburb in form. Nothing in Miami sustains a Marylebone-style walking life.",
  },
  {
    rank: 33,
    metro: "Dallas",
    rationale:
      "Uptown is walkable for Dallas but genuinely thin on historic density and residential elite depth at this bar. Highland Park is elite but single-family suburban. Nothing in Dallas sustains a lived-in Marylebone-style day.",
  },
  {
    rank: 35,
    metro: "Dubai-Sharjah",
    rationale:
      "DIFC is a vertical master-planned pod. The rest of the metro is arterial-car-dependent. Historic legacy by the city's own age doesn't exist. The lived-in Marylebone combination is structurally impossible in Dubai's urban form.",
  },
  {
    rank: 37,
    metro: "Bangkok",
    rationale:
      "Langsuan and Sathorn have vertical elite density but heat, sidewalk quality, and arterial severance make sustained 12-20 mile walking days unrealistic. No pre-war dense historic residential fabric survives at this bar.",
  },
  {
    rank: 38,
    metro: "Kuala Lumpur",
    rationale:
      "Bukit Ceylon and KLCC are vertical pods surrounded by arterials. Heat and infrastructure prevent sustained walking. No historic residential elite core.",
  },
  {
    rank: 43,
    metro: "Manila",
    rationale:
      "BGC is a master-planned vertical pod. Salcedo and Legazpi Villages in Makati are small walkable enclaves severed by arterials. Heat and infrastructure prevent sustained walking days.",
  },
  {
    rank: 44,
    metro: "Nanjing",
    rationale:
      "Xinjiekou is a CBD pod. No elite historic residential walkable fabric at this bar.",
  },
  {
    rank: 47,
    metro: "Jakarta",
    rationale:
      "SCBD is a master-planned pod. Menteng has genuine Dutch-era historic residential fabric and elite density but heat, sidewalks, and infrastructure prevent sustained walking at this bar.",
  },
  {
    rank: 48,
    metro: "Chengdu",
    rationale:
      "Taikoo Li is a commercial luxury district, not residential. No elite historic walkable residential core.",
  },
  {
    rank: 50,
    metro: "Delhi",
    rationale:
      "Lutyens' Delhi is elite and historic but low-density, garden-mansion form, not dense urban residential fabric. Air quality prevents sustained walking 4-6 months of the year.",
  },
  {
    rank: 51,
    metro: "Johannesburg",
    rationale:
      "Rosebank and Parkhurst have walkable cores but safety prevents sustained 12-20 mile walking days at this bar. The dealbreaker is not the neighborhoods but the city around them.",
  },
  {
    rank: 54,
    metro: "San Diego",
    rationale:
      "Bankers Hill and Hillcrest are dense-ish but honestly thin on elite historic residential stock at this bar. Downtown is vertical but lacks historic legacy. No genuine lived-in Marylebone analogue.",
  },
  {
    rank: 56,
    metro: "Wuhan",
    rationale: "No elite historic walkable residential core comparable at this bar.",
  },
  {
    rank: 60,
    metro: "Hangzhou",
    rationale:
      "The West Lake area is scenic and historic but lacks elite dense residential walkable fabric at this bar.",
  },
  {
    rank: 62,
    metro: "Las Vegas",
    rationale:
      "The Strip is not residential elite; the rest of the metro is sprawl. No candidate at this bar.",
  },
  {
    rank: 64,
    metro: "Rio de Janeiro",
    rationale:
      "Leblon and Ipanema are dense walkable elite with beach-adjacency and genuine daily retail, but safety prevents sustained 12-20 mile walking days at this bar, the same failure mode as Johannesburg.",
  },
  {
    rank: 66,
    metro: "Riyadh",
    rationale: "Car-dependent metro with no walkable dense elite historic core. Structural.",
  },
  {
    rank: 67,
    metro: "Chongqing",
    rationale:
      "Extreme vertical geography creates visual density but not elite walkable historic residential fabric.",
  },
  {
    rank: 68,
    metro: "Xi'an",
    rationale:
      "Inside the City Wall has exceptional historic density but elite residential depth is thin and the walking radius hits generic Chinese city quickly.",
  },
  {
    rank: 69,
    metro: "Changsha",
    rationale: "No elite historic walkable residential core at this bar.",
  },
  {
    rank: 70,
    metro: "Abu Dhabi",
    rationale: "Arterial-car-dependent. Al Maryah is a vertical pod with no historic legacy.",
  },
  {
    rank: 71,
    metro: "Doha",
    rationale:
      "West Bay is vertical-pod. Msheireb is recently built. No historic walkable fabric.",
  },
  {
    rank: 72,
    metro: "Busan-Ulsan",
    rationale:
      "Haeundae's Marine City is a vertical seaside pod with no historic legacy. No elite historic walkable residential core elsewhere in the metro.",
  },
  {
    rank: 73,
    metro: "Tianjin",
    rationale:
      "The Former Concessions (Wudadao / Five Avenues) are a rare historic Western-architecture walkable pocket, but the walking radius is small, elite residential depth is thin, and daily retail is limited.",
  },
  {
    rank: 76,
    metro: "Manchester",
    rationale:
      "The city centre is dense but not elite-historic-residential in the lived-in sense. Didsbury is genuinely walkable and village-feel-elite but doesn't have dense urban form, it's a walkable suburb, not a Marylebone analogue.",
  },
  {
    rank: 78,
    metro: "Qingdao",
    rationale:
      "Badaguan is a small historic German-era villa district, beautiful but too small a walking radius and too thin on elite residential daily fabric.",
  },
  {
    rank: 79,
    metro: "Phoenix",
    rationale: "Sprawl metro with no walkable dense elite historic residential core.",
  },
  {
    rank: 84,
    metro: "Austin",
    rationale:
      "Hyde Park and Clarksville are walkable but low-density single-family. No genuine dense elite historic walkable core at this bar.",
  },
  {
    rank: 85,
    metro: "Nagoya",
    rationale: "No elite historic walkable residential core at this bar.",
  },
  {
    rank: 91,
    metro: "Brisbane",
    rationale:
      "New Farm and Teneriffe are walkable-dense by Australian standards but don't meet the global elite-historic bar in the way Potts Point or Paddington in Sydney do.",
  },
  {
    rank: 92,
    metro: "Calcutta",
    rationale:
      "Park Street / Chowringhee / Alipore have genuine colonial-era dense historic elite fabric, but sidewalk quality, air quality, heat, and infrastructure prevent sustained 12-20 mile walking days at this bar.",
  },
  {
    rank: 93,
    metro: "Tampa",
    rationale: "No elite historic walkable residential core at this bar.",
  },
  {
    rank: 94,
    metro: "Cleveland",
    rationale:
      "University Circle is a world-class cultural cluster (Cleveland Museum of Art, Cleveland Orchestra at Severance Hall, Cleveland Institute of Music) but is institutional rather than lived-in residential fabric. Shaker Square and Shaker Heights are streetcar-suburb walkable but not dense urban.",
  },
  {
    rank: 96,
    metro: "Charlotte",
    rationale: "No elite historic walkable residential core at this bar.",
  },
  {
    rank: 99,
    metro: "Raleigh-Durham",
    rationale: "No elite historic walkable residential core at this bar.",
  },
];

export const QUALIFIER_COUNT = QUALIFIERS.length;
export const SKIP_COUNT = SKIPS.length;
