import "server-only";

// Live 2026 ladders from ESPN's public standings API. Parsed server-side with
// hourly revalidation; returns null on any failure so callers fall back to the
// static (workbook) ladder and the build never breaks.

export type FootyStandingRow = {
  slug: string | null; name: string; rank: number | null;
  played: number | null; w: number | null; d: number | null; l: number | null;
  pts: number | null; pf: number | null; pa: number | null;
};
export type FootyStandingsView = { year: number; source: "espn"; rows: FootyStandingRow[] } | null;

const ESPN: Record<"afl" | "nrl", string> = {
  afl: "https://site.api.espn.com/apis/v2/sports/australian-football/afl/standings",
  nrl: "https://site.api.espn.com/apis/v2/sports/rugby-league/3/standings",
};

// ESPN displayName -> our franchise slug. AFL displayName is the full club name;
// NRL displayName is the nickname only.
const NAME_TO_SLUG: Record<"afl" | "nrl", Record<string, string>> = {
  afl: {
    "Adelaide Crows": "adelaide", "Brisbane Lions": "brisbane-lions", "Carlton": "carlton",
    "Collingwood": "collingwood", "Essendon": "essendon", "Fremantle": "fremantle",
    "Geelong Cats": "geelong", "Gold Coast SUNS": "gold-coast", "GWS GIANTS": "greater-western-sydney",
    "Hawthorn": "hawthorn", "Melbourne": "melbourne", "North Melbourne": "north-melbourne",
    "Port Adelaide": "port-adelaide", "Richmond": "richmond", "St Kilda": "st-kilda",
    "Sydney Swans": "sydney-swans", "West Coast Eagles": "west-coast", "Western Bulldogs": "western-bulldogs",
  },
  nrl: {
    "Panthers": "penrith", "Rabbitohs": "south-sydney", "Storm": "melbourne-storm",
    "Roosters": "sydney-roosters", "Sea Eagles": "manly-warringah", "Dolphins": "dolphins",
    "Sharks": "cronulla-sutherland", "Knights": "newcastle-knights", "Cowboys": "north-queensland",
    "Wests Tigers": "wests-tigers", "Broncos": "brisbane-broncos", "Bulldogs": "canterbury-bankstown",
    "Raiders": "canberra-raiders", "Titans": "gold-coast-titans", "Eels": "parramatta",
    "Dragons": "st-george-illawarra", "Warriors": "new-zealand-warriors",
  },
};

type EspnStat = { name: string; value?: number };
type EspnEntry = { team?: { displayName?: string }; stats?: EspnStat[] };

function statVal(entry: EspnEntry, name: string): number | null {
  const s = entry.stats?.find((x) => x.name === name);
  return s && typeof s.value === "number" ? s.value : null;
}

export async function getFootyLiveStandings(league: "afl" | "nrl"): Promise<FootyStandingsView> {
  try {
    const res = await fetch(ESPN[league], { next: { revalidate: 600 } });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const standings = league === "nrl" ? data?.children?.[0]?.standings : data?.standings;
    const entries: EspnEntry[] = standings?.entries ?? [];
    if (!entries.length) return null;
    const map = NAME_TO_SLUG[league];
    const winN = league === "nrl" ? "gamesWon" : "wins";
    const lossN = league === "nrl" ? "gamesLost" : "losses";
    const drawN = league === "nrl" ? "gamesDrawn" : "ties";
    const rows: FootyStandingRow[] = entries.map((e) => ({
      slug: map[(e.team?.displayName ?? "").trim()] ?? null,
      name: e.team?.displayName ?? "",
      rank: statVal(e, "rank"),
      played: statVal(e, "gamesPlayed"),
      w: statVal(e, winN), d: statVal(e, drawN), l: statVal(e, lossN),
      pts: statVal(e, "points"), pf: statVal(e, "pointsFor"), pa: statVal(e, "pointsAgainst"),
    }));
    rows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const year = Number(standings?.season) || new Date().getFullYear();
    return { year, source: "espn", rows };
  } catch {
    return null;
  }
}
