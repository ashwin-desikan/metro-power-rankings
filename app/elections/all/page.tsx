import type { Metadata } from "next";
import { ELECTION_HUBS, HUB_REGION, GOVERNMENT_TYPE_LABELS, nextElections } from "@/lib/electionHubsMeta";
import { getElectionCensus } from "@/lib/electionCensus";
import { getElectionSystems } from "@/lib/electionSystems";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { ElectionsCrumbs, ElectionsHeader, SourcesCard } from "../_shared/ui";
import ElectionsNav from "../_shared/ElectionsNav";
import HubIndex, { type HubRow, type Regime, type Horizon } from "../HubIndex";

const PATH = "/elections/all";
const TITLE = "Every Election Hub";
const DESC =
  "The full A-Z of the election atlas: every polity covered, its system of government, electoral family, when it last voted and when it votes next. Searchable, filterable, sortable.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
};

function horizonOf(nextDate: string | null, confidence: string): Horizon {
  if (confidence === "dissolved") return "dissolved";
  if (!nextDate) return "none";
  const year = Number(nextDate.slice(0, 4));
  if (year === 2026) return "2026";
  if (year === 2027) return "2027";
  return "later";
}

export default function AllHubsPage() {
  // Contest counts come from the census, which deliberately excludes the
  // Vatican: a conclave is not a polity-wide ballot. It still belongs in an
  // index of hubs, so it simply shows no count.
  const counts = new Map(getElectionCensus().map((r) => [r.code, r.items.length]));
  const systems = getElectionSystems();
  const familyOf = new Map(systems.hubs.map((h) => [h.code, { key: h.family, label: h.familyLabel }]));

  const rows: HubRow[] = nextElections().map((r) => {
    const hub = ELECTION_HUBS[r.code];
    const family = familyOf.get(r.code);
    const managed = !!hub.note && hub.noteTone !== "neutral";
    const regime: Regime = managed ? "managed" : "competitive";
    return {
      code: r.code,
      name: r.name,
      href: r.href,
      flagSrc: flagUrlByCode(r.flag),
      flagSrcSet: flagSrcSetByCode(r.flag),
      region: HUB_REGION[r.code] ?? "",
      last: hub.last,
      next: r.next,
      nextDate: r.date,
      confidence: r.confidence,
      daysAway: r.daysAway,
      overdue: r.overdue,
      contests: counts.get(r.code) ?? 0,
      note: hub.note ?? null,
      noteTone: hub.noteTone ?? null,
      compact: hub.tier === "compact",
      governmentType: hub.governmentType,
      governmentLabel: hub.governmentLabel ?? GOVERNMENT_TYPE_LABELS[hub.governmentType],
      familyKey: family?.key ?? "none",
      familyLabel: family?.label ?? "Not scored",
      regime,
      horizon: horizonOf(r.date, r.confidence),
    };
  });

  const total = rows.reduce((s, r) => s + r.contests, 0);
  const confirmed = rows.filter((r) => r.confidence === "confirmed").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ElectionsCrumbs tab="All hubs" />
      <ElectionsHeader
        emoji="🗳️"
        title={TITLE}
        sub={DESC}
        stamp={`As of ${systems.built} · ${rows.length} hubs · ${total.toLocaleString("en-US")} contests on file · ${confirmed} with an officially set next date · Source: election-systems.json + per-hub election records`}
      />
      <ElectionsNav />

      <HubIndex rows={rows} families={systems.families} />

      <SourcesCard>
        <p>
          The landing page groups these four ways round a map and a two-century timeline; this page is
          the flat, filterable list, for when you know which country you want or which kind of system
          you are looking for.
        </p>
        <p>
          Next-election dates come from a single table, <code>lib/electionHubsMeta.ts</code>, which also
          feeds the forecast pipeline, so a date shown here is the date the models use. Electoral family
          and system-of-government labels come from <code>public/data/election-systems.json</code>,
          built by <code>scripts/elections/build_systems.py</code> from the same per-hub election
          records. A hub without a scored electoral family (too few legislative contests with recorded
          vote shares) shows as &ldquo;Not scored&rdquo; rather than a guess.
        </p>
      </SourcesCard>
    </main>
  );
}
