// Primary brand colors for EuroLeague clubs' metro-card monogram circles.
// Hand-curated for clubs whose colors are unambiguous; anything absent is
// reported as not-known so the caller can skip the circle. Client-safe (pure
// data). Keys are the canonical club names used in euroleague.json.

export type ClubColor = { bg: string; fg: string };

const EL_COLORS: Record<string, ClubColor> = {
  "Real Madrid Baloncesto": { bg: "#00529F", fg: "#FFFFFF" },
  "FC Barcelona Basquet": { bg: "#004D98", fg: "#A50044" },
  "Panathinaikos BC": { bg: "#006B3F", fg: "#FFFFFF" },
  "Olympiacos BC": { bg: "#C8102E", fg: "#FFFFFF" },
  "PBC CSKA Moscow": { bg: "#C8102E", fg: "#003DA5" },
  "Maccabi Tel Aviv BC": { bg: "#FFD700", fg: "#0033A0" },
  "Olimpia Milano": { bg: "#C8102E", fg: "#FFFFFF" },
  "Virtus Bologna": { bg: "#000000", fg: "#FFFFFF" },
  "Anadolu Efes": { bg: "#0A1A3F", fg: "#FFFFFF" },
  "Fenerbahçe Basketball": { bg: "#0A2240", fg: "#FFED00" },
  "BC Žalgiris": { bg: "#00843D", fg: "#FFFFFF" },
  "Saski Baskonia": { bg: "#003DA5", fg: "#FFFFFF" },
  "Valencia Basket": { bg: "#FF6F00", fg: "#000000" },
  "AS Monaco Basket": { bg: "#E2001A", fg: "#FFFFFF" },
  "ASVEL Basket": { bg: "#00843D", fg: "#FFFFFF" },
  "KK Partizan": { bg: "#000000", fg: "#FFFFFF" },
  "KK Crvena zvezda": { bg: "#ED1C24", fg: "#FFFFFF" },
  "KK Cibona": { bg: "#0033A0", fg: "#FFFFFF" },
  "Joventut Badalona": { bg: "#1A7A3D", fg: "#000000" },
  "FC Bayern München Basketball": { bg: "#DC052D", fg: "#FFFFFF" },
  "Hapoel Tel Aviv BC": { bg: "#E2001A", fg: "#FFFFFF" },
  "Pallacanestro Varese": { bg: "#C8102E", fg: "#FFFFFF" },
  "Aris BC": { bg: "#FFD200", fg: "#000000" },
  "Benetton Treviso": { bg: "#00843D", fg: "#FFFFFF" },
  "Paris Basketball": { bg: "#000000", fg: "#FFFFFF" },
};

const NEUTRAL: ClubColor = { bg: "rgba(85,85,106,0.45)", fg: "#FFFFFF" };

export function euroleagueClubColor(name: string): ClubColor & { known: boolean } {
  const c = EL_COLORS[name];
  return c ? { ...c, known: true } : { ...NEUTRAL, known: false };
}

export function euroleagueMonogram(name: string): string {
  const cleaned = name
    .replace(/\b(BC|KK|FC|PBC|AS|CSP|ASK)\b/g, " ")
    .replace(/\(.*?\)/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase() || name.slice(0, 2).toUpperCase();
}
