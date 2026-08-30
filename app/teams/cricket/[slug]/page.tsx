import type { Metadata } from "next";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import { getRivalries } from "@/lib/rivalries";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CRICKET_FORMATS,
  getAllCricketSlugs,
  getCricketHub,
  getCricketTeamBySlug,
  getCricketTeamDetail,
  getCountrySlugForCricketTeam,
  winPct,
  type FormatRecord,
} from "@/lib/cricket";
import { flagCdnUrl } from "@/lib/international-display";
import { getCricketGamesForTeam } from "@/lib/cricketGames";
import CricketGreatestGames from "../CricketGreatestGames";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { CappedList } from "@/app/_shared/Disclosure";

// dynamicParams=true since 2026-08-07: this portal's data is now read at runtime
// (lib/liveData), so the weekly refresh can introduce a nation between builds.
// With dynamicParams=false that nation 404'd until someone happened to deploy.
// Unknown slugs now render on first request, same posture as /rankings/[slug],
// /states/[slug], /teams/cfb/[slug] and the rest. Safe on origin load because
// the Cloudflare rate-limit rule went in the same day.
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getAllCricketSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const team = await getCricketTeamBySlug(slug);
  if (!team) return {};
  const path = `/teams/cricket/${slug}`;
  const desc = `${team.name} men's international cricket: all-time Test, ODI and T20I records, recomputed ranking history, major-tournament honours, head-to-head ledgers and recent results.`;
  return {
    title: `${team.name} — International Cricket`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${team.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${team.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const HONOUR_ROWS: { key: "wc" | "t20wc" | "ct" | "wtc" | "asia"; label: string }[] = [
  { key: "wc", label: "Cricket World Cup" },
  { key: "t20wc", label: "T20 World Cup" },
  { key: "ct", label: "Champions Trophy" },
  { key: "wtc", label: "World Test Championship" },
  { key: "asia", label: "Asia Cup" },
];

function span(rec: FormatRecord): string {
  if (!rec.first || !rec.last) return "";
  return `${rec.first.slice(0, 4)}–${rec.last.slice(0, 4)}`;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{ ...card, ...mono }}>
      {children}
    </span>
  );
}

// Mobile card mini-stat: a small labeled value used inside the stacked
// card-view tables below (see house pattern in ChampionsTable.tsx).
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className="tabular-nums" style={mono}>{value}</div>
    </div>
  );
}

// Opponent names in the finals/h2h/recent tables are plain strings with no
// slug field, so derive a best-effort flag slug the same way
// RugbyFixtures.tsx does for its opponent column.
function slugifyName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function OppFlag({ name }: { name: string | null }) {
  if (!name) return null;
  const url = flagCdnUrl(slugifyName(name));
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden width={16} height={12} className="inline-block rounded-[1px] flex-shrink-0" style={{ objectFit: "cover" }} loading="lazy" decoding="async" />;
}

export default async function CricketTeamPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = await getCricketTeamBySlug(slug);
  const detail = await getCricketTeamDetail(slug);
  const teamGames = getCricketGamesForTeam(slug);
  const hub = await getCricketHub();
  if (!team || !detail) notFound();

  const countrySlug = getCountrySlugForCricketTeam(team);
  const trophies = hub ? hub.series_trophies.filter((t) => team.trophies_contested.includes(t.trophy)) : [];
  const h2hEntries = Object.entries(detail.h2h);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/cricket"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Cricket
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/cricket" className="hover:underline">International Cricket</Link>
        {" / "}
        <span>{team.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          {flagCdnUrl(team.slug, "40x30") && (
            <img src={flagCdnUrl(team.slug, "40x30")!} alt="" aria-hidden width={40} height={30} className="inline-block" loading="lazy" decoding="async" />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{team.name}</h1>
        <ChampionBadge items={getCurrentChampionships(team.name, "Cricket")} />
          {team.full_member ? <Chip>Full Member</Chip> : null}
          {!team.full_member && !team.composite ? <Chip>Associate</Chip> : null}
          {team.composite ? <Chip>Composite XI</Chip> : null}
          {team.trophies_held.map((t) => (
            <Chip key={t}>Holds: {t}</Chip>
          ))}
        </div>
        <div className="mt-2 text-sm text-[var(--text-muted)] tabular-nums" style={mono}>
          {team.overall.m.toLocaleString()} internationals · {span(team.overall)}
        </div>
        {countrySlug ? (
          <div className="mt-2 text-xs">
            <Link href={`/countries/${countrySlug}`} className="underline hover:text-[var(--accent)]">
              Country profile →
            </Link>
          </div>
        ) : null}
      </header>

      <RivalriesSection rivals={getRivalries(team.name, "Cricket")} />

      {/* ---------------- Records by format ---------------- */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">All-time record</h2>

        {/* Mobile: one card per format instead of a 9-column table. */}
        {/* Bounded at three formats (Test/ODI/T20I) — no cap needed. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden" data-mobile-uncapped>
          {CRICKET_FORMATS.map((f) => {
            const rec = team.formats[f];
            if (!rec) return null;
            const pct = winPct(rec);
            return (
              <div key={f} className="rounded-xl border p-3" style={card}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{f}</span>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>{span(rec)}</span>
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs mt-2">
                  <Stat label="M" value={rec.m} />
                  <Stat label="W" value={rec.w} />
                  <Stat label="L" value={rec.l} />
                  <Stat label="D" value={rec.d} />
                  <Stat label="T" value={rec.t} />
                  <Stat label="NR" value={rec.nr} />
                  <Stat label="Win %" value={pct !== null ? pct : "—"} />
                </div>
              </div>
            );
          })}
          {team.other_internationals ? (
            <div className="rounded-xl border p-3" style={card}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-[var(--text-muted)]">Other internationals</span>
                <span className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>{span(team.other_internationals)}</span>
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs mt-2">
                <Stat label="M" value={team.other_internationals.m} />
                <Stat label="W" value={team.other_internationals.w} />
                <Stat label="L" value={team.other_internationals.l} />
                <Stat label="D" value={team.other_internationals.d} />
                <Stat label="T" value={team.other_internationals.t} />
                <Stat label="NR" value={team.other_internationals.nr} />
                <Stat label="Win %" value="—" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Format</th>
                <th className="py-2 px-3 font-medium">Span</th>
                <th className="py-2 px-3 text-right font-medium">M</th>
                <th className="py-2 px-3 text-right font-medium">W</th>
                <th className="py-2 px-3 text-right font-medium">L</th>
                <th className="py-2 px-3 text-right font-medium">D</th>
                <th className="py-2 px-3 text-right font-medium">T</th>
                <th className="py-2 px-3 text-right font-medium">NR</th>
                <th className="py-2 px-3 text-right font-medium">Win %</th>
              </tr>
            </thead>
            <tbody>
              {CRICKET_FORMATS.map((f) => {
                const rec = team.formats[f];
                if (!rec) return null;
                const pct = winPct(rec);
                return (
                  <tr key={f} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-3 font-medium">{f}</td>
                    <td className="py-2 px-3 tabular-nums" style={mono}>{span(rec)}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{rec.m}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{rec.w}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{rec.l}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{rec.d}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{rec.t}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{rec.nr}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{pct !== null ? pct : "—"}</td>
                  </tr>
                );
              })}
              {team.other_internationals ? (
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 font-medium text-[var(--text-muted)]">Other internationals</td>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{span(team.other_internationals)}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{team.other_internationals.m}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{team.other_internationals.w}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{team.other_internationals.l}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{team.other_internationals.d}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{team.other_internationals.t}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{team.other_internationals.nr}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>—</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Rankings ---------------- */}
      {Object.keys(team.rankings).length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Citizen of Nowhere ranking</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {CRICKET_FORMATS.map((f) => {
              const rk = team.rankings[f];
              if (!rk) return null;
              const m1 = team.months_at_1[f];
              return (
                <div key={f} className="rounded-xl border p-4" style={card}>
                  <div className="font-semibold mb-2">{f}</div>
                  <div className="grid grid-cols-2 gap-y-1 text-sm">
                    <span className="text-[var(--text-muted)]">Current</span>
                    <span className="text-right tabular-nums" style={mono}>
                      {rk.current_rank !== null ? `#${rk.current_rank} (${rk.current_rating !== null ? rk.current_rating.toFixed(1) : ""})` : "unranked"}
                    </span>
                    <span className="text-[var(--text-muted)]">Peak rank</span>
                    <span className="text-right tabular-nums" style={mono}>#{rk.peak_rank} ({rk.peak_rank_first})</span>
                    <span className="text-[var(--text-muted)]">Peak rating</span>
                    <span className="text-right tabular-nums" style={mono}>{rk.peak_rating.toFixed(1)}</span>
                    <span className="text-[var(--text-muted)]">Months at #1</span>
                    <span className="text-right tabular-nums" style={mono}>{m1}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ---------------- Greatest Games ---------------- */}
      {teamGames.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">Greatest games</h2>
          <p className="text-[var(--text-muted)] text-sm mb-4 max-w-2xl">
            {team.name}&apos;s most storied internationals across all three formats, by Game Score
            (closeness, stakes and the strength of both sides), with a &#9733; for the all-time classics.
          </p>
          <CricketGreatestGames games={teamGames} teamSlug={slug} />
        </section>
      ) : null}

      {/* ---------------- Honours ---------------- */}
      {team.honours ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Major honours</h2>
          <div className="rounded-xl border p-4" style={card}>
            <div className="grid grid-cols-1 gap-2 text-sm">
              {HONOUR_ROWS.map((row) => {
                const line = team.honours ? team.honours[row.key] : null;
                if (!line || (line.titles === 0 && line.ru === 0)) return null;
                return (
                  <div key={row.key} className="flex items-baseline justify-between border-b py-1 gap-4"
                       style={{ borderColor: "var(--border)" }}>
                    <span>{row.label}</span>
                    <span className="text-right">
                      {line.titles > 0 ? (
                        <span>
                          <span className="font-semibold tabular-nums" style={mono}>{line.titles}×</span>
                          <span className="text-xs text-[var(--text-muted)]"> ({line.title_years})</span>
                        </span>
                      ) : null}
                      {line.ru > 0 ? (
                        <span className="text-xs text-[var(--text-dim)]">
                          {line.titles > 0 ? " · " : ""}RU {line.ru} ({line.ru_years})
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------- Major finals ---------------- */}
      {detail.finals.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Major-tournament finals</h2>

          {/* Mobile: one card per final instead of a 4-column table. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="finals"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={detail.finals.slice().reverse().map((f, i) => (
              <div key={i} className="rounded-xl border p-3" style={card}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold tabular-nums" style={mono}>{f.year ?? "—"}</span>
                  <span className={f.outcome === "Won" || f.outcome === "Shared" ? "font-semibold text-xs" : "text-xs text-[var(--text-muted)]"}>
                    {f.outcome}
                  </span>
                </div>
                <div className="text-sm mt-1">{f.major}</div>
                {f.opp ? (
                  <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                    vs <OppFlag name={f.opp} />{f.opp}
                  </div>
                ) : null}
                <div className="text-xs text-[var(--text-dim)] mt-1">{f.detail}</div>
              </div>
            ))}
            />
          </div>

          <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Year</th>
                  <th className="py-2 px-3 font-medium">Tournament</th>
                  <th className="py-2 px-3 font-medium">Opponent</th>
                  <th className="py-2 px-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {detail.finals.slice().reverse().map((f, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-3 tabular-nums" style={mono}>{f.year}</td>
                    <td className="py-2 px-3">{f.major}</td>
                    <td className="py-2 px-3">{f.opp}</td>
                    <td className="py-2 px-3">
                      <span className={f.outcome === "Won" || f.outcome === "Shared" ? "font-semibold" : "text-[var(--text-muted)]"}>
                        {f.outcome}
                      </span>
                      <span className="text-xs text-[var(--text-dim)]"> — {f.detail}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---------------- Series trophies ---------------- */}
      {trophies.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Series trophies</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {trophies.map((t) => (
              <div key={t.trophy} className="rounded-xl border p-4" style={card}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t.trophy}</span>
                  {t.holder === team.name ? <Chip>Holder</Chip> : null}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {t.contested_by} · {t.format} · <span style={mono}>{t.first}–{t.last}</span> ·{" "}
                  <span style={mono}>{t.series}</span> series
                </div>
                {t.holder !== team.name && t.holder ? (
                  <div className="text-xs text-[var(--text-dim)] mt-1">Held by {t.holder}</div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------------- Head-to-head ---------------- */}
      {h2hEntries.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Head-to-head</h2>

          {/* Mobile: one card per opponent instead of a many-column table. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="rows"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={h2hEntries.map(([opp, recs]) => {
              const total = CRICKET_FORMATS.reduce((acc, f) => {
                const r = recs[f];
                return acc + (r ? r.m : 0);
              }, 0);
              return (
                <div key={opp} className="rounded-xl border p-3" style={card}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium flex items-center gap-1"><OppFlag name={opp} />{opp}</span>
                    <span className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>{total} matches</span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs mt-2">
                    {CRICKET_FORMATS.map((f) => {
                      const r = recs[f];
                      return (
                        <Stat
                          key={f}
                          label={f}
                          value={r ? `${r.w}–${r.l}${r.d > 0 ? ` (${r.d}D)` : ""}` : "—"}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            />
          </div>

          <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Opponent</th>
                  {CRICKET_FORMATS.map((f) => (
                    <th key={f} className="py-2 px-3 text-right font-medium">{f} (W–L)</th>
                  ))}
                  <th className="py-2 px-3 text-right font-medium">Matches</th>
                </tr>
              </thead>
              <tbody>
                {h2hEntries.map(([opp, recs]) => {
                  const total = CRICKET_FORMATS.reduce((acc, f) => {
                    const r = recs[f];
                    return acc + (r ? r.m : 0);
                  }, 0);
                  return (
                    <tr key={opp} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 px-3 font-medium">{opp}</td>
                      {CRICKET_FORMATS.map((f) => {
                        const r = recs[f];
                        return (
                          <td key={f} className="py-1.5 px-3 text-right tabular-nums" style={mono}>
                            {r ? `${r.w}–${r.l}${r.d > 0 ? ` (${r.d}D)` : ""}` : "—"}
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---------------- Recent matches ---------------- */}
      {detail.recent.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Recent internationals</h2>

          {/* Mobile: one card per match instead of a 5-column table. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="rows"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={detail.recent.map((m, i) => (
              <div key={i} className="rounded-xl border p-3" style={card}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs tabular-nums text-[var(--text-muted)]" style={mono}>{m.date}</span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ ...mono, background: "var(--bg-card)", border: "1px solid var(--border)" }}>{m.format}</span>
                </div>
                <div className="text-sm mt-1 flex items-center gap-1">
                  vs <OppFlag name={m.opp} />{m.opp}
                </div>
                <div className="text-xs mt-1">
                  <span className={m.result === "W" ? "font-semibold" : "text-[var(--text-muted)]"} style={mono}>
                    {m.result}
                  </span>
                  <span className="text-[var(--text-dim)]"> {m.detail}</span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {m.venue}{m.city ? `, ${m.city}` : ""}
                </div>
              </div>
            ))}
            />
          </div>

          <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium">Fmt</th>
                  <th className="py-2 px-3 font-medium">Opponent</th>
                  <th className="py-2 px-3 font-medium">Result</th>
                  <th className="py-2 px-3 font-medium">Venue</th>
                </tr>
              </thead>
              <tbody>
                {detail.recent.map((m, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums whitespace-nowrap" style={mono}>{m.date}</td>
                    <td className="py-1.5 px-3" style={mono}>{m.format}</td>
                    <td className="py-1.5 px-3">{m.opp}</td>
                    <td className="py-1.5 px-3">
                      <span className={m.result === "W" ? "font-semibold" : "text-[var(--text-muted)]"} style={mono}>
                        {m.result}
                      </span>
                      <span className="text-xs text-[var(--text-dim)]"> {m.detail}</span>
                    </td>
                    <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">
                      {m.venue}{m.city ? `, ${m.city}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-[var(--text-dim)]">
        From the project cricket workbook: results since 1877, recomputed monthly ICC
        rankings, and curated honours. See the{" "}
        <Link href="/teams/cricket#methodology" className="underline hover:text-[var(--accent)]">
          methodology
        </Link>{" "}
        on the hub.
      </p>
    </main>
  );
}
