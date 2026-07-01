"use client";

// WorldCup2026 — standings + bracket widget for the International Football
// index page. Driven by public/data/international/wc2026.json (real W/D/L/Pts,
// ETL-refreshed from Int Tournaments) augmented with our Monte Carlo
// projections from wc2026-sim.json (merged onto the bundle as `sim`). The
// Group Stage tables carry projected points and round-of-32 odds; a Title
// Odds table in the same section gives semifinal/final/win probabilities.
//
// Collapsed by default. Auto-expands when the URL hash is #wc2026 (the deep
// link from the per-team WC2026 row).

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorldCup2026Bundle, WorldCup2026Sim } from "@/lib/international";
import { flagForTeam, flagCdnUrl, displayNameForTeam } from "@/lib/international-display";
import RadialKnockout from "./RadialKnockout";

type Props = {
  wc: WorldCup2026Bundle;
};

const KNOCKOUT_ROUND_ORDER = [
  "Round of 32",
  "Round of 16",
  "Quarterfinals",
  "Semifinals",
  "Third Place Game",
  "Final",
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const WC_ZONES: ReadonlyArray<readonly [string, string]> = [
  ["Your time", ""],
  ["UK", "Europe/London"],
  ["Central Europe", "Europe/Rome"],
  ["US East", "America/New_York"],
  ["US Central", "America/Chicago"],
  ["US Mountain", "America/Denver"],
  ["US Pacific", "America/Los_Angeles"],
  ["Mexico City", "America/Mexico_City"],
  ["Brazil", "America/Sao_Paulo"],
  ["South Africa", "Africa/Johannesburg"],
  ["Japan", "Asia/Tokyo"],
  ["Sydney", "Australia/Sydney"],
];

function formatKickoff(iso: string, zone: string): string {
  try {
    const dt = new Date(iso);
    const d = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: zone }).format(dt);
    const t = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(dt);
    return `${d} \u00b7 ${t}`;
  } catch {
    return iso;
  }
}

export default function WorldCup2026({ wc }: Props) {
  const startsDate = new Date(wc.tournament.starts_iso);
  const today = new Date();
  const preTournament = today < startsDate;
  const sim = wc.sim ?? null;
  // Teams still alive in the (live-merged) knockout bracket. Used to keep the
  // Title-odds table in step with the wheel: anyone eliminated in the groups OR
  // the knockout, including live between simulation runs, drops off both.
  const knockoutAlive = bracketAlive(wc.knockout);

  // Keep the section open by default through the tournament, then collapse it
  // once it is over (the 2026 final is 19 Jul; use the 20th as the cutoff).
  const tournamentEnds = new Date("2026-07-20T00:00:00Z");
  const tournamentOver = today >= tournamentEnds;
  const [open, setOpen] = useState(!tournamentOver);
  // Hide group tables once all 48 group matches are confirmed in the sim data.
  const groupStageComplete = (sim?.meta?.played_group ?? 0) >= 48;
  const hasKnockout = KNOCKOUT_ROUND_ORDER.some((rn) => (wc.knockout[rn]?.length ?? 0) > 0);
  const [tab, setTab] = useState<"bracket" | "odds" | "groups">(hasKnockout ? "bracket" : "groups");

  useEffect(() => {
    function syncFromHash() {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#wc2026") setOpen(true);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const summaryNote = preTournament
    ? `Group stage opens ${startsDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
    : wc.live
      ? "Live group standings via ESPN's public feed, refreshed every half hour. Projections update with the daily simulation."
      : "Live standings from workbook. Refreshes on next deploy.";

  return (
    <section className="mb-10" id="wc2026">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="wc2026-body"
        className="w-full text-left rounded-xl border px-4 py-3 transition hover:border-[var(--accent)]"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight truncate">
              {wc.tournament.name}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
              {summaryNote} Projected points, advancement and title odds {open ? "below" : "available on expand"}.
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] flex-shrink-0"
            aria-hidden
          >
            <span className="hidden sm:inline">{open ? "Collapse" : "Expand"}</span>
            <span
              className="inline-block transition-transform"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▸
            </span>
          </span>
        </div>
      </button>

      {open && (
        <div id="wc2026-body" className="mt-4">
          <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
            {([
              ["bracket", "Bracket"],
              ["odds", "Title odds"],
              ["groups", groupStageComplete ? "Final groups" : "Groups"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                  tab === id
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "bracket" &&
            (hasKnockout ? (
              <div className="lg:grid lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-6 lg:items-start">
                <div className="mb-4 lg:mb-0 lg:sticky lg:top-4">
                  <RadialKnockout knockout={wc.knockout} />
                </div>
                <Bracket knockout={wc.knockout} sim={sim} />
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2">
                The knockout bracket appears once the group stage is complete.
              </p>
            ))}

          {tab === "odds" &&
            (sim && sim.deep_runs.length > 0 ? (
              <TitleOdds sim={sim} alive={knockoutAlive} />
            ) : (
              <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2">
                Title projections are not available yet.
              </p>
            ))}

          {tab === "groups" && <GroupStage groups={wc.group_stage} sim={sim} />}
        </div>
      )}
    </section>
  );
}

function GroupStage({
  groups,
  sim,
}: {
  groups: WorldCup2026Bundle["group_stage"];
  sim: WorldCup2026Sim | null;
}) {
  const groupKeys = Object.keys(groups).sort();
  if (groupKeys.length === 0) return null;
  const by = sim?.by_slug ?? {};
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold mb-3 text-[var(--text-muted)] uppercase tracking-wider">Group stage</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {groupKeys.map((key) => {
          const teams = [...groups[key]].sort((a, b) => {
            const av = by[a.slug ?? ""]?.exp_points ?? 0;
            const bv = by[b.slug ?? ""]?.exp_points ?? 0;
            return b.pts - a.pts || bv - av || b.gd - a.gd;
          });
          return (
            <div
              key={key}
              className="rounded-xl border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <h4 className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2 flex items-baseline justify-between gap-2">
                <span>Group {key}</span>
                <span className="text-[10px] normal-case tracking-normal text-[var(--text-dim)]">{teams.length} teams</span>
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-[var(--text-muted)]">
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <th className="text-left py-1 pr-1 font-medium text-[9px] uppercase tracking-wider">Team</th>
                      <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">W</th>
                      <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">D</th>
                      <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">L</th>
                      <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider hidden xs:table-cell">GD</th>
                      <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">Pts</th>
                      <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider" title="Projected final points (model average)">xPts</th>
                      <th className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider" title="Chance of reaching the round of 32">Adv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t, i) => {
                      const s = t.slug ? by[t.slug] : undefined;
                      // Clamp the projected points to what the visible live
                      // record still allows. The W/D/L/Pts columns come from
                      // ESPN's live feed, while xPts comes from the once-daily
                      // simulation snapshot; when the two feeds disagree on games
                      // played, the raw projection can exceed the real ceiling
                      // (e.g. 7.8 xPts for a side that can now reach at most 7).
                      // Bound it by [pts, pts + 3 * gamesRemaining] so the column
                      // can never contradict the table beside it.
                      const gamesPlayed = (t.w ?? 0) + (t.d ?? 0) + (t.l ?? 0);
                      const maxFinalPts = t.pts + 3 * Math.max(0, 3 - gamesPlayed);
                      const xpts = s
                        ? Math.min(Math.max(s.exp_points, t.pts), maxFinalPts)
                        : null;
                      return (
                        <tr
                          key={t.cur_name}
                          className="border-b last:border-b-0"
                          style={{
                            borderColor: "var(--border)",
                            borderLeft: i < 2 ? "3px solid var(--accent)" : "3px solid transparent",
                          }}
                        >
                          <td className="py-1 pr-1">
                            <span className="inline-flex items-center gap-1">
                              {t.slug && flagCdnUrl(t.slug) && (
                                <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" />
                              )}
                              {t.slug ? (
                                <Link href={`/teams/national/${t.slug}`} className="hover:text-[var(--accent)] transition-colors">
                                  {displayNameForTeam(t.slug, t.cur_name)}
                                </Link>
                              ) : (
                                <span>{t.cur_name}</span>
                              )}
                            </span>
                          </td>
                          <td className="py-1 px-1 text-right">{t.w}</td>
                          <td className="py-1 px-1 text-right">{t.d}</td>
                          <td className="py-1 px-1 text-right">{t.l}</td>
                          <td className="py-1 px-1 text-right hidden xs:table-cell">
                            {t.gd > 0 ? `+${t.gd}` : t.gd}
                          </td>
                          <td className="py-1 px-1 text-right font-semibold">{t.pts}</td>
                          <td className="py-1 px-1 text-right text-[var(--text-muted)]">
                            {xpts !== null ? xpts.toFixed(1) : "—"}
                          </td>
                          <td className="py-1 pl-1 text-right font-semibold" style={{ color: s ? "var(--accent)" : "var(--text-dim)" }}>
                            {s ? `${s.p_advance.toFixed(0)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      {sim && (
        <p className="text-[10px] text-[var(--text-dim)] mt-2">
          xPts = projected final points (model average). Adv = chance of reaching the round of 32 (top two or one of
          the eight best third-placed teams). The two highlighted rows are the projected automatic qualifiers.
        </p>
      )}
    </div>
  );
}

function bracketAlive(ko: WorldCup2026Bundle["knockout"]): Set<string> {
  const appear = new Set<string>();
  const lost = new Set<string>();
  for (const rows of Object.values(ko)) {
    for (const m of rows) {
      if (m.team_slug) appear.add(m.team_slug);
      if (m.opp_slug) appear.add(m.opp_slug);
      if (m.played && m.team_score != null && m.opp_score != null) {
        const teamWon = m.result === "W" || (m.result !== "L" && m.team_score > m.opp_score);
        const oppWon = m.result === "L" || (m.result !== "W" && m.opp_score > m.team_score);
        if (teamWon && m.opp_slug) lost.add(m.opp_slug);
        else if (oppWon && m.team_slug) lost.add(m.team_slug);
      }
    }
  }
  const alive = new Set<string>();
  for (const s of appear) if (!lost.has(s)) alive.add(s);
  return alive;
}

function TitleOdds({ sim, alive }: { sim: WorldCup2026Sim; alive: Set<string> }) {
  // Once the knockout bracket is populated, show only teams still in it.
  // Before then (empty alive set) fall back to the full field.
  const source = alive.size > 0 ? sim.deep_runs.filter((r) => alive.has(r.slug)) : sim.deep_runs;
  const rows = [...source].sort((a, b) => b.p_title - a.p_title);
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold mb-3 text-[var(--text-muted)] uppercase tracking-wider">Title odds</h3>
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-[var(--text-muted)]">
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="text-left py-2 px-3 font-medium text-[9px] uppercase tracking-wider">#</th>
                <th className="text-left py-2 px-2 font-medium text-[9px] uppercase tracking-wider">Team</th>
                <th className="text-left py-2 px-2 font-medium text-[9px] uppercase tracking-wider hidden sm:table-cell">Grp</th>
                <th className="text-right py-2 px-2 font-medium text-[9px] uppercase tracking-wider" title="Reaches the semifinals">Semifinal</th>
                <th className="text-right py-2 px-2 font-medium text-[9px] uppercase tracking-wider" title="Reaches the final">Final</th>
                <th className="text-right py-2 px-3 font-medium text-[9px] uppercase tracking-wider" title="Wins the tournament">Win</th>
                <th className="text-right py-2 px-3 font-medium text-[9px] uppercase tracking-wider hidden md:table-cell" title="De-vigged market title odds">Market</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 text-[var(--text-dim)]">{i + 1}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {flagCdnUrl(r.slug) ? (
                        <img src={flagCdnUrl(r.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" />
                      ) : (
                        <span aria-hidden>{flagForTeam(r.slug)}</span>
                      )}
                      <Link href={`/teams/national/${r.slug}`} className="hover:text-[var(--accent)] transition-colors">
                        {displayNameForTeam(r.slug, r.name)}
                      </Link>
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-[var(--text-dim)] hidden sm:table-cell">{r.group}</td>
                  <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.p_sf.toFixed(1)}%</td>
                  <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.p_final.toFixed(1)}%</td>
                  <td className="py-1.5 px-3 text-right font-semibold" style={{ color: "var(--accent)" }}>{r.p_title.toFixed(1)}%</td>
                  <td className="py-1.5 px-3 text-right text-[var(--text-dim)] hidden md:table-cell">{r.market_prob.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-2">
        {sim.meta.sims.toLocaleString()} Monte Carlo simulations.
        {sim.meta.knockout_phase
          ? ` Knockout phase: strength weighted ${Math.round(sim.meta.blend_market_weight * 100)}% market / ${Math.round((1 - sim.meta.blend_market_weight) * 100)}% Elo — Elo-dominant from group-stage refresh.`
          : ` Team strength blends market odds (${Math.round(sim.meta.blend_market_weight * 100)}%) with our Elo ranking (${Math.round((1 - sim.meta.blend_market_weight) * 100)}%).`
        }
        {" "}Market from {sim.meta.odds_source}, as of {fmtDate(sim.meta.odds_as_of)}. Updated {fmtDate(sim.meta.generated_at)}. Informational, not betting advice.
      </p>
    </div>
  );
}

function koSortKey(m: WorldCup2026Bundle["knockout"][string][number]): number {
  if (m.kickoff_utc) {
    const t = Date.parse(m.kickoff_utc);
    if (!Number.isNaN(t)) return t;
  }
  if (m.date) {
    const t = Date.parse(`${m.date}T00:00:00Z`);
    if (!Number.isNaN(t)) return t;
  }
  return Number.POSITIVE_INFINITY;
}

function Bracket({ knockout, sim }: { knockout: WorldCup2026Bundle["knockout"]; sim: WorldCup2026Sim | null }) {
  const [tz, setTz] = useState("");
  const [localZone, setLocalZone] = useState("UTC");
  useEffect(() => {
    setLocalZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);
  const zone = tz || localZone;
  const populatedRounds = KNOCKOUT_ROUND_ORDER.filter(
    (rn) => knockout[rn] && knockout[rn].length > 0
  );
  if (populatedRounds.length === 0) return null;
  const matchups = sim?.matchups ?? {};
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Knockout bracket</h3>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <span className="hidden sm:inline">Times in</span>
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-1 text-[11px] text-[var(--text)] outline-none"
            aria-label="Show kickoff times in timezone"
          >
            {WC_ZONES.map(([label, z]) => (
              <option key={label} value={z}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-4">
        {populatedRounds.map((rn) => (
          <div key={rn}>
            <div className="text-xs uppercase tracking-wider font-semibold text-[var(--text-muted)] mb-2">
              {rn} <span className="text-[10px] text-[var(--text-dim)] normal-case tracking-normal ml-1">({knockout[rn].length} matches)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {[...knockout[rn]].sort((a, b) => koSortKey(a) - koSortKey(b)).map((m, i) => (
                <MatchCard key={`${m.date}-${i}`} m={m} matchups={matchups} zone={zone} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getMatchupProb(matchups: Record<string, number>, slugA: string | null, slugB: string | null): number | null {
  if (!slugA || !slugB) return null;
  const key = `${slugA}:${slugB}`;
  const inv = `${slugB}:${slugA}`;
  if (matchups[key] !== undefined) return matchups[key];
  if (matchups[inv] !== undefined) return 1 - matchups[inv];
  return null;
}

function MatchCard({ m, matchups, zone }: { m: WorldCup2026Bundle["knockout"][string][number]; matchups: Record<string, number>; zone: string }) {
  const dateDisplay = m.kickoff_utc
    ? formatKickoff(m.kickoff_utc, zone)
    : m.date
    ? new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const teamFlag = m.team_slug ? flagCdnUrl(m.team_slug) : null;
  const oppFlag = m.opp_slug ? flagCdnUrl(m.opp_slug) : null;
  const showScores = m.played && m.team_score !== null && m.opp_score !== null;
  // Win probability from the Elo-blended model (only shown for unplayed matches with known teams)
  const pTeam = (!m.played && m.team_slug && m.opp_slug)
    ? getMatchupProb(matchups, m.team_slug, m.opp_slug)
    : null;
  const pOpp = pTeam !== null ? 1 - pTeam : null;
  return (
    <div
      className="rounded-lg border p-2 text-xs"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border)",
        opacity: m.played ? 1 : 0.85,
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
          {dateDisplay ?? "TBD"}
        </span>
        {!m.played && m.team_slug && (
          <span className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider">scheduled</span>
        )}
        {!m.team_slug && (
          <span className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider">TBD</span>
        )}
      </div>
      <Row
        flag={teamFlag}
        name={m.team_slug ? displayNameForTeam(m.team_slug, m.team_cur_name) : "TBD"}
        slug={m.team_slug}
        score={showScores ? m.team_score : null}
        win={m.played && m.team_score !== null && m.opp_score !== null && m.team_score > m.opp_score}
        prob={pTeam}
      />
      <Row
        flag={oppFlag}
        name={m.opp_slug ? displayNameForTeam(m.opp_slug, m.opp_cur_name) : "TBD"}
        slug={m.opp_slug}
        score={showScores ? m.opp_score : null}
        win={m.played && m.team_score !== null && m.opp_score !== null && m.opp_score > m.team_score}
        prob={pOpp}
      />
      {m.penalty_kicks ? (
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">PKs: {m.penalty_kicks}</div>
      ) : null}
      {m.stad_metro && (
        <div className="mt-1 text-[10px] text-[var(--text-dim)] truncate">
          {m.stadium ? `${m.stadium}, ` : ""}{m.stad_metro}
        </div>
      )}
    </div>
  );
}

function Row({
  flag,
  name,
  slug,
  score,
  win,
  prob,
}: {
  flag: string | null;
  name: string;
  slug: string | null;
  score: number | null;
  win: boolean;
  prob?: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="flex items-center gap-1.5 min-w-0">
        {flag && <img src={flag} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" />}
        {slug ? (
          <Link href={`/teams/national/${slug}`} className="truncate hover:text-[var(--accent)] transition-colors">
            <span style={{ fontWeight: win ? 600 : 400 }}>{name}</span>
          </Link>
        ) : (
          <span className="truncate" style={{ fontWeight: win ? 600 : 400 }}>{name}</span>
        )}
      </span>
      <span className="tabular-nums font-semibold text-xs flex-shrink-0">
        {prob !== null && prob !== undefined && (
          <span className="text-[var(--text-muted)] font-normal mr-1 text-[9px]">{Math.round(prob * 100)}%</span>
        )}
        {score !== null ? score : <span className="text-[var(--text-dim)] font-normal">—</span>}
      </span>
    </div>
  );
}
