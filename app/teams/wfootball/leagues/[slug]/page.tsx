import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllWLeagueHubSlugs, getWLeagueHub, getWLeagueHubClubs, decoratedRows, columnsForHub } from "@/lib/wfootball";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import MostDecoratedClubsTable from "@/app/teams/wfootball/MostDecoratedClubsTable";

export const dynamicParams = false;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllWLeagueHubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hub = getWLeagueHub(slug);
  if (!hub) return { title: "League hub not found" };
  const comps = hub.competitions.map((c) => c.short_label).join(", ");
  const desc = `Women's club football in ${hub.country}: ${comps}. All-time champions, finals, and the most decorated clubs.`;
  return {
    title: `Women's Football — ${hub.country}`,
    description: desc,
    alternates: { canonical: `/teams/wfootball/leagues/${hub.slug}` },
    openGraph: { title: `Women's Football — ${hub.country} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/wfootball/leagues/${hub.slug}`, type: "website" },
  };
}

export default async function WLeagueHubPage({ params }: Props) {
  const { slug } = await params;
  const hub = getWLeagueHub(slug);
  if (!hub) notFound();
  const top = hub.most_decorated[0];
  const rows = decoratedRows(getWLeagueHubClubs(slug));
  const compsLabel = hub.competitions.map((c) => c.short_label).join(" and ");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
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
        <span>{hub.country}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.country}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)] max-w-3xl">
          Women&apos;s club competitions in {hub.country}: {hub.competitions.map((c) => c.short_label).join(", ")}.
          {top ? <> Most decorated: <span className="text-[var(--text)] font-medium">{top.name}</span> ({top.titles}).</> : null}
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-base font-semibold mb-3">Competitions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hub.competitions.map((c) => {
            const cur = c.current;
            return (
              <Link key={c.slug} href={`/teams/wfootball/${c.slug}`} className="block rounded-xl border p-4 transition hover:border-[var(--accent)]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold">{c.short_label}</div>
                  <span className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold" style={{ background: c.kind === "cup" ? "rgba(37,99,235,0.16)" : "rgba(202,138,4,0.16)", color: c.kind === "cup" ? "#2563eb" : "#ca8a04" }}>{c.kind === "cup" ? "Cup" : "League"}</span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                  {c.editions} edition{c.editions === 1 ? "" : "s"}
                  {c.year_min && c.year_max ? <> · {c.year_min}–{c.year_max}</> : null}
                </div>
                {cur && cur.decided && (
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    {cur.year} champion: <span className="font-medium text-[var(--text)]">{cur.champion}</span>
                  </div>
                )}
                {cur && !cur.decided && (
                  <div className="text-xs text-[var(--text-dim)] mt-2">{cur.year} to be decided</div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <MostDecoratedClubsTable
        title={`Most decorated in ${hub.country}`}
        caption={`Clubs with a final in ${compsLabel}, with their full honors breakdown. Click any column to sort.`}
        rows={rows}
        columns={columnsForHub(slug)}
      />
    </main>
  );
}
