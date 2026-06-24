import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import {
  getAllFranchises,
  getIplMeta,
  getLatestSeason,
  getChampionshipHistory,
} from "@/lib/ipl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

const PAGE_PATH = "/teams/ipl";
const PAGE_URL  = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "IPL";
const PAGE_DESCRIPTION =
  "All 10 active Indian Premier League franchises ranked by titles, full season standings, playoff results, and finals history since the IPL's founding in 2008.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

// Playoff round sort order
const ROUND_ORDER: Record<string, number> = {
  "Qualifier 1": 1, "Semifinal 1": 1,
  "Eliminator": 2, "Semifinal 2": 2,
  "Qualifier 2": 3, "Third-Place Playoff": 3,
  "Final": 4,
};

function Monogram({ abbr, color, size = "sm" }: { abbr: string; color: string; size?: "sm" | "xs" }) {
  const w = size === "xs" ? 26 : 32;
  const h = size === "xs" ? 16 : 20;
  const fs = abbr.length > 3 ? 7 : 9;
  return (
    <span
      className="inline-flex items-center justify-center font-bold rounded flex-shrink-0"
      style={{ background: color, color: "#fff", width: w, height: h, fontSize: fs, letterSpacing: "0.03em" }}
    >
      {abbr}
    </span>
  );
}

export default function IplPage() {
  const meta       = getIplMeta();
  const franchises = getAllFranchises();
  const active     = franchises.filter(f => f.active);
  const defunct    = franchises.filter(f => !f.active);
  const latest     = getLatestSeason();
  const history    = getChampionshipHistory();

  // Build a slug→franchise lookup
  const bySlug = new Map(franchises.map(f => [f.slug, f]));

  // Sort ALL franchises (active + defunct) for the champions table
  const champTable = [...franchises].sort(
    (a, b) => b.titles - a.titles || b.finals - a.finals || b.playoff_appearances - a.playoff_appearances
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* Back to All Sports */}
      <nav className="text-xs mb-6 text-[var(--text-muted)]">
        <Link href="/sports" className="hover:text-[var(--accent)] transition-colors">
          ← All Sports
        </Link>
      </nav>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          Cricket · T20 · India
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Indian Premier League</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          The world's highest-attended T20 franchise league, launched by the BCCI in 2008.
          Ten city franchises compete each spring in a double round-robin group stage, followed
          by a four-team playoff. Rosters are rebuilt annually through the IPL auction — meaning
          a franchise's identity and city count more than any squad continuity.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{active.length}</strong> active franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{meta.total_seasons}</strong> seasons ({meta.founded}–{meta.latest_season})</div>
          <div>Reigning champion: <strong className="text-[var(--text)] text-sm">{latest.champion}</strong></div>
        </div>
      </header>

      <HubNav
        items={[
          { label: "Season", href: "#standings" },
          { label: "All-Time Champions", href: "#champions" },
          { label: "Finals History", href: "#finals" },
          { label: "Defunct", href: "#defunct" },
        ]}
      />

      {/* ── Latest season ──────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 id="standings" className="text-xl font-bold mb-4">{latest.year} Season</h2>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Standings */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    <th className="text-left py-2 px-3 font-medium w-8">#</th>
                    <th className="text-left py-2 px-3 font-medium">Team</th>
                    <th className="text-right py-2 px-2 font-medium">M</th>
                    <th className="text-right py-2 px-2 font-medium">W</th>
                    <th className="text-right py-2 px-2 font-medium">L</th>
                    <th className="text-right py-2 px-2 font-medium">NR</th>
                    <th className="text-right py-2 px-2 font-medium">Pts</th>
                    <th className="text-right py-2 px-3 font-medium">NRR</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.standings.map((st, idx) => {
                    const fr = bySlug.get(st.slug);
                    // Draw playoff cutoff line after position 4
                    const isCutoff = idx === 3;
                    return (
                      <tr
                        key={st.slug + idx}
                        className="border-b last:border-b-0"
                        style={{
                          borderColor: isCutoff ? "var(--accent)" : "var(--border)",
                          background: st.champion ? "rgba(251,191,36,0.07)" : undefined,
                        }}
                      >
                        <td className="py-2 px-3 text-[var(--text-dim)] text-xs">{st.pos}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {fr && <TeamCrest name={st.name} size={20} fallback={<Monogram abbr={fr.abbr} color={fr.color} size="xs" />} />}
                            <Link href={`/teams/ipl/${st.slug}`} className={`hover:text-[var(--accent)] transition-colors ${st.champion ? "font-semibold" : ""}`}>{st.name}</Link>
                            {st.champion  && <span className="text-yellow-400 text-xs leading-none">★</span>}
                            {st.finalist && !st.champion && <span className="text-[var(--text-dim)] text-[10px] leading-none">F</span>}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-[var(--text-muted)] text-xs">{st.m}</td>
                        <td className="py-2 px-2 text-right">{st.w}</td>
                        <td className="py-2 px-2 text-right text-[var(--text-muted)]">{st.l}</td>
                        <td className="py-2 px-2 text-right text-[var(--text-dim)] text-xs">{st.nr || "—"}</td>
                        <td className="py-2 px-2 text-right font-semibold">{st.pts}</td>
                        <td className="py-2 px-3 text-right text-xs"
                          style={{ color: st.nrr >= 0 ? "var(--text-muted)" : "var(--text-muted)" }}>
                          {st.nrr >= 0 ? "+" : ""}{st.nrr.toFixed(3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t flex gap-4 text-[10px] text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
                <span>Top 4 advance to playoffs · NRR = Net Run Rate</span>
                <span className="ml-auto">★ Champion · F Runner-up</span>
              </div>
            </div>
          </div>

          {/* Playoffs */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border p-4 h-full" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
                Playoff Results
              </h3>
              {[...latest.playoffs]
                .sort((a, b) => (ROUND_ORDER[a.round] ?? 9) - (ROUND_ORDER[b.round] ?? 9))
                .map((m, i, arr) => {
                  const isFinal = m.round === "Final";
                  return (
                    <div
                      key={i}
                      className={`pb-3 mb-3 ${i < arr.length - 1 ? "border-b" : ""} ${isFinal ? "mt-1" : ""}`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-1">{m.round}</div>
                      <div className={`text-sm leading-snug ${isFinal ? "font-semibold" : ""}`}>
                        {m.team1} <span className="text-[var(--text-dim)] font-normal">vs</span> {m.team2}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">{m.result}</div>
                    </div>
                  );
                })}
              <div className="mt-3 pt-3 border-t text-[10px] text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
                Format since 2011: Q1 (1v2) → Eliminator (3v4) → Q2 (Q1 loser vs EL winner) → Final
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── All-time champions ─────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 id="champions" className="text-xl font-bold mb-4">All-Time Champions</h2>
        <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="text-left py-2 px-4 font-medium">Franchise</th>
                <th className="text-right py-2 px-3 font-medium">Titles</th>
                <th className="text-right py-2 px-3 font-medium">Finals</th>
                <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">Playoffs</th>
                <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">Seasons</th>
                <th className="text-left py-2 px-4 font-medium hidden md:table-cell">Title Years</th>
              </tr>
            </thead>
            <tbody>
              {champTable.map(f => (
                <tr key={f.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 px-4">
                    <Link href={`/teams/ipl/${f.slug}`} className="flex items-center gap-2.5 hover:text-[var(--accent)] transition-colors">
                      <TeamCrest name={f.name} size={24} fallback={<Monogram abbr={f.abbr} color={f.color} />} />
                      <div>
                        <div className="font-medium leading-tight flex items-center gap-1.5">
                          {f.name}
                          {!f.active && <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1 py-0.5 font-normal" style={{ borderColor: "var(--border)" }}>Defunct</span>}
                        </div>
                        <div className="text-[11px] text-[var(--text-dim)]">{f.city}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {f.titles > 0
                      ? <span className="font-bold text-yellow-400 text-base">{f.titles}</span>
                      : <span className="text-[var(--text-dim)]">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--text-muted)]">{f.finals || "—"}</td>
                  <td className="py-2.5 px-3 text-right text-[var(--text-dim)] hidden sm:table-cell">{f.playoff_appearances}</td>
                  <td className="py-2.5 px-3 text-right text-[var(--text-dim)] hidden sm:table-cell">{f.seasons}</td>
                  <td className="py-2.5 px-4 hidden md:table-cell">
                    <span className="text-xs text-[var(--text-muted)]">
                      {f.title_years.length > 0 ? f.title_years.join(", ") : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Finals History ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 id="finals" className="text-xl font-bold mb-4">Finals History</h2>
        <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="text-left py-2 px-4 font-medium">Year</th>
                <th className="text-left py-2 px-3 font-medium">Champion</th>
                <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Runner-up</th>
                <th className="text-left py-2 px-4 font-medium hidden lg:table-cell">Result</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => {
                const cf = bySlug.get(h.champion_slug ?? "");
                const rf = bySlug.get(h.runner_up_slug ?? "");
                return (
                  <tr key={h.year} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-4 font-medium">{h.year}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {cf && <TeamCrest name={h.champion} size={18} fallback={<Monogram abbr={cf.abbr} color={cf.color} size="xs" />} />}
                        {h.champion_slug
                          ? <Link href={`/teams/ipl/${h.champion_slug}`} className="font-medium hover:text-[var(--accent)] transition-colors">{h.champion}</Link>
                          : <span className="font-medium">{h.champion}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-[var(--text-muted)] hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        {rf && <TeamCrest name={h.runner_up} size={18} fallback={<Monogram abbr={rf.abbr} color={rf.color} size="xs" />} />}
                        {h.runner_up_slug
                          ? <Link href={`/teams/ipl/${h.runner_up_slug}`} className="hover:text-[var(--accent)] transition-colors">{h.runner_up}</Link>
                          : <span>{h.runner_up ?? "—"}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-xs text-[var(--text-dim)] hidden lg:table-cell">
                      {h.final_result ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Defunct franchises ─────────────────────────────────────────── */}
      {defunct.length > 0 && (
        <section className="mb-6">
          <h2 id="defunct" className="text-sm font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">Defunct Franchises</h2>
          <div className="flex flex-wrap gap-2">
            {defunct.map(f => (
              <Link
                key={f.slug}
                href={`/teams/ipl/${f.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--text-dim)", background: "var(--bg-card)" }}
              >
                <span className="inline-block rounded-sm w-2 h-2 flex-shrink-0" style={{ background: f.color }} />
                {f.name}
                {f.titles > 0 && <span className="text-yellow-500 ml-0.5">({f.title_years.join(", ")})</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-[var(--text-dim)] mt-6">
        Seasons {meta.founded}–{meta.latest_season}. Source: IPL / BCCI official records.
      </p>
    </main>
  );
}
