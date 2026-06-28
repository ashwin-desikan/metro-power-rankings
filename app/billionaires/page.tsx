import type { Metadata } from "next";
import Link from "next/link";
import { getBillionaires, fmtWorth } from "@/lib/billionaires";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BillionairesTable from "./BillionairesTable";

const PATH = "/billionaires";
const TITLE = "Billionaires";
const DESC =
  "Every billionaire on the Forbes real-time list — net worth, country, and industry — sortable and filterable, with each linked to their country page. Refreshed monthly.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default async function BillionairesPage() {
  const data = await getBillionaires();
  const total = data.reduce((s, b) => s + (b.networth ?? 0), 0);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}<span>{TITLE}</span>
      </nav>
      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-2xl">{DESC}</p>
        {data.length ? (
          <p className="text-sm text-[var(--text-dim)] mt-2 tabular-nums">{data.length} billionaires · {fmtWorth(total)} combined net worth</p>
        ) : (
          <p className="text-sm text-[var(--text-dim)] mt-2">Data populates on the next monthly refresh — trigger “Billionaires refresh” from the repo’s Actions tab to load it now.</p>
        )}
      </header>
      {data.length ? <BillionairesTable data={data} /> : null}
      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Source: Forbes real-time billionaires, via the open-source <a href="https://github.com/komed3/rtb-api" target="_blank" rel="noopener noreferrer" className="hover:underline">rtb-api</a> project (MIT). Net worth as of the latest monthly snapshot; figures are estimates and make no claim to accuracy or completeness.
      </footer>
    </main>
  );
}
