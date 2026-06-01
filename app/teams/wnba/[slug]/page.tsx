import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllFranchiseSlugs, getFranchiseBySlug, getFranchiseSeasons, type WnbaFranchise } from "@/lib/wnba";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllFranchiseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) return { title: "Franchise not found" };
  const desc = `${f.name}: ${f.titles} WNBA title${f.titles === 1 ? "" : "s"}, ${f.finals} finals, ${f.playoff_appearances} playoff appearances` + (f.city ? `, based in ${f.city}.` : ".");
  return {
    title: `${f.name} — WNBA`,
    description: desc,
    alternates: { canonical: `/teams/wnba/${f.slug}` },
    openGraph: { title: `${f.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/wnba/${f.slug}`, type: "website" },
  };
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg border text-center min-w-[72px]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{label}</span>
    </div>
  );
}

const FINISH: Record<string, { label: string; bg: string; color: string; border: string }> = {
  "Champion":        { label: "★ Champion", bg: "rgba(251,191,36,0.12)", color: "#F59E0B", border: "rgba(251,191,36,0.3)" },
  "Runner-up":       { label: "Finals",     bg: "var(--bg-card)", color: "var(--text-muted)", border: "var(--border)" },
  "Semifinals":      { label: "Semifinals", bg: "rgba(99,102,241,0.1)", color: "#818CF8", border: "rgba(99,102,241,0.25)" },
  "Playoffs":        { label: "Playoffs",   bg: "transparent", color: "var(--text-dim)", border: "var(--border)" },
  "Missed playoffs": { label: "—",          bg: "transparent", color: "var(--text-dim)", border: "transparent" },
};

function FinishChip({ finish }: { finish: string }) {
  const c = FINISH[finish] ?? FINISH["Missed playoffs"];
  return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border whitespace-nowrap" style={{ background: c.bg, color: c.color, borderColor: c.border }}>{c.label}</span>;
}

export default async function WnbaFranchisePage({ params }: Props) {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) notFound();
  const seasons = getFranchiseSeasons(slug);
  const pct = f.win_pct != null ? f.win_pct.toFixed(3).replace(/^0/, "") : "—";

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-xs mb-6 text-[var(--text-muted)] flex items-center gap-3 flex-wrap">
        <Link href="/sports" className="hover:text-[var(--accent)] transition-colors">All Sports</Link>
        <span className="text-[var(--text-dim)]">/</span>
        <Link href="/teams/wnba" className="hover:text-[var(--accent)] transition-colors">WNBA</Link>
        <span className="text-[var(--text-dim)]">/</span>
        <span>{f.name}</span>
      </nav>

      <header className="flex items-start gap-4 mb-6 flex-wrap">
        <span className="inline-flex items-center justify-center font-bold rounded-xl flex-shrink-0" style={{ background: f.color, color: "#fff", width: 64, height: 64, fontSize: f.abbr.length > 3 ? 18 : 22, letterSpacing: "0.04em", opacity: f.defunct ? 0.7 : 1 }} aria-hidden>{f.abbr}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{f.name}</h1>
            {f.defunct && <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1.5 py-0.5" style={{ borderColor: "var(--border)" }}>Defunct</span>}
            {f.seasons === 0 && <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1.5 py-0.5" style={{ borderColor: "var(--border)" }}>Expansion</span>}
          </div>
          <div className="text-sm text-[var(--text-muted)] mt-1">
            {f.metro_slug ? <Link href={`/rankings/${f.metro_slug}`} className="hover:underline">{f.city}</Link> : f.city}
            {f.city && f.state ? ", " : null}{f.state}
            {f.first_season ? <> · {f.first_season}–{f.last_season}</> : <> · Expansion franchise</>}
          </div>
          {f.aka.length > 0 && <div className="text-xs text-[var(--text-dim)] mt-1">Formerly: {f.aka.join(", ")}</div>}
        </div>
      </header>

      <section className="flex flex-wrap gap-2.5 mb-8">
        <StatChip label="Titles" value={f.titles} />
        <StatChip label="Finals" value={f.finals} />
        <StatChip label="Playoffs" value={f.playoff_appearances} />
        <StatChip label="Seasons" value={f.seasons} />
        <StatChip label="Record" value={`${f.w}-${f.l}`} />
        <StatChip label="Win%" value={pct} />
      </section>

      {f.title_years.length > 0 && (
        <p className="text-sm text-[var(--text-muted)] mb-6">
          <span className="text-yellow-400 font-semibold">Champions</span> {f.title_years.join(", ")}
          {f.final_years.filter((y) => !f.title_years.includes(y)).length > 0 && (
            <> · Finals (lost) {f.final_years.filter((y) => !f.title_years.includes(y)).join(", ")}</>
          )}
        </p>
      )}

      {seasons.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold mb-4">Season by Season</h2>
          <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-left py-2 px-4 font-medium">Season</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Conf</th>
                  <th className="text-left py-2 px-3 font-medium">Team</th>
                  <th className="text-right py-2 px-2 font-medium">W</th>
                  <th className="text-right py-2 px-2 font-medium">L</th>
                  <th className="text-right py-2 px-3 font-medium">Win%</th>
                  <th className="text-left py-2 px-3 font-medium">Finish</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.year} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: s.champion ? "rgba(251,191,36,0.06)" : undefined }}>
                    <td className="py-2 px-4 font-medium">{s.year}</td>
                    <td className="py-2 px-3 text-[var(--text-muted)] hidden sm:table-cell">{s.conference ?? "—"}</td>
                    <td className="py-2 px-3 text-[var(--text-muted)] text-xs">{s.team}</td>
                    <td className="py-2 px-2 text-right">{s.w}</td>
                    <td className="py-2 px-2 text-right text-[var(--text-muted)]">{s.l}</td>
                    <td className="py-2 px-3 text-right">{s.win_pct != null ? s.win_pct.toFixed(3).replace(/^0/, "") : "—"}</td>
                    <td className="py-2 px-3"><FinishChip finish={s.finish} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">No seasons played yet. This franchise is scheduled to debut as a WNBA expansion team.</p>
      )}

      <p className="text-xs text-[var(--text-dim)] mt-8">
        <Link href="/teams/wnba" className="hover:text-[var(--accent)] transition-colors">← All WNBA franchises</Link>
      </p>
    </main>
  );
}
