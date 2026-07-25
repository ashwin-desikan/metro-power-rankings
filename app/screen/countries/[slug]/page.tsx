import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getScreen, getScreenCountryProfile } from "@/lib/screen";
import ScreenNav from "../../ScreenNav";

export const dynamic = "force-static";

export function generateStaticParams() {
  const f = getScreen();
  return (f?.countries ?? []).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const prof = getScreenCountryProfile(slug);
  const name = prof?.country.name;
  return {
    title: name ? `The Screen of ${name}` : "Screen of the Metros",
    description: name
      ? `The filmmakers ${name} raised and the canon films set within it, summed across its metros.`
      : undefined,
    alternates: { canonical: `/screen/countries/${slug}` },
  };
}

const PILLARS = [
  { key: "bo", label: "Box office", color: "#4f9dff" },
  { key: "pr", label: "Prestige", color: "#e8c766" },
  { key: "au", label: "Audience", color: "#6bd6a0" },
] as const;

export default async function ScreenCountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const prof = getScreenCountryProfile(slug);
  if (!prof) notFound();
  const { country, people, filmsSet, metros } = prof;

  const sig = people.reduce(
    (a, p) => ({ bo: a.bo + p.film, pr: a.pr + p.prestige, au: a.au + p.audience }),
    { bo: 0, pr: 0, au: 0 },
  );
  const sigTot = sig.bo + sig.pr + sig.au || 1;
  const muted = "text-[var(--text-muted)]";
  const border = { borderColor: "var(--border, #222b36)" } as const;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <ScreenNav />
      <p className={`mb-1 text-xs ${muted}`}>
        <Link href="/screen/countries" className="hover:underline">Rankings by Country</Link> / {country.name}
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">The Screen of {country.name}</h1>
      <p className={`mt-1 text-sm ${muted}`}>
        #{country.rank} by film pedigree · {country.people} people · {country.metros} scored{" "}
        {country.metros === 1 ? "metro" : "metros"} · {filmsSet.length} canon{" "}
        {filmsSet.length === 1 ? "film" : "films"} set here
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Country rank", `#${country.rank}`],
          ["Screen score", Math.round(country.score)],
          ["People", country.people],
          ["Metros", country.metros],
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
            What {country.name} is known for
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
        </section>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${muted}`}>From {country.name}</h2>
          <ol className="space-y-1 text-sm">
            {people.slice(0, 25).map((p, i) => (
              <li key={p.name} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[var(--text)]">
                  <span className={`mr-1 text-xs tabular-nums ${muted}`}>{i + 1}</span>{p.name}
                  {p.metroName ? <span className={`ml-1 text-xs ${muted}`}>{p.metroName}</span> : null}
                </span>
                <span className={`tabular-nums ${muted}`}>{p.combined}</span>
              </li>
            ))}
          </ol>
          {people.length > 25 && <p className={`mt-2 text-xs ${muted}`}>+{people.length - 25} more</p>}
        </section>
        <section>
          {metros.length > 0 && (
            <>
              <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${muted}`}>Top metros</h2>
              <ol className="space-y-1 text-sm">
                {metros.slice(0, 12).map((m, i) => (
                  <li key={m.slug} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[var(--text)]">
                      <span className={`mr-1 text-xs tabular-nums ${muted}`}>{i + 1}</span>
                      <Link href={`/screen/metros/${m.slug}`} className="hover:underline">{m.name}</Link>
                    </span>
                    <span className={`tabular-nums ${muted}`}>{Math.round(m.score)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {filmsSet.length > 0 && (
            <>
              <h2 className={`mb-2 mt-6 text-sm font-bold uppercase tracking-wide ${muted}`}>Canon films set here</h2>
              <ol className="space-y-1 text-sm">
                {filmsSet.slice(0, 20).map((c) => (
                  <li key={`${c.title}-${c.year}`} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[var(--text)]">{c.title} <span className={`text-xs ${muted}`}>{c.year}</span></span>
                    <span className={`text-xs tabular-nums ${muted}`}>#{c.rank}</span>
                  </li>
                ))}
              </ol>
              {filmsSet.length > 20 && <p className={`mt-2 text-xs ${muted}`}>+{filmsSet.length - 20} more</p>}
            </>
          )}
        </section>
      </div>

      <p className={`mt-10 text-xs ${muted}`}>
        Part of <Link href="/screen" className="hover:underline">The Screen of the Metros</Link>
      </p>
    </main>
  );
}
