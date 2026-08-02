import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Global Metro Power Rankings (rankings.citizenofnowhere.org) handles data: optional Google sign-in, follows, and analytics.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "July 5, 2026";

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold mt-8 mb-2">{children}</h2>;
}

export default function PrivacyPage() {
  return (
    <div style={{ backgroundColor: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>
      <article className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 text-[15px] leading-relaxed">
        <h1 className="text-3xl font-bold mb-1">Privacy Policy</h1>
        <p className="text-[13px] text-[var(--text-muted)] mb-6">Last updated {UPDATED}</p>

        <p>
          Global Metro Power Rankings (<span className="whitespace-nowrap">rankings.citizenofnowhere.org</span>),
          part of Citizen of Nowhere, is an independent, hand-curated project. This policy explains what limited
          data the site collects and why. The short version: the site is free, carries no advertising, and never
          sells your data.
        </p>

        <H>Signing in (optional)</H>
        <p>
          You can use the entire site without an account. If you choose to sign in with Google to sync the metros
          and teams you follow across devices, Google shares your name, email address, and profile picture with us.
          We use those solely to identify your account and to store your follows against it. We do not receive your
          Google password, and we do not access anything else in your Google account.
        </p>

        <H>Follows</H>
        <p>
          When you follow a metro or team, we store which ones you follow. If you are signed out, that list lives
          only in your own browser (local storage) and never reaches our servers. If you are signed in, it is stored
          in our database alongside your account identifier, protected so that only you can read or change it, and
          synced to your other signed-in devices. You can unfollow anything at any time, and you can sign out to
          return to a browser-only list.
        </p>

        <H>Analytics</H>
        <p>
          We keep a first-party, privacy-light count of page views: only the page path and the date are recorded,
          aggregated into counts. No IP address, no device fingerprint, no cookies, and nothing that identifies an
          individual. The site also uses Google Analytics (measurement ID G-8BQVX0NFZZ) to understand overall
          traffic; Google Analytics sets its own cookies and processes usage and device data under{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)]">Google&rsquo;s Privacy Policy</a>.
        </p>

        <H>Cookies and local storage</H>
        <p>
          Signed-out follows use your browser&rsquo;s local storage, not cookies. Signing in creates a Supabase
          authentication session stored in your browser so you stay logged in. Google Analytics sets analytics
          cookies. That is the extent of it.
        </p>

        <H>Who processes this data</H>
        <p>
          We rely on a small set of service providers acting on our behalf: Google (sign-in and Google Analytics),
          Supabase (authentication and database, hosted in the EU), and Vercel (website hosting). We do not share
          your data with anyone else, and we do not sell or rent it.
        </p>

        <H>Your choices</H>
        <p>
          Use the site without ever signing in; unfollow at any time; sign out to keep your list on-device only; or
          ask us to delete your account and its stored follows entirely. To request deletion or ask a question,
          reach us via the{" "}
          <a href="https://citizenofnowhere.substack.com/about" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)]">contact page</a>.
        </p>

        <H>Retention</H>
        <p>
          Your follows are kept until you remove them or delete your account. Aggregated, non-identifying page-view
          counts are kept to understand trends over time.
        </p>

        <H>Children</H>
        <p>
          The site is a general-audience publication and is not directed at children under 13, and we do not
          knowingly collect their data.
        </p>

        <H>Changes</H>
        <p>
          If this policy changes, we will update the date above. Continued use after a change means you accept the
          revised policy.
        </p>

        <p className="mt-8 text-[13px] text-[var(--text-muted)]">
          <Link href="/" className="text-[var(--accent)]">Back to the site</Link>
        </p>
      </article>
    </div>
  );
}
