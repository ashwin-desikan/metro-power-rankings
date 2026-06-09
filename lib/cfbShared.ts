// Client-safe College Football types + helpers (no server-only / fs). Imported
// by both the server data layer (lib/cfb.ts) and the client components.

export type CfbTeam = {
  slug: string; name: string; conference: string | null; fbs_fcs: string | null; current_fbs: boolean;
  city: string | null; metro: string | null; metro_slug: string | null; state: string | null;
  color: string; color2: string;
  games: number; w: number; l: number; tie: number; pct: number;
  seasons: number; maj_seasons: number;
  conf_champ_app: number; maj_conf_champ: number; bowl_app: number; maj_bowl: number;
  playoff_app: number; nat_champ_count: number;
  weeks_ranked: number; weeks_at_1: number; final_ap1: number;
  nat_champ_years: number[]; conf_titles: number; heismans: number[];
};
export type CfbSeason = {
  year: number; school: string | null; w: number; l: number; t: number;
  conference: string | null; division: string | null;
  conf_w: number; conf_l: number; conf_t: number; champ_app: boolean; conf_champ: boolean;
  fin_ap: number | null; fin_coach: number | null; high_ap: number | null;
  bowl: string | null; bowl_res: string | null; major_bowl: boolean; playoff: boolean;
  nat_champ: boolean; heisman: boolean;
};
export type CfbGame = {
  season: number; date: string | null; team: string; opp: string; team_slug: string; opp_slug: string;
  rank: number | null; opp_rank: number | null; pf: number; pa: number; ot: string | null;
  bowl_name: string | null; conf_game: boolean; conf_champ: boolean; nat_champ: boolean; major_bowl: boolean; playoff: boolean; rivalry: boolean;
  stadium: string | null; metro: string | null; state: string | null; video: string | null; gs: number;
};
export type CfbAward = { year: number; award: string; player: string | null; pos: string | null };
export type CfbRivalry = { rivalry: string | null; rival: string; rival_slug: string };

export function cfbMonogram(name: string): string {
  const w = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return (w.length >= 2 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
}
// Deterministic per-team color (no official palette in the source).
export function cfbColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 58%, 52%)`;
}
