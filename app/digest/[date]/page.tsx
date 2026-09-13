import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDigestItemsForDate, getLatestDigestDate, getRecentDigestDates } from "@/lib/digestFeed";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { DigestDayView, fmtDigestDate } from "../_shared/ui";

// One day's digest, in editorial order. Rendered on first request and cached for the
// revalidate window; no dates are prebuilt, so the build never calls Supabase for these.
export const revalidate = 1800;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ date: string }> };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!DAY.test(date)) return {};
  const path = `/digest/${date}`;
  const url = `${BASE_URL}${path}`;
  const title = `From the Digest: ${fmtDigestDate(date, "short")}`;
  const description = `The stories from the Daily Newsletter Digest for ${fmtDigestDate(date)}, each with a direct link and one line on why it matters.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      images: [{ url: ogImage(title, url), width: 1200, height: 630 }],
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      type: "article",
    },
    twitter: {
      images: [ogImage(title, url)],
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export default async function DigestDatePage({ params }: Props) {
  const { date } = await params;
  if (!DAY.test(date)) notFound();
  const [items, dates, latest] = await Promise.all([
    getDigestItemsForDate(date),
    getRecentDigestDates(30),
    getLatestDigestDate(),
  ]);
  if (items.length === 0) notFound();
  return <DigestDayView day={date} items={items} dates={dates} isLatest={date === latest} />;
}
