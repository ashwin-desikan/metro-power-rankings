import type { Col } from "../sound/SortTable";
import type { ScreenPerson } from "@/lib/screen";

// Column definitions shared across the /screen tabs.

export const peopleCols: Col[] = [
  { key: "rank", label: "#", kind: "rank" },
  { key: "name", label: "Name", bold: true },
  { key: "metroName", label: "Metro", kind: "smetro", metroSlugKey: "metro" },
  { key: "country", label: "Country", kind: "scountry", slugKey: "countrySlug" },
  { key: "combined", label: "Score", align: "right", numeric: true },
  { key: "film", label: "Box office", align: "right", numeric: true },
  { key: "prestige", label: "Prestige", align: "right", numeric: true },
  { key: "audience", label: "Audience", align: "right", numeric: true },
  { key: "wins", label: "Wins", align: "right", numeric: true },
  { key: "noms", label: "Noms", align: "right", numeric: true },
];

export const directorCols: Col[] = [
  { key: "rank", label: "#", kind: "rank" },
  { key: "name", label: "Director", bold: true },
  { key: "metroName", label: "Metro", kind: "smetro", metroSlugKey: "metro" },
  { key: "combined", label: "Score", align: "right", numeric: true },
  { key: "directed", label: "Top-grossers", align: "right", numeric: true },
  { key: "wins", label: "Wins", align: "right", numeric: true },
];

export const personRow = (p: ScreenPerson) => ({
  name: p.name,
  metroName: p.metroName ?? "—",
  metro: p.metro,
  country: p.country ?? "—",
  countrySlug: p.countrySlug ?? null,
  combined: p.combined,
  film: p.film,
  prestige: p.prestige,
  audience: p.audience,
  wins: p.wins,
  noms: p.noms,
  directed: p.directed,
});
