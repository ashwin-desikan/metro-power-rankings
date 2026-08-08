import type { Metadata } from "next";
import BanterClient from "./BanterClient";

export const metadata: Metadata = {
  title: "The Banter Engine (beta)",
  description:
    "Time-locked conversations with fictional locals, anchored to real dated data: eleven historical scenes and a today mode. Private beta.",
  alternates: { canonical: "/banter" },
  robots: { index: false, follow: false }, // private beta: keep out of search
  openGraph: {
    title: "The Banter Engine (beta) | Global Metro Power Rankings",
    description:
      "Time-locked conversations with fictional locals, anchored to real dated data. Private beta.",
    type: "website",
    url: "/banter",
  },
};

export default function BanterBeta() {
  return <BanterClient />;
}
