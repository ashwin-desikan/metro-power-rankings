import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import SiteNav from "./SiteNav";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: SITE_NAME,
    template: "%s | Global Metro Power Rankings",
  },
  description:
    "A composite ranking of every metropolitan area on Earth. 4,200+ metros, 237 countries, 16 dimensions, 70,000+ individually verified parameters.",
  applicationName: SITE_NAME,
  keywords: [
    "global city rankings",
    "metropolitan areas",
    "city power score",
    "world cities",
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
      "4,200+ metros, 237 countries, 16 dimensions, 70,000+ individually verified parameters. Measuring what makes a city matter.",
    type: "website",
    siteName: SITE_NAME,
    url: BASE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description:
      "4,200+ metros. 237 countries. 16 dimensions. 70,000+ individually verified parameters.",
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
        "A composite ranking of every metropolitan area on Earth. 4,200+ metros, 237 countries, 16 dimensions, 70,000+ individually verified parameters.",
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
      email: AUTHOR.email,
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
        {children}
      </body>
      <GoogleAnalytics gaId="G-8BQVX0NFZZ" />
    </html>
  );
}
