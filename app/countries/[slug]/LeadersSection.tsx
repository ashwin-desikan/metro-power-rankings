// app/countries/[slug]/LeadersSection.tsx
// Renders an era-grouped table of heads of state/government for a country.
// Era grouping is shown only when the data has non-null era fields (Russia,
// China, Germany).

import Link from "next/link";
import { getLeaders, leaderYear, type Leader } from "@/lib/leaders";
import Collapsible from "./Collapsible";
import { withIcon } from "./sectionIcons";

type Props = { countrySlug: string };

function formatYear(d: string | null): string {
  const y = leaderYear(d);
  return y !== null ? String(y) : "—";
}

function PartyBadge({ party }: { party: string | null }) {
  if (!party) return null;
  // Strip trailing "; ..." notes so the badge stays compact
  const label = party.split(";")[0].trim();
  return (
    <span className="text-xs text-gray-500 dark:text-gray-400 italic">
      {label}
    </span>
  );
}

function LeaderRow({ l, showMetros }: { l: Leader; showMetros: boolean }) {
  const startY = formatYear(l.start);
  const endY = l.current ? "Present" : formatYear(l.end);
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
      <td className="py-2 pr-4 font-medium text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
        {l.name}
        {l.current && (
          <span className="ml-2 text-xs font-semibold text-green-600 dark:text-green-400">
            ✦ Current
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-sm text-gray-600 dark:text-gray-300">{l.role}</td>
      <td className="py-2 pr-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap tabular-nums">
        {startY}–{endY}
      </td>
      <td className="py-2 pr-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap hidden sm:table-cell">
        {l.tenure ?? "—"}
      </td>
      <td className="py-2 text-sm hidden md:table-cell">
        <PartyBadge party={l.party} />
      </td>
      {showMetros && (
        <td className="py-2 pl-4 text-sm hidden lg:table-cell">
          <MetroLinks metros={l.metros} />
        </td>
      )}
    </tr>
  );
}

function EraGroup({ era, leaders, showMetros }: { era: string; leaders: Leader[]; showMetros: boolean }) {
  return (
    <div className="mb-6">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
        {era}
      </h4>
      <LeaderTable leaders={leaders} showMetros={showMetros} />
    </div>
  );
}

function MetroLinks({ metros }: { metros: Leader["metros"] }) {
  if (!metros?.length) return null;
  return (
    <span className="flex flex-wrap gap-0">
      {metros.map((m, i) => (
        <span key={m.slug} className="whitespace-nowrap">
          <Link
            href={`/rankings/${m.slug}`}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            {m.name}
          </Link>
          {i < metros.length - 1 && (
            <span className="text-xs text-gray-400 mr-1">,</span>
          )}
        </span>
      ))}
    </span>
  );
}

function LeaderCard({ l, showMetros }: { l: Leader; showMetros: boolean }) {
  const startY = formatYear(l.start);
  const endY = l.current ? "Present" : formatYear(l.end);
  return (
    <div className="rounded-lg border p-3 border-gray-100 dark:border-gray-800" style={{ backgroundColor: "var(--bg-card)" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
          {l.name}
          {l.current && (
            <span className="ml-2 text-xs font-semibold text-green-600 dark:text-green-400">
              ✦ Current
            </span>
          )}
        </p>
        <span className="flex-shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {startY}–{endY}
        </span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{l.role}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {l.tenure && <span className="text-gray-500 dark:text-gray-400">Tenure: {l.tenure}</span>}
        <PartyBadge party={l.party} />
      </div>
      {showMetros && l.metros?.length ? (
        <div className="mt-1.5 text-xs">
          <span className="text-gray-500 dark:text-gray-400">Home metro: </span>
          <MetroLinks metros={l.metros} />
        </div>
      ) : null}
    </div>
  );
}

function LeaderTable({ leaders, showMetros }: { leaders: Leader[]; showMetros: boolean }) {
  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {leaders.map((l, i) => (
          <LeaderCard key={`${l.name}-${l.start ?? i}-card`} l={l} showMetros={showMetros} />
        ))}
      </div>
      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 pr-4">Name</th>
              <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 pr-4">Role</th>
              <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 pr-4">Years</th>
              <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 pr-4 hidden sm:table-cell">Tenure</th>
              <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hidden md:table-cell">Party</th>
              {showMetros && (
                <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hidden lg:table-cell pl-4">Home Metro</th>
              )}
            </tr>
          </thead>
          <tbody>
            {leaders.map((l, i) => (
              <LeaderRow key={`${l.name}-${l.start ?? i}`} l={l} showMetros={showMetros} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function LeadersSection({ countrySlug }: Props) {
  const leadersAsc = getLeaders(countrySlug);
  if (leadersAsc.length === 0) return null;

  // Most recent first
  const leaders = [...leadersAsc].reverse();

  const hasEras = leaders.some((l) => l.era !== null);
  const showMetros = leaders.some((l) => l.metros?.length);

  const inner = hasEras ? (() => {
    const eraOrder: string[] = [];
    const eraMap: Record<string, Leader[]> = {};
    for (const l of leaders) {
      const era = l.era ?? "Other";
      if (!eraMap[era]) { eraMap[era] = []; eraOrder.push(era); }
      eraMap[era].push(l);
    }
    return eraOrder.map((era) => (
      <EraGroup key={era} era={era} leaders={eraMap[era]} showMetros={showMetros} />
    ));
  })() : <LeaderTable leaders={leaders} showMetros={showMetros} />;

  return (
    <Collapsible
      id="leaders"
      title={withIcon("leaders", "Leadership History")}
      defaultOpen={false}
      right={
        <span className="text-xs text-[var(--text-dim)]">
          {leaders.length} leaders · click to expand
        </span>
      }
    >
      {/* The ⚠️ and 👑 glyphs are prefixed into the leader's name in the source
          data (public/data/leaders/*.json), so nothing in the UI can derive
          their meaning. Without this legend a reader sees an unexplained
          warning symbol beside a named person. Criteria per BACKLOG.md. */}
      <p className="text-xs text-[var(--text-muted)] mb-4 max-w-3xl">
        <span aria-hidden>⚠️</span> marks a leader associated with atrocities or
        defiance of law, systemic subversion of democratic institutions, or a
        criminal conviction. Convictions arising from political persecution, and
        annulled convictions, are excluded. <span aria-hidden>👑</span> denotes a
        monarch. These are editorial designations, applied per entry rather than
        derived automatically.
      </p>
      {inner}
    </Collapsible>
  );
}
