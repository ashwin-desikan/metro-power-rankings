import FinalsBracket, { type BracketTeam } from "@/app/teams/_shared/FinalsBracket";
import type { Franchise } from "@/lib/nfl";
import { monogramFor } from "@/lib/nfl";
import type { NflPlayoffsBundle } from "@/lib/nflPlayoffs";

// The NFL half of the shared bracket, fed by public/data/nfl/playoffs.json
// (scripts/nfl/nfl_playoffs.py).
//
// 🔴 THIS IS AN ADAPTER, NOT A SECOND BRACKET. Everything that draws lives in
// app/teams/_shared/FinalsBracket.tsx, which the AFL and NRL hubs render too.
// This file only turns the franchise list into the crest/monogram rows that
// component takes and supplies the NFL's wording.
//
// The season year and the playoff year are not the same number. ESPN stamps
// the 2025 season on a Super Bowl played in February 2026, and the reader on
// the hub in January is thinking about the year on the calendar in front of
// them, so the heading is season + 1 throughout.

export default function NflPlayoffsBracket({ bundle, franchises }: {
  bundle: NflPlayoffsBundle; franchises: Franchise[];
}) {
  const teams: BracketTeam[] = franchises.map((f) => {
    const m = monogramFor(f.slug);
    return { slug: f.slug, name: f.name, color: m.bg, fg: m.fg, color2: m.bg, abbr: m.mono };
  });
  const playoffYear = bundle.meta.season + 1;
  return (
    <FinalsBracket
      bundle={bundle}
      teams={teams}
      hrefBase="/teams/nfl"
      anchorId="playoffs-bracket"
      heading={<>{playoffYear} Playoffs</>}
      blurb="Single elimination: seven teams from each conference, a first-round bye for each top seed, and the two survivors meet at a neutral site."
      oddsNote=""
      odds={null}
      championEyebrow={<>{playoffYear} Super Bowl champions</>}
      footnoteLead="Fixtures and scores from ESPN, refreshed through January and February · last updated"
      footnoteTail=". Later rounds appear as the bracket resolves."
      locale="en-US"
      timeZone="America/New_York"
    />
  );
}
