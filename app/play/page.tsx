import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play & Learn",
  description:
    "Nine free learning games for younger fans, built from the Citizen of Nowhere sports rankings. Geography, reading and maths through real teams, cities and standings, for ages 5 to 10.",
  alternates: { canonical: "/play" },
};

type Game = { title: string; emoji: string; file: string; ages: string; blurb: string };

const GAMES: Game[] = [
  { title: "World Sports Tour", emoji: "\u{1F30D}", file: "world-sports-tour.html", ages: "5–8", blurb: "Tour real sporting cities: continents, money, reading and counting." },
  { title: "Find the Team's Home", emoji: "\u{1F50E}", file: "find-the-teams-home.html", ages: "5–9", blurb: "Match real clubs to their home city, country or continent." },
  { title: "League Table Detective", emoji: "\u{1F50D}", file: "league-table-detective.html", ages: "6–10", blurb: "Read a real NFL table: points, point difference and bar charts." },
  { title: "Match Day Money", emoji: "\u{1F4B7}", file: "match-day-money.html", ages: "5–8", blurb: "Making change and adding up, in pounds and dollars." },
  { title: "Bigger City", emoji: "\u{1F3D9}️", file: "bigger-city.html", ages: "5–9", blurb: "Tap the bigger metro by people, skyscrapers or teams." },
  { title: "Trophy Count", emoji: "\u{1F3C6}", file: "trophy-count.html", ages: "6–10", blurb: "Compare and add up real championship totals." },
  { title: "North or South?", emoji: "\u{1F9ED}", file: "north-or-south.html", ages: "6–10", blurb: "Is this team's city north or south of the equator?" },
  { title: "Odd One Out", emoji: "\u{1F914}", file: "odd-one-out.html", ages: "6–10", blurb: "Spot the team that does not belong." },
  { title: "Offside or Onside?", emoji: "\u{1F6A9}", file: "offside-or-onside.html", ages: "7–10", blurb: "Spot the offside, and see how the offside rule changed over time." },
];

export default function PlayHub() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#16324f", marginBottom: 6 }}>
        Play &amp; Learn
      </h1>
      <p style={{ color: "#5b7b97", maxWidth: 640, lineHeight: 1.5 }}>
        Free learning games for younger fans, built from our rankings data. Geography, reading and
        maths through real teams, cities and standings, blending UK and US curricula. For ages 5 to 10.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
          marginTop: 24,
        }}
      >
        {GAMES.map((g) => (
          <a
            key={g.file}
            href={`/play/games/${g.file}`}
            style={{
              display: "block",
              textDecoration: "none",
              background: "#fff",
              border: "1px solid #e3edf5",
              borderRadius: 18,
              padding: 18,
              boxShadow: "0 6px 16px #16324f14",
            }}
          >
            <div style={{ fontSize: "2.2rem" }}>{g.emoji}</div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#16324f", marginTop: 6 }}>
              {g.title}
            </div>
            <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#1f9e82", margin: "2px 0 6px" }}>
              Ages {g.ages}
            </div>
            <div style={{ fontSize: ".95rem", color: "#5b7b97", lineHeight: 1.4 }}>{g.blurb}</div>
          </a>
        ))}
      </div>
      <a
        href="/play/rules-lab.html"
        style={{
          display: "block",
          marginTop: 24,
          textDecoration: "none",
          background: "#16324f",
          color: "#fff",
          borderRadius: 18,
          padding: "18px 20px",
          boxShadow: "0 6px 16px #16324f22",
        }}
      >
        <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>For older fans: The Rules Lab &rarr;</div>
        <div style={{ fontSize: ".95rem", color: "#bcd4e6", marginTop: 4 }}>
          Offside across eras, the 17 Laws, real refereeing calls, and how rule changes reshaped the
          game. Kids and adults modes.
        </div>
      </a>
    </main>
  );
}
