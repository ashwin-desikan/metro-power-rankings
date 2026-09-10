// The link-preview brand: which section a path belongs to, its emoji and its
// kicker, for the card /og draws and the titles every page shares.
//
// Ashwin, 2026-09-10: "whenever I'm posting a link ... it should say the name
// of the page: Citizen of Nowhere ... something professional and
// representative of the page that is being shared." So a preview is the
// page's own title, the section it sits in, the section's emoji, and the
// Citizen of Nowhere wordmark, on the site's own dark card. No Metro Power
// Rankings wordmark anywhere a link is shared (DESIGN-STANDARDS §9).
//
// Pure: imported by the edge route and by lib/seo, so no fs here.

export type OgSection = { emoji: string; kicker: string };

// Longest prefix wins; keep the deeper paths above the shallower ones.
const SECTIONS: [string, OgSection][] = [
  ["/teams/nfl", { emoji: "🏈", kicker: "NFL" }],
  ["/teams/football", { emoji: "⚽", kicker: "Club football" }],
  ["/teams/national", { emoji: "🌐", kicker: "National teams" }],
  ["/teams/wnational", { emoji: "🌐", kicker: "National teams" }],
  ["/teams/cricket", { emoji: "🏏", kicker: "Cricket" }],
  ["/teams/rugby-union", { emoji: "🏉", kicker: "Rugby union" }],
  ["/teams/rugby-league", { emoji: "🏉", kicker: "Rugby league" }],
  ["/teams/basketball", { emoji: "🏀", kicker: "Basketball" }],
  ["/teams/baseball", { emoji: "⚾", kicker: "Baseball" }],
  ["/teams/hockey", { emoji: "🏒", kicker: "Hockey" }],
  ["/teams/golf", { emoji: "⛳", kicker: "Golf" }],
  ["/teams/tennis", { emoji: "🎾", kicker: "Tennis" }],
  ["/teams/olympics", { emoji: "🥇", kicker: "Olympics" }],
  ["/teams/handball", { emoji: "🤾", kicker: "Handball" }],
  ["/teams/volleyball", { emoji: "🏐", kicker: "Volleyball" }],
  ["/teams", { emoji: "🏆", kicker: "Sports" }],
  ["/sports", { emoji: "🏆", kicker: "Sports" }],
  ["/predictions", { emoji: "🎯", kicker: "Predictions" }],
  ["/play", { emoji: "🎮", kicker: "Play" }],
  ["/elections", { emoji: "🗳️", kicker: "Elections" }],
  ["/countries/2100", { emoji: "🌍", kicker: "Countries to 2100" }],
  ["/countries", { emoji: "🌍", kicker: "Countries" }],
  ["/orgs", { emoji: "🤝", kicker: "Organisations" }],
  ["/order", { emoji: "🏛️", kicker: "World order" }],
  ["/business/economy", { emoji: "📈", kicker: "Economy" }],
  ["/business", { emoji: "💼", kicker: "Business" }],
  ["/sound", { emoji: "🎵", kicker: "The Sound of the Metros" }],
  ["/screen", { emoji: "🎬", kicker: "Screen" }],
  ["/culture", { emoji: "🎭", kicker: "Culture" }],
  ["/time-machine", { emoji: "⏳", kicker: "Time machine" }],
  ["/rankings", { emoji: "🏙️", kicker: "Metro rankings" }],
  ["/updates", { emoji: "📝", kicker: "Updates" }],
];

export function ogSectionFor(path: string): OgSection {
  const p = path.startsWith("/") ? path : `/${path}`;
  for (const [prefix, s] of SECTIONS) {
    if (p === prefix || p.startsWith(prefix + "/")) return s;
  }
  return { emoji: "🧭", kicker: "" };
}

/** The share-card URL for a page: its own title, its section's emoji and kicker. */
export function ogImagePath(title: string, path: string): string {
  // A page may hand over its absolute URL; only the path names the section.
  const p = /^https?:\/\//.test(path) ? new URL(path).pathname : path;
  const q = new URLSearchParams({ t: title.slice(0, 90), p });
  return `/og?${q.toString()}`;
}
