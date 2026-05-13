import type { Metadata } from "next";
import Link from "next/link";
import {
  getHistoricalFranchises,
  getHistoricalChampionships,
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

      {/* Table */}
      <section
        className="rounded-xl border p-3 sm:p-5 overflow-x-auto"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
              <th className="font-medium py-2 pr-3 uppercase tracking-wider text-[10px]">Franchise</th>
              <th className="font-medium py-2 pr-3 uppercase tracking-wider text-[10px]">City</th>
              <th className="font-medium py-2 pr-3 uppercase tracking-wider text-[10px]">League</th>
              <th className="font-medium py-2 pr-3 uppercase tracking-wider text-[10px]">Seasons</th>
              <th className="font-medium py-2 pr-3 uppercase tracking-wider text-[10px] text-right">W</th>
              <th className="font-medium py-2 pr-3 uppercase tracking-wider text-[10px] text-right">L</th>
              <th className="font-medium py-2 pr-3 uppercase tracking-wider text-[10px] text-right">T</th>
              <th className="font-medium py-2 pr-3 uppercase tracking-wider text-[10px] text-right">Win%</th>
              <th className="font-medium py-2 uppercase tracking-wider text-[10px]">Titles</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mono = monoFor(r.canonical);
              const titleEntries = histChamps[r.canonical] || [];
              const isPottsville = r.canonical === "Maroons";
              return (
                <tr
                  key={r.canonical}
                  className="border-b align-middle"
                  style={{
                    borderColor: "var(--border)",
                    background: isPottsville ? "rgba(94, 20, 20, 0.08)" : undefined,
                  }}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
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
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-muted)]">{r.city}</td>
                  <td className="py-2.5 pr-3 text-[var(--text-muted)]">{r.league}</td>
                  <td className="py-2.5 pr-3 text-[var(--text-muted)] tabular-nums">{r.seasons}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.w}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.l}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.t}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.win_pct.toFixed(3)}</td>
                  <td className="py-2.5">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
