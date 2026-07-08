import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getLionsHistory } from "@/lib/lions";
import { getBarbariansHistory } from "@/lib/barbarians";
import LionsHistory from "@/app/teams/rugby-union/LionsHistory";
import BarbariansHistory from "@/app/teams/rugby-union/BarbariansHistory";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/rugby-union/invitational";
const TITLE = "Rugby's Invitational Teams";
const DESC =
  "The British & Irish Lions and the Barbarians: representative and invitational sides that take on the Test nations without being nations themselves.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default function InvitationalTeamsPage() {
  const lions = getLionsHistory();
  const barbarians = getBarbariansHistory();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <Link href="/teams/rugby-union" className="hover:underline">Rugby Union</Link>{" / "}
        <span>Invitational Teams</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Invitational Teams</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Two of rugby&apos;s great outliers: the British &amp; Irish Lions, a select composite of England,
          Scotland, Wales and Ireland that tours the southern hemisphere every four years, and the
          Barbarians, an invitational club of guest players with no home. Neither is a nation or sits in
          the rankings, yet both take on the Test sides, so they live here rather than in the national table.
        </p>
      </header>

      <HubNav
        items={[
          { label: "British & Irish Lions", href: "#lions" },
          { label: "Barbarians", href: "#barbarians" },
        ]}
      />

      {lions ? <LionsHistory data={lions} /> : null}
      {barbarians ? <BarbariansHistory data={barbarians} /> : null}

      <p className="text-xs text-[var(--text-muted)] mt-8">
        <Link href="/teams/rugby-union" className="hover:text-[var(--accent)] hover:underline">← Back to Rugby Union</Link>
      </p>
    </main>
  );
}
