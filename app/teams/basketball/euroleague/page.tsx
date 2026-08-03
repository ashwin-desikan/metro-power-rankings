import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getEuroleague } from "@/lib/basketball";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import EuroleagueClubsTable from "./EuroleagueClubsTable";

export const dynamicParams = false;
const PATH = "/teams/basketball/euroleague";
const TITLE = "EuroLeague";
const DESC =
  "Europe's club basketball crown: every champion across 69 seasons, Final Four history, and the all-time table, from the workbook's season-by-season record.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function EuroleaguePage() {
  const el = getEuroleague();
  if (!el) return null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/basketball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Basketball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/basketball" className="hover:underline">International Basketball</Link>
        {" / "}
        <span>EuroLeague</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">EuroLeague</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Europe&apos;s club crown across {el.seasons} seasons, from the European
          Champions Cup era to this season&apos;s title: every champion, Final Four
          history, and the all-time club table. Title chips appear on each club&apos;s
          metro card.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Champions", href: "#champions" },
          { label: "All-time Clubs", href: "#clubs" },
        ]}
      />

      {/* ---------------- Champions roll ---------------- */}
      <section className="mb-10">
        <h2 id="champions" className="text-lg font-semibold mb-1">Roll of honour</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Most titled:{" "}
          {el.most_titled.slice(0, 5).map((m, i) => (
            <span key={m.name}>
              {i > 0 ? " · " : ""}
              <span className="font-medium text-[var(--text)]">{m.name}</span>
              <span style={mono}> {m.titles}</span>
            </span>
          ))}
        </p>
        <p className="text-[11px] text-[var(--text-dim)] mb-3">
          The Final Four column lists the two beaten semi-finalists, alongside the champion and
          runner-up shown here. Final Four data begins with the 1987&ndash;88 season; earlier
          seasons were decided without a Final Four.
        </p>
        {/* Mobile: one card per season instead of a cramped 4-column table */}
        <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[480px] overflow-y-auto">
          {el.roll.map((r) => (
            <div key={r.season} className="rounded-lg border p-3" style={card}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{r.champion}</span>
                <span className="text-xs tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>{r.season}</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                  <div className="text-[var(--text-muted)]">{r.ru}</div>
                </div>
                {r.f4_others.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Final Four</div>
                    <div className="text-[var(--text-dim)]">{r.f4_others.join(", ")}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border overflow-x-auto max-h-[480px] overflow-y-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[480px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Season</th>
                <th className="py-2 px-3 font-medium">Champion</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
                <th className="py-2 px-3 font-medium">Final Four</th>
              </tr>
            </thead>
            <tbody>
              {el.roll.map((r) => (
                <tr key={r.season} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums whitespace-nowrap" style={mono}>{r.season}</td>
                  <td className="py-1.5 px-3 font-semibold">{r.champion}</td>
                  <td className="py-1.5 px-3 text-[var(--text-muted)]">{r.ru}</td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-dim)]">{r.f4_others.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- All-time clubs ---------------- */}
      <section className="mb-10">
        <h2 id="clubs" className="text-lg font-semibold mb-1">All-time clubs</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every club in the workbook&apos;s record. Filter to the current EuroLeague
          (this season&apos;s clubs) or show all teams.
        </p>
        <EuroleagueClubsTable clubs={el.clubs} />
      </section>
    </main>
  );
}
