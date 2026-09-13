import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { loadLiveStandings, TodayStrip, LeagueAccordion, slugId } from "./liveData";
import { sportIcon } from "@/lib/sportLabels";

export const revalidate = 120;

const PATH = "/sports/standings";
const TITLE = "Live Standings";
const DESC =
  "Every live league table the site tracks, in one place: European club football, Copa Libertadores, the four North American majors, college football rankings, MLS, the WSL, Liga F, NWSL and Women\u2019s Champions League, WNBA, the EuroLeague, the Top 14, Gallagher Premiership and Champions Cup, CFL, NPB, AFL, NRL and F1. Refreshed through each season.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: [ogImage(TITLE, PATH)], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};


// The data (league blocks, event strips) is built in ./liveData so /api/on-today can
// serve the same On today list to the homepage ticker. This file is metadata + JSX.
export default async function LiveStandingsPage() {
  const { groups, today } = await loadLiveStandings();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-3">
        <Link href="/sports"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span>
          Back to Sports
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>Live Standings</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Live Standings</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Every live league table the site tracks, gathered on one page and grouped by sport, each
          formatted to match its own league page. Green-shaded rows sit in playoff position today;
          PO/Finals and title odds are our own simulations, refreshed daily.
        </p>
        <details className="mt-1.5 max-w-3xl">
          <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">
            How this is measured
          </summary>
          <div className="mt-2 text-sm text-[var(--text-muted)]">
            In-season leagues open expanded; leagues between seasons open collapsed with records zeroed
            until they restart. The green rule marks the playoff cut, and title odds simulate each
            remaining schedule.
          </div>
        </details>
      </header>

      <HubNav items={groups.map((g) => ({ label: g.sport, href: `#${slugId(g.sport)}` }))} />

      {(today.upcoming.length > 0 || today.results.length > 0 || today.coming.length > 0) && (
        <div className="space-y-3 mb-8">
          <TodayStrip title="On today" events={today.upcoming} kind="upcoming" noun="fixture" sportOrder={groups.map((g) => g.sport)} />
          <TodayStrip title="Recent results" events={today.results} kind="results" noun="result" sportOrder={groups.map((g) => g.sport)} />
          <TodayStrip title="Coming up" events={today.coming} kind="upcoming" noun="fixture" sportOrder={groups.map((g) => g.sport)} />
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] italic">Standings are unavailable right now.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.sport} id={slugId(g.sport)} className="scroll-mt-24">
              <h2 className="text-lg font-semibold mb-3">
                {sportIcon(g.sport) ? <span aria-hidden className="mr-1.5">{sportIcon(g.sport)}</span> : null}
                {g.sport}
              </h2>
              {g.columns ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                  <div className="space-y-3">
                    {g.columns[0].map((b) => <LeagueAccordion key={b.league} block={b} />)}
                  </div>
                  <div className="space-y-3">
                    {g.columns[1].map((b) => <LeagueAccordion key={b.league} block={b} />)}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                  {g.blocks.map((b) => (
                    <div key={b.league} className={b.cols ? "lg:col-span-2" : undefined}>
                      <LeagueAccordion block={b} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {/* Runs during parsing, after every accordion exists and before the
          reader can click one: promote the desktop default to the real `open`
          attribute and drop the marker, so the CSS reveal hands over to native
          <details> toggling with no visible change. Server component, so there
          is nothing for React to hydrate here. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){var d=window.matchMedia('(min-width:640px)').matches;" +
            "document.querySelectorAll('details[data-desktop-default-open]').forEach(function(e){" +
            "if(d)e.open=true;e.removeAttribute('data-desktop-default-open');});" +
            // Opening a sport in On today / Recent results / Coming up opens every
            // competition under it. Capture phase: `toggle` does not bubble. Only on
            // open, so a reader who folds one competition away keeps that choice until
            // they collapse and reopen the sport itself.
            "document.addEventListener('toggle',function(ev){var t=ev.target;" +
            "if(!t||!t.hasAttribute||!t.hasAttribute('data-open-children')||!t.open)return;" +
            "t.querySelectorAll('details').forEach(function(c){c.open=true;});},true);" +
            "})();",
        }}
      />
    </main>
  );
}
