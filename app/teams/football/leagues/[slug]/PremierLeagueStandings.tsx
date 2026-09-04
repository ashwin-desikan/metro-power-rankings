import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { monogramForFootball } from "@/lib/football-colors";
import type { PlLiveRow, PlStandingsSnapshot } from "@/lib/premier-league-standings";
import type { FootballLeagueHub, FootballCupFinal, FootballEuropeEntry } from "@/lib/football";
import { europeanCompDisplayCode, europeanCompSortKey } from "@/lib/football";
import { Badge } from "@/app/teams/_shared/Badge";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import { DataBar } from "@/app/_shared/DataBar";

// Fallback monogram badge when no crest is available
function ColorBall({ slug, name }: { slug: string; name: string }) {
  const m = monogramForFootball(name, slug);
  return (
    <span
      className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{ background: m.bg, color: m.fg, width: 22, height: 22, fontSize: 9, fontWeight: 700 }}
      aria-hidden
    >
      {m.mono}
    </span>
  );
}

// Zone badge derived from ESPN note.description
function ZoneBadge({ zone }: { zone: string }) {
  if (!zone) return null;
  let color: { bg: string; fg: string };
  if (zone.includes("Champions League")) {
    color = { bg: "rgba(129,214,172,0.18)", fg: "#22c55e" };
  } else if (zone.includes("Europa League")) {
    color = { bg: "rgba(251,146,60,0.18)", fg: "#f97316" };
  } else if (zone.includes("Conference")) {
    color = { bg: "rgba(99,102,241,0.18)", fg: "#818cf8" };
  } else if (zone.toLowerCase().includes("relegat")) {
    color = { bg: "rgba(220,38,38,0.14)", fg: "#dc2626" };
  } else {
    return null;
  }
  const short = zone
    .replace("Champions League", "UCL")
    .replace("Europa League", "UEL")
    .replace("Europa Conference League", "UECL")
    .replace("Conference League", "UECL")
    .replace("Relegation", "Relegated");
  return (
    <span title={zone}>
      <Badge color={color}>{short}</Badge>
    </span>
  );
}

type CupMap = Map<string, FootballCupFinal[]>;
type EurMap = Map<string, FootballEuropeEntry[]>;

// ── Live table (ESPN data) ───────────────────────────────────────────────────

function LiveTable({
  rows,
  season_year,
  cupsBySlug,
  europeBySlug,
}: {
  rows: PlLiveRow[];
  season_year: number;
  cupsBySlug: CupMap;
  europeBySlug: EurMap;
}) {
  const displayYear = `${season_year}–${String(season_year + 1).slice(2)}`;
  // Points is the standings' argument (what the table is sorted by); max is
  // this season's own maximum, computed once over the full row set.
  const ptsMax = Math.max(...rows.map((r) => r.points), 1);
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-baseline gap-3 mb-4">
        <h2 className="text-base font-semibold">
          Current standings{" "}
          <span className="text-[var(--text-muted)] font-normal text-sm tabular-nums">
            ({displayYear})
          </span>
        </h2>
        <span className="text-xs text-[var(--text-muted)]">Live from ESPN · updated every 30 min</span>
      </div>

      <ResponsiveTable
        variant="list"
        mobileNoun="clubs"
        mobileRows={rows.map((row) => {
          const eurEntries = europeBySlug.get(row.slug ?? "") ?? [];
          return (
            <RankRow
              key={row.name}
              rank={row.rank}
              name={
                <>
                  <TeamCrest
                    name={row.name}
                    size={16}
                    fallback={<ColorBall slug={row.slug ?? row.abbr} name={row.name} />}
                  />
                  {row.slug ? (
                    <Link href={`/teams/football/${row.slug}`} className="truncate hover:underline">
                      {row.name}
                    </Link>
                  ) : (
                    <span className="truncate">{row.name}</span>
                  )}
                  {row.zone && <span className="flex-shrink-0"><ZoneBadge zone={row.zone} /></span>}
                  {eurEntries.map((e, ei) => (
                    <span key={ei} className="flex-shrink-0">
                      <Badge color={{ bg: "rgba(99,102,241,0.12)", fg: "#818cf8" }}>
                        {europeanCompDisplayCode(e.code, null)}
                      </Badge>
                    </span>
                  ))}
                </>
              }
              sub={<>{row.played} P · {row.wins}-{row.draws}-{row.losses} · {row.gd > 0 ? `+${row.gd}` : row.gd} GD</>}
              right={row.points}
              rightSub="pts"
            />
          );
        })}
      >
        <table className="w-full text-sm min-w-[540px]" data-sticky-col="2">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 text-left font-medium w-8">#</th>
              <th className="py-2 text-left font-medium">Club</th>
              <th className="py-2 text-left font-medium w-20">Zone</th>
              <th className="py-2 text-right font-medium">P</th>
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">D</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 text-right font-medium">Pts</th>
              <th className="py-2 text-right font-medium hidden sm:table-cell">GF</th>
              <th className="py-2 text-right font-medium hidden sm:table-cell">GA</th>
              <th className="py-2 text-right font-medium">GD</th>
              <th className="py-2 pl-2 text-left font-medium hidden md:table-cell">Eur Comp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const eurEntries = europeBySlug.get(row.slug ?? "") ?? [];
              return (
                <tr key={row.name} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 tabular-nums text-[var(--text-muted)]">{row.rank}</td>
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-2">
                      <TeamCrest
                        name={row.name}
                        size={22}
                        fallback={<ColorBall slug={row.slug ?? row.abbr} name={row.name} />}
                      />
                      {row.slug ? (
                        <Link href={`/teams/football/${row.slug}`} className="hover:underline font-medium">
                          {row.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{row.name}</span>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5"><ZoneBadge zone={row.zone} /></td>
                  <td className="py-1.5 text-right tabular-nums">{row.played}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.wins}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.draws}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.losses}</td>
                  <td className="py-1.5 text-right"><DataBar v={row.points} max={ptsMax} width={88} label="points" /></td>
                  <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{row.gf}</td>
                  <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{row.ga}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                  <td className="py-1.5 pl-2 hidden md:table-cell">
                    {eurEntries.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {eurEntries.map((e, ei) => (
                          <Badge key={ei} color={{ bg: "rgba(99,102,241,0.12)", fg: "#818cf8" }}>
                            {europeanCompDisplayCode(e.code, null)}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span className="text-[var(--text-dim)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ResponsiveTable>
    </section>
  );
}

// ── Workbook fallback ─────────────────────────────────────────────────────────

// Champion / promoted / relegated status pills, shared by the mobile card
// and desktop table cells of the workbook-fallback standings table.
function WorkbookBadges({ s, isChamp }: { s: FootballLeagueHub["current_standings"][number]; isChamp: boolean }) {
  return (
    <>
      {isChamp && <Badge variant="champion">Champion</Badge>}
      {s.promoted && (
        <Badge color={{ bg: "rgba(34,197,94,0.16)", fg: "#22c55e" }}>
          {s.playoffs ? "Promoted (PO)" : "Promoted"}
        </Badge>
      )}
      {s.relegated && (
        <Badge color={{ bg: "rgba(220,38,38,0.16)", fg: "#dc2626" }}>
          {s.playoffs ? "Relegated (PO)" : "Relegated"}
        </Badge>
      )}
    </>
  );
}

function WorkbookTable({
  hub,
  cupsBySlug,
  europeBySlug,
}: {
  hub: FootballLeagueHub;
  cupsBySlug: CupMap;
  europeBySlug: EurMap;
}) {
  if (hub.current_standings.length === 0) return null;
  // Points is the standings' argument; max is this season's own maximum,
  // computed once over the full row set.
  const ptsMax = Math.max(...hub.current_standings.map((s) => s.pts ?? 0), 1);
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">
        Current standings{" "}
        <span className="text-[var(--text-muted)] font-normal text-sm tabular-nums">
          ({hub.current_year ? `season ending ${hub.current_year}` : "latest"})
        </span>
      </h2>

      <ResponsiveTable
        variant="list"
        mobileNoun="clubs"
        mobileRows={hub.current_standings.map((s) => {
          const isChamp = s.champion === true || s.place === 1;
          return (
            <RankRow
              key={s.slug}
              rank={s.place ?? "–"}
              name={
                <>
                  <TeamCrest name={s.cur_name} size={16} fallback={<ColorBall slug={s.slug ?? ""} name={s.cur_name} />} />
                  {s.slug ? (
                    <Link href={`/teams/football/${s.slug}`} className="truncate hover:underline">{s.cur_name}</Link>
                  ) : (
                    <span className="truncate">{s.cur_name}</span>
                  )}
                  {isChamp && <span title="Champion" aria-label="Champion" className="flex-shrink-0 leading-none" style={{ color: "#f5b301" }}>★</span>}
                  {s.promoted && (
                    <span className="flex-shrink-0">
                      <Badge color={{ bg: "rgba(34,197,94,0.16)", fg: "#22c55e" }}>{s.playoffs ? "Promoted (PO)" : "Promoted"}</Badge>
                    </span>
                  )}
                  {s.relegated && (
                    <span className="flex-shrink-0">
                      <Badge color={{ bg: "rgba(220,38,38,0.16)", fg: "#dc2626" }}>{s.playoffs ? "Relegated (PO)" : "Relegated"}</Badge>
                    </span>
                  )}
                </>
              }
              sub={
                <>
                  {s.matches ?? "–"} P · {s.w ?? "–"}-{s.d ?? "–"}-{s.l ?? "–"} · {s.gd != null ? (s.gd > 0 ? `+${s.gd}` : s.gd) : "–"} GD
                  {(europeBySlug.get(s.slug ?? "") ?? []).map((e) => europeanCompDisplayCode(e.code, null)).filter(Boolean).length > 0 && (
                    <> · {(europeBySlug.get(s.slug ?? "") ?? []).map((e) => europeanCompDisplayCode(e.code, null)).join(", ")}</>
                  )}
                </>
              }
              right={s.pts ?? "–"}
              rightSub="pts"
              highlight={isChamp}
            />
          );
        })}
      >
        <table className="w-full text-sm min-w-[540px]" data-sticky-col="2">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 text-left font-medium w-8">Pos</th>
              <th className="py-2 text-left font-medium">Club</th>
              <th className="py-2 text-left font-medium">Notes</th>
              <th className="py-2 text-right font-medium">P</th>
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">D</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 text-right font-medium">Pts</th>
              <th className="py-2 text-right font-medium hidden sm:table-cell">GF</th>
              <th className="py-2 text-right font-medium hidden sm:table-cell">GA</th>
              <th className="py-2 text-right font-medium">GD</th>
              <th className="py-2 pl-2 text-left font-medium hidden md:table-cell">Eur Comp</th>
            </tr>
          </thead>
          <tbody>
            {hub.current_standings.map((s) => {
              const isChamp = s.champion === true || s.place === 1;
              const eurEntries = europeBySlug.get(s.slug ?? "") ?? [];
              return (
                <tr key={s.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 tabular-nums">{s.place ?? "–"}</td>
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-2">
                      <TeamCrest name={s.cur_name} size={22} fallback={<ColorBall slug={s.slug ?? ""} name={s.cur_name} />} />
                      {s.slug ? (
                        <Link href={`/teams/football/${s.slug}`} className="hover:underline font-medium">{s.cur_name}</Link>
                      ) : (
                        <span className="font-medium">{s.cur_name}</span>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <span className="inline-flex flex-wrap gap-1">
                      <WorkbookBadges s={s} isChamp={isChamp} />
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{s.matches ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.w ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.d ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.l ?? "–"}</td>
                  <td className="py-1.5 text-right"><DataBar v={s.pts} max={ptsMax} width={88} label="points" /></td>
                  <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{s.gf ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{s.ga ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.gd != null ? (s.gd > 0 ? `+${s.gd}` : s.gd) : "–"}</td>
                  <td className="py-1.5 pl-2 hidden md:table-cell">
                    {eurEntries.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {eurEntries.map((e, ei) => (
                          <Badge key={ei} color={{ bg: "rgba(99,102,241,0.12)", fg: "#818cf8" }}>
                            {europeanCompDisplayCode(e.code, null)}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span className="text-[var(--text-dim)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ResponsiveTable>
    </section>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PremierLeagueStandings({
  live,
  hub,
  cupsBySlug,
  europeBySlug,
}: {
  live: PlStandingsSnapshot;
  hub: FootballLeagueHub;
  cupsBySlug: CupMap;
  europeBySlug: EurMap;
}) {
  if (live && live.rows.length > 0) {
    return (
      <LiveTable
        rows={live.rows}
        season_year={live.season_year}
        cupsBySlug={cupsBySlug}
        europeBySlug={europeBySlug}
      />
    );
  }
  return <WorkbookTable hub={hub} cupsBySlug={cupsBySlug} europeBySlug={europeBySlug} />;
}
