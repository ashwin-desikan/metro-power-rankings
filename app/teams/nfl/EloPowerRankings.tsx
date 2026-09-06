import Link from "next/link";
import type { CSSProperties } from "react";
import { getNflEloIndex, getNflEloSeason } from "@/lib/nflElo";
import { nflSlugForCanonical, logoUrlFor, monogramFor, MONOGRAM_BY_SLUG } from "@/lib/nfl";
import { SectionHead } from "@/app/_shared/SectionHead";
import { CappedList } from "@/app/_shared/Disclosure";

// The live season's Elo, on the hub, all season long.
//
// 🔴 THE SAME RATING THE SEASON PAGES USE, NOT A SECOND ONE. This reads the
// live season's shard and shows its most recent rated week. Nothing is computed
// here: a power ranking that disagreed with /teams/nfl/season/2026 would be a
// second model wearing the same name.
//
// 🔴 IT SAYS WHICH WEEK IT IS. A power ranking with no date is a power ranking
// nobody can check. Before a snap it says so, and shows the seed as a seed.
//
// 🔴 MOVEMENT IS AGAINST LAST WEEK, NOT AGAINST THE SEED. "Up 4 since August"
// stops being interesting in October. Where there is no previous rated week -
// the whole preseason - no movement column is drawn rather than a column of
// zeroes.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };

export default async function EloPowerRankings() {
  const index = await getNflEloIndex().catch(() => null);
  const latest = index?.seasons[index.seasons.length - 1];
  if (!latest) return null;
  const data = await getNflEloSeason(latest.season).catch(() => null);
  if (!data?.teams?.length) return null;

  const rows = data.teams
    .map((t) => {
      const w = t.weeks[t.weeks.length - 1];
      const prev = t.weeks.length > 1 ? t.weeks[t.weeks.length - 2] : null;
      const slug = nflSlugForCanonical(t.name);
      return {
        name: t.name,
        label: [t.city, t.team].filter(Boolean).join(" ") || t.name,
        div: t.div,
        elo: w?.e ?? t.end,
        rec: w?.rec,
        move: prev && !w?.seed ? (w!.e - prev.e) : null,
        week: w?.w ?? 0,
        slug,
        logo: slug ? logoUrlFor(slug) : null,
        mono: slug && MONOGRAM_BY_SLUG[slug] ? monogramFor(slug) : null,
      };
    })
    .sort((a, b) => b.elo - a.elo);

  const week = Math.max(...rows.map((r) => r.week));
  const played = week > 0;
  const anyMove = rows.some((r) => r.move != null);

  const items = rows.map((r, i) => (
    <div key={r.name} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
      <span className="w-6 text-right tabular-nums text-[var(--text-dim)] text-xs flex-shrink-0" style={MONO}>{i + 1}</span>
      {r.logo ? (
        <img src={r.logo} alt="" width={22} height={22} className="flex-shrink-0 object-contain" style={{ width: 22, height: 22 }} loading="lazy" decoding="async" />
      ) : r.mono ? (
        <span aria-hidden className="inline-grid place-items-center rounded-full flex-shrink-0"
          style={{ background: r.mono.bg, color: r.mono.fg, width: 22, height: 22, fontSize: 8, fontWeight: 700 }}>{r.mono.mono}</span>
      ) : (
        <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 22, height: 22, border: "1px solid var(--border)" }} />
      )}
      <span className="min-w-0 flex-1 text-sm truncate">
        {r.slug ? (
          <Link href={`/teams/nfl/${r.slug}`} className="hover:text-[var(--accent)] hover:underline">{r.label}</Link>
        ) : r.label}
        {r.rec ? (
          <span className="ml-2 text-xs text-[var(--text-dim)] tabular-nums" style={MONO}>
            {r.rec[0]}-{r.rec[1]}{r.rec[2] ? `-${r.rec[2]}` : ""}
          </span>
        ) : null}
      </span>
      {anyMove ? (
        <span className="w-12 text-right text-xs tabular-nums flex-shrink-0" style={{ ...MONO, color: r.move == null ? "var(--text-dim)" : r.move > 0 ? "var(--div-pos)" : r.move < 0 ? "var(--div-neg)" : "var(--text-dim)" }}>
          {r.move == null ? "—" : `${r.move > 0 ? "+" : r.move < 0 ? "−" : ""}${Math.abs(r.move).toFixed(0)}`}
        </span>
      ) : null}
      <span className="w-14 text-right text-sm font-semibold tabular-nums flex-shrink-0" style={MONO}>{r.elo.toFixed(0)}</span>
    </div>
  ));

  return (
    <section className="mb-10">
      <SectionHead
        id="power"
        title={`Elo power rankings, ${latest.season}`}
        sub={played
          ? `Every team's rating after week ${week}, and what the week did to it.`
          : "Where every team starts, before a snap has been played."}
        more={
          "Elo moves after every game by the margin and by how surprising the result was, so this is a running answer to " +
          "“how good is this team right now” rather than a table of who has won most. 1500 is the league average by " +
          "construction. It is the same rating that runs the season pages back to 1920, so a 2026 team and a 1966 team are on one scale."
        }
      />
      <div className="rounded-xl border overflow-hidden" style={CARD}>
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
          <span style={MONO}>{played ? `after week ${week}` : "preseason seed"}</span>
          <span style={MONO}>{anyMove ? "week · rating" : "rating"}</span>
        </div>
        {/* A div list, not an <ol>: CappedList inserts a <details> among the
            rows and only <li> may sit inside an <ol>. The rank is printed, so
            nothing is lost. */}
        <div>
          <CappedList items={items} initial={10} noun="teams" />
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--text-dim)]">
        Full detail, week by week, on the{" "}
        <Link href={`/teams/nfl/season/${latest.season}`} className="text-[var(--accent)] hover:underline">{latest.season} season page</Link>
        {" "}· every season since 1920 in the{" "}
        <Link href="/teams/nfl/season" className="text-[var(--accent)] hover:underline">season archive</Link>.
      </p>
    </section>
  );
}
