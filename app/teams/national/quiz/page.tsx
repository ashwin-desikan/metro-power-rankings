import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import QuizClient from "./QuizClient";

const PAGE_PATH = "/teams/national/quiz";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "International Football Quiz";
const PAGE_DESCRIPTION =
  "Guess the national team from its honors fingerprint. Five questions, four options each, scored against the actual data.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
};

export default function NationalQuizPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/national" className="hover:underline">International Football</Link>
        {" / "}
        <span>Quiz</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Guess the national team</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl">
          Five honors fingerprints, names and flags stripped. Each pattern of trophies, finals,
          and semifinals belongs to exactly one of the top thirty programs in international
          football. Pick the right one.
        </p>
      </header>

      <QuizClient />
    </main>
  );
}
