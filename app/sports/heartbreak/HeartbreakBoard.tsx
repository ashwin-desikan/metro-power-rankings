"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getCrest } from "@/lib/teamCrest";
import { flagCdnUrl } from "@/lib/international-display";

// HeartbreakBoard — the main ranked board.
//
// Ranks shown are GLOBAL (position on the unfiltered board), so filtering to
// Scotland or the NHL shows where those clubs sit on the world scale.
//
// 🔴 EVERY SCORED CLUB IS ON THIS BOARD, INCLUDING THE ONES ON 0.0. The page
// used to drop them, which read as missing data when it was the opposite: the
// engine had scored them and found nothing to complain about. In 2026 that is
// the Knicks and the Hurricanes, both reigning champions, both zeroed by the
// afterglow rule — the single most legible demonstration of what the index
// measures, and it was the one row the board refused to print. Ashwin,
// 2026-08-14: "please show all teams even if the score is 0.0."
//
// There is no row cap either. The old slice(0, 100) hid 1,030 of 1,138 clubs
// and said so in six-point type. A ranked board that silently ends at 100 is
// telling the reader their club is unranked when it is merely 137th.

export interface BoardRow {
  rank: number;
  name: string;
  href?: string;
  /** The league: NFL, CBB, Football, ... */
  sport: string;
  /**
   * The roll-up the filter uses: American Football, Basketball, ...
   * NOT the same thing as ClubRow.group in page.tsx, which is the engine's
   * internal partition (football / us / gfl / college). Named apart on
   * purpose — they are one letter from being silently interchangeable.
   */
  sportGroup: string;
  country?: string;
  total: number;
  agony: number;
  despair: number;
  quadrant?: string;
  waiting: string;
  wound: string;
}

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const BORD = { borderColor: "var(--border)" } as const;
const ALL = "All";

// Fixed rather than data-derived, so the chip row does not reshuffle itself
// when a league is added and so the codes a reader is likeliest to want sit
// first. Anything not listed sorts to the end alphabetically.
const GROUP_ORDER = [
  "Football", "American Football", "Basketball", "Baseball",
  "Ice Hockey", "Australian Rules", "Rugby League", "Cricket",
];

function slugifyCountry(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The country flag, or nothing. England and Scotland resolve to their own
 *  flags rather than the Union Jack, which is why this goes through
 *  flagCdnUrl's subdivision table instead of an ISO code. */
function CountryFlag({ country }: { country?: string }) {
  const url = country ? flagCdnUrl(slugifyCountry(country)) : null;
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      width={18}
      height={13}
      loading="lazy"
      decoding="async"
      className="inline-block rounded-sm object-contain flex-shrink-0 align-middle"
    />
  );
}

/** The club crest from team-metadata.json, or a neutral dot so the name column
 *  keeps one alignment whether or not a badge exists. */
function Crest({ name }: { name: string }) {
  const crest = getCrest(name);
  if (!crest) {
    return (
      <span
        aria-hidden
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 18, height: 18, background: "var(--border)" }}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={crest.src}
      alt=""
      aria-hidden
      width={18}
      height={18}
      loading="lazy"
      decoding="async"
      className="inline-block rounded-full object-contain flex-shrink-0"
    />
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors hover:border-[var(--accent)]"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "var(--accent)" : "var(--text)",
        background: "var(--bg-card)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 px-2 border-b" style={BORD}>{children}</th>;
}

export default function HeartbreakBoard({ rows }: { rows: BoardRow[] }) {
  const [group, setGroup] = useState(ALL);
  const [league, setLeague] = useState(ALL);
  const [country, setCountry] = useState(ALL);

  const groups = useMemo(() => {
    const seen = new Set(rows.map((r) => r.sportGroup));
    return [ALL,
            ...GROUP_ORDER.filter((g) => seen.has(g)),
            ...[...seen].filter((g) => !GROUP_ORDER.includes(g)).sort()];
  }, [rows]);

  // Only offered when the chosen group holds more than one league, because a
  // second chip row reading "Ice Hockey / NHL" is a control with no choice in
  // it. Football is the group whose second level is a country, handled below.
  const leagues = useMemo(() => {
    if (group === ALL || group === "Football") return [];
    const seen = [...new Set(rows.filter((r) => r.sportGroup === group).map((r) => r.sport))].sort();
    return seen.length > 1 ? [ALL, ...seen] : [];
  }, [rows, group]);

  const countries = useMemo(
    () => [ALL, ...Array.from(new Set(rows.filter((r) => r.sportGroup === "Football" && r.country)
      .map((r) => r.country as string))).sort()],
    [rows],
  );

  const filtered = rows.filter(
    (r) =>
      (group === ALL || r.sportGroup === group) &&
      (league === ALL || r.sport === league) &&
      (group !== "Football" || country === ALL || r.country === country),
  );

  const pick = (g: string) => { setGroup(g); setLeague(ALL); setCountry(ALL); };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {groups.map((g) => (
          <Chip key={g} label={g} active={group === g} onClick={() => pick(g)} />
        ))}
      </div>
      {leagues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {leagues.map((l) => (
            <Chip key={l} label={l} active={league === l} onClick={() => setLeague(l)} />
          ))}
        </div>
      )}
      {group === "Football" && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {countries.map((c) => (
            <Chip key={c} label={c} active={country === c} onClick={() => setCountry(c)} />
          ))}
        </div>
      )}
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mb-2" style={MONO}>
        {filtered.length} of {rows.length} clubs · ranks are global
      </div>
      <TableScroll className="rounded-xl border" style={CARD}>
        <table className="w-full text-[13px]" data-sticky-col="2">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
              <Th>#</Th>
              <Th>Club</Th>
              <Th>League</Th>
              <Th>Heartbreak</Th>
              <Th>Agony</Th>
              <Th>Despair</Th>
              <Th>Quadrant</Th>
              <Th>Waiting since</Th>
              <Th>Worst wound</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.sport}-${r.name}-${r.rank}`}>
                <td className="py-1.5 px-2 border-b text-[var(--text-dim)]" style={{ ...BORD, ...MONO }}>{r.rank}</td>
                <td className="py-1.5 px-2 border-b font-medium" style={BORD}>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Crest name={r.name} />
                    {r.href ? <Link href={r.href} className="hover:underline">{r.name}</Link> : r.name}
                  </span>
                </td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)] whitespace-nowrap" style={BORD}>
                  <span className="inline-flex items-center gap-1.5">
                    <CountryFlag country={r.country} />
                    {r.sport === "Football" ? r.country ?? "Football" : r.sport}
                  </span>
                </td>
                <td className="py-1.5 px-2 border-b font-bold" style={{ ...BORD, ...MONO }}>{r.total.toFixed(1)}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ ...BORD, ...MONO }}>{r.agony.toFixed(1)}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ ...BORD, ...MONO }}>{r.despair.toFixed(1)}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={BORD}>{r.quadrant ?? "–"}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={BORD}>{r.waiting}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={BORD}>{r.wound}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
