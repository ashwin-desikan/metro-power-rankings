// Primary brand colors for rugby union clubs' metro-card monogram circles.
// Hand-curated for clubs whose colors are unambiguous; anything absent gets
// the neutral fallback. Client-safe (pure data). Edit freely.

export type ClubColor = { bg: string; fg: string };

const RUGBY_COLORS: Record<string, ClubColor> = {
  // URC
  "Leinster": { bg: "#0050A0", fg: "#FFFFFF" },
  "Munster": { bg: "#C8102E", fg: "#FFFFFF" },
  "Ulster": { bg: "#BD1F2D", fg: "#FFFFFF" },
  "Connacht": { bg: "#00843D", fg: "#FFFFFF" },
  "Glasgow Warriors": { bg: "#1B365D", fg: "#FFFFFF" },
  "Edinburgh Rugby": { bg: "#000000", fg: "#D31145" },
  "Cardiff Rugby": { bg: "#0072CE", fg: "#000000" },
  "Scarlets": { bg: "#A41E34", fg: "#FFFFFF" },
  "Ospreys": { bg: "#000000", fg: "#FFFFFF" },
  "Dragons RFC": { bg: "#D50032", fg: "#FFD700" },
  "Benetton": { bg: "#00713D", fg: "#FFFFFF" },
  "Zebre Parma": { bg: "#000000", fg: "#FFFFFF" },
  "Bulls": { bg: "#0033A0", fg: "#87CEEB" },
  "Sharks": { bg: "#000000", fg: "#FFFFFF" },
  "Stormers": { bg: "#003DA5", fg: "#FFFFFF" },
  "Lions": { bg: "#C8102E", fg: "#FFFFFF" },
  // Top 14
  "Stade Toulousain": { bg: "#C8102E", fg: "#000000" },
  "Stade Rochelais": { bg: "#FFD700", fg: "#000000" },
  "RC Toulon": { bg: "#D50032", fg: "#000000" },
  "Stade Français Paris": { bg: "#E75480", fg: "#003DA5" },
  "Racing 92": { bg: "#87CEEB", fg: "#FFFFFF" },
  "ASM Clermont": { bg: "#FFD100", fg: "#003DA5" },
  "Union Bordeaux Bègles": { bg: "#722F37", fg: "#FFFFFF" },
  "Castres Olympique": { bg: "#1E5AA8", fg: "#FFFFFF" },
  "Montpellier HR": { bg: "#003DA5", fg: "#FFFFFF" },
  "Section Paloise": { bg: "#006A4E", fg: "#FFFFFF" },
  "Aviron Bayonnais": { bg: "#5BC2E7", fg: "#FFFFFF" },
  "USA Perpignan": { bg: "#C8102E", fg: "#FFD700" },
  "Lyon OU": { bg: "#000000", fg: "#D50032" },
  "US Montauban": { bg: "#00693E", fg: "#000000" },
  // Premiership
  "Leicester Tigers": { bg: "#00693E", fg: "#FFFFFF" },
  "Bath": { bg: "#003478", fg: "#FFFFFF" },
  "Saracens": { bg: "#000000", fg: "#D50032" },
  "Harlequins": { bg: "#4E2683", fg: "#FFFFFF" },
  "Exeter Chiefs": { bg: "#000000", fg: "#E3000F" },
  "Sale Sharks": { bg: "#1B365D", fg: "#FFFFFF" },
  "Gloucester": { bg: "#C8102E", fg: "#FFFFFF" },
  "Northampton Saints": { bg: "#00563F", fg: "#FFD700" },
  "Bristol Bears": { bg: "#002B5C", fg: "#FFFFFF" },
  "Newcastle Red Bulls": { bg: "#1E2A5A", fg: "#D50032" },
  // Super Rugby
  "Crusaders": { bg: "#C8102E", fg: "#000000" },
  "Blues": { bg: "#003DA5", fg: "#FFFFFF" },
  "Chiefs": { bg: "#D50032", fg: "#FFD100" },
  "Hurricanes": { bg: "#FFB81C", fg: "#000000" },
  "Highlanders (rugby union)": { bg: "#003DA5", fg: "#FFD100" },
  "Brumbies": { bg: "#1B365D", fg: "#FFFFFF" },
  "Reds": { bg: "#7A003C", fg: "#FFFFFF" },
  "Waratahs": { bg: "#5BC2E7", fg: "#FFFFFF" },
  "Force": { bg: "#1B365D", fg: "#00A3E0" },
  "Drua": { bg: "#00B2A9", fg: "#FFFFFF" },
  "Moana Pasifika": { bg: "#00B2A9", fg: "#002B5C" },
  // Currie Cup
  "Blue Bulls": { bg: "#0033A0", fg: "#87CEEB" },
  "Golden Lions": { bg: "#C8102E", fg: "#FFFFFF" },
  "Free State Cheetahs": { bg: "#F47C20", fg: "#FFFFFF" },
  "Western Province": { bg: "#003DA5", fg: "#FFFFFF" },
  "Stormers XXIII": { bg: "#003DA5", fg: "#FFFFFF" },
  "Griquas": { bg: "#00A3E0", fg: "#FFFFFF" },
  // Japan League One
  "Brave Lupus Tokyo": { bg: "#C8102E", fg: "#000000" },
  "Saitama Wild Knights": { bg: "#00529B", fg: "#FFFFFF" },
  "Tokyo Sungoliath": { bg: "#FDB913", fg: "#000000" },
  "Kobe Steelers": { bg: "#C8102E", fg: "#000000" },
  "Spears Funabashi": { bg: "#F47C20", fg: "#002B5C" },
};

const NEUTRAL: ClubColor = { bg: "rgba(85,85,106,0.45)", fg: "#FFFFFF" };

export function rugbyClubColor(name: string): ClubColor & { known: boolean } {
  const c = RUGBY_COLORS[name];
  return c ? { ...c, known: true } : { ...NEUTRAL, known: false };
}

export function rugbyMonogram(name: string): string {
  const words = name.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
