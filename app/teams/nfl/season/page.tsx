import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import HubNav from "@/app/teams/HubNav";
import { SectionHead } from "@/app/_shared/SectionHead";
import { getNflEloIndex } from "@/lib/nflElo";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// The discovery surface for 107 season hubs. Without it /teams/nfl/season is a
// 404 and the only way to reach 1932 is to type it.

export const revalidate = 86400;

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };

const PAGE_TITLE = "Every NFL season since 1920";
const PAGE_DESCRIPTION =
  "One hub per NFL season from 1920 to today, each showing every team's Elo rating week by week, the final standings and the biggest movers, on a single model.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/teams/nfl/season" },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: `${BASE_URL}/teams/nfl/season`,
    type: "website",
  },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default async function NflSeasonsIndex() {
  const index = await getNflEloIndex().catch(() => null);
  const rows = index?.seasons ?? [];
  if (!rows.length) return null;

  const decades = new Map<number, typeof rows>();
  for (const r of rows) {
    const d = Math.floor(r.season / 10) * 10;
    (decades.get(d) ?? decades.set(d, []).get(d)!).push(r);
  }
  const multi = rows.filter((r) => r.leagues.length > 1);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/nfl" className="hover:underline">NFL</Link>{" / "}
        <span>Seasons</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">🏈 Every NFL season since 1920</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          {rows.length} seasons, each with every team&rsquo;s rating week by week. The same model runs the whole
          way through, so a 1925 team and a 2025 team are measured the same way.
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          {index?.meta.team_weeks.toLocaleString()} team-weeks · {rows[0].season}–{rows[rows.length - 1].season} · built {index?.meta.generated_at.slice(0, 10)}
        </div>
      </header>

      <HubNav items={[
        { label: "By decade", href: "#decades" },
        { label: "Two leagues at once", href: "#rivals" },
        { label: "NFL hub", href: "/teams/nfl" },
      ]} />

      <section className="mb-12">
        <SectionHead
          id="decades"
          title="By decade"
          sub="The strongest team at the end of each season, by rating."
          more="Strongest by rating is not the same as champion, and the seasons where they disagree are the interesting ones."
        />
        <div className="space-y-6">
          {[...decades.entries()].sort((a, b) => b[0] - a[0]).map(([d, list]) => (
            <div key={d}>
              <h3 className="text-sm font-semibold mb-2 tabular-nums" style={MONO}>{d}s</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {list.slice().reverse().map((r) => (
                  <Link
                    key={r.season}
                    href={`/teams/nfl/season/${r.season}`}
                    className="rounded-lg border px-3 py-2 min-w-0 hover:border-[var(--accent)] transition-colors"
                    style={CARD}
                  >
                    <span className="tabular-nums font-semibold text-sm" style={MONO}>{r.season}</span>
                    {r.leagues.length > 1 ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{r.leagues.join(" + ")}</span>
                    ) : null}
                    {r.status !== "final" ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">preseason only</span>
                    ) : null}
                    <span className="block text-[12px] text-[var(--text-muted)] truncate">
                      {r.top ? <>{r.top.name} <span className="tabular-nums" style={MONO}>{r.top.elo.toFixed(0)}</span></> : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {multi.length ? (
        <section className="mb-6">
          <SectionHead
            id="rivals"
            title="The years two leagues ran at once"
            sub="Rated in one pool, so the comparison is finally possible."
            more="The AAFC and the AFL each played alongside the NFL and each had its own table. Nobody could say how the leagues compared, because nobody rated them together. These seasons do."
          />
          <p className="text-sm text-[var(--text-muted)] max-w-3xl">
            {multi.map((r, i) => (
              <span key={r.season}>
                {i > 0 ? ", " : ""}
                <Link href={`/teams/nfl/season/${r.season}`} className="text-[var(--accent)] hover:underline tabular-nums" style={MONO}>{r.season}</Link>
              </span>
            ))}
            . Every team in those years is rated against every other, whichever league it played in.
          </p>
        </section>
      ) : null}
    </main>
  );
}
