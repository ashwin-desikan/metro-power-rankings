import type { Metadata } from "next";
import Link from "next/link";
import OrderNav from "@/app/order/_shared/OrderNav";
import { OrderCrumbs, OrderHeader } from "@/app/order/_shared/ui";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getOrderGrid, cellMatrix } from "@/lib/order";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";

// One of the three pages where prose is the product, alongside /methodology and
// /sports/about, so the one-clause-above-the-board rule in DESIGN-STANDARDS 2A
// does not apply here. Everywhere else in /order it does.

const PATH = "/order/about";
const TITLE = "What the Order layer is";
const DESC =
  "The political philosophy behind Citizen of Nowhere, stated plainly: belonging is chosen, order has three legs, no arrangement is final, and every claim carries an instrument.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC, images: ["/og-default.png"] },
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

const CREED: { title: string; body: string }[] = [
  {
    title: "Belonging is chosen, not inherited",
    body: "The unit of analysis is the place a person actually lives in, not the flag they were born under. This is the same claim the rest of the site makes about metros, applied to political order.",
  },
  {
    title: "Order has three legs, and balance is the signal",
    body: "A state that can act, a law that binds the ruler, and a way for society to hold both to account. More of any one leg is not better. The proportion between them is the thing worth measuring.",
  },
  {
    title: "No country is finished",
    body: "The top of any measure is a direction, not a place a country arrives at. An arrangement that looks permanent is one that has not been tested yet. Every board here is built so that nothing can reach the top.",
  },
  {
    title: "Every claim carries an instrument",
    body: "A number, a method, and a date it can be checked again. This site already grades its own sporting forecasts in public and publishes where they lose. Political claims get the same treatment or they do not get published.",
  },
];

export default function OrderAboutPage() {
  const grid = getOrderGrid();
  const matrix = cellMatrix(grid);
  const counts = grid.meta.coverage.cellCounts;
  const vanguard = grid.meta.vanguard;
  const ld = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: TITLE,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <OrderCrumbs tab="What this is" />
        <OrderHeader
          emoji="🧭"
          title="No country is finished."
          sub="Every ranking on this site is an argument about where power sits and what holds it. The Order layer states that argument once, in the open, and gives it instruments."
        />
        <OrderNav />

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3">The argument we are in</h2>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)] mb-4">
            In 1989 Francis Fukuyama argued that history had a direction and a destination, and that the destination was
            liberal democracy. He spent the next thirty years revising it. By 2014 the destination had grown a strong
            state and the rule of law alongside the ballot box, and he had begun writing about decay instead of arrival:
            institutions that freeze, elites that recapture the state, and systems with so many veto points that nothing
            can pass. His shorthand for the destination was a country: getting to Denmark.
          </p>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)] mb-4">
            We think the destination is the weak part. Complicated systems take detours. They circle back, they go
            backwards, and sometimes they head somewhere else entirely. The settlement that looked like an endpoint in
            1989 may turn out to be the product of one unusual decade. That is a question you answer with evidence
            rather than with a theory, and the way to answer it is to build the instrument and wait.
          </p>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
            So this layer takes Fukuyama's three legs as inputs and refuses his ending. Directionality is a hypothesis
            here, and it is scored like every other hypothesis on this site.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">What we believe</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {CREED.map((c, n) => (
              <div key={c.title} className="rounded-lg border p-5" style={CARD}>
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--accent)" }}>{String(n + 1).padStart(2, "0")}</p>
                <h3 className="font-bold mb-2">{c.title}</h3>
                <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3">Two axes, nine positions</h2>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)] mb-4">
            The grid is not new here. It is the same force and integrity matrix the rest of the project runs on. Force is
            what a state can do: its reach, its spending, its ability to act. Integrity is what holds it in check: law
            that binds the ruler rather than serving him.
          </p>
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="py-2 pr-3 font-semibold text-[var(--text-muted)]">Integrity</th>
                  <th className="py-2 px-3 font-semibold text-[var(--text-muted)]">Low force</th>
                  <th className="py-2 px-3 font-semibold text-[var(--text-muted)]">Mid force</th>
                  <th className="py-2 pl-3 font-semibold text-[var(--text-muted)]">High force</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, r) => (
                  <tr key={r} className="border-b align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="py-3 pr-3 text-[var(--text-muted)]" style={MONO}>{["High", "Mid", "Low"][r]}</td>
                    {row.map((cell) => (
                      <td key={cell.key} className="py-3 px-3">
                        <div className="font-semibold">{cell.name}</div>
                        <div className="text-[12px] text-[var(--text-muted)]">{cell.blurb}</div>
                        <div className="text-[11px] text-[var(--text-dim)] mt-1" style={MONO}>{counts[cell.key] ?? 0} states</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <h3 className="text-lg font-bold mt-8 mb-2">And a tenth that stays empty</h3>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)] mb-4">
            {vanguard.name} is the corner the two axes point at: {vanguard.blurb.charAt(0).toLowerCase() + vanguard.blurb.slice(1)}
          </p>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)] mb-4">{vanguard.why}</p>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)] mb-4">
            So it is not one of the nine. The top right band of the grid is called The Approach, because that is what the
            countries in it are doing, and the top third of a ranked field is still only the top third. The nearest any
            state gets to the corner is {grid.meta.coverage.closestName}, at {grid.meta.coverage.closestDistance} on a
            scale where zero is the corner itself, and it only gets that close by holding about a third of the world&apos;s
            recognised power. The median state is {grid.meta.coverage.medianDistance} away.
          </p>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)] mb-4">
            None of this measures whether a country is good. Force is not goodness and integrity is not virtue. A state
            can be capable, bound by law, and still do great harm, and a board that confused the two would be worth less
            than no board at all.
          </p>
          <p className="text-[13px] text-[var(--text-muted)] mt-4">
            <Link href="/order/grid" className="underline hover:text-[var(--accent)]">Open the grid</Link> to see who sits where, in {grid.year}, and how it was computed.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-3">What we will not do</h2>
          <ul className="text-[15px] leading-relaxed text-[var(--text-muted)] space-y-2 list-disc pl-5">
            <li>Rank countries as good or bad. We grade conditions and institutions. We do not grade the worth of the people who live under them.</li>
            <li>Name and judge living political figures on this page. That register belongs somewhere else and it is not this site.</li>
            <li>Fill a gap with a plausible number. Where a measure is missing, the page says so and the row stays unscored.</li>
            <li>Publish a finding before it survives its own caveats. Some of the most interesting results on this layer are sitting unpublished for exactly that reason.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-3">Where this sits</h2>
          <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">
            The Order layer reads the whole site. Force comes from the{" "}
            <Link href="/power-atlas" className="underline hover:text-[var(--accent)]">Power Atlas</Link>, integrity from the{" "}
            <Link href="/constitutions" className="underline hover:text-[var(--accent)]">constitutions chronology</Link> and the rule of law index,
            accountability from the <Link href="/elections" className="underline hover:text-[var(--accent)]">elections atlas</Link>, and recognition beyond
            the state from <Link href="/business" className="underline hover:text-[var(--accent)]">capital</Link>,{" "}
            <Link href="/sports/zone-zero-cup" className="underline hover:text-[var(--accent)]">sport</Link> and{" "}
            <Link href="/sound" className="underline hover:text-[var(--accent)]">culture</Link>. It is a lens on work that already exists, not a
            separate collection.
          </p>
        </section>
      </main>
    </>
  );
}
