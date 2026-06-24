import type { Metadata } from "next";
import Link from "next/link";
import TodayStrip from "./TodayStrip";

export const metadata: Metadata = {
  title: "Games",
  description:
    "Daily and endless games built from the Citizen of Nowhere data: Beat the Model against the World Cup 2026 simulator, Metro Globle, Metro and Sports immaculate grids, Metro Higher or Lower, and the football, cricket and baseball Rules Labs.",
  alternates: { canonical: "/play/arcade" },
};

type Section = "daily" | "endless" | "rules";
type Game = { href: string; title: string; emoji: string; blurb: string; section: Section; static?: boolean };

const GAMES: Game[] = [
  { href: "/play/beat-the-model.html", title: "Beat the Model", emoji: "\u{1F3AF}", section: "daily", blurb: "Make the World Cup 2026 calls our simulator is least sure about. Locks now, resolves through the knockouts.", static: true },
  { href: "/play/metro-globle.html", title: "Metro Globle", emoji: "\u{1F30D}", section: "daily", blurb: "Guess the daily mystery metro on a world map from distance and direction. Six tries.", static: true },
  { href: "/play/metro-grid.html", title: "Metro Grid", emoji: "\u{1F7E9}", section: "daily", blurb: "An immaculate grid for metros: fill each square to fit both its row and column.", static: true },
  { href: "/play/sports-grid.html", title: "Sports Grid", emoji: "\u{1F3DF}\u{FE0F}", section: "daily", blurb: "An immaculate grid for teams: name a team for each sport-and-country square.", static: true },
  { href: "/play/higher-or-lower.html", title: "Metro Higher or Lower", emoji: "\u{1F4C8}", section: "endless", blurb: "Which metro has more people, teams or skyscrapers? One wrong answer ends the streak.", static: true },
  { href: "/random", title: "Random Metro", emoji: "\u{1F3B2}", section: "endless", blurb: "Jump to a tier-weighted random metro from the rankings." },
  { href: "/play/rules-lab.html", title: "Football Rules Lab", emoji: "\u{1F6A9}", section: "rules", blurb: "Offside across eras, the 17 Laws, real refereeing calls, and how the rules changed.", static: true },
  { href: "/play/cricket-rules-lab.html", title: "Cricket Rules Lab", emoji: "\u{1F3CF}", section: "rules", blurb: "The LBW Lab, the key Laws, real situations, and how cricket's rules changed.", static: true },
  { href: "/play/baseball-rules-lab.html", title: "Baseball Rules Lab", emoji: "\u{26BE}", section: "rules", blurb: "The Strike Zone Lab, the key rules, real calls, and how baseball's rules changed.", static: true },
  { href: "/teams/national/quiz", title: "International Football Honours Quiz", emoji: "\u{1F3C6}", section: "rules", blurb: "Test yourself on national-team trophies and tournament history." },
];

const SECTIONS: { id: Section; title: string; note: string }[] = [
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
