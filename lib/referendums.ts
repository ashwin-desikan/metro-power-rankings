import "server-only";
import fs from "fs";
import path from "path";

// Landmark national referendums — a curated companion layer to the election
// hubs. Figures as reported by Wikipedia's referendum articles; managed and
// sham votes carry caveats in the data itself.

export type Referendum = {
  id: string;
  flag: string; // flagcdn code
  country: string;
  year: number;
  date: string;
  name: string;
  result: string; // winning option, e.g. "Leave" | "No" | "Republic"
  resultPct: number | null;
  turnout: number | null;
  outcome: string;
  caveat: string | null;
  hub: string | null; // election hub code where one exists
};
export type ReferendumsFile = {
  meta: { title: string; sources: string[]; built: string; note: string };
  referendums: Referendum[];
};

let _core: ReferendumsFile | null = null;
export function getReferendums(): ReferendumsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "referendums.json"), "utf-8"),
  ) as ReferendumsFile);
}
