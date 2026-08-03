import type { Metadata } from "next";
import { getCompanies } from "@/lib/business";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { Crumbs, TabHeader } from "../ui";
import CompaniesExplorer from "./CompaniesExplorer";

export const revalidate = 21600;

const PATH = "/business/companies";
const TITLE = "The Company Universe";
const DESC =
  "Every company this site tracks - the top 500 by market cap up front, with search and filters that reach all the way down the list: public companies, unicorns and private giants, each tied to its home metro.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default async function CompaniesPage() {
  const data = await getCompanies();
  const companies = data?.companies ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Companies" />
      <TabHeader
        emoji="🏢"
        title="The Company Universe"
        sub="The top 500 companies on Earth by market value, and the search box that reaches the other twelve thousand. Public listings at market cap, unicorns at their last raise, private giants at estimated value - every one tied to the metro it is run from."
        stamp={data ? `snapshot ${data.meta.as_of} · ${data.meta.count.toLocaleString()} companies tracked` : null}
      />
      <BusinessNav />

      {companies.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          The company universe has not loaded (<code>/data/business/companies.json</code>); try again shortly.
        </p>
      ) : (
        <CompaniesExplorer initial={companies.slice(0, 500)} total={data?.meta.count ?? companies.length} />
      )}
    </main>
  );
}
