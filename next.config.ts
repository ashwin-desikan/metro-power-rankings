import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      // Original Ottawa Senators / St. Louis Eagles dynasty: canonical name
      // changed from "Eagles" to "Senators (Org)" (slug senators-org).
      {
        source: "/teams/nhl/eagles",
        destination: "/teams/nhl/senators-org",
        permanent: true,
      },
      // Page renamed from "Governors" to "United States Political Leadership".
      {
        source: "/governors",
        destination: "/us-political-leadership",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
