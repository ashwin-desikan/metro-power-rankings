import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PAGE_PATH = "/sports/about";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Zone Zero";
const PAGE_DESCRIPTION =
  "What Zone Zero is: the sports identity of Citizen of Nowhere, built on network centrality instead of inherited geography. The thesis, the philosophy, the principles, and the seal.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
  },
  twitter: { card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

const PRINCIPLES: [string, string][] = [
  ["Centrality over inheritance", "Status is a position in the network, not a flag planted long ago. Lead with where value actually concentrates, not with how old a name is."],
  ["The core is a destination, not a verdict", "The urban core is the orientation; the periphery and the suburb are the foundation, never a judgment on where anyone is from."],
  ["Clarity over accumulation", "We value the removal of distortion over the pile of data. The rankings engine is a lens, not a scoreboard."],
  ["Trajectory over trophy", "Excellence is motion toward an ideal you can approach but never finitely hold. State a direction of travel; never claim to embody it."],
  ["Belong to the network, and to yourself", "The civic and the personal halves of the same freedom: belong to the network rather than the nation, and to yourself rather than the cage."],
  ["Bodily and temporal sovereignty", "You are not free if you do not own the time, space, and pace of your own life. The externally imposed schedule, the time box, is the quiet enemy of clarity."],
  ["Evidence over assertion", "Ground every claim in published data. Show the map rather than assert the conclusion."],
];

const READING: { href: string; label: string; note: string }[] = [
  { href: "https://citizenofnowhere.substack.com/p/the-team-that-wins-the-city", label: "The Team That Wins the City", note: "Where the sports thread starts." },
  { href: "https://citizenofnowhere.substack.com/p/the-last-of-the-marylebones", label: "The Last of the Marylebones", note: "The dense cores that still clear the bar." },
  { href: "https://citizenofnowhere.substack.com/p/one-week-two-cities-no-contest", label: "One Week, Two Cities, No Contest", note: "London and New York, the same week." },
  { href: "https://citizenofnowhere.substack.com", label: "Citizen of Nowhere on Substack", note: "The full archive and the latest writing." },
];

const LINKS: { href: string; label: string }[] = [
  { href: "/sports", label: "The Zone Zero Sports Hub" },
  { href: "/top-teams", label: "Who wins each city" },
  { href: "/neighborhoods", label: "The neighborhoods foundation" },
  { href: "/rankings/london", label: "London, ranked" },
  { href: "/rankings/new-york", label: "New York, ranked" },
];

export default function ZoneZeroAboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      <header className="mb-12">
        <div className="flex items-center gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/zone-zero-seal.svg" alt="Zone Zero" width={48} height={48} loading="lazy" decoding="async" />
          <div className="text-xs uppercase tracking-widest text-[var(--text-dim)]">Citizen of Nowhere&rsquo;s</div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Zone Zero</h1>
        <p className="text-[var(--text-muted)] text-base">
          The sports identity of Citizen of Nowhere. A club that belongs to the network, not the nation.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">The idea</h2>
        <p className="text-[var(--text-muted)] mb-3">
          Most sports clubs derive their identity from fixed ground: a parish, a postcode, a piece of Victorian
          real estate. Identity flows from the dirt. Even the most storied institutions in a sport often carry the
          name of a place they have long since left, because in sport the name and the history are the asset and the
          ground beneath is incidental. Zone Zero severs that. We are built on network centrality instead of inherited
          geography.
        </p>
        <p className="text-[var(--text-muted)]">
          We belong to the dense core of the global network, where value concentrates, rather than to any single
          historical postcode. Belonging is not owed to inherited dirt. It is owed to the network you actually live in.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">The name is an argument</h2>
        <p className="text-[var(--text-muted)]">
          London&rsquo;s transit zones radiate outward from Zone 1, and status conventionally falls as the number
          climbs. Zone Zero sits beneath Zone 1: not the periphery, but the origin point, the spot every other zone is
          measured from. It reframes centrality as a position in a coordinate system rather than a neighborhood. We do
          not look outward from a neighborhood. We look down from the center.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">The dual core</h2>
        <p className="text-[var(--text-muted)] mb-3">
          We do not own a stadium. We anchor to two nodes: W1U in London and 10023 in Manhattan, two ends of the most
          culturally potent corridor on earth. Each is wired to the live rankings, so the claim of centrality is
          provable rather than asserted.
        </p>
        <p className="text-[var(--text-muted)]">
          See them ranked:{" "}
          <Link href="/rankings/london" className="text-[var(--accent)] hover:underline">London</Link>
          {" and "}
          <Link href="/rankings/new-york" className="text-[var(--accent)] hover:underline">New York</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">A word on the suburbs</h2>
        <p className="text-[var(--text-muted)]">
          We are not against the suburb. For most of us it is where the journey started, and it is the foundation,
          not the failure. The claim is narrower: the institutions that froze at the edge while still claiming the
          center are the ones we are coming for. The suburb is the starting line. The core is the destination.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">The philosophical foundation</h2>
        <p className="text-[var(--text-muted)] mb-4">
          Zone Zero is not free-floating attitude. It rests on two ideas, one about the world and one about the self.
        </p>
        <h3 className="text-base font-semibold mb-2">A map of force and integrity</h3>
        <p className="text-[var(--text-muted)] mb-4">
          Anything can be located on two axes: force, the capacity to execute and to move, and integrity, alignment
          with truth and clean data. The highest corner is an asymptote, an ideal you can approach but never finitely
          hold, which builds humility into any claim of excellence. The most powerful place to stand is the
          clear-eyed witness: data resolution, the ability to map the world honestly and let the map, not the noise,
          decide.
        </p>
        <h3 className="text-base font-semibold mb-2">Sovereign clarity</h3>
        <p className="text-[var(--text-muted)]">
          Clarity is the removal of distortion, not the accumulation of data, and it often begins in the body before
          it reaches the intellect. It has a precondition: you are not sovereign if you do not own the time, space,
          and pace of your own life. The externally imposed schedule, the time box, is the quiet enemy of clarity.
          Belong to yourself rather than the cage.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">The seal</h2>
        <p className="text-[var(--text-muted)]">
          Our mark is a seal: an unbroken-line trefoil knot at the center of a ring of twenty-four ticks. The trefoil
          is a single continuous line with no beginning and no end, the network as one connected system. The ring of
          twenty-four is a deliberate nod to the Ashoka Chakra, the wheel that radiates from a center. Together they
          read as both an origin point and an official seal.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">What we believe</h2>
        <ul className="space-y-4">
          {PRINCIPLES.map(([name, line]) => (
            <li key={name} className="text-[var(--text-muted)]">
              <span className="text-[var(--text)] font-medium">{name}.</span> {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">What Zone Zero is, and is not</h2>
        <p className="text-[var(--text-muted)]">
          Today Zone Zero is a stance and an identity: the voice and lens through which this sports coverage carries
          itself, grounded in the rankings rather than in nostalgia. It is not yet a registered club, and it is built
          to be forward compatible if it ever becomes one. We do not manage museums. We read the map.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Part of Citizen of Nowhere</h2>
        <p className="text-[var(--text-muted)]">
          Zone Zero is the sports expression of Citizen of Nowhere, the project that ranks the world&rsquo;s metros
          and neighborhoods. The parent supplies the data and the worldview; Zone Zero supplies the persona, the
          codes, and the mark. The thesis is the same at both scales: belong to the network, not the nation.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Read more</h2>
        <p className="text-[var(--text-muted)] mb-4">Zone Zero rests on a body of published work:</p>
        <ul className="space-y-3 mb-6">
          {READING.map((r) => (
            <li key={r.href} className="text-[var(--text-muted)]">
              <a href={r.href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                {r.label}
              </a>{" "}
              <span className="text-[var(--text-dim)]">&mdash; {r.note}</span>
            </li>
          ))}
        </ul>
        <p className="text-[var(--text-muted)] mb-3">And the live engine behind it:</p>
        <ul className="space-y-2">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-[var(--accent)] hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[var(--text-dim)] text-sm italic border-t pt-6" style={{ borderColor: "var(--border)" }}>
        Leave the suburbs to the old heads. The world is our outfield.
      </p>
    </main>
  );
}
