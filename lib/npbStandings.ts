import "server-only";

// Live NPB standings via SPAIA's unofficial NPB API (spaia.jp). Same posture as
// the F1 hub's runtime ESPN fetch: a server-side fetch with ISR revalidation,
// so the standings refresh on a timer with NO rebuild and NO committed data
// file. SPAIA is an undocumented third-party endpoint, so this fails soft:
// any error returns null and the hub simply hides the section rather than
// breaking the page.
//
// Endpoint (documented by github.com/armstjc/Nippon-Baseball-Data-Repository):
//   official_stats_history?GameAssortment={1=Central,2=Pacific}&Year=YYYY
// It returns the full per-matchday history; the last row per team is that
// team's current cumulative record.

const ENDPOINT = "https://spaia.jp/baseball/npb/api/official_stats_history";

// SPAIA TeamCD -> our canonical NPB club. Codes verified against the live feed
// on 2026-06-25.
const TEAM_BY_CD: Record<string, { name: string; slug: string }> = {
  "1": { name: "Yomiuri Giants", slug: "yomiuri-giants" },
  "2": { name: "Tokyo Yakult Swallows", slug: "tokyo-yakult-swallows" },
  "3": { name: "Yokohama DeNA BayStars", slug: "yokohama-dena-baystars" },
  "4": { name: "Chunichi Dragons", slug: "chunichi-dragons" },
  "5": { name: "Hanshin Tigers", slug: "hanshin-tigers" },
  "6": { name: "Hiroshima Toyo Carp", slug: "hiroshima-toyo-carp" },
  "7": { name: "Saitama Seibu Lions", slug: "saitama-seibu-lions" },
  "8": { name: "Hokkaido Nippon-Ham Fighters", slug: "hokkaido-nippon-ham-fighters" },
  "9": { name: "Chiba Lotte Marines", slug: "chiba-lotte-marines" },
  "11": { name: "Orix Buffaloes", slug: "orix-buffaloes" },
  "12": { name: "Fukuoka SoftBank Hawks", slug: "fukuoka-softbank-hawks" },
  "376": { name: "Tohoku Rakuten Golden Eagles", slug: "tohoku-rakuten-golden-eagles" },
};

export type NpbStandingRow = {
  rank: number;
  name: string;
  slug: string | null;
  games: number;
  win: number;
  lose: number;
  draw: number;
  pct: string;
  gamesBehind: string;
  magic: string | null;
  runsFor: number | null;
  runsAgainst: number | null;
};

export type NpbStandings = {
  year: number;
  updatedAt: string | null;
  central: NpbStandingRow[];
  pacific: NpbStandingRow[];
};

type RawRow = Record<string, string>;

function num(v: string | undefined): number {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchLeague(
  assortment: 1 | 2,
  year: number,
): Promise<{ rows: NpbStandingRow[]; updatedAt: string | null } | null> {
  let raw: RawRow[];
  try {
    const res = await fetch(`${ENDPOINT}?GameAssortment=${assortment}&Year=${year}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)",
        Accept: "application/json",
      },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    raw = (await res.json()) as RawRow[];
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;

  // Rows are chronological per matchday; keep the last occurrence of each
  // TeamCD as that team's current cumulative record.
  const latest = new Map<string, RawRow>();
  let updatedAt: string | null = null;
  for (const r of raw) {
    if (r && r.TeamCD) {
      latest.set(r.TeamCD, r);
      if (r.UpdatedAt) updatedAt = r.UpdatedAt;
    }
  }

  const rows: NpbStandingRow[] = [...latest.values()].map((r) => {
    const t = TEAM_BY_CD[r.TeamCD];
    return {
      rank: num(r.Ranking),
      name: t?.name ?? r.ShortName_Team ?? "—",
      slug: t?.slug ?? null,
      games: num(r.Game),
      win: num(r.Win),
      lose: num(r.Lose),
      draw: num(r.Draw),
      pct: r.WinningPercentage && r.WinningPercentage !== "" ? r.WinningPercentage : "—",
      gamesBehind: "—", // replaced below, once the leader is known

      magic: r.Winner_Magic && r.Winner_Magic !== "" ? r.Winner_Magic : null,
      runsFor: r.Run ? num(r.Run) : null,
      runsAgainst: r.PointLost ? num(r.PointLost) : null,
    };
  });

  rows.sort((a, b) => a.rank - b.rank || b.win - a.win);
  applyGamesBehind(rows);
  return { rows, updatedAt };
}

/**
 * Games behind the LEADER, computed here rather than taken from the feed.
 *
 * SPAIA's `GameBehind` is the Japanese ゲーム差 convention: the gap to the team
 * IMMEDIATELY ABOVE, not to the leader. Reading it as a Western GB column
 * produced nonsense - measured live on 2026-08-06, the Central League showed
 * Yakult 9.5, DeNA 0, Chunichi 3, Hiroshima 0, because each number referred to
 * a different reference team. (A row reading 0 while sitting fourth is the
 * tell.) The feed does carry a `GameBehindTop` field that is the real
 * games-behind-the-leader, and it agreed with the standard formula on all 12
 * rows - but SPAIA is undocumented and third-party, so we compute our own from
 * W/L and depend on nothing that could be renamed or re-scoped upstream.
 *
 * Standard convention, used by both NPB and MLB:
 *     GB = ((leaderW - teamW) + (teamL - leaderL)) / 2
 * TIES ARE EXCLUDED. NPB games really can end level, and a draw advances
 * neither side's W nor L, so it must not enter the arithmetic.
 */
function applyGamesBehind(rows: NpbStandingRow[]): void {
  if (rows.length === 0) return;
  const leader = rows[0];
  for (const row of rows) {
    if (row === leader) {
      row.gamesBehind = "—";
      continue;
    }
    const gb = ((leader.win - row.win) + (row.lose - leader.lose)) / 2;
    // A team can sit below the leader on win pct while being level or ahead on
    // this measure (it has played fewer games). Show a dash rather than a
    // negative, which is how NPB and MLB tables both handle it.
    row.gamesBehind = gb <= 0 ? "—" : Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
  }
}

export async function getNpbStandings(): Promise<NpbStandings | null> {
  // NPB runs ~late March to November. In the early-year offseason the current
  // year has no rows yet, so fall back to last year's final table.
  const primaryYear = new Date().getUTCFullYear();
  for (const year of [primaryYear, primaryYear - 1]) {
    const [central, pacific] = await Promise.all([fetchLeague(1, year), fetchLeague(2, year)]);
    if ((central && central.rows.length) || (pacific && pacific.rows.length)) {
      return {
        year,
        updatedAt: central?.updatedAt ?? pacific?.updatedAt ?? null,
        central: central?.rows ?? [],
        pacific: pacific?.rows ?? [],
      };
    }
  }
  return null;
}
