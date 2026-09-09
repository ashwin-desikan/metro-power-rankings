// Box-score links for NFL game rows (session prompt 2026-09-09, item C).
//
// 🔴 NO FILE THE SITE READS CARRIES AN ESPN GAME ID. The expectation ledger's
// `game_id` is the workbook's per-day slate id (lib/nflExpectation.ts says so),
// the season shards store per-team weeks with no game key, and
// nfl_live_update.py drops ESPN's event id before it reaches upcoming.json.
// So an ESPN box-score link cannot be built from the data, for any season.
//
// Pro-Football-Reference can, because its box-score URL is a convention, not
// an id: /boxscores/<YYYYMMDD>0<franchise code>.htm, the home team's
// three-letter franchise code, which PFR keeps constant across relocations
// and renamings (the Rams are "ram" in Cleveland, Los Angeles, St Louis and
// Los Angeles again). The ledger's `home_slug` is the same franchise-stable
// key, so the join is one table. That covers every season since 1920.
//
// 🔴 VERIFIED BY A PERSON, NOT A SCRIPT. PFR answers 403 to any scripted
// request (curl, PowerShell and the desktop app's own browser pane all hit its
// bot check on 2026-09-09), so the URL shape was checked by hand in a normal
// browser on the sample listed in HANDOFF 2026-09-09. Two cases are left
// unlinked on purpose:
//   - a neutral-site game (`neutral: true`): PFR files a Super Bowl or a
//     London game under whichever side it designates home, and this ledger's
//     home side is not guaranteed to agree;
//   - a franchise with no code below (the 1,895 rows whose slug is null are
//     defunct clubs: Boston Yanks, Dayton Triangles and the rest).
// A row with no link shows nothing rather than a guess.

const PFR_CODE_BY_SLUG: Record<string, string> = {
  "arizona-cardinals": "crd",
  "atlanta-falcons": "atl",
  "baltimore-ravens": "rav",
  "buffalo-bills": "buf",
  "carolina-panthers": "car",
  "chicago-bears": "chi",
  "cincinnati-bengals": "cin",
  "cleveland-browns": "cle",
  "dallas-cowboys": "dal",
  "denver-broncos": "den",
  "detroit-lions": "det",
  "green-bay-packers": "gnb",
  "houston-texans": "htx",
  "indianapolis-colts": "clt",
  "jacksonville-jaguars": "jax",
  "kansas-city-chiefs": "kan",
  "las-vegas-raiders": "rai",
  "los-angeles-chargers": "sdg",
  "los-angeles-rams": "ram",
  "miami-dolphins": "mia",
  "minnesota-vikings": "min",
  "new-england-patriots": "nwe",
  "new-orleans-saints": "nor",
  "new-york-giants": "nyg",
  "new-york-jets": "nyj",
  "philadelphia-eagles": "phi",
  "pittsburgh-steelers": "pit",
  "san-francisco-49ers": "sfo",
  "seattle-seahawks": "sea",
  "tampa-bay-buccaneers": "tam",
  "tennessee-titans": "oti",
  "washington-commanders": "was",
};

/**
 * The Pro-Football-Reference box score for a game, or null when the link
 * cannot be built honestly (no date, neutral site, unknown franchise).
 */
export function pfrBoxscoreUrl(g: {
  date: string | null;
  home_slug: string | null;
  neutral?: boolean;
}): string | null {
  if (!g.date || !g.home_slug || g.neutral) return null;
  const code = PFR_CODE_BY_SLUG[g.home_slug];
  if (!code) return null;
  const ymd = g.date.replace(/-/g, "");
  if (!/^\d{8}$/.test(ymd)) return null;
  return `https://www.pro-football-reference.com/boxscores/${ymd}0${code}.htm`;
}

export const PFR_LINK_LABEL = "Box score on Pro-Football-Reference";
