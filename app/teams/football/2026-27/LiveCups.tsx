import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { getFootballClubByName, monogramForFootball } from "@/lib/football";
import type { SuperCup, DomesticCup, CupFixture, LiveTeamRef } from "@/lib/clubFootballLive";

// Result-only rendering of super cups (domestic / European / international) and the
// status of domestic cups. Server components: club crest + slug resolved via lib/football;
// entrants the site does not track keep their api name and simply have no link.

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const isFinished = (s: string | null) => !!s && ["FT", "AET", "PEN", "AWD", "WO"].includes(s);
const fmtDate = (d: string | null): string => {
  if (!d) return "TBD";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "TBD" : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

function resolve(t: LiveTeamRef): { name: string; slug: string | null } {
  if (!t || (!t.name && !t.lookup)) return { name: "TBD", slug: null };
  const c = getFootballClubByName(t.lookup ?? "") ?? getFootballClubByName(t.name ?? "");
  return { name: c?.cur_name ?? t.lookup ?? t.name ?? "TBD", slug: c?.slug ?? null };
}

function ColorBall({ slug, name }: { slug: string | null; name: string }) {
  const m = monogramForFootball(name, slug ?? undefined);
  return <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 16, height: 16, fontSize: 7, fontWeight: 700 }} aria-hidden>{m.mono}</span>;
}

function Side({ t }: { t: LiveTeamRef }) {
  const r = resolve(t);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <TeamCrest name={r.name} size={16} fallback={<ColorBall slug={r.slug} name={r.name} />} />
      {r.slug ? <Link href={`/teams/football/${r.slug}`} className="hover:underline truncate">{r.name}</Link> : <span className="truncate">{r.name}</span>}
    </span>
  );
}

function FixtureLine({ f }: { f: CupFixture }) {
  const played = isFinished(f.status) && f.home_goals !== null && f.away_goals !== null;
  const right = played ? `${f.home_goals}–${f.away_goals}` : fmtDate(f.kickoff);
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <Side t={f.home} />
        <span className="text-[var(--text-dim)] flex-shrink-0">v</span>
        <Side t={f.away} />
      </span>
      <span className="tabular-nums text-[var(--text-muted)] flex-shrink-0" style={mono}>{right}</span>
    </div>
  );
}

export function SuperCupsSection({ cups }: { cups: SuperCup[] }) {
  if (cups.length === 0) return null;
  const CATS = ["Domestic", "European", "International"];
  return (
    <section id="supercups" className="mb-10 scroll-mt-24">
      <h2 className="text-lg font-semibold mb-3">Super Cups</h2>
      {CATS.map((cat) => {
        const list = cups.filter((c) => c.category === cat).sort((a, b) => a.country.localeCompare(b.country));
        if (list.length === 0) return null;
        return (
          <div key={cat} className="mb-4">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">{cat}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {list.map((c) => (
                <div key={c.comp_id} className="rounded-xl border p-3" style={cardStyle}>
                  <div className="text-sm font-semibold mb-1">{c.country !== "World" ? `${c.country} · ` : ""}{c.name}</div>
                  {c.fixtures.length > 0 ? c.fixtures.map((f) => <FixtureLine key={f.fixture_id} f={f} />) : <div className="text-xs text-[var(--text-dim)]">Not scheduled yet</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function DomesticCupsSection({ cups }: { cups: DomesticCup[] }) {
  if (cups.length === 0) return null;
  const sorted = cups.slice().sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  return (
    <section id="domestic-cups" className="mb-10 scroll-mt-24">
      <h2 className="text-lg font-semibold mb-3">Domestic cups</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {sorted.map((c) => {
          const recent = c.fixtures.filter((f) => isFinished(f.status)).slice(-5).reverse();
          const upcoming = c.fixtures.filter((f) => !isFinished(f.status)).slice(0, 5);
          return (
            <details key={c.comp_id} className="rounded-xl border overflow-hidden" style={cardStyle}>
              <summary className="cursor-pointer select-none px-4 py-2.5 font-semibold text-sm">{c.country} · {c.name}</summary>
              {/* Recent above Upcoming, stacked at every width (Ashwin 2026-08-02) — matches CompCard. */}
              <div className="border-t px-3 py-3 space-y-3" style={{ borderColor: "var(--border)" }}>
                {recent.length > 0 && (
                  <div><div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Recent</div>{recent.map((f) => <FixtureLine key={f.fixture_id} f={f} />)}</div>
                )}
                {upcoming.length > 0 && (
                  <div><div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Upcoming</div>{upcoming.map((f) => <FixtureLine key={f.fixture_id} f={f} />)}</div>
                )}
                {recent.length === 0 && upcoming.length === 0 && <div className="text-xs text-[var(--text-dim)]">No current fixtures.</div>}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
