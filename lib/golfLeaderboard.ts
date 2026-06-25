import "server-only";

// Live golf leaderboard for the four men's majors, from ESPN's hidden golf
// scoreboard feed. Same runtime-ISR posture as the team-sport loaders: a
// server-side fetch that fails soft (returns null). The block only surfaces
// when ESPN's current event is a major AND we are inside its date window, so
// it auto-appears during The Open / Masters / PGA / U.S. Open and hides the
// rest of the year. Field paths verified against the live scoreboard; the
// position/thru fields are read defensively (ESPN varies them off-event).

const URL = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const MAJOR_RE = /(the )?open championship|masters|pga championship|u\.?\s?s\.?\s?open/i;
const DAY = 86_400_000;

export type GolfRow = { pos: string; name: string; flagUrl: string | null; toPar: string; thru: string };
export type GolfMajor = { name: string; live: boolean; rows: GolfRow[] };

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const asNum = (v: unknown, f = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : f; };

export async function getLiveGolfMajor(): Promise<GolfMajor | null> {
  let root: AnyObj | null;
  try {
    const res = await fetch(URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0)", Accept: "application/json" },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    root = asObj(await res.json());
  } catch {
    return null;
  }
  if (!root) return null;

  const now = Date.now();
  for (const evRaw of asArr(root.events)) {
    const ev = asObj(evRaw);
    if (!ev) continue;
    const name = asStr(ev.name);
    if (!MAJOR_RE.test(name)) continue;

    const start = Date.parse(asStr(ev.date));
    const end = Date.parse(asStr(ev.endDate));
    const inWindow = !Number.isNaN(start) && now >= start - DAY && (Number.isNaN(end) || now <= end + 2 * DAY);
    if (!inWindow) continue;

    const comp = asObj(asArr(ev.competitions)[0]);
    if (!comp) continue;
    const state = asStr(asObj(asObj(comp.status)?.type)?.state); // pre | in | post

    const competitors = asArr(comp.competitors)
      .map(asObj)
      .filter((c): c is AnyObj => !!c)
      .sort((a, b) => asNum(a.order, 9999) - asNum(b.order, 9999));

    const rows: GolfRow[] = [];
    for (const c of competitors) {
      const ath = asObj(c.athlete);
      if (!ath) continue;
      const flag = asObj(ath.flag);
      const status = asObj(c.status);
      const posObj = asObj(status?.position);
      const thruVal = status?.thru;
      const thruStr = thruVal === 0 || (typeof thruVal === "number" && thruVal > 0) || (typeof thruVal === "string" && thruVal !== "") ? String(thruVal) : "";
      rows.push({
        pos: asStr(posObj?.displayName) || String(asNum(c.order, rows.length + 1)),
        name: asStr(ath.displayName) || asStr(ath.fullName),
        flagUrl: asStr(flag?.href) || null,
        toPar: asStr(c.score) || "E",
        thru: state === "post" ? "F" : (thruStr || asStr(status?.displayValue) || "—"),
      });
    }
    if (rows.length === 0) continue;
    return { name, live: state === "in", rows: rows.slice(0, 20) };
  }
  return null;
}
