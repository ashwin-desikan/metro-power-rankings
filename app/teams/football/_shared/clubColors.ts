// Single source of truth for football club/country colours across the season hubs.
// Used by SeasonTrends (Club power ranking + Country race) and SeasonSuperlatives, so the two
// surfaces always agree on a club's identity colour. Tuned for the dark surface; the categorical
// fallback is CVD-checked and deterministic per club name, so a club without a brand colour still
// gets a stable, distinct hue (not grey) wherever it appears.

export const COUNTRY_COLOR: Record<string, string> = {
  England: "#3987e5", Spain: "#e66767", Italy: "#199e70", Germany: "#c98500",
  France: "#9085e9", Portugal: "#d55181", Netherlands: "#d95926", Russia: "#8888A0",
  Scotland: "#6f7ec6", Belgium: "#d98a2b", Greece: "#3aa6c9", Ukraine: "#e0b13a",
  Turkey: "#e0503a",
};

// Club primary (brand) colours, adjusted for the dark surface. Where brands collide (the many
// reds), the direct labels and hover-isolation carry identity.
export const CLUB_COLOR: Record<string, string> = {
  "Real Madrid": "#E6E6EC", "FC Barcelona": "#C4194F", "Bayern Munich": "#E8253F",
  "Paris Saint-Germain": "#3A78C0", "Manchester City": "#6CABDD", "Liverpool": "#E23048",
  "Juventus": "#C9C9D2", "Atlético de Madrid": "#E0463A", "Chelsea": "#2A6FC9",
  "Arsenal": "#F03A46", "Internazionale": "#1E90D8", "SSC Napoli": "#29B3E6",
  "Bayer Leverkusen": "#EE4A44", "Manchester United": "#E83A44", "Aston Villa": "#A83A63",
  "Borussia Dortmund": "#F5D400", "Sevilla FC": "#E84A50", "Benfica": "#E83A3A",
  "FC Porto": "#2E6BE0", "Atalanta": "#2E88D0", "AS Roma": "#C24354", "Ajax": "#E63A50",
  "RB Leipzig": "#E83A66", "Tottenham Hotspur": "#6E7CB0", "Villarreal": "#EDD24D",
  "AS Monaco": "#EE4A4F", "Sporting Clube de Portugal": "#16A06E", "FC Shakhtar Donetsk": "#F79A3A",
  "PSV Eindhoven": "#F04A50", "AC Milan": "#ED3236", "Eintracht Frankfurt": "#E8404A",
  "Olympique Lyonnais": "#2C6BD6", "Lazio": "#7BC7EE", "Valencia": "#F08A1E",
  "FC Schalke 04": "#2E6BC0", "FC Red Bull Salzburg": "#E84048", "Zenit St. Petersburg": "#2E9AD6",
  // Historic sides that headline the 1990s hubs, so the deep-history seasons aren't all grey.
  "Sampdoria": "#2A5CAA", "Parma": "#EFC135", "Olympique Marseille": "#2CA7DE",
  "Werder Bremen": "#159A5B", "RSC Anderlecht": "#8A5CC0", "Dynamo Kyiv": "#2E6FC9",
  "FC Spartak Moscow": "#D33A34", "Panathinaikos": "#1E8A4C", "Feyenoord": "#E0503A",
  "Rangers": "#1D5BB5", "AJ Auxerre": "#3F86D8", "FC Girondins de Bordeaux": "#2350A0",
  "Real Zaragoza": "#B0233A", "Olympiakos CFP": "#D8352A", "Deportivo de La Coruña": "#3A78C0",
};

export const MUTED = "#55556A";

// Distinct, dark-surface-legible categorical palette for clubs without a brand colour. Assigned by
// a stable hash of the club name, so a given club always draws in the same fallback hue regardless
// of what else is on the chart or the order it appears.
export const CATEGORICAL: string[] = [
  "#3987e5", "#e66767", "#199e70", "#c98500", "#9085e9", "#d55181",
  "#d95926", "#37a3c9", "#b98bd8", "#5bbf9a", "#e0b13a", "#7f8fd0",
];

function hashIndex(name: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % mod;
}

// A club's identity colour: its brand colour if we have one, else a stable categorical hue.
export function colorForClub(name: string): string {
  return CLUB_COLOR[name] ?? CATEGORICAL[hashIndex(name, CATEGORICAL.length)];
}
