"use client";

import { useMemo, useState } from "react";
import type { NflEloTeam } from "@/lib/nflElo";

// Where every team starts, before a snap.
//
// 🔴 A SEASON WITH ONE WEEK STILL DESERVES A CHART. The seeded season used to
// get a table and nothing else, on the reasoning that a line through one point
// is not a line. True, and the answer is a different FORM rather than no chart:
// one value per team, ordered, is a dot plot, and a dot plot of 32 preseason
// ratings shows the two things the table cannot. How far the top is from the
// field, and where the gaps fall, which is where the tiers actually are.
//
// The axis is the rating itself, so the distance between two dots is the
// difference between two teams. 1500 is drawn because it is the league mean by
// construction, and the fill runs from it rather than from the chart floor.

const W = 940;
const M = { top: 26, right: 16, bottom: 34, left: 16 };
const ROW = 20;
const MONO = "'JetBrains Mono', monospace";

type Filter = { key: string; label: string; test: (t: NflEloTeam) => boolean };

export default function PreseasonChart({
  teams,
  season,
  colorByName = {},
}: {
  teams: NflEloTeam[];
  season: number;
  colorByName?: Record<string, string | null>;
}) {
  const filters = useMemo<Filter[]>(() => {
    const out: Filter[] = [{ key: "all", label: "All teams", test: () => true }];
    const confs = [...new Set(teams.map((t) => t.conf).filter(Boolean))] as string[];
    if (confs.length > 1) {
      for (const c of confs.sort()) out.push({ key: `c:${c}`, label: c, test: (t) => t.conf === c });
    }
    const divs = [...new Set(teams.map((t) => t.div).filter((d) => d && !confs.includes(d)))] as string[];
    if (divs.length > 1 && divs.length <= 10) {
      for (const d of divs.sort()) out.push({ key: `d:${d}`, label: d, test: (t) => t.div === d });
    }
    return out;
  }, [teams]);

  const [active, setActive] = useState("all");
  const filter = filters.find((f) => f.key === active) ?? filters[0];

  const all = [...teams].sort((a, b) => b.end - a.end);
  if (all.length < 2) return null;
  const shown = all.filter(filter.test);
  const drawn = shown.length ? shown : all;

  // The scale is the whole league at every filter, so the AFC and the NFC stay
  // comparable and a filtered view is a subset rather than a rescale.
  const values = all.map((t) => t.end);
  const lo = Math.floor((Math.min(...values) - 10) / 25) * 25;
  const hi = Math.ceil((Math.max(...values) + 10) / 25) * 25;
  const H = M.top + M.bottom + drawn.length * ROW;
  const px = (e: number) => M.left + 132 + ((e - lo) / (hi - lo)) * (W - M.left - M.right - 132 - 56);
  const mean = 1500 >= lo && 1500 <= hi ? px(1500) : null;

  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 50) ticks.push(v);

  return (
    <figure className="m-0 min-w-0">
      {filters.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Filter the chart">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActive(f.key)}
              aria-pressed={active === f.key}
              className="text-[11px] px-2.5 min-h-11 sm:min-h-8 rounded-md border transition inline-flex items-center"
              style={{
                background: active === f.key ? "var(--bg-card-hover)" : "transparent",
                borderColor: active === f.key ? "var(--accent)" : "var(--border)",
                color: active === f.key ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto psc" role="img"
        aria-label={`Preseason Elo rating for ${drawn.length} teams going into the ${season} season, highest first.`}>
        <style>{`
          .psc .r:hover .bar { opacity: 1; }
          .psc .r .bar { opacity: 0.85; }
          .psc .r:hover .nm { fill: var(--accent); }
        `}</style>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={px(v)} x2={px(v)} y1={M.top - 8} y2={H - M.bottom + 4} stroke="var(--border)" strokeWidth={1} />
            <text x={px(v)} y={H - M.bottom + 18} textAnchor="middle" fontSize={10} fill="var(--text-dim)" style={{ fontFamily: MONO }}>{v}</text>
          </g>
        ))}
        {mean !== null ? (
          <>
            <line x1={mean} x2={mean} y1={M.top - 12} y2={H - M.bottom + 4} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={mean} y={M.top - 16} textAnchor="middle" fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
              1500 · league average
            </text>
          </>
        ) : null}

        {drawn.map((t, i) => {
          const y = M.top + i * ROW + ROW / 2;
          const color = colorByName[t.name] || "var(--border)";
          const x = px(t.end);
          const from = mean ?? px(lo);
          const rank = all.findIndex((a) => a.name === t.name) + 1;
          return (
            <g key={t.name} className="r">
              <title>
                {`${`${t.city ?? ""} ${t.team ?? t.name}`.trim()} · ${t.end}` +
                 `\n${rank} of ${all.length} going into ${season}` +
                 `${t.div ? `\n${t.div}` : ""}`}
              </title>
              <rect x={0} y={y - ROW / 2} width={W} height={ROW} fill="transparent" />
              <text className="nm" x={M.left + 126} y={y + 3.5} textAnchor="end" fontSize={11} fill="var(--text)">
                {`${t.city ?? ""} ${t.team ?? t.name}`.trim()}
              </text>
              <line className="bar" x1={from} x2={x} y1={y} y2={y} stroke={color} strokeWidth={3} strokeLinecap="round" />
              <circle className="bar" cx={x} cy={y} r={4} fill={color} />
              <text x={x + 9} y={y + 3.5} fontSize={10} fill="var(--text-muted)" style={{ fontFamily: MONO }}>
                {t.end.toFixed(0)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-[12px] text-[var(--text-dim)]">
        Each bar runs from the league average to where that team starts. The gaps between the dots are the
        gaps between the teams, which is what a table of the same numbers cannot show.
      </figcaption>
    </figure>
  );
}
