import "server-only";

// Live Grand Slam singles from ESPN's hidden tennis scoreboard. ATP (men) and
// WTA (women) share one schema, so a single parser serves both via the `tour`
// arg. Runtime-ISR, fail-soft (returns null). Surfaces only when ESPN flags the
// current tournament a major (`event.major === true`) and the main singles draw
// has started, so it auto-appears during Wimbledon / the other Slams and hides
// the rest of the year. We show the current round's matches (latest round with
// play), reconstructing the scoreline from each player's per-set linescores.

const URL: Record<"atp" | "wta", string> = {
  atp: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
  wta: "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard",
};

export type TennisMatch = { label: string; score: string; flagUrl: string | null; live: boolean };
export type TennisDraw = { tournament: string; round: string; matches: TennisMatch[] };

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const asNum = (v: unknown, f = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : f; };

function playerName(c: AnyObj): string {
  const ath = asObj(c.athlete);
  if (ath) return asStr(ath.displayName) || asStr(ath.fullName);
  // doubles fallback (we exclude doubles, but be safe)
  const names = asArr(c.athletes).map((a) => asStr(asObj(a)?.displayName)).filter(Boolean);
  return names.join(" / ") || "—";
}
function playerFlag(c: AnyObj): string | null {
  const ath = asObj(c.athlete);
  return asStr(asObj(ath?.flag)?.href) || null;
}
function zipScore(p1: AnyObj, p2: AnyObj): string {
  const l1 = asArr(p1.linescores), l2 = asArr(p2.linescores);
  const n = Math.max(l1.length, l2.length);
  const sets: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = asObj(l1[i]), b = asObj(l2[i]);
    if (!a && !b) continue;
    sets.push(`${asNum(a?.value, 0)}-${asNum(b?.value, 0)}`);
  }
  return sets.join(" ");
}

export async function getLiveTennisSlam(tour: "atp" | "wta"): Promise<TennisDraw | null> {
  let root: AnyObj | null;
  try {
    const res = await fetch(URL[tour], {
      // No User-Agent on ESPN requests. Akamai's ESPN edge rejects custom
      // tokens and browser-shaped UAs alike (measured 2026-09-02: 403 with
      // either, 200 with none). Same fix as espnFetch.ts in 027923904.
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    root = asObj(await res.json());
  } catch {
    return null;
  }
  if (!root) return null;

  for (const evRaw of asArr(root.events)) {
    const ev = asObj(evRaw);
    if (!ev || ev.major !== true) continue;
    const tournament = asStr(ev.name);

    // collect started main-draw singles matches across the singles grouping(s)
    type M = { c: AnyObj; round: number; roundName: string };
    const started: M[] = [];
    // Gender-tag each singles grouping. During a combined Slam ESPN returns both
    // the men's and women's singles under each tour endpoint, so match only this
    // tour's draw — otherwise Men's and Women's Singles render identical rows.
    const singlesGroups = asArr(ev.groupings)
      .map((gRaw) => {
        const g = asObj(gRaw);
        const gdl = asStr(asObj(g?.grouping)?.displayName).toLowerCase();
        if (!gdl.includes("singles") || gdl.includes("doubles") || gdl.includes("mixed")) return null;
        const gender: "w" | "m" | "?" = /women|ladies/.test(gdl) ? "w" : /gentlemen|men/.test(gdl) ? "m" : "?";
        return { g, gender };
      })
      .filter((x): x is { g: AnyObj | null; gender: "w" | "m" | "?" } => x !== null);
    const want: "w" | "m" = tour === "wta" ? "w" : "m";
    const hasGendered = singlesGroups.some((x) => x.gender !== "?");
    const chosen = hasGendered ? singlesGroups.filter((x) => x.gender === want) : singlesGroups;
    for (const { g } of chosen) {
      for (const cRaw of asArr(g?.competitions)) {
        const c = asObj(cRaw);
        if (!c) continue;
        const state = asStr(asObj(asObj(c.status)?.type)?.state);
        if (state !== "in" && state !== "post") continue;
        const roundName = asStr(asObj(c.round)?.displayName);
        if (/qualif/i.test(roundName)) continue; // main draw only
        started.push({ c, round: asNum(asObj(c.round)?.id, 0), roundName });
      }
    }
    if (started.length === 0) continue;

    const maxRound = Math.max(...started.map((m) => m.round));
    const cur = started.filter((m) => m.round === maxRound);
    const roundName = cur[0]?.roundName || "Current round";

    const matches: TennisMatch[] = cur.map(({ c }) => {
      const cs = asArr(c.competitors).map(asObj).filter((x): x is AnyObj => !!x);
      const a = cs[0], b = cs[1];
      if (!a || !b) return { label: "—", score: "—", flagUrl: null, live: false };
      const completed = asObj(asObj(c.status)?.type)?.completed === true;
      const live = asStr(asObj(asObj(c.status)?.type)?.state) === "in";
      const winner = cs.find((x) => x.winner === true);
      if (completed && winner) {
        const loser = cs.find((x) => x !== winner) ?? b;
        return { label: `${playerName(winner)} def. ${playerName(loser)}`, score: zipScore(winner, loser) || "—", flagUrl: playerFlag(winner), live: false };
      }
      return { label: `${playerName(a)} v ${playerName(b)}`, score: zipScore(a, b) || (live ? "live" : "—"), flagUrl: playerFlag(a), live };
    });

    return { tournament, round: roundName, matches };
  }
  return null;
}
