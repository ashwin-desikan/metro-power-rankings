import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play & Learn",
  description:
    "Eleven free learning games for younger fans, built from the Citizen of Nowhere sports rankings. Geography, reading and maths, plus the rules of football, cricket and baseball, for ages 5 to 10.",
  alternates: { canonical: "/play" },
};

type Group = "trivia" | "rules";
type Game = { title: string; emoji: string; file: string; ages: string; blurb: string; group: Group };

const GAMES: Game[] = [
  { title: "World Sports Tour", emoji: "\u{1F30D}", file: "world-sports-tour.html", ages: "5–8", blurb: "Tour real sporting cities: continents, money, reading and counting.", group: "trivia" },
  { title: "Find the Team's Home", emoji: "\u{1F50E}", file: "find-the-teams-home.html", ages: "5–9", blurb: "Match real clubs to their home city, country or continent.", group: "trivia" },
  { title: "League Table Detective", emoji: "\u{1F50D}", file: "league-table-detective.html", ages: "6–10", blurb: "Read a real NFL table: points, point difference and bar charts.", group: "trivia" },
  { title: "Match Day Money", emoji: "\u{1F4B7}", file: "match-day-money.html", ages: "5–8", blurb: "Making change and adding up, in pounds and dollars.", group: "trivia" },
  { title: "Bigger City", emoji: "\u{1F3D9}\u{FE0F}", file: "bigger-city.html", ages: "5–9", blurb: "Tap the bigger metro by people, skyscrapers or teams.", group: "trivia" },
  { title: "Trophy Count", emoji: "\u{1F3C6}", file: "trophy-count.html", ages: "6–10", blurb: "Compare and add up real championship totals.", group: "trivia" },
  { title: "North or South?", emoji: "\u{1F9ED}", file: "north-or-south.html", ages: "6–10", blurb: "Is this team's city north or south of the equator?", group: "trivia" },
  { title: "Odd One Out", emoji: "\u{1F914}", file: "odd-one-out.html", ages: "6–10", blurb: "Spot the team that does not belong.", group: "trivia" },
  { title: "Offside or Onside?", emoji: "\u{1F6A9}", file: "offside-or-onside.html", ages: "7–10", blurb: "Football: spot the offside, and see how the rule changed.", group: "rules" },
  { title: "How's That?", emoji: "\u{1F3CF}", file: "hows-that.html", ages: "7–10", blurb: "Cricket: spot the dismissal and learn LBW.", group: "rules" },
  { title: "Ball or Strike?", emoji: "\u{26BE}", file: "ball-or-strike.html", ages: "7–10", blurb: "Baseball: call the strike zone and the basics.", group: "rules" },
];

function Grid({ games }: { games: Game[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 16,
        marginTop: 14,
      }}
    >
      {games.map((g) => (
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
  );
}

export default function PlayHub() {
  const trivia = GAMES.filter((g) => g.group === "trivia");
  const rules = GAMES.filter((g) => g.group === "rules");
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#16324f", marginBottom: 6 }}>
        Play &amp; Learn
      </h1>
      <p style={{ color: "#5b7b97", maxWidth: 640, lineHeight: 1.5 }}>
        Free learning games for younger fans, built from our rankings data. For ages 5 to 10.
      </p>

      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16324f", marginTop: 30 }}>
        🧠 Trivia Games
      </h2>
      <p style={{ color: "#5b7b97", fontSize: ".95rem", margin: "4px 0 0" }}>
        Geography, reading and maths through real teams, cities and standings.
      </p>
      <Grid games={trivia} />

      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16324f", marginTop: 34 }}>
        🟨 Be the Ref
      </h2>
      <p style={{ color: "#5b7b97", fontSize: ".95rem", margin: "4px 0 0" }}>
        Make the call, and learn the rules of each sport by judging real situations.
      </p>
      <Grid games={rules} />

      <a
        href="/play/arcade"
        style={{
          display: "block",
          marginTop: 34,
          textDecoration: "none",
          background: "#16324f",
          color: "#fff",
          borderRadius: 18,
          padding: "18px 20px",
          boxShadow: "0 6px 16px #16324f22",
        }}
      >
        <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>For older fans: The Rules Labs &rarr;</div>
        <div style={{ fontSize: ".95rem", color: "#bcd4e6", marginTop: 4 }}>
          Go deeper on football, cricket and baseball: the signature-rule labs, the full laws, real
          officiating calls, and how the rules changed. Kids and adults modes.
        </div>
      </a>
    </main>
  );
}
