import "server-only";

// Live/upcoming international rugby, from the World Rugby Pulselive feed (the
// same API scripts/ingest/rugby_results_ingest.py uses). Runtime ISR, fail-soft
// (returns null on any error) so the hub falls back to its static content. The
// block only surfaces when there are internationals in the window, so it appears
// during test windows (summer tours, autumn internationals, Six Nations, the
// Rugby Championship, World Cups) and hides otherwise.
//
// Server-only: listed in scripts/check-client-imports.mjs. Pulselive sport=mru
// returns club rugby too, so we keep only matches between tracked test nations
// and in tracked competitions (mirrors the ingest's filters).

const API = "https://api.wr-rims-prod.pulselive.com/rugby/v3/match";
const UA = "MetroPowerRankingsBot/1.0 (+https://rankings.citizenofnowhere.org)";
const DAY = 86_400_000;
const REVALIDATE = 900;

const TRACKED = new Set([
  "Argentina","Australia","Canada","Chile","England","Fiji","France","Georgia","Ireland",
  "Italy","Ivory Coast","Japan","Namibia","New Zealand","Portugal","Romania","Russia","Samoa",
  "Scotland","South Africa","Spain","Tonga","United States","Uruguay","Wales","Western Samoa","Zimbabwe",
]);
const ALIASES: Record<string, string> = {
  "USA": "United States", "United States of America": "United States", "Cote d'Ivoire": "Ivory Coast",
};
const IN_SCOPE = [
  "six nations","five nations","home nations","rugby championship","tri nations","rugby world cup",
  "nations championship","men's internationals","autumn","summer","end-of-year","tour of","greatest rivalry",
];

export type RugbyMatch = {
  date: string;           // ISO yyyy-mm-dd
  status: "live" | "upcoming" | "recent";
  teamA: string; teamB: string;
  scoreA: number | null; scoreB: number | null;
  competition: string; venue: string; city: string; country: string;
};
export type RugbyFixtures = { as_of: string; live: RugbyMatch[]; upcoming: RugbyMatch[]; recent: RugbyMatch[] };

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const canon = (n: string) => ALIASES[n.trim()] ?? n.trim();
const iso = (ymd: string) => (ymd.length === 8 ? `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}` : ymd);
const inScope = (label: string) => { const l = label.toLowerCase(); return IN_SCOPE.some((p) => l.includes(p)); };

async function fetchWindow(states: string, start: string, end: string): Promise<AnyObj[]> {
  const out: AnyObj[] = [];
  for (let page = 0; page < 6; page++) {
    const url = `${API}?states=${encodeURIComponent(states)}&sport=mru&startDate=${start}&endDate=${end}&page=${page}&pageSize=100&sort=asc`;
    let root: AnyObj | null;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) break;
      root = asObj(await res.json());
    } catch { break; }
    if (!root) break;
    for (const m of asArr(root.content)) { const o = asObj(m); if (o) out.push(o); }
    const pages = Number(asObj(root.pageInfo)?.numPages ?? 1);
    if (page + 1 >= pages) break;
  }
  return out;
}

function shape(m: AnyObj): RugbyMatch | null {
  const teams = asArr(m.teams).map((t) => canon(asStr(asObj(t)?.name)));
  if (teams.length !== 2 || !teams[0] || !teams[1]) return null;
  if (!TRACKED.has(teams[0]) || !TRACKED.has(teams[1])) return null;
  const label = asStr(m.competition) || asArr(m.events).map((e) => asStr(asObj(e)?.label)).join(";");
  if (!inScope(label)) return null;
  const millis = Number(asObj(m.time)?.millis ?? 0);
  if (!millis) return null;
  const d = new Date(millis);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;
  const st = asStr(m.status).toUpperCase();
  const status: RugbyMatch["status"] = st === "L" ? "live" : st === "C" ? "recent" : "upcoming";
  const scores = asArr(m.scores);
  const sA = typeof scores[0] === "number" ? (scores[0] as number) : null;
  const sB = typeof scores[1] === "number" ? (scores[1] as number) : null;
  const v = asObj(m.venue) || {};
  return {
    date: iso(ymd), status, teamA: teams[0], teamB: teams[1],
    scoreA: status === "upcoming" ? null : sA, scoreB: status === "upcoming" ? null : sB,
    competition: label, venue: asStr(v.name), city: asStr(v.city), country: asStr(v.country),
  };
}

export async function getRugbyFixtures(): Promise<RugbyFixtures | null> {
  const now = Date.now();
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
  const raw = await fetchWindow("U|L|C", fmt(now - 16 * DAY), fmt(now + 45 * DAY));
  if (!raw.length) return null;
  const seen = new Set<string>();
  const live: RugbyMatch[] = [], upcoming: RugbyMatch[] = [], recent: RugbyMatch[] = [];
  for (const m of raw) {
    const s = shape(m);
    if (!s) continue;
    const key = `${s.date}|${[s.teamA, s.teamB].sort().join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (s.status === "live" ? live : s.status === "recent" ? recent : upcoming).push(s);
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  recent.sort((a, b) => b.date.localeCompare(a.date));
  if (!live.length && !upcoming.length && !recent.length) return null;
  return { as_of: new Date().toISOString(), live, upcoming: upcoming.slice(0, 12), recent: recent.slice(0, 8) };
}
