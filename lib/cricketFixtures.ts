import "server-only";

// Live/upcoming international cricket, from ESPN's (Cricinfo) public cricket
// header feed, which lists the currently-active series with their events
// embedded. We keep only men's internationals (class Test / ODI / T20I, or both
// sides flagged isNational). Runtime ISR, fail-soft (null on any error) so the
// cricket hub falls back to static content. Server-only.
//
// Header-event shape (flatter than the per-league scoreboard): teams, class,
// status, location live DIRECTLY on the event (no competitions[0] layer).

const HEADER = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket";
const UA = "MetroPowerRankingsBot/1.0 (+https://rankings.citizenofnowhere.org)";
const REVALIDATE = 600;
const INTL = new Set(["Test", "ODI", "T20I"]);

export type CricketMatch = {
  date: string;                 // ISO instant
  status: "live" | "upcoming" | "recent";
  format: string;               // Test | ODI | T20I
  teamA: string; teamB: string;
  scoreA: string | null; scoreB: string | null;
  competition: string; venue: string; city: string;
};
export type CricketFixtures = { as_of: string; live: CricketMatch[]; upcoming: CricketMatch[]; recent: CricketMatch[] };

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function shape(ev: AnyObj, leagueName: string): CricketMatch | null {
  const cls = asObj(ev.class) || {};
  const format = asStr(cls.generalClassCard);
  const clsName = asStr(cls.name);
  const cs = asArr(ev.competitors).map(asObj).filter((c): c is AnyObj => !!c);
  if (cs.length !== 2) return null;
  const isIntl = INTL.has(format) || /international/i.test(clsName) || cs.every((c) => c.isNational === true);
  if (!isIntl) return null;
  const nameOf = (c: AnyObj) => asStr(c.displayName) || asStr(c.name) || asStr(c.abbreviation);
  if (!nameOf(cs[0]) || !nameOf(cs[1])) return null;
  const state = asStr(ev.status) || asStr(asObj(asObj(ev.fullStatus)?.type)?.state);
  const status: CricketMatch["status"] = state === "in" ? "live" : state === "post" ? "recent" : "upcoming";
  const loc = asStr(ev.location);
  const li = loc.lastIndexOf(",");
  const venue = li > 0 ? loc.slice(0, li).trim() : loc;
  const city = li > 0 ? loc.slice(li + 1).trim() : "";
  const scoreOf = (c: AnyObj) => { const s = asStr(c.score); return s ? s : null; };
  return {
    date: asStr(ev.date), status, format: format || clsName || "Intl",
    teamA: nameOf(cs[0]), teamB: nameOf(cs[1]),
    scoreA: status === "upcoming" ? null : scoreOf(cs[0]), scoreB: status === "upcoming" ? null : scoreOf(cs[1]),
    competition: leagueName || asStr(ev.name), venue, city,
  };
}

export async function getCricketFixtures(): Promise<CricketFixtures | null> {
  let root: AnyObj | null;
  try {
    const res = await fetch(HEADER, { headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    root = asObj(await res.json());
  } catch { return null; }
  if (!root) return null;

  const leagues = asArr(asObj(asArr(root.sports)[0])?.leagues);
  const live: CricketMatch[] = [], upcoming: CricketMatch[] = [], recent: CricketMatch[] = [];
  const seen = new Set<string>();
  for (const lgRaw of leagues) {
    const lg = asObj(lgRaw); if (!lg) continue;
    const lname = asStr(lg.name);
    for (const evRaw of asArr(lg.events)) {
      const ev = asObj(evRaw); if (!ev) continue;
      const m = shape(ev, lname);
      if (!m) continue;
      const key = `${m.date.slice(0, 10)}|${[m.teamA, m.teamB].sort().join("|")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (m.status === "live" ? live : m.status === "recent" ? recent : upcoming).push(m);
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  recent.sort((a, b) => b.date.localeCompare(a.date));
  if (!live.length && !upcoming.length && !recent.length) return null;
  return { as_of: new Date().toISOString(), live, upcoming: upcoming.slice(0, 12), recent: recent.slice(0, 8) };
}
