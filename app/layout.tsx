import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import SiteNav from "./SiteNav";
import VisitBeacon from "./VisitBeacon";
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
      </body>
      <GoogleAnalytics gaId="G-8BQVX0NFZZ" />
    </html>
  );
}
