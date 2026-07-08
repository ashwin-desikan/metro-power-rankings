import "server-only";

// Live/upcoming international cricket, from ESPN's (Cricinfo) public cricket
// header feed. Cricket has no single global scoreboard; the header endpoint
// lists the currently-active series (leagues) with their events embedded, which
// is enough for a "what's on now and soon" block. We keep only men's
// internationals (class Test / ODI / T20I). Runtime ISR, fail-soft (null on any
// error) so the cricket hub falls back to its static content. Server-only.

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
  const comp = asObj(asArr(ev.competitions)[0]);
  if (!comp) return null;
  const cls = asObj(comp.class) || {};
  const format = asStr(cls.generalClassCard);
  const clsName = asStr(cls.name);
  const isIntl = INTL.has(format) || /international/i.test(clsName);
  if (!isIntl) return null;
  const cs = asArr(comp.competitors).map(asObj).filter((c): c is AnyObj => !!c);
  if (cs.length !== 2) return null;
  const nameOf = (c: AnyObj) => asStr(asObj(c.team)?.displayName) || asStr(asObj(c.team)?.abbreviation);
  const a = cs[0], b = cs[1];
  if (!nameOf(a) || !nameOf(b)) return null;
  const state = asStr(asObj(asObj(ev.status)?.type)?.state) || asStr(asObj(asObj(comp.status)?.type)?.state);
  const status: CricketMatch["status"] = state === "in" ? "live" : state === "post" ? "recent" : "upcoming";
  const v = asObj(comp.venue) || {};
  const addr = asObj(v.address) || {};
  const scoreOrNull = (c: AnyObj) => { const s = asStr(c.score); return s ? s : null; };
  return {
    date: asStr(ev.date) || asStr(comp.startDate), status, format: format || (clsName || "Intl"),
    teamA: nameOf(a), teamB: nameOf(b),
    scoreA: status === "upcoming" ? null : scoreOrNull(a), scoreB: status === "upcoming" ? null : scoreOrNull(b),
    competition: leagueName || asStr(ev.name), venue: asStr(v.fullName), city: asStr(addr.city),
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

  const leagues = asArr(asObj(asArr(root.sports)[0])?.leagues).length
    ? asArr(asObj(asArr(root.sports)[0])?.leagues) : asArr(root.leagues);
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
