import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderChanges } from "@/lib/leaderChanges";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PAGE_PATH = "/leaders/changes";
const PAGE_TITLE = "Leadership changes";
const PAGE_DESCRIPTION =
  "A running log of national leadership changes we track: who took office, who they replaced, and when, refreshed weekly from Wikidata and curated sources.";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: `${BASE_URL}${PAGE_PATH}`,
    type: "website",
  },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function fmtDate(d: string): string {
  const t = Date.parse(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function LeaderChangesPage() {
  const data = await getLeaderChanges();
  const changes = [...(data.changes ?? [])].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4">
        <Link href="/leaders" className="text-sm text-[var(--accent)] hover:underline">
          &larr; Leaders
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-[var(--text)]">Leadership changes</h1>
      <p className="mt-2 max-w-2xl text-[var(--text-muted)]">{PAGE_DESCRIPTION}</p>
      {data.updated ? (
        <p className="mt-1 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          Last checked {fmtDate(data.updated)}. Updated weekly.
        </p>
      ) : null}

      {changes.length ? (
        <div
          className="mt-6 overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="py-2 px-4">Date</th>
                <th className="py-2 px-4">Country</th>
                <th className="py-2 px-4">Office</th>
                <th className="py-2 px-4">Change</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c, i) => (
                <tr
                  key={`${c.slug}-${c.date}-${i}`}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="whitespace-nowrap py-2 px-4 tabular-nums text-[var(--text-muted)]">{fmtDate(c.date)}</td>
                  <td className="py-2 px-4">
                    <Link href={`/countries/${c.slug}`} className="text-[var(--accent)] hover:underline">
                      {c.country}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-[var(--text-muted)]">{c.office}</td>
                  <td className="py-2 px-4 text-[var(--text)]">
                    {c.from ? (
                      <span className="text-[var(--text-dim)] line-through">{c.from}</span>
                    ) : (
                      <span className="text-[var(--text-dim)]">(vacant)</span>
                    )}
                    <span className="mx-1.5 text-[var(--text-dim)]">&rarr;</span>
                    <span className="font-medium">{c.to}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-[var(--text-muted)]">No changes recorded yet.</p>
      )}
    </div>
  );
}
