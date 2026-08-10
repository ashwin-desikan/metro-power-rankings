import type { Metadata } from "next";
import Link from "next/link";
import TodayStrip from "./TodayStrip";

export const metadata: Metadata = {
  title: "Games",
  description:
    "Daily and endless games built from the Citizen of Nowhere data: Citizen of Nowhere Picks against the Premier League and NFL models, Metro Globle, Metro and Sports immaculate grids, Metro Higher or Lower, and the football, cricket, baseball and NFL Rules Labs.",
  alternates: { canonical: "/play/arcade" },
};

type Section = "model" | "daily" | "endless" | "rules";
type Game = { href: string; title: string; emoji: string; blurb: string; section: Section; static?: boolean };

// Citizen of Nowhere Picks replaced the per-league Beat the Model cards on
// 2026-08-10 (PICKEM-SPEC.md). The old static editions stay reachable for
// locked cards, just unlisted — same retirement path as the WC2026 edition
// (/play/beat-the-model.html). New leagues (CFB, MLB postseason, UCL) appear
// inside /play/picks itself, not as new cards here.
const GAMES: Game[] = [
  { href: "/play/picks", title: "Citizen of Nowhere Picks", emoji: "\u{1F3AF}", section: "model", blurb: "Call every Premier League and NFL game blind, rank your confidence, and take a side on the Upset Radar. Beat the machine, week after week." },
  { href: "/play/metro-globle.html", title: "Metro Globle", emoji: "\u{1F30D}", section: "daily", blurb: "Guess the daily mystery metro on a world map from distance and direction. Six tries.", static: true },
  { href: "/play/metro-grid.html", title: "Metro Grid", emoji: "\u{1F7E9}", section: "daily", blurb: "An immaculate grid for metros: fill each square to fit both its row and column.", static: true },
  { href: "/play/sports-grid.html", title: "Sports Grid", emoji: "\u{1F3DF}\u{FE0F}", section: "daily", blurb: "An immaculate grid for teams: name a team for each sport-and-country square.", static: true },
  { href: "/play/higher-or-lower.html", title: "Metro Higher or Lower", emoji: "\u{1F4C8}", section: "endless", blurb: "Which metro has more people, teams or skyscrapers? One wrong answer ends the streak.", static: true },
  { href: "/random", title: "Random Metro", emoji: "\u{1F3B2}", section: "endless", blurb: "Jump to a tier-weighted random metro from the rankings." },
  { href: "/play/rules-lab.html", title: "Football Rules Lab", emoji: "\u{1F6A9}", section: "rules", blurb: "Offside across eras, the 17 Laws, real refereeing calls, and how the rules changed.", static: true },
  { href: "/play/cricket-rules-lab.html", title: "Cricket Rules Lab", emoji: "\u{1F3CF}", section: "rules", blurb: "The LBW Lab, the key Laws, real situations, and how cricket's rules changed.", static: true },
  { href: "/play/baseball-rules-lab.html", title: "Baseball Rules Lab", emoji: "\u{26BE}", section: "rules", blurb: "The Strike Zone Lab, the key rules, real calls, and how baseball's rules changed.", static: true },
  { href: "/play/nfl-rules-lab.html", title: "NFL Rules Lab", emoji: "\u{1F3C8}", section: "rules", blurb: "The Catch Lab, the key rules, real officiating calls, and how the NFL's rules changed.", static: true },
  { href: "/teams/national/quiz", title: "International Football Honours Quiz", emoji: "\u{1F3C6}", section: "rules", blurb: "Test yourself on national-team trophies and tournament history." },
];

const SECTIONS: { id: Section; title: string; note: string }[] = [
  { id: "model", title: "Beat the model", note: "Weekly picks against our simulators: call the games blind, then watch the refreshed ledger grade you and the machine by the same rules." },
  { id: "daily", title: "Daily challenges", note: "A fresh puzzle every day, the same for everyone. Come back tomorrow for a new one." },
  { id: "endless", title: "Endless", note: "Play as long as your streak holds." },
  { id: "rules", title: "Learn the rules", note: "Interactive labs and quizzes for football, cricket and baseball, in kids and adults modes." },
];

const cardClass = "block rounded-xl border p-5 transition hover:border-[var(--accent)]";
const cardStyle = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;

function Card({ g }: { g: Game }) {
  const inner = (
    <>
      <div className="text-3xl">{g.emoji}</div>
      <div className="mt-2 text-lg font-semibold">{g.title}</div>
      <div className="mt-1 text-sm text-[var(--text-muted)]">{g.blurb}</div>
    </>
  );
  return g.static ? (
    <a href={g.href} className={cardClass} style={cardStyle}>{inner}</a>
  ) : (
    <Link href={g.href} className={cardClass} style={cardStyle}>{inner}</Link>
  );
}

export default function ArcadePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/play" className="hover:underline">Play</Link>
        {" / "}
        <span>Games</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Games</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Bigger interactive games built from the data. For the younger learning games, see{" "}
          <Link href="/play" className="underline hover:text-[var(--accent)]">Kids Games</Link>.
        </p>
      </header>

      <TodayStrip />

      {SECTIONS.map((sec) => {
        const games = GAMES.filter((g) => g.section === sec.id);
        return (
          <section key={sec.id} className="mb-10">
            <h2 className="text-lg font-semibold tracking-tight">{sec.title}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{sec.note}</p>
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              {games.map((g) => (
                <Card key={g.href} g={g} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
