import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import {
  ORG_DEFS,
  ORG_GROUPS,
  ORG_MAP,
  STATUS_STYLES,
  getOrgMembers,
  type OrgGroup,
  type OrgStatus,
} from "@/lib/orgs";
import { getCountry } from "@/lib/countries";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PATH = "/orgs";
const TITLE = "Alliances & Organisations";
const DESC =
  "A global reference map of 18 international organisations — from security alliances to regional blocs to energy cartels — showing every country's membership status across NATO, the EU, BRICS+, the UN, ASEAN, the African Union, OPEC, and more.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
};

// Brief editorial description for each org
const ORG_DESC: Record<string, string> = {
  "UN":           "The principal intergovernmental forum for international law, security, and development. 193 member states.",
  "NATO":         "The Western collective-defence treaty. An attack on one member is an attack on all.",
  "EU":           "Political and economic union of 27 European states with a single market, common currency (eurozone), and shared institutions.",
  "G7":           "Informal forum of the seven largest advanced economies, meeting annually to coordinate policy.",
  "G20":          "Broader forum of 19 nations plus the EU and African Union, covering roughly 85% of global GDP.",
  "OECD":         "The 'rich country' development club — 38 members committed to market democracy and open trade.",
  "BRICS+":       "Emerging-economy bloc anchored by Brazil, Russia, India, China, and South Africa, expanded in 2024 to 11 full members.",
  "SCO":          "Eurasian security and economic body led by China and Russia, focused on regional stability.",
  "ASEAN":        "Ten-nation Southeast Asian bloc covering trade, diplomacy, and regional integration.",
  "African Union":"Continental body of 55 African states coordinating political, economic, and security affairs.",
  "Arab League":  "League of 22 Arab-speaking states promoting solidarity across the Arab world.",
  "OAS":          "Hemispheric forum of 35 American states covering democracy, human rights, and security.",
  "Commonwealth": "52-member association of mostly former British territories with shared institutions and values.",
  "GCC":          "Six Gulf monarchies coordinating economic, security, and social policy.",
  "APEC":         "21-economy Pacific Rim forum focused on trade liberalisation and investment.",
  "OPEC":         "12-member oil cartel that coordinates production to influence global crude prices.",
  "OPEC+":        "OPEC plus 10 allied producers including Russia, Kazakhstan, and Malaysia.",
  "CSTO":         "Russia-led collective-security pact covering six post-Soviet states.",
};

const GROUP_DESC: Record<OrgGroup, string> = {
  "Security":              "Mutual-defence treaties and security alliances",
  "Political & Economic":  "Global governance forums and economic clubs",
  "Regional":              "Continental and sub-regional bodies",
  "Energy":                "Oil production coordination and energy cartels",
};

function CountryPill({ slug, status }: { slug: string; status: OrgStatus }) {
  const country = getCountry(slug);
  const style = STATUS_STYLES[status];
  const isMember = status === "Member";
  const label = country?.name ?? slug;

  return (
    <Link
      href={`/countries/${slug}`}
      title={`${label} — ${style.label}`}
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs no-underline
        transition-opacity hover:opacity-70
        ${isMember
          ? "bg-amber-400/15 border border-amber-500/50 text-amber-800 dark:text-amber-300 font-medium"
          : "border border-gray-300/60 text-gray-500 dark:text-gray-400"
        }
      `}
    >
      {isMember && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" aria-hidden />
      )}
      {label}
      {!isMember && (
        <span className="opacity-50 text-[10px]">{style.label}</span>
      )}
    </Link>
  );
}

function OrgCard({ orgKey }: { orgKey: string }) {
  const def = ORG_MAP[orgKey];
  if (!def) return null;
  const members = getOrgMembers(orgKey);
  const fullMembers = members.filter((m) => m.status === "Member");
  const others = members.filter((m) => m.status !== "Member");
  const desc = ORG_DESC[orgKey];

  return (
    <div
      id={orgKey.toLowerCase().replace(/[^a-z0-9]/g, "-")}
      className="rounded-xl border p-5 scroll-mt-20"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-[var(--text)]">{def.abbr}</span>
            <a
              href={def.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline"
            >
              {def.label} ↗
            </a>
          </div>
          {desc && <p className="text-sm text-[var(--text-muted)]">{desc}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {fullMembers.length}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
            {fullMembers.length === 1 ? "member" : "members"}
          </div>
        </div>
      </div>

      {/* Member pills */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {fullMembers.map((m) => (
          <CountryPill key={m.slug} slug={m.slug} status={m.status} />
        ))}
      </div>

      {/* Non-member statuses */}
      {others.length > 0 && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">
            Other statuses
          </p>
          <div className="flex flex-wrap gap-1.5">
            {others.map((m) => (
              <CountryPill key={m.slug} slug={m.slug} status={m.status} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgsHubPage() {
  // Build HubNav items — one per group
  const navItems = ORG_GROUPS.map((g) => ({
    label: g,
    href: `#${g.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      {/* Hero */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-2xl">{DESC}</p>
      </header>

      <HubNav items={navItems} />

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-8 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          Full member
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-dashed border-blue-400" />
          Candidate / Applicant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border border-gray-400" />
          Observer / Partner / Dialogue
        </span>
      </div>

      {/* Org groups */}
      <div className="space-y-12">
        {ORG_GROUPS.map((group) => {
          const orgsInGroup = ORG_DEFS.filter((o) => o.group === group);
          return (
            <section
              key={group}
              id={group.toLowerCase().replace(/[^a-z0-9]/g, "-")}
              className="scroll-mt-20"
            >
              <div className="mb-4">
                <h2 className="text-xl font-bold text-[var(--text)]">{group}</h2>
                <p className="text-sm text-[var(--text-muted)]">{GROUP_DESC[group]}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {orgsInGroup.map((o) => (
                  <OrgCard key={o.key} orgKey={o.key} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Footer note */}
      <footer className="mt-12 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Membership data reflects publicly available records as of mid-2025. Some statuses (BRICS+, CSTO) are subject to ongoing political change.
      </footer>
    </main>
  );
}
