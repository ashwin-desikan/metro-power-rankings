// Years worth landing on, and the reason each one is worth landing on.
//
// 🔴 THE PAGE OPENS ON A RANDOM ONE OF THESE, NOT A RANDOM NUMBER. Ashwin,
// 2026-08-14: it should be fun to arrive at. A uniform draw from 1500-2026
// lands on 1732 half the time, and 1732 gives you a board with nothing on it
// and no reason to care. Every year here has something happening in at least
// three of the site's boards, so a cold open always has a story in it.
//
// The `why` is the point as much as the year is. A chip reading "1969" is a
// number; a chip reading "1969 · Moon landing" is an invitation.

export type NotableYear = { year: number; why: string };

export const NOTABLE_YEARS: NotableYear[] = [
  { year: 1815, why: "Waterloo" },
  { year: 1863, why: "Gettysburg" },
  { year: 1889, why: "The Eiffel Tower opens" },
  { year: 1901, why: "The Victorian age ends" },
  { year: 1912, why: "The Titanic sinks" },
  { year: 1914, why: "The world goes to war" },
  { year: 1929, why: "Wall Street crashes" },
  { year: 1939, why: "War again" },
  { year: 1945, why: "The war ends" },
  { year: 1953, why: "Everest, and a coronation" },
  { year: 1963, why: "Dallas" },
  { year: 1966, why: "England win the World Cup" },
  { year: 1969, why: "The Moon landing" },
  { year: 1977, why: "Star Wars, and Elvis dies" },
  { year: 1980, why: "The Miracle on Ice" },
  { year: 1989, why: "The Wall comes down" },
  { year: 1991, why: "The Soviet Union ends" },
  { year: 1992, why: "The Dream Team" },
  { year: 1994, why: "Mandela, and Pulp Fiction" },
  { year: 1997, why: "Hong Kong goes back" },
  { year: 2001, why: "September" },
  { year: 2008, why: "The crash, and Beijing" },
  { year: 2012, why: "London" },
  { year: 2020, why: "The year everything stopped" },
];

/** A random notable year. Server-side, so every cold arrival differs. */
export function randomNotableYear(): NotableYear {
  return NOTABLE_YEARS[Math.floor(Math.random() * NOTABLE_YEARS.length)];
}

/** The blurb for a year, when it happens to be one of the notable ones. */
export function whyThisYear(year: number): string | null {
  return NOTABLE_YEARS.find((y) => y.year === year)?.why ?? null;
}
