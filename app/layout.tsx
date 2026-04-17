import type { Metadata } from "next";
import "./globals.css";
import SiteNav from "./SiteNav";

export const metadata: Metadata = {
  title: "Global Metro Power Rankings",
  description:
    "70,000+ parameters across 16 dimensions, 4,285 metros, and 237 countries. A composite score measuring the completeness of every metropolitan area on Earth.",
  openGraph: {
    title: "Global Metro Power Rankings",
    description:
      "70,000+ parameters across 16 dimensions, 4,285 metros, and 237 countries. Measuring what makes a city matter.",
    type: "website",
  },
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
      </head>
      <body className="antialiased">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
