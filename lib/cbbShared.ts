// Client-safe Men's College Basketball types + helpers (no server-only / fs).
// Imported by both the server data layer (lib/cbb.ts) and client components.

export type CbbTeam = {
  slug: string; name: string; conference: string | null; current_d1: boolean;
  city: string | null; metro: string | null; metro_slug: string | null; state: string | null;
  lat: number | null; long: number | null; region: string | null;
  color: string; color2: string;
  games: number; w: number; l: number; pct: number; seasons: number;
  tour_app: number; seed1: number; top4_seed: number;
  sweet16: number; elite8: number; final4: number; champ_app: number;
  titles: number; other_titles: number; tour_w: number; tour_l: number;
  nit_app: number; nit_sf: number; nit_titles: number;
  weeks_ranked: number; weeks_t5: number; weeks_at_1: number;
  last_year: number; last_app: number; last_title: number;
  all_americans: number; nba_first_round: number; best15: number | null; title_years: number[];
};
export type CbbSeason = {
  year: number; school: string | null; w: number; l: number;
  conference: string | null; conf_w: number; conf_l: number;
  ap_high: number | null; ap_final: number | null; srs_rank: number | null;
  reg_champ: boolean; conf_tour_champ: boolean;
  ncaa: boolean; seed: number | null; t_w: number; t_l: number;
  sweet16: boolean; elite8: boolean; final4: boolean; champ_app: boolean; champ: boolean;
  nit: boolean; rank15: number | null; vacated: boolean;
};
export type CbbGame = {
  season: number; date: string | null; round: string | null; team: string; opp: string;
  team_slug: string; opp_slug: string; rank: number | null; opp_rank: number | null;
  pf: number; pa: number; ot: string | null;
  arena: string | null; metro: string | null; state: string | null; gs: number;
};
export type CbbAward = { year: number; player: string | null };
export type CbbNba = { year: number; player: string | null; draft_year: number | null };

export function cbbMonogram(name: string): string {
  const w = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return (w.length >= 2 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
}
// Deterministic per-team color (no official palette in the source).
export function cbbColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 58%, 52%)`;
}
