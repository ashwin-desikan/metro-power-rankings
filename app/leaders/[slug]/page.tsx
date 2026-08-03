import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadersMaster, type LeaderEntity } from "@/lib/leadersAll";
import type { HistRow } from "@/lib/leaderRules";
import { BALLOT_OF } from "@/lib/electionLeaderLinks";
import { flagUrl, flagSrcSet } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { BackButton } from "../../elections/HubShared";

// Leadership profile per tracked entity: the full officeholder history behind
// the /leaders directory, joined to the election that produced the current
// government where a hub exists. Completes the two-way leaders ↔ elections join.

export async function generateStaticParams() {
  const entities = await getLeadersMaster();
  return entities.filter((e) => e.hasHistory).map((e) => ({ slug: e.slug }));
}

async function getEntity(slug: string): Promise<LeaderEntity | null> {
  const entities = await getLeadersMaster();
  return entities.find((e) => e.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const e = await getEntity(slug);
  if (!e) return {};
  const title = `${e.name} — Leadership History`;
  const desc = e.current
    ? `Every recorded holder of ${e.name}'s highest offices, through ${e.current.name} (${e.current.role}) today.`
    : `Every recorded holder of ${e.name}'s highest offices.`;
  const path = `/leaders/${e.slug}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
  };
}

const yr = (d: string | null): string => {
  if (!d) return "";
  if (d.startsWith("-")) return `${parseInt(d.slice(1, 5), 10)} BC`;
  return d.slice(0, 4);
};

export default async function LeaderProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await getEntity(slug);
  if (!e || !e.hasHistory) notFound();

  // group the office history by role, preserving first-appearance order
  const byRole = new Map<string, HistRow[]>();
  for (const h of e.history) {
    const list = byRole.get(h.r) ?? [];
    list.push(h);
    byRole.set(h.r, list);
  }
  for (const list of byRole.values()) list.sort((a, b) => (b.s ?? "").localeCompare(a.s ?? ""));

  const ballot = BALLOT_OF[e.slug];
  const hubHref = ballot ? ballot.href.split("/").slice(0, 3).join("/") : null;
  const fu = flagUrl(e.slug);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/leaders" className="hover:underline">Leaders</Link>
        {" / "}
        <span>{e.name}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BackButton href="/leaders" label="All leaders" />
        {e.href ? <BackButton href={e.href} label={`${e.name} country page`} /> : null}
        {hubHref ? <BackButton href={hubHref} label="Election hub" /> : null}
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {fu ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fu}
              srcSet={flagSrcSet(e.slug) ?? undefined}
              alt={`Flag of ${e.name}`}
              width={40}
              height={30}
              className="rounded-sm border shrink-0"
              style={{ borderColor: "var(--border)" }}
            />
          ) : null}
          <h1 className="text-3xl font-bold text-[var(--text)]">{e.name}</h1>
          {e.yearRange ? (
            <span className="text-sm text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{e.yearRange}</span>
          ) : null}
        </div>
        <p className="text-[var(--text-muted)] max-w-3xl">
          {e.history.length.toLocaleString("en-US")} recorded officeholder spells across{" "}
          {byRole.size} office{byRole.size === 1 ? "" : "s"}
          {e.current ? (
            <>
              {" — led today by "}
              <span className="text-[var(--text)] font-semibold">{e.current.name}</span> ({e.current.role}
              {e.current.since ? `, since ${e.current.since}` : ""})
              {e.current.second ? (
                <>
                  {", with "}
                  {e.current.second.name} ({e.current.second.role})
                </>
              ) : null}
              .
            </>
          ) : (
            "."
          )}
        </p>
        {ballot ? (
          <p className="text-sm text-[var(--text-muted)] mt-3 rounded-xl border p-3 max-w-3xl" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <span className="font-semibold text-[var(--text)]">How they got the job:</span>{" "}
            <Link href={ballot.href} className="text-[var(--accent)] hover:underline" title={ballot.title}>
              the {ballot.year} election →
            </Link>
            {hubHref ? (
              <>
                {" · "}
                <Link href={hubHref} className="text-[var(--accent)] hover:underline">full election history →</Link>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {Array.from(byRole.entries()).map(([role, rows]) => (
        <section key={role} className="mb-8">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">{role || "Officeholders"}</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]" style={{ backgroundColor: "var(--bg-card)" }}>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5 w-28">From</th>
                  <th className="px-3 py-2.5 w-28">To</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h, i) => (
                  <tr key={`${h.n}-${h.s}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 text-[var(--text)]">{h.n}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">{yr(h.s)}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">{h.e ? yr(h.e) : "present"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Data from the leaders time-machine dataset; the current holder refreshes weekly.{" "}
        <Link href="/leaders" className="hover:text-[var(--accent)]">Use the time machine →</Link>
      </footer>
    </main>
  );
}
