import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getScreen, getScreenMetroProfile } from "@/lib/screen";
import ScreenNav from "../../ScreenNav";

export const dynamic = "force-static";

export function generateStaticParams() {
  const f = getScreen();
  return (f?.metros ?? []).map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const prof = getScreenMetroProfile(slug);
  const name = prof?.metro.name;
  return {
    title: name ? `The Screen of ${name}` : "Screen of the Metros",
    description: name
      ? `The filmmakers ${name} raised and the films set in it: box office, Academy prestige and audience acclaim, mapped to one metro.`
      : undefined,
    alternates: { canonical: `/screen/metros/${slug}` },
  };
}

const PILLARS = [
  { key: "bo", label: "Box office", color: "#4f9dff" },
  { key: "pr", label: "Prestige", color: "#e8c766" },
  { key: "au", label: "Audience", color: "#6bd6a0" },
] as const;

export default async function ScreenMetroPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const prof = getScreenMetroProfile(slug);
  if (!prof) notFound();
  const { metro, people, filmsSet, filmsByLocals } = prof;
  const cf = getScreen();
  const countrySlug = cf?.countries?.find((c) => c.name === metro.country)?.slug ?? null;
  const peerMetros = (cf?.metros ?? []).filter((m) => m.country === metro.country && m.slug !== slug).slice(0, 12);

  const byDecade = new Map<number, number>();
  for (const fl of filmsSet) {
    const d = Math.floor(fl.year / 10) * 10;
    byDecade.set(d, (byDecade.get(d) ?? 0) + 1);
  }
  const decadeKeys = [...byDecade.keys()].sort((a, b) => a - b);
  const maxDec = Math.max(1, ...byDecade.values());

  const sig = people.reduce(
    (a, p) => ({ bo: a.bo + p.film, pr: a.pr + p.prestige, au: a.au + p.audience }),
    { bo: 0, pr: 0, au: 0 },
  );
  const sigTot = sig.bo + sig.pr + sig.au || 1;
  const lead = PILLARS.map((p) => ({ ...p, v: sig[p.key] })).sort((a, b) => b.v - a.v)[0];

  const muted = "text-[var(--text-muted)]";
  const border = { borderColor: "var(--border, #222b36)" } as const;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <ScreenNav />
      <p className={`mb-1 text-xs ${muted}`}>
        <Link href="/screen/rankings" className="hover:underline">Rankings by Metro</Link> / {metro.name}
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">The Screen of {metro.name}</h1>
      <p className={`mt-1 text-sm ${muted}`}>
        {countrySlug ? (
          <Link href={`/screen/countries/${countrySlug}`} className="hover:underline">{metro.country}</Link>
        ) : (
          metro.country
        )}{" "}· #{metro.rank} by film pedigree · {people.length} notable{" "}
        {people.length === 1 ? "figure" : "figures"} · {filmsSet.length} canon{" "}
        {filmsSet.length === 1 ? "film" : "films"} set here
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Metro rank", `#${metro.rank}`],
          ["Screen score", Math.round(metro.score * 10) / 10],
          ["People", metro.people],
          ["Films set here", filmsSet.length],
        ] as [string, string | number][]).map(([k, v]) => (
          <div key={k} className="rounded-lg border p-3" style={border}>
            <div className={`text-xs ${muted}`}>{k}</div>
            <div className="text-xl font-bold tabular-nums text-[var(--text)]">{v}</div>
          </div>
        ))}
      </div>

      {people.length > 0 && (
        <section className="mt-6">
          <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${muted}`}>
            What {metro.name} is known for
          </h2>
          <div className="flex h-3 w-full overflow-hidden rounded-full border" style={border}>
            {PILLARS.map((p) => (
              <div key={p.key} title={`${p.label}: ${Math.round((sig[p.key] / sigTot) * 100)}%`}
                style={{ width: `${(sig[p.key] / sigTot) * 100}%`, background: p.color }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {PILLARS.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
                <span className={muted}>{p.label} {Math.round((sig[p.key] / sigTot) * 100)}%</span>
              </span>
            ))}
          </div>
          <p className={`mt-2 text-sm ${muted}`}>
            {metro.name} skews toward <b className="text-[var(--text)]">{lead.label.toLowerCase()}</b>.
          </p>
        </section>
      )}

      {decadeKeys.length > 0 && (
        <section className="mt-6">
          <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${muted}`}>Canon films set here, by decade</h2>
          <div className="flex items-end gap-1" style={{ height: 96 }}>
            {decadeKeys.map((d) => {
              const v = byDecade.get(d) ?? 0;
              const h = Math.round((v / maxDec) * 100);
              return (
                <div key={d} className="flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
                  <div className="text-[10px] tabular-nums text-[var(--text-muted)]">{v}</div>
                  <div title={`${d}s: ${v}`} style={{ width: "100%", height: `${h}%`, minHeight: 3, background: "#4f9dff", borderRadius: 3 }} />
                  <div className="mt-1 text-[10px] text-[var(--text-muted)]">{`'${String(d).slice(2)}`}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {people.length > 0 && (
          <section>
            <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${muted}`}>From {metro.name}</h2>
            <ol className="space-y-1 text-sm">
              {people.slice(0, 25).map((p, i) => (
                <li key={p.name} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[var(--text)]">
                    <span className={`mr-1 text-xs tabular-nums ${muted}`}>{i + 1}</span>{p.name}
                  </span>
                  <span className={`tabular-nums ${muted}`} title={`box office ${p.film} · prestige ${p.prestige} · audience ${p.audience}`}>{p.combined}</span>
                </li>
              ))}
            </ol>
            {people.length > 25 && <p className={`mt-2 text-xs ${muted}`}>+{people.length - 25} more</p>}
          </section>
        )}
        {filmsSet.length > 0 && (
          <section>
            <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${muted}`}>Set in {metro.name}</h2>
            <ol className="space-y-1 text-sm">
              {filmsSet.slice(0, 25).map((c) => (
                <li key={`${c.title}-${c.year}`} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[var(--text)]">
                    {c.title} <span className={`text-xs ${muted}`}>{c.year}</span>
                    {c.setting?.via === "filmed" && <span className={`ml-1 text-[10px] ${muted}`}>filmed</span>}
                  </span>
                  <span className={`text-xs tabular-nums ${muted}`}>#{c.rank}</span>
                </li>
              ))}
            </ol>
            {filmsSet.length > 25 && <p className={`mt-2 text-xs ${muted}`}>+{filmsSet.length - 25} more</p>}
          </section>
        )}
      </div>

      {filmsByLocals.length > 0 && (
        <section className="mt-8">
          <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${muted}`}>Canon films by {metro.name} filmmakers</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {filmsByLocals.slice(0, 30).map(({ film, directors }) => (
              <li key={`${film.title}-${film.year}`} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[var(--text)]">
                  {film.title} <span className={`text-xs ${muted}`}>{film.year} · {directors.join(", ")}</span>
                </span>
                <span className={`text-xs tabular-nums ${muted}`}>#{film.rank}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {filmsSet.length === 0 && filmsByLocals.length === 0 && people.length === 0 && (
        <p className={`mt-8 text-sm ${muted}`}>No Screen data attributed to this metro yet.</p>
      )}

      {peerMetros.length > 0 && (
        <section className="mt-8">
          <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${muted}`}>More {metro.country} metros</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {peerMetros.map((m) => (
              <Link key={m.slug} href={`/screen/metros/${m.slug}`}
                className="rounded-full border px-3 py-1 text-[var(--text)] hover:underline" style={border}>
                {m.name} <span className={`text-xs ${muted}`}>{Math.round(m.score)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className={`mt-10 text-xs ${muted}`}>
        Part of{" "}
        <Link href="/screen" className="hover:underline">The Screen of the Metros</Link>
        {" · "}
        <Link href={`/rankings/${slug}`} className="hover:underline">{metro.name} overview</Link>
      </p>
    </main>
  );
}
