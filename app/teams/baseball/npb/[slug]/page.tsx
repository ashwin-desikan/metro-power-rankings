import type { Metadata } from "next";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllNpbSlugs, getNpbTeamBySlug, getNpbTeamDetail } from "@/lib/npb";
import TopTeamChip from "@/app/teams/TopTeamChip";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllNpbSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const team = getNpbTeamBySlug(slug);
  if (!team) return {};
  const path = `/teams/baseball/npb/${slug}`;
  const desc = `${team.name} in Nippon Professional Baseball: Japan Series titles, league pennants, and season-by-season record.`;
  return {
    title: `${team.name} — NPB`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${team.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${team.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

export default async function NpbTeamPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = getNpbTeamBySlug(slug);
  const detail = getNpbTeamDetail(slug);
  if (!team || !detail) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/baseball/npb"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span>
          Back to NPB
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/baseball" className="hover:underline">International Baseball</Link>
        {" / "}
        <Link href="/teams/baseball/npb" className="hover:underline">NPB</Link>
        {" / "}
        <span>{team.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <CrestIcon name={team.name} size={40} className="flex-shrink-0" />
          <h1 className="text-3xl font-semibold tracking-tight">{team.name}</h1>
        <ChampionBadge items={getCurrentChampionships(team.name, "Baseball")} />
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={card}>
            <span className="text-[var(--text-muted)]">{team.division} League</span>
            {team.js_titles > 0 ? (
              <span className="font-semibold" style={{ color: GOLD }}>{team.js_titles}× Japan Series</span>
            ) : null}
          </span>
          <TopTeamChip names={[team.name]} metro={team.metro} />
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {detail.first_season ? `In NPB since ${detail.first_season}. ` : ""}
          All-time {team.w.toLocaleString()}–{team.l.toLocaleString()}{team.t ? `–${team.t}` : ""} ({team.win_pct.toFixed(3)}).
        </p>
        {(detail.city || detail.metro_slug) ? (
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            {detail.city ? <span>{detail.city}</span> : null}
            {detail.city && detail.metro_slug ? <span aria-hidden> · </span> : null}
            {detail.metro_slug ? (
              <Link href={`/rankings/${detail.metro_slug}`} className="underline hover:text-[var(--accent)]">
                {detail.metro} metro →
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* ---------------- Honours ---------------- */}
      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2" style={{ color: GOLD }}>Japan Series</div>
            <div className="text-sm">
              <span className="tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{team.js_titles}</span>
              <span className="text-[var(--text-muted)]"> titles</span>
              {team.js_title_years.length > 0 ? (
                <div className="text-xs text-[var(--text-muted)] mt-1" style={mono}>{team.js_title_years.join(", ")}</div>
              ) : null}
              {team.js_runnerup > 0 ? (
                <div className="text-xs text-[var(--text-dim)] mt-2">
                  Runner-up {team.js_runnerup}× ({team.js_ru_years.join(", ")})
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">League pennants</div>
            <div className="text-sm">
              <span className="tabular-nums font-semibold" style={mono}>{team.pennants}</span>
              <span className="text-[var(--text-muted)]"> {team.division} League titles</span>
              {team.pennant_years.length > 0 ? (
                <div className="text-xs text-[var(--text-muted)] mt-1" style={mono}>{team.pennant_years.join(", ")}</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Season-by-season ---------------- */}
      {detail.seasons.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Season by season</h2>

          {/* Mobile: one card per season instead of a 9-column table nobody
              can read at 375px without scrolling sideways. Same
              `detail.seasons` data as the desktop table below. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[560px] overflow-y-auto pr-0.5">
            {detail.seasons.map((s) => {
              const champ = team.js_title_years.includes(s.year);
              const pennant = String(s.pos).trim() === "1";
              return (
                <div
                  key={s.year + "-card"}
                  className="rounded-lg border p-3"
                  style={card}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm tabular-nums" style={mono}>
                      {s.year}
                      {champ ? <span title="Japan Series champion" style={{ color: GOLD }}> ★</span> : null}
                    </div>
                    <div
                      className="text-xs whitespace-nowrap"
                      style={s.team && s.team !== team.name ? { color: "var(--accent)" } : { color: "var(--text-muted)" }}
                      title={s.team && s.team !== team.name ? "Former franchise name" : undefined}
                    >
                      {s.team || team.name}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">League</div>
                      <div className="text-[var(--text-muted)]">{s.league}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Pos</div>
                      <div className="tabular-nums" style={{ ...mono, color: pennant ? GOLD : undefined, fontWeight: pennant ? 600 : undefined }}>{s.pos}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W–L–T</div>
                      <div className="tabular-nums" style={mono}>{s.w}–{s.l}–{s.t}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Pct</div>
                      <div className="tabular-nums" style={mono}>{s.pct ?? ""}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">GB</div>
                      <div className="tabular-nums text-[var(--text-dim)]" style={mono}>{s.gb ?? ""}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden sm:block rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto" style={card}>
            <table className="w-full text-sm min-w-[520px]">
              <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Year</th>
                  <th className="py-2 px-3 font-medium">Team</th>
                  <th className="py-2 px-3 font-medium">League</th>
                  <th className="py-2 px-3 text-right font-medium">Pos</th>
                  <th className="py-2 px-3 text-right font-medium">W</th>
                  <th className="py-2 px-3 text-right font-medium">L</th>
                  <th className="py-2 px-3 text-right font-medium">T</th>
                  <th className="py-2 px-3 text-right font-medium">Pct</th>
                  <th className="py-2 px-3 text-right font-medium">GB</th>
                </tr>
              </thead>
              <tbody>
                {detail.seasons.map((s) => {
                  const champ = team.js_title_years.includes(s.year);
                  const pennant = String(s.pos).trim() === "1";
                  return (
                    <tr key={s.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 px-3 tabular-nums" style={mono}>
                        {s.year}
                        {champ ? <span title="Japan Series champion" style={{ color: GOLD }}> ★</span> : null}
                      </td>
                      <td
                        className="py-1.5 px-3 whitespace-nowrap"
                        style={s.team && s.team !== team.name ? { color: "var(--accent)" } : { color: "var(--text-muted)" }}
                        title={s.team && s.team !== team.name ? "Former franchise name" : undefined}
                      >
                        {s.team || team.name}
                      </td>
                      <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{s.league}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={{ ...mono, color: pennant ? GOLD : undefined, fontWeight: pennant ? 600 : undefined }}>{s.pos}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{s.w}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{s.l}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{s.t}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{s.pct ?? ""}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{s.gb ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-dim)] mt-2">★ Japan Series champion · gold position = league pennant.</p>
        </section>
      ) : null}
    </main>
  );
}
