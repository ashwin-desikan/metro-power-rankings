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
  // International Football (men's; clips supplied by Ashwin)
  { leagueTag: "INTFB", videoId: "2qCZe6Ki-zk", title: "1954 World Cup Final", matchup: "West Germany 3-2 Hungary", note: "The Miracle of Bern.", clipLabel: "Watch", href: "https://www.youtube.com/watch?v=2qCZe6Ki-zk", hrefLabel: "YouTube", match: { date: "1954-07-04", winnerCanonical: "Germany" } },
  { leagueTag: "INTFB", videoId: "VPQvekloS8U", title: "1966 World Cup Final", matchup: "England 4-2 West Germany", note: "They think it is all over.", clipLabel: "Watch", href: "https://www.youtube.com/watch?v=VPQvekloS8U", hrefLabel: "YouTube", match: { date: "1966-07-30", winnerCanonical: "England" } },
  { leagueTag: "INTFB", videoId: "zhEWqfP6V_w", title: "2022 World Cup Final", matchup: "Argentina 3-3 France", note: "Messi crowned; decided on penalties.", clipLabel: "Watch", href: "https://www.youtube.com/watch?v=zhEWqfP6V_w", hrefLabel: "YouTube", match: { date: "2022-12-18", winnerCanonical: "Argentina" } },
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
    videoId: "d4qo99eZ9Tc",
    title: "1988 NBA Finals, Game 7",
    matchup: "Lakers 108-105 Pistons",
    note: "The Lakers complete the repeat at the Forum.",
    clipLabel: "Game video",
    match: { date: "1988-06-21", winnerCanonical: "Lakers" },
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
  // Men's College Basketball (clips supplied for the top Game Score entries)
  {
    leagueTag: "CBB",
    videoId: "FDNhnZb6hJA",
    title: "1992 East Regional Final",
    matchup: "Duke 104-103 (OT) Kentucky",
    note: "Laettner's turnaround beats the buzzer.",
    clipLabel: "Game video",
    rank: 1,
  },
  {
    leagueTag: "CBB",
    videoId: "DlG7oSYL3Os",
    title: "1979 NCAA Championship",
    matchup: "Michigan State 75-64 Indiana State",
    note: "Magic vs. Bird; the game that launched the sport.",
    clipLabel: "Game video",
    rank: 3,
  },
  {
    leagueTag: "CBB",
    videoId: "Q6fflHD73sw",
    title: "2016 NCAA Championship",
    matchup: "Villanova 77-74 North Carolina",
    note: "Jenkins' buzzer-beater answers Paige's miracle.",
    clipLabel: "Game video",
    rank: 5,
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
