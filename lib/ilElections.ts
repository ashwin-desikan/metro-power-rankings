import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type IlElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type IlElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: IlElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null; // Yishuv assemblies and the 2001 PM-only vote
};
export type IlElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: IlElection[];
};

// ---------------- loader ----------------
let _core: IlElectionsFile | null = null;
export function getIlElections(): IlElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "il-elections.json"), "utf-8"),
  ) as IlElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Israeli party colors; names always accompany the color.
const P: Record<string, string> = {
  Likud: "#2A5BAA", "Likud Beytenu": "#2A5BAA", Herut: "#2A5BAA", Gahal: "#3D6CB0",
  Mapai: "#E4032E", Labor: "#E4032E", "Labor Party": "#E4032E", Alignment: "#E4032E",
  "Israeli Labor Party": "#E4032E", "One Israel": "#E4032E", "Labor-Gesher": "#E4032E",
  Mapam: "#C1121F", "Ahdut HaAvoda": "#B23A48", Rafi: "#D46A6A",
  "Yesh Atid": "#19A2DE", Kadima: "#F5A623", "Blue and White": "#0F52BA",
  "Blue & White": "#0F52BA", "Kahol Lavan": "#0F52BA",
  Shas: "#4B4B55", "United Torah Judaism": "#5A5A66", "Agudat Yisrael": "#5A5A66",
  "Torah Religious Front": "#5A5A66", "United Religious Front": "#6D6D78",
  Meretz: "#00A652", Ratz: "#00A652", "The New Right": "#1B4C7C",
  "National Religious Party": "#7C9C3B", Mafdal: "#7C9C3B", "Jewish Home": "#7C9C3B",
  "Religious Zionism": "#6D5410", "Religious Zionism-Otzma Yehudit": "#6D5410", "Otzma Yehudit": "#6D5410",
  "Yisrael Beiteinu": "#1B4C7C", "Yisrael BaAliyah": "#3E5C76",
  "Joint List": "#2E8B57", Hadash: "#C1121F", "Ra'am": "#009B77", "United Arab List": "#009B77",
  "General Zionists": "#F0A202", "Progressive Party": "#F9C74F", "Liberal Party": "#F9C74F",
  "Independent Liberals": "#F9C74F", "Free Centre": "#748CAB",
  "Democratic Movement for Change": "#38A3A5", Dash: "#38A3A5", Shinui: "#19A2DE",
  Tzomet: "#4E8EC4", Tehiya: "#37517E", Moledet: "#37517E",
  "New Hope": "#3E5C76", Yamina: "#7C9C3B", "Centre Party": "#748CAB", Gil: "#8A8F98",
  "The Third Way": "#8A8F98", "National Unity": "#37517E",
  Herzliya: "#9ca3af", Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function ilPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Likud|Herut/i.test(name)) return "#2A5BAA";
  if (/Labor|Labour|Mapai|Alignment/i.test(name)) return "#E4032E";
  if (/Torah|Aguda|Religious Front|Shas/i.test(name)) return "#5A5A66";
  if (/Religious|HaPoel HaMizrachi|Mizrachi/i.test(name)) return "#7C9C3B";
  if (/Arab|Hadash|Ra'am|Joint/i.test(name)) return "#2E8B57";
  if (/Zionists|Liberal/i.test(name)) return "#F0A202";
  if (/Communist/i.test(name)) return "#A40000";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function ilEraOf(key: string) {
  return getIlElections().eras.find((e) => e.key === key) ?? null;
}
export function ilElectionById(id: string): IlElection | null {
  return getIlElections().elections.find((e) => e.id === id) ?? null;
}
export function ilNeighbours(id: string): { prev: IlElection | null; next: IlElection | null } {
  const els = getIlElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const ilFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-IL"));
export const ilFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives (Knesset elections, 1949 onward).
export type IlElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeIlRecords(): IlElectionRecord[] {
  const els = getIlElections().elections.filter((e) => e.year >= 1949 && e.id !== "2001");
  const recs: IlElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: ilFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} Knesset election` });
    recs.push({ label: "Lowest turnout", value: ilFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} Knesset election` });
  }
  const withSeats = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats ever won", value: ilFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label} — still short of a majority` });
  }
  recs.push({ label: "Majorities won outright", value: "0", electionId: "1949", detail: "no party has ever won 61 of the Knesset's 120 seats" });
  recs.push({ label: "Elections in under four years", value: "5", electionId: "2022", detail: "April 2019 to November 2022, the deadlock cycle" });
  const changes = els.filter((e) => e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  recs.push({
    label: "Changes of PM at the ballot box", value: String(changes.length),
    electionId: changes.length ? changes[changes.length - 1].id : els[els.length - 1].id,
    detail: `most recently ${changes.length ? changes[changes.length - 1].label : "—"}`,
  });
  return recs;
}
