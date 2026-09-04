"use client";

import { useState } from "react";
import Link from "next/link";
import { CappedList } from "@/app/_shared/Disclosure";
import { TableScroll } from "@/app/_shared/TableScroll";
import {
  GROUP_BLURB, GROUP_LABEL, LENS_BLURB, LENS_LABEL, LENS_ORDER,
  type SportFilter, type SportLens, type SportRow,
} from "./sportGroups";

// The Cup read down the other axis. The table above asks how much merit a nation
// holds; this asks how much a SPORT holds and who holds it. Both come from the
// same sportMerit map plus the same national-sport bonuses, so the two can never
// disagree.
//
// Client only for the filter. The rows are built on the server and passed in
// whole; nothing is fetched or recomputed here, and the filter is a plain
// array filter over ~106 rows.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { borderColor: "var(--border)", backgroundColor: "var(--bg-card)" } as const;
const ORDER: SportFilter[] = ["all", "team", "summer", "winter", "womens", "national", "retired"];

const matches = (r: SportRow, f: SportFilter) =>
  f === "all" ? true : f === "womens" ? r.womens : r.groups.includes(f);

// A chip. Both rows use it, so the two cannot drift apart visually. min-h-11 is
// the 44px touch target DESIGN-STANDARDS requires and is not negotiable here.
function Chip({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg border text-sm font-semibold transition-colors"
      style={{
        backgroundColor: active ? "var(--accent)" : "var(--bg-card)",
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "#08080D" : "var(--text-muted)",
      }}
    >
      {label}
      <span className="tabular-nums text-xs" style={{ opacity: 0.75 }}>{count}</span>
    </button>
  );
}

function Leaders({ row }: { row: SportRow }) {
  return (
    <>
      {row.leaders.map((l, i) => (
        <span key={l.name}>
          {i > 0 ? ", " : ""}
          {l.slug ? (
            <Link href={`/countries/${l.slug}`} className="hover:text-[var(--accent)]">{l.name}</Link>
          ) : (
            <span>{l.name}</span>
          )}
          {l.defunct ? <span className="text-[var(--text-dim)]" title="No longer competes">&#8224;</span> : null}
          {l.suspended ? <span className="text-[var(--text-dim)]" title="Under international suspension">&#42;</span> : null}
        </span>
      ))}
    </>
  );
}

function Weight({ row }: { row: SportRow }) {
  if (row.kind === "national") return <span className="text-[var(--text-dim)]">bonus</span>;
  return <>{row.weight != null ? `${row.weight.toFixed(2).replace(/0$/, "")}×` : "—"}</>;
}

export default function SportTotals({ rows }: { rows: SportRow[] }) {
  const [group, setGroup] = useState<SportFilter>("all");
  // The lens is a second axis, not a seventh group. It composes with the group
  // rather than replacing it, so Team plus Football codes is a legal question to
  // ask of the board. Clicking the active lens turns it off.
  const [lens, setLens] = useState<SportLens | null>(null);
  const shown = rows.filter((r) => matches(r, group) && (!lens || r.lenses.includes(lens)));
  // Each row's own count is what that chip would show on its own, so a count
  // never depends on what else is selected and the row cannot mislead.
  const counts = ORDER.map((g) => rows.filter((r) => matches(r, g)).length);
  const lensCounts = LENS_ORDER.map((l) => rows.filter((r) => r.lenses.includes(l)).length);

  return (
    <>
      <p className="mt-4 text-[11px] uppercase tracking-wider text-[var(--text-dim)]">How the Cup counts it</p>
      <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Filter by kind of sport">
        {ORDER.map((g, i) => (
          <Chip key={g} label={GROUP_LABEL[g]} count={counts[i]} active={g === group} onClick={() => setGroup(g)} />
        ))}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-[var(--text-dim)]">What the sport is</p>
      <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Filter by what the sport is">
        {LENS_ORDER.map((l, i) => (
          <Chip
            key={l}
            label={LENS_LABEL[l]}
            count={lensCounts[i]}
            active={l === lens}
            onClick={() => setLens(l === lens ? null : l)}
          />
        ))}
      </div>
      <p className="mt-2 text-[13px] text-[var(--text-muted)] max-w-3xl">{GROUP_BLURB[group]}</p>
      {lens ? (
        <p className="mt-1.5 text-[13px] text-[var(--text-muted)] max-w-3xl">{LENS_BLURB[lens]}</p>
      ) : null}

      <TableScroll className="mt-4 hidden sm:block rounded-xl border" style={CARD}>
        <table className="w-full text-sm" data-sticky-col={2}>
          <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2 w-10">#</th>
              <th className="px-3 py-2">Sport</th>
              <th className="px-3 py-2 text-right">Points</th>
              <th className="px-3 py-2 text-right">Share</th>
              <th className="px-3 py-2 text-right">Nations</th>
              <th className="px-3 py-2 text-right">Top four hold</th>
              <th className="px-3 py-2 text-right">Weight</th>
              <th className="px-3 py-2">Leaders</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.sport} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                  {r.sport}
                  {r.bonusKind && group === "all" ? (
                    <>{" "}<span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{r.bonusKind}</span></>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.total.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{r.share.toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.nations}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.total > 0 ? `${r.topFourShare.toFixed(0)}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>
                  <Weight row={r} />
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]"><Leaders row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          initial={12}
          noun="sports"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={shown.map((r, i) => (
            <div key={r.sport} className="rounded-lg border p-3" style={CARD}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 font-medium text-[var(--text)]">
                  <span className="mr-2 text-xs tabular-nums text-[var(--text-dim)]">{i + 1}</span>
                  {r.sport}
                  {r.bonusKind && group === "all" ? (
                    <>{" "}<span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{r.bonusKind}</span></>
                  ) : null}
                </span>
                <span className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">{r.total.toFixed(1)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-muted)]">
                <span>{r.share.toFixed(1)}% of the Cup</span>
                <span>{r.nations} {r.nations === 1 ? "nation" : "nations"}</span>
                {r.total > 0 ? <span>top four hold {r.topFourShare.toFixed(0)}%</span> : null}
                <span>weight <Weight row={r} /></span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] leading-snug"><Leaders row={r} /></div>
            </div>
          ))}
        />
      </div>
    </>
  );
}
