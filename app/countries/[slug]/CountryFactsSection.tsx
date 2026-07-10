import type { ReactNode } from "react";
import Collapsible from "./Collapsible";
import type { CountryFacts } from "@/lib/countries";
import { fmtElevation } from "@/lib/shared";

// "At a glance" infobox on country hub pages: the Wikidata-sourced facts that
// aren't already in the header / Economy section. Server component; renders
// nothing when the country has no facts. Long lists (Taiwan's 22 languages,
// the US's 15 time zones) are capped with a "+N more".

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function CappedList({ items, max }: { items: string[]; max: number }) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return (
    <>
      {shown.join(", ")}
      {extra > 0 ? (
        <span className="text-[var(--text-dim)]" title={items.join(", ")}>
          {" "}+{extra} more
        </span>
      ) : null}
    </>
  );
}

export default function CountryFactsSection({ facts }: { facts: CountryFacts | null }) {
  if (!facts) return null;

  const rows: { label: string; value: ReactNode }[] = [];
  const push = (label: string, value: ReactNode) => rows.push({ label, value });

  if (facts.officialLanguages?.length)
    push(
      facts.officialLanguages.length > 1 ? "Official languages" : "Official language",
      <CappedList items={facts.officialLanguages} max={5} />,
    );
  if (facts.currencyName) {
    const tag = facts.currencySymbol || facts.currencyIso;
    push("Currency", `${cap(facts.currencyName)}${tag ? ` (${tag})` : ""}`);
  }
  if (facts.governmentForm) push("Government", cap(facts.governmentForm));
  if (facts.legislature) push("Legislature", facts.legislature);
  if (facts.demonym) push("Demonym", facts.demonym);
  if (facts.timezones?.length)
    push(
      facts.timezones.length > 1 ? "Time zones" : "Time zone",
      <CappedList items={facts.timezones} max={4} />,
    );
  if (facts.drivingSide) push("Driving side", cap(facts.drivingSide));
  if (facts.callingCode) push("Calling code", facts.callingCode);
  if (facts.tld?.length) push("Internet TLD", <CappedList items={facts.tld} max={4} />);
  if (facts.iso3166) push("ISO 3166", facts.iso3166.toUpperCase());
  if (facts.formationDate) push("Established", facts.formationDate);
  if (facts.highestPointName)
    push(
      "Highest point",
      `${facts.highestPointName}${facts.highestPointM ? ` (${fmtElevation(facts.highestPointM)})` : ""}`,
    );
  if (facts.anthem) push("National anthem", <em>{facts.anthem}</em>);
  // Motto intentionally not rendered: Wikidata P1451 is polluted with tourism
  // slogans ("Beats to your rhythm" for Argentina, etc.). Data is kept in the
  // column for a future curated source; do not surface until it's trustworthy.

  if (rows.length === 0) return null;

  return (
    <Collapsible id="at-a-glance" title="At a glance">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-2"
          >
            <dt className="text-sm text-[var(--text-muted)] shrink-0">{r.label}</dt>
            <dd className="text-sm text-[var(--text)] text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-[var(--text-dim)] mt-3">
        Facts via{" "}
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
    </Collapsible>
  );
}
