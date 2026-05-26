"use client";

// Client wrapper for the International Football index: continent + federation
// filter chips, map, and grouped team list. The team payload is pre-trimmed
// in the server page to keep the bundle compact.

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CONTINENT_COLORS, flagForTeam } from "@/lib/international-display";
import type { NationalMapPoint } from "./NationalMapInner";

const NationalMap = dynamic(() => import("./NationalMapInner"), {
  ssr: false,
  loading: () => null,
});

export type IndexTeam = {
  slug: string;
  cur_name: string;
  continent: string;
  federation: string | null;
  trophies: number;
  major_trophies: number;
  tour_app: number;
  fifa_rank: number | null;
  elo_rank: number | null;
  centroid: [number, number] | null;
  active: boolean;
  has_country_page: boolean;
};

type Props = {
  teams: IndexTeam[];
};

// Continent display order. World last; we'll show it grouped under "Other".
const CONTINENT_ORDER = [
  "Europe",
  "South America",
  "Africa",
  "Asia",
  "North America",
  "Oceania",
  "World",
];

// Federations we surface as filter chips. Order matches FIFA confederation
// hierarchy. The workbook uses COMNEBOL spelling intentionally per the
// project's editorial position.
const FEDERATIONS = ["UEFA", "COMNEBOL", "CAF", "AFC", "CONCACAF", "OFC"];

export default function NationalIndexClient({ teams }: Props) {
  const [continents, setContinents] = useState<Set<string>>(new Set());
  const [federations, setFederations] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams.filter((t) => {
      if (continents.size > 0 && !continents.has(t.continent)) return false;
      if (federations.size > 0 && (!t.federation || !federations.has(t.federation))) return false;
      if (q && !t.cur_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [teams, continents, federations, search]);

  const points = useMemo<NationalMapPoint[]>(() => {
    const out: NationalMapPoint[] = [];
    for (const t of filtered) {
      if (!t.centroid) continue;
      out.push({
        slug: t.slug,
        cur_name: t.cur_name,
        continent: t.continent,
        federation: t.federation,
        trophies: t.trophies,
        lat: t.centroid[0],
        lng: t.centroid[1],
        color: CONTINENT_COLORS[t.continent] ?? "#525252",
      });
    }
    return out;
  }, [filtered]);

  // Sort the filtered set by ELO rank ascending (best first). Teams with no
  // ELO rank land at the bottom and are ordered alphabetically among
  // themselves.
  const ranked = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ae = a.elo_rank ?? Number.POSITIVE_INFINITY;
      const be = b.elo_rank ?? Number.POSITIVE_INFINITY;
      if (ae !== be) return ae - be;
      return a.cur_name.localeCompare(b.cur_name);
    });
  }, [filtered]);

  const refitKey = `${[...continents].sort().join(",")}|${[...federations].sort().join(",")}`;

  return (
    <div>
      <section className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {CONTINENT_ORDER.filter((c) => c !== "World").map((c) => {
            const on = continents.has(c);
            return (
              <button
                key={c}
                onClick={() =>
                  setContinents((prev) => {
                    const next = new Set(prev);
                    if (next.has(c)) next.delete(c);
                    else next.add(c);
                    return next;
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition"
                style={{
                  background: on ? CONTINENT_COLORS[c] ?? "var(--bg-card)" : "var(--bg-card)",
                  color: on ? "white" : "var(--text)",
                  borderColor: on ? CONTINENT_COLORS[c] ?? "var(--border)" : "var(--border)",
                }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: on ? "white" : CONTINENT_COLORS[c] ?? "#525252" }}
                  aria-hidden
                />
                {c}
              </button>
            );
          })}
          {continents.size > 0 && (
            <button
              onClick={() => setContinents(new Set())}
              className="text-xs text-[var(--accent)] hover:underline ml-1"
            >
              Clear continents
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FEDERATIONS.map((fed) => {
            const on = federations.has(fed);
            return (
              <button
                key={fed}
                onClick={() =>
                  setFederations((prev) => {
                    const next = new Set(prev);
                    if (next.has(fed)) next.delete(fed);
                    else next.add(fed);
                    return next;
                  })
                }
                className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs transition"
                style={{
                  background: on ? "var(--accent)" : "var(--bg-card)",
                  color: on ? "white" : "var(--text)",
                  borderColor: on ? "var(--accent)" : "var(--border)",
                }}
              >
                {fed}
              </button>
            );
          })}
          {federations.size > 0 && (
            <button
              onClick={() => setFederations(new Set())}
              className="text-xs text-[var(--accent)] hover:underline ml-1"
            >
              Clear federations
            </button>
          )}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team name..."
          className="w-full sm:max-w-md rounded-md border px-3 py-1.5 text-sm"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <p className="mt-2 text-xs text-[var(--text-muted)] tabular-nums">
          {filtered.length} team{filtered.length === 1 ? "" : "s"} match{filtered.length === 1 ? "es" : ""} the current filters.
        </p>
      </section>

      <section className="mb-8">
        <NationalMap points={points} refitKey={refitKey} />
      </section>

      <section>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="py-2 px-2 text-right font-medium whitespace-nowrap">ELO</th>
                <th className="py-2 px-2 text-left font-medium">National team</th>
                <th className="py-2 px-2 text-right font-medium whitespace-nowrap">FIFA</th>
                <th className="py-2 px-2 text-right font-medium">Trophies</th>
                <th className="py-2 px-2 text-right font-medium whitespace-nowrap hidden sm:table-cell">Major trophies</th>
                <th className="py-2 px-2 text-left font-medium hidden sm:table-cell">Country</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((t) => {
                const flag = flagForTeam(t.slug);
                const continentDot = (
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: CONTINENT_COLORS[t.continent] ?? "#525252" }}
                    aria-hidden
                  />
                );
                return (
                  <tr
                    key={t.slug}
                    className="border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap font-semibold">
                      {t.elo_rank ?? <span className="text-[var(--text-dim)] font-normal">—</span>}
                    </td>
                    <td className="py-1.5 px-2">
                      <span className="inline-flex items-center gap-2">
                        {continentDot}
                        {flag && <span className="text-base leading-none" aria-hidden>{flag}</span>}
                        <Link href={`/teams/national/${t.slug}`} className="hover:underline font-medium">
                          {t.cur_name}
                        </Link>
                        {!t.active && (
                          <span
                            className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold"
                            style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-muted)" }}
                          >
                            Defunct
                          </span>
                        )}
                        {t.federation && (
                          <span className="text-[var(--text-muted)] text-xs">· {t.federation}</span>
                        )}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      {t.fifa_rank ?? <span className="text-[var(--text-dim)]">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {t.trophies > 0 ? t.trophies : <span className="text-[var(--text-dim)]">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums hidden sm:table-cell">
                      {t.major_trophies > 0 ? t.major_trophies : <span className="text-[var(--text-dim)]">—</span>}
                    </td>
                    <td className="py-1.5 px-2 hidden sm:table-cell">
                      {t.has_country_page ? (
                        <Link
                          href={`/countries/${t.slug}`}
                          className="text-[var(--accent)] hover:underline text-xs"
                          title={`Open ${t.cur_name} country page`}
                        >
                          /countries →
                        </Link>
                      ) : (
                        <span className="text-[var(--text-dim)] text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
