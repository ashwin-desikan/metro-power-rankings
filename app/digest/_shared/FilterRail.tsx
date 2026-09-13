import "server-only";
import Link from "next/link";
import {
  facetHref, facetsByGroup, FACET_GROUPS, GROUP_TITLE,
  type DigestFacets, type Facet, type FacetGroup,
} from "@/lib/digestFacets";

// The filter rail, after the left-hand menu on sportsindustryhub.com.
//
// Every entry is a LINK, not a toggle. Ashwin, 2026-09-13: "By default, you only show the
// stories from the current day, but if somebody chooses a filter, you show those stories"
// across the trailing window. That is a different view of a different set, so it gets its
// own URL: shareable, indexable, cacheable, and it works with JavaScript off. An earlier
// build filtered the current day's DOM in the browser; that was replaced rather than kept
// alongside, because two behaviours on one control is harder to learn than one.
//
// Counts are window counts, not today's, so the number on the link is the number of
// stories the link actually leads to.
//
// One tree, two densities (DESIGN-STANDARDS §2): a sticky rail beside the stories from lg
// up, the same links inside a <details> above them on a phone.

function FacetLink({
  facet, group, active, indent = false,
}: { facet: Facet; group: FacetGroup; active: boolean; indent?: boolean }) {
  return (
    <Link
      href={facetHref(group, facet.slug)}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-md py-1.5 text-xs transition-colors min-h-11 lg:min-h-0 hover:text-[var(--accent)] ${indent ? "pl-4 pr-2" : "px-2"}`}
      style={{
        color: active ? "var(--accent)" : "var(--text-muted)",
        backgroundColor: active ? "var(--bg-card)" : undefined,
      }}
    >
      <span className="min-w-0 truncate">{facet.label}</span>
      <span className="flex-shrink-0 tabular-nums text-[10px] text-[var(--text-dim)]">{facet.count}</span>
    </Link>
  );
}

/**
 * A sport and the competitions seen under it.
 *
 * Both levels are digest filters, not hub links. The hub is one tap further on, from the
 * filtered page's own header: a reader in the digest clicking "Premier League" wants the
 * Premier League stories, not to be thrown out of the digest onto the club hub.
 */
function SportGroupBlock({ facet, current }: { facet: Facet; current?: { group: FacetGroup; slug: string } }) {
  return (
    <div>
      <FacetLink
        facet={facet}
        group="sport"
        active={current?.group === "sport" && current.slug === facet.slug}
      />
      {(facet.children ?? []).map((c, i, all) => (
        <div key={c.slug}>
          {/* Ashwin, 2026-09-13: "In club football, please separate the European
              competitions from the domestic leagues ... continental competitions, because
              we want to include Copa Libertadores in this list as well." A heading only
              where a section actually changes, so every other sport stays a flat list. */}
          {c.section && c.section !== all[i - 1]?.section && (
            <div className="mt-1 pl-4 text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
              {c.section === "continental" ? "Continental" : "Domestic"}
            </div>
          )}
          <FacetLink
            facet={c}
            group="competition"
            indent
            active={current?.group === "competition" && current.slug === c.slug}
          />
        </div>
      ))}
    </div>
  );
}

function Groups({ facets, current }: { facets: DigestFacets; current?: { group: FacetGroup; slug: string } }) {
  return (
    <div className="space-y-1">
      {FACET_GROUPS.map((group) => {
        const items = facetsByGroup(facets, group);
        if (items.length === 0) return null;
        // Ashwin, 2026-09-13: "can we have the topics, themes, and sports all collapsible
        // as well, so that it's easier to navigate?" Plain <details>, so it needs no
        // JavaScript and survives with it off.
        //
        // Topics open, the long two rails shut: four topics fit in the space the 33
        // themes would take. Whichever group the reader is filtered into opens
        // regardless, so the current filter is never hidden behind a closed row. Sports
        // counts the competitions too, since the group rows are only the sports.
        const holdsCurrent =
          current?.group === group ||
          (group === "sport" && current?.group === "competition");
        const count = group === "sport"
          ? items.length + items.reduce((n, f) => n + (f.children?.length ?? 0), 0)
          : items.length;
        return (
          <details key={group} open={group === "topic" || holdsCurrent} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] min-h-11 lg:min-h-0 hover:text-[var(--text)]">
              <span>{GROUP_TITLE[group]}</span>
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums text-[10px] font-normal text-[var(--text-dim)]">{count}</span>
                <span aria-hidden className="text-[9px] text-[var(--text-dim)] transition-transform group-open:rotate-90">▶</span>
              </span>
            </summary>
            {/* Themes run past thirty on a busy window; the list scrolls rather than
                pushing the stories off the screen. */}
            <div className={group === "theme" ? "max-h-72 overflow-y-auto pr-1" : undefined}
              data-mobile-uncapped="bounded: inside a collapsed details">
              {items.map((f) =>
                group === "sport" ? (
                  <SportGroupBlock key={f.id} facet={f} current={current} />
                ) : (
                  <FacetLink
                    key={f.id}
                    facet={f}
                    group={group}
                    active={current?.group === group && current.slug === f.slug}
                  />
                ),
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function FilterRail({
  facets, current, windowDays,
}: {
  facets: DigestFacets;
  current?: { group: FacetGroup; slug: string };
  windowDays: number;
}) {
  const note = `Filters search the last ${windowDays} days`;
  return (
    <>
      <details className="mb-4 rounded-xl border lg:hidden"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold min-h-11 flex items-center justify-between">
          <span>Filter</span>
          <span className="text-[11px] font-normal text-[var(--text-dim)]">{note}</span>
        </summary>
        <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
          {current && <ClearFilter />}
          <Groups facets={facets} current={current} />
        </div>
      </details>

      <aside
        className="hidden lg:block lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        aria-label="Filter the digest"
      >
        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Filter</div>
          <p className="m-0 mt-0.5 text-[11px] text-[var(--text-dim)]">{note}</p>
        </div>
        {current && <ClearFilter />}
        <Groups facets={facets} current={current} />
      </aside>
    </>
  );
}

function ClearFilter() {
  return (
    <Link href="/digest" className="mb-3 inline-flex items-center min-h-11 lg:min-h-0 text-[11px] text-[var(--accent)] hover:underline">
      ← Back to the latest digest
    </Link>
  );
}
