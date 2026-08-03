import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllWCompetitionSlugs, getWCompetition } from "@/lib/wfootball";
import { getWLiveCompetition } from "@/lib/wLive";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import WLiveComp from "@/app/teams/wfootball/WLiveComp";

export const dynamicParams = false;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllWCompetitionSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = getWCompetition(slug);
  if (!c) return { title: "Competition not found" };
  const desc =
    `${c.label}: ${c.editions} edition${c.editions === 1 ? "" : "s"}` +
    (c.year_min && c.year_max ? ` (${c.year_min}–${c.year_max}).` : ".") +
    ` ${c.notes}`;
  return {
    title: c.label,
    description: desc,
    alternates: { canonical: `/teams/wfootball/${c.slug}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${c.label} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/wfootball/${c.slug}`, type: "website" },
  };
}

export default async function WCompetitionPage({ params }: Props) {
  const { slug } = await params;
  const c = getWCompetition(slug);
  if (!c) notFound();
  const hasScore = c.champions.some((x) => x.score);
  const top = c.most_decorated[0];
  const live = await getWLiveCompetition(slug);

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
        <span>{c.short_label}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-semibold tracking-tight">{c.label}</h1>
          <span className="inline-block rounded px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold" style={{ background: c.kind === "cup" ? "rgba(37,99,235,0.16)" : "rgba(202,138,4,0.16)", color: c.kind === "cup" ? "#2563eb" : "#ca8a04" }}>
            {c.kind === "cup" ? "Cup" : "League"}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)] max-w-3xl">{c.notes}</p>
        <p className="mt-3 text-xs text-[var(--text-muted)] tabular-nums">
          {c.editions} edition{c.editions === 1 ? "" : "s"}
          {c.year_min && c.year_max ? <> · {c.year_min}–{c.year_max}</> : null}
          {top && (<>{" · Most titled: "}<span className="text-[var(--text)] font-medium">{top.cur_name}</span> ({top.champion_count})</>)}
        </p>
      </header>

      {c.current && (
        <section className="rounded-xl border p-4 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          {c.current.decided ? (
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{c.current.year} champion: </span>
              <Link href={`/teams/wfootball/clubs/${c.current.champion_slug}`} className="font-semibold hover:underline">{c.current.champion}</Link>
              {c.current.runner_up && (
                <span className="text-[var(--text-muted)]">
                  {" · runner-up "}
                  {c.current.runner_up_slug ? (
                    <Link href={`/teams/wfootball/clubs/${c.current.runner_up_slug}`} className="hover:underline">{c.current.runner_up}</Link>
                  ) : (
                    c.current.runner_up
                  )}
                  {c.current.score ? <span className="tabular-nums"> ({c.current.score})</span> : null}
                </span>
              )}
            </div>
          ) : (
            <div className="text-sm text-[var(--text-dim)]">{c.current.year} season to be decided</div>
          )}
        </section>
      )}

      {live && live.hasContent && (
        <section className="rounded-xl border p-5 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <h2 className="text-base font-semibold">{live.seasonLabel} · live</h2>
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold" style={{ background: "rgba(16,185,129,0.16)", color: "#10b981" }}>Live · api-football</span>
          </div>
          <WLiveComp comp={live} />
        </section>
      )}

      <section className="rounded-xl border p-5 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">{c.kind === "cup" ? "All-time finals" : "All-time champions"}</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Most recent first. Club links open the club&apos;s honors page.</p>

        {/* Mobile: one card per season instead of a scroll-only table. Same
            c.champions data as the desktop table below. */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
          {c.champions.map((ch, i) => (
            <div
              key={`${ch.year}-${i}-card`}
              className="rounded-lg border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs tabular-nums text-[var(--text-dim)]">{ch.year}</span>
                {hasScore && ch.score && (
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">{ch.score}</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span aria-hidden style={{ color: "#d4af37" }}>★</span>
                <Link href={`/teams/wfootball/clubs/${ch.slug}`} className="font-semibold hover:underline">{ch.cur_name}</Link>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up </span>
                {ch.runner_up ? (
                  ch.runner_up_slug ? (
                    <Link href={`/teams/wfootball/clubs/${ch.runner_up_slug}`} className="hover:underline">{ch.runner_up}</Link>
                  ) : (
                    ch.runner_up
                  )
                ) : (
                  <span className="text-[var(--text-dim)]">—</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
                <th className="py-2 pr-3 text-left font-medium whitespace-nowrap">Season</th>
                <th className="py-2 px-2 text-left font-medium">Champion</th>
                {hasScore && <th className="py-2 px-2 text-left font-medium hidden sm:table-cell">Score</th>}
                <th className="py-2 px-2 text-left font-medium">Runner-up</th>
              </tr>
            </thead>
            <tbody>
              {c.champions.map((ch, i) => (
                <tr key={`${ch.year}-${i}`} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">{ch.year}</td>
                  <td className="py-1.5 px-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden style={{ color: "#d4af37" }}>★</span>
                      <Link href={`/teams/wfootball/clubs/${ch.slug}`} className="hover:underline font-medium">{ch.cur_name}</Link>
                    </span>
                  </td>
                  {hasScore && (
                    <td className="py-1.5 px-2 tabular-nums hidden sm:table-cell text-[var(--text-muted)]">{ch.score ?? <span className="text-[var(--text-dim)]">—</span>}</td>
                  )}
                  <td className="py-1.5 px-2 text-[var(--text-muted)]">
                    {ch.runner_up ? (
                      ch.runner_up_slug ? (
                        <Link href={`/teams/wfootball/clubs/${ch.runner_up_slug}`} className="hover:underline">{ch.runner_up}</Link>
                      ) : (
                        ch.runner_up
                      )
                    ) : (
                      <span className="text-[var(--text-dim)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {c.most_decorated.length > 0 && (
        <section className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <h2 className="text-base font-semibold">Most decorated</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Ranked by titles won. Finals counts total final appearances; trailing clubs reached a final without winning.</p>

          {/* Mobile: one card per club instead of a scroll-only table. Same
              c.most_decorated data as the desktop table below. */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
            {c.most_decorated.map((d, i) => (
              <div
                key={d.slug}
                className="rounded-lg border p-3"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs tabular-nums text-[var(--text-dim)] w-5 flex-shrink-0">{i + 1}</span>
                    <Link href={`/teams/wfootball/clubs/${d.slug}`} className="font-medium truncate hover:underline">{d.cur_name}</Link>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-semibold tabular-nums">{d.champion_count > 0 ? d.champion_count : <span className="text-[var(--text-dim)] font-normal">—</span>}</div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Titles</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Finals</div>
                    <div className="tabular-nums">{d.finals_count}{d.finals_lost > 0 && <span className="text-[var(--text-muted)]"> ({d.finals_lost} L)</span>}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Last won</div>
                    <div className="tabular-nums text-[var(--text-muted)]">{d.last_won ?? <span className="text-[var(--text-dim)]">—</span>}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="py-2 pr-2 text-right font-medium w-10">#</th>
                  <th className="py-2 px-2 text-left font-medium">Club</th>
                  <th className="py-2 px-2 text-right font-medium">Titles</th>
                  <th className="py-2 px-2 text-right font-medium">Finals</th>
                  <th className="py-2 px-2 text-right font-medium hidden sm:table-cell">Last won</th>
                </tr>
              </thead>
              <tbody>
                {c.most_decorated.map((d, i) => (
                  <tr key={d.slug} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text-muted)]">{i + 1}</td>
                    <td className="py-1.5 px-2"><Link href={`/teams/wfootball/clubs/${d.slug}`} className="hover:underline font-medium">{d.cur_name}</Link></td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{d.champion_count > 0 ? d.champion_count : <span className="text-[var(--text-dim)] font-normal">—</span>}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{d.finals_count}{d.finals_lost > 0 && <span className="text-[var(--text-muted)] text-xs"> ({d.finals_lost} L)</span>}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums hidden sm:table-cell">{d.last_won ?? <span className="text-[var(--text-dim)]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
