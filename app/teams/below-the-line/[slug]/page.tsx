import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { BELOW_LINE_CLUBS, getBelowLineClub, honoursForClub } from "@/lib/belowTheLine";
import BelowTheLineTag from "@/app/teams/BelowTheLineTag";

export const dynamicParams = false;
export function generateStaticParams() {
  return BELOW_LINE_CLUBS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getBelowLineClub(slug);
  if (!c) return { title: "Club not found" };
  const path = `/teams/below-the-line/${slug}`;
  const desc = `${c.name}: ${c.sport} club below the level ${SITE_NAME} tracks for the sport${c.currentLevel ? `, currently in ${c.currentLevel}` : ""}. Honours and history.`;
  return {
    title: c.name,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${c.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${c.name} | ${SITE_NAME}`, description: desc },
  };
}

export default async function BelowTheLineClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getBelowLineClub(slug);
  if (!c) notFound();
  const h = honoursForClub(c);
  const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
  const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-3">
        <Link
          href={c.portalHref}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span> Back to {c.portalLabel}
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <Link href={c.portalHref} className="hover:underline">{c.portalLabel}</Link>{" / "}
        <span>{c.name}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
          <BelowTheLineTag />
        </div>
        <p className="text-sm text-[var(--text-muted)]">{c.sport}{c.currentLevel ? <> &middot; {c.currentLevel}</> : null}</p>
      </header>

      <section className="rounded-xl border p-4 mb-6" style={card}>
        <p className="text-sm text-[var(--text)]">
          {c.name} is not in the{" "}
          <Link href="/sports#league-directory" className="underline hover:text-[var(--accent)]">Sports directory</Link>.
          The directory and map track only clubs at or above the level set for each sport, and {c.name}{" "}
          {c.currentLevel ? `currently plays in ${c.currentLevel}` : "currently plays below that level"}. The club
          is active, not defunct; this page records its honours from the {h.rollLabel} roll.
        </p>
        {c.blurb && <p className="text-sm text-[var(--text-muted)] mt-2">{c.blurb}</p>}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section className="rounded-xl border p-4" style={card}>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-semibold">Titles</h2>
            <span className="text-[10px] text-[var(--text-dim)] tabular-nums" style={mono}>{h.titles.length}</span>
          </div>
          {h.titles.length ? (
            <ul className="text-xs space-y-1" style={mono}>
              {h.titles.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">None recorded.</p>
          )}
        </section>
        <section className="rounded-xl border p-4" style={card}>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-semibold">Runner-up</h2>
            <span className="text-[10px] text-[var(--text-dim)] tabular-nums" style={mono}>{h.runnersUp.length}</span>
          </div>
          {h.runnersUp.length ? (
            <ul className="text-xs space-y-1" style={mono}>
              {h.runnersUp.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">None recorded.</p>
          )}
        </section>
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-6">
        Honours sourced from the {h.rollLabel} roll. Below the Line clubs are active but below the level the Sports
        directory tracks, so they are excluded from the all-teams map by design.
      </p>
    </main>
  );
}
