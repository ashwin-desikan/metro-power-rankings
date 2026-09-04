import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getF1CircuitBySlug, getAllF1CircuitSlugs } from "@/lib/f1";
import TeamName from "@/app/teams/_shared/F1TeamName";
import { CappedList } from "@/app/_shared/Disclosure";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllF1CircuitSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = getF1CircuitBySlug(slug);
  if (!data) return { title: "Circuit not found" };
  const name = data.circuit.circuit_name ?? "Circuit";
  const title = `${name}: F1`;
  const desc = `Formula 1 race history at ${name}${data.circuit.metro ? ` (${data.circuit.metro})` : ""}: ${data.circuit.races} World Championship Grands Prix, ${data.circuit.first_year}–${data.circuit.last_year}.`;
  return {
    title, description: desc,
    alternates: { canonical: `/teams/f1/${slug}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/f1/${slug}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description: desc },
  };
}

export default async function F1CircuitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = getF1CircuitBySlug(slug);
  if (!data) notFound();
  const { circuit, races } = data;
  const raceHistory = [...races].reverse();

  const td = "px-3 py-1.5 text-sm";
  const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wider";
  const headStyle = { background: "var(--bg-card)", color: "var(--text-dim)" } as const;
  const rowBorder = { borderTop: "1px solid var(--border)" } as const;

  const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="rounded-lg px-4 py-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: "var(--text)" }}>{value}</div>
    </div>
  );

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
        <Link href="/teams/f1" className="hover:underline">Formula 1</Link> · Circuit
      </nav>
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold" style={{ color: "var(--text)" }}>{circuit.circuit_name}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {circuit.metro ? (
            circuit.metro_slug ? (
              <>Host metro: <Link href={`/rankings/${circuit.metro_slug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{circuit.metro}</Link></>
            ) : <>Host metro: {circuit.metro}</>
          ) : null}
          {circuit.country ? <span style={{ color: "var(--text-dim)" }}> · {circuit.country}</span> : null}
          {circuit.wikipedia ? (
            <> · <a href={circuit.wikipedia} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>Wikipedia</a></>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        <Stat label="Grands Prix" value={circuit.races} />
        <Stat label="First / Last" value={`${circuit.first_year}–${circuit.last_year}`} />
        <Stat label="Latest winner" value={circuit.last_winner ?? "—"} />
        <Stat label="Most wins" value={circuit.most_wins_driver ? `${circuit.most_wins_driver[0]} (${circuit.most_wins_driver[1]})` : "—"} />
      </div>

      <h2 className="text-xl font-bold mb-4" style={{ color: "var(--text)" }}>Race History</h2>

      {/* Mobile: one card per race instead of a 5-column table that would
          otherwise force horizontal scrolling. Same reversed race list. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          initial={12}
          noun="races"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={raceHistory.map((r) => (
          <div
            key={`${r.season}-${r.round}-card`}
            className="rounded-lg p-3"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="text-sm font-bold tabular-nums" style={{ color: "var(--text)" }}>{r.season}</div>
            <div className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{r.race_name}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Winner</div>
                <div style={{ color: "var(--text)" }}>{r.winner ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Constructor</div>
                <div style={{ color: "var(--text-muted)" }}>
                  {r.winner_constructor ? <TeamName name={r.winner_constructor} crest={false} /> : "—"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Pole</div>
                <div style={{ color: "var(--text-muted)" }}>{r.pole ?? "—"}</div>
              </div>
            </div>
          </div>
        ))}
        />
      </div>

      <div className="rounded-lg overflow-hidden hidden sm:block" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full border-collapse">
          <thead><tr style={headStyle}>
            <th className={th}>Season</th><th className={th}>Grand Prix</th><th className={th}>Winner</th>
            <th className={th}>Constructor</th><th className={th}>Pole</th>
          </tr></thead>
          <tbody>
            {raceHistory.map((r) => (
              <tr key={`${r.season}-${r.round}`} style={rowBorder}>
                <td className={td} style={{ color: "var(--text-dim)" }}>{r.season}</td>
                <td className={td} style={{ color: "var(--text-muted)" }}>{r.race_name}</td>
                <td className={td} style={{ color: "var(--text)" }}>{r.winner ?? "—"}</td>
                <td className={td} style={{ color: "var(--text-muted)" }}>
                  {r.winner_constructor ? <TeamName name={r.winner_constructor} crest={false} /> : "—"}
                </td>
                <td className={td} style={{ color: "var(--text-muted)" }}>{r.pole ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
