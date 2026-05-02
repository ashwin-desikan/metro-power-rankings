// 🎲 Random metro route. Picks a tier-weighted random pick so the dice
// surface interesting metros most rolls and only occasionally drops a
// reader on a long-tail entry. Server route returns a 307 redirect.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAllMetros } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const metros = getAllMetros();
  if (metros.length === 0) {
    return new NextResponse("No metros available", { status: 503 });
  }

  // Tier-weighted pick:
  //   50% from top 100 (high-quality picks)
  //   30% from rank 101-500
  //   20% from rank 501+
  // Falls back gracefully if any band is empty.
  const top100 = metros.filter((m) => m.rank > 0 && m.rank <= 100);
  const mid = metros.filter((m) => m.rank > 100 && m.rank <= 500);
  const tail = metros.filter((m) => m.rank > 500);

  const roll = Math.random();
  let pool = top100;
  if (roll >= 0.5 && roll < 0.8 && mid.length > 0) pool = mid;
  else if (roll >= 0.8 && tail.length > 0) pool = tail;
  if (pool.length === 0) pool = metros;

  const pick = pool[Math.floor(Math.random() * pool.length)];

  const url = req.nextUrl.clone();
  url.pathname = `/rankings/${pick.slug}`;
  url.search = "";
  return NextResponse.redirect(url, { status: 307 });
}
