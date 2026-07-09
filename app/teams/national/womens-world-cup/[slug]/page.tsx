import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllWWCNationSlugs, getWWCNation, getWWCMeta } from "@/lib/wnational";
import { countryPageSlugFor, flagCdnUrl } from "@/lib/international-display";
import { getAllCountrySlugs } from "@/lib/countries";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllWWCNationSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const n = getWWCNation(slug);
  if (!n) return { title: "Nation not found" };
  const desc = `${n.name} at the FIFA Women's World Cup: ${n.appearances} appearances, ${n.titles} title${n.titles === 1 ? "" : "s"}, ${n.finals} final${n.finals === 1 ? "" : "s"}, best finish ${n.best_finish}.`;
  return {
    title: `${n.name} — Women's World Cup`,
    description: desc,
    alternates: { canonical: `/teams/national/womens-world-cup/${n.slug}` },
    openGraph: { title: `${n.name} — Women's World Cup | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/national/womens-world-cup/${n.slug}`, type: "website" },
  };
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-[var(--text-muted)] mt-0.5">{label}</div>
    </div>
  );
}

function finishStyle(rank: number): { color: string; star?: boolean } {
  if (rank === 1) return { color: "#d4af37", star: true };
  if (rank === 2) return { color: "#9ca3af" };
  if (rank === 3) return { color: "#cd7f32" };
  return { color: "var(--text-muted)" };
}

export default async function WWCNationPage({ params }: Props) {
  const { slug } = await params;
  const n = getWWCNation(slug);
  if (!n) notFound();
  const tournament = getWWCMeta().label;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/national/womens-world-cup" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to Women&apos;s World Cup
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">All Sports</Link>
        {" / "}
        <Link href="/teams/wfootball" className="hover:underline">Women&apos;s Football</Link>
        {" / "}
        <Link href="/teams/national/womens-world-cup" className="hover:underline">Women&apos;s World Cup</Link>
        {" / "}
        <span>{n.name}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          {flagCdnUrl(n.slug, "40x30") && (
            <img src={flagCdnUrl(n.slug, "40x30")!} alt="" aria-hidden width={40} height={30} className="inline-block" loading="lazy" decoding="async" />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{n.name}</h1>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          FIFA Women&apos;s World Cup record{n.continent ? <> · {n.continent}</> : null}
          {n.title_years.length > 0 ? <> · Champions {n.title_years.join(", ")}</> : null}
        </p>
        {(() => {
          const cs = countryPageSlugFor(n.slug);
          return getAllCountrySlugs().includes(cs) ? (
            <div className="mt-2 text-xs">
              <Link href={`/countries/${cs}`} className="underline hover:text-[var(--accent)]">
                Country profile →
              </Link>
            </div>
          ) : null;
        })()}
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Stat label="Appearances" value={n.appearances} />
        <Stat label="Titles" value={n.titles} />
        <Stat label="Finals" value={n.finals} />
        <Stat label="Best finish" value={n.best_finish ?? "—"} />
      </section>

      <section className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">Tournament by tournament</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Every edition this nation reached the finals, most recent first.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
                <th className="py-2 pr-3 text-left font-medium whitespace-nowrap">Year</th>
                <th className="py-2 px-2 text-left font-medium">Tournament</th>
                <th className="py-2 px-2 text-left font-medium hidden sm:table-cell">Host</th>
                <th className="py-2 px-2 text-left font-medium">Finish</th>
                <th className="py-2 px-2 text-left font-medium hidden md:table-cell">Final</th>
              </tr>
            </thead>
            <tbody>
              {[...n.results].reverse().map((r) => {
                const fs = finishStyle(r.rank);
                return (
                  <tr key={r.year} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap font-medium">{r.year}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap"><Link href="/teams/national/womens-world-cup" className="hover:underline">{tournament}</Link></td>
                    <td className="py-1.5 px-2 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">{r.host ?? "—"}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5" style={{ color: fs.color }}>
                        {fs.star && <span aria-hidden>★</span>}
                        <span className="font-medium">{r.finish}</span>
                      </span>
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-[var(--text-muted)] hidden md:table-cell whitespace-nowrap">{r.final_score ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
