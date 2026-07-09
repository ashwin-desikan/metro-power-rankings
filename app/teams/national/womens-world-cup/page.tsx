import type { Metadata } from "next";
import Link from "next/link";
import { getWWCEditions, getWWCNations, getWWCMeta } from "@/lib/wnational";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import WWCNationsTable from "./WWCNationsTable";

const PAGE_PATH = "/teams/national/womens-world-cup";
const PAGE_TITLE = "FIFA Women's World Cup";
const PAGE_DESCRIPTION =
  "Every FIFA Women's World Cup from 1991 to 2023: champions, finals, hosts, and the all-time record of every nation to take part, with per-nation team pages.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: `${BASE_URL}${PAGE_PATH}`, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function natLink(name: string | null, slug: string | null, opts?: { star?: boolean }) {
  if (!name) return <span className="text-[var(--text-dim)]">—</span>;
  const inner = slug ? <Link href={`/teams/national/womens-world-cup/${slug}`} className="hover:underline font-medium">{name}</Link> : <span className="font-medium">{name}</span>;
  return opts?.star ? <span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ color: "#d4af37" }}>★</span>{inner}</span> : inner;
}

export default function WWCHubPage() {
  const editions = getWWCEditions();
  const nations = getWWCNations();
  const meta = getWWCMeta();
  const topNation = nations[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">All Sports</Link>
        {" / "}
        <Link href="/teams/wfootball" className="hover:underline">Women&apos;s Football</Link>
        {" / "}
        <span>Women&apos;s World Cup</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{PAGE_TITLE}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">{PAGE_DESCRIPTION}</p>
        <p className="mt-3 text-xs text-[var(--text-muted)] tabular-nums">
          {meta.editions} editions · {meta.year_min}–{meta.year_max}
          {topNation && (<>{" · Most titled: "}<span className="text-[var(--text)] font-medium">{topNation.name}</span> ({topNation.titles})</>)}
        </p>
      </header>

      <section className="rounded-xl border p-5 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">Finals</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Most recent first. Nation links open each team&apos;s Women&apos;s World Cup page.</p>

        {/* Mobile: one card per edition instead of a 6-column table nobody
            can read at 375px without scrolling sideways or losing columns. */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
          {editions.map((e) => (
            <div
              key={`${e.year}-card`}
              className="rounded-lg border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold tabular-nums">{e.year}</span>
                <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{e.host ?? "—"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Champion</div>
                  <div>{natLink(e.champion, e.champion_slug, { star: true })}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                  <div className="text-[var(--text-muted)]">{natLink(e.runner_up, e.runner_up_slug)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Score</div>
                  <div className="tabular-nums text-[var(--text-muted)]">{e.final_score ?? "—"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Third</div>
                  <div className="text-[var(--text-muted)]">{natLink(e.third, e.third_slug)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
                <th className="py-2 pr-3 text-left font-medium whitespace-nowrap">Year</th>
                <th className="py-2 px-2 text-left font-medium hidden sm:table-cell">Host</th>
                <th className="py-2 px-2 text-left font-medium">Champion</th>
                <th className="py-2 px-2 text-left font-medium hidden md:table-cell">Score</th>
                <th className="py-2 px-2 text-left font-medium">Runner-up</th>
                <th className="py-2 px-2 text-left font-medium hidden lg:table-cell">Third</th>
              </tr>
            </thead>
            <tbody>
              {editions.map((e) => (
                <tr key={e.year} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap font-medium">{e.year}</td>
                  <td className="py-1.5 px-2 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">{e.host ?? "—"}</td>
                  <td className="py-1.5 px-2">{natLink(e.champion, e.champion_slug, { star: true })}</td>
                  <td className="py-1.5 px-2 tabular-nums text-[var(--text-muted)] hidden md:table-cell whitespace-nowrap">{e.final_score ?? "—"}</td>
                  <td className="py-1.5 px-2 text-[var(--text-muted)]">{natLink(e.runner_up, e.runner_up_slug)}</td>
                  <td className="py-1.5 px-2 text-[var(--text-muted)] hidden lg:table-cell">{natLink(e.third, e.third_slug)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <WWCNationsTable nations={nations} />
    </main>
  );
}
