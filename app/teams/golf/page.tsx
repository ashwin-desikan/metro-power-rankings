import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getGolfMajors, byTournament, latestByTournament, nationSlug, type Champion, type Leader } from "@/lib/majors";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/golf";
const TITLE = "Golf's Majors";
const DESC =
  "Every men's major champion — The Open, U.S. Open, PGA Championship and the Masters — plus the Ryder Cup, all-time leaders, and the metros that have hosted them.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

const TOUR_META: Record<string, { id: string; short: string }> = {
  "The Open Championship": { id: "the-open", short: "The Open" },
  "U.S. Open": { id: "us-open", short: "U.S. Open" },
  "PGA Championship": { id: "pga", short: "PGA" },
  "Masters Tournament": { id: "masters", short: "Masters" },
};

function Flag({ nation }: { nation: string | null }) {
  const url = flagCdnUrl(nationSlug(nation) ?? "");
  if (!url) return null;
  return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" />;
}

function MetroCell({ c }: { c: Champion }) {
  if (!c.metroSlug) return <span className="text-[var(--text-dim)]">{c.venue ?? "—"}</span>;
  return (
    <Link href={`/rankings/${c.metroSlug}#sports`} className="hover:text-[var(--accent)]">
      {c.venue ? `${c.venue}, ` : ""}{c.metroName}
    </Link>
  );
}

function ChampTable({ rows }: { rows: Champion[] }) {
  return (
    <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={card}>
      <table className="w-full text-sm min-w-[620px]">
        <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 px-3 font-medium">Year</th>
            <th className="py-2 px-3 font-medium">Champion</th>
            <th className="py-2 px-3 font-medium">Nation</th>
            <th className="py-2 px-3 font-medium">Host venue &amp; metro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={`${c.year}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1.5 px-3 tabular-nums" style={mono}>{c.year}</td>
              <td className="py-1.5 px-3 font-medium">{c.champion}{c.note === "dual" ? " *" : ""}</td>
              <td className="py-1.5 px-3 text-[var(--text-muted)]"><Flag nation={c.nation} />{c.nation ?? "—"}</td>
              <td className="py-1.5 px-3 text-[var(--text-muted)]"><MetroCell c={c} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderTable({ leaders, tours }: { leaders: Leader[]; tours: string[] }) {
  return (
    <div className="rounded-xl border overflow-x-auto max-h-[520px] overflow-y-auto" style={card}>
      <table className="w-full text-sm min-w-[640px]">
        <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 px-3 font-medium">Player</th>
            <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Majors</th>
            {tours.map((t) => <th key={t} className="py-2 px-3 text-right font-medium">{TOUR_META[t]?.short ?? t}</th>)}
          </tr>
        </thead>
        <tbody>
          {leaders.filter((l) => l.total >= 2).map((l) => (
            <tr key={l.player} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1.5 px-3 font-medium"><Flag nation={l.nation} />{l.player}</td>
              <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{l.total}</td>
              {tours.map((t) => <td key={t} className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{l.byTour[t] ?? ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GolfHubPage() {
  const data = getGolfMajors();
  if (!data) return null;
  const grouped = byTournament(data.champions);
  const latest = latestByTournament(data.champions);
  const ryderTally = data.ryderTally;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <span>Golf</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Golf&apos;s Majors</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The four men&apos;s majors since 1860, the Ryder Cup, and the all-time
          leaders — read through the lens this project cares about: the places that
          host them. Every champion links to the metro that staged the win.
        </p>
      </header>

      <HubNav
        items={[
          { label: "The Open", href: "#the-open" },
          { label: "U.S. Open", href: "#us-open" },
          { label: "PGA", href: "#pga" },
          { label: "Masters", href: "#masters" },
          { label: "All-time leaders", href: "#leaders" },
          { label: "By nation", href: "#by-nation" },
          { label: "Ryder Cup", href: "#ryder-cup" },
          { label: "Venues & metros", href: "#venues" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* recent winners */}
      <section className="mb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {data.tournaments.map((t) => {
          const c = latest.get(t);
          if (!c) return null;
          return (
            <div key={t} className="rounded-xl border p-4" style={card}>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{TOUR_META[t]?.short ?? t} · {c.year}</div>
              <div className="mt-1 font-semibold"><Flag nation={c.nation} />{c.champion}</div>
              <div className="mt-1 text-xs text-[var(--text-muted)]"><MetroCell c={c} /></div>
            </div>
          );
        })}
      </section>

      {/* per-major champion tables */}
      {data.tournaments.map((t) => (
        <section key={t} className="mb-10">
          <h2 id={TOUR_META[t]?.id ?? t} className="text-lg font-semibold mb-1">{t}</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Every champion, most recent first.</p>
          <ChampTable rows={grouped.get(t) ?? []} />
        </section>
      ))}

      {/* leaders */}
      <section className="mb-10">
        <h2 id="leaders" className="text-lg font-semibold mb-1">All-time leaders</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Players with two or more majors, by total.</p>
        <LeaderTable leaders={data.leaders} tours={data.tournaments} />
      </section>

      {/* by nation */}
      <section className="mb-10">
        <h2 id="by-nation" className="text-lg font-semibold mb-3">By nation</h2>
        <div className="rounded-xl border overflow-x-auto max-h-[440px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[320px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Majors</th>
              </tr>
            </thead>
            <tbody>
              {data.byNation.map((n) => (
                <tr key={n.nation} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3"><Flag nation={n.nation} />{n.nation}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{n.titles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ryder Cup */}
      <section className="mb-10">
        <h2 id="ryder-cup" className="text-lg font-semibold mb-1">Ryder Cup</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3" style={mono}>
          United States {ryderTally["United States"] ?? 0} · Europe {ryderTally["Europe"] ?? 0} · Great Britain {ryderTally["Great Britain"] ?? 0} · Tied {ryderTally["Tied"] ?? 0}
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[680px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Winner</th>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Host venue &amp; metro</th>
              </tr>
            </thead>
            <tbody>
              {data.ryder.map((r) => (
                <tr key={r.edition} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{r.year}</td>
                  <td className="py-1.5 px-3 font-medium">{r.winner}</td>
                  <td className="py-1.5 px-3 tabular-nums text-[var(--text-muted)]" style={mono}>{r.score}</td>
                  <td className="py-1.5 px-3 text-[var(--text-muted)]">
                    {r.metroSlug
                      ? <Link href={`/rankings/${r.metroSlug}#sports`} className="hover:text-[var(--accent)]">{r.venue}, {r.metroName}</Link>
                      : <span>{r.venue}, {r.host}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* venues & metros */}
      <section className="mb-10">
        <h2 id="venues" className="text-lg font-semibold mb-1">Venues &amp; metros</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Metros that have hosted a men&apos;s major, by number of majors staged. Each links to its page.
        </p>
        <div className="flex flex-wrap gap-2">
          {data.hostMetros.map((m) => (
            <Link key={m.metroSlug} href={`/rankings/${m.metroSlug}#sports`} className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:text-[var(--text)] hover:border-[var(--text-dim)]"
              style={{ background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
              {m.metroName} <span style={mono} className="text-[var(--text-dim)]">{m.count}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* methodology */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          Champions cover The Open Championship from 1860, the U.S. Open from 1895, the
          PGA Championship from 1916 and the Masters from 1934, through the current
          season. Career totals use the running count of professional majors. Players
          marked with an asterisk held dual nationality; the primary nation is shown.
          This hub tracks the men&apos;s majors only; an LPGA and women&apos;s-majors
          layer is a known gap. Host metros are joined to each champion through the
          venue that staged the event, so every winner links to the place it happened.
        </p>
      </section>
    </main>
  );
}
