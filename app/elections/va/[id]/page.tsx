import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getVaElections,
  vaConclaveById,
  vaNeighbours,
  vaEraOf,
  vaEraKeyOf,
  vaDuration,
} from "@/lib/vaElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { DetailPager } from "../../HubShared";

export function generateStaticParams() {
  return getVaElections().elections.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = vaConclaveById(id);
  if (!c) return {};
  const title = `${c.label} ${c.kind === "conclave" ? "Conclave" : "Papal Election"} — ${c.pope}`;
  const path = `/elections/va/${c.id}`;
  return {
    title,
    description: c.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: c.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      <p className="text-lg font-bold text-[var(--text)]">{value}</p>
      {sub ? <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p> : null}
    </div>
  );
}

export default async function VaConclaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = vaConclaveById(id);
  if (!c) notFound();
  const { prev, next } = vaNeighbours(c.id);
  const era = vaEraOf(c.year);
  const kindLabel = c.kind === "conclave" ? "Conclave" : "Papal Election";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <Link href="/elections/va" className="hover:underline">Vatican</Link>
        {" / "}
        <span>{c.label}</span>
      </nav>

      <DetailPager hubHref="/elections/va" hubName="Vatican" prev={prev} next={next} />

      <header className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-[var(--text)]">{c.label} {kindLabel}</h1>
          <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-1 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            elected {c.pope}
          </span>
        </div>
        <p className="text-sm text-[var(--text-dim)] mt-1">
          {c.date}
          {" · "}
          <Link href={`/elections/va#era-${vaEraKeyOf(c.year)}`} className="hover:text-[var(--accent)]">
            {era.label}
          </Link>
          {c.location ? <>{" · "}{c.location}</> : null}
        </p>
        <p className="text-[var(--text-muted)] max-w-3xl mt-3">{c.summary}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Fact
          label="Elected pope"
          value={c.pope}
          sub={c.birthName ?? undefined}
        />
        <Fact
          label="Succeeded"
          value={c.predecessor ?? "—"}
        />
        <Fact
          label="Duration"
          value={vaDuration(c)}
          sub={c.ballots != null ? `${c.ballots} ${c.ballots === 1 ? "ballot" : "ballots"}` : c.ballotsNote ?? undefined}
        />
        <Fact
          label="Cardinal electors"
          value={c.electors != null ? String(c.electors) : "—"}
          sub={c.kind === "conclave" ? "locked in under conclave rules" : "pre-conclave election"}
        />
      </div>

      {c.dean || c.camerlengo ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">Key officials</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <tbody>
                {c.dean ? (
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)] w-40">Dean</td>
                    <td className="px-3 py-2 text-[var(--text)]">{c.dean}</td>
                  </tr>
                ) : null}
                {c.camerlengo ? (
                  <tr>
                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)] w-40">Camerlengo</td>
                    <td className="px-3 py-2 text-[var(--text)]">{c.camerlengo}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-[var(--text-dim)] mb-8 max-w-3xl">
        Ballot-by-ballot tallies are destroyed by design — the paper is burned in the stove whose
        smoke announces the result — so this entry records what the Church documents: the dates,
        the electors, the number of ballots where known, and the man who walked out onto the
        balcony.
      </p>

      {/* prev / next */}
      <nav className="flex justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
        {prev ? (
          <Link href={`/elections/va/${prev.id}`} className="text-[var(--accent)] hover:underline">
            ← {prev.label} ({prev.pope})
          </Link>
        ) : <span />}
        <Link href="/elections/va" className="text-[var(--text-muted)] hover:text-[var(--accent)]">
          All conclaves
        </Link>
        {next ? (
          <Link href={`/elections/va/${next.id}`} className="text-[var(--accent)] hover:underline">
            {next.label} ({next.pope}) →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}
