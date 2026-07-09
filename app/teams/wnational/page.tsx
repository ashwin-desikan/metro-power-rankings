import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getWEuros, getWOlympics, getWFinalissima } from "@/lib/wintl";
import { getWWCEditions, getWWCNations, getWWCMeta } from "@/lib/wnational";
import { getAllCountries } from "@/lib/countries";
import { flagCdnUrl } from "@/lib/international-display";
import { getWorldRanking } from "@/lib/worldRankings";
import WorldRankingSection from "@/app/teams/_shared/WorldRankingSection";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/wnational";
const TITLE = "Women's International";
const DESC =
  "Women's national-team football in one place: the World Cup, Olympic football, the UEFA Women's Euros, and the Finalissima — every final and an all-time honour table across the lot.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function Flag({ slug }: { slug: string | null | undefined }) {
  const u = slug ? flagCdnUrl(slug) : null;
  return u ? <img src={u} alt="" aria-hidden width={20} height={15} className="inline-block" loading="lazy" decoding="async" /> : null;
}

function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

type AllTime = {
  name: string; wwcSlug: string | null;
  wwcApps: number; wwcT: number; wwcF: number;
  olyT: number; olyF: number;
  euroT: number; euroF: number;
  finaT: number; finaF: number;
  titles: number; finals: number;
};

export default function WomensInternationalPage() {
  const wwcEditions = getWWCEditions();
  const wwcNations = getWWCNations();
  const wwcMeta = getWWCMeta();
  const euros = getWEuros();
  const oly = getWOlympics();
  const fin = getWFinalissima();

  const wwcSlugByName = new Map(wwcNations.map((n) => [norm(n.name), n.slug]));
  const countrySlugByName = new Map<string, string>();
  for (const c of getAllCountries()) {
    const k = norm(c.name);
    if (k && !countrySlugByName.has(k)) countrySlugByName.set(k, c.slug);
  }

  // A nation links to its Women's World Cup record where it has one, else its
  // country page. Used by every table on this hub.
  function nationLink(name: string | null) {
    if (!name) return <span className="text-[var(--text-dim)]">—</span>;
    const k = norm(name);
    const w = wwcSlugByName.get(k);
    const c = countrySlugByName.get(k);
    const flagSlug = w ?? c ?? null;
    if (w) return <span className="inline-flex items-center gap-1.5"><Flag slug={flagSlug} /><Link href={`/teams/national/womens-world-cup/${w}`} className="hover:text-[var(--accent)]">{name}</Link></span>;
    if (c) return <span className="inline-flex items-center gap-1.5"><Flag slug={flagSlug} /><Link href={`/countries/${c}`} className="hover:text-[var(--accent)]">{name}</Link></span>;
    return <span>{name}</span>;
  }

  // ---- All-time honour table across every competition in this hub ----
  const acc = new Map<string, AllTime>();
  const row = (name: string): AllTime => {
    const k = norm(name);
    let r = acc.get(k);
    if (!r) {
      r = { name, wwcSlug: wwcSlugByName.get(k) ?? null, wwcApps: 0, wwcT: 0, wwcF: 0,
        olyT: 0, olyF: 0, euroT: 0, euroF: 0, finaT: 0, finaF: 0, titles: 0, finals: 0 };
      acc.set(k, r);
    }
    return r;
  };
  for (const n of wwcNations) { const r = row(n.name); r.wwcApps = n.appearances; r.wwcT = n.titles; r.wwcF = n.finals; }
  if (oly) for (const n of oly.nations) { const r = row(n.name); r.olyT = n.gold; r.olyF = n.gold + n.silver; }
  if (euros) for (const n of euros.nations) { const r = row(n.name); r.euroT = n.titles; r.euroF = n.titles + n.runner_ups; }
  if (fin) for (const n of fin.nations) { const r = row(n.name); r.finaT = n.titles; r.finaF = 1; }
  const allTime = [...acc.values()]
    .map((r) => ({ ...r,
      titles: r.wwcT + r.olyT + r.euroT + r.finaT,
      finals: r.wwcF + r.olyF + r.euroF + r.finaF }))
    .sort((a, b) => b.titles - a.titles || b.finals - a.finals || b.wwcApps - a.wwcApps || a.name.localeCompare(b.name));

  const tf = (t: number, f: number) =>
    t === 0 && f === 0
      ? <span className="text-[var(--text-dim)]">—</span>
      : <><span className="font-semibold" style={{ color: t > 0 ? "#d4af37" : "var(--text)" }}>{t}</span><span className="text-[var(--text-dim)]"> / {f}</span></>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <span>Women&apos;s International</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Women&apos;s International</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The women&apos;s national-team game in one place: the World Cup, Olympic football, the
          UEFA Women&apos;s Euros, and the Finalissima — every final and an all-time honour table
          across the lot. For women&apos;s club competitions, see{" "}
          <Link href="/teams/wfootball" className="underline hover:text-[var(--accent)]">Women&apos;s Club</Link>.
        </p>
      </header>

      <HubNav
        items={[
          { label: "World Cup", href: "#world-cup" },
          { label: "World ranking", href: "#world-ranking" },
          { label: "All-time Table", href: "#all-time" },
          { label: "Olympics", href: "#olympics" },
          { label: "Euros", href: "#euros" },
          { label: "Finalissima", href: "#finalissima" },
        ]}
      />

      {/* ---------------- World Cup finals ---------------- */}
      <section id="world-cup" className="mb-10 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">FIFA Women&apos;s World Cup finals</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every final since {wwcMeta.year_min}. Click a nation for its full World Cup record.
        </p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Champion</th>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
                <th className="py-2 px-3 font-medium">Host</th>
              </tr>
            </thead>
            <tbody>
              {wwcEditions.slice().reverse().map((e) => (
                <tr key={e.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{e.year}</td>
                  <td className="py-2 px-3 font-semibold" style={{ color: "#d4af37" }}>{nationLink(e.champion)}</td>
                  <td className="py-2 px-3 tabular-nums text-xs" style={mono}>{e.final_score ?? ""}</td>
                  <td className="py-2 px-3">{nationLink(e.runner_up)}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{e.host ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Current world ranking ---------------- */}
      <WorldRankingSection
        id="world-ranking"
        heading="Current world ranking"
        blurb="The live FIFA/Coca-Cola Women's World Ranking by points."
        ranking={getWorldRanking("womens-football")}
      />

      {/* ---------------- All-time table ---------------- */}
      <section id="all-time" className="mb-10 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">All-time honour table</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every nation across all four competitions. Each tournament cell shows titles / finals reached; WC Apps is World Cup appearances. Sorted by total titles, then finals.
        </p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium">WC Apps</th>
                <th className="py-2 px-3 text-right font-medium">World Cup</th>
                <th className="py-2 px-3 text-right font-medium">Olympics</th>
                <th className="py-2 px-3 text-right font-medium">Euros</th>
                <th className="py-2 px-3 text-right font-medium">Finalissima</th>
                <th className="py-2 px-3 text-right font-medium">Titles</th>
                <th className="py-2 px-3 text-right font-medium">Finals</th>
              </tr>
            </thead>
            <tbody>
              {allTime.map((r) => (
                <tr key={r.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium">
                    {nationLink(r.name)}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{r.wwcApps || "—"}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{tf(r.wwcT, r.wwcF)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{tf(r.olyT, r.olyF)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{tf(r.euroT, r.euroF)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{tf(r.finaT, r.finaF)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: r.titles > 0 ? "#d4af37" : "var(--text-dim)" }}>{r.titles || "—"}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.finals || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Olympics ---------------- */}
      {oly && (
        <section id="olympics" className="mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-1">Olympic women&apos;s football</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Every final since {oly.meta.year_min}.</p>
          <div className="rounded-xl border overflow-x-auto" style={card}>
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Year</th>
                  <th className="py-2 px-3 font-medium">Gold</th>
                  <th className="py-2 px-3 font-medium">Silver</th>
                  <th className="py-2 px-3 font-medium">Bronze</th>
                  <th className="py-2 px-3 font-medium">Host</th>
                </tr>
              </thead>
              <tbody>
                {oly.editions.slice().reverse().map((e) => (
                  <tr key={e.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums" style={mono}>{e.year}</td>
                    <td className="py-1.5 px-3 font-semibold" style={{ color: "#d4af37" }}>{nationLink(e.gold)}</td>
                    <td className="py-1.5 px-3 text-xs">{nationLink(e.silver)}</td>
                    <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{nationLink(e.bronze)}</td>
                    <td className="py-1.5 px-3 text-xs text-[var(--text-dim)]">{e.host}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------- Euros ---------------- */}
      {euros && (
        <section id="euros" className="mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-1">UEFA Women&apos;s Championship finals</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {euros.meta.editions} editions, {euros.meta.year_min}–{euros.meta.year_max}. West Germany&apos;s 1989 title is carried under Germany.
          </p>
          <div className="rounded-xl border overflow-x-auto" style={card}>
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Year</th>
                  <th className="py-2 px-3 font-medium">Champion</th>
                  <th className="py-2 px-3 font-medium">Score</th>
                  <th className="py-2 px-3 font-medium">Runner-up</th>
                  <th className="py-2 px-3 font-medium">Host</th>
                </tr>
              </thead>
              <tbody>
                {euros.finals.slice().reverse().map((f) => (
                  <tr key={f.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums" style={mono}>{f.year}</td>
                    <td className="py-1.5 px-3 font-semibold" style={{ color: "#d4af37" }}>{nationLink(f.champion)}</td>
                    <td className="py-1.5 px-3 tabular-nums text-xs" style={mono}>{f.score}</td>
                    <td className="py-1.5 px-3 text-xs">{nationLink(f.runner_up)}</td>
                    <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{f.host}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------- Finalissima ---------------- */}
      {fin && fin.finals[0] && (
        <section id="finalissima" className="mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-1">Women&apos;s Finalissima</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            The CONMEBOL–UEFA champions&apos; playoff: the Women&apos;s Euro winner against the Copa América winner.
          </p>
          <div className="rounded-xl border p-4" style={card}>
            <div className="text-sm">
              <span className="font-semibold tabular-nums" style={mono}>{fin.finals[0].year}</span>{" — "}
              <span className="font-semibold" style={{ color: "#d4af37" }}>{nationLink(fin.finals[0].champion)}</span>
              <span className="text-xs text-[var(--text-muted)]"> bt {nationLink(fin.finals[0].runner_up)} {fin.finals[0].score}</span>
            </div>
            {fin.editions[0]?.host ? (
              <div className="text-xs text-[var(--text-dim)] mt-1">Held in {fin.editions[0].host}</div>
            ) : null}
          </div>
        </section>
      )}

      {/* ---------------- Methodology ---------------- */}
      <section className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          World Cup data is the site&apos;s existing women&apos;s national dataset; Olympic and Euros
          results are compiled from the public tournament record. The all-time table counts major
          titles and finals reached across all four competitions (an Olympic &quot;final&quot; is the
          gold-medal match). Nation names link to a team&apos;s World Cup record where it has one, else
          to its country page. Honour tables fold historical names onto the modern nation (West
          Germany into Germany).
        </p>
      </section>
    </main>
  );
}
