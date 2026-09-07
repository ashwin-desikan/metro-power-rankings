import Link from "next/link";
import { CollapsibleSection } from "@/app/_shared/CollapsibleSection";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import { DataBar } from "@/app/_shared/DataBar";
import {
  CROSS_LEAGUE_NOTE,
  VALUE_FIRST_SEASON,
  getLeagueSkillTable,
  getLeagueValueConcentration,
  type ConcentrationPoint,
  type LeagueSkillRow,
} from "@/lib/footballSeasonExpectation";

// Two strips for a top-flight league hub, both CollapsibleSection so a phone
// gets them folded and a desktop gets them open (DESIGN-STANDARDS §2).
//
//  1. How predictable is this league — each league's skill against ITS OWN era
//     baseline, read from the payloads (intl index.json plus the English
//     ledger's meta). Never hardcoded: the numbers move when the ledger
//     rebuilds, and a frozen copy would go quietly wrong.
//  2. Concentration — the top club's share of the league's total squad value
//     each June, from 2012-13 only, because that is where lib/clubValue starts.
//
// 🔴 THE SKILL STRIP IS CROSS-LEAGUE, so CROSS_LEAGUE_NOTE rides with it.
// 🔴 CREDITS RIDE WITH THE DATA: engsoccerdata under the skill strip,
// Transfermarkt via dcaribou/transfermarkt-datasets under the value strip.

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const eurM = (v: number) => `€${Math.round(v).toLocaleString("en-GB")}m`;

function SkillStrip({ rows, hubSlug }: { rows: LeagueSkillRow[]; hubSlug: string }) {
  // One column maximum for every bar in the column, computed once here.
  const max = Math.max(...rows.map((r) => r.skill), 0.0001);
  return (
    <ol className="space-y-1.5">
      {rows.map((r) => {
        const mine = r.hubSlug === hubSlug;
        return (
          <li key={r.hubSlug} className="flex items-center gap-2 min-w-0">
            <span
              className={`w-28 sm:w-40 flex-shrink-0 truncate text-xs ${mine ? "font-semibold" : ""}`}
              style={{ color: mine ? "var(--text)" : "var(--text-muted)" }}
            >
              {mine ? r.competition : (
                <Link href={`/teams/football/leagues/${r.hubSlug}`} className="hover:text-[var(--accent)]">
                  {r.competition}
                </Link>
              )}
            </span>
            <span className="h-2.5 flex-1 min-w-0 rounded-sm" style={{ background: "var(--bg)" }}>
              <span
                className="block h-2.5 rounded-sm"
                style={{
                  width: `${Math.max(3, (r.skill / max) * 100)}%`,
                  background: mine ? "var(--accent)" : "var(--seq-3)",
                }}
              />
            </span>
            <span className="w-14 flex-shrink-0 text-right tabular-nums text-xs text-[var(--text-muted)]" style={mono}>
              +{r.skill.toFixed(4)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A step line: the source is a per-season reading, so nothing interpolates. */
function ShareSteps({ points }: { points: ConcentrationPoint[] }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 84;
  const lo = Math.min(...points.map((p) => p.share));
  const hi = Math.max(...points.map((p) => p.share));
  const pad = Math.max(0.01, (hi - lo) * 0.15);
  const y0 = Math.max(0, lo - pad);
  const y1 = hi + pad;
  const x = (i: number) => (i / points.length) * W;
  const y = (v: number) => H - ((v - y0) / (y1 - y0)) * H;
  const step = points.length ? W / points.length : W;
  let d = `M ${x(0)} ${y(points[0].share)}`;
  points.forEach((p, i) => {
    d += ` L ${x(i) + step} ${y(p.share)}`;
    if (i < points.length - 1) d += ` L ${x(i) + step} ${y(points[i + 1].share)}`;
  });
  const last = points[points.length - 1];
  return (
    <div className="min-w-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-20"
        role="img"
        aria-label={`Top club's share of league squad value, ${points[0].season} to ${last.season}, ${pct(points[0].share)} to ${pct(last.share)}`}
      >
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex items-baseline justify-between text-[10px] text-[var(--text-dim)] tabular-nums" style={mono}>
        <span>{points[0].season}</span>
        <span>
          {pct(y0)} to {pct(y1)}
        </span>
        <span>{last.season}</span>
      </div>
    </div>
  );
}

export default async function LeagueLedgerSections({
  hubSlug,
  country,
  league,
}: {
  hubSlug: string;
  country: string;
  league: string;
}) {
  const [{ rows, sourceCredit }, { points, valueCredit }] = await Promise.all([
    getLeagueSkillTable(),
    getLeagueValueConcentration(country),
  ]);
  const mine = rows.find((r) => r.hubSlug === hubSlug) ?? null;
  const latest = points.length ? points[points.length - 1] : null;
  if (!mine && !latest) return null;

  return (
    <>
      {mine && rows.length > 1 && (
        <CollapsibleSection
          id="predictability"
          title="How predictable is this league"
          sub="Higher means results tracked the form book more closely than this league's own era."
          meta={<span className="tabular-nums">+{mine.skill.toFixed(4)}</span>}
          more={
            <>
              <p>
                Every match is scored against a pre-game probability, and the model&apos;s log loss is
                compared with the same trailing window carrying no ratings at all. The figure is that
                improvement: how much knowing the clubs beats knowing nothing. {league} runs from{" "}
                {mine.seasons[0]} to {mine.seasons[1]}, {mine.matches.toLocaleString("en-GB")} matches.
              </p>
              <p className="mt-2">
                {CROSS_LEAGUE_NOTE} The baseline is each league&apos;s own era, so a high figure means a
                predictable league, not a strong one.
              </p>
              {sourceCredit ? <p className="mt-2 text-xs text-[var(--text-dim)]">{sourceCredit}</p> : null}
            </>
          }
        >
          <SkillStrip rows={rows} hubSlug={hubSlug} />
          {sourceCredit ? (
            <p className="mt-3 text-[11px] text-[var(--text-dim)]">{sourceCredit}</p>
          ) : null}
        </CollapsibleSection>
      )}

      {latest && (
        <CollapsibleSection
          id="concentration"
          title="Concentration"
          sub="The most valuable squad's share of every priced squad in the league, each June."
          meta={<span className="tabular-nums">{pct(latest.share)}</span>}
          more={
            <>
              <p>
                Squad values are read at the end of each season (June) and summed across every club in
                that season&apos;s league whose squad is priced. The n beside a figure is the players
                valued behind it; a club under fifteen priced players carries no value at all rather
                than a low one, so it is left out of both the top and the total.
              </p>
              <p className="mt-2">
                The series starts at {VALUE_FIRST_SEASON} because that is where the value data starts.
                Earlier totals are an artefact of which players had been priced at the time, not a
                cheaper era, so nothing here reaches back past it.
              </p>
              {valueCredit ? <p className="mt-2 text-xs text-[var(--text-dim)]">{valueCredit}</p> : null}
            </>
          }
        >
          <p className="text-sm text-[var(--text-muted)] max-w-2xl">
            In {latest.season}, {latest.topClub} held {pct(latest.share)} of {league}&apos;s total squad
            value: {eurM(latest.topValue)} of {eurM(latest.total)} across {latest.clubs} priced clubs.
          </p>
          <div className="mt-3 min-w-0">
            <ShareSteps points={points} />
          </div>
          <ResponsiveTable
            compact
            variant="list"
            className="rounded-lg border"
            style={cardStyle}
            mobileNoun="seasons"
            mobileRows={[...points].reverse().map((p) => (
              <RankRow
                key={p.season}
                rank={p.season}
                name={
                  <Link href={`/teams/football/${p.topSlug}`} className="truncate hover:text-[var(--accent)]">
                    {p.topClub}
                  </Link>
                }
                sub={<>{eurM(p.topValue)} of {eurM(p.total)} · {p.clubs} clubs · n {p.topN}</>}
                right={pct(p.share)}
                rightSub="share"
              />
            ))}
          >
            <table className="w-full text-xs min-w-[340px]" data-sticky-col="2">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="py-1 px-1.5 font-medium">Season</th>
                  <th className="py-1 px-1.5 font-medium">Most valuable squad</th>
                  <th className="py-1 px-1.5 font-medium text-right">Share</th>
                  <th className="py-1 px-1.5 font-medium text-right whitespace-nowrap">Top value</th>
                  <th className="py-1 px-1.5 font-medium text-right whitespace-nowrap hidden sm:table-cell">League total</th>
                  <th className="py-1 px-1.5 font-medium text-right hidden sm:table-cell">Clubs</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.season} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1 px-1.5 tabular-nums text-[var(--text-dim)]" style={mono}>{p.season}</td>
                    <td className="py-1 px-1.5 font-medium whitespace-nowrap">
                      <Link href={`/teams/football/${p.topSlug}`} className="hover:text-[var(--accent)]">{p.topClub}</Link>
                    </td>
                    <td className="py-1 px-1.5 text-right">
                      <DataBar v={p.share} scale={100} dp={1} suffix="%" label="share of league squad value" />
                    </td>
                    <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap" style={mono}>
                      {eurM(p.topValue)}
                      <span className="ml-1 text-[10px] text-[var(--text-dim)]">n {p.topN}</span>
                    </td>
                    <td className="py-1 px-1.5 text-right tabular-nums whitespace-nowrap hidden sm:table-cell" style={mono}>{eurM(p.total)}</td>
                    <td className="py-1 px-1.5 text-right tabular-nums hidden sm:table-cell" style={mono}>{p.clubs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
          {valueCredit ? (
            <p className="mt-3 text-[11px] text-[var(--text-dim)]">{valueCredit}</p>
          ) : null}
        </CollapsibleSection>
      )}
    </>
  );
}
