import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import HubNav from "@/app/teams/HubNav";
import { getOlympicEditionsIndex, getOlympicEdition, olympicSlugForNoc } from "@/lib/olympics";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getOlympicEditionsIndex().map((e) => ({ slug: e.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const ed = getOlympicEdition(slug);
  if (!ed) return {};
  const path = `/teams/olympics/games/${slug}`;
  const desc = `Complete medal table and every medalist from the ${ed.name}${ed.hostCity ? ` in ${ed.hostCity}` : ""}: ${ed.nations} nations, ${ed.events} events and ${ed.medalsTotal.toLocaleString()} medals.`;
  return {
    title: `${ed.name} — Medals`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${ed.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${ed.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MEDAL_COLOR: Record<string, string> = { Gold: "#d4af37", Silver: "#9aa0a6", Bronze: "#a97142" };

// A NOC code linked to its Olympic team page when one exists, else plain text.
function NocLink({ noc, className }: { noc: string; className?: string }) {
  const slug = olympicSlugForNoc(noc);
  const cls = `text-[var(--text-dim)] ${className ?? ""}`;
  return slug ? (
    <Link href={`/teams/olympics/${slug}`} className={`${cls} hover:text-[var(--accent)]`} style={mono}>{noc}</Link>
  ) : (
    <span className={cls} style={mono}>{noc}</span>
  );
}

export default async function OlympicEditionPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ed = getOlympicEdition(slug);
  if (!ed) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <Link href="/teams/olympics" className="hover:underline">Olympics</Link>{" / "}
        <span>{ed.name}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{ed.name}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {ed.hostCity}
          {ed.hostMetro && ed.hostMetroSlug ? (
            <>
              {" · "}
              <Link href={`/rankings/${ed.hostMetroSlug}`} className="underline hover:text-[var(--accent)]">
                {ed.hostMetro} metro
              </Link>
            </>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-[var(--text-dim)] tabular-nums" style={mono}>
          {ed.nations} nations {"·"} {ed.events} events {"·"} {ed.medalsTotal.toLocaleString()} medals
        </p>
      </header>

      <HubNav
        items={[
          { label: "Medal table", href: "#table" },
          { label: "Every medal", href: "#medals" },
        ]}
      />

      <section className="mb-10">
        <h2 id="table" className="text-lg font-semibold mb-1">Medal table</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every nation that won a medal, ranked by gold, then silver, then bronze.
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[480px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium text-right">#</th>
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 font-medium text-right">G</th>
                <th className="py-2 px-3 font-medium text-right">S</th>
                <th className="py-2 px-3 font-medium text-right">B</th>
                <th className="py-2 px-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {ed.table.map((r) => {
                const teamSlug = olympicSlugForNoc(r.noc);
                return (
                  <tr key={`${r.noc}-${r.rank}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank}</td>
                    <td className="py-1.5 px-3">
                      {teamSlug ? (
                        <Link href={`/teams/olympics/${teamSlug}`} className="hover:text-[var(--accent)]">
                          {r.name} <span className="text-[var(--text-dim)]" style={mono}>{r.noc}</span>
                        </Link>
                      ) : (
                        <>
                          {r.name} <span className="text-[var(--text-dim)]" style={mono}>{r.noc}</span>
                        </>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.g}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.s}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.b}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums font-medium" style={mono}>{r.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 id="medals" className="text-lg font-semibold mb-1">Every medal</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          All {ed.events} events grouped by sport. Tied places list every medalist.
        </p>
        <div className="space-y-3">
          {ed.sports.map((sp) => (
            <details key={sp.sport} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none">
                <span className="font-semibold text-[var(--text)]">{sp.sport}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {sp.events.length} event{sp.events.length !== 1 ? "s" : ""}
                </span>
              </summary>
              <div className="border-t divide-y" style={{ borderColor: "var(--border)" }}>
                {sp.events.map((ev, i) => (
                  <div key={i} className="px-4 py-3">
                    <p className="text-sm font-medium mb-1.5">{ev.event}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      {ev.medals.map((m, j) => (
                        <div key={j} className="text-xs">
                          <span className="font-semibold" style={{ color: MEDAL_COLOR[m.medal] }}>{m.medal}</span>{" "}
                          <span className="text-[var(--text)]">{m.name}</span>{" "}
                          <NocLink noc={m.noc} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <div className="text-sm text-[var(--text-muted)]">
        <Link href="/teams/olympics" className="underline hover:text-[var(--accent)]">
          {"←"} All Olympic Games
        </Link>
      </div>
    </main>
  );
}
