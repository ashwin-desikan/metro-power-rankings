import type { Metadata } from "next";
import Link from "next/link";
import {
  getExecutiveHistory,
  getHouseHistory,
  getSenateHistory,
  getCabinetHistory,
  getGovernorHistory,
} from "@/lib/usPolitics";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import USTimeMachine from "../USTimeMachine";

const PATH = "/us-political-leadership/time-machine";
const TITLE = "A Day in American History";
const DESC =
  "Pick any date back to 1789 to see who was President and Vice President, and the partisan balance of the U.S. House of Representatives on that day.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
};

export default async function USTimeMachinePage() {
  const execHist = await getExecutiveHistory();
  const houseHist = await getHouseHistory();
  const senateHist = await getSenateHistory();
  const cabinetHist = await getCabinetHistory();
  const governorHist = await getGovernorHistory();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        {" / "}
        <Link href="/us-political-leadership" className="hover:underline">
          US Political Leadership
        </Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <Link
        href="/us-political-leadership"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline mb-5"
      >
        <span aria-hidden>←</span> Back to US Political Leadership
      </Link>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <USTimeMachine
        presidents={execHist.presidents}
        vicePresidents={execHist.vicePresidents}
        house={houseHist}
        senate={senateHist}
        cabinet={cabinetHist}
        governors={governorHist}
      />

      <p className="text-sm text-[var(--text-muted)]">
        <Link
          href="/us-political-leadership"
          className="text-[var(--accent)] hover:underline"
        >
          ← Back to current US political leadership
        </Link>
      </p>
    </main>
  );
}
