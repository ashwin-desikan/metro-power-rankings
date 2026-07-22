import "server-only";
import fs from "fs";
import path from "path";

// Papal conclaves and elections, 1061–2025. A bespoke shape: conclaves elect
// one man for life by two-thirds of the cardinal electors, so the data model
// is duration, ballots, electors and the pope produced — not parties and seats.

export type Conclave = {
  id: string;
  label: string;
  year: number;
  kind: "conclave" | "election";
  date: string;
  location: string | null;
  days: number | null; // inclusive length of the gathering
  electors: number | null;
  ballots: number | null;
  ballotsNote: string | null; // "Not less than 137"
  pope: string; // regnal name taken
  birthName: string | null;
  predecessor: string | null;
  dean: string | null;
  camerlengo: string | null;
  summary: string;
};
export type VaElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  elections: Conclave[]; // oldest → newest
};

let _core: VaElectionsFile | null = null;
export function getVaElections(): VaElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "va-elections.json"), "utf-8"),
  ) as VaElectionsFile);
}

// Era grouping, computed from the year: the hub tells the story in five acts.
export type VaEra = { key: string; label: string; span: string; blurb: string };
export const VA_ERAS: VaEra[] = [
  {
    key: "modern",
    label: "The modern conclaves",
    span: "1914–2025",
    blurb:
      "Fast, secret and global. Twentieth-century reforms fixed the two-thirds rule, banned royal vetoes and capped electors at cardinals under eighty; the electorate grew from 57 largely Italian cardinals in 1914 to 133 electors from over 70 countries in 2025. No conclave in this era has needed more than five days.",
  },
  {
    key: "papal-states",
    label: "The long nineteenth century",
    span: "1800–1903",
    blurb:
      "Conclaves in the shadow of European power: Pius VII was elected in Venice under Austrian protection while Rome was occupied, Catholic monarchs still wielded a veto — used for the last time against the frontrunner in 1903 — and the 1878 conclave was the first held after the fall of the Papal States.",
  },
  {
    key: "early-modern",
    label: "The early modern conclaves",
    span: "1431–1799",
    blurb:
      "The age of crown factions and marathon deadlocks. France, Spain and the Empire ran organised parties inside the Sistine Chapel; conclaves routinely lasted weeks and sometimes months — 1740 ran half a year, and the century's electors invented the compromise candidate as an art form.",
  },
  {
    key: "schism",
    label: "Conclave law and the Great Schism",
    span: "1276–1417",
    blurb:
      "Gregory X's rules of 1274 — locked doors, dwindling rations — were meant to end years-long vacancies, and mostly did. But Avignon pulled the papacy to France for seven decades, and the disputed election of 1378 split Christendom between two, then three rival popes until the Council of Constance elected Martin V.",
  },
  {
    key: "elections",
    label: "The first papal elections",
    span: "1061–1271",
    blurb:
      "In nomine Domini (1059) took the choice of pope from emperors and Roman mobs and gave it to the cardinals. The elections that followed were often quick and occasionally chaotic — rival claimants, street fighting, and the 33-month deadlock of 1268–71 that provoked the invention of the conclave itself.",
  },
];
export function vaEraKeyOf(year: number): string {
  if (year >= 1914) return "modern";
  if (year >= 1800) return "papal-states";
  if (year >= 1431) return "early-modern";
  if (year >= 1276) return "schism";
  return "elections";
}
export function vaEraOf(year: number): VaEra {
  const k = vaEraKeyOf(year);
  return VA_ERAS.find((e) => e.key === k) as VaEra;
}

export function vaConclaveById(id: string): Conclave | null {
  return getVaElections().elections.find((e) => e.id === id) ?? null;
}
export function vaNeighbours(id: string): { prev: Conclave | null; next: Conclave | null } {
  const els = getVaElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const vaFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));

export function vaDuration(c: Conclave): string {
  if (c.days == null) return "—";
  if (c.days === 1) return "1 day";
  if (c.days < 60) return `${c.days} days`;
  if (c.days < 366) return `${Math.round(c.days / 30.4)} months`;
  return `${(c.days / 365.25).toFixed(1)} years`;
}

export type VaRecord = { label: string; value: string; electionId: string; detail: string };
export function computeVaRecords(): VaRecord[] {
  const els = getVaElections().elections;
  const recs: VaRecord[] = [];
  const longest = els.filter((e) => e.days != null).sort((a, b) => (b.days ?? 0) - (a.days ?? 0))[0];
  if (longest) {
    recs.push({ label: "Longest election ever", value: vaDuration(longest), electionId: longest.id, detail: `${longest.label} — ${longest.pope} emerged only after Viterbo removed the roof and cut the cardinals' rations` });
  }
  recs.push({ label: "Shortest conclave", value: "~10 hours", electionId: "1503-10", detail: "October 1503 — Julius II was elected almost before the doors closed" });
  const mostBallots = els.filter((e) => e.ballots != null).sort((a, b) => (b.ballots ?? 0) - (a.ballots ?? 0))[0];
  if (mostBallots) {
    recs.push({ label: "Most recorded ballots", value: vaFmtInt(mostBallots.ballots), electionId: mostBallots.id, detail: `${mostBallots.label} — ${mostBallots.pope} emerged after ${vaDuration(mostBallots)} of voting` });
  }
  const mostElectors = els.filter((e) => e.electors != null).sort((a, b) => (b.electors ?? 0) - (a.electors ?? 0))[0];
  if (mostElectors) {
    recs.push({ label: "Largest electorate", value: vaFmtInt(mostElectors.electors), electionId: mostElectors.id, detail: `${mostElectors.label} — cardinal electors from more than 70 countries chose ${mostElectors.pope}` });
  }
  recs.push({ label: "Last non-cardinal elected", value: "1378", electionId: "1378", detail: "Bartolomeo Prignano, Archbishop of Bari, became Urban VI — every pope since has been a cardinal, and his disputed election split the Church for 39 years" });
  recs.push({ label: "The council's pope", value: "1417", electionId: "1417", detail: "Martin V, elected at Constance by cardinals plus deputies of the conciliar nations — the vote that ended the Western Schism" });
  recs.push({ label: "Popes produced", value: vaFmtInt(els.length), electionId: "2025", detail: "recorded contests from 1061 to Leo XIV in 2025, plus the pre-1059 selections described below" });
  const y2025 = els[els.length - 1];
  if (y2025) {
    recs.push({ label: "The latest conclave", value: y2025.label, electionId: y2025.id, detail: `${y2025.pope} (${y2025.birthName ?? ""}), elected on the ${y2025.ballots ?? "?"}th ballot by ${y2025.electors ?? "?"} electors` });
  }
  return recs;
}
