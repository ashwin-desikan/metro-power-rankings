import Link from "next/link";
import { getNflSim, getNflSimHistory, type NflSimRow } from "@/lib/nflSim";
import { getCfbSim, getCfbSimHistory, type CfbSimRow } from "@/lib/cfbSim";
import { getMlbSim, getMlbSimHistory, type MlbSimRow } from "@/lib/mlbSim";
import { getPlSim, getPlSimHistory, type PlSimRow } from "@/lib/plSim";
import { MONO } from "./ui";
import { Delta } from "./Delta";
import { deltaSince } from "./deltas";

// "Movers this week" strip for the /predictions index: one row per league
// whose history file carries at least two snapshots, showing the team with
// the largest absolute 7-day swing in title probability. Reads through the
// SAME lib getters each league hub already uses (see deltas.ts's note on
// each league's own history row shape).

type MoverRow = {
  league: string;
  leagueHref: string;
  name: string;
  pct: number;
  delta: number;
};

function pct(x: number): string {
  if (x >= 99.95) return ">99.9%";
  if (x > 0 && x < 0.05) return "<0.1%";
  return `${Math.round(x * 10) / 10}%`;
}

async function nflMover(): Promise<MoverRow | null> {
  const [sim, history] = await Promise.all([getNflSim(), getNflSimHistory()]);
  const rows = sim?.table ?? [];
  if (!history || history.snapshots.length < 2 || rows.length === 0) return null;
  let best: { r: NflSimRow; d: number } | null = null;
  for (const r of rows) {
    const d = deltaSince(history, r.slug, "title", 7);
    if (d == null) continue;
    if (!best || Math.abs(d) > Math.abs(best.d)) best = { r, d };
  }
  if (!best) return null;
  return { league: "NFL", leagueHref: "/predictions/nfl", name: best.r.name, pct: best.r.p_sb, delta: best.d };
}

async function cfbMover(): Promise<MoverRow | null> {
  const [sim, history] = await Promise.all([getCfbSim(), getCfbSimHistory()]);
  const rows = sim?.table ?? [];
  if (!history || history.snapshots.length < 2 || rows.length === 0) return null;
  let best: { r: CfbSimRow; d: number } | null = null;
  for (const r of rows) {
    if (!r.slug) continue;
    const d = deltaSince(history, r.slug, "title", 7);
    if (d == null) continue;
    if (!best || Math.abs(d) > Math.abs(best.d)) best = { r, d };
  }
  if (!best) return null;
  return { league: "CFB", leagueHref: "/predictions/cfb", name: best.r.name, pct: best.r.p_natty, delta: best.d };
}

async function mlbMover(): Promise<MoverRow | null> {
  const [sim, history] = await Promise.all([getMlbSim(), getMlbSimHistory()]);
  const rows = sim?.table ?? [];
  if (!history || history.snapshots.length < 2 || rows.length === 0) return null;
  let best: { r: MlbSimRow; d: number } | null = null;
  for (const r of rows) {
    const d = deltaSince(history, r.canonical, "title", 7);
    if (d == null) continue;
    if (!best || Math.abs(d) > Math.abs(best.d)) best = { r, d };
  }
  if (!best) return null;
  return { league: "MLB", leagueHref: "/predictions/mlb", name: best.r.name, pct: best.r.p_ws, delta: best.d };
}

async function plMover(): Promise<MoverRow | null> {
  const [sim, history] = await Promise.all([getPlSim(), getPlSimHistory()]);
  const rows = sim?.table ?? [];
  if (!history || history.snapshots.length < 2 || rows.length === 0) return null;
  let best: { r: PlSimRow; d: number } | null = null;
  for (const r of rows) {
    const d = deltaSince(history, r.slug, "title", 7);
    if (d == null) continue;
    if (!best || Math.abs(d) > Math.abs(best.d)) best = { r, d };
  }
  if (!best) return null;
  return { league: "PL", leagueHref: "/predictions/pl", name: best.r.name, pct: best.r.p_title, delta: best.d };
}

// Each row links to its league hub, not the team's own page, so a reader
// who taps a mover lands on the board that explains the number.
export async function Movers() {
  const results = await Promise.all([nflMover(), cfbMover(), mlbMover(), plMover()]);
  const rows = results.filter((r): r is MoverRow => r != null).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
  if (rows.length === 0) return null;

  return (
    <section id="movers" className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
      <h2 className="text-2xl font-bold mb-1">Movers this week</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        The biggest 7-day swings in title odds, across every hub with a week of history.
      </p>
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={`${r.league}-${r.name}`} className="flex min-w-0 items-center gap-3">
            <Link
              href={r.leagueHref}
              className="inline-flex min-h-[44px] min-w-0 flex-1 items-center truncate font-semibold hover:text-[var(--accent)] transition-colors"
            >
              {r.name}
            </Link>
            <span
              className="text-[10px] uppercase tracking-widest flex-shrink-0"
              style={{ ...MONO, color: "var(--text-dim)" }}
            >
              {r.league}
            </span>
            <span className="text-[13px] font-bold flex-shrink-0" style={{ ...MONO, color: "var(--accent)" }}>
              {pct(r.pct)}
            </span>
            <span className="flex-shrink-0">
              <Delta value={r.delta} unit="pp" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
