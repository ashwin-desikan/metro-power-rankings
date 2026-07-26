import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { getFootballClubByName, monogramForFootball } from "@/lib/football";
import type { LiveComp, LiveFixture, LiveTeamRef } from "@/lib/clubFootballLive";

// Fixtures & Results for a continental competition, fed from the unified
// api-football -> Supabase -> ISR bundle (lib/clubFootballLive getClubCompetitions).
// Server component: every team is resolved to its canonical Lookup name (never the
// raw api name) and linked to its Club Football page when one exists. This replaces
// the old euro-comps.json feed, which rendered raw api names with no crest or link.

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const IN_PLAY = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);

function fmtKickoff(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "TBD";
  const day = d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day} · ${time} UTC`;
}

// Prefer the canonical Lookup name for display; use the club page's own current
// name (and slug) when the club is one the site tracks. The raw api name is only
// a last resort when no canonical name is on file.
function resolve(t: LiveTeamRef): { name: string; slug: string | null } {
  const c = getFootballClubByName(t.lookup ?? "") ?? getFootballClubByName(t.name ?? "");
  return { name: c?.cur_name ?? t.lookup ?? t.name ?? "TBD", slug: c?.slug ?? null };
}

function ColorBall({ slug, name }: { slug: string | null; name: string }) {
  const m = monogramForFootball(name, slug ?? undefined);
  return <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 16, height: 16, fontSize: 7, fontWeight: 700 }} aria-hidden>{m.mono}</span>;
}

function Side({ t, mirror }: { t: LiveTeamRef; mirror?: boolean }) {
  const r = resolve(t);
  const crest = <TeamCrest name={r.name} size={16} fallback={<ColorBall slug={r.slug} name={r.name} />} />;
  const label = r.slug
    ? <Link href={`/teams/football/${r.slug}`} className="hover:underline truncate">{r.name}</Link>
    : <span className="truncate">{r.name}</span>;
  return (
    <span className={`flex-1 inline-flex items-center gap-1.5 min-w-0 ${mirror ? "justify-end text-right flex-row-reverse" : "justify-start"}`}>
      {crest}
      {label}
    </span>
  );
}

function MatchRow({ m }: { m: LiveFixture }) {
  const played = !!m.status && FINISHED.has(m.status) && m.home_goals != null && m.away_goals != null;
  const inPlay = !!m.status && IN_PLAY.has(m.status) && m.home_goals != null && m.away_goals != null;
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 border-b last:border-b-0 text-sm" style={{ borderColor: "var(--border)" }}>
      <Side t={m.home} mirror />
      <div className="tabular-nums font-semibold text-center min-w-[64px]" style={mono}>
        {played || inPlay ? (
          <span>{m.home_goals} <span className="text-[var(--text-dim)]">–</span> {m.away_goals}</span>
        ) : (
          <span className="text-[11px] font-normal text-[var(--text-muted)] whitespace-nowrap">{fmtKickoff(m.kickoff)}</span>
        )}
      </div>
      <Side t={m.away} />
      {m.round ? <div className="hidden sm:block w-32 text-right text-[10px] text-[var(--text-muted)] truncate">{m.round}</div> : null}
    </div>
  );
}

function Section({ title, dot, items }: { title: string; dot?: string; items: LiveFixture[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        {dot ? <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: dot }} aria-hidden /> : null}
        <h3 className="text-xs uppercase tracking-wide font-semibold text-[var(--text-muted)]">{title}</h3>
      </div>
      <div className="rounded-lg border overflow-hidden" style={cardStyle}>
        {items.map((m) => <MatchRow key={m.fixture_id} m={m} />)}
      </div>
    </div>
  );
}

export default function LiveCompFixtures({ comp, season }: { comp: LiveComp; season: string | null }) {
  const fx = comp.fixtures ?? [];
  const byKo = (dir: number) => (a: LiveFixture, b: LiveFixture) => dir * String(a.kickoff ?? "").localeCompare(String(b.kickoff ?? ""));
  const live = fx.filter((f) => f.status && IN_PLAY.has(f.status)).sort(byKo(1));
  const recent = fx.filter((f) => f.status && FINISHED.has(f.status)).sort(byKo(-1)).slice(0, 12);
  const upcoming = fx.filter((f) => !(f.status && (FINISHED.has(f.status) || IN_PLAY.has(f.status)))).sort(byKo(1)).slice(0, 20);
  if (!live.length && !recent.length && !upcoming.length) return null;
  return (
    <section id="fixtures" className="mb-8 scroll-mt-20">
      <h2 className="text-xl font-bold mb-3">{season ? `${season} ` : ""}Fixtures &amp; Results</h2>
      <Section title="Live" dot="#22c55e" items={live} />
      <Section title="Upcoming" items={upcoming} />
      <Section title="Recent Results" items={recent} />
    </section>
  );
}
