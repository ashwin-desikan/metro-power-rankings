import type { Metadata } from "next";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import { getRivalries } from "@/lib/rivalries";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import RugbyGreatestGames from "@/app/teams/rugby-union/RugbyGreatestGames";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllRugbySlugs,
  getCountrySlugForRugbyTeam,
  getRugbyTeamBySlug,
  getRugbyTeamDetail,
  rugbyWinPct,
} from "@/lib/rugbyUnion";
import { getRugbyGamesForTeam } from "@/lib/rugbyGames";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllRugbySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const team = getRugbyTeamBySlug(slug);
  if (!team) return {};
  const path = `/teams/rugby-union/${slug}`;
  const desc = `${team.name} test rugby: all-time record, championship and World Cup honours, season-by-season standings, head-to-head ledgers and recent results.`;
  return {
    title: `${team.name} — International Rugby Union`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${team.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${team.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{ ...card, ...mono }}>
      {children}
    </span>
  );
}

function yearsStr(years: number[]): string {
  return years.join(", ");
}

export default async function RugbyTeamPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = getRugbyTeamBySlug(slug);
  const detail = getRugbyTeamDetail(slug);
  if (!team || !detail) notFound();

  const countrySlug = getCountrySlugForRugbyTeam(team);
  const rec = team.record;
  const pct = rec ? rugbyWinPct(rec) : null;
  const c = team.championships;
  const w = team.rwc;
  const h2hEntries = Object.entries(detail.h2h);
  const teamGames = getRugbyGamesForTeam(slug);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/rugby-union"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Rugby Union
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/rugby-union" className="hover:underline">International Rugby Union</Link>
        {" / "}
        <span>{team.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          {flagCdnUrl(team.slug, "40x30") && (
            <img src={flagCdnUrl(team.slug, "40x30")!} alt="" aria-hidden width={40} height={30} className="inline-block" loading="lazy" decoding="async" />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{team.name}</h1>
        <ChampionBadge items={getCurrentChampionships(team.name, "Rugby Union")} />
          {team.six_nations ? <Chip>Six Nations</Chip> : null}
          {team.sanzaar ? <Chip>SANZAAR</Chip> : null}
          {w && w.titles > 0 ? <Chip>World Champions {yearsStr(w.title_years)}</Chip> : null}
        </div>
        {rec ? (
          <div className="mt-2 text-sm text-[var(--text-muted)] tabular-nums" style={mono}>
            {rec.m.toLocaleString()} tests · {rec.first ? rec.first.slice(0, 4) : ""}–{rec.last ? rec.last.slice(0, 4) : ""}
            {pct !== null ? <> · {pct}% won</> : null}
          </div>
        ) : null}
        {countrySlug ? (
          <div className="mt-2 text-xs">
            <Link href={`/countries/${countrySlug}`} className="underline hover:text-[var(--accent)]">
              Country profile →
            </Link>
          </div>
        ) : null}
      </header>

      <RivalriesSection rivals={getRivalries(team.name, "Rugby Union")} />

      {/* ---------------- Record + ranking ---------------- */}
      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rec ? (
            <div className="rounded-xl border p-4" style={card}>
              <div className="font-semibold mb-2">All-time test record</div>
              <div className="grid grid-cols-2 gap-y-1 text-sm">
                <span className="text-[var(--text-muted)]">Played</span>
                <span className="text-right tabular-nums" style={mono}>{rec.m.toLocaleString()}</span>
                <span className="text-[var(--text-muted)]">Won / Lost / Drawn</span>
                <span className="text-right tabular-nums" style={mono}>{rec.w}–{rec.l}–{rec.d}</span>
                <span className="text-[var(--text-muted)]">Points for / against</span>
                <span className="text-right tabular-nums" style={mono}>
                  {rec.pf.toLocaleString()} / {rec.pa.toLocaleString()}
                </span>
                <span className="text-[var(--text-muted)]">Win rate</span>
                <span className="text-right tabular-nums" style={mono}>{pct !== null ? `${pct}%` : "—"}</span>
              </div>
            </div>
          ) : null}
          {team.ranking ? (
            <div className="rounded-xl border p-4" style={card}>
              <div className="font-semibold mb-2">World Rugby ranking</div>
              <div className="grid grid-cols-2 gap-y-1 text-sm">
                <span className="text-[var(--text-muted)]">Current</span>
                <span className="text-right tabular-nums" style={mono}>
                  {team.ranking.current !== null ? `#${team.ranking.current}` : "unranked"}
                </span>
                <span className="text-[var(--text-muted)]">Peak (since 2003)</span>
                <span className="text-right tabular-nums" style={mono}>
                  {team.ranking.peak !== null ? `#${team.ranking.peak}` : "—"}
                  {team.ranking.peak_first ? ` (${team.ranking.peak_first})` : ""}
                </span>
                <span className="text-[var(--text-muted)]">Weeks at #1</span>
                <span className="text-right tabular-nums" style={mono}>{team.ranking.weeks_at_1}</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ---------------- Honours ---------------- */}
      {(c && (c.five_six_titles > 0 || c.trc_titles > 0)) || (w && w.apps > 0) ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Honours</h2>
          <div className="rounded-xl border p-4 text-sm" style={card}>
            <div className="grid grid-cols-1 gap-2">
              {w && w.apps > 0 ? (
                <div className="flex items-baseline justify-between border-b py-1 gap-4" style={{ borderColor: "var(--border)" }}>
                  <span>Rugby World Cup</span>
                  <span className="text-right">
                    {w.titles > 0 ? (
                      <span>
                        <span className="font-semibold tabular-nums" style={mono}>{w.titles}×</span>
                        <span className="text-xs text-[var(--text-muted)]"> ({yearsStr(w.title_years)})</span>
                        {" · "}
                      </span>
                    ) : null}
                    <span className="text-xs text-[var(--text-muted)]">
                      {w.apps} tournaments · {w.finals} finals · {w.sf} semi-finals
                    </span>
                  </span>
                </div>
              ) : null}
              {c && c.five_six_titles > 0 ? (
                <div className="flex items-baseline justify-between border-b py-1 gap-4" style={{ borderColor: "var(--border)" }}>
                  <span>Home / Five / Six Nations</span>
                  <span className="text-right">
                    <span className="font-semibold tabular-nums" style={mono}>{c.five_six_titles}×</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {" "}(incl. shared) · {c.grand_slams} Grand Slams · {c.triple_crowns} Triple Crowns
                    </span>
                  </span>
                </div>
              ) : null}
              {c && c.trc_titles > 0 ? (
                <div className="flex items-baseline justify-between border-b py-1 gap-4" style={{ borderColor: "var(--border)" }}>
                  <span>Tri Nations / Rugby Championship</span>
                  <span className="text-right">
                    <span className="font-semibold tabular-nums" style={mono}>{c.trc_titles}×</span>
                    <span className="text-xs text-[var(--text-muted)]"> ({yearsStr(c.trc_years)})</span>
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------- Greatest tests ---------------- */}
      {teamGames.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">{team.name}&apos;s greatest tests</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            This nation&apos;s highest-rated internationals by Game Score, drawn from the all-time
            ranking on the{" "}
            <Link href="/teams/rugby-union#greatest-games" className="underline hover:text-[var(--accent)]">hub</Link>.
          </p>
          <RugbyGreatestGames games={teamGames} teamSlug={slug} />
        </section>
      ) : null}

      {/* ---------------- Season by season ---------------- */}
      {detail.seasons.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">Season by season</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Championship and World Cup campaigns on file; W marks a title, GS a Grand Slam,
            TC a Triple Crown.
          </p>
          <div className="rounded-xl border overflow-x-auto max-h-[480px] overflow-y-auto" style={card}>
            <table className="w-full text-sm min-w-[560px]">
              <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Season</th>
                  <th className="py-2 px-3 font-medium">Competition</th>
                  <th className="py-2 px-3 text-right font-medium">Place</th>
                  <th className="py-2 px-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {detail.seasons.map((s, i) => {
                  const notes: string[] = [];
                  if (s.trophy) notes.push("W");
                  if (s.grand_slam) notes.push("GS");
                  if (s.triple_crown) notes.push("TC");
                  if (s.rwc_f) notes.push("Final");
                  else if (s.rwc_sf) notes.push("SF");
                  else if (s.rwc_qf) notes.push("QF");
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 px-3 tabular-nums" style={mono}>{s.season}</td>
                      <td className="py-1.5 px-3">
                        {s.comp.replace(/^\d{4}(-\d{2})?\s*/, "")}
                        {s.pool ? <span className="text-xs text-[var(--text-dim)]"> · {s.pool}</span> : null}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>
                        {s.place !== null ? s.place : "—"}
                      </td>
                      <td className="py-1.5 px-3 font-medium" style={mono}>{notes.join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---------------- Head-to-head ---------------- */}
      {h2hEntries.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Head-to-head</h2>
          <div className="rounded-xl border overflow-x-auto" style={card}>
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Opponent</th>
                  <th className="py-2 px-3 text-right font-medium">Tests</th>
                  <th className="py-2 px-3 text-right font-medium">W</th>
                  <th className="py-2 px-3 text-right font-medium">L</th>
                  <th className="py-2 px-3 text-right font-medium">D</th>
                </tr>
              </thead>
              <tbody>
                {h2hEntries.map(([opp, r]) => (
                  <tr key={opp} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 font-medium">{opp}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.m}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.w}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.l}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---------------- Recent ---------------- */}
      {detail.recent.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Recent tests</h2>
          <div className="rounded-xl border overflow-x-auto" style={card}>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium">Opponent</th>
                  <th className="py-2 px-3 font-medium">Result</th>
                  <th className="py-2 px-3 font-medium">Competition</th>
                  <th className="py-2 px-3 font-medium">Venue</th>
                </tr>
              </thead>
              <tbody>
                {detail.recent.map((m, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums whitespace-nowrap" style={mono}>{m.date}</td>
                    <td className="py-1.5 px-3">{m.opp}</td>
                    <td className="py-1.5 px-3 tabular-nums" style={mono}>
                      <span className={m.result === "W" ? "font-semibold" : "text-[var(--text-muted)]"}>
                        {m.result} {m.score}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{m.comp}</td>
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
        From the project rugby workbook (results since 1871) and the weekly World Rugby
        rankings since 2003. See the{" "}
        <Link href="/teams/rugby-union#methodology" className="underline hover:text-[var(--accent)]">
          methodology
        </Link>{" "}
        on the hub.
      </p>
    </main>
  );
}
