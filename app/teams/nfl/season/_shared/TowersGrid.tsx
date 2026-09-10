"use client";

import { useCallback, useRef, type CSSProperties, type PointerEvent } from "react";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";

// The client half of the season towers: the grid itself, with a readout.
// ExpectationTowers (server) computes the columns; this file only draws
// them and answers the pointer. See ChartReadout for the rule it follows.
//
// 🔴 TWO LAYOUTS, ONE DATA SHAPE. Desktop: one column per team, weeks
// stacked bottom to top (the original grid). Phone: one ROW per team, weeks
// left to right, in a box that scrolls sideways with the team label pinned,
// because 32 columns of 28px was 896px of sideways scroll for a picture
// meant to be read at a glance, and a 10px box under a thumb told nobody
// anything (Ashwin, 2026-09-10). Both layouts route every pointer event to
// the NEAREST box, so the box never has to be a tap target itself.

export type Band = "expected" | "tossup" | "shock";
export type Cell =
  | { kind: "game"; band: Band; win: boolean; title: string }
  | { kind: "tie"; title: string }
  | { kind: "bye"; title?: string }
  | { kind: "out" }
  | { kind: "seam" };

export type Col = {
  key: string;
  slug: string | null;
  logo: string | null;
  mono: { bg: string; fg: string; mono: string } | null;
  abbr: string;
  label: string;
  labelTitle: string;
  cells: Cell[];
};

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
export const COL_MIN_W = 28;
export const COL_MAX_W = 44;
export const BOX_H = 10;
export const BOX_GAP = 2;
export const SEAM_H = 6;
const AXIS_WEEKS = [1, 5, 10, 15, 20];
// Phone row: boxes across, sized so 18 weeks plus a playoff run fit a 390px
// screen beside a 44px pinned label with a little to spare.
const PH_BOX_W = 13;
const PH_BOX_H = 16;
const PH_GAP = 1;
const PH_SEAM_W = 5;
const PH_LABEL_W = 44;

const OPACITY: Record<Band, number> = { expected: 0.3, tossup: 0.65, shock: 1 };

function cellText(cell: Cell): string | null {
  if (cell.kind === "game" || cell.kind === "tie") return cell.title;
  if (cell.kind === "bye") return cell.title ?? "Bye or no game that week";
  return null;
}

/** The box, in either orientation. `w`/`h` are the box's own size; the seam
 *  is a hairline drawn across the column (desktop) or down the row (phone). */
function Box({ cell, w, h, vertical, selected }: { cell: Cell; w: number | string; h: number; vertical: boolean; selected: boolean }) {
  if (cell.kind === "seam") {
    return vertical
      ? <div aria-hidden style={{ width: w, height: SEAM_H, backgroundImage: "linear-gradient(var(--border), var(--border))", backgroundSize: "100% 1px", backgroundPosition: "center", backgroundRepeat: "no-repeat", flexShrink: 0 }} />
      : <div aria-hidden style={{ width: PH_SEAM_W, height: h, backgroundImage: "linear-gradient(var(--border), var(--border))", backgroundSize: "1px 100%", backgroundPosition: "center", backgroundRepeat: "no-repeat", flexShrink: 0 }} />;
  }
  const ring = selected ? { outline: "2px solid var(--accent)", outlineOffset: 1 } : {};
  if (cell.kind === "out") return <div aria-hidden style={{ width: w, height: h, flexShrink: 0 }} />;
  if (cell.kind === "bye") {
    return <div className="rounded-[1px]" style={{ width: w, height: h, border: "1px dashed var(--border)", flexShrink: 0, boxSizing: "border-box", ...ring }} />;
  }
  if (cell.kind === "tie") {
    return <div className="rounded-[1px]" style={{ width: w, height: h, background: "var(--div-mid)", opacity: 0.75, flexShrink: 0, ...ring }} />;
  }
  const shock = cell.band === "shock";
  return (
    <div
      className="relative rounded-[1px]"
      style={{ width: w, height: h, background: cell.win ? "var(--div-pos)" : "var(--div-neg)", opacity: selected ? 1 : OPACITY[cell.band],
        border: shock ? "1.5px solid var(--text)" : "none", boxSizing: "border-box", flexShrink: 0, ...ring }}
    >
      {shock ? <span aria-hidden className="absolute rounded-full" style={{ top: 1, right: 1, width: 3, height: 3, background: "#fff" }} /> : null}
    </div>
  );
}

/** Which cell index a pointer at `pos` (px from the start of the stack, in
 *  reading order) is nearest to, skipping the seam and empty slots. */
function nearestCell(cells: Cell[], pos: number, box: number, gap: number, seam: number): number | null {
  let at = 0;
  let best: { i: number; d: number } | null = null;
  cells.forEach((c, i) => {
    const size = c.kind === "seam" ? seam : box;
    const mid = at + size / 2;
    if (c.kind !== "seam" && c.kind !== "out") {
      const d = Math.abs(pos - mid);
      if (!best || d < best.d) best = { i, d };
    }
    at += size + gap;
  });
  return best ? (best as { i: number; d: number }).i : null;
}

type Props = {
  cols: Col[];
  maxWeek: number;
  tierLabels: string[]; // one per playoff tier the season had, in order
  tierTitles: string[];
};

export default function TowersGrid(props: Props) {
  return (
    <ChartReadoutProvider>
      <Grid {...props} />
    </ChartReadoutProvider>
  );
}

function Grid({ cols, maxWeek, tierLabels, tierTitles }: Props) {
  const { item, set } = useChartReadout();
  const tiers = tierLabels.length;
  const stackH = (maxWeek + tiers) * (BOX_H + BOX_GAP) - BOX_GAP + (tiers ? SEAM_H + BOX_GAP : 0);
  const selectedKey = item?.key ?? null;
  const dragging = useRef(false);

  const pick = useCallback((col: Col, i: number | null) => {
    if (i == null) return;
    const text = cellText(col.cells[i]);
    if (!text) return;
    set({ key: `${col.key}:${i}`, text: `${col.label}. ${text}` });
  }, [set]);

  // Desktop: y runs bottom (week 1) to top, so measure from the bottom edge.
  const onColumn = (col: Col) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointermove" && !dragging.current && e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    pick(col, nearestCell(col.cells, r.bottom - e.clientY, BOX_H, BOX_GAP, SEAM_H));
  };
  // Phone: x runs left (week 1) to right.
  const onRow = (col: Col) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointermove" && !dragging.current && e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    pick(col, nearestCell(col.cells, e.clientX - r.left, PH_BOX_W, PH_GAP, PH_SEAM_W));
  };
  const down = () => { dragging.current = true; };
  const up = () => { dragging.current = false; };

  const Logo = ({ c, size }: { c: Col; size: number }) =>
    c.logo ? <img src={c.logo} alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} decoding="async" />
    : c.mono ? <span aria-hidden className="inline-grid place-items-center rounded-full" style={{ width: size, height: size, background: c.mono.bg, color: c.mono.fg, fontSize: 7, fontWeight: 700 }}>{c.mono.mono}</span>
    : <span aria-hidden className="inline-block rounded-full" style={{ width: size, height: size, border: "1px solid var(--border)" }} />;

  return (
    <figure className="m-0 min-w-0">
      {/* ------------------------------------------------ desktop: columns */}
      <div className="hidden sm:block overflow-x-auto min-w-0" onPointerDown={down} onPointerUp={up} onPointerCancel={up}>
        <div className="flex items-stretch" style={{ minWidth: (cols.length + 1) * COL_MIN_W }}>
          {/* The axis is laid out exactly like a team column (a 44px head, a
              4px gap, then the stack) so week N sits beside week N. A 24px
              spacer here once put the axis two rows high (Ashwin, 2026-09-10). */}
          <div className="sticky left-0 z-10 flex flex-shrink-0 flex-col items-end gap-1 pr-1.5 text-[9px] text-[var(--text-dim)]" style={{ ...MONO, background: "var(--bg-card)", width: 22 }}>
            <div className="h-11 flex-shrink-0" aria-hidden />
            <div className="flex flex-col-reverse" style={{ gap: BOX_GAP }}>
              {Array.from({ length: maxWeek }, (_, i) => i + 1).map((wk) => (
                <div key={wk} className="flex items-center justify-end" style={{ height: BOX_H }}>{AXIS_WEEKS.includes(wk) ? wk : ""}</div>
              ))}
              {tiers ? <Box cell={{ kind: "seam" }} w="100%" h={BOX_H} vertical selected={false} /> : null}
              {tierLabels.map((l, i) => (
                <div key={l} title={tierTitles[i]} className="flex items-center justify-end text-[7px]" style={{ height: BOX_H }}>{l}</div>
              ))}
            </div>
            <div style={{ height: 18 }} aria-hidden />
          </div>
          {cols.map((c) => (
            <div key={c.key} className="flex flex-shrink-0 flex-1 flex-col items-center gap-1" style={{ minWidth: COL_MIN_W, maxWidth: COL_MAX_W }}>
              <a href={c.slug ? `/teams/nfl/${c.slug}` : undefined} title={c.labelTitle} className="flex h-11 w-full flex-shrink-0 items-center justify-center">
                <Logo c={c} size={24} />
              </a>
              <div className="flex w-full flex-col-reverse cursor-crosshair touch-pan-x" style={{ gap: BOX_GAP, height: stackH }}
                onPointerDown={onColumn(c)} onPointerMove={onColumn(c)}>
                {c.cells.map((cell, i) => <Box key={i} cell={cell} w="100%" h={BOX_H} vertical selected={selectedKey === `${c.key}:${i}`} />)}
              </div>
              <span title={c.labelTitle} className="text-[9px] font-semibold text-[var(--accent)]" style={MONO}>{c.abbr}</span>
            </div>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------- phone: rows */}
      {/* data-mobile-uncapped: 32 rows of 22px is one phone screen, and the
          picture only works whole; capping it would hide the bottom of the
          league, which is the half that makes the top legible. */}
      <div className="sm:hidden overflow-x-auto min-w-0" data-mobile-uncapped onPointerDown={down} onPointerUp={up} onPointerCancel={up}>
        <div className="inline-flex min-w-full flex-col" style={{ gap: 3 }}>
          <div className="flex items-end text-[12px] text-[var(--text-dim)]" style={MONO}>
            <div className="sticky left-0 z-10 flex-shrink-0" style={{ width: PH_LABEL_W, background: "var(--bg-card)" }} aria-hidden />
            <div className="flex" style={{ gap: PH_GAP }}>
              {Array.from({ length: maxWeek }, (_, i) => i + 1).map((wk) => (
                <div key={wk} className="text-center" style={{ width: PH_BOX_W, flexShrink: 0 }}>{AXIS_WEEKS.includes(wk) ? wk : ""}</div>
              ))}
              {tiers ? <div style={{ width: PH_SEAM_W, flexShrink: 0 }} /> : null}
              {tierLabels.map((l, i) => (
                <div key={l} title={tierTitles[i]} className="text-center text-[11px]" style={{ width: PH_BOX_W, flexShrink: 0 }}>{l.slice(0, 1)}</div>
              ))}
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.key} className="flex items-center">
              {/* A label, not a link: a 22px row is under the 44px tap floor,
                  and the team page is one tap away in the standings above. */}
              <span title={c.labelTitle}
                className="sticky left-0 z-10 flex flex-shrink-0 items-center gap-1 pr-1 text-[11px] font-semibold text-[var(--accent)]"
                style={{ ...MONO, width: PH_LABEL_W, height: PH_BOX_H + 6, background: "var(--bg-card)" }}>
                <Logo c={c} size={14} />
                <span className="truncate">{c.abbr}</span>
              </span>
              <div className="flex items-center touch-pan-y" style={{ gap: PH_GAP, height: PH_BOX_H + 6 }} onPointerDown={onRow(c)} onPointerMove={onRow(c)}>
                {c.cells.map((cell, i) => <Box key={i} cell={cell} w={PH_BOX_W} h={PH_BOX_H} vertical={false} selected={selectedKey === `${c.key}:${i}`} />)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ChartReadout hint="Tap or drag across a team's boxes to read the game: opponent, score, and what the model had given it." />
    </figure>
  );
}
