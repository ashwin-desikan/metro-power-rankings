// app/countries/[slug]/OrgsSection.tsx
// Renders international organisation membership badges for a country,
// grouped by Security / Political & Economic / Regional / Energy.
// Gold pill = full Member; styled variants for Candidate, Observer, etc.

import Link from "next/link";
import Collapsible from "./Collapsible";
import {
  getOrgsForCountry,
  ORG_DEFS,
  ORG_GROUPS,
  ORG_MAP,
  STATUS_STYLES,
  type OrgGroup,
  type OrgStatus,
} from "@/lib/orgs";

type Props = { countrySlug: string };

function OrgBadge({
  orgKey,
  status,
}: {
  orgKey: string;
  status: OrgStatus;
}) {
  const def = ORG_MAP[orgKey];
  if (!def) return null;
  const style = STATUS_STYLES[status];
  const isMember = status === "Member";

  return (
    <a
      href={def.href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${def.label} — ${style.label}`}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
        transition-opacity hover:opacity-80 no-underline
        ${style.badge}
      `}
    >
      {isMember && (
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`}
          aria-hidden
        />
      )}
      {def.abbr}
      {!isMember && (
        <span className="opacity-60 text-[10px] not-italic">
          {style.label}
        </span>
      )}
    </a>
  );
}

export default function OrgsSection({ countrySlug }: Props) {
  const memberships = getOrgsForCountry(countrySlug);
  if (Object.keys(memberships).length === 0) return null;

  // Group orgs by category, only showing orgs this country belongs to
  const groups: { group: OrgGroup; badges: { key: string; status: OrgStatus }[] }[] = [];

  for (const group of ORG_GROUPS) {
    const orgsInGroup = ORG_DEFS.filter((o) => o.group === group);
    const badges = orgsInGroup
      .filter((o) => memberships[o.key])
      .map((o) => ({ key: o.key, status: memberships[o.key] as OrgStatus }));
    if (badges.length > 0) {
      groups.push({ group, badges });
    }
  }

  if (groups.length === 0) return null;

  const memberCount = Object.values(memberships).filter((s) => s === "Member").length;

  return (
    <Collapsible
      id="orgs"
      title={
        <Link href="/orgs" className="hover:text-[var(--accent)] hover:underline">
          Alliances &amp; Organisations
        </Link>
      }
      right={
        <span className="text-sm text-[var(--text-muted)]">
          {memberCount} full {memberCount === 1 ? "membership" : "memberships"}
        </span>
      }
    >
      <div className="space-y-4">
        {groups.map(({ group, badges }) => (
          <div key={group}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-2">
              {group}
            </p>
            <div className="flex flex-wrap gap-2">
              {badges.map(({ key, status }) => (
                <OrgBadge key={key} orgKey={key} status={status} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-4">
        <span className="inline-flex items-center gap-1 mr-3">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          Full member
        </span>
        <span className="mr-3 opacity-70">Dashed border = Candidate / Applicant</span>
        <span className="opacity-70">Italic = Dialogue / Observer</span>
      </p>
    </Collapsible>
  );
}
