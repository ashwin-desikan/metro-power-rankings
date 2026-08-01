import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play & Learn",
  description:
    "Free learning games for younger fans, built from the Citizen of Nowhere data and aligned to the primary curriculum: the seven continents and five oceans, capital cities, ancient civilisations, world leaders, teams and rivalries. For ages 5 to 10.",
  alternates: { canonical: "/play" },
};

type Group = "learn" | "civics" | "think" | "rules" | "older";
type Game = { title: string; emoji: string; file: string; ages: string; blurb: string; group: Group };

const GAMES: Game[] = [
  { title: "Penalty Shootout!", emoji: "\u{26BD}", file: "penalty-shootout.html", ages: "6–9", blurb: "Answer to take your shot: badges, flags and capital cities. Score five goals to win the cup!", group: "learn" },
  { title: "Crest Sort", emoji: "\u{1F6E1}\u{FE0F}", file: "crest-sort.html", ages: "5–9", blurb: "Sort real club badges into the country each club plays in.", group: "learn" },
  { title: "Flag Flash", emoji: "\u{1F6A6}", file: "flag-flash.html", ages: "5–9", blurb: "Tap the right flag before the timer runs out. How long can your streak burn?", group: "learn" },
  { title: "Champions Duel", emoji: "\u{1F3C6}", file: "champions-duel.html", ages: "6–10", blurb: "Two clubs, one final: tap the team that lifted the cup, from real Champions League finals.", group: "learn" },
  { title: "Then & Now", emoji: "\u{1F5FA}\u{FE0F}", file: "then-and-now.html", ages: "6–10", blurb: "Tap the country that sits on an ancient empire's land today, and travel through time. Ancient Egypt, Greece, Rome and more.", group: "learn" },
  { title: "Flag Sort", emoji: "\u{1F30D}", file: "flag-sort.html", ages: "5–8", blurb: "Sort each flag into its continent: the world's seven continents.", group: "learn" },
  { title: "Capital Match", emoji: "\u{1F3D9}\u{FE0F}", file: "capital-match.html", ages: "5–8", blurb: "Match countries to capital cities. Pick a Quick trip of 8, or the full Grand tour.", group: "learn" },
  { title: "Crest Match", emoji: "\u{1F6E1}\u{FE0F}", file: "crest-match.html", ages: "5–9", blurb: "A memory game with real club badges, and the city each team calls home.", group: "learn" },
  { title: "Champions", emoji: "\u{1F3C5}", file: "champions.html", ages: "6–10", blurb: "Tap the sport each nation is best at in the world.", group: "learn" },
  { title: "Big Rivals", emoji: "\u{1F525}", file: "big-rivals.html", ages: "7–10", blurb: "Spot each team's greatest rival, from El Clásico to the Old Firm.", group: "learn" },
  { title: "Find the Team's Home", emoji: "\u{1F50E}", file: "find-the-teams-home.html", ages: "5–9", blurb: "Match real clubs to their home city, country or continent.", group: "learn" },
  { title: "North or South?", emoji: "\u{1F9ED}", file: "north-or-south.html", ages: "6–10", blurb: "Is this team's city north or south of the equator?", group: "learn" },
  { title: "World Sports Tour", emoji: "\u{1F30F}", file: "world-sports-tour.html", ages: "5–8", blurb: "Tour real sporting cities: continents, money, reading and counting.", group: "learn" },
  { title: "Who's the Boss?", emoji: "\u{1F3DB}\u{FE0F}", file: "whos-the-boss.html", ages: "6–10", blurb: "President, Prime Minister or King: whose job is it? America and Britain run things very differently.", group: "civics" },
  { title: "Leader Time Machine", emoji: "\u{1F570}\u{FE0F}", file: "leader-time-machine.html", ages: "7–10", blurb: "Real Presidents, Prime Ministers and monarchs: who came first, who was in charge, and who ruled at the same time.", group: "civics" },
  { title: "US or UK?", emoji: "\u{1F5FD}", file: "us-or-uk.html", ages: "6–10", blurb: "50 states or 4 nations? Congress or Parliament? Sort each one to the right flag, and mind the tricky ones.", group: "civics" },
  { title: "Stadium Stacker", emoji: "\u{1F3DF}\u{FE0F}", file: "stadium-stacker.html", ages: "7–9", blurb: "Build match-day crowds from hundreds, tens and ones, order real skyscraper skylines, and count the turnstiles.", group: "think" },
  { title: "Big Match Adder", emoji: "\u2795", file: "big-match-adder.html", ages: "7–9", blurb: "Add and subtract crowds like a club accountant: estimate first, type the exact answer, prove it with the inverse check.", group: "think" },
  { title: "Times-Table Striker", emoji: "\u2716\u{FE0F}", file: "times-table-striker.html", ages: "7–9", blurb: "The 3, 4 and 8 times tables (up to 12×12 in Year 4) through three-pointers, cricket fours and rowing eights. Every right answer is a goal.", group: "think" },
  { title: "Fraction Football", emoji: "\u{1F355}", file: "fraction-football.html", ages: "7–9", blurb: "Shade fractions of the pitch, read possession bars, and find tenths on the goal-line.", group: "think" },
  { title: "Shape & Flag Lab", emoji: "\u{1F4D0}", file: "shape-flag-lab.html", ages: "7–9", blurb: "Fold real flags to test symmetry, judge corner-kick angles, and spot parallel and perpendicular lines on the pitch.", group: "think" },
  { title: "Kick-Off Clock", emoji: "\u{1F570}\u{FE0F}", file: "kickoff-clock.html", ages: "7–9", blurb: "Stadium clocks with Roman numerals, 12-hour and 24-hour kick-offs, match durations and the pitch perimeter.", group: "think" },
  { title: "Chart Champions", emoji: "\u{1F4CA}", file: "chart-champions.html", ages: "7–9", blurb: "Real league titles and skyscraper skylines as bar charts, pictograms and tables. Read the scale, tap the right bar.", group: "think" },
  { title: "Match Day Money", emoji: "\u{1F4B7}", file: "match-day-money.html", ages: "5–8", blurb: "Making change and adding up, in pounds and dollars.", group: "think" },
  { title: "League Table Detective", emoji: "\u{1F50D}", file: "league-table-detective.html", ages: "6–10", blurb: "Read a real league table: points, point difference and bar charts.", group: "think" },

  { title: "Offside or Onside?", emoji: "\u{1F6A9}", file: "offside-or-onside.html", ages: "7–10", blurb: "Football: spot the offside, and see how the rule changed.", group: "rules" },
  { title: "How's That?", emoji: "\u{1F3CF}", file: "hows-that.html", ages: "7–10", blurb: "Cricket: spot the dismissal and learn LBW.", group: "rules" },
  { title: "Ball or Strike?", emoji: "\u{26BE}", file: "ball-or-strike.html", ages: "7–10", blurb: "Baseball: call the strike zone and the basics.", group: "rules" },
  { title: "Catch or No Catch?", emoji: "\u{1F3C8}", file: "catch-or-no-catch.html", ages: "7–10", blurb: "NFL: make the catch ruling and learn the basics.", group: "rules" },
  { title: "Where's the Music From?", emoji: "\u{1F3B5}", file: "music-from.html", ages: "9+", blurb: "Match famous bands and singers to the city they came from.", group: "older" },
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
  const learn = GAMES.filter((g) => g.group === "learn");
  const civics = GAMES.filter((g) => g.group === "civics");
  const think = GAMES.filter((g) => g.group === "think");
  const rules = GAMES.filter((g) => g.group === "rules");
  const older = GAMES.filter((g) => g.group === "older");
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "96px 20px 40px" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#16324f", marginBottom: 6 }}>
        Play &amp; Learn
      </h1>
      <p style={{ color: "#5b7b97", maxWidth: 680, lineHeight: 1.5 }}>
        Free learning games for younger fans, built from our data and mapped to the primary curriculum:
        the seven continents and five oceans, capital cities, ancient civilisations, the world's teams and
        more. Picture and sound first, made to be played. For ages 5 to 10.
      </p>

      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16324f", marginTop: 30 }}>
        🌍 Learn &amp; Play
      </h2>
      <p style={{ color: "#5b7b97", fontSize: ".95rem", margin: "4px 0 0" }}>
        Geography, history and the wider world, through real countries, empires and teams.
      </p>
      <Grid games={learn} />

      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16324f", marginTop: 34 }}>
        🏛️ Who Runs the Country?
      </h2>
      <p style={{ color: "#5b7b97", fontSize: ".95rem", margin: "4px 0 0" }}>
        Presidents, Prime Ministers, Kings and Queens: how America and Britain are run, with real leaders from history.
      </p>
      <Grid games={civics} />

      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16324f", marginTop: 34 }}>
        🔢 Count &amp; Think
      </h2>
      <p style={{ color: "#5b7b97", fontSize: ".95rem", margin: "4px 0 0" }}>
        A full Year 3 and Year 4 maths workout: place value, times tables, fractions, shapes, time and charts, built from real teams, stadiums and skylines. Every new game has a ⭐ Year 3 and 🌟 Year 4 level.
      </p>
      <Grid games={think} />

      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16324f", marginTop: 34 }}>
        🟨 Be the Ref
      </h2>
      <p style={{ color: "#5b7b97", fontSize: ".95rem", margin: "4px 0 0" }}>
        Make the call, and learn the rules of each sport by judging real situations.
      </p>
      <Grid games={rules} />

      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16324f", marginTop: 34 }}>
        🎧 For older fans
      </h2>
      <p style={{ color: "#5b7b97", fontSize: ".95rem", margin: "4px 0 0" }}>
        A little trickier, and pitched at grown-ups and older kids.
      </p>
      <Grid games={older} />

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
          Go deeper on football, the NFL, cricket and baseball: the signature-rule labs, the full laws,
          real officiating calls, and how the rules changed. Kids and adults modes.
        </div>
      </a>
    </main>
  );
}
