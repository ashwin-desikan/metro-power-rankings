import type { Metadata } from "next";
import { getDigestItemsForDate, getLatestDigestDate, getRecentDigestDates } from "@/lib/digestFeed";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { DigestDayView, EmptyDigest } from "./_shared/ui";

// The latest digest. Read from Supabase at request time (lib/digestFeed), so a new
// morning's stories appear within the revalidate window and never cost a build.
export const revalidate = 1800;

const PAGE_PATH = "/digest";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "From the Digest";
const PAGE_DESCRIPTION =
  "The day's most substantive stories from about fifty newsletters, each with a direct link and one line on why it matters.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: ogImage(PAGE_TITLE, PAGE_URL), width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    images: [ogImage(PAGE_TITLE, PAGE_URL)],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default async function DigestPage() {
  const [day, dates] = await Promise.all([getLatestDigestDate(), getRecentDigestDates(30)]);
  const items = day ? await getDigestItemsForDate(day) : [];
  if (!day || items.length === 0) return <EmptyDigest />;
  return <DigestDayView day={day} items={items} dates={dates} isLatest />;
}
