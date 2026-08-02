import "server-only";
import fs from "fs";
import path from "path";

// Single source of truth for the completed-season club-football hub list.
// The SLUGS come from football-trends.json (built by scripts/uefa/build_trends.py
// from every public/data/football/hub-*.json), so dropping in a new season hub
// and rerunning trends automatically extends BOTH /teams/football's "Past
// seasons" browser and /teams/football/seasons — no hand-maintained arrays.
// The NOTES are editorial colour keyed by slug; a season without one simply
// renders without a tooltip (add the line when the story is worth telling).

export type SeasonEntry = { slug: string; note: string };

const NOTES: Record<string, string> = {
  "2025-26": "Champions League: Paris Saint-Germain",
  "2024-25": "Champions League: Paris Saint-Germain · Club World Cup: Chelsea",
  "2023-24": "Champions League: Real Madrid",
  "2022-23": "The treble: Manchester City",
  "2021-22": "Champions League: Real Madrid",
  "2020-21": "Champions League: Chelsea · Club World Cup: Bayern Munich",
  "2019-20": "The treble: Bayern Munich",
  "2018-19": "Champions League: Liverpool",
  "2017-18": "Champions League: Real Madrid",
  "2016-17": "Champions League: Real Madrid",
  "2015-16": "Champions League: Real Madrid",
  "2014-15": "The treble: Barcelona",
  "2013-14": "Champions League: Real Madrid · La Décima",
  "2012-13": "Champions League: Bayern Munich · all-German final",
  "2011-12": "Champions League: Chelsea",
  "2010-11": "Champions League: Barcelona",
  "2009-10": "Champions League: Internazionale · treble",
  "2008-09": "Champions League: Barcelona · treble",
  "2007-08": "Champions League: Manchester United",
  "2006-07": "Champions League: AC Milan",
  "2005-06": "Champions League: Barcelona · La Liga & Europe double",
  "2004-05": "Champions League: Liverpool · the Miracle of Istanbul",
  "2003-04": "Champions League: FC Porto · Valencia's La Liga & UEFA Cup double",
  "2002-03": "Champions League: AC Milan · all-Italian final vs Juventus",
  "2001-02": "Champions League: Real Madrid · La Novena, Zidane's volley",
  "2000-01": "Champions League: Bayern Munich · UEFA Cup: Liverpool",
  "1999-00": "Champions League: Real Madrid · first FIFA Club World Championship: Corinthians",
  "1998-99": "The treble: Manchester United · last Cup Winners' Cup: Lazio",
  "1997-98": "Champions League: Real Madrid · La Séptima",
  "1996-97": "Champions League: Borussia Dortmund",
  "1995-96": "Champions League: Juventus",
  "1994-95": "Champions League: Ajax",
  "1993-94": "Champions League: AC Milan · 4-0 in the final",
  "1992-93": "Champions League: Marseille · the first Champions League",
  "1991-92": "European Cup: FC Barcelona",
  "1990-91": "European Cup: Red Star Belgrade",
  "1989-90": "European Cup: AC Milan",
  "1988-89": "European Cup: AC Milan",
  "1987-88": "European Cup: PSV Eindhoven",
  "1986-87": "European Cup: FC Porto",
  "1985-86": "European Cup: Steaua Bucureşti",
  "1984-85": "European Cup: Juventus",
  "1983-84": "European Cup: Liverpool",
  "1982-83": "European Cup: Hamburger SV",
  "1981-82": "European Cup: Aston Villa",
  "1980-81": "European Cup: Liverpool",
  "1979-80": "European Cup: Nottingham Forest",
  "1978-79": "European Cup: Nottingham Forest",
  "1977-78": "European Cup: Liverpool",
  "1976-77": "European Cup: Liverpool",
  "1975-76": "European Cup: Bayern Munich",
  "1974-75": "European Cup: Bayern Munich",
  "1973-74": "European Cup: Bayern Munich",
  "1972-73": "European Cup: Ajax",
  "1971-72": "European Cup: Ajax",
  "1970-71": "European Cup: Ajax",
  "1969-70": "European Cup: Feyenoord",
  "1968-69": "European Cup: AC Milan",
  "1967-68": "European Cup: Manchester United",
  "1966-67": "European Cup: Celtic",
  "1965-66": "European Cup: Real Madrid",
  "1964-65": "European Cup: Internazionale",
  "1963-64": "European Cup: Internazionale",
  "1962-63": "European Cup: AC Milan",
  "1961-62": "European Cup: Benfica",
  "1960-61": "European Cup: Benfica",
  "1959-60": "European Cup: Real Madrid",
};

/** Completed-season hub slugs, newest first, from the trends dataset. */
export function getPastSeasons(): SeasonEntry[] {
  const trends = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public", "data", "football", "football-trends.json"),
      "utf-8",
    ),
  ) as { seasons: string[] };
  return trends.seasons
    .slice()
    .sort()
    .reverse()
    .map((slug) => ({ slug, note: NOTES[slug] ?? "" }));
}
