import type { Metadata } from "next";
import Link from "next/link";
import { getCnElections, computeCnRecords, cnPartyColor, cnFmtInt, cnFmtPct } from "@/lib/cnElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/cn";
const TITLE = "Chinese National Congresses";
const DESC =
  "The People's Republic of China holds no competitive national elections. This hub records what exists instead: the fifteen national congresses since 1949 — how the National People's Congress is assembled, whom it seats, and what its choreography of unanimity reveals.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function CnElectionsPage() {
  const { eras, elections, meta } = getCnElections();
  const records = computeCnRecords();
  const last = elections[elections.length - 1];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>China</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="cn" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div
        className="rounded-xl border p-4 mb-8 max-w-3xl text-sm"
        style={{ borderColor: "#B4540A", backgroundColor: "rgba(217,119,6,0.06)" }}
      >
        <p className="text-[var(--text-muted)]">
          <span className="font-bold" style={{ color: "#D97706" }}>How to read this hub.</span>{" "}
          No Chinese citizen has ever voted directly for a national leader or legislature. NPC
          delegates are chosen through tiers of party-managed indirect selection; the eight licensed
          minor parties all formally accept Communist Party leadership, and no opposition is
          permitted at any stage. These pages record the composition and choreography of each
          congress because the institution matters — it is the constitutional face of the world&apos;s
          largest one-party state — not because its members were elected in any competitive sense.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="National congresses" value={String(elections.length)} hint="the 1949 CPPCC and fourteen NPCs" />
        <StatTile label="Current congress" value={last.label} hint={`convened ${last.year} · ${cnFmtInt(last.totalSeats)} delegates`} />
        <StatTile label="Direct national elections" value="0" hint="in the PRC's entire history" />
        <StatTile label="Licensed minor parties" value="8" hint="all accept CCP leadership by charter" />
      </div>

      <JumpNav items={[["#chronology", "The congresses"], ["#records", "The numbers to know"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={cnPartyColor}
        fmtPct={cnFmtPct}
        leaderTag="Chairman"
        headline="The congresses"
        intro="Every national congress, newest first — each one an indirect, party-controlled selection, labelled as such. Click any congress for its composition and its story."
      />

      <RecordsGrid records={records} hrefBase={PATH} headline="The numbers to know" />

      <HowItWorks
        title="How the National People's Congress is assembled"
        cards={[
          ["Tiers, not ballots", "Citizens vote directly only for the lowest local congresses. Each tier then elects the one above it, four steps removed from any voter by the time the NPC is reached — with party committees vetting candidacies at every level."],
          ["The united front", "Eight minor parties hold seats by allocation, not competition. They are heirs of the 1949 coalition, preserved as the 'united front' — their charters accept Communist Party leadership, and their delegates are selected through the same managed process."],
          ["What the NPC actually does", "It convenes each March for about a week, approves the budget and the work reports, and confirms leadership choices already made by the party. Dissenting votes are rare enough to be news: two delegates opposed ending presidential term limits in 2018."],
          ["Why record it here", "Because the absence is the story. Set beside the contested elections elsewhere on this site, the unanimity of a 2,977-member chamber documents how the world's second-largest economy is actually governed."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/china", "China"],
          ["/elections/tw", "Taiwanese Presidential Elections"],
          ["/elections/ru", "Russian & Soviet Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
