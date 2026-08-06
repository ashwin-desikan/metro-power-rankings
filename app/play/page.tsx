import type { Metadata } from "next";
import PlayBrowser, { type Game } from "./PlayBrowser";

export const metadata: Metadata = {
  title: "Play & Learn",
  description:
    "Free learning games built from the Citizen of Nowhere data: capitals and flags, empires and leaders, real finals across five sports, big-number maths, and the logic behind coding. Filter by challenge level and topic. For ages 5 to 10.",
  alternates: { canonical: "/play" },
};

// level: 1 = ⭐ starter · 2 = 🌟 skilled · 3 = 🚀 expert-capable (ceiling, not floor)
// retired: little-kids tier — archive section only
const GAMES: Game[] = [
  // ---- Learn & Play
  { title: "Penalty Shootout!", emoji: "\u{26BD}", file: "penalty-shootout.html", ages: "6–9", blurb: "Answer to take your shot: badges, flags and capital cities. Score five goals to win the cup!", group: "learn", level: 1, topics: ["geography", "sports"] },
  { title: "Crest Sort", emoji: "\u{1F6E1}\u{FE0F}", file: "crest-sort.html", ages: "5–9", blurb: "Sort real club badges into the country each club plays in.", group: "learn", level: 1, topics: ["sports", "geography"] },
  { title: "Flag Flash", emoji: "\u{1F6A6}", file: "flag-flash.html", ages: "5–9", blurb: "Tap the right flag before the timer runs out. How long can your streak burn?", group: "learn", level: 2, topics: ["geography"] },
  { title: "Champions Duel", emoji: "\u{1F3C6}", file: "champions-duel.html", ages: "6–10", blurb: "459 real finals across EIGHT competitions: Champions League, World Cup, Euros, Super Bowl, NBA Finals, World Series and the Stanley Cup. Tap the winner!", group: "learn", level: 2, topics: ["sports", "history-civics"] },
  { title: "Then & Now", emoji: "\u{1F5FA}\u{FE0F}", file: "then-and-now.html", ages: "6–10", blurb: "Tap the country that sits on an ancient empire's land today, and travel through time. Ancient Egypt, Greece, Rome and more.", group: "learn", level: 2, topics: ["history-civics", "geography"] },
  { title: "Capital Match", emoji: "\u{1F3D9}\u{FE0F}", file: "capital-match.html", ages: "5–8", blurb: "Match countries to capital cities. Pick a Quick trip of 8, or the full Grand tour.", group: "learn", level: 2, topics: ["geography"] },
  { title: "Champions", emoji: "\u{1F3C5}", file: "champions.html", ages: "6–10", blurb: "Which sport is each nation best at in the world? 🚀 Expert flips the question, adds odd-one-out logic and widens the choices.", group: "learn", level: 3, topics: ["sports", "geography"] },
  { title: "Big Rivals", emoji: "\u{1F525}", file: "big-rivals.html", ages: "7–10", blurb: "Spot each team's greatest rival, from El Clásico to the Old Firm.", group: "learn", level: 2, topics: ["sports"] },
  { title: "Find the Team's Home", emoji: "\u{1F50E}", file: "find-the-teams-home.html", ages: "5–9", blurb: "Match real clubs to their home city, country or continent.", group: "learn", level: 2, topics: ["sports", "geography"] },
  { title: "North or South?", emoji: "\u{1F9ED}", file: "north-or-south.html", ages: "6–10", blurb: "Is this team's city north or south of the equator?", group: "learn", level: 2, topics: ["geography", "sports"] },
  { title: "Odd One Out", emoji: "\u{1F914}", file: "odd-one-out.html", ages: "6–10", blurb: "Three teams, one impostor: spot which doesn't belong and say why.", group: "learn", level: 2, topics: ["sports"] },
  { title: "Trophy Count", emoji: "\u{1F3C6}", file: "trophy-count.html", ages: "6–9", blurb: "Who has won more league titles? Real trophy cabinets, compared.", group: "learn", level: 2, topics: ["sports"] },

  // ---- Who Runs the Country?
  { title: "Who's the Boss?", emoji: "\u{1F3DB}\u{FE0F}", file: "whos-the-boss.html", ages: "6–10", blurb: "President, Prime Minister or King: whose job is it? America and Britain run things very differently.", group: "civics", level: 2, topics: ["history-civics"] },
  { title: "Leader Time Machine", emoji: "\u{1F570}\u{FE0F}", file: "leader-time-machine.html", ages: "7–10", blurb: "Real Presidents, Prime Ministers and monarchs: who came first, who was in charge, and who ruled at the same time.", group: "civics", level: 3, topics: ["history-civics"] },
  { title: "US or UK?", emoji: "\u{1F5FD}", file: "us-or-uk.html", ages: "6–10", blurb: "50 states or 4 nations? Congress or Parliament? Sort each one to the right flag, and mind the tricky ones.", group: "civics", level: 2, topics: ["history-civics"] },

  // ---- Count & Think
  { title: "Stadium Stacker", emoji: "\u{1F3DF}\u{FE0F}", file: "stadium-stacker.html", ages: "7–10", blurb: "Build match-day crowds from hundreds, tens and ones, then take the \u{1F680} Expert level: place value in the MILLIONS on real metro populations, order five cities, count through zero.", group: "think", level: 3, topics: ["maths", "sports"] },
  { title: "Big Match Adder", emoji: "➕", file: "big-match-adder.html", ages: "7–10", blurb: "Add and subtract crowds like a club accountant: estimate first, type the exact answer, prove it with the inverse check. \u{1F680} Expert brings five-digit crowds and missing-number puzzles.", group: "think", level: 3, topics: ["maths", "sports"] },
  { title: "Times-Table Striker", emoji: "✖\u{FE0F}", file: "times-table-striker.html", ages: "7–10", blurb: "Times tables through three-pointers, cricket fours and rowing eights. \u{1F680} Expert adds remainders, missing numbers and 2-digit×2-digit, and ⚡ Blitz gives you 60 seconds to set a record.", group: "think", level: 3, topics: ["maths", "sports"] },
  { title: "Fraction Football", emoji: "\u{1F355}", file: "fraction-football.html", ages: "7–9", blurb: "Shade fractions of the pitch, read possession bars, and find tenths on the goal-line.", group: "think", level: 2, topics: ["maths", "sports"] },
  { title: "Shape & Flag Lab", emoji: "\u{1F4D0}", file: "shape-flag-lab.html", ages: "7–9", blurb: "Fold real flags to test symmetry, judge corner-kick angles, and spot parallel and perpendicular lines on the pitch.", group: "think", level: 2, topics: ["maths", "geography"] },
  { title: "Kick-Off Clock", emoji: "\u{1F570}\u{FE0F}", file: "kickoff-clock.html", ages: "7–9", blurb: "Stadium clocks with Roman numerals, 12-hour and 24-hour kick-offs, match durations and the pitch perimeter.", group: "think", level: 2, topics: ["maths", "sports"] },
  { title: "Chart Champions", emoji: "\u{1F4CA}", file: "chart-champions.html", ages: "7–10", blurb: "Real league titles and skyscraper skylines as bar charts, pictograms and tables. 🚀 Expert reads real city scales: hundreds of skyscrapers, millions of people on the axis.", group: "think", level: 3, topics: ["maths", "sports"] },
  { title: "League Table Detective", emoji: "\u{1F50D}", file: "league-table-detective.html", ages: "6–10", blurb: "Read a real league table: points, point difference and bar charts.", group: "think", level: 2, topics: ["maths", "sports"] },
  { title: "How Many Times Bigger?", emoji: "\u{1F4CF}", file: "times-bigger.html", ages: "7–10", blurb: "Ratio and estimation with real city data: compare, then divide — and watch out for level 3, where more people doesn't mean more money.", group: "think", level: 3, topics: ["maths", "geography"] },

  // ---- Think Like a Coder
  { title: "In the Club", emoji: "\u{1F9E9}", file: "in-the-club.html", ages: "7–10", blurb: "AND, OR and NOT with the world's real clubs: the UN, EU, NATO, G7 and more. Set logic in disguise — the thinking behind every line of code.", group: "coder", level: 3, topics: ["logic-coding", "geography"] },
  { title: "Higher or Lower", emoji: "\u{1F3AF}", file: "higher-or-lower.html", ages: "7–10", blurb: "Hunt a hidden number on the number line in as few guesses as you can. Split the middle every time and you've invented binary search.", group: "coder", level: 3, topics: ["logic-coding", "maths"] },
  { title: "Champion Challenge", emoji: "\u{1F3C6}", file: "champion-challenge.html", ages: "7–10", blurb: "The decathlon: the hardest questions from across the arcade in one run, ramping from warm-up to expert.", group: "coder", level: 3, topics: ["logic-coding", "sports", "geography"] },

  // ---- Be the Ref
  { title: "Offside or Onside?", emoji: "\u{1F6A9}", file: "offside-or-onside.html", ages: "7–10", blurb: "You\u2019re the linesman: read the freeze-frame against the last defender and raise the flag. The yellow line proves every call.", group: "rules", level: 2, topics: ["rules", "sports"] },
  { title: "How's That?", emoji: "\u{1F3CF}", file: "hows-that.html", ages: "7–10", blurb: "HOWZAT?! Watch the delivery, raise the finger or shake it off, then let the DRS-style ball-tracking prove your call. Bowled, caught behind, LBW and the outside-leg rule.", group: "rules", level: 2, topics: ["rules", "sports"] },
  { title: "Ball or Strike?", emoji: "\u{26BE}", file: "ball-or-strike.html", ages: "7–10", blurb: "You\u2019re the umpire behind the plate: watch each pitch fly in and call the zone \u2014 corners and edges count. Three strikes is an out, four balls a walk.", group: "rules", level: 2, topics: ["rules", "sports"] },
  { title: "Catch or No Catch?", emoji: "\u{1F3C8}", file: "catch-or-no-catch.html", ages: "7–10", blurb: "Sideline freeze-frames: two feet in, toe-taps, a foot on the line, bobbles and surviving the ground. Rule it like an NFL referee.", group: "rules", level: 2, topics: ["rules", "sports"] },

  // ---- Older fans
  { title: "Where's the Music From?", emoji: "\u{1F3B5}", file: "music-from.html", ages: "9+", blurb: "Match famous bands and singers to the city they came from.", group: "older", level: 2, topics: ["music", "geography"] },

  // ---- Retired to the little kids corner (archive only)
  { title: "Flag Sort", emoji: "\u{1F30D}", file: "flag-sort.html", ages: "5–8", blurb: "Sort each flag into its continent: the world's seven continents.", group: "learn", level: 1, topics: ["geography"], retired: true },
  { title: "Crest Match", emoji: "\u{1F6E1}\u{FE0F}", file: "crest-match.html", ages: "5–9", blurb: "A memory game with real club badges, and the city each team calls home.", group: "learn", level: 1, topics: ["sports"], retired: true },
  { title: "World Sports Tour", emoji: "\u{1F30F}", file: "world-sports-tour.html", ages: "5–8", blurb: "Tour real sporting cities: continents, money, reading and counting.", group: "learn", level: 1, topics: ["sports", "geography"], retired: true },
  { title: "Match Day Money", emoji: "\u{1F4B7}", file: "match-day-money.html", ages: "5–8", blurb: "Making change and adding up, in pounds and dollars.", group: "think", level: 1, topics: ["maths"], retired: true },
];

export default function PlayHub() {
  return <PlayBrowser games={GAMES} />;
}
