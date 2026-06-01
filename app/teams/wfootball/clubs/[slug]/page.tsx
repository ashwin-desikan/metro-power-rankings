import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllWClubSlugs, getWClub, wMonogram } from "@/lib/wfootball";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllWClubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const club = getWClub(slug);
  if (!club) return { title: "Club not found" };
  const desc =
    `${club.name}: ${club.total_titles} major honor${club.total_titles === 1 ? "" : "s"} in women's football` +
    (club.metro ? `, ${club.metro}.` : ".");
  return {
    title: club.name,
    description: desc,
    alternates: { canonical: `/teams/wfootball/clubs/${club.slug}` },
    openGraph: { title: `${club.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/wfootball/clubs/${club.slug}`, type: "website" },
  };
}

function yearsLabel(years: number[]): string {
  return years.length ? years.join(", ") : "—";
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-[var(--text-muted)] mt-0.5">{label}</div>
    </div>
  );
}

export default async function WClubPage({ params }: Props) {
  const { slug } = await params;
  const club = getWClub(slug);
  if (!club) notFound();
  const mono = wMonogram(club);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/wfootball" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to Women&apos;s Football
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">All Sports</Link>
        {" / "}
        <Link href="/teams/wfootball" className="hover:underline">Women&apos;s Football</Link>
        {" / "}
        <span>{club.name}</span>
      </nav>

      <header className="mb-6 flex items-center gap-4">
        <span className="inline-flex items-center justify-center rounded-xl font-bold text-lg w-14 h-14 shrink-0" style={{ background: mono.bg, color: mono.fg }} aria-hidden>{mono.mono}</span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{club.name}</h1>
          <div className="mt-1 text-sm text-[var(--text-muted)]">
            {club.metro_slug ? (
              <Link href={`/rankings/${club.metro_slug}`} className="hover:underline">{club.metro}</Link>
            ) : club.metro ? (
              <span>{club.metro}</span>
            ) : null}
            {club.metro && club.country ? " · " : null}
            {club.country ?? null}
          </div>
          {club.current_league && (
            <span className="inline-block mt-1.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold" style={{ background: "rgba(78,205,196,0.14)", color: "var(--accent)" }}>{club.current_league}</span>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Stat label="Titles" value={club.total_titles} />
        <Stat label="Final appearances" value={club.total_finals} />
        <Stat label="First title" value={club.first_title ?? "—"} />
        <Stat label="Last title" value={club.last_title ?? "—"} />
      </section>

      <section className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">Honors by competition</h2>
        {club.honors.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">No major honors recorded yet.</p>
        ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
                <th className="py-2 pr-2 text-left font-medium">Competition</th>
                <th className="py-2 px-2 text-right font-medium">Titles</th>
                <th className="py-2 px-2 text-right font-medium">Runner-up</th>
                <th className="py-2 px-2 text-left font-medium hidden sm:table-cell">Won in</th>
              </tr>
            </thead>
            <tbody>
              {club.honors.map((h) => (
                <tr key={h.competition_slug} className="border-b align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-2"><Link href={`/teams/wfootball/${h.competition_slug}`} className="hover:underline font-medium">{h.competition_label}</Link></td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{h.titles > 0 ? h.titles : <span className="text-[var(--text-dim)] font-normal">—</span>}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{h.runner_ups > 0 ? h.runner_ups : <span className="text-[var(--text-dim)]">—</span>}</td>
                  <td className="py-1.5 px-2 text-xs text-[var(--text-muted)] hidden sm:table-cell tabular-nums">{yearsLabel(h.title_years)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </main>
  );
}
