import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getSkydb, getSupertalls } from "@/lib/skyscrapers";
import { SITE_NAME } from "@/lib/seo";
import StructuresBoard from "./StructuresBoard";

const PAGE_PATH = "/skyscrapers";
const PAGE_TITLE = "Supertall Skyscrapers";
const PAGE_DESCRIPTION =
  "Every building and every standing structure over 350 metres, on two honest height measures, and which metros are building their skylines fastest.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_PATH,
    type: "website",
  },
  twitter: {
    images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 min-w-0" style={CARD}>
      <div className="text-[20px] font-extrabold" style={MONO}>{v}</div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-muted)]">{k}</div>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-bold mb-1.5">{title}</h2>
      <p className="text-[14px] text-[var(--text-muted)] max-w-3xl">{sub}</p>
    </div>
  );
}

export default function SkyscrapersPage() {
  const { retrieved, structures, structuresUrl, buildings, buildingsUrl } = getSupertalls();
  const skydb = getSkydb();
  const placedMetros = new Set(structures.filter((s) => s.metroSlug).map((s) => s.metroSlug));
  const skydbDate = (skydb.generated || "").slice(0, 10);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/geography" className="hover:underline">Geography</Link>
        {" / "}
        <span>Supertall Skyscrapers</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">🏙️ Supertall Skyscrapers</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          Two ways of measuring the vertical world, kept honestly apart: the CTBUH-style ranking of every supertall{" "}
          <i>building</i>, and the full register of every standing <i>structure</i> past 350 metres, masts,
          chimneys and platforms included. Then the density boards: which metros are actually building their skylines.
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          wikipedia lists retrieved {retrieved} · {buildings.length} buildings · {structures.length} structures · skydb counts {skydbDate} · CC BY-SA 4.0
        </div>
      </header>

      <HubNav items={[
        { label: "Tallest buildings", href: "#buildings" },
        { label: "Tallest structures", href: "#structures" },
        { label: "Skyline density", href: "#density" },
        { label: "Sources", href: "#sources" },
      ]} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-10">
        <Stat v={String(buildings.length)} k="Tallest buildings" />
        <Stat v={String(structures.length)} k="Structures 350m+" />
        <Stat v={String(placedMetros.size)} k="Metros with one" />
        <Stat v={skydb.totals.over150m.toLocaleString("en-GB")} k="150m+ towers (SKYDB)" />
      </div>

      <section id="buildings" className="mb-12 scroll-mt-24">
        <SectionHead
          title="The tallest buildings on Earth"
          sub="Every building at 350 metres or more of architectural height, the CTBUH measure: spires count, antennas do not. This is the board to quote when someone says tallest building."
        />
        <TableScroll className="rounded-xl border" style={CARD}>
          <table className="w-full text-[13px]" data-sticky-col="2">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>#</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Building</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Height (m)</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Height (ft)</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Floors</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Year</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Metro</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Country</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b, i) => (
                <tr key={b.name}>
                  <td className="py-1.5 px-2 border-b text-[var(--text-dim)]" style={{ borderColor: "var(--border)", ...MONO }}>{i + 1}</td>
                  <td className="py-1.5 px-2 border-b font-medium" style={{ borderColor: "var(--border)" }}>{b.name}</td>
                  <td className="py-1.5 px-2 border-b font-bold" style={{ borderColor: "var(--border)", ...MONO }}>{b.heightM.toFixed(1)}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{b.heightFt.toLocaleString("en-GB")}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{b.floors ?? "–"}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{b.yearBuilt ?? "–"}</td>
                  <td className="py-1.5 px-2 border-b" style={{ borderColor: "var(--border)" }}>
                    {b.metroSlug ? (
                      <Link href={`/rankings/${b.metroSlug}`} className="underline decoration-dotted hover:text-[var(--accent)]">{b.metro}</Link>
                    ) : (
                      <span className="text-[var(--text-dim)]">{b.town || "–"}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>{b.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section id="structures" className="mb-12 scroll-mt-24">
        <SectionHead
          title="Every standing structure over 350 metres"
          sub="Pinnacle height, tip of the antenna included. This is a tallest-structures board, not the tallest-buildings ranking: Willis Tower reads 527.0 m here and 442.1 m above, and the 85-metre difference is entirely its twin antennas. Guyed television masts dominate the list."
        />
        <StructuresBoard rows={structures} />
      </section>

      <section id="density" className="mb-12 scroll-mt-24">
        <SectionHead
          title="Skyline density by metro"
          sub="How many towers each metro has actually built, from SKYDB's structure census: counts at 150, 200 and 300 metres of architectural height, with the era the skyline was built. Aggregates only, per SKYDB's licence."
        />
        <TableScroll className="rounded-xl border" style={CARD}>
          <table className="w-full text-[13px]" data-sticky-col="2">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>#</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Metro</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>150m+</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>200m+</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>300m+</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Median year</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Since 2010</th>
              </tr>
            </thead>
            <tbody>
              {skydb.rows.map((m, i) => (
                <tr key={m.slug}>
                  <td className="py-1.5 px-2 border-b text-[var(--text-dim)]" style={{ borderColor: "var(--border)", ...MONO }}>{i + 1}</td>
                  <td className="py-1.5 px-2 border-b font-medium" style={{ borderColor: "var(--border)" }}>
                    <Link href={`/rankings/${m.slug}`} className="underline decoration-dotted hover:text-[var(--accent)]">{m.city}</Link>
                  </td>
                  <td className="py-1.5 px-2 border-b font-bold" style={{ borderColor: "var(--border)", ...MONO }}>{m.over150m.toLocaleString("en-GB")}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{m.over200m.toLocaleString("en-GB")}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{m.over300m.toLocaleString("en-GB")}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{m.medianYear ?? "–"}</td>
                  <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{typeof m.pctSince2010 === "number" ? `${m.pctSince2010}%` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <section id="sources" className="scroll-mt-24">
        <div className="rounded-2xl border p-5 text-[13.5px] text-[var(--text-muted)]" style={CARD}>
          <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Where these numbers come from</h3>
          <p className="mb-2">
            The named boards come from Wikipedia:{" "}
            <a href={buildingsUrl} className="underline" rel="noopener noreferrer" target="_blank">List of tallest buildings</a>{" "}
            (architectural height) and{" "}
            <a href={structuresUrl} className="underline" rel="noopener noreferrer" target="_blank">List of tallest structures</a>{" "}
            (pinnacle height, 350 m threshold), retrieved {retrieved} and used under{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline" rel="noopener noreferrer" target="_blank">CC BY-SA 4.0</a>.
            Structures no longer standing are excluded. The two boards use different height measures and are never compared
            row to row; neither is the CTBUH ranking itself, though the buildings board follows its architectural measure.
          </p>
          <p className="mb-2">
            Each structure is assigned to a metro by point-in-polygon over our metro boundaries where the article carries
            coordinates, with an unambiguous city-plus-country name match as the fallback. Structures outside every metro
            stay unassigned rather than being guessed.
          </p>
          <p>
            Skyline density counts come from <a href="https://www.skydb.net" className="underline" rel="noopener noreferrer" target="_blank">SKYDB</a>&rsquo;s
            census of completed structures at architectural height. Its licence permits derived aggregates only, so that board
            shows counts and era statistics and never a name, height or coordinate. Skyline eras also appear on each metro&rsquo;s
            own page in the <Link href="/rankings" className="underline">rankings</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
