import "server-only";
// Badges layer. Each badge is a categorical lens over the existing metros
// dataset — no new data ingestion. Each live badge becomes an indexable
// long-tail destination that reframes the same data through a different
// question. See BACKLOG.md "Badges layer" for the full design spec.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getAllMetros } from "./data";
import type { Metro } from "./shared";
import { formatPop } from "./shared";

// ---------- Editorial overrides ----------

// Metros at or above the Continental Metro tier that are inherently conurbations
// even when the workbook treats them as a single row. Each entry adds a
// cluster row with a hand-curated member-name list (the satellite cities
// that physically comprise the metro). The metro's own composite score
// drives its position; satellites are not double-counted.
const _CONURBATION_OVERRIDES: { slug: string; displayName?: string; satellites: string[] }[] = [
  // Global Capitals (score >= 100)
  { slug: "paris", displayName: "Île-de-France", satellites: ["Paris", "Boulogne-Billancourt", "Saint-Denis", "Argenteuil", "Versailles", "Créteil"] },
  { slug: "tokyo", displayName: "Greater Tokyo", satellites: ["Tokyo", "Yokohama", "Kawasaki", "Saitama", "Chiba"] },
  { slug: "san-francisco-san-jose", displayName: "Bay Area", satellites: ["San Francisco", "San Jose", "Oakland", "Fremont", "Berkeley", "Palo Alto"] },
  { slug: "los-angeles", displayName: "Greater Los Angeles", satellites: ["Los Angeles", "Long Beach", "Anaheim", "Riverside-San Bernardino", "Santa Ana", "Glendale"] },
  { slug: "seoul", displayName: "Sudogwon", satellites: ["Seoul", "Incheon", "Suwon", "Bucheon", "Goyang", "Seongnam"] },
  { slug: "shanghai", displayName: "Yangtze River Delta", satellites: ["Shanghai", "Suzhou", "Wuxi", "Nantong", "Jiaxing"] },
  // Continental Cities (50 <= score < 100) not already on the cluster list
  { slug: "washington-baltimore", displayName: "Capital Region (DMV)", satellites: ["Washington DC", "Baltimore", "Arlington VA", "Alexandria", "Bethesda"] },
  { slug: "chicago", displayName: "Chicagoland", satellites: ["Chicago", "Naperville", "Aurora", "Joliet", "Gary IN"] },
  { slug: "osaka-kyoto-kobe", displayName: "Keihanshin", satellites: ["Osaka", "Kyoto", "Kobe", "Nara", "Sakai"] },
  { slug: "moscow", displayName: "Greater Moscow", satellites: ["Moscow", "Khimki", "Mytishchi", "Balashikha", "Lyubertsy", "Podolsk"] },
  { slug: "madrid", displayName: "Comunidad de Madrid", satellites: ["Madrid", "Móstoles", "Alcalá de Henares", "Getafe", "Leganés", "Fuenlabrada"] },
  { slug: "milan", displayName: "Greater Milan", satellites: ["Milan", "Monza", "Bergamo", "Sesto San Giovanni", "Cinisello Balsamo"] },
  { slug: "houston", displayName: "Greater Houston", satellites: ["Houston", "Sugar Land", "The Woodlands", "Pasadena", "Pearland", "Galveston"] },
  { slug: "istanbul", displayName: "Greater Istanbul", satellites: ["Istanbul", "Beyoğlu", "Kadıköy", "Ümraniye", "Bağcılar"] },
  { slug: "rhine-ruhr", displayName: "Rhine-Ruhr", satellites: ["Cologne", "Düsseldorf", "Essen", "Dortmund", "Duisburg", "Bochum", "Wuppertal", "Gelsenkirchen"] },
  { slug: "miami", displayName: "South Florida", satellites: ["Miami", "Fort Lauderdale", "West Palm Beach", "Hollywood FL", "Pembroke Pines"] },
  { slug: "mexico-city", displayName: "Valle de México", satellites: ["Mexico City", "Naucalpan", "Ecatepec", "Tlalnepantla", "Nezahualcóyotl"] },
  { slug: "philadelphia", displayName: "Delaware Valley", satellites: ["Philadelphia", "Camden NJ", "Wilmington DE", "Chester PA", "Trenton"] },
  { slug: "berlin", displayName: "Berlin-Brandenburg", satellites: ["Berlin", "Potsdam", "Brandenburg an der Havel", "Eberswalde"] },
  { slug: "seattle", displayName: "Puget Sound", satellites: ["Seattle", "Tacoma", "Bellevue", "Everett", "Renton", "Kent"] },
  { slug: "dallas", displayName: "DFW Metroplex", satellites: ["Dallas", "Fort Worth", "Arlington TX", "Plano", "Irving", "Garland", "Frisco"] },
  { slug: "barcelona", displayName: "Greater Barcelona", satellites: ["Barcelona", "Sabadell", "Terrassa", "Mataró", "L'Hospitalet", "Badalona"] },
  { slug: "atlanta", displayName: "Metro Atlanta", satellites: ["Atlanta", "Sandy Springs", "Roswell", "Marietta", "Alpharetta", "Smyrna"] },
  { slug: "dubai-sharjah", displayName: "Northern Emirates", satellites: ["Dubai", "Sharjah", "Ajman", "Umm Al Quwain"] },
  { slug: "mumbai", displayName: "Mumbai Metropolitan Region", satellites: ["Mumbai", "Thane", "Navi Mumbai", "Mira-Bhayandar", "Vasai-Virar", "Kalyan-Dombivli"] },
  { slug: "munich", satellites: ["Munich", "Augsburg", "Ingolstadt", "Rosenheim", "Landshut", "Freising"] },
  // Major Metros (score 20-50) that are inherently conurbations
  { slug: "jakarta", displayName: "Jabodetabek", satellites: ["Jakarta", "Bogor", "Depok", "Tangerang", "Bekasi"] },
  { slug: "frankfurt", displayName: "Rhein-Main", satellites: ["Frankfurt", "Offenbach", "Wiesbaden", "Mainz", "Hanau"] },
  { slug: "johannesburg", displayName: "Gauteng", satellites: ["Johannesburg", "Soweto", "Sandton", "Roodepoort", "Randburg"] },
  { slug: "cairo", displayName: "Greater Cairo", satellites: ["Cairo", "Giza", "6th of October City", "Helwan", "Shubra El Kheima"] },
  { slug: "montreal", displayName: "Greater Montreal", satellites: ["Montreal", "Laval", "Longueuil", "Brossard"] },
  { slug: "denver", displayName: "Front Range", satellites: ["Denver", "Aurora", "Lakewood CO", "Boulder", "Centennial"] },
  { slug: "vancouver", displayName: "Metro Vancouver", satellites: ["Vancouver", "Burnaby", "Surrey", "Richmond BC", "Coquitlam"] },
  { slug: "wuhan", displayName: "Wuhan Tri-City", satellites: ["Hankou", "Hanyang", "Wuchang"] },
  { slug: "las-vegas", displayName: "Las Vegas Valley", satellites: ["Las Vegas", "Henderson", "North Las Vegas", "Paradise", "Spring Valley"] },
  { slug: "lisbon", displayName: "Greater Lisbon", satellites: ["Lisbon", "Cascais", "Sintra", "Loures", "Almada", "Amadora"] },
  { slug: "hangzhou", displayName: "West Lake Region", satellites: ["Hangzhou", "Yuhang", "Xiaoshan", "Lin'an", "Tonglu"] },
  { slug: "minneapolis", displayName: "Twin Cities", satellites: ["Minneapolis", "St. Paul", "Bloomington MN", "Plymouth"] },
  { slug: "doha", displayName: "Greater Doha", satellites: ["Doha", "Al Wakrah", "Al Rayyan", "Al Khor"] },
  { slug: "changsha", displayName: "Chang-Zhu-Tan", satellites: ["Changsha", "Zhuzhou", "Xiangtan"] },
  { slug: "st-louis", displayName: "Gateway Region", satellites: ["St. Louis", "East St. Louis", "Belleville IL", "St. Charles MO"] },
  { slug: "busan-ulsan", satellites: ["Busan", "Ulsan", "Gimhae", "Yangsan"] },
  { slug: "phoenix", displayName: "Valley of the Sun", satellites: ["Phoenix", "Mesa", "Scottsdale", "Tempe", "Chandler", "Gilbert", "Glendale AZ"] },
  { slug: "athens", displayName: "Attica", satellites: ["Athens", "Piraeus", "Acharnes", "Peristeri", "Kallithea"] },
  { slug: "dublin", displayName: "Greater Dublin Area", satellites: ["Dublin", "Tallaght", "Swords", "Dún Laoghaire", "Blanchardstown"] },
  { slug: "nagoya", displayName: "Chukyo", satellites: ["Nagoya", "Toyota", "Toyohashi", "Okazaki", "Kasugai"] },
  { slug: "portland", displayName: "Portland Metro", satellites: ["Portland", "Vancouver WA", "Beaverton", "Gresham", "Hillsboro"] },
  { slug: "hamburg", satellites: ["Hamburg", "Lübeck", "Norderstedt", "Pinneberg"] },
  { slug: "calcutta", displayName: "Kolkata Metro", satellites: ["Kolkata", "Howrah", "Bidhannagar", "Hooghly", "Barrackpore"] },
  { slug: "cleveland", displayName: "Northeast Ohio", satellites: ["Cleveland", "Akron", "Lorain", "Lakewood OH", "Parma"] },
  { slug: "raleigh-durham", displayName: "Research Triangle", satellites: ["Raleigh", "Durham", "Cary", "Chapel Hill"] },
  { slug: "tehran", displayName: "Greater Tehran", satellites: ["Tehran", "Karaj", "Eslamshahr", "Rey", "Varamin"] },
  { slug: "stuttgart", displayName: "Stuttgart Region", satellites: ["Stuttgart", "Esslingen", "Ludwigsburg", "Sindelfingen", "Tübingen"] },
  { slug: "salt-lake-city-provo", displayName: "Wasatch Front", satellites: ["Salt Lake City", "Provo", "Ogden", "West Valley"] },
  { slug: "padua-venice", displayName: "Veneto Triangle", satellites: ["Venice", "Padua", "Mestre", "Treviso"] },
  { slug: "kansas-city", displayName: "Greater Kansas City", satellites: ["Kansas City MO", "Kansas City KS", "Overland Park", "Olathe", "Independence"] },
  { slug: "shenyang", displayName: "Mid-Liaoning", satellites: ["Shenyang", "Anshan", "Fushun", "Benxi", "Liaoyang"] },
  { slug: "liverpool", displayName: "Merseyside", satellites: ["Liverpool", "Birkenhead", "Wallasey", "St Helens", "Bootle"] },
  { slug: "sheffield", displayName: "South Yorkshire", satellites: ["Sheffield", "Rotherham", "Barnsley", "Doncaster"] },
  { slug: "cincinnati", displayName: "Cincinnati-Northern Kentucky", satellites: ["Cincinnati", "Covington KY", "Newport KY", "Florence KY"] },
  { slug: "helsinki", satellites: ["Helsinki", "Espoo", "Vantaa", "Kauniainen"] },
  { slug: "lima", displayName: "Lima-Callao", satellites: ["Lima", "Callao", "San Juan de Lurigancho", "Comas"] },
  { slug: "hannover-brunswick", satellites: ["Hannover", "Braunschweig", "Salzgitter", "Wolfsburg"] },
];

// Named megaregions: hand-curated multi-metro clusters that the auto algorithm
// either fragments (Randstad split into Amsterdam-east-NL and Rotterdam-Leiden)
// or buries inside oversized regional belts (Brussels-Antwerp lost in an
// 11-metro Flemish-Walloon-Northern-French cluster). Each entry claims its
// listed memberSlugs; any auto cluster touching a claimed slug is dropped so
// each metro lives in exactly one cluster. The displayName drives the lead
// row's identity. extraSatellites adds non-dataset labels to the member list.
const _NAMED_MEGAREGIONS: {
  slug: string;
  displayName: string;
  leadSlug: string;
  memberSlugs: string[];
  extraSatellites?: string[];
  country?: string;  // override the lead's country when needed (e.g. PRD spans HK + China)
}[] = [
  {
    slug: "randstad",
    displayName: "Randstad",
    leadSlug: "amsterdam",
    memberSlugs: ["amsterdam", "rotterdam-the-hague", "utrecht", "leiden"],
    extraSatellites: ["The Hague", "Haarlem", "Almere", "Zaanstad", "Hilversum"],
  },
  {
    slug: "flemish-diamond",
    displayName: "Flemish Diamond",
    leadSlug: "brussels",
    memberSlugs: ["brussels", "antwerp", "mechelen", "leuven", "aalst", "gent"],
    extraSatellites: ["Vilvoorde", "Asse"],
  },
  {
    slug: "pearl-river-delta",
    displayName: "Pearl River Delta",
    leadSlug: "guangzhou",
    memberSlugs: ["guangzhou", "hong-kong", "macau"],
    extraSatellites: ["Shenzhen", "Dongguan", "Foshan", "Zhuhai"],
  },
  {
    slug: "jing-jin-ji",
    displayName: "Jing-Jin-Ji",
    leadSlug: "beijing",
    memberSlugs: ["beijing", "tianjin"],
    extraSatellites: ["Langfang", "Baoding", "Tangshan", "Cangzhou"],
  },
  {
    slug: "north-west-england",
    displayName: "North-West England",
    leadSlug: "manchester",
    memberSlugs: ["manchester", "liverpool", "blackburn-burnley", "blackpool", "lancaster"],
    extraSatellites: ["Bolton", "Stockport", "Salford", "Warrington", "Preston", "Birkenhead", "St Helens"],
  },
  {
    slug: "tri-state-area",
    displayName: "Tri-State Area",
    leadSlug: "new-york",
    memberSlugs: ["new-york", "new-haven"],
    extraSatellites: ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Newark", "Jersey City", "Long Island", "Westchester"],
  },
  {
    slug: "greater-south-east",
    displayName: "Greater South East",
    leadSlug: "london",
    memberSlugs: ["london", "cambridge", "oxford", "milton-keynes", "bedford", "canterbury"],
    extraSatellites: ["Westminster", "Camden", "Croydon", "Watford", "Reading", "St Albans", "Slough", "Chelmsford", "Southend-on-Sea", "Maidstone", "Tunbridge Wells", "Aylesbury", "Banbury"],
  },
  {
    slug: "haven-gateway",
    displayName: "Haven Gateway",
    leadSlug: "ipswich",
    memberSlugs: ["ipswich", "colchester"],
    extraSatellites: ["Felixstowe", "Harwich", "Clacton-on-Sea"],
  },
  {
    slug: "trinational-basel",
    displayName: "Trinational Basel",
    leadSlug: "basel",
    memberSlugs: ["basel", "freiburg", "colmar", "mulhouse", "villingen-schwenningen"],
    extraSatellites: ["Saint-Louis (Alsace)", "Weil am Rhein", "Lörrach"],
  },
  {
    slug: "greater-zurich",
    displayName: "Greater Zurich",
    leadSlug: "zurich",
    memberSlugs: ["zurich", "lucerne", "zug", "aarau", "baden", "schaffhausen", "wil"],
    extraSatellites: ["Winterthur", "Frauenfeld"],
  },
  {
    slug: "scottish-central-belt",
    displayName: "Scottish Central Belt",
    leadSlug: "edinburgh",
    memberSlugs: ["edinburgh", "glasgow", "dundee", "st-andrews", "perth-scotland", "falkirk", "ayr", "kilmarnock"],
    extraSatellites: ["Stirling", "Paisley", "East Kilbride", "Hamilton", "Motherwell", "Greenock", "Livingston", "Kirkcaldy"],
  },
  {
    slug: "english-midlands",
    displayName: "English Midlands",
    leadSlug: "birmingham",
    memberSlugs: ["birmingham", "nottingham", "leicester", "coventry", "derby"],
    extraSatellites: ["Wolverhampton", "Solihull", "Walsall", "Dudley", "Sandwell", "West Bromwich", "Mansfield", "Loughborough"],
  },
  {
    slug: "severnside",
    displayName: "Severnside",
    leadSlug: "cardiff",
    memberSlugs: ["cardiff", "bristol", "bath", "newport", "gloucester", "cheltenham"],
    extraSatellites: ["Weston-super-Mare", "Chepstow", "Caerphilly", "Bridgend", "Stroud"],
  },
  {
    slug: "english-south-coast",
    displayName: "English South Coast",
    leadSlug: "southampton",
    memberSlugs: ["southampton", "brighton-hove", "bournemouth", "portsmouth"],
    extraSatellites: ["Worthing", "Eastbourne", "Poole", "Isle of Wight", "Eastleigh", "Fareham", "Gosport", "Havant"],
  },
  {
    slug: "north-east-england",
    displayName: "North East England",
    leadSlug: "newcastle",
    memberSlugs: ["newcastle", "durham", "sunderland", "middlesbrough"],
    extraSatellites: ["Gateshead", "Stockton-on-Tees", "Hartlepool", "Darlington", "North Shields", "South Shields"],
  },
  {
    slug: "west-and-north-yorkshire",
    displayName: "West and North Yorkshire",
    leadSlug: "leeds-bradford",
    memberSlugs: ["leeds-bradford", "york"],
    extraSatellites: ["Wakefield", "Halifax", "Huddersfield", "Harrogate", "Dewsbury", "Castleford"],
  },
  {
    slug: "devon",
    displayName: "Devon",
    leadSlug: "exeter",
    memberSlugs: ["exeter", "plymouth"],
    extraSatellites: ["Torquay", "Exmouth", "Barnstaple", "Tiverton", "Newton Abbot", "Paignton"],
  },
  {
    slug: "boston-providence",
    displayName: "Boston-Providence",
    leadSlug: "boston",
    memberSlugs: ["boston", "providence"],
    extraSatellites: ["Cambridge MA", "Worcester", "Lowell", "Quincy", "Pawtucket", "Warwick"],
  },
  {
    slug: "greater-golden-horseshoe",
    displayName: "Greater Golden Horseshoe",
    leadSlug: "toronto",
    memberSlugs: ["toronto", "buffalo", "kitchener-waterloo", "hamilton", "st-catharines-niagara"],
    extraSatellites: ["Mississauga", "Brampton", "Markham", "Vaughan", "Oakville", "Burlington", "Oshawa", "Niagara Falls"],
  },
  {
    slug: "san-diego-tijuana",
    displayName: "San Diego-Tijuana",
    leadSlug: "san-diego",
    memberSlugs: ["san-diego", "tijuana"],
    extraSatellites: ["Chula Vista", "Oceanside", "Escondido", "Rosarito", "Tecate"],
  },
  {
    slug: "detroit-windsor",
    displayName: "Detroit-Windsor",
    leadSlug: "detroit",
    memberSlugs: ["detroit", "windsor"],
    extraSatellites: ["Dearborn", "Warren MI", "Sterling Heights", "Ann Arbor", "Tecumseh"],
  },
  {
    slug: "suncoast",
    displayName: "Suncoast",
    leadSlug: "tampa",
    memberSlugs: ["tampa", "sarasota"],
    extraSatellites: ["St. Petersburg", "Clearwater", "Bradenton", "Lakeland", "Brandon FL"],
  },
  {
    slug: "greater-charlotte",
    displayName: "Greater Charlotte",
    leadSlug: "charlotte",
    memberSlugs: ["charlotte", "hickory"],
    extraSatellites: ["Concord NC", "Gastonia", "Rock Hill", "Huntersville", "Statesville"],
  },
  {
    slug: "central-indiana",
    displayName: "Central Indiana",
    leadSlug: "indianapolis",
    memberSlugs: ["indianapolis", "bloomington"],
    extraSatellites: ["Carmel", "Fishers", "Noblesville", "Greenwood IN", "Anderson IN"],
  },
  {
    slug: "middle-tennessee",
    displayName: "Middle Tennessee",
    leadSlug: "nashville",
    memberSlugs: ["nashville", "clarksville"],
    extraSatellites: ["Murfreesboro", "Franklin TN", "Hendersonville", "Smyrna TN", "Gallatin"],
  },
  {
    slug: "california-capital-region",
    displayName: "California Capital Region",
    leadSlug: "sacramento",
    memberSlugs: ["sacramento", "stockton"],
    extraSatellites: ["Elk Grove", "Roseville", "Folsom", "Davis", "Modesto", "Tracy"],
  },
  {
    slug: "lowcountry",
    displayName: "Lowcountry",
    leadSlug: "savannah",
    memberSlugs: ["savannah", "hilton-head"],
    extraSatellites: ["Beaufort SC", "Bluffton", "Pooler", "Tybee Island", "Hardeeville"],
  },
  {
    slug: "borderplex",
    displayName: "Borderplex",
    leadSlug: "el-paso",
    memberSlugs: ["el-paso", "ciudad-juarez", "las-cruces"],
    extraSatellites: ["Socorro TX", "Sunland Park", "Anthony", "Horizon City"],
  },
  {
    slug: "ning-zhen-yang",
    displayName: "Ning-Zhen-Yang",
    leadSlug: "nanjing",
    memberSlugs: ["nanjing", "taizhou", "zhenjiang", "yangzhou"],
    extraSatellites: ["Maanshan", "Chuzhou", "Jurong", "Yizheng"],
  },
  {
    slug: "central-plains",
    displayName: "Central Plains",
    leadSlug: "zhengzhou",
    memberSlugs: ["zhengzhou", "xinxiang", "kaifeng", "jiaozuo"],
    extraSatellites: ["Xuchang", "Luohe", "Zhoukou", "Pingdingshan"],
  },
  {
    slug: "hefei-metropolitan-area",
    displayName: "Hefei Metropolitan Area",
    leadSlug: "hefei",
    memberSlugs: ["hefei", "luan"],
    extraSatellites: ["Chuzhou", "Wuhu", "Ma'anshan", "Tongling"],
  },
  {
    slug: "minnan",
    displayName: "Minnan",
    leadSlug: "xiamen",
    memberSlugs: ["xiamen", "zhangzhou"],
    extraSatellites: ["Quanzhou", "Jinjiang", "Shishi", "Longhai"],
  },
  {
    slug: "greater-jinan",
    displayName: "Greater Jinan",
    leadSlug: "jinan",
    memberSlugs: ["jinan", "taian"],
    extraSatellites: ["Zibo", "Liaocheng", "Dezhou", "Laiwu"],
  },
  {
    slug: "mindong",
    displayName: "Mindong",
    leadSlug: "fuzhou",
    memberSlugs: ["fuzhou", "ningde"],
    extraSatellites: ["Putian", "Fuqing", "Changle", "Pingtan"],
  },
  {
    slug: "ningbo-zhoushan",
    displayName: "Ningbo-Zhoushan",
    leadSlug: "ningbo",
    memberSlugs: ["ningbo", "zhoushan"],
    extraSatellites: ["Cixi", "Yuyao", "Fenghua", "Xiangshan"],
  },
  {
    slug: "bodensee",
    displayName: "Bodensee",
    leadSlug: "st-gallen",
    memberSlugs: ["st-gallen", "konstanz", "bregenz", "altach", "vaduz"],
    extraSatellites: ["Friedrichshafen", "Lindau", "Dornbirn", "Feldkirch", "Schaan", "Romanshorn"],
  },
  {
    slug: "sijori-triangle",
    displayName: "SIJORI Triangle",
    leadSlug: "singapore",
    memberSlugs: ["singapore", "johor-bahru", "batam"],
    extraSatellites: ["Skudai", "Kulai", "Pasir Gudang", "Bintan"],
  },
  {
    slug: "sydney-illawarra",
    displayName: "Sydney-Illawarra",
    leadSlug: "sydney",
    memberSlugs: ["sydney", "wollongong"],
    extraSatellites: ["Parramatta", "Penrith", "Liverpool NSW", "Campbelltown", "Shellharbour"],
  },
  {
    slug: "greater-sao-paulo",
    displayName: "Greater São Paulo",
    leadSlug: "sao-paulo",
    memberSlugs: ["sao-paulo", "santos"],
    extraSatellites: ["Guarulhos", "Osasco", "São Bernardo do Campo", "Santo André", "Campinas"],
  },
  {
    slug: "greater-melbourne",
    displayName: "Greater Melbourne",
    leadSlug: "melbourne",
    memberSlugs: ["melbourne", "geelong"],
    extraSatellites: ["Frankston", "Dandenong", "Werribee", "Sunbury", "Ballarat"],
  },
  {
    slug: "greater-bangkok",
    displayName: "Greater Bangkok",
    leadSlug: "bangkok",
    memberSlugs: ["bangkok", "chonburi"],
    extraSatellites: ["Nonthaburi", "Samut Prakan", "Pak Kret", "Pattaya", "Sriracha"],
  },
  {
    slug: "klang-valley",
    displayName: "Klang Valley",
    leadSlug: "kuala-lumpur",
    memberSlugs: ["kuala-lumpur", "bentong"],
    extraSatellites: ["Petaling Jaya", "Shah Alam", "Subang Jaya", "Klang", "Putrajaya"],
  },
  {
    slug: "rio-de-la-plata-region",
    displayName: "Río de la Plata Region",
    leadSlug: "buenos-aires",
    memberSlugs: ["buenos-aires", "la-plata"],
    extraSatellites: ["La Matanza", "Quilmes", "Lomas de Zamora", "Lanús", "Berazategui"],
  },
  {
    slug: "vienna-bratislava",
    displayName: "Vienna-Bratislava",
    leadSlug: "vienna",
    memberSlugs: ["vienna", "bratislava"],
    extraSatellites: ["Hainburg", "Wiener Neustadt", "Trnava", "Pezinok"],
  },
  {
    slug: "greater-rome",
    displayName: "Greater Rome",
    leadSlug: "rome",
    memberSlugs: ["rome", "vatican-city", "latina"],
    extraSatellites: ["Tivoli", "Frascati", "Aprilia", "Anzio", "Civitavecchia"],
  },
  {
    slug: "greater-manila",
    displayName: "Greater Manila",
    leadSlug: "manila",
    memberSlugs: ["manila", "angeles"],
    extraSatellites: ["Quezon City", "Makati", "Pasig", "Caloocan", "Taguig", "San Fernando PH"],
  },
  {
    slug: "northern-taiwan",
    displayName: "Northern Taiwan",
    leadSlug: "taipei",
    memberSlugs: ["taipei", "hsinchu"],
    extraSatellites: ["New Taipei", "Keelung", "Taoyuan", "Banqiao", "Zhongli"],
  },
  {
    slug: "national-capital-region",
    displayName: "National Capital Region",
    leadSlug: "delhi",
    memberSlugs: ["delhi", "ghaziabad"],
    extraSatellites: ["Gurgaon", "Noida", "Faridabad", "Meerut", "Sonipat"],
  },
  {
    slug: "tel-aviv-jerusalem-corridor",
    displayName: "Tel Aviv-Jerusalem Corridor",
    leadSlug: "tel-aviv",
    memberSlugs: ["tel-aviv", "jerusalem", "ramallah"],
    extraSatellites: ["Bethlehem", "Modi'in", "Ramla", "Lod", "Beit Shemesh"],
  },
  {
    slug: "malardalen",
    displayName: "Mälardalen",
    leadSlug: "stockholm",
    memberSlugs: ["stockholm", "uppsala"],
    extraSatellites: ["Solna", "Södertälje", "Västerås", "Eskilstuna", "Enköping"],
  },
  {
    slug: "oresund-region",
    displayName: "Øresund Region",
    leadSlug: "copenhagen",
    memberSlugs: ["copenhagen", "malmo"],
    extraSatellites: ["Frederiksberg", "Roskilde", "Helsingør", "Lund", "Helsingborg"],
  },
  {
    slug: "south-east-queensland",
    displayName: "South East Queensland",
    leadSlug: "brisbane",
    memberSlugs: ["brisbane", "gold-coast"],
    extraSatellites: ["Ipswich AU", "Logan City", "Sunshine Coast", "Toowoomba", "Redland"],
  },
  {
    slug: "greater-rio-de-janeiro",
    displayName: "Greater Rio de Janeiro",
    leadSlug: "rio-de-janeiro",
    memberSlugs: ["rio-de-janeiro", "saquarema"],
    extraSatellites: ["Niterói", "Duque de Caxias", "Nova Iguaçu", "São Gonçalo", "Petrópolis"],
  },
  {
    slug: "emilia-romagna",
    displayName: "Emilia-Romagna",
    leadSlug: "bologna",
    memberSlugs: ["bologna", "parma", "brescia", "modena", "cremona", "reggio-emilia", "piacenza"],
    extraSatellites: ["Ferrara", "Ravenna", "Forlì", "Rimini", "Mantua"],
  },
  {
    slug: "grand-geneve",
    displayName: "Grand Genève",
    leadSlug: "geneva",
    memberSlugs: ["geneva", "annecy", "chambery", "albertville"],
    extraSatellites: ["Annemasse", "Saint-Julien-en-Genevois", "Thonon-les-Bains", "Aix-les-Bains"],
  },
  {
    slug: "bohemian-heartland",
    displayName: "Bohemian Heartland",
    leadSlug: "prague",
    memberSlugs: ["prague", "pardubice", "liberec", "hradec-kralove", "mlada-boleslav", "jablonec"],
    extraSatellites: ["Kladno", "Mělník", "Kolín", "Turnov", "Trutnov"],
  },
  {
    slug: "basque-country",
    displayName: "Basque Country",
    leadSlug: "bilbao",
    memberSlugs: ["bilbao", "san-sebastian", "vitoria-gasteiz", "eibar"],
    extraSatellites: ["Barakaldo", "Getxo", "Irun", "Pamplona", "Bayonne"],
  },
  {
    slug: "hejaz-coast",
    displayName: "Hejaz Coast",
    leadSlug: "jeddah",
    memberSlugs: ["jeddah", "mecca"],
    extraSatellites: ["Taif", "Rabigh", "Yanbu", "Medina"],
  },
  {
    slug: "eastern-gulf-coast",
    displayName: "Eastern Gulf Coast",
    leadSlug: "manama",
    memberSlugs: ["manama", "dammam"],
    extraSatellites: ["Riffa", "Khobar", "Dhahran", "Qatif", "Muharraq"],
  },
  {
    slug: "silesian-industrial-belt",
    displayName: "Silesian Industrial Belt",
    leadSlug: "krakow",
    memberSlugs: ["krakow", "upper-silesian", "czstochowa", "owicim", "ostrava", "karvina", "zawiercie"],
    extraSatellites: ["Katowice", "Gliwice", "Sosnowiec", "Bytom", "Tychy", "Bielsko-Biała"],
  },
  {
    slug: "costa-del-azahar",
    displayName: "Costa del Azahar",
    leadSlug: "valencia",
    memberSlugs: ["valencia", "castellon"],
    extraSatellites: ["Sagunto", "Gandía", "Vinaròs", "Benicàssim", "Burriana"],
  },
  {
    slug: "cote-dazur",
    displayName: "Côte d'Azur",
    leadSlug: "nice",
    memberSlugs: ["nice", "monaco", "frejus"],
    extraSatellites: ["Cannes", "Antibes", "Menton", "Saint-Tropez", "Grasse"],
  },
  {
    slug: "greater-porto",
    displayName: "Greater Porto",
    leadSlug: "porto",
    memberSlugs: ["porto", "minho"],
    extraSatellites: ["Vila Nova de Gaia", "Matosinhos", "Braga", "Guimarães", "Maia"],
  },
  {
    slug: "provence-coast",
    displayName: "Provence Coast",
    leadSlug: "marseille",
    memberSlugs: ["marseille", "toulon"],
    extraSatellites: ["Aix-en-Provence", "Aubagne", "La Ciotat", "Hyères", "Saint-Raphaël"],
  },
  {
    slug: "tuscany",
    displayName: "Tuscany",
    leadSlug: "florence",
    memberSlugs: ["florence", "pisa-livorno", "siena", "lucca"],
    extraSatellites: ["Prato", "Pistoia", "Arezzo", "Empoli", "Viareggio"],
  },
  {
    slug: "rhone-valley",
    displayName: "Rhône Valley",
    leadSlug: "lyon",
    memberSlugs: ["lyon", "bourg-en-bresse", "saint-etienne"],
    extraSatellites: ["Villeurbanne", "Vienne", "Roanne", "Bourgoin-Jallieu", "Givors"],
  },
  {
    slug: "campania",
    displayName: "Campania",
    leadSlug: "naples",
    memberSlugs: ["naples", "salerno"],
    extraSatellites: ["Caserta", "Pozzuoli", "Castellammare di Stabia", "Torre del Greco", "Battipaglia"],
  },
  {
    slug: "southeast-vietnam",
    displayName: "Southeast Vietnam",
    leadSlug: "ho-chi-minh-city",
    memberSlugs: ["ho-chi-minh-city", "vng-tau"],
    extraSatellites: ["Biên Hòa", "Thủ Dầu Một", "Long Thành", "Phan Thiết", "Mỹ Tho"],
  },
  {
    slug: "upper-rhine-neckar",
    displayName: "Upper Rhine-Neckar",
    leadSlug: "rhine-neckar",
    memberSlugs: ["rhine-neckar", "karlsruhe", "kaiserslautern"],
    extraSatellites: ["Mannheim", "Heidelberg", "Ludwigshafen", "Worms", "Speyer", "Pforzheim"],
  },
  {
    slug: "euregio-meuse-rhine",
    displayName: "Euregio Meuse-Rhine",
    leadSlug: "liege",
    memberSlugs: ["liege", "maastricht", "aachen", "genk", "sittard-geleen"],
    extraSatellites: ["Verviers", "Hasselt", "Heerlen", "Eupen", "Düren"],
  },
];

// ---------- Types ----------

export type BadgeStatus = "live" | "coming-soon";

export type BadgeTier = {
  slug: string;
  name: string;
  description: string;
  accentHex: string;
};

export type QualifyingMetro = {
  slug: string;
  name: string;
  country: string;
  // ETL-resolved country slugs so badge rows can link to /countries/[slug].
  // Prefers UK constituent (England / Scotland / etc.) when present;
  // sovereignSlug holds the parent for breadcrumb-style links.
  countrySlug?: string;
  sovereignSlug?: string;
  rank: number;
  score: number;
  contextValue: number;
  contextLabel: string;
  tier?: string;
  // Isolated Capital: the nearest peer at or above the capital's own rank.
  peerSlug?: string;
  peerName?: string;
  peerCountry?: string;
  peerRank?: number;
  // Twin Metros: the connected-component cluster this metro belongs to.
  cluster?: {
    id: string;
    size: number;
    diameterKm: number;
    populationSum: number;
    // otherSlugs/otherNames exclude the lead; memberSlugs/memberNames include it.
    otherSlugs: string[];
    otherNames: string[];
    memberSlugs: string[];
    memberNames: string[];
    // componentMetro: when the row's name is an editorial alias (e.g.,
    // "Twin Cities", "Jabodetabek"), this points to the workbook metro the
    // row links to so the connection is explicit on the page.
    componentMetro?: { slug: string; name: string; rank: number };
  };
};

export type Badge = {
  slug: string;
  name: string;
  emoji: string;
  shortDesc: string;
  longDesc: string;
  methodologyAnchor?: string;
  status: BadgeStatus;
  tiers?: BadgeTier[];
  compute?: () => QualifyingMetro[];
};

// ---------- Helpers ----------

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}


// IMPORTANT: the path is statically scoped under public/data/ so Turbopack's
// File Tracing only walks that subtree at build time. A fully dynamic
// path.join(process.cwd(), relPath) caused NFT to trace the entire project
// root (~11k files) and pulled next.config.ts into the function bundle,
// blowing past Vercel's deploy size limit. Always pass a bare filename here.
function loadCsv(fileName: string): Record<string, string>[] {
  // fileName is dynamic; the turbopackIgnore comment keeps the File Tracer
  // from walking every file under public/data/ (which was matching 27540
  // files even though only ~12 CSVs are read here). Build-time read still
  // works because the files exist on disk during `next build`.
  const path = join(process.cwd(), "public", "data", /*turbopackIgnore: true*/ fileName);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

// Memoize the metro index so getAllMetros isn't re-walked per compute call.
let _metroIndex: { bySlug: Map<string, Metro>; byName: Map<string, Metro> } | null = null;
function getMetroIndex() {
  if (_metroIndex) return _metroIndex;
  const bySlug = new Map<string, Metro>();
  const byName = new Map<string, Metro>();
  for (const m of getAllMetros()) {
    bySlug.set(m.slug, m);
    byName.set(m.name, m);
  }
  _metroIndex = { bySlug, byName };
  return _metroIndex;
}

function computeFromCsv(csvName: string, valueColumn: string, contextLabel: string): QualifyingMetro[] {
  const csv = loadCsv(csvName);
  const { bySlug } = getMetroIndex();
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const meta = bySlug.get(row.slug);
    const value = parseFloat(row[valueColumn]);
    if (!meta || isNaN(value)) continue;
    out.push({
      slug: meta.slug, name: meta.name, country: meta.country,
      countrySlug: meta.countrySlug, sovereignSlug: meta.sovereignSlug,
      rank: meta.rank, score: meta.score,
      contextValue: value, contextLabel,
      tier: row.tier || undefined,
    });
  }
  out.sort((a, b) => b.contextValue - a.contextValue);
  return out;
}

// Shared helper for the Conurbations cluster CSV. Reads any
// cluster CSV that follows the schema written by scripts/generate-distance-
// badges.py (slug, name, country, rank, cluster_id, cluster_size,
// cluster_diameter_km, cluster_member_slugs, cluster_member_names,
// cluster_other_slugs, cluster_other_names, tier).
function computeClustersFromCsv(csvName: string): QualifyingMetro[] {
  const csv = loadCsv(csvName);
  const { bySlug } = getMetroIndex();
  // Build one QualifyingMetro per cluster: the cluster's lead (lowest-rank
  // member). The cluster's full member list lives on `cluster.memberSlugs`/
  // `cluster.memberNames`; `otherSlugs`/`otherNames` excludes the lead. The
  // inverted index `buildBadgesByMetroIndex` walks `memberSlugs` so every
  // cluster member still gets a chip on its own metro detail page.
  // contextValue = sum of composite scores across all members so the table
  // sorts heaviest-first; the diameter is shown inline beneath the lead name.
  const leads = new Map<string, { qm: QualifyingMetro; bestRank: number; scoreSum: number }>();
  for (const row of csv) {
    const meta = bySlug.get(row.slug);
    if (!meta) continue;
    const size = parseInt(row.cluster_size, 10);
    const diameter = parseFloat(row.cluster_diameter_km);
    const scoreSum = parseFloat(row.cluster_score_sum);
    if (isNaN(size) || isNaN(diameter) || isNaN(scoreSum)) continue;
    const cid = row.cluster_id;
    const memberSlugs = row.cluster_member_slugs ? row.cluster_member_slugs.split(";").filter(Boolean) : [meta.slug];
    const memberNames = row.cluster_member_names ? row.cluster_member_names.split(";").filter(Boolean) : [meta.name];
    const existing = leads.get(cid);
    if (existing && meta.rank >= existing.bestRank) continue;
    const otherSlugs = memberSlugs.filter((s) => s !== meta.slug);
    const otherNames = memberNames.filter((_, i) => memberSlugs[i] !== meta.slug);
    // Country list across all members, deduped preserving first-appearance order.
    const memberCountries: string[] = [];
    for (const ms of memberSlugs) {
      const mm = bySlug.get(ms);
      if (mm?.country && !memberCountries.includes(mm.country)) memberCountries.push(mm.country);
    }
    const countryDisplay = memberCountries.length > 0 ? memberCountries.join(" / ") : meta.country;
    // Country links only make sense when every member shares one country.
    // Multi-country clusters (e.g. Detroit-Windsor) render the joined string
    // as plain text since the link target is ambiguous.
    const sameCountry = memberCountries.length <= 1;
    const qm: QualifyingMetro = {
      slug: meta.slug, name: meta.name, country: countryDisplay,
      countrySlug: sameCountry ? meta.countrySlug : undefined,
      sovereignSlug: sameCountry ? meta.sovereignSlug : undefined,
      rank: meta.rank, score: meta.score,
      contextValue: scoreSum, contextLabel: "Cluster score",
      tier: row.tier || undefined,
      cluster: {
        id: cid, size, diameterKm: diameter,
        populationSum: memberSlugs.reduce((acc, ms) => acc + (bySlug.get(ms)?.pop ?? 0), 0),
        otherSlugs, otherNames, memberSlugs, memberNames,
      },
    };
    leads.set(cid, { qm, bestRank: meta.rank, scoreSum });
  }
  // Sort heaviest cluster first
  return [...leads.values()].sort((a, b) => b.scoreSum - a.scoreSum).map((e) => e.qm);
}

// Isolated Capital: capitals where the nearest peer at or above the capital's
// own rank is more than 300 km. Sorted by distance descending: most-isolated
// first.
function computeIsolatedCapitalRows(): QualifyingMetro[] {
  const csv = loadCsv("isolated-capital.csv");
  const { bySlug } = getMetroIndex();
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const meta = bySlug.get(row.slug);
    const value = parseFloat(row.distance_km);
    if (!meta || isNaN(value)) continue;
    out.push({
      slug: meta.slug, name: meta.name, country: meta.country,
      countrySlug: meta.countrySlug, sovereignSlug: meta.sovereignSlug,
      rank: meta.rank, score: meta.score,
      contextValue: value, contextLabel: "km to nearest tier-comparable peer",
      tier: row.tier || undefined,
      peerSlug: row.peer_slug || undefined,
      peerName: row.peer_name || undefined,
      peerCountry: row.peer_country || undefined,
      peerRank: row.peer_rank ? parseInt(row.peer_rank, 10) : undefined,
    });
  }
  out.sort((a, b) => b.contextValue - a.contextValue);
  return out;
}

// ---------- Live computes ----------

function computeUniversityTown(): QualifyingMetro[] {
  const csv = loadCsv("academic-gravity-wells.csv");
  const { bySlug, byName } = getMetroIndex();
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const meta = bySlug.get(row.slug) || byName.get(row.name);
    const share = parseFloat(row.uni_share_pct);
    if (!meta || isNaN(share)) continue;
    out.push({
      slug: meta.slug, name: meta.name, country: meta.country,
      countrySlug: meta.countrySlug, sovereignSlug: meta.sovereignSlug,
      rank: meta.rank, score: meta.score,
      contextValue: share, contextLabel: "University share",
      tier: row.tier,
    });
  }
  out.sort((a, b) => b.contextValue - a.contextValue);
  return out;
}

function computeSkylineCity(): QualifyingMetro[] {
  const csv = loadCsv("skyline-cities.csv");
  const { bySlug, byName } = getMetroIndex();
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const meta = bySlug.get(row.slug) || byName.get(row.name);
    const share = parseFloat(row.sky_share_pct);
    if (!meta || isNaN(share)) continue;
    out.push({
      slug: meta.slug, name: meta.name, country: meta.country,
      countrySlug: meta.countrySlug, sovereignSlug: meta.sovereignSlug,
      rank: meta.rank, score: meta.score,
      contextValue: share, contextLabel: "Skyscraper share",
      tier: row.tier,
    });
  }
  out.sort((a, b) => b.contextValue - a.contextValue);
  return out;
}

function computeMegacity(): QualifyingMetro[] {
  return getAllMetros()
    .filter((m) => (m.pop ?? 0) >= 5_000_000)
    .map((m) => ({
      slug: m.slug, name: m.name, country: m.country,
      countrySlug: m.countrySlug, sovereignSlug: m.sovereignSlug,
      rank: m.rank, score: m.score,
      contextValue: m.pop, contextLabel: "Population",
    }))
    .sort((a, b) => b.contextValue - a.contextValue);
}

function computeGlobalGateway() { return computeFromCsv("global-gateway.csv", "airport_score", "Airport score"); }
function computeFinanceCapital() { return computeFromCsv("finance-capital.csv", "marketCap", "Market cap (USD)"); }
function computeCultureCapital() { return computeFromCsv("culture-capital.csv", "culture_score", "Culture composite"); }
function computeSportsMecca() { return computeFromCsv("sports-mecca.csv", "sports_score", "Sports composite"); }
function computeRailHub() { return computeFromCsv("rail-hub.csv", "rail_score", "Rail composite"); }
function computeOverperformer() { return computeFromCsv("overperformer.csv", "multiple", "Pop-rank to score-rank multiple"); }
function computeGreyingPower() { return computeFromCsv("greying-power.csv", "score_value", "Composite score"); }
function computeCosmopolitanCapital() { return computeFromCsv("cosmopolitan-capital.csv", "score_value", "Composite score"); }
function computeEmergingStandout() { return computeFromCsv("emerging-standout.csv", "score_value", "Composite score"); }
function computeVelvetRockCapital() { return computeFromCsv("velvet-rock-capital.csv", "score_value", "VRI score"); }

// Frozen Conurbations: paired metros that should function as a single urban
// system but have been severed by political geography or missing
// infrastructure. CSV lists one row per affected metro grouped by case_id;
// the compute returns one QualifyingMetro per case (the higher-profile
// member as lead) with a populated cluster so chips appear on both members
// via buildBadgesByMetroIndex.
function computeFrozenConurbations(): QualifyingMetro[] {
  const csv = loadCsv("frozen-conurbations.csv");
  const { bySlug } = getMetroIndex();
  const caseMembers = new Map<string, string[]>();
  const caseNames = new Map<string, string[]>();
  for (const row of csv) {
    const memArr = caseMembers.get(row.case_id) ?? [];
    if (!memArr.includes(row.slug)) memArr.push(row.slug);
    caseMembers.set(row.case_id, memArr);
    const nameArr = caseNames.get(row.case_id) ?? [];
    if (!nameArr.includes(row.name)) nameArr.push(row.name);
    caseNames.set(row.case_id, nameArr);
  }
  const leadByCase = new Map<string, { slug: string; rank: number }>();
  for (const row of csv) {
    const meta = bySlug.get(row.slug);
    if (!meta) continue;
    const cur = leadByCase.get(row.case_id);
    if (!cur || meta.rank < cur.rank) {
      leadByCase.set(row.case_id, { slug: row.slug, rank: meta.rank });
    }
  }
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const lead = leadByCase.get(row.case_id);
    if (!lead || lead.slug !== row.slug) continue;
    const meta = bySlug.get(row.slug);
    if (!meta) continue;
    const sinceYear = parseInt(row.score_value, 10);
    if (isNaN(sinceYear)) continue;
    const memberSlugs = caseMembers.get(row.case_id) ?? [row.slug];
    const memberNames = caseNames.get(row.case_id) ?? [row.name];
    const otherSlugs = memberSlugs.filter((s) => s !== row.slug);
    const otherNames = memberNames.filter((_, i) => memberSlugs[i] !== row.slug);
    // Diameter: max pairwise haversine across members. Population sum across members.
    const memberMetas = memberSlugs.map((s) => bySlug.get(s)).filter((m): m is Metro => m !== undefined);
    let diameterKm = 0;
    const withCoords = memberMetas.filter((m) => (m.lat ?? 0) !== 0 && (m.lon ?? 0) !== 0);
    for (let i = 0; i < withCoords.length; i++) {
      for (let j = i + 1; j < withCoords.length; j++) {
        const d = haversineKm(withCoords[i].lat, withCoords[i].lon, withCoords[j].lat, withCoords[j].lon);
        if (d > diameterKm) diameterKm = d;
      }
    }
    const populationSum = memberMetas.reduce((acc, m) => acc + (m.pop ?? 0), 0);
    out.push({
      slug: meta.slug,
      name: meta.name,
      country: meta.country,
      countrySlug: meta.countrySlug,
      sovereignSlug: meta.sovereignSlug,
      rank: meta.rank,
      score: meta.score,
      contextValue: sinceYear,
      contextLabel: `Severed ${sinceYear} (${row.severing_condition})`,
      cluster: {
        id: row.case_id,
        size: memberSlugs.length,
        diameterKm,
        populationSum,
        otherSlugs,
        otherNames,
        memberSlugs,
        memberNames,
      },
    });
  }
  out.sort((a, b) => a.contextValue - b.contextValue);
  return out;
}
function computeConurbations(): QualifyingMetro[] {
  const { bySlug } = getMetroIndex();

  // 1. Build named megaregion rows. Each claims its listed memberSlugs.
  const namedRows: QualifyingMetro[] = [];
  const claimedByNamed = new Set<string>();
  for (const ng of _NAMED_MEGAREGIONS) {
    const memberMetas = ng.memberSlugs.map((s) => bySlug.get(s)).filter((m): m is Metro => m !== undefined);
    if (memberMetas.length === 0) continue;
    for (const s of ng.memberSlugs) claimedByNamed.add(s);
    const lead = bySlug.get(ng.leadSlug) ?? memberMetas[0];
    const scoreSum = Math.round(memberMetas.reduce((acc, m) => acc + (m.score ?? 0), 0) * 10) / 10;
    const memberNames = memberMetas.map((m) => m.name).concat(ng.extraSatellites ?? []);
    const otherSlugs = ng.memberSlugs.filter((s) => s !== lead.slug);
    const otherNames = memberMetas.filter((m) => m.slug !== lead.slug).map((m) => m.name).concat(ng.extraSatellites ?? []);
    // Diameter: max pairwise haversine among workbook member metros that have coords.
    let diameterKm = 0;
    const withCoords = memberMetas.filter((m) => (m.lat ?? 0) !== 0 && (m.lon ?? 0) !== 0);
    for (let i = 0; i < withCoords.length; i++) {
      for (let j = i + 1; j < withCoords.length; j++) {
        const d = haversineKm(withCoords[i].lat, withCoords[i].lon, withCoords[j].lat, withCoords[j].lon);
        if (d > diameterKm) diameterKm = d;
      }
    }
    const tier = scoreSum >= 100 ? "A" : scoreSum >= 50 ? "B" : scoreSum >= 20 ? "C" : "D";
    // Derive the country list from members (dedupe preserving first-appearance order).
    // The explicit `country` override still wins if set.
    const memberCountries: string[] = [];
    for (const m of memberMetas) {
      if (m.country && !memberCountries.includes(m.country)) memberCountries.push(m.country);
    }
    const countryDisplay = ng.country ?? memberCountries.join(" / ");
    // Single-country named megaregions get linked country slugs; multi-
    // country megaregions (e.g. anything spanning two sovereigns) leave
    // them undefined so the joined display text renders without a link.
    const sameCountry = memberCountries.length <= 1 && !ng.country;
    namedRows.push({
      slug: lead.slug, name: ng.displayName, country: countryDisplay,
      countrySlug: sameCountry ? lead.countrySlug : undefined,
      sovereignSlug: sameCountry ? lead.sovereignSlug : undefined,
      rank: lead.rank, score: lead.score,
      contextValue: scoreSum, contextLabel: "Cluster score",
      tier,
      cluster: {
        id: `n-${ng.slug}`,
        size: memberNames.length,
        diameterKm: Math.round(diameterKm * 10) / 10,
        populationSum: memberMetas.reduce((acc, m) => acc + (m.pop ?? 0), 0),
        otherSlugs,
        otherNames,
        memberSlugs: ng.memberSlugs,
        memberNames,
        componentMetro: ng.displayName !== lead.name ? { slug: lead.slug, name: lead.name, rank: lead.rank } : undefined,
      },
    });
  }

  // 2. Auto clusters: drop any whose membership intersects a named megaregion.
  const autoRaw = computeClustersFromCsv("conurbations.csv");
  const auto = autoRaw.filter((q) => {
    if (!q.cluster) return true;
    return !q.cluster.memberSlugs.some((s) => claimedByNamed.has(s));
  });
  const autoSlugs = new Set<string>();
  for (const q of auto) {
    if (q.cluster) for (const s of q.cluster.memberSlugs) autoSlugs.add(s);
    else autoSlugs.add(q.slug);
  }

  // 3. Single-metro overrides: skip if covered by auto OR a named megaregion.
  const overrides: QualifyingMetro[] = [];
  for (const ov of _CONURBATION_OVERRIDES) {
    if (autoSlugs.has(ov.slug) || claimedByNamed.has(ov.slug)) continue;
    const meta = bySlug.get(ov.slug);
    if (!meta) continue;
    const score = meta.score;
    const tier = score >= 100 ? "A" : score >= 50 ? "B" : score >= 20 ? "C" : "D";
    overrides.push({
      slug: meta.slug, name: ov.displayName ?? meta.name, country: meta.country,
      countrySlug: meta.countrySlug, sovereignSlug: meta.sovereignSlug,
      rank: meta.rank, score: meta.score,
      contextValue: score, contextLabel: "Cluster score",
      tier,
      cluster: {
        id: `o-${meta.slug}`,
        size: ov.satellites.length,
        diameterKm: 0,
        populationSum: meta.pop ?? 0,
        otherSlugs: [],
        otherNames: ov.satellites,
        memberSlugs: [meta.slug],
        memberNames: ov.satellites,
        componentMetro: ov.displayName ? { slug: meta.slug, name: meta.name, rank: meta.rank } : undefined,
      },
    });
  }

  return [...namedRows, ...auto, ...overrides].sort((a, b) => b.contextValue - a.contextValue);
}
function computeIsolatedCapital() { return computeIsolatedCapitalRows(); }

// ---------- Tier registries ----------

const UNIVERSITY_TOWN_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Pure gravity well", description: "Universities contribute 80% or more of the composite. The university IS the city.", accentHex: "#7c3aed" },
  { slug: "B", name: "Tier B — University-defined", description: "Universities contribute 65 to 80% of the composite. The university is most of what the city is.", accentHex: "#7B68EE" },
  { slug: "C", name: "Tier C — University-anchored", description: "Universities contribute 50 to 65% of the composite. The university is the largest single contributor.", accentHex: "#4ECDC4" },
  { slug: "D", name: "Tier D — University-leading", description: "Universities contribute 40 to 50% of the composite. The university is the #1 dimension; the metro has a real second leg.", accentHex: "#82E0AA" },
];

const SKYLINE_CITY_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Skyline IS the city", description: "Skyscrapers contribute 80% or more of the composite. In most cases this is municipal-debt-driven vertical construction, not organic urban density.", accentHex: "#E74C3C" },
  { slug: "B", name: "Tier B — Skyline-defined", description: "Skyscrapers contribute 65 to 80% of the composite. The skyline is most of what the city is.", accentHex: "#FF8C42" },
  { slug: "C", name: "Tier C — Skyline-anchored", description: "Skyscrapers contribute 50 to 65% of the composite. The vertical buildup is the largest single contributor.", accentHex: "#F0B27A" },
  { slug: "D", name: "Tier D — Skyline-leading", description: "Skyscrapers contribute 40 to 50% of the composite. The skyline is the #1 dimension; the metro has a meaningful second leg.", accentHex: "#F7DC6F" },
];

const CLUSTER_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Global", description: "Cluster score of 100 or more, mirroring the Global Capital threshold for individual metros. The gravitationally heaviest conurbations on Earth: Pearl River Delta, New York, London, Jing-Jin-Ji, Paris, Tokyo, San Francisco-San Jose, Los Angeles, Seoul, Shanghai, Boston-Providence, Randstad, Toronto.", accentHex: "#7c3aed" },
  { slug: "B", name: "Tier B — Continental", description: "Cluster score between 50 and 100, mirroring the Continental Metro band. Substantial multi-metro networks that anchor a continent or region: Washington-Baltimore, Chicago, Flemish Diamond, Singapore-Johor Bahru-Batam, Zurich-Basel-Freiburg, Sydney-Wollongong, Osaka-Kyoto-Kobe, Moscow, Madrid, Houston, Istanbul.", accentHex: "#2563eb" },
  { slug: "C", name: "Tier C — Major", description: "Cluster score between 20 and 50, mirroring the Major Metro band. Regionally meaningful conurbations where multiple metros stack into a real network: Edinburgh-Central Scotland, Detroit-Windsor, Vienna-Bratislava, Florence-Pisa-Siena-Lucca, Bilbao-Bayonne, Helsinki, Cardiff-Bristol-Bath.", accentHex: "#0891b2" },
  { slug: "D", name: "Tier D — Regional", description: "Cluster score under 20, mirroring the Regional Hub and lower bands. The long tail of small-but-real conurbations that satisfy the distance rule without contributing major economic weight on their own.", accentHex: "#16a34a" },
];

const ISOLATED_CAPITAL_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Continental remoteness", description: "More than 800 km from the nearest tier-comparable metro. The next peer of similar weight is across a continent, an ocean, or both.", accentHex: "#92400E" },
  { slug: "B", name: "Tier B — Deeply isolated", description: "Between 500 and 800 km from the nearest tier-comparable metro. Reachable, never near. Many of these are deliberately inland or symbolic capitals.", accentHex: "#B45309" },
  { slug: "C", name: "Tier C — Isolated", description: "Between 240 and 500 km from the nearest tier-comparable metro. Beyond a day's commute but inside the regional sphere of a larger neighbor.", accentHex: "#D97706" },
];

const VELVET_ROCK_TIERS: BadgeTier[] = [
  { slug: "P", name: "Primary capital", description: "One of the three metros whose flagship rooms anchored the producer-driven recording economy of 1974 to 1989. Both tracking and mixing capacity, deep producer rosters, dense session-musician benches. Los Angeles, New York, London.", accentHex: "#c9a227" },
  { slug: "S", name: "Satellite", description: "Secondary node in the network: real flagship infrastructure but specialized, not full-spectrum. Bath/Somerset for residential country-house tracking, Philadelphia for American R&B and quiet-storm sessions, Stockholm for the Polar Studios fusion of American studio fidelity with Northern European production grammar.", accentHex: "#6e7a8a" },
  { slug: "I", name: "Offshore island branch", description: "Caribbean island studio operated as a deliberate offshore branch of the major-label system. Compass Point in Nassau (Chris Blackwell, 1977) and AIR Studios Montserrat at Salem (George Martin, 1979). Both metros' claim on the global cultural map during the window rests on a single building under non-recurring capital conditions.", accentHex: "#a72d68" },
];

// ---------- Badge registry ----------

// Format the per-row context value (population, market cap, score, distance,
// percentage, etc.) for each badge. Centralized here so any consumer that
// renders a qualifying-metros list (the /badges/[slug] page, the BadgeMap
// tooltip, future share cards) uses the same formatting rule. Any new
// badge added to BADGES below should add its formatting case here too.
export function formatContextValue(badgeSlug: string, value: number): string {
  if (badgeSlug === "university-town") return `${value.toFixed(0)}%`;
  if (badgeSlug === "skyline-city") return `${value.toFixed(0)}%`;
  if (badgeSlug === "megacity") return formatPop(value);
  if (badgeSlug === "finance-capital") {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
    return `$${value.toFixed(0)}`;
  }
  if (badgeSlug === "culture-capital" || badgeSlug === "sports-mecca") {
    return value.toFixed(0);
  }
  if (badgeSlug === "rail-hub" || badgeSlug === "global-gateway") {
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  }
  if (badgeSlug === "overperformer") {
    return `${value.toFixed(1)}x`;
  }
  if (badgeSlug === "conurbations") {
    return value.toFixed(1);
  }
  if (badgeSlug === "isolated-capital") {
    return `${value.toFixed(0)} km`;
  }
  if (badgeSlug === "frozen-conurbations") {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

export const BADGES: Badge[] = [
  {
    slug: "university-town", name: "University Town", emoji: "🎓",
    shortDesc: "Cities where one university dominates the score.",
    longDesc: "Metros where the universities dimension is the single largest contributor to the composite score. Includes the pure gravity wells (Uppsala, Leiden, Göttingen) where the university accounts for 80% or more, alongside the diversified university cities where the institution is the anchor without being the entirety. Drawn from the Academic Gravity Wells analysis.",
    methodologyAnchor: "#universities", status: "live", tiers: UNIVERSITY_TOWN_TIERS, compute: computeUniversityTown,
  },
  {
    slug: "skyline-city", name: "Skyline City", emoji: "🏙️",
    shortDesc: "Cities where skyscrapers dominate the entire score.",
    longDesc: "Metros where the skyscrapers dimension is the single largest contributor to the composite score. Some entries reflect organic vertical density (a finance or tourism economy that built upward to match its capital). Most reflect municipal-debt-driven vertical construction outpacing every other dimension of urban infrastructure: second- and third-tier Chinese cities, Gulf marble capitals, tower-tourism enclaves where the skyline is the city. Drawn from the 85% Illusion analysis.",
    methodologyAnchor: "#skyscrapers", status: "live", tiers: SKYLINE_CITY_TIERS, compute: computeSkylineCity,
  },
  {
    slug: "megacity", name: "Megacity", emoji: "🌆",
    shortDesc: "Metros above 5 million population.",
    longDesc: "The conventional 5-million-plus threshold for a megacity. Population alone does not produce score dominance in the composite ranking, but it does set the stage for every other dimension to compound. Sorted by metro population.",
    methodologyAnchor: "#population", status: "live", compute: computeMegacity,
  },
  {
    slug: "global-gateway", name: "Global Gateway", emoji: "✈️",
    shortDesc: "Metros with airport scores at or above the global-gateway floor.",
    longDesc: "Metros whose airport dimension clears 5.0, the floor that separates a continental gateway from a regional hub. The composite blends passenger traffic, intercontinental connectivity, and hub capacity. Sixty-two metros qualify, ranging from London and New York at the apex through the regional gateways that anchor a continent's air network. Below the threshold, airports are large enough to be regionally important but not the kind of node that defines the global air network.",
    methodologyAnchor: "#airport-score", status: "live", compute: computeGlobalGateway,
  },
  {
    slug: "finance-capital", name: "Finance Capital", emoji: "💼",
    shortDesc: "Metros where headquartered listed companies sum to $300 billion or more.",
    longDesc: "Metros where the public-equity market capitalization of headquartered companies clears $300 billion. The gravitational centers of global capital: San Francisco-San Jose at the top, then New York, Seattle, Beijing, Tokyo, London, Paris. Eighty-four metros qualify. Below the threshold a metro might host meaningful regional capital but not the kind of capital pool that anchors a global financial network.",
    methodologyAnchor: "#market-cap", status: "live", compute: computeFinanceCapital,
  },
  {
    slug: "culture-capital", name: "Culture Capital", emoji: "🎭",
    shortDesc: "Metros with deep cultural infrastructure (composite ≥ 30) plus regional top-3 representatives.",
    longDesc: "Metros whose combined cultural composite (cultural events, museums and landmarks, luxury hospitality) clears 30. London leads on every component; Paris and New York follow. The list also surfaces the unexpected (Macau, Dubai-Sharjah) where the cultural infrastructure is the product of recent and deliberate investment. To prevent the badge from over-rewarding wealthy regions, each of the 11 world regions also contributes its top three metros by culture score, even if those metros fall below the threshold. The result is roughly 90 entries, with the long tail capturing the editorially-strongest cultural metro in each region rather than only the global elite.",
    methodologyAnchor: "#cultural-events", status: "live", compute: computeCultureCapital,
  },
  {
    slug: "sports-mecca", name: "Sports Mecca", emoji: "🏟️",
    shortDesc: "Metros with a combined sports composite at or above the major-league-anchor floor.",
    longDesc: "Metros whose combined sports composite (major league teams weighted double, total professional teams across all leagues, major sporting events weighted triple) clears 40. Captures the cities where sport is part of the civic identity, from London at the top through the second-tier metros that punch above their weight on a single league. Fifty-three metros qualify. Below the threshold a metro might have a couple of teams but not the volume or marquee-event presence that defines a sports city.",
    methodologyAnchor: "#major-league-teams", status: "live", compute: computeSportsMecca,
  },
  {
    slug: "rail-hub", name: "Rail Hub", emoji: "🚆",
    shortDesc: "Metros with extensive rail infrastructure (composite ≥ 130).",
    longDesc: "Metros whose combined rail composite (metro stations, suburban stations weighted half, intercity train hubs weighted 5x for the network-effect value) clears 130. Tokyo leads at over a thousand composite points, followed by London, Shanghai, Guangzhou, Toronto, Osaka-Kyoto-Kobe, Rhine-Ruhr. Seventy-five metros qualify. Below the threshold a metro might have a single subway line or a stretch of commuter rail but not the layered network that defines a true rail hub.",
    methodologyAnchor: "#metro-stations", status: "live", compute: computeRailHub,
  },
  {
    slug: "overperformer", name: "Overperformer", emoji: "📈",
    shortDesc: "Score rank punches well above population rank.",
    longDesc: "Metros where the composite score sits much higher than the population rank: concentrated capital, talent, or institutional gravity that does not require scale. San Francisco-San Jose punches 17.6x above its weight, London 14.5x, New York 14.0x. The list also surfaces less-obvious overperformers like Monaco, Macau, Geneva, Edinburgh — cities where a small population supports an outsized footprint of capital, institutions, or both. Top 100 by pop-rank-to-score-rank multiple.",
    methodologyAnchor: "#population", status: "live", compute: computeOverperformer,
  },
  {
    slug: "conurbations", name: "Conurbations", emoji: "🔗",
    shortDesc: "Connected metro clusters and named megaregions, ranked by combined cluster score.",
    longDesc: "Conurbations are multi-metro networks ranked by the sum of composite scores across their members. Three layers feed the list. Named megaregions surface the canonical multi-city groupings the workbook can't form on its own (Pearl River Delta, Jing-Jin-Ji, Randstad, Flemish Diamond). Editorial overrides give each Global Capital, Continental Metro, and Major Metro that's structurally a conurbation its true civic name (Tri-State Area, Bay Area, Sudogwon, Île-de-France, Twin Cities, DFW Metroplex, Wasatch Front, Chukyo, Jabodetabek, Chang-Zhu-Tan, Research Triangle, Merseyside, and 40 others). Auto-clustered networks fill the long tail: connected components formed at a 75 km link distance, recursively split when a cluster exceeds its size-dependent average-pairwise ceiling so transitive chains can't masquerade as whole-country belts. Tiers mirror the individual metro scale exactly: Global (cluster score ≥100), Continental (50-100), Major (20-50), Regional (<20). The top of the list is Pearl River Delta at 188.5, Tri-State Area at 181.1, Greater London at 180.1, Jing-Jin-Ji at 144.3, Île-de-France at 142.6. The middle tier captures the canonical cross-border twins (Detroit-Windsor, San Diego-Tijuana, Vienna-Bratislava, Kinshasa-Brazzaville, Nice-Monaco) and tight regional networks (Florence-Pisa-Siena-Lucca, Hartford-New Haven-Springfield-New London, Prague-Pardubice-Liberec, Edinburgh-Central Scotland, the Caribbean Sint Maarten cluster, the upstate New York belt).",
    methodologyAnchor: "#population", status: "live", tiers: CLUSTER_TIERS, compute: computeConurbations,
  },
  {
    slug: "isolated-capital", name: "Isolated Capital", emoji: "🏔️",
    shortDesc: "National capitals more than 240 km from any metro in the same or higher score tier.",
    longDesc: "National capitals whose nearest peer in the same composite tier or higher sits more than 240 km away. The tier filter is the analytical pivot. A Local Metro village 30 km from a capital should not count against the badge; only metros at or above the capital's own tier do. The question the badge answers becomes who is your nearest peer of comparable weight, and how far is it.\n\nThree archetypes share the list. The geographically-isolated capitals are the obvious set: Reykjavík, Honiara, Papeete, Hamilton Bermuda, Avarua, Nuuk, Port Moresby, Ulan Bator, sitting on islands, peninsulas, or thin populations where the next Continental Metro is hundreds of kilometres of ocean or steppe away. The continental-gravity capitals are the more interesting set: Nairobi, Lima, Buenos Aires, Santiago, Mexico City, Cape Town, Dakar, Bogotá. These are countries so dominated by their capital that the next tier-comparable metro sits across an ocean or a sub-continent, not because the capital is geographically remote but because the country has only one true urban centre. The thin-peer-tier capitals round out the list: London, Paris, Tokyo, Beijing, Seoul, Moscow. The Global Capital tier has so few members worldwide that even London and Paris, 344 km apart across the Channel, both qualify because no other Global Capital is within 240 km of either. Tokyo's nearest is Seoul at 1,153 km. Beijing's is Seoul at 952 km. Moscow, sitting one tier down at Continental Metro, has Berlin 1,609 km away.\n\nSorted by distance descending, most-isolated first.",
    methodologyAnchor: "#population", status: "live", tiers: ISOLATED_CAPITAL_TIERS, compute: computeIsolatedCapital,
  },
  {
    slug: "greying-power", name: "Greying Power", emoji: "🕰️",
    shortDesc: "Cities once forged in steel, ships, or empire whose population has stopped growing.",
    longDesc: "Metros with deep historical and economic significance whose demographic curve has flattened or reversed. The post-industrial Great Lakes (Detroit, Cleveland, Pittsburgh, Buffalo). The legacy ports and shipbuilding cities of northern Europe (Liverpool, Newcastle, Glasgow, Marseille). The manufacturing capitals of Italy and Spain (Turin, Genoa, Bilbao). The legacy metros of Japan and Korea (Osaka-Kyoto-Kobe, Sapporo, Busan). Saint Petersburg, Athens, Wolfsburg. The badge surfaces the difference between a city that is declining and a city that has already declined and is now finding a second act. Inspired by the Oxford Economics Global Cities Index 2025 'Legacy Cities' archetype.",
    methodologyAnchor: "#population", status: "live", compute: computeGreyingPower,
  },
  {
    slug: "cosmopolitan-capital", name: "Cosmopolitan Capital", emoji: "🎟️",
    shortDesc: "Small metros with disproportionate cultural reach and migrant pull.",
    longDesc: "Metros with a population under roughly two million whose cultural-events footprint, museum and landmark density, and luxury-hospitality presence punch above their size. Edinburgh, Florence, Reykjavík, Lausanne, Bruges, Salzburg, Bath, Oxford, Cambridge, Bologna, Bordeaux, Sevilla, Granada, Wellington. The badge captures the paradox of being small enough to walk across in a morning and large enough to anchor a continent's cultural conversation. Distinct from the Culture Capital badge, which scores total cultural infrastructure regardless of size; this one scores cultural infrastructure relative to population. Inspired by the Oxford Economics Global Cities Index 2025 'Cultural Capitals' archetype.",
    methodologyAnchor: "#cultural-events", status: "live", compute: computeCosmopolitanCapital,
  },
  {
    slug: "emerging-standout", name: "Emerging Standout", emoji: "🌱",
    shortDesc: "Developing-world metros outperforming their countries on productivity and capital.",
    longDesc: "Metros in emerging economies that significantly outperform their respective national averages on income per person, productivity, and the capital they attract. Bengaluru, Hyderabad, Pune, Ho Chi Minh City, Hanoi, Cebu City, Davao City, Medellín, Tashkent, Almaty, Tbilisi. Distinct from megacity status: emerging standouts can be relatively small but are rising fast, and the badge highlights metros where the gap between the city and the country has widened over the past decade. Inspired by the Oxford Economics Global Cities Index 2025 'Emerging Standouts' archetype.",
    methodologyAnchor: "#gdp", status: "live", compute: computeEmergingStandout,
  },
  {
    slug: "frozen-conurbations", name: "Frozen Conurbations", emoji: "❄️",
    shortDesc: "Pairs of cities that should function as one urban system but have been severed by political geography or missing infrastructure.",
    longDesc: "Five cases where two cities sit close enough to share a labor market, an airshed, and a river basin, but operate as separate urban systems because of borders, walls, or missing bridges. Lahore and Amritsar were one Punjabi city for centuries before Partition severed them at the Wagah border in 1947. Nicosia and North Nicosia have been the only divided capital in Europe since 1974. Kinshasa and Brazzaville sit five kilometres apart across the Congo River and remain the only adjacent national capitals on Earth without a direct surface link. Detroit and Windsor share a regional economy that still moves a quarter of all US-Canada trade despite post-9/11 border friction. San Diego and Tijuana run a combined twenty-million-person labor market across one of the busiest borders in the world. The badge sits adjacent to the Conurbations and Twin Metros lenses but answers a different question: not which cities cluster, but which cities should cluster and do not.",
    methodologyAnchor: "#population", status: "live", compute: computeFrozenConurbations,
  },
  {
    slug: "velvet-rock-capital", name: "Velvet Rock Capital", emoji: "🎚️",
    shortDesc: "Metros that anchored the transatlantic producer-driven recording economy of 1974 to 1989.",
    longDesc: "Eight metros where the producer-driven adult-pop catalog of 1974 to 1989 was substantially made. Velvet Rock is a working term for the studio-luxury, mid-tempo, harmonically sophisticated music that yacht rock has flattened into a Southern California beach trope. The real frame is geographic. Three primary capitals (Los Angeles, New York, London) carried the network's tracking and mixing volume. Three satellites contributed specialized infrastructure: Bath and Somerset for the residential country-house studios (the Wool Hall, Ashcombe House), Philadelphia for American R&B and quiet storm at Sigma Sound, Stockholm for the Polar Studios fusion that becomes the late-1990s Cheiron pop factory. Two offshore island branches carried disproportionate weight: Compass Point in Nassau (Chris Blackwell, 1977) and AIR Studios Montserrat at Salem (George Martin, 1979). The window closes on September 17, 1989, when Hurricane Hugo destroys the Montserrat studio; the digital sampler, New Jack Swing, and the project-studio production model collectively dissolve the economic logic that funded the era within five years. The Velvet Rock Index scores each metro 0 to 100 across studio infrastructure, anchor records, producer and session-musician concentration, and capital disproportion (the degree to which the metro's claim rests on this one industry under specific conditions). Inspired by the long-running stylistic debate over yacht rock, sophisti-pop, and quiet storm as separate frames; resolved here as a single geographic phenomenon.",
    methodologyAnchor: "#velvet-rock", status: "live", tiers: VELVET_ROCK_TIERS, compute: computeVelvetRockCapital,
  },
];

// ---------- Public API with memoization ----------

export function getAllBadges(): Badge[] { return BADGES; }
export function getLiveBadges(): Badge[] { return BADGES.filter((b) => b.status === "live"); }
export function getBadge(slug: string): Badge | undefined { return BADGES.find((b) => b.slug === slug); }
export function getLiveBadgeSlugs(): string[] { return getLiveBadges().map((b) => b.slug); }

// Memoize each badge's compute() so repeated calls don't re-read CSVs and
// rebuild Maps. During a Vercel build with 4,284 metro page renders, this
// drops badge work from O(badges × metros²) to O(badges × metros).
const _qualifyingCache = new Map<string, QualifyingMetro[]>();

export function getQualifyingMetros(badge: Badge): QualifyingMetro[] {
  if (badge.status !== "live" || !badge.compute) return [];
  const cached = _qualifyingCache.get(badge.slug);
  if (cached) return cached;
  const list = badge.compute();
  _qualifyingCache.set(badge.slug, list);
  return list;
}

export type BadgeForMetro = { badge: Badge; qualifying: QualifyingMetro };

// Lazy-built inverted index: metroSlug -> BadgeForMetro[]. Built once on
// first call to getBadgesForMetro and reused for the rest of the process.
let _badgesByMetro: Map<string, BadgeForMetro[]> | null = null;

function buildBadgesByMetroIndex(): Map<string, BadgeForMetro[]> {
  const idx = new Map<string, BadgeForMetro[]>();
  for (const badge of getLiveBadges()) {
    if (!badge.compute) continue;
    const list = getQualifyingMetros(badge);
    for (const qualifying of list) {
      // For cluster entries, every member of the cluster gets a chip pointing
      // to this same lead-row entry. For non-cluster entries, only the entry
      // itself is indexed.
      const slugsToIndex = qualifying.cluster
        ? qualifying.cluster.memberSlugs
        : [qualifying.slug];
      for (const slug of slugsToIndex) {
        const arr = idx.get(slug);
        if (arr) arr.push({ badge, qualifying });
        else idx.set(slug, [{ badge, qualifying }]);
      }
    }
  }
  for (const arr of idx.values()) {
    arr.sort((a, b) => {
      // Conurbations is the marquee multi-metro lens; pin it first.
      if (a.badge.slug === "conurbations" && b.badge.slug !== "conurbations") return -1;
      if (b.badge.slug === "conurbations" && a.badge.slug !== "conurbations") return 1;
      const aTiered = a.badge.tiers ? 1 : 0;
      const bTiered = b.badge.tiers ? 1 : 0;
      return bTiered - aTiered;
    });
  }
  return idx;
}

export function getBadgesForMetro(metroSlug: string): BadgeForMetro[] {
  if (!_badgesByMetro) _badgesByMetro = buildBadgesByMetroIndex();
  return _badgesByMetro.get(metroSlug) ?? [];
}
