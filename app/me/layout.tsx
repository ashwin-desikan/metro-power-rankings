import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Following",
  description: "Metros and teams you follow, saved in your browser.",
  robots: { index: false, follow: true },
};

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
