import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

// Per-hub "season in numbers" band above the ranking table: the #1 club spotlight (with the
// trophies it won and whether the best-ranked side actually won the Champions League), the
// biggest over/under-achiever versus pedigree, the biggest year-over-year movers, and a
// top-10 league-share bar. All values are computed server-side in SeasonHub from hub data.

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

// Shared with SeasonTrends' country palette so a country reads the same across the section.
const COUNTRY_COLOR: Record<string, string> = {
  England: "#3987e5", Spain: "#e66767", Italy: "#199e70", Germany: "#c98500",
  France: "#9085e9", Portugal: "#d55181", Netherlands: "#d95926", Scotland: "#37a3c9",
  Russia: "#8888A0", Ukraine: "#f0c419", Belgium: "#e0a11b", Turkey: "#d23b3b",
};
const FALLBACK = ["#6b8cae", "#a8738f", "#6ea08a", "#b3934f", "#8f88bd", "#c07d5a"];
function ccolor(country: string, i: number): string {
  return COUNTRY_COLOR[country] ?? FALLBACK[i % FALLBACK.length];
}

export type SnapshotChampion = {
  name: string; slug: string | null; country: string;
  score: number; form: number; ped: number; w: number; d: number; l: number; mp: number;
  trophies: string[];
};
export type SnapshotMover = { name: string; slug: string | null; detail: string } | null;
export type LeagueShareSeg = { country: string; count: number };

function ClubLink({ name, slug, className }: { name: string; slug: string | null; className?: string }) {
  return slug ? <Link href={`/teams/football/${slug}`} className={className}>{name}</Link> : <span className={className}>{name}</span>;
}

function MoverCard({ label, m, accent }: { label: string; m: SnapshotMover; accent: string }) {
  if (!m) return null;
  return (
    <div className="rounded-lg border px-3 py-2" style={cardStyle}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
        <CrestIcon name={m.name} size={16} className="flex-shrink-0" />
        <ClubLink name={m.name} slug={m.slug} className="text-sm font-semibold truncate hover:text-[var(--accent)]" />
      </div>
      <div className="text-[11px] tabular-nums mt-0.5" style={{ color: accent }}>{m.detail}</div>
    </div>
  );
}

export default function SeasonSnapshot({
  champion, clNote, overachiever, underachiever, riser, faller, bestOutside5, bestOutside8, leagueShare, shareTotal,
}: {
  champion: SnapshotChampion | null;
  clNote: string;
  overachiever: SnapshotMover;
  underachiever: SnapshotMover;
  riser: SnapshotMover;
  faller: SnapshotMover;
  bestOutside5: SnapshotMover;
  bestOutside8: SnapshotMover;
  leagueShare: LeagueShareSeg[];
  shareTotal: number;
}) {
  if (!champion) return null;
  return (
    <div className="mb-5 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-3">
      {/* #1 spotlight */}
      <div className="rounded-xl border p-4 flex flex-col justify-between" style={{ ...cardStyle, borderColor: "var(--accent)" }}>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">World #1 · Champion of the season</div>
          <div className="mt-1 flex items-center gap-2 min-w-0">
            <CrestIcon name={champion.name} size={30} className="flex-shrink-0" />
            <ClubLink name={champion.name} slug={champion.slug} className="text-xl font-semibold truncate hover:text-[var(--accent)]" />
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">
            {champion.country} · score {champion.score.toFixed(3)} · form {champion.form.toFixed(2)} · pedigree {champion.ped.toFixed(2)} · {champion.w}-{champion.d}-{champion.l} in {champion.mp}
          </div>
        </div>
        {champion.trophies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {champion.trophies.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(245,215,110,0.16)", color: "#d4af37" }}>★ {t}</span>
            ))}
          </div>
        )}
        <div className="mt-2 text-[11px] text-[var(--text-dim)]">{clNote}</div>
      </div>

      {/* movers + league share */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <MoverCard label="Overachiever" m={overachiever} accent="#22c55e" />
          <MoverCard label="Underachiever" m={underachiever} accent="#ef4444" />
          <MoverCard label="Biggest riser" m={riser} accent="#22c55e" />
          <MoverCard label="Biggest faller" m={faller} accent="#ef4444" />
          <MoverCard label="Best outside top 5" m={bestOutside5} accent="#60a5fa" />
          <MoverCard label="Best outside the 8" m={bestOutside8} accent="#60a5fa" />
        </div>
        {leagueShare.length > 0 && (
          <div className="rounded-lg border px-3 py-2" style={cardStyle}>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-1.5">Top {shareTotal} by league</div>
            <div className="flex h-3 w-full overflow-hidden rounded" style={{ background: "var(--bg)" }}>
              {leagueShare.map((s, i) => (
                <div key={s.country} title={`${s.country}: ${s.count}`} style={{ width: `${(s.count / shareTotal) * 100}%`, background: ccolor(s.country, i) }} />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
              {leagueShare.map((s, i) => (
                <span key={s.country} className="inline-flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: ccolor(s.country, i) }} />
                  {s.country} <span className="tabular-nums font-semibold text-[var(--text)]">{s.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
