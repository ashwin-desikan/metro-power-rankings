import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getTennisMajors, nationSlug, type Champion, type Leader } from "@/lib/majors";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/tennis";
const TITLE = "Tennis's Grand Slams";
const DESC =
  "Every men's and women's singles Grand Slam champion — Australian Open, Roland-Garros, Wimbledon and the US Open — plus the Davis Cup, all-time leaders, and the metros that host them.";

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
  "Australian Open": { id: "australian", short: "Australian Open" },
  "French Open": { id: "french", short: "French Open" },
  "Wimbledon": { id: "wimbledon", short: "Wimbledon" },
  "US Open": { id: "us-open", short: "US Open" },
};

function Flag({ nation }: { nation: string | null }) {
  const url = flagCdnUrl(nationSlug(nation) ?? "");
  if (!url) return null;
  return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" />;
}

function Champ({ c }: { c?: Champion }) {
  if (!c) return <span className="text-[var(--text-dim)]">—</span>;
  return <span><Flag nation={c.nation} />{c.champion}{c.note === "neutral" ? " †" : ""}</span>;
}

function MetroCell({ c }: { c?: Champion }) {
  if (!c || !c.metroSlug) return <span className="text-[var(--text-dim)]">—</span>;
  return <Link href={`/rankings/${c.metroSlug}#sports`} className="hover:text-[var(--accent)]">{c.metroName}</Link>;
}

type SlamRow = { year: number; men?: Champion; women?: Champion; host?: Champion };
function slamRows(champs: Champion[], tournament: string): SlamRow[] {
  const m = new Map<number, SlamRow>();
  for (const c of champs) {
    if (c.tournament !== tournament) continue;
    const r = m.get(c.year) ?? { year: c.year };
    if (c.gender === "M") r.men = c; else r.women = c;
    if (!r.host && c.metroSlug) r.host = c;
    m.set(c.year, r);
  }
  return [...m.values()].sort((a, b) => b.year - a.year);
}

function LeaderTable({ leaders, tours }: { leaders: Leader[]; tours: string[] }) {
  return (
    <div className="rounded-xl border overflow-x-auto max-h-[480px] overflow-y-auto" style={card}>
      <table className="w-full text-sm min-w-[600px]">
        <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 px-3 font-medium">Player</th>
            <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Slams</th>
            {tours.map((t) => <th key={t} className="py-2 px-3 text-right font-medium">{TOUR_META[t]?.short ?? t}</th>)}
          </tr>
        </thead>
        <tbody>
          {leaders.filter((l) => l.total >= 3).map((l) => (
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

export default function TennisHubPage() {
  const data = getTennisMajors();
  if (!data) return null;

  // merged by-nation (men + women)
  const nationMap = new Map<string, { nation: string; men: number; women: number }>();
  for (const n of data.byNationMen) nationMap.set(n.nation, { nation: n.nation, men: n.titles, women: 0 });
  for (const n of data.byNationWomen) {
    const e = nationMap.get(n.nation) ?? { nation: n.nation, men: 0, women: 0 };
    e.women = n.titles; nationMap.set(n.nation, e);
  }
  const nations = [...nationMap.values()].sort((a, b) => (b.men + b.women) - (a.men + a.women));

  const latestOf = (t: string, g: "M" | "W") =>
    data.champions.filter((c) => c.tournament === t && c.gender === g).sort((a, b) => b.year - a.year)[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <span>Tennis</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Tennis&apos;s Grand Slams</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Every men&apos;s and women&apos;s singles champion at the four majors, the
          Davis Cup, and the all-time leaders — anchored to the four cities that stage
          them. Each champion links to the metro that hosted the title.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Australian Open", href: "#australian" },
          { label: "Roland-Garros", href: "#french" },
          { label: "Wimbledon", href: "#wimbledon" },
          { label: "US Open", href: "#us-open" },
          { label: "Men's leaders", href: "#leaders-men" },
          { label: "Women's leaders", href: "#leaders-women" },
          { label: "By nation", href: "#by-nation" },
          { label: "Davis Cup", href: "#davis-cup" },
          { label: "Venues & metros", href: "#venues" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* recent winners */}
      <section className="mb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {data.tournaments.map((t) => {
          const m = latestOf(t, "M"); const w = latestOf(t, "W");
          const yr = Math.max(m?.year ?? 0, w?.year ?? 0);
          return (
            <div key={t} className="rounded-xl border p-4" style={card}>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{TOUR_META[t]?.short ?? t} · {yr || ""}</div>
              <div className="mt-1 text-sm"><span className="text-[var(--text-dim)] text-xs mr-1">M</span><Champ c={m} /></div>
              <div className="mt-0.5 text-sm"><span className="text-[var(--text-dim)] text-xs mr-1">W</span><Champ c={w} /></div>
              <div className="mt-1 text-xs text-[var(--text-muted)]"><MetroCell c={m ?? w} /></div>
            </div>
          );
        })}
      </section>

      {/* per-slam tables */}
      {data.tournaments.map((t) => (
        <section key={t} className="mb-10">
          <h2 id={TOUR_META[t]?.id ?? t} className="text-lg font-semibold mb-1">{t}</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Singles champions, most recent first.</p>
          <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={card}>
            <table className="w-full text-sm min-w-[620px]">
              <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Year</th>
                  <th className="py-2 px-3 font-medium">Men&apos;s singles</th>
                  <th className="py-2 px-3 font-medium">Women&apos;s singles</th>
                  <th className="py-2 px-3 font-medium">Host metro</th>
                </tr>
              </thead>
              <tbody>
                {slamRows(data.champions, t).map((r) => (
                  <tr key={r.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums" style={mono}>{r.year}</td>
                    <td className="py-1.5 px-3"><Champ c={r.men} /></td>
                    <td className="py-1.5 px-3"><Champ c={r.women} /></td>
                    <td className="py-1.5 px-3 text-[var(--text-muted)]"><MetroCell c={r.host} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* leaders */}
      <section className="mb-10">
        <h2 id="leaders-men" className="text-lg font-semibold mb-1">Men&apos;s all-time leaders</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Three or more singles majors, by total.</p>
        <LeaderTable leaders={data.leadersMen} tours={data.tournaments} />
      </section>
      <section className="mb-10">
        <h2 id="leaders-women" className="text-lg font-semibold mb-1">Women&apos;s all-time leaders</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Three or more singles majors, by total.</p>
        <LeaderTable leaders={data.leadersWomen} tours={data.tournaments} />
      </section>

      {/* by nation */}
      <section className="mb-10">
        <h2 id="by-nation" className="text-lg font-semibold mb-3">By nation</h2>
        <div className="rounded-xl border overflow-x-auto max-h-[440px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[360px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium">Men</th>
                <th className="py-2 px-3 text-right font-medium">Women</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {nations.map((n) => (
                <tr key={n.nation} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3"><Flag nation={n.nation} />{n.nation}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{n.men || ""}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{n.women || ""}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{n.men + n.women}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Davis Cup */}
      <section className="mb-10">
        <h2 id="davis-cup" className="text-lg font-semibold mb-1">Davis Cup</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">National-team titles and runner-up finishes, all-time.</p>
        <div className="rounded-xl border overflow-x-auto max-h-[440px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[360px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Titles</th>
                <th className="py-2 px-3 text-right font-medium">Runners-up</th>
              </tr>
            </thead>
            <tbody>
              {data.davis.map((d) => (
                <tr key={d.country} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3"><Flag nation={d.country} />{d.country}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: d.titles > 0 ? GOLD : "var(--text-dim)" }}>{d.titles || ""}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{d.runnerUp || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* venues */}
      <section className="mb-10">
        <h2 id="venues" className="text-lg font-semibold mb-1">Venues &amp; metros</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Metros that have staged a Grand Slam, including the early Australian and
          French rotations. Each links to its page.
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
          Singles champions span Wimbledon from 1877, the US Championships from 1881,
          the French from 1891 (counted as a major from 1925, when it opened to
          international players) and the Australian from 1905, through the current
          season. Career totals count Grand Slam singles titles. A dagger marks a title
          won under a neutral flag. Occupation-era French champions of 1941-1945 are
          recorded but not counted, per convention. Host metros are joined to each
          champion through the venue that staged the event.
        </p>
      </section>
    </main>
  );
}
