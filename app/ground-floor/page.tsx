import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { SectionHead } from "@/app/_shared/SectionHead";
import {
  getGroundFloor, biggestGaps, smallestGaps, bestConditions,
  fmtPm, fmtShare, fmtGap, type GfRow,
} from "@/lib/groundFloor";

// The Ground Floor - the conditions scoreboard, deliberately SEPARATE from the
// power ranking. See GROUND-FLOOR-SPEC.md at the repo root for the full
// position and the measured findings behind every dimension choice.
//
// The two scores are never merged. A weighted composite would assert its
// conclusion in its weights and invite the reader to argue with the weighting
// instead of the finding; two honest scoreboards and the distance between them
// shows the map and lets the reader draw the conclusion.

const PATH = "/ground-floor";
const TITLE = "The Ground Floor";
const DESC =
  "The power ranking measures what a metro has accumulated. The Ground Floor measures what it delivers to the people in it: air quality, nitrogen dioxide and basic water and sanitation, across 4,269 metros. The distance between the two is the point.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const TH = "px-3 py-2 font-semibold";
const THR = "px-3 py-2 text-right font-semibold";
const TD = "px-3 py-2";
const TDR = "px-3 py-2 text-right";
const SMCOL = "hidden sm:table-cell";


function MetroLink({ name, slug }: { name: string; slug: string }) {
  return <Link href={`/rankings/${slug}`} className="hover:underline">{name}</Link>;
}

/** Gap-ordered board. First header is `#` so the table pins column 2 (the
 *  metro name) on phones, per the DESIGN-STANDARDS rank-first rule. */
function GapTable({ rows }: { rows: GfRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border min-w-0" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm" data-sticky-col="2">
        <thead>
          <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
            <th className={TH}>#</th>
            <th className={TH}>Metro</th>
            <th className={THR}>Gap</th>
            <th className={THR}>Ground Floor</th>
            <th className={`${THR} ${SMCOL}`}>PM2.5</th>
            <th className={`${THR} ${SMCOL}`}>NO&#8322;</th>
            <th className={`${THR} ${SMCOL}`}>No basic water</th>
            <th className={`${TH} ${SMCOL}`}>Country</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <td className={TD} style={MONO}>{r.accumulationRank}</td>
              <td className={`${TD} font-medium`}><MetroLink name={r.name} slug={r.slug} /></td>
              <td className={TDR} style={{ ...MONO, color: (r.gap ?? 0) > 50 ? "#E2628B" : "var(--text)" }}>
                {fmtGap(r.gap)}
              </td>
              <td className={TDR} style={MONO}>{Math.round(r.conditionsRank).toLocaleString()}</td>
              <td className={`${TDR} ${SMCOL}`} style={MONO}>{fmtPm(r.pm25)}</td>
              <td className={`${TDR} ${SMCOL}`} style={MONO}>{fmtPm(r.no2)}</td>
              <td className={`${TDR} ${SMCOL}`} style={MONO}>{fmtShare(r.water)}</td>
              <td className={`${TD} ${SMCOL} text-[var(--text-muted)]`}>{r.country}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Conditions-ordered board: `#` is the Ground Floor position here. */
function ConditionsTable({ rows }: { rows: GfRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border min-w-0" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm" data-sticky-col="2">
        <thead>
          <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
            <th className={TH}>#</th>
            <th className={TH}>Metro</th>
            <th className={THR}>PM2.5</th>
            <th className={THR}>NO&#8322;</th>
            <th className={`${THR} ${SMCOL}`}>No basic water</th>
            <th className={`${THR} ${SMCOL}`}>Accumulation</th>
            <th className={`${TH} ${SMCOL}`}>Country</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <td className={TD} style={MONO}>{i + 1}</td>
              <td className={`${TD} font-medium`}><MetroLink name={r.name} slug={r.slug} /></td>
              <td className={TDR} style={MONO}>{fmtPm(r.pm25)}</td>
              <td className={TDR} style={MONO}>{fmtPm(r.no2)}</td>
              <td className={`${TDR} ${SMCOL}`} style={MONO}>{fmtShare(r.water)}</td>
              <td className={`${TDR} ${SMCOL}`} style={MONO}>{r.accumulationRank}</td>
              <td className={`${TD} ${SMCOL} text-[var(--text-muted)]`}>{r.country}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GroundFloorPage() {
  const gf = getGroundFloor();

  if (!gf) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">The Ground Floor</h1>
        <p className="text-[var(--text-muted)]">This board is being rebuilt. Check back shortly.</p>
      </main>
    );
  }

  const { meta } = gf;
  const worst = biggestGaps(100, 15);
  const closest = smallestGaps(100, 12);
  const best = bestConditions(20, 1500);
  const dimLabels = meta.dimensions.map((d) => `${d.label} ${d.year ?? ""}`.trim()).join(" · ");
  const accCorr = meta.correlations?.accumulationVsConditionsRank;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>The Ground Floor</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          <span aria-hidden>&#127961;&#65039;</span> The Ground Floor
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          The power ranking measures accumulation: what a metro has gathered. The two are never
          merged, because the distance between them is the only thing worth publishing.
        </p>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
          {meta.metrosRanked.toLocaleString()} metros &middot; {meta.dimensions.length} dimensions &middot; {dimLabels}
        </p>
      </header>

      <section id="gap" className="mb-12">
        <SectionHead
          title="The gap"
          sub="The hundred biggest accumulators, ranked by how far conditions fall short of what they've gathered."
          more="Gap is measured in percentile points: the distance between a metro's place on the power ranking and its place here."
        />
        <GapTable rows={worst} />
      </section>

      <section id="closest" className="mb-12">
        <SectionHead
          title="Closest to their weight"
          sub="The same hundred metros, ranked by how close conditions come to matching what they accumulate."
          more="Every one is still positive: no large metro delivers better than it accumulates."
        />
        <GapTable rows={closest} />
      </section>

      <section id="best" className="mb-12">
        <SectionHead
          title="Best conditions"
          sub="Ranked on conditions alone, among the 1,500 biggest accumulators."
          more="Restricted to the top 1,500 by accumulation so the board is not filled with hamlets."
        />
        <ConditionsTable rows={best} />
      </section>

      <section id="method" className="rounded-2xl border p-5" style={CARD}>
        <h2 className="text-lg font-bold mb-3">How this board works</h2>
        <div className="text-[13.5px] leading-relaxed text-[var(--text-muted)] space-y-3 max-w-3xl">
          <p>
            The power ranking is a good instrument for one question and a useless one for any
            other. It cannot tell you whether the people living somewhere breathe clean air, can
            reach work, or can afford to live near it. We rank each metro on each condition
            independently and take the median of those ranks. There are no weights, because we
            are not in a position to tell you that clean air matters more than water. The
            position underneath this is stated rather than concealed: a metro that concentrates
            extraordinary capital while failing the people inside it is not succeeding, whatever
            its rank says.
          </p>
          <p>
            Three dimensions, each measured the same way for every metro in the set, each ranked
            independently. A metro&apos;s Ground Floor rank is the median of its three dimension
            ranks. No weights and no normalisation, so there is nothing to argue with except the
            measurements themselves.
          </p>
          <p>
            <strong>Air quality</strong> is annual mean PM2.5 from SatPM2.5 V6GL03 (Atmospheric
            Composition Analysis Group, Washington University in St. Louis), satellite-derived and
            calibrated against ground monitors, CC BY 4.0.{" "}
            <strong>Nitrogen dioxide</strong> is annual mean ground-level NO&#8322; from
            GlobalNO2_AiT (Mu and Tao, Earth System Science Data), CC BY 4.0. NO&#8322; is almost
            entirely combustion-derived, so unlike PM2.5 it carries no natural dust or sea-salt
            component.{" "}
            <strong>Water and sanitation</strong> is the mean of the shares of population with
            unimproved drinking water and unimproved sanitation, from WRI Aqueduct 4.0.
          </p>
          <p>
            <strong>What the gap is not.</strong> It is bounded by position: a metro at the very top
            of the power ranking cannot have a negative gap, and one at the bottom cannot have a
            large positive one. It is a legible way of saying two ranks are far apart, not an effect
            size, and it should not be averaged.
            {typeof accCorr === "number" && (
              <>
                {" "}Across the whole set the correlation between accumulation rank and conditions
                rank is {accCorr.toFixed(2)}, which reads as though gathering more means living
                worse. Do not trust it. Accumulation is largely a measure of size, and larger
                metros have worse measured air; hold population constant and the relationship
                reverses sign, so that among metros of similar size the ones that accumulate more
                have better conditions, not worse. The gap is a sound description of an individual
                metro. It is not evidence of a general rule, and we would rather say so here than
                let the number imply one.
              </>
            )}
          </p>
          <p>
            <strong>How every dimension is averaged.</strong> All three are population-weighted
            across the whole metro: each square kilometre inside the boundary contributes in
            proportion to the people living in it, so a figure describes what a typical resident
            experiences rather than what the geographic centre point happens to record. That
            distinction is not cosmetic. A metro&apos;s centre point sits on its traffic core
            more or less by construction, and before this change the value recorded for most
            large metros fell in the worst tenth of anything their own residents breathe.
            Population comes from GHS-POP, the European Commission&apos;s gridded population
            surface.
          </p>
          <p>
            <strong>Limits worth knowing.</strong> The concentration grids resolve to about
            eleven kilometres, so weighting redistributes within that grid rather than seeing
            below it. PM2.5 is total particulate mass and includes desert dust, which counts
            against arid metros for their geology rather than their governance. The water and
            sanitation figures are survey-derived and resolve to province level, so they are
            coarser than the two satellite measures and produce more ties. A small number of
            remote island metros have no water data and are not ranked. Figures are shown
            rounded; the stored values carry the source grid&apos;s precision, which is not the
            same as measurement accuracy.
          </p>
        </div>
      </section>
    </main>
  );
}
