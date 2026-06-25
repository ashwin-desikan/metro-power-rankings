// F1 constructor name -> self-hosted crest key. Live ESPN standings use short
// names ("Alpine", "Haas", "RB", "Kick Sauber") while the crests are keyed to
// the canonical names the F1 data uses ("Alpine F1 Team", "Audi", ...). This
// bridges the two for the name-keyed crest lookup only; display names are left
// untouched. Pure + client-safe (no fs).
const F1_CONSTRUCTOR_CREST: Record<string, string> = {
  "alpine": "Alpine F1 Team",
  "bwt alpine": "Alpine F1 Team",
  "haas": "Haas F1 Team",
  "moneygram haas": "Haas F1 Team",
  "rb": "RB F1 Team",
  "racing bulls": "RB F1 Team",
  "visa cash app rb": "RB F1 Team",
  "red bull racing": "Red Bull",
  "oracle red bull racing": "Red Bull",
  "cadillac": "Cadillac F1 Team",
  "sauber": "Audi",
  "kick sauber": "Audi",
  "stake f1 team kick sauber": "Audi",
  "aston martin aramco": "Aston Martin",
};

function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Returns the crest-key name for a constructor; identity for names that already
// match a crest key.
export function f1ConstructorCrestName(name: string | null | undefined): string {
  if (!name) return "";
  return F1_CONSTRUCTOR_CREST[norm(name)] ?? name;
}
