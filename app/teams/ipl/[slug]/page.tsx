import type { Metadata } from "next";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllFranchiseSlugs,
  getFranchiseBySlug,
  getFranchiseSeasons,
  getMetroSlugForFranchise,
  type IplFranchise,
  type FranchiseSeason,
} from "@/lib/ipl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import TopTeamChip from "@/app/teams/TopTeamChip";

export const dynamicParams = false;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllFranchiseSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) return { title: "Franchise not found" };
  const url = `${BASE_URL}/teams/ipl/${f.slug}`;
  const status = f.active ? "active" : "defunct";
  const desc = `${f.name}: ${f.titles} IPL title${f.titles !== 1 ? "s" : ""}, ${f.playoff_appearances} playoff appearances, founded ${f.founded}. Based in ${f.city}, ${f.state}.`;
  return {
    title: f.name,
    description: desc,
    alternates: { canonical: `/teams/ipl/${f.slug}` },
    openGraph: { title: `${f.name} | ${SITE_NAME}`, description: desc, url, type: "website" },
    twitter: { card: "summary", title: `${f.name} | ${SITE_NAME}`, description: desc },
  };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function BigMonogram({ f, size = 64 }: { f: IplFranchise; size?: number }) {
  const fs = f.abbr.length > 3 ? size * 0.28 : size * 0.32;
  return (
    <span
      className="inline-flex items-center justify-center font-bold rounded-xl flex-shrink-0"
      style={{ background: f.color, color: "#fff", width: size, height: size, fontSize: fs, letterSpacing: "0.04em" }}
      aria-hidden
    >
      {f.abbr}
    </span>
  );
}

function SmallMonogram({ f }: { f: IplFranchise }) {
  return (
    <span
      className="inline-flex items-center justify-center font-bold rounded flex-shrink-0"
      style={{ background: f.color, color: "#fff", width: 28, height: 18, fontSize: f.abbr.length > 3 ? 7 : 9, letterSpacing: "0.03em" }}
      aria-hidden
    >
      {f.abbr}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg border text-center min-w-[72px]"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{label}</span>
    </div>
  );
}

const RESULT_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  "Champion":   { label: "★ Champion",  bg: "rgba(251,191,36,0.12)", color: "#F59E0B",        border: "rgba(251,191,36,0.3)" },
  "Runner-up":  { label: "Final",       bg: "var(--bg-card)",        color: "var(--text-muted)", border: "var(--border)" },
  "Q2":         { label: "Semi-final",  bg: "rgba(99,102,241,0.1)",  color: "#818CF8",         border: "rgba(99,102,241,0.25)" },
  "Semi-final": { label: "Semi-final",  bg: "rgba(99,102,241,0.1)",  color: "#818CF8",         border: "rgba(99,102,241,0.25)" },
  "Eliminator": { label: "Eliminated",  bg: "transparent",           color: "var(--text-dim)", border: "var(--border)" },
  "Q1":         { label: "Q1 (out)",    bg: "transparent",           color: "var(--text-dim)", border: "var(--border)" },
  "Playoffs":   { label: "Playoffs",    bg: "transparent",           color: "var(--text-dim)", border: "var(--border)" },
};

function ResultChip({ result }: { result: string | null }) {
  if (!result) return <span className="text-[var(--text-dim)] text-xs">—</span>;
  const cfg = RESULT_CONFIG[result] ?? { label: result, bg: "transparent", color: "var(--text-dim)", border: "var(--border)" };
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
    >
      {cfg.label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IplFranchisePage({ params }: Props) {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) notFound();

  const seasons = getFranchiseSeasons(slug);
  const titleSeasons = seasons.filter(s => s.playoff_result === "Champion");
  const finalSeasons = seasons.filter(s => s.playoff_result === "Runner-up");
  const metroSlug = getMetroSlugForFranchise(slug);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Breadcrumb */}
      <nav className="text-xs mb-6 text-[var(--text-muted)] flex items-center gap-3">
        <Link href="/sports" className="hover:text-[var(--accent)] transition-colors">
          All Sports
        </Link>
        <span className="text-[var(--text-dim)]">/</span>
        <Link href="/teams/ipl" className="hover:text-[var(--accent)] transition-colors">
          IPL
        </Link>
        <span className="text-[var(--text-dim)]">/</span>
        <span>{f.name}</span>
      </nav>

      {/* Header */}
      <header className="flex gap-5 items-start mb-8">
        <TeamCrest name={f.name} size={72} fallback={<BigMonogram f={f} size={72} />} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{f.name}</h1>
        <ChampionBadge items={getCurrentChampionships(f.name, "Cricket")} />
            <TopTeamChip names={[f.name]} metro={f.city} />
            {!f.active && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
                Defunct
              </span>
            )}
          </div>
          <p className="text-[var(--text-muted)] text-sm mb-4">
            {metroSlug
              ? <><Link href={`/rankings/${metroSlug}`} className="hover:text-[var(--accent)] transition-colors underline">{f.city}</Link>, {f.state}</>
              : <>{f.city}, {f.state}</>
            }
            {" · "}Founded {f.founded} · IPL{!f.active && " · Defunct"}
          </p>
          <div className="flex flex-wrap gap-2">
            <StatChip label="Titles" value={f.titles || "—"} />
            <StatChip label="Finals" value={f.finals || "—"} />
            <StatChip label="Playoffs" value={f.playoff_appearances} />
            <StatChip label="Seasons" value={f.seasons} />
          </div>
        </div>
      </header>

      {/* Championship years */}
      {titleSeasons.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            IPL Championships
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {titleSeasons.map(s => {
              const final = s.playoff_matches.find(m => m.round === "Final");
              return (
                <div
                  key={s.year}
                  className="rounded-xl border p-4"
                  style={{ background: "rgba(251,191,36,0.06)", borderColor: "rgba(251,191,36,0.25)" }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-yellow-400 text-lg">★</span>
                    <span className="font-bold text-xl text-yellow-400">{s.year}</span>
                    {s.team !== f.name && (
                      <span className="text-xs text-[var(--text-dim)] italic">as {s.team}</span>
                    )}
                  </div>
                  {final && (
                    <div className="text-sm text-[var(--text-muted)]">
                      <span className="text-[var(--text-dim)] text-xs">Final vs </span>
                      {final.opponent}
                    </div>
                  )}
                  {final && (
                    <div className="text-xs text-[var(--text-dim)] mt-0.5">{final.result}</div>
                  )}
                  <div className="text-xs text-[var(--text-dim)] mt-1">
                    Group stage: {s.pos === 1 ? "1st" : s.pos === 2 ? "2nd" : s.pos === 3 ? "3rd" : `${s.pos}th`} · {s.w}W {s.l}L{s.nr > 0 ? ` ${s.nr}NR` : ""} · {s.pts} pts
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Runner-up years (if no titles, or show separately) */}
      {finalSeasons.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Finals ({finalSeasons.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {finalSeasons.map(s => {
              const final = s.playoff_matches.find(m => m.round === "Final");
              return (
                <div
                  key={s.year}
                  className="rounded-lg border px-3 py-2"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                >
                  <div className="text-sm font-semibold">{s.year}</div>
                  {final && (
                    <div className="text-xs text-[var(--text-dim)] mt-0.5">
                      Lost to {final.opponent}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Season-by-season history */}
      <section>
        <h2 className="text-base font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
          Season History
        </h2>
        <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="text-left py-2 px-4 font-medium">Year</th>
                <th className="text-left py-2 px-3 font-medium">Team Name</th>
                <th className="text-right py-2 px-3 font-medium">Pos</th>
                <th className="text-right py-2 px-2 font-medium">W</th>
                <th className="text-right py-2 px-2 font-medium">L</th>
                <th className="text-right py-2 px-2 font-medium">NR</th>
                <th className="text-right py-2 px-2 font-medium">Pts</th>
                <th className="text-right py-2 px-3 font-medium">NRR</th>
                <th className="text-left py-2 px-4 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map(s => {
                return (
                  <tr
                    key={s.year}
                    className="border-b last:border-b-0"
                    style={{
                      borderColor: "var(--border)",
                      background: s.champion ? "rgba(251,191,36,0.05)" : undefined,
                    }}
                  >
                    <td className="py-2 px-4 font-medium">{s.year}</td>
                    <td className="py-2 px-3 text-[var(--text-muted)]">{s.team}</td>
                    <td className="py-2 px-3 text-right text-[var(--text-muted)]">{s.pos}</td>
                    <td className="py-2 px-2 text-right">{s.w}</td>
                    <td className="py-2 px-2 text-right text-[var(--text-muted)]">{s.l}</td>
                    <td className="py-2 px-2 text-right text-[var(--text-dim)]">{s.nr || "—"}</td>
                    <td className="py-2 px-2 text-right font-semibold">{s.pts}</td>
                    <td className="py-2 px-3 text-right text-xs"
                        style={{ color: s.nrr >= 0 ? "var(--text-muted)" : "var(--text-muted)" }}>
                      {s.nrr >= 0 ? "+" : ""}{s.nrr.toFixed(3)}
                    </td>
                    <td className="py-2 px-4">
                      <ResultChip result={s.playoff_result} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-6">
        Source: IPL / BCCI official records. <Link href="/teams/ipl" className="hover:text-[var(--accent)] transition-colors underline">← All IPL franchises</Link>
      </p>
    </main>
  );
}
