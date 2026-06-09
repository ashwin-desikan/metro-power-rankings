import type { GameVideo } from "@/app/teams/_shared/GameVideo";

// Single source of truth for the curated clips. Each entry powers the per-row
// Watch button (matched to a game row by league + date + winner). Entries
// without rowOnly also render as a per-section "Featured games" card. Clips
// were checked via YouTube oEmbed on 2026-06-05: official channels are marked
// as such; a few older games only exist as fan uploads (rowOnly, takedown
// risk) and are flagged in clipLabel. rank is filled in at build time from the
// live Game Score order, so it never goes stale.
export type FeaturedGame = {
  videoId?: string;
  title: string;
  leagueTag: string;
  matchup?: string;
  note?: string;
  clipLabel: string;
  href?: string;
  hrefLabel?: string;
  rank?: number;
  rowOnly?: boolean;
  match?: { date: string; winnerCanonical: string };
};

export const FEATURED: FeaturedGame[] = [
  // NFL
  {
    leagueTag: "NFL",
    videoId: "JUe968JR8UM",
    title: "Super Bowl XXXII",
    matchup: "Broncos 31-24 Packers",
    note: "Elway finally wins the big one.",
    clipLabel: "Full game - NFL",
    match: { date: "1998-01-25", winnerCanonical: "Broncos" },
  },
  {
    leagueTag: "NFL",
    videoId: "_vKDygyOxH0",
    title: "Super Bowl XLII",
    matchup: "Giants 17-14 Patriots",
    note: "The Helmet Catch ends the perfect season.",
    clipLabel: "Official highlights",
    href: "https://www.youtube.com/watch?v=S1QkoOUEgyc",
    hrefLabel: "Full game",
    match: { date: "2008-02-03", winnerCanonical: "Giants" },
  },
  {
    leagueTag: "NFL",
    videoId: "U7rPIg7ZNQ8",
    title: "Super Bowl XLIX",
    matchup: "Patriots 28-24 Seahawks",
    note: "Butler's goal-line interception.",
    clipLabel: "Official highlights",
    href: "https://www.youtube.com/watch?v=0RFXLwZV_fA",
    hrefLabel: "Full game",
    match: { date: "2015-02-01", winnerCanonical: "Patriots" },
  },
  // NBA (cards)
  {
    leagueTag: "NBA",
    videoId: "pqK5fPUFkQo",
    title: "2016 NBA Finals, Game 7",
    matchup: "Cavaliers 93-89 Warriors",
    note: "The Block and The Shot; Cleveland's first title.",
    clipLabel: "Official highlights",
    href: "https://www.youtube.com/watch?v=EoVTttvKfRs",
    hrefLabel: "Full game",
    match: { date: "2016-06-19", winnerCanonical: "Cavaliers" },
  },
  {
    leagueTag: "NBA",
    videoId: "VlbC8q4VkL4",
    title: "1998 NBA Finals, Game 6",
    matchup: "Bulls 87-86 Jazz",
    note: "Jordan's last shot as a Bull.",
    clipLabel: "Official highlights",
    match: { date: "1998-06-14", winnerCanonical: "Bulls" },
  },
  {
    leagueTag: "NBA",
    videoId: "oon6XxSQh-U",
    title: "1985 NBA Finals, Game 6",
    matchup: "Lakers 111-100 Celtics",
    note: "The Lakers clinch the title on the Boston Garden parquet.",
    clipLabel: "Fan upload",
    href: "https://www.youtube.com/watch?v=itMgj0UhYC8",
    hrefLabel: "Full game",
    match: { date: "1985-06-09", winnerCanonical: "Lakers" },
  },
  // NBA (row-only; fan uploads, no official clip exists for these classics)
  {
    leagueTag: "NBA",
    videoId: "iDm0EP_cadY",
    title: "2002 West Finals, Game 7: Lakers 112-106 Kings",
    clipLabel: "Fan upload",
    href: "https://www.youtube.com/watch?v=BkACZJn6dWM",
    hrefLabel: "Full game",
    rowOnly: true,
    match: { date: "2002-06-02", winnerCanonical: "Lakers" },
  },
  {
    leagueTag: "NBA",
    videoId: "GmHCJAWwewY",
    title: "1972 West Finals, Game 6: Lakers 104-100 Bucks",
    clipLabel: "Fan upload",
    rowOnly: true,
    match: { date: "1972-04-22", winnerCanonical: "Lakers" },
  },
  // MLB
  {
    leagueTag: "MLB",
    videoId: "0VZcKBvBWes",
    title: "2016 World Series, Game 7",
    matchup: "Cubs 8-7 Indians",
    note: "108 years end in extra innings.",
    clipLabel: "Full game - MLB",
    match: { date: "2016-11-02", winnerCanonical: "Cubs" },
  },
  {
    leagueTag: "MLB",
    videoId: "7ujwjqIldwU",
    title: "1986 World Series, Game 6",
    matchup: "Mets 6-5 Red Sox",
    note: "Mookie's grounder through Buckner; the Mets survive.",
    clipLabel: "Official highlights",
    href: "https://www.youtube.com/watch?v=B0jV_kNs2p0",
    hrefLabel: "Full game",
    match: { date: "1986-10-25", winnerCanonical: "Mets" },
  },
  {
    leagueTag: "MLB",
    videoId: "0athNQ_xSSo",
    title: "1991 World Series, Game 7",
    matchup: "Twins 1-0 Braves",
    note: "Jack Morris: 10 innings, no runs.",
    clipLabel: "Official highlights",
    href: "https://www.youtube.com/watch?v=3GlY7PoDs8E",
    hrefLabel: "Full game",
    match: { date: "1991-10-27", winnerCanonical: "Twins" },
  },
  // NHL (compilation, no single row)
  {
    leagueTag: "NHL",
    videoId: "Cl6iMUPVrD4",
    title: "30 years of Cup celebrations",
    matchup: "1994-2024",
    note: "Every Stanley Cup presentation across three decades.",
    clipLabel: "Official - NHL",
  },
  // College Football (clips supplied for the top Game Score entries)
  {
    leagueTag: "CFB",
    videoId: "WitAjwWY6EQ",
    title: "2006 Rose Bowl",
    matchup: "Texas 41-38 USC",
    note: "Vince Young runs in the title on fourth down.",
    clipLabel: "Game video",
    rank: 1,
  },
  {
    leagueTag: "CFB",
    videoId: "TvSXwaNCJKs",
    title: "2003 Fiesta Bowl",
    matchup: "Ohio State 31-24 (2OT) Miami (FL)",
    note: "A double-overtime upset ends the Hurricanes' reign.",
    clipLabel: "Game video",
    rank: 2,
  },
  {
    leagueTag: "CFB",
    videoId: "saOJL6m70G0",
    title: "1987 Fiesta Bowl",
    matchup: "Penn State 14-10 Miami (FL)",
    note: "A goal-line stand seals the national championship.",
    clipLabel: "Game video",
    rank: 6,
  },
];

export function clipForRow(
  league: string,
  row: { date?: string | null; winner_canonical?: string },
): GameVideo | undefined {
  if (!row.date) return undefined;
  const hit = FEATURED.find(
    (g) =>
      g.leagueTag === league &&
      g.match &&
      g.match.date === row.date &&
      g.match.winnerCanonical === row.winner_canonical,
  );
  if (!hit) return undefined;
  return { videoId: hit.videoId, title: hit.title, href: hit.href, hrefLabel: hit.hrefLabel };
}
