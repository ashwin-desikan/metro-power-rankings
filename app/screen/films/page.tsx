import type { Metadata } from "next";
import { getScreen } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import SortTable, { type Col } from "../../sound/SortTable";
import ScreenNav from "../ScreenNav";

export const dynamic = "force-static";

const TITLE = "Screen of the Metros — Films";
const DESC =
  "The definitive films of the last century, scored across critical standing, audience acclaim, box-office dominance and cultural longevity — the canon and the blockbusters on one board.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/films" },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/films`, type: "website" },
};

export default function ScreenFilmsPage() {
  const f = getScreen();
  if (!f) return <main className="mx-auto max-w-6xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  const hasRatings = f.films.some((fl) => fl.rating != null);
  const cols: Col[] = [
    { key: "rank", label: "#", kind: "rank" },
    { key: "title", label: "Film", bold: true },
    { key: "year", label: "Year", align: "right", numeric: true },
    { key: "score", label: "Score", align: "right", numeric: true },
    { key: "points", label: "Box office", align: "right", numeric: true, mut: true },
    { key: "grossM", label: "Gross $m", align: "right", numeric: true, mut: true },
    { key: "genre", label: "Genre", mut: true },
    { key: "director", label: "Director", mut: true },
    ...(hasRatings ? [{ key: "rating", label: "TMDb", align: "right", numeric: true, mut: true } as Col] : []),
    { key: "honours", label: "Honours", mut: true },
  ];
  const rows = f.films.slice(0, 250).map((fl) => ({
    title: fl.basis === "rentals" ? `${fl.title} *` : fl.title,
    year: fl.year, score: fl.score, points: fl.points,
    grossM: fl.gross != null ? Math.round(fl.gross / 1e6) : null,
    genre: fl.genre || "—",
    director: fl.directors.join(", ") || "—",
    rating: fl.rating ?? null,
    honours: (fl.honours ?? []).join(" · "),
  }));
  const gd = f.genreDecades;
  const GENRE_COLORS = ["#5B8DEF", "#E06C75", "#02A95B", "#D9A038", "#9333EA"];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">The films</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          The definitive top 250, scored across four pillars: critical standing (the 500-greatest
          canon and major awards), audience acclaim (TMDb), box-office dominance, and cultural
          longevity (weeks at number one). The blend leans critical, so the canon and the
          blockbusters share one board. Films marked * are from years reported on a rentals basis.
        </p>
      </header>
      <SortTable rows={rows} cols={cols} initialSort="score" />

      {gd && gd.rows.length > 3 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold mb-1 text-[var(--text)]">Genre eras</h2>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
            Share of each decade&apos;s top-grossing films carrying the era&apos;s dominant genres
            (Wikidata classifications; films can carry several). The musical&apos;s collapse and
            action&apos;s takeover are the century of Hollywood in two lines.
          </p>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <svg viewBox="0 0 720 240" className="w-full h-auto" role="img" aria-label="Genre share of top-grossing films by decade">
              {[0, 20, 40, 60, 80].map((t) => (
                <g key={t}>
                  <line x1={36} x2={684} y1={214 - (t / 80) * 178} y2={214 - (t / 80) * 178} stroke="var(--border)" strokeWidth="1" />
                  <text x={30} y={217 - (t / 80) * 178} textAnchor="end" fontSize="9" fill="var(--text-dim)">{t}%</text>
                </g>
              ))}
              {gd.rows.map((r) => (
                <text key={r.decade} x={36 + ((r.decade - gd.rows[0].decade) / (gd.rows[gd.rows.length - 1].decade - gd.rows[0].decade)) * 648} y={232} textAnchor="middle" fontSize="9" fill="var(--text-dim)">{`${r.decade}s`}</text>
              ))}
              {gd.genres.map((g, gi) => (
                <polyline
                  key={g}
                  fill="none"
                  stroke={GENRE_COLORS[gi % GENRE_COLORS.length]}
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  points={gd.rows.map((r) => `${(36 + ((r.decade - gd.rows[0].decade) / (gd.rows[gd.rows.length - 1].decade - gd.rows[0].decade)) * 648).toFixed(1)},${(214 - (Math.min(80, r[g] ?? 0) / 80) * 178).toFixed(1)}`).join(" ")}
                />
              ))}
            </svg>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mt-1">
              {gd.genres.map((g, gi) => (
                <span key={g}>
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: GENRE_COLORS[gi % GENRE_COLORS.length] }} />
                  <span className="text-[var(--text-muted)] capitalize">{g}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {hasRatings ? (
        <p className="text-xs text-[var(--text-dim)] mt-6">
          Ratings: This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      ) : null}
    </main>
  );
}
