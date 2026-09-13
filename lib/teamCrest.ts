import metadata from "../public/data/sports/team-metadata.json";

type Crest = { src: string; alt: string };

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/^afc\s+/, "")
    .replace(/\s+fc$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Built once from the file produced by scripts/sports/build_team_metadata.py. Keyed on a
// normalized name so "AFC Bournemouth" matches "Bournemouth", etc. Static import
// (not node:fs) so this is safe in client components as well as server ones.
const crests: Map<string, Crest> = (() => {
  const m = new Map<string, Crest>();
  const teams =
    (metadata as { teams?: Record<string, { badge?: string | null }> }).teams ?? {};
  for (const [name, t] of Object.entries(teams)) {
    if (t && t.badge) m.set(norm(name), { src: t.badge, alt: name + " crest" });
  }
  return m;
})();

// api-football names women's clubs as a short men's name plus a bare " W"
// ("Arsenal W", "Barcelona W"), while team-metadata.json holds each women's
// club under its own name ("Arsenal Women", "FC Barcelona Femeni"). Nothing
// mechanical bridges the two: the suffix differs by country, several clubs use
// a different base word ("Athletic Club W" against "Athletic Bilbao Femenino"),
// one carries no suffix at all ("Granada"), and Chicago Red Stars has since
// been renamed Chicago Stars FC.
//
// A bare-name fallback is deliberately NOT used. Stripping " W" and retrying
// would resolve "Barcelona W" to the MEN'S Barcelona crest, which is wrong even
// where the two clubs happen to share artwork. The map is explicit so that a
// club with no women's badge renders its monogram instead of the men's crest.
// lib/teamCrest.test.ts asserts every target below exists.
const WOMENS_ALIASES: Record<string, string> = {
  // FA WSL
  "Arsenal W": "Arsenal Women",
  "Aston Villa W": "Aston Villa Women",
  "Birmingham City W": "Birmingham City Women",
  "Brighton W": "Brighton & Hove Albion Women",
  "Charlton Athletic W": "Charlton Athletic Women",
  "Chelsea W": "Chelsea Women",
  "Crystal Palace W": "Crystal Palace Women",
  "Everton W": "Everton Women",
  "Leicester City W": "Leicester City Women",
  "Liverpool W": "Liverpool Women",
  "London City Lionesses W": "London City Lionesses",
  "Manchester City W": "Manchester City Women",
  "Manchester United W": "Manchester United Women",
  "Tottenham Hotspur W": "Tottenham Hotspur Women",
  "West Ham W": "West Ham United Women",
  // NWSL
  "Angel City W": "Angel City FC",
  "Bay FC W": "Bay FC",
  "Boston Legacy W": "Boston Legacy FC",
  "Chicago Red Stars W": "Chicago Stars FC",
  "Denver Summit W": "Denver Summit FC",
  "Houston Dash W": "Houston Dash",
  "Kansas City W": "Kansas City Current",
  "NJ/NY Gotham FC W": "NJ/NY Gotham FC",
  "North Carolina Courage W": "North Carolina Courage",
  "Orlando Pride W": "Orlando Pride",
  "Portland Thorns W": "Portland Thorns FC",
  "Racing Louisville W": "Racing Louisville FC",
  "San Diego Wave W": "San Diego Wave FC",
  "Seattle Reign FC W": "Seattle Reign FC",
  "Utah Royals W": "Utah Royals",
  "Washington Spirit W": "Washington Spirit",
  // Liga F
  "Athletic Club W": "Athletic Bilbao Femenino",
  "Atletico Madrid W": "Atlético de Madrid Femenino",
  "Barcelona W": "FC Barcelona Femeni",
  "Deportivo Alavés W": "Deportivo Alavés Gloriosas",
  "Deportivo de La Coruña W": "Deportivo de La Coruña Femenino",
  "Edf Logrono W": "DUX Logroño",
  "Eibar W": "SD Eibar Femenino",
  "Espanyol W": "RCD Espanyol Femeni",
  "FC Levante Badalona W": "Levante Badalona",
  "Granad. Tenerife W": "CD Tenerife Femenino",
  Granada: "Granada CF Femenino",
  "Levante W": "Levante UD Femenino",
  "Madrid CFF W": "Madrid CFF",
  "Real Madrid W": "Real Madrid Femenino",
  "Real Sociedad W": "Real Sociedad Femenino",
  "Sevilla W": "Sevilla FC Femenino",
  "Valencia W": "Valencia CF Femenino",
};

// Normalized once so lookups cost the same as the direct map.
const womensAliases: Map<string, string> = new Map(
  Object.entries(WOMENS_ALIASES).map(([from, to]) => [norm(from), norm(to)]),
);

export function getCrest(name: string): Crest | null {
  const direct = crests.get(norm(name));
  if (direct) return direct;
  const alias = womensAliases.get(norm(name));
  if (alias) {
    const viaAlias = crests.get(alias);
    if (viaAlias) return viaAlias;
  }
  // Women's college programs are stored as the men's school name + " (W)".
  // Reuse the men's crest when the women's program has no badge of its own.
  const menName = name.replace(/\s*\(w\)\s*$/i, "");
  if (menName !== name) return crests.get(norm(menName)) ?? null;
  return null;
}

// Exported for the test, which asserts every alias target resolves to a badge.
export const _womensAliasTargets = Object.values(WOMENS_ALIASES);
