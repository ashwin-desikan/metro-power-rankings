import FinalsBracket, { type BracketTeam } from "@/app/teams/_shared/FinalsBracket";
import { fgFor, type FootyFranchise } from "@/lib/_footy";
import type { FootyFinalsBundle } from "@/lib/footyFinals";
import { fmtOdds, simBySlug, type SeasonSimFile } from "@/lib/seasonSim";
import type { FootyCopy } from "./config";

// The AFL / NRL half of the shared bracket, fed by public/data/{afl,nrl}/
// finals.json (scripts/ingest/footy_finals.py).
//
// 🔴 THIS IS AN ADAPTER, NOT A SECOND BRACKET. Everything that draws is in
// app/teams/_shared/FinalsBracket.tsx, which the NFL hub renders too. This file
// exists only to turn FootyCopy, the franchise list and the season sim into the
// props that component takes, and every string below is the string the old
// self-contained component built for itself, so the AFL and NRL hubs render
// exactly the markup they rendered before the move.

export default function FootyFinalsBracket({ copy, bundle, franchises, sim }: {
  copy: FootyCopy; bundle: FootyFinalsBundle; franchises: FootyFranchise[];
  sim?: SeasonSimFile | null;
}) {
  const teams: BracketTeam[] = franchises.map((f) => ({
    slug: f.slug, name: f.name, color: f.color,
    fg: f.color.startsWith("#") ? fgFor(f.color) : "#fff",
    color2: f.color2, abbr: f.abbr,
  }));
  // The season-sim freshness gate (simIsCurrent) requires regular-season
  // games remaining, which is exactly wrong during finals; the bracket keeps
  // its own 10-day window instead, and drops odds once the premier is known.
  const simFresh =
    sim && sim.table.length > 0 &&
    Date.now() - new Date(`${sim.meta.generated_at}T00:00:00Z`).getTime() < 10 * 24 * 3600 * 1000;
  const odds = simFresh
    ? new Map(
        [...(simBySlug(sim) as unknown as Map<string, { p_title: number }>)].map(
          ([slug, row]) => [slug, fmtOdds(row.p_title)] as const,
        ),
      )
    : null;
  const doubleChance =
    copy.league === "afl"
      ? "Top-10 wildcard format: 7th–10th play off for the last two finals spots; qualifying-final losers get a second chance in the semi finals."
      : "Final-eight system: qualifying-final losers get a second chance in the semi finals; elimination-final losers are out.";
  return (
    <FinalsBracket
      bundle={bundle}
      teams={teams}
      hrefBase={`/teams/${copy.league}`}
      anchorId="finals-bracket"
      heading={<>{bundle.meta.season} Finals</>}
      blurb={doubleChance}
      oddsNote={odds ? ` Small figures are each club's live ${copy.premierWord.toLowerCase()} odds (20k-sim model, refreshed daily).` : ""}
      odds={odds}
      championEyebrow={<>{bundle.meta.season} {copy.premiersWord}</>}
      footnoteLead="Fixtures and scores from ESPN, refreshed several times daily during the finals · last updated"
      footnoteTail=". Later rounds appear as the draw resolves."
      locale="en-AU"
      timeZone="Australia/Sydney"
    />
  );
}
