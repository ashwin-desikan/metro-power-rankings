import Link from "next/link";
import type { CSSProperties } from "react";
import { getNflEloIndex, getNflEloSeason } from "@/lib/nflElo";
import { nflSlugForCanonical, logoUrlFor, monogramFor, MONOGRAM_BY_SLUG } from "@/lib/nfl";
import { SectionHead } from "@/app/_shared/SectionHead";

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
// the whole preseason - no movement is drawn rather than a column of zeroes.
// The first movement of a season is therefore week 1 against the preseason
// seed, which is a real week of football; the seed itself is a carry-over from
// the last Super Bowl and moves nobody, so nothing is drawn for it.
//
// 🔴 AN ARROW AND A NUMBER, NOT A SIGNED NUMBER. Direction is the thing read
// first and colour alone cannot carry it: the site's palette rules put the
// diverging pair in the colourblind floor band, where a second encoding is
// required rather than optional. The triangle IS that encoding, which is the
// same bargain DivergingBar makes with its zero line.
//
// 🔴 A 32-ROW LIST IS A COLUMN PROBLEM, NOT A DISCLOSURE PROBLEM. The first
// build ran one row per team down the full width: 32 rows of 38px, most of it
// empty, and the rest of the hub pushed a screen and a half down. A ranked list
// reads perfectly well in columns, so it is now 2 columns on a phone and 4 on a
// desktop, filled DOWN each column so 1 to 8 still reads top to bottom. Every
// team stays on the page at every width; nothing is hidden behind a control,
// which is what §2's "same information, different density" actually asks for.
// Desktop height: about 250px for all 32.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };

/** Split into `n` runs so a column-major grid still reads 1, 2, 3 downward. */
function chunk<T>(xs: T[], n: number): T[][] {
  const size = Math.ceil(xs.length / n);
  return Array.from({ length: n }, (_, i) => xs.slice(i * size, (i + 1) * size));
}

/** A row that is a link when the franchise has a page, and a div when it does
 *  not, so the tap target is the row either way. */
function RowTag({ href, children, ...rest }: { href?: string } & React.ComponentProps<"div">) {
  if (href) {
    const { className, style, title } = rest;
    return <Link href={href} className={className} style={style} title={title}>{children}</Link>;
  }
  return <div {...rest}>{children}</div>;
}

export default async function EloPowerRankings({
  columns = 4,
  bare = false,
}: {
  /** Ranked columns at the widest breakpoint. 2 when the board sits beside the
   *  standings rather than across the page. */
  columns?: 2 | 4;
  /** Drop the SectionHead: the page is heading the pair instead. */
  bare?: boolean;
} = {}) {
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
        short: t.team ?? t.name,
        full: [t.city, t.team].filter(Boolean).join(" ") || t.name,
        div: t.div,
        elo: w?.e ?? t.end,
        rec: w?.rec,
        move: prev && !w?.seed ? w!.e - prev.e : null,
        // Rank change over the same week, which is what "moved up" means to a
        // reader even though the rating is what actually moved.
        prevElo: prev && !w?.seed ? prev.e : null,
        week: w?.w ?? 0,
        slug,
        logo: slug ? logoUrlFor(slug) : null,
        mono: slug && MONOGRAM_BY_SLUG[slug] ? monogramFor(slug) : null,
      };
    })
    .sort((a, b) => b.elo - a.elo)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // Last week's order, so a row can say it climbed four places and not only
  // that it gained eleven rating points.
  const prevOrder = rows
    .filter((r) => r.prevElo != null)
    .sort((a, b) => (b.prevElo ?? 0) - (a.prevElo ?? 0))
    .map((r) => r.name);
  const prevRank = new Map(prevOrder.map((n, i) => [n, i + 1]));

  const week = Math.max(...rows.map((r) => r.week));
  const played = week > 0;
  const anyMove = rows.some((r) => r.move != null);
  // 4 columns is the widest layout, so the runs are cut for it; at narrower
  // widths the same four runs stack, and the order still reads 1 to 32.
  const runs = chunk(rows, columns);

  return (
    <section className={bare ? "" : "mb-10"}>
      {bare ? null : <SectionHead
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
      />}
      <div className="rounded-xl border overflow-hidden" style={CARD}>
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
          <span style={MONO}>{played ? `after week ${week}` : "preseason seed"}</span>
          <span style={MONO}>{anyMove ? "week · rating" : "rating"}</span>
        </div>
        <div className={`grid grid-cols-2 ${columns === 4 ? "md:grid-cols-3 xl:grid-cols-4" : ""}`}>
          {runs.map((run, ci) => (
            <div key={ci} className={ci ? "border-t sm:border-t-0 md:border-l" : ""} style={{ borderColor: "var(--border)" }}>
              {run.map((r) => (
                <RowTag
                  key={r.name}
                  {...(r.slug ? { href: `/teams/nfl/${r.slug}` } : {})}
                  title={(() => {
                    const was = prevRank.get(r.name);
                    const places = was ? was - r.rank : null;
                    return `${r.full}${r.div ? ` · ${r.div}` : ""}` +
                      `${r.rec ? ` · ${r.rec[0]}-${r.rec[1]}${r.rec[2] ? `-${r.rec[2]}` : ""}` : ""}` +
                      ` · rating ${r.elo.toFixed(0)}` +
                      (r.move != null
                        ? `, ${r.move >= 0 ? "up" : "down"} ${Math.abs(r.move).toFixed(0)} on the week` +
                          (places ? ` and ${places > 0 ? "up" : "down"} ${Math.abs(places)} ${Math.abs(places) === 1 ? "place" : "places"}` : ", no change of place")
                        : "");
                  })()}
                  /* 🔴 THE ROW IS THE TAP TARGET, NOT THE NAME IN IT. §6: a
                     link wrapped around 20px of text in a dense row gives the
                     thumb a third of the row. The whole row is the link, and it
                     clears 44px on a phone while staying 26px where a pointer
                     does the aiming. */
                  className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 min-h-11 sm:min-h-0 border-t first:border-t-0 hover:bg-[var(--bg-card-hover)] transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="w-4 text-right tabular-nums text-[var(--text-dim)] text-[10px] flex-shrink-0" style={MONO}>{r.rank}</span>
                  {r.logo ? (
                    <img src={r.logo} alt="" width={18} height={18} className="flex-shrink-0 object-contain" style={{ width: 18, height: 18 }} loading="lazy" decoding="async" />
                  ) : r.mono ? (
                    <span aria-hidden className="inline-grid place-items-center rounded-full flex-shrink-0"
                      style={{ background: r.mono.bg, color: r.mono.fg, width: 18, height: 18, fontSize: 7, fontWeight: 700 }}>{r.mono.mono}</span>
                  ) : (
                    <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 18, height: 18, border: "1px solid var(--border)" }} />
                  )}
                  <span className="min-w-0 flex-1 text-[12.5px] truncate">{r.short}</span>
                  {anyMove ? (
                    <span className="w-12 text-right text-[11px] tabular-nums flex-shrink-0 whitespace-nowrap"
                      style={{ ...MONO, color: r.move == null || Math.abs(r.move) < 0.5 ? "var(--text-dim)" : r.move > 0 ? "var(--div-pos)" : "var(--div-neg)" }}>
                      {r.move == null ? (
                        ""
                      ) : Math.abs(r.move) < 0.5 ? (
                        <span title="unchanged on the week">&ndash;</span>
                      ) : (
                        <>
                          <span aria-hidden>{r.move > 0 ? "\u25B2" : "\u25BC"}</span>
                          <span className="sr-only">{r.move > 0 ? "up" : "down"} </span>
                          {Math.abs(r.move).toFixed(0)}
                        </>
                      )}
                    </span>
                  ) : null}
                  <span className="w-10 text-right text-[12.5px] font-semibold tabular-nums flex-shrink-0" style={MONO}>{r.elo.toFixed(0)}</span>
                </RowTag>
              ))}
            </div>
          ))}
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
