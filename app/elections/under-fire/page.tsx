import type { Metadata } from "next";
import Link from "next/link";
import { getConflicts, type War } from "@/lib/conflicts";
import { HUB_COUNTRY_SLUGS, matchWars, warLabel } from "@/lib/electionConflicts";
import { getElectionCensus, type CensusItem } from "@/lib/electionCensus";
import { ELECTION_HUBS } from "@/lib/electionHubsMeta";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { BackButton } from "../HubShared";

const PATH = "/elections/under-fire";
const TITLE = "Elections Under Fire";
const DESC =
  "Every election in the atlas held while the country was fighting a major war — from Lincoln's 1864 re-election mid-Civil War and Britain's coupon election of 1918 to Israel's wartime ballots and Russia's 2024 ritual. Voting during wartime is democracy's hardest test; here is every time it was taken.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

const F_COLOR: Record<0 | 1 | 2, string> = { 0: "#4ECDC4", 1: "#D97706", 2: "#8E1B1B" };
const F_LABEL: Record<0 | 1 | 2, string> = { 0: "free contest", 1: "restricted or tilted", 2: "unfree ritual" };

type Hit = { code: string; name: string; href: string; item: CensusItem };

export default async function UnderFirePage() {
  const wars = await getConflicts();
  const census = getElectionCensus();

  // war name -> { war, hits }
  const byWar = new Map<string, { war: War; hits: Hit[] }>();
  for (const row of census) {
    const slugs = HUB_COUNTRY_SLUGS[row.href] ?? [];
    if (!slugs.length) continue;
    for (const item of row.items) {
      for (const w of matchWars(wars, slugs, item.year)) {
        const entry = byWar.get(w.name) ?? { war: w, hits: [] };
        entry.hits.push({ code: row.code, name: row.name, href: row.href, item });
        byWar.set(w.name, entry);
      }
    }
  }
  const sections = Array.from(byWar.values())
    .sort((a, b) => (b.war.start ?? "").localeCompare(a.war.start ?? ""));
  for (const s of sections) s.hits.sort((a, b) => a.item.year - b.item.year || a.name.localeCompare(b.name));
  const totalBallots = sections.reduce((n, s) => n + s.hits.length, 0);
  const freeBallots = sections.reduce((n, s) => n + s.hits.filter((h) => h.item.f === 0).length, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Under fire</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BackButton href="/elections" label="All election hubs" />
        <BackButton href="/conflicts" label="Interstate wars" />
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2 tabular-nums">
          {totalBallots} wartime ballots · {freeBallots} held as free contests · {sections.length} major wars
        </p>
      </header>

      <div className="flex items-center gap-4 flex-wrap text-xs text-[var(--text-muted)] mb-8">
        {( [0, 1, 2] as const ).map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: F_COLOR[f] }} /> {F_LABEL[f]}
          </span>
        ))}
      </div>

      {sections.map(({ war, hits }) => (
        <section key={war.name} className="mb-8">
          <h2 className="text-xl font-bold text-[var(--text)]">
            {warLabel(war)}
            {war.civil ? (
              <span className="ml-2 align-middle text-[9px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 font-normal text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
                civil war
              </span>
            ) : null}
          </h2>
          <div className="mt-3 grid gap-2">
            {hits.map((h) => {
              const meta = ELECTION_HUBS[h.code];
              return (
                <Link
                  key={`${h.code}-${h.item.id}`}
                  href={`${h.href}/${h.item.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={flagUrlByCode(meta.flag)}
                    srcSet={flagSrcSetByCode(meta.flag)}
                    alt={`Flag of ${h.name}`}
                    width={20}
                    height={15}
                    className="rounded-[2px] border shrink-0"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <span className="font-semibold text-[var(--text)]">
                    {h.name} {h.item.label}
                  </span>
                  {h.item.winner ? (
                    <span className="text-sm text-[var(--text-muted)] truncate">— {h.item.winner}</span>
                  ) : null}
                  <span
                    className="ml-auto inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: F_COLOR[h.item.f] }}
                    title={F_LABEL[h.item.f]}
                  />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        A ballot appears here when its polity was a belligerent in a major war — interstate, or a
        civil war fought on its own soil — whose span includes the election year. War data:{" "}
        <Link href="/conflicts" className="hover:text-[var(--accent)]">Wars since 1500</Link>.
        The dot carries the election&apos;s honesty label from its hub — wartime votes under
        dictatorship were rituals, and are marked as such.
      </footer>
    </main>
  );
}
