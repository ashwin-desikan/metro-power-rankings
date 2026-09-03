import { NextResponse } from "next/server";
import { getCfbSim } from "@/lib/cfbSim";

// Plain-text season table for anyone who wants the numbers without scraping
// the HTML - linked from the "Get the data" line on /predictions/cfb.
// Same ISR window as the page itself.

export const revalidate = 21600;

const COLUMNS = [
  "team",
  "conference",
  "power4",
  "rating",
  "exp_wins",
  "wins_p10",
  "wins_p90",
  "p_ccg",
  "p_conf",
  "p_playoff",
  "p_bye",
  "p_natty",
  "p_bubble",
  "band",
  "ap_rank",
] as const;

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const sim = await getCfbSim();
  if (!sim || sim.table.length === 0) {
    return new NextResponse("No data.", { status: 404 });
  }

  const lines = [COLUMNS.join(",")];
  for (const r of sim.table) {
    lines.push(
      COLUMNS.map((col) => {
        switch (col) {
          case "team":
            return csvField(r.name);
          case "conference":
            return csvField(r.conference);
          case "power4":
            return csvField(r.power4);
          case "rating":
            return csvField(r.rating);
          case "exp_wins":
            return csvField(r.exp_wins);
          case "wins_p10":
            return csvField(r.wins_p10);
          case "wins_p90":
            return csvField(r.wins_p90);
          case "p_ccg":
            return csvField(r.p_ccg);
          case "p_conf":
            return csvField(r.p_conf);
          case "p_playoff":
            return csvField(r.p_playoff);
          case "p_bye":
            return csvField(r.p_bye);
          case "p_natty":
            return csvField(r.p_natty);
          case "p_bubble":
            return csvField(r.p_bubble);
          case "band":
            return csvField(r.band);
          case "ap_rank":
            return csvField(r.ap_rank);
          default:
            return "";
        }
      }).join(","),
    );
  }

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="cfb-2026-predictions.csv"',
    },
  });
}
