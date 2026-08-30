import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { getCwsData } from "@/lib/cws";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { CappedList } from "@/app/_shared/Disclosure";

export const dynamicParams = false;
const PATH = "/teams/baseball/college";
const TITLE = "College Baseball & the College World Series";
const DESC =
  "The College World Series, complete: every champion and runner-up since 1947, and an all-time table of CWS titles, final appearances and trips to Omaha for all 121 programs to have reached the series.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

function School({ name, size = 18 }: { name: string | null; size?: number }) {
  if (!name) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <CrestIcon name={name} size={size} className="flex-shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export default function CollegeBaseballPage() {
  const d = getCwsData();
  const champs = d.champions;
  const teams = d.teams;
  const latest = champs[0];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/baseball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to International Baseball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <Link href="/teams/baseball" className="hover:underline">International Baseball</Link>{" / "}
        <span>College Baseball</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">College Baseball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The road to Omaha. NCAA Division I baseball&apos;s championship, the College World Series, has crowned a
          national champion every year since {d.first_year}. {latest && (<>The reigning champion is{" "}
          <strong className="text-[var(--text)]">{latest.champion}</strong> ({latest.year}).</>)}
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{d.editions}</strong> series ({d.first_year}–{d.last_year})</div>
          <div><strong className="text-[var(--text)] text-sm">{teams.length}</strong> programs to reach Omaha</div>
        </div>
      </header>

      <HubNav items={[
        { label: "Champions", href: "#champions" },
        { label: "All-time CWS Table", href: "#alltime" },
        { label: "Methodology", href: "#methodology" },
      ]} />

      {/* Champions roll */}
      <section className="mb-10">
        <h2 id="champions" className="text-lg font-semibold mb-1">Champions</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Every College World Series final, newest first.</p>

        {/* Mobile: one card per final, same data as the table below */}
        <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[520px] overflow-y-auto">
          <CappedList
            initial={12}
            noun="champions"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={champs.map((c) => (
            <div key={c.year} className="rounded-lg border p-3" style={card}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm" style={{ color: GOLD }}>
                  <School name={c.champion} />
                </span>
                <span className="text-xs tabular-nums text-[var(--text-muted)] flex-shrink-0" style={mono}>{c.year}</span>
              </div>
              <div className="mt-2 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                <div className="text-[var(--text-muted)]"><School name={c.runner_up} /></div>
              </div>
            </div>
          ))}
          />
        </div>

        <div className="rounded-xl border overflow-x-auto max-h-[520px] overflow-y-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[460px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium" style={{ color: GOLD }}>Champion</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
              </tr>
            </thead>
            <tbody>
              {champs.map((c) => (
                <tr key={c.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{c.year}</td>
                  <td className="py-1.5 px-3 font-semibold" style={{ color: GOLD }}><School name={c.champion} /></td>
                  <td className="py-1.5 px-3 text-[var(--text-muted)]"><School name={c.runner_up} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* All-time aggregate */}
      <section className="mb-10">
        <h2 id="alltime" className="text-lg font-semibold mb-1">All-time CWS table</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Ranked by national titles, then by total appearances. &quot;Finals&quot; counts trips to the championship
          series (since 1947); &quot;Omaha&quot; is total College World Series appearances.
        </p>

        {/* Mobile: one card per program, same data as the table below */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={12}
            noun="teams"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={teams.map((t, i) => (
            <div key={t.name} className="rounded-lg border p-3" style={card}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm"><School name={t.name} /></span>
                <span className="text-xs tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>#{i + 1}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Titles</div>
                  <div className="tabular-nums font-semibold" style={{ ...mono, color: t.titles > 0 ? GOLD : "var(--text-dim)" }}>{t.titles}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Finals</div>
                  <div className="tabular-nums" style={mono}>{t.finals}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Omaha</div>
                  <div className="tabular-nums" style={mono}>{t.apps}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Last title</div>
                  <div className="tabular-nums text-[var(--text-muted)]" style={mono}>{t.last_title ?? "—"}</div>
                </div>
              </div>
            </div>
          ))}
          />
        </div>

        <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[520px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">#</th>
                <th className="py-2 px-3 font-medium">Program</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Titles</th>
                <th className="py-2 px-3 text-right font-medium">Finals</th>
                <th className="py-2 px-3 text-right font-medium">Omaha</th>
                <th className="py-2 px-3 text-right font-medium">Last title</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t, i) => (
                <tr key={t.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 text-[var(--text-dim)] tabular-nums" style={mono}>{i + 1}</td>
                  <td className="py-1.5 px-3 font-medium"><School name={t.name} /></td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: t.titles > 0 ? GOLD : "var(--text-dim)" }}>{t.titles}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.finals}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.apps}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{t.last_title ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          Compiled from the College World Series record, {d.first_year}–{d.last_year}: each year&apos;s champion and
          runner-up plus every program&apos;s game-by-game appearances. Titles are CWS championships; finals are
          appearances in the championship series; Omaha counts every College World Series berth. Programs that
          reached early CWS editions but are no longer Division I (NYU, Tufts, Ithaca and others) appear without a
          crest.
        </p>
      </section>
    </main>
  );
}
