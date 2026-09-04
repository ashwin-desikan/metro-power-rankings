import { NextResponse } from "next/server";
import { getUclSim } from "@/lib/uclSim";

// Plain-text league-phase table for anyone who wants the numbers without
// scraping the HTML - linked from the "Get the data" line on /predictions/ucl.
// The other four hubs have had one of these since the CSV routes landed; the
// Champions League was the newest hub and never got one. Same ISR window as
// the page itself.

export const revalidate = 21600;

const COLUMNS = [
  "club",
  "country",
  "exp_pts",
  "finish_p5",
  "finish_p50",
  "finish_p95",
  "p_top8",
  "p_top24",
  "p_r16",
  "p_qf",
  "p_sf",
  "p_final",
  "p_champion",
] as const;

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const sim = await getUclSim();
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
          case "country":
            return csvField(r.country);
          case "exp_pts":
            return csvField(r.exp_pts);
          case "finish_p5":
            return csvField(r.pos.p5);
          case "finish_p50":
            return csvField(r.pos.p50);
          case "finish_p95":
            return csvField(r.pos.p95);
          case "p_top8":
            return csvField(r.p_top8);
          case "p_top24":
            return csvField(r.p_top24);
          case "p_r16":
            return csvField(r.p_r16);
          case "p_qf":
            return csvField(r.p_qf);
          case "p_sf":
            return csvField(r.p_sf);
          case "p_final":
            return csvField(r.p_final);
          case "p_champion":
            return csvField(r.p_champion);
          default:
            return "";
        }
      }).join(","),
    );
  }

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="ucl-2026-27-predictions.csv"',
    },
  });
}
