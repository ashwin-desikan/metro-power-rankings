"use client";

import { useState } from "react";
import Link from "next/link";
import { flagCdnUrl } from "@/lib/international-display";

// Local types (kept inline so this client component never imports the
// server-only lib/basketball module).
type FibaTeam = {
  rank: number; country: string; ioc: string; zone: string | null;
  zoneRank: number; pts: number; delta: number;
  slug: string | null; country_slug: string | null;
};
type FibaRanking = { date: string; label: string; source: string; teams: FibaTeam[] };

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ZONES = ["World", "Americas", "Europe", "Asia", "Africa"] as const;
type Zone = (typeof ZONES)[number];

function Delta({ d }: { d: number }) {
  if (d > 0) return <span style={{ color: "#16a34a" }}>▲{d}</span>;
  if (d < 0) return <span style={{ color: "#dc2626" }}>▼{Math.abs(d)}</span>;
  return <span className="text-[var(--text-dim)]">–</span>;
}

export default function FibaRankingTable({ ranking }: { ranking: FibaRanking }) {
  const [zone, setZone] = useState<Zone>("World");
  const rows = zone === "World" ? ranking.teams : ranking.teams.filter((t) => t.zone === zone);

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {ZONES.map((z) => {
          const active = z === zone;
          const n = z === "World" ? ranking.teams.length : ranking.teams.filter((t) => t.zone === z).length;
          return (
            <button
              key={z}
              type="button"
              onClick={() => setZone(z)}
              className="text-xs rounded-full px-3 py-1 border transition"
              style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                backgroundColor: active ? "var(--accent)" : "transparent",
                color: active ? "#fff" : "var(--text-muted)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {z} <span className="opacity-70" style={mono}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto" style={card}>
        <table className="w-full text-sm min-w-[520px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium text-right">#</th>
              <th className="py-2 px-3 font-medium">Country</th>
              {zone === "World"
                ? <th className="py-2 px-3 font-medium">Zone</th>
                : <th className="py-2 px-3 font-medium text-right">Zone #</th>}
              <th className="py-2 px-3 font-medium text-right">Points</th>
              <th className="py-2 px-3 font-medium text-right">+/&ndash;</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.rank} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{t.rank}</td>
                <td className="py-1.5 px-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {flagCdnUrl(t.country_slug ?? t.slug ?? "") ? (
                      <img src={flagCdnUrl(t.country_slug ?? t.slug ?? "")!} alt="" aria-hidden width={18} height={13} className="inline-block flex-shrink-0" />
                    ) : null}
                    {t.slug
                      ? <Link href={`/teams/basketball/${t.slug}`} className="hover:text-[var(--accent)]">{t.country}</Link>
                      : t.country_slug
                        ? <Link href={`/countries/${t.country_slug}`} className="hover:text-[var(--accent)]">{t.country}</Link>
                        : t.country}
                  </span>
                </td>
                {zone === "World"
                  ? <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{t.zone ?? ""}</td>
                  : <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{t.zoneRank}</td>}
                <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={mono}>{t.pts.toFixed(1)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}><Delta d={t.delta} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[var(--text-dim)] mt-2">
        Source:{" "}
        <a href="https://www.fiba.basketball/en/ranking/men" target="_blank" rel="noopener noreferrer" className="hover:underline">
          FIBA World Ranking (Men) presented by Nike
        </a>
        , as of {ranking.label}. Movement is versus the previous release. Russia is currently absent from the FIBA ranking.
      </p>
    </div>
  );
}
