import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import SiteNav from "./SiteNav";
import VisitBeacon from "./VisitBeacon";
import BackToTop from "./BackToTop";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: SITE_NAME,
    template: "%s | Global Metro Power Rankings",
  },
  description:
    "A composite ranking of every metropolitan area on Earth, across sixteen dimensions, hand-curated from individually verified parameters.",
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Metro Rankings",
  },
  keywords: [
    "global metro rankings",
    "metropolitan areas",
    "metro power score",
    "world metros",
    "urban index",
    "sports business expansion",
    "location intelligence",
    "metro power rankings",
  ],
  authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
  creator: AUTHOR.name,
  publisher: PUBLISHER.name,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_NAME,
    description:
      "Every metropolitan area on Earth, sixteen dimensions, individually verified parameters. Measuring what makes a metro matter.",
    type: "website",
    siteName: SITE_NAME,
    url: BASE_URL,
    locale: "en_US",
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description:
      "Every metropolitan area on Earth. Sixteen dimensions. Hand-curated parameters.",
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "Urban Analytics",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d1117",
};

// Site-wide identity graph. Emitted once in the root layout so every page
// inherits the WebSite, Person, and Organization entities.
const siteGraph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      name: SITE_NAME,
      url: BASE_URL,
      description:
        "A composite ranking of every metropolitan area on Earth, across sixteen dimensions, hand-curated from individually verified parameters.",
      inLanguage: "en",
      publisher: { "@id": `${PUBLISHER.url}/#publisher` },
      author: { "@id": `${AUTHOR.url}/#author` },
      potentialAction: {
        "@type": "SearchAction",
        target: `${BASE_URL}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Person",
      "@id": `${AUTHOR.url}/#author`,
      name: AUTHOR.name,
      url: AUTHOR.url,
      sameAs: [AUTHOR.url],
    },
    {
      "@type": "Organization",
      "@id": `${PUBLISHER.url}/#publisher`,
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteGraph) }}
        />
      </head>
      <body className="antialiased">
        <SiteNav />
        <VisitBeacon />
        {children}
        <BackToTop />
        {/* Third page-view counter on this site, deliberately, because each
            answers a different question and none of them answers all three.

            GoogleAnalytics  - sessions, acquisition, the conventional view.
            VisitBeacon      - our own path+day counts in Supabase. Counts every
                               page load that runs JavaScript, which INCLUDES
                               headless crawlers: the 2026-08-05/06 crawl
                               executed JS (that is how it triggered segment
                               prefetch) and so it ran the beacon too. On
                               2026-08-06 that produced 133 views across 115
                               distinct paths with a busiest page of 3, which is
                               a crawl signature rather than a human one.
            Analytics (this) - Vercel Web Analytics, which EXCLUDES bot traffic.

            That last property is the whole reason for adding it. The beacon
            cannot separate people from crawlers retrospectively, so the gap
            between this number and the beacon's is itself the bot signal.
            Keep both; they are not redundant.

            Needs BOTH halves to work: the project toggle in Vercel AND this
            component. The toggle alone collects nothing and the dashboard just
            reads empty, which is exactly how it sat unnoticed until now. */}
        <Analytics />
      </body>
      <GoogleAnalytics gaId="G-8BQVX0NFZZ" />
    </html>
  );
}
