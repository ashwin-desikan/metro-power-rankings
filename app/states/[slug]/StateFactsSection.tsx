import type { ReactNode } from "react";
import Link from "next/link";
import type { StateFacts } from "@/lib/stateFacts";
import { fmtElevation } from "@/lib/shared";

// "At a glance" civic infobox on state/province pages. Server component;
// renders nothing when there are no facts. Mirrors the country-page
// CountryFactsSection, using a native <details> so no client JS is needed.

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export default function StateFactsSection({
  facts,
  pop,
  rank,
  areaRank,
  flagship,
  countryName,
}: {
  facts: StateFacts | null;
  pop: number | null;
  rank: { rank: number; total: number } | null;
  areaRank: { rank: number; total: number } | null;
  flagship: { name: string; slug: string } | null;
  countryName: string;
}) {
  const rows: { label: string; value: ReactNode }[] = [];
  const push = (label: string, value: ReactNode) => {
    if (value != null && value !== "") rows.push({ label, value });
  };

  const density =
    pop && facts?.areaKm2 && facts.areaKm2 > 0 ? pop / facts.areaKm2 : null;

  if (facts?.nickname) push("Nickname", facts.nickname);
  if (facts?.endonym && facts.endonym !== facts?.name)
    push("Endonym", facts.endonym);
  if (facts?.founded != null)
    push(
      "Established",
      facts.founded < 0 ? `${-facts.founded} BC` : String(facts.founded),
    );
  if (facts?.demonym) push("Demonym", facts.demonym);
  if (facts?.areaKm2 != null)
    push("Area", `${Math.round(facts.areaKm2).toLocaleString()} km²`);
  if (density != null)
    push("Population density", `${Math.round(density).toLocaleString()} /km²`);
  if (facts?.highestPoint)
    push(
      "Highest point",
      `${facts.highestPoint}${facts.highestPointM ? ` (${fmtElevation(facts.highestPointM)})` : ""}`,
    );
  if (facts?.legislature) push("Legislature", facts.legislature);
  if (facts?.hdi != null)
    push(
      "Human Development Index",
      `${facts.hdi.toFixed(3)}${facts.hdiYear ? ` (${facts.hdiYear})` : ""}`,
    );
  if (facts?.gdpUsd != null)
    push(
      "GDP",
      `$${(facts.gdpUsd / 1e9).toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })} bn${facts.gdpYear ? ` (${facts.gdpYear})` : ""}`,
    );
  const rep = facts?.representation;
  if (rep?.electoralVotes != null) push("Electoral votes", rep.electoralVotes);
  if (rep?.lowerSeats != null)
    push(rep.lowerHouse || "Lower-house seats", rep.lowerSeats);
  if (rep?.upperSeats != null)
    push(rep.upperHouse || "Upper-house seats", rep.upperSeats);
  if (rank)
    push(
      `Rank in ${countryName}`,
      `${ordinal(rank.rank)} of ${rank.total} by composite score`,
    );
  if (areaRank)
    push("Area rank", `${ordinal(areaRank.rank)} of ${areaRank.total} by area`);
  if (flagship)
    push(
      "Largest tracked metro",
      <Link
        href={`/rankings/${flagship.slug}`}
        className="hover:text-[var(--accent)]"
      >
        {flagship.name}
      </Link>,
    );

  if (rows.length === 0) return null;

  return (
    <details
      className="mb-8 border rounded-lg"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      open
    >
      <summary className="cursor-pointer select-none px-4 py-3 font-bold">
        At a glance
      </summary>
      <div className="px-4 pb-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-2"
            >
              <dt className="text-sm text-[var(--text-muted)] shrink-0">
                {r.label}
              </dt>
              <dd className="text-sm text-[var(--text)] text-right">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-[var(--text-dim)] mt-3">
          Civic facts via{" "}
          <a
            href="https://www.wikidata.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--accent)]"
          >
            Wikidata
          </a>
          .
        </p>
      </div>
    </details>
  );
}
