import { NextResponse } from "next/server";
import { getMlbSim } from "@/lib/mlbSim";

// Plain-text season table for anyone who wants the numbers without scraping
// the HTML - linked from the "Get the data" line on /predictions/mlb.
// Same ISR window as the page itself.

export const revalidate = 21600;

const COLUMNS = [
  "team",
  "league",
  "division",
  "rating",
  "exp_wins",
  "wins_p10",
  "wins_p90",
  "p_division",
  "p_playoffs",
  "p_bye",
  "p_pennant",
  "p_ws",
  "band",
] as const;

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const sim = await getMlbSim();
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
          case "league":
            return csvField(r.league);
          case "division":
            return csvField(r.division);
          case "rating":
            return csvField(r.rating);
          case "exp_wins":
            return csvField(r.exp_wins);
          case "wins_p10":
            return csvField(r.wins_p10);
          case "wins_p90":
            return csvField(r.wins_p90);
          case "p_division":
            return csvField(r.p_division);
          case "p_playoffs":
            return csvField(r.p_playoffs);
          case "p_bye":
            return csvField(r.p_bye);
          case "p_pennant":
            return csvField(r.p_pennant);
          case "p_ws":
            return csvField(r.p_ws);
          case "band":
            return csvField(r.band);
          default:
            return "";
        }
      }).join(","),
    );
  }

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="mlb-2026-predictions.csv"',
    },
  });
}
