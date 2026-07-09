import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { monogramForFootball } from "@/lib/football-colors";
import type { PlLiveRow, PlStandingsSnapshot } from "@/lib/premier-league-standings";
import type { FootballLeagueHub, FootballCupFinal, FootballEuropeEntry } from "@/lib/football";
import { europeanCompDisplayCode, europeanCompSortKey } from "@/lib/football";

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

// Small labeled stat block used inside mobile standings cards.
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

// Zone badge derived from ESPN note.description
function ZoneBadge({ zone }: { zone: string }) {
  if (!zone) return null;
  let style: React.CSSProperties;
  if (zone.includes("Champions League")) {
    style = { background: "rgba(129,214,172,0.18)", color: "#22c55e" };
  } else if (zone.includes("Europa League")) {
    style = { background: "rgba(251,146,60,0.18)", color: "#f97316" };
  } else if (zone.includes("Conference")) {
    style = { background: "rgba(99,102,241,0.18)", color: "#818cf8" };
  } else if (zone.toLowerCase().includes("relegat")) {
    style = { background: "rgba(220,38,38,0.14)", color: "#dc2626" };
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
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
      style={style}
      title={zone}
    >
      {short}
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

      {/* Mobile: one stacked card per club instead of a 12-column table. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {rows.map((row) => {
          const eurEntries = europeBySlug.get(row.slug ?? "") ?? [];
          return (
            <div
              key={row.name}
              className="rounded-lg border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs tabular-nums text-[var(--text-muted)] flex-shrink-0 w-4">{row.rank}</span>
                  <TeamCrest
                    name={row.name}
                    size={22}
                    fallback={<ColorBall slug={row.slug ?? row.abbr} name={row.name} />}
                  />
                  {row.slug ? (
                    <Link href={`/teams/football/${row.slug}`} className="font-medium truncate hover:underline">
                      {row.name}
                    </Link>
                  ) : (
                    <span className="font-medium truncate">{row.name}</span>
                  )}
                </div>
                <span className="flex-shrink-0 text-sm font-semibold tabular-nums">{row.points} pts</span>
              </div>
              {row.zone && (
                <div className="mt-1.5">
                  <ZoneBadge zone={row.zone} />
                </div>
              )}
              <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1.5 text-xs">
                <Stat label="P" value={row.played} />
                <Stat label="W" value={row.wins} />
                <Stat label="D" value={row.draws} />
                <Stat label="L" value={row.losses} />
                <Stat label="GF" value={row.gf} />
                <Stat label="GA" value={row.ga} />
                <Stat label="GD" value={row.gd > 0 ? `+${row.gd}` : row.gd} />
              </div>
              {eurEntries.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {eurEntries.map((e, ei) => (
                    <span
                      key={ei}
                      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }}
                    >
                      {europeanCompDisplayCode(e.code, null)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto hidden sm:block">
        <table className="w-full text-sm min-w-[540px]">
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
                  <td className="py-1.5 text-right tabular-nums font-semibold">{row.points}</td>
                  <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{row.gf}</td>
                  <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{row.ga}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                  <td className="py-1.5 pl-2 hidden md:table-cell">
                    {eurEntries.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {eurEntries.map((e, ei) => (
                          <span
                            key={ei}
                            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }}
                          >
                            {europeanCompDisplayCode(e.code, null)}
                          </span>
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
      </div>
    </section>
  );
}

// ── Workbook fallback ─────────────────────────────────────────────────────────

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

      {/* Mobile: one stacked card per club instead of a 12-column table. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
        {hub.current_standings.map((s) => {
          const isChamp = s.champion === true || s.place === 1;
          const eurEntries = europeBySlug.get(s.slug ?? "") ?? [];
          return (
            <div
              key={s.slug}
              className="rounded-lg border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs tabular-nums text-[var(--text-muted)] flex-shrink-0 w-4">{s.place ?? "–"}</span>
                  <TeamCrest name={s.cur_name} size={22} fallback={<ColorBall slug={s.slug ?? ""} name={s.cur_name} />} />
                  {s.slug ? (
                    <Link href={`/teams/football/${s.slug}`} className="font-medium truncate hover:underline">{s.cur_name}</Link>
                  ) : (
                    <span className="font-medium truncate">{s.cur_name}</span>
                  )}
                </div>
                <span className="flex-shrink-0 text-sm font-semibold tabular-nums">{s.pts ?? "–"} pts</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {isChamp && (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(245,215,110,0.18)", color: "#b58900" }}>Champion</span>
                )}
                {s.promoted && (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(34,197,94,0.16)", color: "#22c55e" }}>
                    {s.playoffs ? "Promoted (PO)" : "Promoted"}
                  </span>
                )}
                {s.relegated && (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(220,38,38,0.16)", color: "#dc2626" }}>
                    {s.playoffs ? "Relegated (PO)" : "Relegated"}
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1.5 text-xs">
                <Stat label="P" value={s.matches ?? "–"} />
                <Stat label="W" value={s.w ?? "–"} />
                <Stat label="D" value={s.d ?? "–"} />
                <Stat label="L" value={s.l ?? "–"} />
                <Stat label="GF" value={s.gf ?? "–"} />
                <Stat label="GA" value={s.ga ?? "–"} />
                <Stat label="GD" value={s.gd != null ? (s.gd > 0 ? `+${s.gd}` : s.gd) : "–"} />
              </div>
              {eurEntries.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {eurEntries.map((e, ei) => (
                    <span key={ei} className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }}>
                      {europeanCompDisplayCode(e.code, null)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm min-w-[540px]">
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
                      {isChamp && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                              style={{ background: "rgba(245,215,110,0.18)", color: "#b58900" }}>Champion</span>
                      )}
                      {s.promoted && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                              style={{ background: "rgba(34,197,94,0.16)", color: "#22c55e" }}>
                          {s.playoffs ? "Promoted (PO)" : "Promoted"}
                        </span>
                      )}
                      {s.relegated && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                              style={{ background: "rgba(220,38,38,0.16)", color: "#dc2626" }}>
                          {s.playoffs ? "Relegated (PO)" : "Relegated"}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{s.matches ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.w ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.d ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.l ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{s.pts ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{s.gf ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{s.ga ?? "–"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.gd != null ? (s.gd > 0 ? `+${s.gd}` : s.gd) : "–"}</td>
                  <td className="py-1.5 pl-2 hidden md:table-cell">
                    {eurEntries.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {eurEntries.map((e, ei) => (
                          <span key={ei} className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }}>
                            {europeanCompDisplayCode(e.code, null)}
                          </span>
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
      </div>
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
