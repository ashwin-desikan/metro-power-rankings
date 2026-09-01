import "server-only";

// Live EuroLeague standings.
//
// SOURCE: EuroLeague's own feed, api-live.euroleague.net. First-party, open,
// no key. Two endpoints matter:
//   /v1/standings?seasonCode=E2026&gameNumber=N  -> the table (XML)
//   /v2/competitions/E/seasons/E2026/clubs       -> club codes (JSON)
// Verified live 2026-09-01; see project memory
// `standings-six-comps-sources-2026-09-01` for the probe evidence.
//
// WHY gameNumber=99. The v1 endpoint requires a round number, which looks
// like it needs current-round discovery. It does not: the endpoint CLAMPS.
// Measured 2026-09-01 -- E2025 at gameNumber 34 returned the round-34 table,
// at 38 the final table, and at 40 and 99 the same final table; E2026 at 1,
// 38 and 99 all returned the 20 provisioned clubs on zero games. So one call
// with a round past the end of the schedule always returns the CURRENT table,
// and no second request is needed. Do not "fix" this into a discovery loop.
//
// WHY THE CODE IS THE KEY. EuroLeague club codes (MAD, BAR, ULK, OLY) are
// three letters, unique, and stable across seasons and sponsor rebrands --
// the feed name for Fenerbahce is "Fenerbahce Tarfin Istanbul" this season
// and will be something else next season. Mapping on the code makes the
// crosswalk permanent; mapping on the name would break every time a title
// sponsor changed. Crosswalk built and audited 2026-09-01 at 20/20.
//
// XML, not JSON, on the standings path. The payload is small, flat and
// machine-generated, so it is parsed with scoped regexes rather than pulling
// in an XML dependency for one endpoint. The v2 JSON API has no standings
// path (checked 2026-09-01: /v2/standings 405s, /v3 400s).
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

export type EuroleagueRow = {
  code: string;
  feed_name: string;
  /** Team List canonical club name; null when the club is not on the list. */
  team: string | null;
  /** What the board prints. */
  display: string;
  metro_slug: string | null;
  rank: number | null;
  played: number;
  won: number;
  lost: number;
  pf: number;
  pa: number;
  pd: number;
};

export type EuroleagueStandings = {
  season_code: string;
  /** e.g. "2026-27", derived from the season code. */
  season_label: string;
  group_label: string;
  rows: EuroleagueRow[];
  fetched_at: string;
};

/** 20 clubs, 38 regular-season rounds (double round robin). */
export const EUROLEAGUE_FULL_SEASON = 38;

// EuroLeague club code -> Team List club. See "WHY THE CODE IS THE KEY".
const CROSSWALK: Record<string, { team: string; metro: string | null }> = {
  "ASV": { team: "ASVEL Basket", metro: "lyon" },
  "IST": { team: "Anadolu Efes", metro: "istanbul" },
  "ZAL": { team: "BC Žalgiris", metro: "kaunas" },
  "BES": { team: "Beşiktaş Basketbol", metro: "istanbul" },
  "DUB": { team: "Dubai Basketball", metro: "dubai-sharjah" },
  "BAR": { team: "FC Barcelona Basquet", metro: "barcelona" },
  "MUN": { team: "FC Bayern München Basketball", metro: "munich" },
  "ULK": { team: "Fenerbahçe Basketball", metro: "istanbul" },
  "HTA": { team: "Hapoel Tel Aviv BC", metro: "tel-aviv" },
  "RED": { team: "KK Crvena zvezda", metro: "belgrade" },
  "PAR": { team: "KK Partizan", metro: "belgrade" },
  "TEL": { team: "Maccabi Tel Aviv BC", metro: "tel-aviv" },
  "MIL": { team: "Olimpia Milano", metro: "milan" },
  "OLY": { team: "Olympiacos BC", metro: "athens" },
  "PAN": { team: "Panathinaikos BC", metro: "athens" },
  "PRS": { team: "Paris Basketball", metro: "paris" },
  "MAD": { team: "Real Madrid Baloncesto", metro: "madrid" },
  "BAS": { team: "Saski Baskonia", metro: "vitoria-gasteiz" },
  "PAM": { team: "Valencia Basket", metro: "valencia" },
  "VIR": { team: "Virtus Bologna", metro: "bologna" },
};

const API = "https://api-live.euroleague.net/v1/standings";
// Past the end of any schedule; the endpoint clamps. See the note above.
const GAME_NUMBER = 99;
const REVALIDATE_SECONDS = 900;

/**
 * EuroLeague season code for a date. Codes are E{startYear}: the 2026-27
 * season is E2026. The new season is provisioned well before tip-off, so the
 * roll happens in August rather than at the first game.
 */
export function euroleagueSeasonCode(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  return `E${now.getUTCMonth() + 1 >= 8 ? y : y - 1}`;
}

export function euroleagueSeasonLabel(code: string): string {
  const y = Number(code.replace(/\D/g, ""));
  return Number.isFinite(y) && y > 1900 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : "";
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
};
const decode = (s: string): string =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
   .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
   .trim();

function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1]) : "";
}
function tagNum(xml: string, name: string): number {
  const n = Number(tag(xml, name));
  return Number.isFinite(n) ? n : 0;
}

export function parseEuroleagueXml(xml: string, seasonCode: string): EuroleagueStandings {
  const base: EuroleagueStandings = {
    season_code: seasonCode,
    season_label: euroleagueSeasonLabel(seasonCode),
    group_label: "",
    rows: [],
    fetched_at: new Date().toISOString(),
  };
  // Only the first <group> is used: the feed leads with the Regular Season
  // table, which is the one a league board shows. Playoff groups, when they
  // appear, are a bracket rather than a table.
  const group = /<group\b([^>]*)>([\s\S]*?)<\/group>/.exec(xml);
  if (!group) return base;
  const nameAttr = /name="([^"]*)"/.exec(group[1]);
  const rows: EuroleagueRow[] = [];
  for (const m of group[2].matchAll(/<team>([\s\S]*?)<\/team>/g)) {
    const t = m[1];
    const code = tag(t, "code");
    const feedName = tag(t, "name");
    if (!code && !feedName) continue;
    const mapped = CROSSWALK[code] ?? null;
    const pf = tagNum(t, "ptsfavour");
    const pa = tagNum(t, "ptsagainst");
    rows.push({
      code,
      feed_name: feedName,
      team: mapped?.team ?? null,
      // An unmapped club renders under the feed's own name rather than
      // dropping out: a gap in the crosswalk must never silently shorten a
      // published league table.
      display: mapped?.team ?? feedName,
      metro_slug: mapped?.metro ?? null,
      rank: tag(t, "ranking") ? tagNum(t, "ranking") : null,
      played: tagNum(t, "totalgames"),
      won: tagNum(t, "wins"),
      lost: tagNum(t, "losses"),
      pf,
      pa,
      pd: pf - pa,
    });
  }
  return { ...base, group_label: nameAttr ? decode(nameAttr[1]) : "", rows };
}

/**
 * The current EuroLeague table. Fail-soft: any network or parse failure
 * returns zero rows, which the caller drops from the board.
 *
 * No snapshot fallback here (unlike the ESPN boards). The 2026-08-04 outage
 * that motivated lib/espnFetch.ts was specific to ESPN scoring Vercel egress;
 * there is no evidence of the same behaviour from EuroLeague, and inventing a
 * snapshot workflow for an unobserved failure is speculation. If this feed is
 * ever seen to refuse Vercel, add "euroleague" to
 * scripts/espn/snapshot_standings.py and wrap this fetch the same way.
 */
export async function getEuroleagueStandings(
  now: Date = new Date(),
): Promise<EuroleagueStandings> {
  const seasonCode = euroleagueSeasonCode(now);
  const empty: EuroleagueStandings = {
    season_code: seasonCode,
    season_label: euroleagueSeasonLabel(seasonCode),
    group_label: "",
    rows: [],
    fetched_at: new Date().toISOString(),
  };
  try {
    const res = await fetch(`${API}?seasonCode=${seasonCode}&gameNumber=${GAME_NUMBER}`, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        "User-Agent": "rankings-citizen-of-nowhere/1.0",
        Accept: "application/xml, text/xml",
      },
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return parseEuroleagueXml(await res.text(), seasonCode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[euroleague] standings fetch failed (${seasonCode}): ${msg}`);
    return empty;
  }
}
