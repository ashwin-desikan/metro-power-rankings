import type { ReactNode } from "react";
import { flagCdnUrl } from "@/lib/international-display";
import type { WorldCup2026Bundle } from "@/lib/international";

type KO = WorldCup2026Bundle["knockout"];
type Match = KO[string][number];

// Round-of-32 match order around the wheel, derived from the official feeder map
// (R16 89=(74,77), 90=(73,75), ... -> Final), so adjacent matches are bracket
// siblings and a plain inward binary merge reproduces the real bracket shape.
const LEAF_ORDER = [1, 4, 0, 2, 10, 11, 8, 9, 12, 14, 13, 15, 6, 7, 3, 5];
const GOLD = "#c79a3b";
const CX = 360;
const CY = 360;
const RING_R = [330, 268, 206, 146, 90];

function winnerSlug(m: Match | undefined): string | null {
  if (!m || !m.played || m.team_score == null || m.opp_score == null) return null;
  if (m.team_score === m.opp_score) {
    return m.result === "W" ? m.team_slug : m.result === "L" ? m.opp_slug : null;
  }
  return m.team_score > m.opp_score ? m.team_slug : m.opp_slug;
}

function findMatch(rows: Match[] | undefined, a: string, b: string): Match | undefined {
  if (!rows) return undefined;
  return rows.find(
    (m) =>
      (m.team_slug === a && m.opp_slug === b) ||
      (m.team_slug === b && m.opp_slug === a),
  );
}

function pol(r: number, unit: number): [number, number] {
  const a = (unit * (360 / 32) - 90) * (Math.PI / 180);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function FlagNode({
  x, y, slug, size, gold, dim, compact = false,
}: { x: number; y: number; slug: string | null; size: number; gold: boolean; dim: boolean; compact?: boolean }) {
  const url = slug ? flagCdnUrl(slug, "40x30") : null;
  const dot = compact ? <circle cx={x} cy={y} r={3.5} fill="var(--text-muted)" /> : null;
  if (!slug || !url) {
    return compact ? dot : <circle cx={x} cy={y} r={size} fill="var(--surface-1)" stroke="var(--border)" strokeWidth={0.7} />;
  }
  const cid = `rk-${slug}-${Math.round(x)}-${Math.round(y)}`;
  const flag = (
    <g opacity={dim ? 0.4 : 1} className={compact ? "hidden sm:block" : undefined}>
      <clipPath id={cid}>
        <circle cx={x} cy={y} r={size} />
      </clipPath>
      <image
        href={url}
        x={x - size}
        y={y - size}
        width={size * 2}
        height={size * 2}
        clipPath={`url(#${cid})`}
        preserveAspectRatio="xMidYMid slice"
      />
      <circle cx={x} cy={y} r={size} fill="none" stroke={gold ? GOLD : "var(--border-strong)"} strokeWidth={gold ? 2.2 : 0.7} />
    </g>
  );
  return compact ? (<>{dot}{flag}</>) : flag;
}

export default function RadialKnockout({ knockout }: { knockout: KO }) {
  const r32 = knockout["Round of 32"] ?? [];
  if (r32.length < 16) return null;

  // Angles per ring (binary merge inward).
  const ringAngles: number[][] = [Array.from({ length: 32 }, (_, i) => i)];
  for (let k = 1; k < 5; k++) {
    const prev = ringAngles[k - 1];
    const cur: number[] = [];
    for (let j = 0; j < prev.length; j += 2) cur.push((prev[j] + prev[j + 1]) / 2);
    ringAngles.push(cur);
  }

  // Occupants per ring: ring0 = 32 teams, ring1 = R32 winners, ring2..4 found by
  // team identity in the deeper rounds. null = not yet decided.
  const teams: (string | null)[] = [];
  const ring1: (string | null)[] = [];
  for (let p = 0; p < 16; p++) {
    const m = r32[LEAF_ORDER[p]];
    teams.push(m?.team_slug ?? null, m?.opp_slug ?? null);
    ring1.push(winnerSlug(m));
  }
  const ring2 = mergeRound(ring1, knockout["Round of 16"]);
  const ring3 = mergeRound(ring2, knockout["Quarterfinals"]);
  const ring4 = mergeRound(ring3, knockout["Semifinals"]);
  const championArr = mergeRound(ring4, knockout["Final"]);
  const champion = championArr[0] ?? null;

  const occByRing: (string | null)[][] = [teams, ring1, ring2, ring3, ring4];

  function advanced(ring: number, idx: number): boolean {
    const slug = occByRing[ring][idx];
    if (!slug) return false;
    const parent = ring < 4 ? occByRing[ring + 1][Math.floor(idx / 2)] : champion;
    return parent === slug;
  }

  const connectors: ReactNode[] = [];
  for (let k = 0; k < 4; k++) {
    const child = ringAngles[k];
    const par = ringAngles[k + 1];
    for (let j = 0; j < child.length; j++) {
      const [x1, y1] = pol(RING_R[k], child[j]);
      const [x2, y2] = pol(RING_R[k + 1], par[Math.floor(j / 2)]);
      const gold = advanced(k, j);
      connectors.push(
        <line key={`c${k}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={gold ? GOLD : "var(--border)"} strokeWidth={gold ? 2.2 : 0.7} strokeLinecap="round" />,
      );
    }
  }
  ringAngles[4].forEach((a, i) => {
    const [x1, y1] = pol(RING_R[4], a);
    const gold = advanced(4, i);
    connectors.push(
      <line key={`f${i}`} x1={x1} y1={y1} x2={CX} y2={CY}
        stroke={gold ? GOLD : "var(--border)"} strokeWidth={gold ? 2.2 : 0.7} strokeLinecap="round" />,
    );
  });

  return (
    <div>
      <svg viewBox="0 0 720 720" width="100%" role="img"
        aria-label="Radial World Cup 2026 knockout bracket from the round of 32 to the final; winners' paths are highlighted in gold.">
        <title>World Cup 2026 knockout bracket</title>
        {connectors}
        {ringAngles[4].map((a, i) => {
          const [x, y] = pol(RING_R[4], a);
          return <FlagNode key={`r4-${i}`} x={x} y={y} slug={occByRing[4][i]} size={14} gold={advanced(4, i)} dim={false} compact />;
        })}
        {ringAngles[3].map((a, i) => {
          const [x, y] = pol(RING_R[3], a);
          return <FlagNode key={`r3-${i}`} x={x} y={y} slug={occByRing[3][i]} size={13} gold={advanced(3, i)} dim={false} compact />;
        })}
        {ringAngles[2].map((a, i) => {
          const [x, y] = pol(RING_R[2], a);
          return <FlagNode key={`r2-${i}`} x={x} y={y} slug={occByRing[2][i]} size={13} gold={advanced(2, i)} dim={false} compact />;
        })}
        {ringAngles[1].map((a, i) => {
          const [x, y] = pol(RING_R[1], a);
          return <FlagNode key={`r1-${i}`} x={x} y={y} slug={ring1[i]} size={14} gold={advanced(1, i)} dim={false} />;
        })}
        {teams.map((slug, i) => {
          const [x, y] = pol(RING_R[0], i);
          const matchIdx = LEAF_ORDER[Math.floor(i / 2)];
          const m = r32[matchIdx];
          const w = winnerSlug(m);
          const isWinner = w === slug;
          const decided = w != null;
          return <FlagNode key={`t-${i}`} x={x} y={y} slug={slug} size={16} gold={isWinner} dim={decided && !isWinner} />;
        })}
        <circle cx={CX} cy={CY} r={32} fill="none" stroke={GOLD} strokeWidth={1.5} />
        {champion ? (
          <FlagNode x={CX} y={CY} slug={champion} size={22} gold dim={false} />
        ) : (
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize={12} fontWeight={500}
            fill={GOLD} style={{ fontFamily: "system-ui, sans-serif" }}>Final</text>
        )}
      </svg>
    </div>
  );
}

function mergeRound(prev: (string | null)[], rows: Match[] | undefined): (string | null)[] {
  const out: (string | null)[] = [];
  for (let q = 0; q < prev.length; q += 2) {
    const a = prev[q];
    const b = prev[q + 1];
    out.push(a && b ? winnerSlug(findMatch(rows, a, b)) : null);
  }
  return out;
}
