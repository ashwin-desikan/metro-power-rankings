import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getAllCompSlugs, getRoll } from "@/lib/championsHistory";
import { competitionHasHub } from "@/lib/competitionLinks";
import { sportIcon } from "@/lib/sportLabels";
import ChampionLogo from "@/app/teams/_shared/ChampionLogo";

export const dynamicParams = false;

export function generateStaticParams() {
  // Only competitions WITHOUT a dedicated hub get an honour-roll page; the
  // rest link straight to their hub (see lib/competitionLinks.ts).
  return getAllCompSlugs().filter((comp) => !competitionHasHub(comp)).map((comp) => ({ comp }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ comp: string }> },
): Promise<Metadata> {
  const { comp } = await params;
  const roll = getRoll(comp);
  if (!roll) return { title: "Champions" };
  const path = `/sports/champions/${comp}`;
  const title = `${roll.competition} — All-Time Champions`;
  const desc = `Every ${roll.competition} champion: the full honour roll, each linked to its team page and home metro.`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${title} | ${SITE_NAME}`, description: desc },
  };
}

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

export default async function ChampionRollPage(
  { params }: { params: Promise<{ comp: string }> },
) {
  const { comp } = await params;
  const roll = getRoll(comp);
  if (!roll) notFound();

  const { competition, sport, rows } = roll;
  const hasEra = rows.some((r) => r.eraName && r.eraName !== competition);
  const dated = rows.filter((r) => r.date).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pt-24">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <Link href="/sports/champions" className="hover:underline">Champions</Link>
        {" / "}
        <span>{competition}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden className="text-2xl">🏆</span>
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: GOLD }}>
            {sportIcon(sport) ? `${sportIcon(sport)} ` : ""}{sport} · All-time honour roll
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">{competition}</h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-muted)]">
          <div><strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{rows.length}</strong> champions</div>
          <div><strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{dated}</strong> with a known date</div>
        </div>
      </header>

      {/* Mobile: stacked cards instead of a 4-5 column table */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {rows.map((r, i) => (
          <div key={`${r.season}-${r.champion}-${i}-card`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 leading-tight flex items-center gap-1.5 flex-wrap font-medium text-sm">
                <ChampionLogo name={r.champion} canonical={r.canonical} size={16} />
                {r.teamHref ? (
                  <Link href={r.teamHref} className="text-[var(--text)] hover:text-[var(--accent)] hover:underline">{r.champion}</Link>
                ) : (
                  <span className="text-[var(--text)]">{r.champion}</span>
                )}
              </div>
              <div className="text-xs tabular-nums text-[var(--text-muted)] flex-shrink-0" style={mono}>{r.season || r.year || "—"}</div>
            </div>
            {r.canonical && r.canonical !== r.champion && (
              <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{r.canonical}</div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {hasEra && r.eraName && r.eraName !== competition && (
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Competition</div>
                  <div className="text-[var(--text-muted)]">{r.eraName}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Metro</div>
                <div>
                  {r.metroSlug ? (
                    <Link href={`/rankings/${r.metroSlug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{r.metro}</Link>
                  ) : (
                    <span className="text-[var(--text-dim)]">{r.metro || "—"}</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Date</div>
                <div className="tabular-nums text-[var(--text-muted)]" style={mono}>{r.date || "—"}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto border border-[var(--border)] rounded-lg hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--text-dim)] border-b border-[var(--border)]">
              <th className="px-3 py-2 font-semibold">Season</th>
              {hasEra && <th className="px-3 py-2 font-semibold">Competition</th>}
              <th className="px-3 py-2 font-semibold">Champion</th>
              <th className="px-3 py-2 font-semibold">Metro</th>
              <th className="px-3 py-2 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.season}-${r.champion}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card)] transition">
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={mono}>{r.season || r.year || "—"}</td>
                {hasEra && (
                  <td className="px-3 py-2 text-[var(--text-muted)] text-xs">
                    {r.eraName && r.eraName !== competition ? r.eraName : ""}
                  </td>
                )}
                <td className="px-3 py-2">
                  <ChampionLogo name={r.champion} canonical={r.canonical} size={16} />
                  {r.teamHref ? (
                    <Link href={r.teamHref} className="text-[var(--text)] hover:text-[var(--accent)] hover:underline">{r.champion}</Link>
                  ) : (
                    <span className="text-[var(--text)]">{r.champion}</span>
                  )}
                  {r.canonical && r.canonical !== r.champion && (
                    <span className="text-[var(--text-dim)] text-xs"> · {r.canonical}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.metroSlug ? (
                    <Link href={`/rankings/${r.metroSlug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{r.metro}</Link>
                  ) : (
                    <span className="text-[var(--text-dim)]">{r.metro || "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-xs text-[var(--text-muted)] whitespace-nowrap" style={mono}>{r.date || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Champion shows the team&apos;s name at the time of victory; where it differs, the current canonical
        name follows. Metro reflects the era-correct home city. Dates are filled progressively.
      </p>
    </main>
  );
}
