import type { Metadata } from "next";
import Link from "next/link";
import HonourRolls from "@/app/teams/_shared/HonourRolls";
import { getHonourPortal } from "@/lib/honourRolls";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/basketball/domestic";
const TITLE = "Domestic Basketball";
const DESC = "Club basketball outside the NBA and EuroLeague: champions and runners-up from ten national and regional leagues, from the Liga ACB and Serie A to the Adriatic League, back to the 1920s.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

// One section per country, each running unbroken from its earliest recorded
// champion to the current one, with a labelled rule where the competition
// itself changed. China first, then Spain and Italy, then by weight in
// European club basketball: continental titles won, and who is contesting
// them now.
const ORDER = [
  "cba", "acb", "lba", "greek", "bsl", "aba", "vtb", "israel", "lnb", "lkl",
];

export default function DomesticBasketballPage() {
  const portal = getHonourPortal("basketball-domestic");
  if (!portal) return null;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/basketball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to International Basketball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/basketball" className="hover:underline">Basketball</Link>{" / "}
        <span>Domestic</span>
      </nav>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Domestic Basketball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Club basketball beyond the NBA and the EuroLeague. Ten leagues, each
          running unbroken from its first recorded champion to the current one,
          with the losing finalist wherever the record keeps one.
        </p>
      </header>
      <p className="text-xs text-[var(--text-dim)] max-w-3xl mb-8">
        A labelled rule marks where the competition itself changed, so Spain
        continues into the Liga Española before the ACB existed, and the ABA
        League sits above the Yugoslav First League that preceded it. Clubs are
        named as they are on the{" "}
        <Link href="/teams/basketball/euroleague" className="hover:text-[var(--accent)] hover:underline">EuroLeague hub</Link>,
        which is what keeps a title count whole: Mobilgirgi Varese, Simac Milano
        and AX Armani Exchange Milano are two clubs, not three. Seasons with no
        champion, from war or the pandemic, are omitted rather than shown blank.
      </p>
      <HonourRolls portal={portal} order={ORDER} />
    </main>
  );
}
