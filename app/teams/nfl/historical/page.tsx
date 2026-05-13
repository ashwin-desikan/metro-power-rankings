import type { Metadata } from "next";
import Link from "next/link";
import {
  getHistoricalFranchises,
  getHistoricalChampionships,
  getHistoricalSeasons,
  TITLE_COLORS,
} from "@/lib/nfl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PAGE_PATH = "/teams/nfl/historical";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Historical NFL franchises";
const PAGE_DESCRIPTION =
  "Defunct and historical NFL franchises: APFA charter members, AAFC entries that did not survive the 1949 merger, AFL clubs absorbed in 1970, and short-lived 1920s teams. Includes the Pottsville Maroons' stolen 1925 championship.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

// Historical-franchise monogram presets. Slightly desaturated so the eye
// reads "no longer active" without being punitive. Era-appropriate where
// the team's known colors are documented.
const HIST_MONO: Record<string, { bg: string; fg: string; mono: string }> = {
  "Maroons":              { bg: "#5e1414", fg: "#f1e4c5", mono: "POT" },
  "Bulldogs (Canton)":    { bg: "#b22222", fg: "#ffffff", mono: "CAN" },
  "Indians (Akron)":      { bg: "#1b3a6f", fg: "#e8b87c", mono: "AKR" },
  "Bulldogs (Cleveland)": { bg: "#4a2c1a", fg: "#f5c75c", mono: "CLB" },
  "Yellow Jackets":       { bg: "#1a1a1a", fg: "#f6d33a", mono: "FRA" },
  "Triangles":            { bg: "#1f4a26", fg: "#d8c87b", mono: "DAY" },
  "Stapletons":           { bg: "#2f2f2f", fg: "#cccccc", mono: "SI" },
  "Wolverines":           { bg: "#5e3a1e", fg: "#f5d57a", mono: "CLE" },
  "Tigers":               { bg: "#1d1d1d", fg: "#f7b733", mono: "BKN" },
  "Bulldogs (Boston)":    { bg: "#532d1a", fg: "#e3c08a", mono: "POT" },
  "Independents":         { bg: "#5a3a2a", fg: "#e6c98b", mono: "RII" },
};

function monoFor(canonical: string): { bg: string; fg: string; mono: string } {
  return HIST_MONO[canonical] || { bg: "#2a2a36", fg: "#9d9db0", mono: (canonical.slice(0, 3) || "—").toUpperCase() };
}

export default function HistoricalPage() {
  const rows = getHistoricalFranchises();
  const histChamps = getHistoricalChampionships();
  const histSeasons = getHistoricalSeasons();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/nfl" className="hover:text-[var(--text)]">NFL</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">Historical</span>
      </nav>

      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Defunct franchises</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Historical NFL franchises</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-3xl">
          Franchises that played at least one NFL, APFA, AAFC, or AFL season but no longer exist as independent
          clubs. Includes APFA charter members, AAFC entries that did not survive the 1949 merger,
          and short-lived 1920s teams.
        </p>
      </header>

      {/* Header strip (acts as a column header for the details list below) */}
      <div
        className="hidden md:grid gap-3 px-4 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium"
        style={{ gridTemplateColumns: "1fr 1.2fr 0.7fr 0.5fr 0.5fr 0.5fr 0.5fr 0.6fr 1.2fr" }}
      >
        <div className="pl-9">Franchise</div>
        <div>City</div>
        <div>League</div>
        <div className="text-center">Seasons</div>
        <div className="text-right">W</div>
        <div className="text-right">L</div>
        <div className="text-right">T</div>
        <div className="text-right">Win%</div>
        <div>Titles</div>
      </div>

      {/* Collapsible per-franchise rows. Each row is a native <details>
          element so the +/- toggle works without JavaScript. */}
      <section className="rounded-xl border overflow-hidden"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        {rows.map((r) => {
          const mono = monoFor(r.canonical);
          const titleEntries = histChamps[r.canonical] || [];
          const seasonRows = histSeasons[r.canonical] || [];
          const isPottsville = r.canonical === "Maroons";
          return (
            <details
              key={r.canonical}
              className="group border-b last:border-b-0"
              style={{
                borderColor: "var(--border)",
                background: isPottsville ? "rgba(94, 20, 20, 0.08)" : undefined,
              }}
            >
              <summary
                className="flex items-center gap-3 cursor-pointer select-none px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <span
                  className="inline-grid place-items-center rounded-full flex-shrink-0 text-xs font-bold transition-transform"
                  style={{
                    background: "transparent",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                    width: 22, height: 22, fontSize: 14, lineHeight: 1,
                  }}
                  aria-hidden
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
                <div
                  className="flex-1 grid items-center gap-3 text-xs sm:text-sm"
                  style={{ gridTemplateColumns: "1fr 1.2fr 0.7fr 0.5fr 0.5fr 0.5fr 0.5fr 0.6fr 1.2fr" }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="inline-grid place-items-center rounded-full flex-shrink-0"
                      style={{
                        background: mono.bg, color: mono.fg,
                        width: 28, height: 28, fontSize: 10, fontWeight: 700, letterSpacing: "-0.02em",
                      }}
                      aria-hidden
                    >
                      {mono.mono}
                    </span>
                    <span className="truncate">{r.name}</span>
                  </div>
                  <div className="text-[var(--text-muted)] truncate">{r.city}</div>
                  <div className="text-[var(--text-muted)]">{r.league}</div>
                  <div className="text-[var(--text-muted)] tabular-nums text-center">{r.seasons}</div>
                  <div className="text-right tabular-nums">{r.w}</div>
                  <div className="text-right tabular-nums">{r.l}</div>
                  <div className="text-right tabular-nums">{r.t}</div>
                  <div className="text-right tabular-nums">{r.win_pct.toFixed(3)}</div>
                  <div>
                    {titleEntries.length === 0 ? (
                      <span className="text-[var(--text-dim)]">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {titleEntries.map((c) => {
                          if (c.stolen) {
                            return (
                              <span
                                key={c.year}
                                title={c.stolen_note}
                                className="inline-flex items-center text-xs font-semibold pr-4 pl-2 py-0.5 rounded relative"
                                style={{
                                  background:
                                    "repeating-linear-gradient(45deg, #5e1414 0, #5e1414 5px, #d4af37 5px, #d4af37 10px)",
                                  color: "#fff",
                                  border: "1px solid #d4af37",
                                  textShadow: "0 1px 0 rgba(0,0,0,0.6)",
                                }}
                              >
                                {c.year}
                                <span
                                  className="absolute right-1 top-1/2"
                                  style={{
                                    transform: "translateY(-50%)",
                                    color: "#d4af37",
                                    textShadow: "0 1px 0 rgba(0,0,0,0.8)",
                                    fontSize: "10px",
                                  }}
                                  aria-hidden
                                >
                                  ★
                                </span>
                              </span>
                            );
                          }
                          return (
                            <span
                              key={c.year}
                              className="text-xs font-semibold px-2 py-0.5 rounded"
                              style={{ background: TITLE_COLORS.pre_sb.bg, color: TITLE_COLORS.pre_sb.text }}
                              title={c.season_team ? `${c.season_city ?? ""} ${c.season_team}` : undefined}
                            >
                              {c.year}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </summary>

              {/* Body: per-season records for this franchise */}
              <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                {seasonRows.length === 0 ? (
                  <p className="text-xs text-[var(--text-dim)] italic py-3">
                    No season-by-season records in the source workbook.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs tabular-nums mt-2">
                      <thead>
                        <tr className="text-[var(--text-muted)]">
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Year</th>
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">League</th>
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Team</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">W</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">L</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">T</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Win%</th>
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Finish</th>
                          <th className="text-left font-medium py-1.5 uppercase tracking-wider text-[10px]">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seasonRows.map((s) => (
                          <tr
                            key={`${s.year}-${s.team}`}
                            className="border-t"
                            style={{
                              borderColor: "var(--border)",
                              background: s.champ ? "rgba(212,175,55,0.07)" : undefined,
                            }}
                          >
                            <td className="py-1.5 pr-3" style={{ color: s.champ ? TITLE_COLORS.sb.bg : undefined, fontWeight: s.champ ? 600 : undefined }}>
                              {s.year}
                            </td>
                            <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.league}</td>
                            <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.city} {s.team}</td>
                            <td className="py-1.5 pr-3 text-right">{s.w}</td>
                            <td className="py-1.5 pr-3 text-right">{s.l}</td>
                            <td className="py-1.5 pr-3 text-right">{s.t}</td>
                            <td className="py-1.5 pr-3 text-right">{s.win_pct.toFixed(3)}</td>
                            <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.place}</td>
                            <td className="py-1.5 text-[var(--text-muted)]">
                              {s.champ ? "Champion" : s.champ_app ? "Title game" : s.playoff ? "Playoffs" : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </section>

      {/* Pottsville stolen-title footnote */}
      <aside
        className="mt-6 p-4 sm:p-5 rounded-lg border-l-4"
        style={{
          background: "rgba(212, 175, 55, 0.06)",
          borderColor: "#d4af37",
        }}
      >
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#d4af37" }}>
          The Pottsville Maroons asterisk
        </h3>
        <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
          Pottsville finished 1925 at 10-2 and beat the 9-1-1 Chicago Cardinals 21-7 in the de facto championship
          game on December 6. Six days later they played a Notre Dame All-Stars exhibition at Shibe Park in Philadelphia,
          inside the Frankford Yellow Jackets&apos; protected territory. League President Joseph Carr suspended the
          Maroons. The Cardinals, who hastily scheduled two games against the dissolved Milwaukee Badgers and Hammond
          Pros to pad their record, were awarded the title. Pete Rozelle reviewed the case in 1963 and again in 1972,
          declining to restore Pottsville. NFL owners voted 30-2 in 2003 to leave the title with the Cardinals.
          The asterisk stands.
        </p>
      </aside>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Active 32: <Link href="/teams/nfl" className="hover:text-[var(--text-muted)]">/teams/nfl</Link>.
        Source: NFL_all workbook, last refreshed 2026-05-12.
      </p>
    </main>
  );
}
