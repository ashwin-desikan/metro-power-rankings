// One icon per country-page section, keyed by the section's DOM id.
//
// Single source of truth on purpose: the nav chips (CountryNav, a client
// component) and the section headings (server components, several separate
// files) both read from here, so an icon can never say one thing in the menu
// and another on the page. Plain data module with no "use client" so either
// side can import it.
//
// Emoji rather than an icon font: the site already uses them in TabHeader and
// they need no new dependency. NOTE the standing exception - FLAG emoji do not
// render on Windows and must use flagCdnUrl() images instead; none of these are
// flags, so they are safe.
//
// Always render with aria-hidden. These are decorative; the section title is
// the accessible name.

export const SECTION_ICON: Record<string, string> = {
  "at-a-glance": "📋",
  economy: "💹",
  orgs: "🤝",
  leaders: "🏛️",
  power: "📈",
  conflicts: "⚔️",
  constituents: "🧩",
  subdivisions: "🗂️",
  geography: "🗺️",
  metros: "🏙️",
  billionaires: "💰",
  "national-teams": "🏆",
  "league-hubs": "🏟️",
};

/** Icon for a section id, or an empty string when the id is unknown. */
export function sectionIcon(id: string): string {
  return SECTION_ICON[id] ?? "";
}

/** `<title>` prefixed with its icon, for a Collapsible `title` prop. */
export function withIcon(id: string, title: string): string {
  const i = SECTION_ICON[id];
  return i ? `${i} ${title}` : title;
}
