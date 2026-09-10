"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { TableScroll } from "@/app/_shared/TableScroll";
import type { NflHonour, NflEloWeek, NflOddsFile, NflSeedsFile } from "@/lib/nflElo";
import { divAbbr, seedCellMode } from "./SeedTimeline";
import { useThroughWeek, WeekScrubberControl } from "./WeekScrubber";

// One season's standings, grouped the way a reader wants to read them.
//
// 🔴 A STANDINGS TABLE WITHOUT A RECORD IS NOT A STANDINGS TABLE. The first
// build ordered by rating and hid the record behind a `hidden sm:table-cell`,
// and the record it did show was read off the team's LAST week, which the
// workbook leaves blank once a team's regular season is over. So every playoff
// team showed nothing at all in the one column the table exists for.
//
// 🔴 GROUPING IS THE CONTROL, NOT SORTING. "Who won the NFC West" and "who was
// the best team in the league" are different questions and a single column sort
// answers neither well. Division is the default because that is what a standings
// table is; conference and pooled-by-rating are one tap away.
//
// 🔴 CLIENT STATE, NOT A SEARCH PARAM. §6 asks for sort state in the URL, and
// reading searchParams here would make all 107 season pages dynamic and drop
// them out of the static build. FranchiseTable already sets the precedent for
// table state living in the component. The trade-off is that a grouping cannot
// be linked to; the trade the other way is 107 pages rendered per request.
//
// Ordering inside a group is by record, then by rating, unless the season
// has a seeds file (public/data/nfl/seeds, 1978 on), in which case the order
// inside a division and inside a conference is the NFL tiebreaking
// procedure's, week by week, and the seed column is where the team would have
// been seeded had the season ended after the scrubbed week. Before 1978 the
// workbook's tiebreakers are not carried, and the note says so.

export type StandingsTeam = {
  name: string;
  city: string | null;
  team: string | null;
  league: string | null;
  conf: string | null;
  div: string | null;
  end: number;
  rec?: [number, number, number];
  pts?: [number, number];
  seed?: number;
  flags?: Partial<Record<NflHonour, true>>;
  slug: string | null;
  logo: string | null;
  mono: { bg: string; fg: string; mono: string } | null;
  /** The team's weekly series, so the scrubber can read the standings as
   *  they stood after week N: the last week at or before N that carries a
   *  record. Optional; a table without it always shows the final standings. */
  weeks?: NflEloWeek[];
  /** Filled from the seeds file for the scrubbed week: division rank and
   *  conference rank by the tiebreaking procedure. */
  dr?: number;
  cr?: number;
  /** Filled from the odds file for the scrubbed week (1978 on): the share of
   *  drawn seasons in which the club held a seed, and won the title; a
   *  status where wins alone have settled the playoffs. */
  pPlayoffs?: number;
  pTitle?: number;
  oddsStatus?: "in" | "out" | null;
};

// 🔴 A SMALL NUMBER IS NOT AN ELIMINATION, AND 100% IS NOT A CLINCH. 2,000
// draws resolve to a twentieth of a percent; a club the draws never sent
// through is shown as under 1%, never 0%, and "out" is printed only when the
// odds file proved it from the records alone. The same at the top: over 99%,
// and "clinched" only when proved (Ashwin, 2026-09-10: ">99% still feels like
// it says that team could miss the playoffs ... there are many examples of
// teams clinching way before the end of the season").
function fmtOdds(p: number | undefined, status: "in" | "out" | null | undefined): string {
  if (status === "in") return "clinched";
  if (status === "out") return "out";
  if (p == null) return "";
  if (p < 0.005) return "<1%";
  if (p > 0.995) return ">99%";
  return `${Math.round(p * 100)}%`;
}

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };
const BORD: CSSProperties = { borderColor: "var(--border)" };

const HONOURS: { key: NflHonour; label: string; color: string }[] = [
  { key: "play_app", label: "made the playoffs", color: "var(--seq-1)" },
  { key: "div_title", label: "won its division", color: "var(--seq-2)" },
  { key: "best_conf", label: "best record in conference", color: "var(--seq-3)" },
  { key: "cf_app", label: "reached the conference final", color: "var(--seq-4)" },
  { key: "champ_app", label: "reached the championship game", color: "var(--seq-5)" },
  { key: "champ", label: "won the championship", color: "#D4AF37" },
];

function winPct(t: StandingsTeam): number {
  if (!t.rec) return -1;
  const [w, l, d] = t.rec;
  const g = w + l + d;
  return g ? (w + d / 2) / g : -1;
}

function fmtRec(t: StandingsTeam): string {
  if (!t.rec) return "";
  const [w, l, d] = t.rec;
  return d ? `${w}-${l}-${d}` : `${w}-${l}`;
}

function Strip({ t, withheld = false }: { t: StandingsTeam; withheld?: boolean }) {
  const f = t.flags ?? {};
  const earned = HONOURS.filter((h) => f[h.key]);
  const words = withheld
    ? "year-end honours withheld until the season is complete"
    : earned.length
    ? `${t.team ?? t.name} ${earned.map((h) => h.label).join(", ")}`
    : `${t.team ?? t.name} won no year-end honours`;
  return (
    <span className="inline-flex items-center gap-[3px] align-middle" title={words}>
      <span className="sr-only">{words}</span>
      {HONOURS.map((h) => (
        <span key={h.key} aria-hidden className="h-2.5 w-2.5 sm:h-2 sm:w-2" style={{
          borderRadius: 2, display: "inline-block",
          background: f[h.key] ? h.color : "transparent",
          border: f[h.key] ? "none" : "1px solid var(--border)",
        }} />
      ))}
    </span>
  );
}

function Crest({ t, size = 20 }: { t: StandingsTeam; size?: number }) {
  if (t.logo) {
    return <img src={t.logo} alt="" width={size} height={size} className="flex-shrink-0 object-contain"
      style={{ width: size, height: size }} loading="lazy" decoding="async" />;
  }
  if (t.mono) {
    return <span aria-hidden className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{ background: t.mono.bg, color: t.mono.fg, width: size, height: size, fontSize: size * 0.36, fontWeight: 700 }}>
      {t.mono.mono}</span>;
  }
  return <span aria-hidden className="inline-block flex-shrink-0 rounded-full"
    style={{ width: size, height: size, border: "1px solid var(--border)" }} />;
}

type View = "division" | "conference" | "rating";

// Column order: AFC before NFC, NFL before AFL, Eastern before Western; a
// key not listed sorts after them by name.
const COLUMN_ORDER = ["AFC", "NFC", "NFL", "AFL", "AAFC", "Eastern", "Western"];
function columnRank(k: string): number {
  const i = COLUMN_ORDER.indexOf(k);
  return i < 0 ? COLUMN_ORDER.length : i;
}
// Division order inside a column: East, Central or North, South, West; the
// 1967-69 names (Capitol, Century, Central, Coastal) fall through to
// alphabetical, which happens to be the order the league listed them.
const DIVISION_ORDER = ["East", "Eastern", "Central", "North", "South", "West", "Western"];
function divisionRank(k: string): number {
  const last = k.split(" ").pop() ?? k;
  const i = DIVISION_ORDER.indexOf(last);
  return i < 0 ? DIVISION_ORDER.length : i;
}

export default function SeasonStandings({
  teams: finalTeams,
  showHonours: finalHonours,
  showSeeds: finalSeeds,
  seeds = null,
  odds = null,
}: {
  teams: StandingsTeam[];
  showHonours: boolean;
  showSeeds: boolean;
  seeds?: NflSeedsFile | null;
  odds?: NflOddsFile | null;
}) {
  // 🔴 THE SCRUBBER REWRITES THE ROWS, NOT THE TABLE. After week N a team's
  // record, points and rating are the last stored week at or before N that
  // carries a record (the workbook stops writing W/L/T once a team's regular
  // season ends, so a January week inherits the final record). Honours and
  // seeds are season-end facts and are not shown mid-season: a strip that
  // says "won the championship" next to a 3-2 record is a lie about time.
  const through = useThroughWeek();
  // The seeds file's week for this view: the scrubbed week, or the last
  // regular-season week it covers for the final table. Null when the file is
  // missing (before 1978, or a live season before its first Friday build) or
  // the week is outside it (week 0, a playoff week).
  const seedWeek =
    seeds && (through == null ? seeds.through_week : through >= 1 && through <= seeds.through_week ? through : null);
  const seedRow = (name: string) => {
    if (!seeds || seedWeek == null) return null;
    const t = seeds.teams[name];
    if (!t) return null;
    return { seed: t.seed[seedWeek - 1] ?? undefined, dr: t.dr[seedWeek - 1], cr: t.cr[seedWeek - 1] };
  };
  // The odds file is indexed from week 0 (before a game), so the scrubbed
  // week is its index; the final table shows the odds entering the playoffs,
  // which is the last regular-season week the file covers. A playoff week
  // (past reg_end) keeps that last week too: the odds file has no later one.
  const oddsWeek =
    odds && (through == null ? odds.through_week : Math.min(through, odds.through_week));
  const oddsRow = (name: string) => {
    if (!odds || oddsWeek == null) return null;
    const t = odds.teams[name];
    if (!t) return null;
    return { pPlayoffs: t.playoffs[oddsWeek], pTitle: t.title[oddsWeek], oddsStatus: t.status[oddsWeek] ?? null };
  };
  const teams: StandingsTeam[] = through == null
    ? finalTeams.map((t) => {
        const sr = seedRow(t.name);
        const od = oddsRow(t.name);
        return { ...t, ...(sr ? { dr: sr.dr, cr: sr.cr } : {}), ...(od ?? {}) };
      })
    : finalTeams.map((t) => {
        const ws = (t.weeks ?? []).filter((w) => w.w <= through);
        const last = ws.length ? ws[ws.length - 1] : null;
        const withRec = [...ws].reverse().find((w) => w.rec);
        const sr = seedRow(t.name);
        const od = oddsRow(t.name);
        return {
          ...t,
          end: last ? last.e : t.end,
          rec: withRec ? withRec.rec : undefined,
          pts: withRec ? withRec.pts : undefined,
          seed: sr ? sr.seed : undefined,
          dr: sr?.dr,
          cr: sr?.cr,
          flags: undefined,
          ...(od ?? {}),
        };
      });
  // The odds columns are decided once per page, like the seed column: a
  // season with an odds file carries them at every week, week 0 included.
  // Before 1933 the standings leader IS the champion, so the two numbers are
  // one number and only the title column is shown.
  const titleCol = Boolean(odds);
  const oddsCol = Boolean(odds) && seeds?.label !== "leader";
  const seeded = seedWeek != null && teams.some((t) => t.cr != null);
  // Division-only eras (1933-69) get a chip, not a number: see SeedTimeline.
  // The pool and division come from the SEEDS file, not the standings row:
  // the 1969 NFL rows carry no conf of their own and fell through to a
  // number while the AFL beside them showed the chip.
  const seedPool = (t: StandingsTeam) => seeds?.teams[t.name]?.conf ?? t.conf ?? "";
  const seedDiv = (t: StandingsTeam) => seeds?.teams[t.name]?.div ?? t.div ?? "";
  const seedMode = (t: StandingsTeam) => seedCellMode(seeds?.label ?? "seed", seeds?.pools?.[seedPool(t)]);
  // Level for a title that would be played off (before 1970): a starred, dashed chip.
  const seedTied = (t: StandingsTeam) => seedWeek != null && Boolean(seeds?.teams[t.name]?.tie?.[seedWeek - 1]);
  const showHonours = through == null && finalHonours;
  // 🔴 COLUMNS DO NOT COME AND GO WITH THE SCRUBBER. A column that mounts at
  // "Final" and unmounts at week 9 changes every table's width mid-drag, which
  // is the "whole thing being pulled" Ashwin felt. The seed and season columns
  // are decided once per page; mid-season they show a dash and an empty strip.
  const seedsCol = finalSeeds || Boolean(seeds);
  const honoursCol = finalHonours;
  const showSeeds = (through == null && finalSeeds) || (through != null && seeded);
  const hasDiv = teams.some((t) => t.div && t.div !== t.conf);
  const hasConf = teams.some((t) => t.conf);
  const [view, setView] = useState<View>(hasDiv ? "division" : hasConf ? "conference" : "rating");

  // 🔴 ORDER IS A RULING, NOT A SORT KEY.
  //
  // Division: the division winner is first, whatever its record. Carolina went
  // 9-8 and finished third on record in the 2025 NFC South and still won the
  // division, and a standings table that lists the winner third is wrong in the
  // only way a standings table can be wrong.
  //
  // Conference: by RECORD, not by seed. Division winners take the top four
  // seeds, so seeding order would put a 9-8 champion above a 13-4 wild card and
  // quietly answer a different question from the one the column asks.
  //
  // Ties: a team that reached the playoffs is placed above one that did not on
  // the same record. That is not a tiebreaker, it is the RESULT of the
  // tiebreakers, which this workbook does not carry. Where two teams tie and
  // both or neither made it, rating breaks it and the note under the table says
  // the order inside a tie is not authoritative.
  const madePlayoffs = (t: StandingsTeam) => (t.flags?.play_app ? 1 : 0);
  const wonDivision = (t: StandingsTeam) => (t.flags?.div_title ? 1 : 0);

  const byRecord = (a: StandingsTeam, b: StandingsTeam) =>
    winPct(b) - winPct(a)
    || (b.rec?.[0] ?? 0) - (a.rec?.[0] ?? 0)
    || madePlayoffs(b) - madePlayoffs(a)
    || b.end - a.end;
  const byDivision = (a: StandingsTeam, b: StandingsTeam) =>
    wonDivision(b) - wonDivision(a) || byRecord(a, b);
  const byRating = (a: StandingsTeam, b: StandingsTeam) => b.end - a.end;
  // With a seeds file the procedure's own order replaces the ruling above:
  // division rank inside a division, conference rank inside a conference
  // (which is seeding order: division winners first, then the wild cards,
  // then the rest in the order they would have been seeded).
  const byDr = (a: StandingsTeam, b: StandingsTeam) => (a.dr ?? 99) - (b.dr ?? 99) || byDivision(a, b);
  const byCr = (a: StandingsTeam, b: StandingsTeam) => (a.cr ?? 99) - (b.cr ?? 99) || byRecord(a, b);

  const keyFor = (t: StandingsTeam) =>
    view === "division" ? (t.div || t.conf || t.league || "NFL")
      : view === "conference" ? (t.conf || t.league || "NFL")
      : (t.league || "NFL");

  const twoLeagues = new Set(teams.map((t) => t.league || "NFL")).size > 1;
  const groups = new Map<string, StandingsTeam[]>();
  for (const t of teams) {
    const k = keyFor(t);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const ordered = [...groups.entries()]
    .map(([k, ts]) => ({
      key: k,
      teams: [...ts].sort(view === "rating" ? byRating : view === "division" ? (seeded ? byDr : byDivision) : seeded ? byCr : byRecord),
      // The column a group belongs in: the league in the years two leagues
      // ran (NFL left, AFL right, the NFL's Eastern and Western conferences
      // stacked inside it), otherwise the conference, otherwise the league.
      column: view === "rating" ? (ts[0].league || "NFL") : twoLeagues ? (ts[0].league || "NFL") : (ts[0].conf || ts[0].league || "NFL"),
      conf: ts[0].conf || "",
    }))
    .sort((a, b) =>
      columnRank(a.column) - columnRank(b.column) || a.column.localeCompare(b.column)
      || columnRank(a.conf) - columnRank(b.conf) || a.conf.localeCompare(b.conf)
      || divisionRank(a.key) - divisionRank(b.key) || a.key.localeCompare(b.key));

  // 🔴 ONE COLUMN PER CONFERENCE, ALWAYS IN THE SAME ORDER (Ashwin,
  // 2026-09-09: "AFC at the top and NFC at the bottom is a weird thing to
  // look at"). AFC left, NFC right; NFL left, AFL right in the sixties; the
  // Eastern and Western conferences of 1967 to 1969 likewise. Inside a
  // column the divisions run East, Central or North, South, West, so the
  // same division sits in the same place on every season page from 1970 to
  // today, and the eye learns where to look.
  const columns = [...new Set(ordered.map((g) => g.column))].map((c) => ({
    key: c,
    groups: ordered.filter((g) => g.column === c),
  }));

  const options: { v: View; label: string; on: boolean }[] = [
    { v: "division", label: "By division", on: hasDiv },
    { v: "conference", label: "By conference", on: hasConf },
    { v: "rating", label: "By rating", on: true },
  ];

  const cols = columns.length > 1 ? "grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-6" : "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="How to group the standings">
        {options.filter((o) => o.on).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setView(o.v)}
            aria-pressed={view === o.v}
            className="text-xs px-3 min-h-11 sm:min-h-9 rounded-md border transition inline-flex items-center"
            style={{
              background: view === o.v ? "var(--bg-card-hover)" : "var(--bg-card)",
              borderColor: view === o.v ? "var(--accent)" : "var(--border)",
              color: view === o.v ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {o.label}
          </button>
        ))}
        <WeekScrubberControl className="sm:ml-auto" />
      </div>
      {through != null ? (
        <p className="text-xs mb-3 min-h-[2lh]" style={{ color: "var(--text-muted)" }}>
          {through === 0
            ? "Before a game was played: the preseason ratings, ordered by rating, with no record to show."
            : seeded
              ? `As the table stood after week ${through}: record, points and rating from that week, the order and the ${seeds!.label === "seed" ? "seed" : "playoff"} column by the tiebreaking procedure of the era as if the season had ended there, honours withheld until the season is complete.`
              : `As the table stood after week ${through}: record, points and rating from that week, the tiebreakers still not authoritative, honours and seeds withheld until the season is complete.`}
        </p>
      ) : (
        <p className="text-xs mb-3 min-h-[2lh]" style={{ color: "var(--text-muted)" }}>
          {seeded && view !== "rating"
            ? "Order inside a division and a conference by the NFL tiebreaking procedure; the conference view is seeding order, division winners first."
            : ""}
        </p>
      )}

      {/* 🔴 IT HAS TO FIT. Eight division tables in two columns is 546px of
          usable width each, and the first build spent 641px on eight columns
          with px-3 padding, so every division scrolled sideways inside its own
          box. Eight boxes, eight scrolls, to read one season.

          The budget, and what it bought: the rank column went (a four-team
          division does not need one, and the seed column carries playoff order
          anyway), the city went (the crest carries it), points for and against
          became one cell, and the padding dropped to px-2. That is 427px, which
          fits with room. On a phone the two widest numeric columns move into a
          second line under the team name rather than off the edge, so the phone
          still gets every number the desktop does. The two odds columns
          (2026-09-10) took the room: 529px in a 531px box with a numeric seed,
          550 with the 1933-69 division chip until their headers lost the "%"
          and their padding dropped to px-1.5 (measured at 1280 on 1963). */}
      <div className={cols}>
        {columns.map((col) => (
        <div key={col.key} className="min-w-0 flex flex-col gap-6">
        {col.groups.map((g) => (
          <div key={g.key} className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">{g.key}</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="1">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-2 font-medium">Team</th>
                    <th className="py-2 px-2 font-medium text-right whitespace-nowrap">W-L-T</th>
                    <th className="py-2 px-2 font-medium text-right hidden sm:table-cell">PF-PA</th>
                    <th className="py-2 px-2 font-medium text-right">Elo</th>
                    {seedsCol ? <th className="py-2 px-1.5 font-medium text-right hidden sm:table-cell">{seeds && seeds.label !== "seed" ? "Playoffs" : "Seed"}</th> : null}
                    {oddsCol ? <th className="py-2 px-1.5 font-medium text-right hidden sm:table-cell whitespace-nowrap" title="Odds of a playoff place, drawn from the ratings of that week; clinched or out once the records settle it">Playoff</th> : null}
                    {titleCol ? <th className="py-2 px-1.5 font-medium text-right hidden sm:table-cell whitespace-nowrap" title="Odds of the title, drawn from the ratings of that week: the league championship to 1965, the Super Bowl from 1966">Title</th> : null}
                    {honoursCol ? <th className="py-2 px-1.5 font-medium whitespace-nowrap hidden sm:table-cell">Season</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {g.teams.map((t) => (
                    /* 🔴 THE ROW IS THE TAP TARGET ON A PHONE. A 28px table row
                       with a 60px link in it gives a thumb about a fifth of the
                       row and puts the rest of the misses on nothing. `tap-row`
                       + `tap-target` (globals.css) is the site's answer for a
                       row a link cannot wrap: the link grows a pseudo-element
                       over the whole row while keeping its inline styling. The
                       row also clears 44px on a phone and stays compact where a
                       pointer is doing the aiming. */
                    <tr key={t.name} className="border-t tap-row"
                      style={seeded && view === "conference" && t.cr === (seeds!.pools?.[t.conf ?? ""]?.seeds ?? seeds!.seeds_per_conf) + 1
                        ? { borderColor: "var(--accent)", borderTopWidth: 2 }
                        : BORD}>
                      <td className="py-2 sm:py-1.5 px-2 align-middle" style={{ minHeight: 44 }}>
                        <span className="inline-flex items-center gap-1.5">
                          <Crest t={t} size={18} />
                          {/* 🔴 CITY AND TEAM, STACKED (Ashwin, 2026-09-10, on 1925: "it
                              doesn't look that good ... when you just have the team name,
                              because a lot of teams had similar names like Bulldogs. I
                              think you need to bring back the city"). The city sits above
                              the team in 10px, so the cell is as wide as the longer of the
                              two words rather than both, and the column budget below holds. */}
                          {t.slug ? (
                            <Link href={`/teams/nfl/${t.slug}`} className="tap-target hover:text-[var(--accent)] hover:underline whitespace-nowrap inline-flex flex-col leading-tight"
                              title={[t.city, t.team].filter(Boolean).join(" ") || t.name}>
                              {t.city?.trim() ? <span className="text-[10px] font-normal tracking-wide text-[var(--text-dim)]">{t.city.trim()}</span> : null}
                              <span>{t.team ?? t.name}</span>
                            </Link>
                          ) : (
                            <span className="whitespace-nowrap inline-flex flex-col leading-tight">
                              {t.city?.trim() ? <span className="text-[10px] tracking-wide text-[var(--text-dim)]">{t.city.trim()}</span> : null}
                              <span>{t.team ?? t.name}</span>
                            </span>
                          )}
                          {t.flags?.div_title ? (
                            <span title="won its division" className="text-[9px] uppercase tracking-wider px-1 rounded border flex-shrink-0"
                              style={{ borderColor: "var(--seq-3)", color: "var(--seq-4)" }}>div</span>
                          ) : null}
                        </span>
                        {/* The phone's second line: nothing is dropped, it moves. */}
                        <span className="sm:hidden block mt-0.5 pl-[26px] text-[12px] text-[var(--text-dim)] tabular-nums" style={MONO}>
                          {t.pts ? `${t.pts[0]}-${t.pts[1]}` : "no points recorded"}
                          {t.seed ? (seedMode(t) === "div" ? " · leads division" : seedMode(t) === "divrank" ? ` · ${ordinalWord(t.dr ?? t.seed)} in division` : seedTied(t) ? " · level, playoff to come" : ` · ${t.seed} seed`) : ""}
                        </span>
                        {/* The phone's third line: the odds, and the season strip, which on a
                            phone lives here rather than in a column of its own so the name
                            column keeps the width the two extra lines need (measured
                            2026-09-10: rows of 111px with the strip in its own column, 60
                            with it here). */}
                        {titleCol && t.pTitle != null ? (
                          <span className="sm:hidden block pl-[26px] text-[12px] text-[var(--text-dim)] tabular-nums" style={MONO}>
                            {t.oddsStatus === "out" ? "out" : `${oddsCol ? `${t.oddsStatus === "in" ? "clinched" : `playoffs ${fmtOdds(t.pPlayoffs, null)}`} · ` : ""}title ${fmtOdds(t.pTitle, null)}`}
                          </span>
                        ) : null}
                        {honoursCol && showHonours ? (
                          <span className="sm:hidden block mt-1 pl-[26px]">
                            <Strip t={t} />
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 sm:py-1.5 px-2 text-right tabular-nums whitespace-nowrap align-middle" style={MONO}>
                        {fmtRec(t) || <span className="text-[var(--text-dim)]">&mdash;</span>}
                        {t.flags?.best_rec ? (
                          <span title="best record in the league" className="ml-0.5 text-[var(--accent)]">*</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap" style={MONO}>
                        {t.pts ? `${t.pts[0]}-${t.pts[1]}` : ""}
                      </td>
                      <td className="py-2 sm:py-1.5 px-2 text-right tabular-nums font-semibold align-middle" style={MONO}>{t.end.toFixed(0)}</td>
                      {seedsCol ? (
                        <td className="py-1.5 px-1.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                          {showSeeds && t.seed ? (
                            seedMode(t) === "div" ? (
                              /* A division-only era: the number was a rank between clubs that never
                                 competed for the same place. The chip says what is true instead. */
                              <span title={
                                  seedTied(t) ? `level for the ${seedDiv(t)}${through != null ? ` after week ${through}` : ""}; a playoff would decide it`
                                  : through != null ? `leading the ${seedDiv(t)} after week ${through}` : `won the ${seedDiv(t)}`}
                                className="text-[9px] uppercase tracking-wider px-1 rounded border"
                                style={{ borderColor: "var(--accent)", color: "var(--accent)", borderStyle: seedTied(t) ? "dashed" : "solid" }}>{divAbbr(seedDiv(t), seedPool(t))}{seedTied(t) ? "*" : ""}</span>
                            ) : (
                              <span className="inline-grid place-items-center rounded-full"
                                title={
                                  seedTied(t)
                                    ? `level for the league title${through != null ? ` after week ${through}` : ""}; a playoff would decide it`
                                    : seedMode(t) === "divrank"
                                    ? `${ordinalWord(t.dr ?? t.seed)} in the ${seedDiv(t)}${through != null ? ` after week ${through}` : ""}, a playoff place`
                                    : through != null ? (seeds?.label === "seed" ? `the ${t.seed} seed had the season ended after week ${through}` : seeds?.label === "place" ? `in the playoffs had the season ended after week ${through}` : `the league leader after week ${through}`) : `entered the playoffs as the ${t.seed} seed`
                                }
                                style={{ width: seedTied(t) ? 22 : 17, height: 17, background: "var(--bg-card-hover)", border: `1px ${seedTied(t) ? "dashed" : "solid"} ${(seedMode(t) === "divrank" ? (t.dr ?? t.seed) === 1 : t.seed <= 4) ? "var(--accent)" : "var(--border)"}`, fontSize: 10 }}>
                                {seedMode(t) === "divrank" ? t.dr ?? t.seed : t.seed}{seedTied(t) ? "*" : ""}
                              </span>
                            )
                          ) : <span className="text-[var(--text-dim)]">&mdash;</span>}
                        </td>
                      ) : null}
                      {oddsCol ? (
                        <td className="py-1.5 px-1.5 text-right tabular-nums hidden sm:table-cell whitespace-nowrap" style={MONO}
                          title={t.pPlayoffs != null ? `${(t.pPlayoffs * 100).toFixed(1)}% of ${odds!.sims.toLocaleString("en-GB")} drawn seasons${t.oddsStatus === "in" ? "; clinched on the records alone" : t.oddsStatus === "out" ? "; eliminated on the records alone" : ""}` : undefined}>
                          {t.pPlayoffs != null ? (
                            <span style={{ color: t.oddsStatus === "in" ? "var(--accent)" : t.oddsStatus === "out" ? "var(--text-dim)" : "var(--text-muted)", fontWeight: t.oddsStatus ? 600 : 400 }}>
                              {fmtOdds(t.pPlayoffs, t.oddsStatus)}
                            </span>
                          ) : <span className="text-[var(--text-dim)]">&mdash;</span>}
                        </td>
                      ) : null}
                      {titleCol ? (
                        <td className="py-1.5 px-1.5 text-right tabular-nums hidden sm:table-cell whitespace-nowrap text-[var(--text-muted)]" style={MONO}
                          title={t.pTitle != null ? `${(t.pTitle * 100).toFixed(1)}% of ${odds!.sims.toLocaleString("en-GB")} drawn seasons` : undefined}>
                          {t.pTitle != null ? fmtOdds(t.pTitle, t.oddsStatus === "out" ? "out" : null) : <span className="text-[var(--text-dim)]">&mdash;</span>}
                        </td>
                      ) : null}
                      {honoursCol ? (
                        <td className="py-2 sm:py-1.5 px-1.5 align-middle hidden sm:table-cell">
                          {showHonours ? <Strip t={t} /> : <Strip t={{ ...t, flags: undefined }} withheld />}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        ))}
        </div>
        ))}
      </div>

      {showHonours ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-[var(--text-dim)]">
          {HONOURS.map((h) => (
            <span key={h.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: h.color, display: "inline-block" }} />
              {h.label.replace(/^(made|won|reached) (the )?/, "")}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ordinalWord(k: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = k % 100;
  return `${k}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
