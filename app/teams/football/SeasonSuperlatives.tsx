import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { getFootballClubByName } from "@/lib/football";
import { CLUB_COLOR, colorForClub } from "./_shared/clubColors";
import type { TrendsData } from "./SeasonTrends";

// Cross-season superlatives for /teams/football/seasons, computed from football-trends.json.
// Everything here is RANK- or difference-based, never raw score, because the season score is
// per-season normalised and not comparable across years (see the club bump-chart caption).
//   • The Belt: who held #1 each season, shaded by dynasty run
//   • Most seasons at #1 / in the top 5
//   • Biggest single-season overachievement (form minus pedigree)
//   • Best of the rest: highest peak rank by a club outside the big five

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const ss = (s: string) => (s.length >= 7 ? `${s.slice(2, 4)}/${s.slice(5, 7)}` : s);
const BIG5 = new Set(["England", "Spain", "Italy", "Germany", "France"]);

function slugOf(name: string): string | null {
  return getFootballClubByName(name)?.slug ?? null;
}
function CName({ name, color }: { name: string; color?: string }) {
  const slug = slugOf(name);
  const inner = <span className="inline-flex items-center gap-1.5 min-w-0"><CrestIcon name={name} size={13} className="flex-shrink-0" /><span className="truncate" style={color ? { color } : undefined}>{name}</span></span>;
  return slug ? <Link href={`/teams/football/${slug}`} className="hover:text-[var(--accent)] min-w-0">{inner}</Link> : inner;
}

function Board({ title, rows, note }: { title: string; rows: { name: string; detail: string }[]; note?: string }) {
  return (
    <div className="rounded-lg border p-3" style={cardStyle}>
      <div className="text-xs font-semibold mb-2">{title}</div>
      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="inline-flex items-baseline gap-1.5 min-w-0"><span className="text-[var(--text-dim)] tabular-nums w-4 flex-shrink-0">{i + 1}</span><CName name={r.name} color={CLUB_COLOR[r.name]} /></span>
            <span className="tabular-nums text-[var(--text-muted)] flex-shrink-0">{r.detail}</span>
          </li>
        ))}
      </ol>
      {note && <p className="mt-2 text-[10px] text-[var(--text-dim)] leading-snug">{note}</p>}
    </div>
  );
}

export default function SeasonSuperlatives({ data }: { data: TrendsData }) {
  // The Belt: #1 club each season, oldest to newest.
  const belt = data.seasons.map((season) => {
    let champ: string | null = null;
    for (const c of data.clubs) { const p = c.series.find((s) => s.season === season); if (p && p.rank === 1) { champ = c.name; break; } }
    return { season, champ };
  });
  // Shade each holder by its actual club colour (brand where we have one, a stable hue otherwise),
  // single-sourced from _shared/clubColors so The Belt matches the club power-ranking chart above.
  const champColor = new Map<string, string>();
  for (const b of belt) if (b.champ && !champColor.has(b.champ)) champColor.set(b.champ, colorForClub(b.champ));

  const titles = data.clubs
    .map((c) => ({ name: c.name, n: c.series.filter((s) => s.rank === 1).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 8)
    .map((x) => ({ name: x.name, detail: `${x.n}` }));
  const top5 = data.clubs
    .map((c) => ({ name: c.name, n: c.series.filter((s) => s.rank <= 5).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 8)
    .map((x) => ({ name: x.name, detail: `${x.n}` }));
  const overs = data.clubs
    .flatMap((c) => c.series.map((s) => ({ name: c.name, season: s.season, d: s.form - s.ped })))
    .sort((a, b) => b.d - a.d).slice(0, 8)
    .map((x) => ({ name: x.name, detail: `+${x.d.toFixed(2)} · ${ss(x.season)}` }));
  const midMajors = data.clubs
    .filter((c) => c.country && !BIG5.has(c.country) && c.series.length > 0)
    .map((c) => { const bp = c.series.reduce((b, s) => (s.rank < b.rank ? s : b), c.series[0]); return { name: c.name, country: c.country as string, best: bp.rank, season: bp.season }; })
    .sort((a, b) => a.best - b.best).slice(0, 10)
    .map((x) => ({ name: x.name, detail: `#${x.best} · ${x.country} · ${ss(x.season)}` }));

  return (
    <section className="rounded-xl border p-4 mb-6" style={cardStyle}>
      <h2 className="text-lg font-semibold mb-1">Superlatives</h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">All rank-based, so they hold across the 2018 coefficient-method change. The raw score is normalised per season and is not compared here.</p>

      <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)] mb-1.5">The Belt · European #1, season by season</div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {belt.map((b) => {
          const col = b.champ ? champColor.get(b.champ) : undefined;
          return (
            <Link key={b.season} href={`/teams/football/${b.season}`} title={b.champ ? `${b.season}: ${b.champ}` : b.season}
              className="inline-flex flex-col items-center rounded-md border px-2 py-1 text-center min-w-[64px] transition hover:border-[var(--accent)]"
              style={{ borderColor: col ?? "var(--border)", background: "var(--bg-card)", boxShadow: col ? `inset 3px 0 0 ${col}` : undefined }}>
              <span className="text-[9px] text-[var(--text-dim)] tabular-nums">{ss(b.season)}</span>
              <span className="text-[11px] font-semibold leading-tight" style={{ color: col ?? "var(--text-muted)" }}>{b.champ ?? "—"}</span>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Board title="Most seasons at #1" rows={titles} />
        <Board title="Most seasons in the top 5" rows={top5} />
        <Board title="Biggest overachievement (form − pedigree)" rows={overs} />
      </div>

      <div className="mt-3">
        <Board title="Best of the rest · highest peak rank outside the big five" rows={midMajors}
          note="Peak finishing rank within a season's full field. The ranking universe is UEFA clubs, so non-UEFA sides (South American, Asian, etc.) are not ranked here." />
      </div>
    </section>
  );
}
