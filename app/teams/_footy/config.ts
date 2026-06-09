export type FootyLeague = "afl" | "nrl";

export type FootyCopy = {
  league: FootyLeague;
  code: string;            // "AFL" / "NRL"
  fullName: string;        // hub h1
  eyebrow: string;         // "Australian rules football · Australia"
  blurb: string;
  premierWord: string;     // "Premiership" / "Premiership"
  premiersWord: string;    // "Premiers"
  minorWord: string;       // "Minor Premiership"
  ladderWord: string;      // "Ladder"
};

export const FOOTY: Record<FootyLeague, FootyCopy> = {
  afl: {
    league: "afl",
    code: "AFL",
    fullName: "Australian Football League",
    eyebrow: "Australian rules football · Australia",
    blurb:
      "Eighteen clubs contest the VFL/AFL premiership, decided each September by a Grand Final at the MCG. This portal covers every club since the league's first season in 1897, with all-time honours, season-by-season ladders, and the full Grand Final roll.",
    premierWord: "Premiership",
    premiersWord: "Premiers",
    minorWord: "Minor Premiership",
    ladderWord: "Ladder",
  },
  nrl: {
    league: "nrl",
    code: "NRL",
    fullName: "National Rugby League",
    eyebrow: "Rugby league · Australia & New Zealand",
    blurb:
      "The NSWRL/ARL/NRL premiership has been contested since 1908, decided by a Grand Final since 1954. This portal covers every club across the competition's history, with all-time honours, season-by-season ladders, and the full Grand Final roll.",
    premierWord: "Premiership",
    premiersWord: "Premiers",
    minorWord: "Minor Premiership",
    ladderWord: "Ladder",
  },
};
