import { NextResponse } from "next/server";
import { getPlSim } from "@/lib/plSim";

// Plain-text season table for anyone who wants the numbers without scraping
// the HTML - linked from the "Get the data" line on /predictions/pl.
// Same ISR window as the page itself.

export const revalidate = 21600;

const COLUMNS = [
  "club",
  "exp_pts",
  "pts_p10",
  "pts_p90",
  "finish_p50",
  "p_title",
  "p_top4",
  "p_top5",
  "p_top7",
  "p_releg",
  "band",
] as const;

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const sim = await getPlSim();
  if (!sim || sim.table.length === 0) {
    return new NextResponse("No data.", { status: 404 });
  }

  const lines = [COLUMNS.join(",")];
  for (const r of sim.table) {
    lines.push(
      COLUMNS.map((col) => {
        switch (col) {
          case "club":
            return csvField(r.name);
          case "exp_pts":
            return csvField(r.exp_pts);
          case "pts_p10":
            return csvField(r.pts_p10);
          case "pts_p90":
            return csvField(r.pts_p90);
          case "finish_p50":
            return csvField(r.pos.p50);
          case "p_title":
            return csvField(r.p_title);
          case "p_top4":
            return csvField(r.p_top4);
          case "p_top5":
            return csvField(r.p_top5);
          case "p_top7":
            return csvField(r.p_top7);
          case "p_releg":
            return csvField(r.p_releg);
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
      "Content-Disposition": 'inline; filename="pl-2026-27-predictions.csv"',
    },
  });
}
