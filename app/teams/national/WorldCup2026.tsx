"use client";

// WorldCup2026 — live (well, pre-tournament-static) standings + bracket
// widget for the International Football index page. Driven by
// public/data/international/wc2026.json which the ETL refreshes from
// Int Tournaments. Group Stage layout mirrors MlbStandings (mini-tables
// per group). Knockout bracket renders per round in horizontal cards
// rather than a tree view; tree-of-pairings is a v1.1 polish item.
//
// Collapsed by default to keep the index page concise. Auto-expands when
// the URL hash is #wc2026 (the deep link from the per-team WC2026 row).

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorldCup2026Bundle } from "@/lib/international";
import { flagForTeam, flagCdnUrl, displayNameForTeam } from "@/lib/international-display";

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

export default function WorldCup2026({ wc }: Props) {
  const startsDate = new Date(wc.tournament.starts_iso);
  const today = new Date();
  const preTournament = today < startsDate;

  const [open, setOpen] = useState(false);

  // Auto-expand when the URL hash targets this section (e.g. a team page
  // links to /teams/national#wc2026 from their WC 2026 row). Listening to
  // hashchange too so an in-page hash update opens the section without a
  // reload.
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
              {summaryNote} Group standings and knockout bracket {open ? "below" : "available on expand"}.
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
          <GroupStage groups={wc.group_stage} />
          <Bracket knockout={wc.knockout} />
        </div>
      )}
    </section>
  );
}

function GroupStage({ groups }: { groups: WorldCup2026Bundle["group_stage"] }) {
  const groupKeys = Object.keys(groups).sort();
  if (groupKeys.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold mb-3 text-[var(--text-muted)] uppercase tracking-wider">Group stage</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {groupKeys.map((key) => {
          const teams = groups[key];
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
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--text-muted)]">
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="text-left py-1 pr-1 font-medium text-[9px] uppercase tracking-wider">Team</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">W</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">D</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">L</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider hidden xs:table-cell">GD</th>
                    <th className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.cur_name} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
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
                      <td className="py-1 pl-1 text-right font-semibold">{t.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bracket({ knockout }: { knockout: WorldCup2026Bundle["knockout"] }) {
  // Filter to rounds that have matches.
  const populatedRounds = KNOCKOUT_ROUND_ORDER.filter(
    (rn) => knockout[rn] && knockout[rn].length > 0
  );
  if (populatedRounds.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 text-[var(--text-muted)] uppercase tracking-wider">Knockout rounds</h3>
      <div className="space-y-4">
        {populatedRounds.map((rn) => (
          <div key={rn}>
            <div className="text-xs uppercase tracking-wider font-semibold text-[var(--text-muted)] mb-2">
              {rn} <span className="text-[10px] text-[var(--text-dim)] normal-case tracking-normal ml-1">({knockout[rn].length} matches)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {knockout[rn].map((m, i) => (
                <MatchCard key={`${m.date}-${i}`} m={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCard({ m }: { m: WorldCup2026Bundle["knockout"][string][number] }) {
  const dateDisplay = m.date
    ? new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const teamFlag = m.team_slug ? flagCdnUrl(m.team_slug) : null;
  const oppFlag = m.opp_slug ? flagCdnUrl(m.opp_slug) : null;
  const showScores = m.played && m.team_score !== null && m.opp_score !== null;
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
        {!m.played && (
          <span className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider">scheduled</span>
        )}
      </div>
      <Row
        flag={teamFlag}
        name={m.team_slug ? displayNameForTeam(m.team_slug, m.team_cur_name) : m.team_cur_name}
        slug={m.team_slug}
        score={showScores ? m.team_score : null}
        win={m.played && m.team_score !== null && m.opp_score !== null && m.team_score > m.opp_score}
      />
      <Row
        flag={oppFlag}
        name={m.opp_slug ? displayNameForTeam(m.opp_slug, m.opp_cur_name) : m.opp_cur_name}
        slug={m.opp_slug}
        score={showScores ? m.opp_score : null}
        win={m.played && m.team_score !== null && m.opp_score !== null && m.opp_score > m.team_score}
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
}: {
  flag: string | null;
  name: string;
  slug: string | null;
  score: number | null;
  win: boolean;
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
        {score !== null ? score : <span className="text-[var(--text-dim)] font-normal">—</span>}
      </span>
    </div>
  );
}
