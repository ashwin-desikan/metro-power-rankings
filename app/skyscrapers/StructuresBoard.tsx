"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TableScroll } from "@/app/_shared/TableScroll";
import type { StructureKind, Supertall } from "@/lib/skyscrapers";

const MONO = { fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" } as const;
const CARD = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;

const KINDS: { id: StructureKind | "all"; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "building", label: "Buildings" },
  { id: "tower", label: "Towers" },
  { id: "mast", label: "Guyed masts" },
  { id: "industrial", label: "Chimneys & pylons" },
  { id: "other", label: "Platforms & other" },
];

/** The 350m+ structures board with the type filter. Pinnacle height:
 *  interactive, so a client component; the rows arrive as props and the
 *  filter never refetches. */
export default function StructuresBoard({ rows }: { rows: Supertall[] }) {
  const [kind, setKind] = useState<StructureKind | "all">("all");
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) c.set(r.kind, (c.get(r.kind) ?? 0) + 1);
    return c;
  }, [rows]);
  const shown = kind === "all" ? rows : rows.filter((r) => r.kind === kind);

  return (
    <>
      <div className="flex gap-2 flex-wrap mb-3">
        {KINDS.map(({ id, label }) => {
          const n = id === "all" ? rows.length : counts.get(id) ?? 0;
          if (!n) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${kind === id ? "font-semibold" : "text-[var(--text-muted)] hover:border-[var(--accent-dim)]"}`}
              style={kind === id ? { background: "var(--accent)", color: "#08080D", borderColor: "var(--accent)" } : CARD}
            >
              {label} <span style={MONO}>{n}</span>
            </button>
          );
        })}
      </div>
      <TableScroll className="rounded-xl border" style={CARD}>
        <table className="w-full text-[13px]" data-sticky-col="2">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
              <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>#</th>
              <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Structure</th>
              <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Pinnacle (m)</th>
              <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Pinnacle (ft)</th>
              <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Type</th>
              <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Year</th>
              <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Metro</th>
              <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Country</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.name}>
                <td className="py-1.5 px-2 border-b text-[var(--text-dim)]" style={{ borderColor: "var(--border)", ...MONO }}>{i + 1}</td>
                <td className="py-1.5 px-2 border-b font-medium" style={{ borderColor: "var(--border)" }}>
                  {r.name}
                  {r.submerged && <span className="ml-1.5 text-[10px] text-[var(--text-dim)]">mostly under water</span>}
                </td>
                <td className="py-1.5 px-2 border-b font-bold" style={{ borderColor: "var(--border)", ...MONO }}>{r.heightM.toFixed(1)}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{r.heightFt.toLocaleString("en-GB")}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>{r.type}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)", ...MONO }}>{r.yearBuilt ?? "–"}</td>
                <td className="py-1.5 px-2 border-b" style={{ borderColor: "var(--border)" }}>
                  {r.metroSlug ? (
                    <Link href={`/rankings/${r.metroSlug}`} className="underline decoration-dotted hover:text-[var(--accent)]">{r.metro}</Link>
                  ) : (
                    <span className="text-[var(--text-dim)]">{r.town || "–"}</span>
                  )}
                </td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>{r.country}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
}
