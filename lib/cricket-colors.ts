// Primary brand colors for T20 cricket franchises' metro-card monogram
// circles. Hand-curated where unambiguous; absent clubs get the neutral
// fallback. Client-safe (pure data). Edit freely.

export type ClubColor = { bg: string; fg: string };

const CRICKET_COLORS: Record<string, ClubColor> = {
  // IPL
  "Mumbai Indians": { bg: "#004BA0", fg: "#D1AB3E" },
  "Chennai Super Kings": { bg: "#FDB913", fg: "#1C3FA0" },
  "Royal Challengers Bengaluru": { bg: "#DA1818", fg: "#000000" },
  "Kolkata Knight Riders": { bg: "#3A225D", fg: "#D1AB3E" },
  "Sunrisers Hyderabad": { bg: "#F26522", fg: "#000000" },
  "Rajasthan Royals": { bg: "#EA1A85", fg: "#254AA5" },
  "Delhi Capitals": { bg: "#282968", fg: "#D71920" },
  "Punjab Kings": { bg: "#DD1F2D", fg: "#FFFFFF" },
  "Gujarat Titans": { bg: "#1C2C5B", fg: "#D1AB3E" },
  "Lucknow Super Giants": { bg: "#00B7EB", fg: "#1C2C5B" },
  // Big Bash League
  "Perth Scorchers": { bg: "#F26522", fg: "#000000" },
  "Sydney Sixers": { bg: "#E0218A", fg: "#000000" },
  "Melbourne Stars": { bg: "#00A651", fg: "#FFFFFF" },
  "Melbourne Renegades": { bg: "#D71920", fg: "#000000" },
  "Brisbane Heat": { bg: "#00B2A9", fg: "#FF1493" },
  "Adelaide Strikers": { bg: "#0072CE", fg: "#FFFFFF" },
  "Sydney Thunder": { bg: "#9ACD32", fg: "#000000" },
  "Hobart Hurricanes": { bg: "#4E2683", fg: "#FFFFFF" },
  // PSL (confident subset)
  "Karachi Kings": { bg: "#0072CE", fg: "#FFFFFF" },
  "Lahore Qalandars": { bg: "#00693E", fg: "#D1AB3E" },
  "Islamabad United": { bg: "#D71920", fg: "#FFD700" },
  "Quetta Gladiators": { bg: "#4E2683", fg: "#FFD700" },
  "Peshawar Zalmi": { bg: "#FDB913", fg: "#000000" },
  "Multan Sultans": { bg: "#00B2A9", fg: "#FFFFFF" },
  // CPL
  "Trinbago Knight Riders": { bg: "#3A225D", fg: "#D1AB3E" },
  "Guyana Amazon Warriors": { bg: "#00693E", fg: "#FFD700" },
  "Barbados Royals": { bg: "#EA1A85", fg: "#254AA5" },
  "Saint Lucia Kings": { bg: "#0072CE", fg: "#FFD700" },
  "St Kitts & Nevis Patriots": { bg: "#D71920", fg: "#FFFFFF" },
  "Antigua & Barbuda Falcons": { bg: "#000000", fg: "#FFD700" },
  // The Hundred (current brands)
  "MI London": { bg: "#004BA0", fg: "#D1AB3E" },
  "Southern Brave": { bg: "#000000", fg: "#00B7EB" },
  "Trent Rockets": { bg: "#00B2A9", fg: "#000000" },
  "Birmingham Phoenix": { bg: "#000000", fg: "#F26522" },
  "London Spirit": { bg: "#1B365D", fg: "#FFFFFF" },
  "Welsh Fire": { bg: "#D71920", fg: "#FFFFFF" },
  // SA20
  "MI Cape Town": { bg: "#004BA0", fg: "#D1AB3E" },
  "Sunrisers Eastern Cape": { bg: "#F26522", fg: "#000000" },
  "Joburg Super Kings": { bg: "#FDB913", fg: "#1C3FA0" },
  "Paarl Royals": { bg: "#EA1A85", fg: "#254AA5" },
  "Durban's Super Giants": { bg: "#00B7EB", fg: "#1C2C5B" },
  "Pretoria Capitals": { bg: "#282968", fg: "#FFFFFF" },
};

const NEUTRAL: ClubColor = { bg: "rgba(85,85,106,0.45)", fg: "#FFFFFF" };

export function cricketClubColor(name: string): ClubColor & { known: boolean } {
  const c = CRICKET_COLORS[name];
  return c ? { ...c, known: true } : { ...NEUTRAL, known: false };
}
