/**
 * Football club identity resolver.
 *
 * One club, one Lookup row, many spellings and provider ids. Every scraper that used to carry its own
 * name map (ESPN standings, UEFA coefficients, api-football, ClubElo, FotMob) resolves through here
 * instead: (provider, key[, country]) -> the workbook Lookup row and its Reep v1 id.
 *
 * Backed by public.football_team_reep (one row per Lookup row, sheet_row = Excel row) and
 * public.football_identity_alias (flat provider/key index), both built by scripts/reep/ from the Reep
 * Register v1 crosswalk and refreshed with load_bridge.py + refresh_football_identity_alias().
 *
 * Rules (Ashwin, 2026-09-22):
 *  - exact after normalisation, never fuzzy; ambiguity is returned, never scored away
 *  - workbook columns outrank Reep labels, which outrank Reep community aliases
 *  - the workbook's own api-football ids outrank Reep's api_football bridge
 *  - the workbook's names are the canon; Reep ids and provider ids are keys
 */

const SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM";

export type IdentityProvider =
  | "name"
  | "espn"
  | "uefa"
  | "api_football"
  | "clubelo"
  | "fotmob"
  | "sportmonks"
  | "opta"
  | "transfermarkt"
  | "worldfootball"
  | "fifa"
  | "wikidata"
  | "reep";

export interface TeamIdentity {
  /** Excel row in Champions League-201516.xlsx 'Lookup' (and football_team_reep.sheet_row). */
  sheetRow: number;
  /** The workbook's canonical name. */
  team: string;
  country: string;
  reepV1Id: string | null;
  /** public.football_lookup.id when the (country, team) pair is unique there. */
  lookupId: number | null;
  /** The alias or id that matched. */
  matchedKey: string;
  /** 'workbook:<column>', 'reep:label', 'reep:alias', or a Reep bridge rung for provider ids. */
  rung: string;
}

export type Resolution =
  | { status: "resolved"; team: TeamIdentity }
  | { status: "ambiguous"; candidates: TeamIdentity[] }
  | { status: "unknown" };

/**
 * The same normalisation as scripts/reep/reep_join_clubs.py strict_norm and the SQL
 * public.football_name_norm: initialism dots removed (S.S.C. -> SSC), letters NFKD cannot decompose
 * transliterated (ł ø đ ß æ ð þ), unaccented, lower-cased, everything non-alphanumeric to one space.
 */
export function normaliseTeamName(s: string): string {
  const translit: Record<string, string> = {
    ł: "l", Ł: "L", ø: "o", Ø: "O", đ: "d", Đ: "D", ß: "ss", æ: "ae", Æ: "Ae", œ: "oe", Œ: "Oe",
    ð: "d", Ð: "D", þ: "th", Þ: "Th", ı: "i", ħ: "h", Ħ: "H",
  };
  return (s ?? "")
    .replace(/\b(?:[A-Za-z]\.){2,}/g, (m) => m.replace(/\./g, ""))
    .replace(/[łŁøØđĐßæÆœŒðÐþÞıħĦ]/g, (c) => translit[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function rankRung(rung: string): number {
  if (rung.startsWith("workbook:")) return 0;
  if (rung === "reep:label" || rung === "reep v1" || rung === "reep v0") return 1;
  if (rung === "corroborated-mint" || rung === "first-party") return 1;
  return 2; // reep:alias, name-nationality, footprint, unranked
}

function toIdentity(r: Record<string, unknown>): TeamIdentity {
  return {
    sheetRow: Number(r.sheet_row),
    team: String(r.team),
    country: String(r.country),
    reepV1Id: (r.reep_v1_id as string | null) ?? null,
    lookupId: r.lookup_id == null ? null : Number(r.lookup_id),
    matchedKey: String(r.matched_key ?? r.key ?? ""),
    rung: String(r.rung ?? ""),
  };
}

/** Collapse hits to a resolution: a single workbook-sourced hit wins over alias-only hits. */
function decide(hits: TeamIdentity[]): Resolution {
  if (hits.length === 0) return { status: "unknown" };
  if (hits.length === 1) return { status: "resolved", team: hits[0] };
  const best = Math.min(...hits.map((h) => rankRung(h.rung)));
  const top = hits.filter((h) => rankRung(h.rung) === best);
  if (top.length === 1) return { status: "resolved", team: top[0] };
  return { status: "ambiguous", candidates: hits };
}

async function rest(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`teamIdentity: ${path} -> HTTP ${res.status}`);
  return res.json();
}

/**
 * Resolve one key. Round-trips to the database; for a whole standings table use loadIdentityIndex().
 *
 *   await resolveTeam("espn", "111")                       -> Juventus, row 4282
 *   await resolveTeam("name", "OB Odense")                 -> Odense BK (matched the workbook's UEFA Name)
 *   await resolveTeam("name", "Juventus")                  -> ambiguous (Italy, and the Swiss club via a Reep alias)
 *   await resolveTeam("name", "Juventus", "Italy")         -> resolved
 */
export async function resolveTeam(provider: IdentityProvider, key: string, country?: string): Promise<Resolution> {
  const rows = (await rest("rpc/resolve_football_team", {
    method: "POST",
    body: JSON.stringify({ p_provider: provider, p_key: key, p_country: country ?? null }),
  })) as Record<string, unknown>[];
  return decide(rows.map(toIdentity));
}

export interface IdentityIndex {
  provider: IdentityProvider;
  /** Resolve without a network call. */
  resolve(key: string, country?: string): Resolution;
  size: number;
}

/**
 * Load every alias for one provider once (a few thousand rows) and resolve in memory. This is what a
 * scraper should use: build the index, then resolve every team in the feed.
 */
export async function loadIdentityIndex(provider: IdentityProvider): Promise<IdentityIndex> {
  const byNorm = new Map<string, TeamIdentity[]>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const rows = (await rest(
      `football_identity_alias?provider=eq.${encodeURIComponent(provider)}` +
        `&select=key,key_norm,sheet_row,reep_v1_id,country,rung,football_team_reep(team,lookup_id)` +
        `&order=id.asc&offset=${from}&limit=${page}`,
    )) as Record<string, unknown>[];
    for (const r of rows) {
      const nested = (r.football_team_reep ?? {}) as Record<string, unknown>;
      const id = toIdentity({ ...r, team: nested.team, lookup_id: nested.lookup_id, matched_key: r.key });
      const list = byNorm.get(String(r.key_norm)) ?? [];
      list.push(id);
      byNorm.set(String(r.key_norm), list);
    }
    if (rows.length < page) break;
  }
  let size = 0;
  for (const v of byNorm.values()) size += v.length;
  return {
    provider,
    size,
    resolve(key: string, country?: string): Resolution {
      const hits = (byNorm.get(normaliseTeamName(key)) ?? []).filter((h) => !country || h.country === country);
      // one Lookup row can be reached through several spellings; count rows, not aliases
      const perRow = new Map<number, TeamIdentity>();
      for (const h of hits) {
        const prev = perRow.get(h.sheetRow);
        if (!prev || rankRung(h.rung) < rankRung(prev.rung)) perRow.set(h.sheetRow, h);
      }
      return decide([...perRow.values()]);
    },
  };
}
