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

// Built once from the file produced by build-team-metadata.py. Keyed on a
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

export function getCrest(name: string): Crest | null {
  const direct = crests.get(norm(name));
  if (direct) return direct;
  // Women's college programs are stored as the men's school name + " (W)".
  // Reuse the men's crest when the women's program has no badge of its own.
  const menName = name.replace(/\s*\(w\)\s*$/i, "");
  if (menName !== name) return crests.get(norm(menName)) ?? null;
  return null;
}
