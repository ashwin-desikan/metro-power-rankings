import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FILTER_WINDOW_DAYS, getDigestItemsSince, getLatestDigestDate,
} from "@/lib/digestFeed";
import {
  facetsByGroup, facetsFor, itemInFacet, FACET_GROUPS, type FacetGroup,
} from "@/lib/digestFacets";
import { DigestFilterView } from "@/app/digest/_shared/ui";

// One filtered view of the trailing window, e.g. /digest/filter/topic/sport.
//
// NOT statically generated. There are ~47 of these and the set moves with the feed, so
// generateStaticParams would either go stale or need a build to refresh, and a Vercel
// build is exactly what the 2/day budget guards. These render on demand and cache on the
// same ISR window as the feed, which costs no build and stays current on its own.

export const revalidate = 1800;

// FACET_GROUPS is the RAIL's order and does not include "competition", which has no rail
// of its own because those links are nested under their sport. It is still a valid route.
const ROUTE_GROUPS: FacetGroup[] = [...FACET_GROUPS, "competition"];

function parseGroup(s: string): FacetGroup | null {
  return (ROUTE_GROUPS as string[]).includes(s) ? (s as FacetGroup) : null;
}

type Params = { params: Promise<{ group: string; value: string }> };

/** The facet, its label and the stories under it. Shared by the page and its metadata. */
async function load(groupRaw: string, value: string) {
  const group = parseGroup(groupRaw);
  if (!group) return null;
  const all = await getDigestItemsSince();
  const facets = facetsFor(all);
  const facet = facetsByGroup(facets, group).find((f) => f.slug === value);
  // An unknown facet, or one with nothing in the window, is a 404 rather than an empty
  // page: the rail only ever links to facets that have stories.
  if (!facet) return null;
  return { group, facet, facets, items: all.filter((it) => itemInFacet(it, group, value)) };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { group, value } = await params;
  const data = await load(group, value);
  if (!data) return { title: "Not found" };
  return {
    title: `${data.facet.label} in the digest`,
    description: `Every story about ${data.facet.label.toLowerCase()} from the last ${FILTER_WINDOW_DAYS} days of the newsletter digest, newest first.`,
    alternates: { canonical: `/digest/filter/${data.group}/${value}` },
  };
}

export default async function Page({ params }: Params) {
  const { group, value } = await params;
  const data = await load(group, value);
  if (!data) notFound();
  return (
    <DigestFilterView
      facets={data.facets}
      current={{ group: data.group, slug: value }}
      label={data.facet.label}
      hubHref={data.facet.hubHref}
      items={data.items}
      windowDays={FILTER_WINDOW_DAYS}
      latest={await getLatestDigestDate()}
    />
  );
}
