import type { Metadata } from "next";
import PicksClient from "./PicksClient";

export const metadata: Metadata = {
  title: "Citizen of Nowhere Picks",
  description:
    "Call every Premier League, NFL and College Football game before the model's card is revealed. Blind picks, a confidence pool, and the Upset Radar: the games where our model and the betting market disagree most. Score points, build a streak, beat the machine.",
  alternates: { canonical: "/play/picks" },
  openGraph: {
    title: "Citizen of Nowhere Picks | Global Metro Power Rankings",
    description:
      "Blind weekly picks against our Premier League, NFL and College Football models, a confidence pool, and the Upset Radar. Beat the machine.",
    type: "website",
    url: "/play/picks",
  },
};

export default function PicksPage() {
  return <PicksClient />;
}
