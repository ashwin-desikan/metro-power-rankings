import type { Metadata } from "next";
import Link from "next/link";
import {
  getUkPmAndSovereign,
  getUkOffices,
  getUkCommonsHistory,
  getUkLordsHistory,
} from "@/lib/ukPolitics";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import UKTimeMachine from "../UKTimeMachine";
import HubBackLink from "@/app/_shared/HubBackLink";

const PATH = "/uk-political-leadership/time-machine";
const TITLE = "A Day in British Political History";
const DESC =
  "Pick any date back to the early 18th century to see the Sovereign, the Prime Minister, the Great Offices of State, the composition of the Houses of Commons and Lords, and the devolved First Ministers on that day.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default async function UKTimeMachinePage() {
  const { sovereigns, primeMinisters } = getUkPmAndSovereign();
  const offices = await getUkOffices();
  const commons = await getUkCommonsHistory();
  const lords = await getUkLordsHistory();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/uk-political-leadership" className="hover:underline">UK Political Leadership</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <Link
        href="/uk-political-leadership"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline mb-5"
      >
        <span aria-hidden>←</span> Back to UK Political Leadership
      </Link>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <HubBackLink className="mt-3" />
      </header>

      <UKTimeMachine
        sovereigns={sovereigns}
        primeMinisters={primeMinisters}
        offices={offices}
        commons={commons}
        lords={lords}
      />

      <p className="text-sm text-[var(--text-muted)]">
        <Link href="/uk-political-leadership" className="text-[var(--accent)] hover:underline">
          ← Back to current UK political leadership
        </Link>
      </p>
    </main>
  );
}
