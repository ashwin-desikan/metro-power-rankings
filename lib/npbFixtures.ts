import "server-only";
import { unstable_cache } from "next/cache";

// NPB fixtures and results for the Live Standings event strips.
//
// SOURCE: SPAIA's unofficial NPB API, the same origin lib/npbStandings.ts
// already uses for the ladder and that mac-mini-jobs/feed_shape_monitor.py
// already shape-checks daily. Ashwin suggested Flashscore on 2026-09-18;
// SPAIA was chosen instead because it returns real JSON, is already a trusted
// dependency here, and does not need scraping a JS-rendered page.
//
// 🔴 TODAY ONLY, AND THAT IS THE ENDPOINT, NOT A BUG. Measured 2026-09-18:
// `game_schedule?Year=2026` returns only the current day's card, and Month,
// DateJPN, From/To, GameKindID, LeagueCD, TeamID and friends are all ignored -
// every variant returns the identical rows. So NPB can fill On today and (once
// games finish) Recent results, but it CANNOT fill Coming up. A future session
// wanting NPB fixtures further out needs npb.jp's monthly schedule page, which
// carries the full month as Japanese-language HTML and means a real parser.
//
// Also measured that day, to avoid a false alarm: the card was three games, all
// Central League, and npb.jp's own index for 9/18 confirms three games that day
// (Tokyo Dome, Yokohama, Koshien). The Pacific League simply was not playing.
// A short card is a quiet day, not a truncated feed.

const ENDPOINT = "https://spaia.jp/baseball/npb/api/game_schedule";
const REVALIDATE_SECONDS = 600; // matches lib/npbStandings.ts

// Same mapping as lib/npbStandings.ts TEAM_BY_CD, keyed by the numeric team id
// the schedule endpoint sends (HTeamID / VTeamID) rather than the standings
// endpoint's TeamCD string. Kept in step with that table deliberately: the two
// endpoints agree on the ids, and 376 really is Rakuten.
const TEAM_BY_ID: Record<number, { name: string; slug: string }> = {
  1: { name: "Yomiuri Giants", slug: "yomiuri-giants" },
  2: { name: "Tokyo Yakult Swallows", slug: "tokyo-yakult-swallows" },
  3: { name: "Yokohama DeNA BayStars", slug: "yokohama-dena-baystars" },
  4: { name: "Chunichi Dragons", slug: "chunichi-dragons" },
  5: { name: "Hanshin Tigers", slug: "hanshin-tigers" },
  6: { name: "Hiroshima Toyo Carp", slug: "hiroshima-toyo-carp" },
  7: { name: "Saitama Seibu Lions", slug: "saitama-seibu-lions" },
  8: { name: "Hokkaido Nippon-Ham Fighters", slug: "hokkaido-nippon-ham-fighters" },
  9: { name: "Chiba Lotte Marines", slug: "chiba-lotte-marines" },
  11: { name: "Orix Buffaloes", slug: "orix-buffaloes" },
  12: { name: "Fukuoka SoftBank Hawks", slug: "fukuoka-softbank-hawks" },
  376: { name: "Tohoku Rakuten Golden Eagles", slug: "tohoku-rakuten-golden-eagles" },
};

export type NpbGame = {
  id: string;
  when: string;              // ISO instant, converted from JST
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  final: boolean;
};

type Row = {
  GameID?: unknown; DateJPN?: unknown; TimeJPN?: unknown;
  HTeamID?: unknown; VTeamID?: unknown;
  HScore?: unknown; VScore?: unknown;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v)
      : null;

/** DateJPN 20260918 + TimeJPN "1800" (both Japan time, UTC+9) to an ISO instant.
 *  Built from parts rather than string-concatenated into a Date: JST is UTC+9
 *  with no daylight saving, so the offset is a constant and this needs no
 *  timezone library. */
function jstToIso(dateJpn: number, timeJpn: string): string | null {
  const s = String(dateJpn);
  if (!/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4)), mo = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
  const t = /^\d{3,4}$/.test(timeJpn) ? timeJpn.padStart(4, "0") : "0000";
  const hh = Number(t.slice(0, 2)), mm = Number(t.slice(2, 4));
  const ms = Date.UTC(y, mo - 1, d, hh - 9, mm); // JST is UTC+9, year-round
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

async function buildNpbFixtures(): Promise<NpbGame[]> {
  let rows: Row[];
  try {
    const res = await fetch(`${ENDPOINT}?Year=${new Date().getUTCFullYear()}`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        // Same UA lib/npbStandings.ts sends: SPAIA answers it, and the mini's
        // feed monitor uses the same token against this origin.
        "User-Agent": "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)",
      },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    rows = Array.isArray(body) ? (body as Row[]) : [];
  } catch {
    // Soft: NPB simply does not appear in the strips this revalidation.
    return [];
  }

  const out: NpbGame[] = [];
  for (const r of rows) {
    const home = TEAM_BY_ID[num(r.HTeamID) ?? -1];
    const away = TEAM_BY_ID[num(r.VTeamID) ?? -1];
    const date = num(r.DateJPN);
    if (!home || !away || date === null) continue;
    const when = jstToIso(date, typeof r.TimeJPN === "string" ? r.TimeJPN : "");
    if (!when) continue;
    // A score of 0 is a real score (a shutout), so test for null explicitly
    // rather than truthiness. Scores stay null until the game is played, which
    // is what marks it as a fixture rather than a result.
    const hs = num(r.HScore), as = num(r.VScore);
    out.push({
      id: String(num(r.GameID) ?? `${date}|${home.slug}`),
      when, home: home.name, away: away.name,
      homeScore: hs, awayScore: as,
      final: hs !== null && as !== null,
    });
  }
  out.sort((a, b) => a.when.localeCompare(b.when));
  return out;
}

export const getNpbFixtures = unstable_cache(
  buildNpbFixtures,
  ["npb-fixtures-shaped-v1"],
  { revalidate: REVALIDATE_SECONDS, tags: ["spaia-npb-fixtures"] },
);
