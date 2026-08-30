import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { f1ConstructorCrestName } from "@/lib/f1Crest";
import { CappedList } from "@/app/_shared/Disclosure";
import {
  getF1ConstructorBySlug, getAllF1ConstructorSlugs, type F1Constructor,
} from "@/lib/f1Constructors";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllF1ConstructorSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getF1ConstructorBySlug(slug);
  if (!t) return { title: "Team not found" };
  const title = `${t.name} — Formula 1`;
  const chain = t.chain.length > 1 ? ` Ran as ${t.chain.join(", then ")}.` : "";
  const desc =
    `${t.name} in Formula 1: ${t.races} World Championship races from ${t.first} to ${t.last}, ` +
    `${t.wins} wins${t.titles ? `, ${t.titles} constructors' titles` : ""}.${chain}`.slice(0, 300);
  return {
    title, description: desc,
    alternates: { canonical: `/teams/f1/constructors/${slug}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/f1/constructors/${slug}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description: desc },
  };
}

/* The form line. Championship position per season, y-axis inverted so first is
   at the top, which is the only orientation anyone reads intuitively. Drawn as
   bars rather than a polyline because the seasons are not contiguous for many
   teams and a line would invent continuity across a gap. */
function FormLine({ form, maxPos = 12 }: { form: F1Constructor["form"]; maxPos?: number }) {
  if (!form.length) return null;
  const W = 4, GAP = 1, H = 46;
  const width = form.length * (W + GAP);
  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(width, 120)} height={H + 14} role="img"
        aria-label={`Championship position by season, ${form[0][0]} to ${form[form.length - 1][0]}`}>
        {form.map(([season, pos, , wins], i) => {
          const p = pos ?? maxPos + 1;
          const clamped = Math.min(p, maxPos + 1);
          const h = Math.max(2, Math.round(H * (1 - (clamped - 1) / (maxPos + 1))));
          const fill = pos === 1 ? "var(--accent)" : wins > 0 ? "#6ea8a0" : "var(--border)";
          return (
            <rect key={season} x={i * (W + GAP)} y={H - h} width={W} height={h} fill={fill}>
              <title>{`${season}: ${pos ? `P${pos}` : "unclassified"}${wins ? `, ${wins} win${wins > 1 ? "s" : ""}` : ""}`}</title>
            </rect>
          );
        })}
        <text x={0} y={H + 12} fontSize={9} fill="var(--text-dim)">{form[0][0]}</text>
        <text x={Math.max(width, 120)} y={H + 12} fontSize={9} fill="var(--text-dim)" textAnchor="end">
          {form[form.length - 1][0]}
        </text>
      </svg>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-widest truncate" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: "var(--text)" }}>{value}</div>
      {sub && <div className="text-[10px] truncate" style={{ color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

/* A site's job, in words a reader can act on. "hq" is deliberately not called
   headquarters on its own: Haas's Kannapolis headquarters is an office, and
   calling it the base would put an American team in North Carolina when the
   race team works in Banbury. */
const BASE_ROLE: Record<string, string> = {
  main: "Factory",
  engine: "Engines",
  design: "Design and aero",
  hq: "Registered HQ",
};

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-xl font-bold mb-3 mt-10" style={{ color: "var(--text)" }}>{children}</h2>;
}


export default async function F1ConstructorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getF1ConstructorBySlug(slug);
  if (!t) notFound();

  const td = "px-3 py-1.5 text-sm";
  const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wider";
  const headStyle = { background: "var(--bg-card)", color: "var(--text-dim)" } as const;
  const rowBorder = { borderTop: "1px solid var(--border)" } as const;
  // The table wrappers below carry their overflow class as a LITERAL, not via a
  // shared const. scripts/check-table-scroll.mjs reads the JSX statically and
  // cannot follow a variable, so a hoisted className silently fails the gate.

  const firstWin = t.victories.length ? t.victories[t.victories.length - 1] : null;
  const lastWin = t.victories.length ? t.victories[0] : null;
  const finished = t.reliability.reduce((s, [, n, p]) => s + (n * p) / 100, 0);
  const finishedPct = t.entries ? Math.round((finished / t.entries) * 100) : 0;
  const seasonsDesc = [...t.seasonRows].reverse();
  const notes = t.eras.filter((e) => e.note);
  const baseNotes = t.bases.filter((b) => b.note);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
        <Link href="/teams/f1" className="hover:underline">Formula 1</Link>
        {" · "}
        <Link href="/teams/f1/constructors" className="hover:underline">Teams</Link>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-2">
          <CrestIcon name={f1ConstructorCrestName(t.name)} size={26} />
          <h1 className="text-3xl font-extrabold" style={{ color: "var(--text)" }}>{t.name}</h1>
          {t.current && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>racing</span>
          )}
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {t.first}&ndash;{t.last}
          {t.nationality ? <span style={{ color: "var(--text-dim)" }}> · {t.nationality}</span> : null}
          {t.wikipedia ? (
            <> · <a href={t.wikipedia} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>Wikipedia</a></>
          ) : null}
        </p>
        {t.base && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {t.base.until ? "Last based in " : "Based in "}
            <strong style={{ color: "var(--text)" }}>{t.base.town}</strong>
            {t.base.region && t.base.region !== t.base.town ? `, ${t.base.region}` : ""}
            {`, ${t.base.country}`}
            {t.base.metro ? (
              <>
                {" · "}
                {t.base.metroSlug
                  ? <Link href={`/rankings/${t.base.metroSlug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{t.base.metro} metro</Link>
                  : <span>{t.base.metro} metro</span>}
              </>
            ) : (
              <span style={{ color: "var(--text-dim)" }} title="MetroAreas.xlsx has this town with no Metro Area">
                {" · no metro in the workbook yet"}
              </span>
            )}
            <span style={{ color: "var(--text-dim)" }}>
              {t.base.until ? ` (${t.base.since}–${t.base.until})` : ` (since ${t.base.since})`}
            </span>
          </p>
        )}
        {t.chain.length > 1 && (
          <p className="mt-2 text-sm max-w-3xl" style={{ color: "var(--text-muted)" }}>
            One organisation, {t.chain.length} names: <strong style={{ color: "var(--text)" }}>{t.chain.join(" → ")}</strong>.
            The totals below are for the whole lineage; the eras table breaks them out.
          </p>
        )}
        {t.note && (
          <p className="mt-2 text-xs max-w-3xl" style={{ color: "var(--text-dim)" }}>{t.note}</p>
        )}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Wins" value={t.wins} sub={t.races ? `${((t.wins / t.races) * 100).toFixed(1)}% of races` : undefined} />
        <Stat label="Titles" value={t.titles || "—"} sub={t.bestChamp ? `best finish P${t.bestChamp}` : undefined} />
        <Stat label="Races" value={t.races} sub={`${t.seasons} seasons`} />
        <Stat label="Poles" value={t.poles || "—"} />
        <Stat label="Podiums" value={t.podiums} />
        <Stat
          label="Points"
          value={t.points.toLocaleString()}
          sub={t.sprintPoints > 0
            ? `${t.sprintPoints.toLocaleString()} of them from sprints`
            : "scoring systems differ by era"}
        />
        <Stat label="Classified finishes" value={`${finishedPct}%`} sub={`${t.entries} car entries`} />
        <Stat
          label="First and last win"
          value={firstWin && lastWin ? (firstWin[0] === lastWin[0] ? `${firstWin[0]}` : `${firstWin[0]}–${lastWin[0]}`) : "—"}
          sub={firstWin ? `${firstWin[2] ?? ""}` : undefined}
        />
      </div>

      <Section id="form">Championship position, season by season</Section>
      <p className="text-sm mb-3 max-w-3xl" style={{ color: "var(--text-muted)" }}>
        One bar per season entered, taller for a better finish in the constructors&rsquo; championship. Accent bars
        are title-winning seasons, green bars are seasons with at least one win. Gaps in the record are gaps in the
        bar row, not a line drawn across years the team did not race.
      </p>
      <FormLine form={t.form} />


      {t.eras.length > 1 && (
        <>
          <Section id="eras">The eras</Section>
          <div className="rounded-lg overflow-x-auto hidden sm:block" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full border-collapse">
              <thead><tr style={headStyle}>
                <th className={th}>Era</th><th className={th}>Years</th>
                <th className={th + " text-right"}>Races</th><th className={th + " text-right"}>Wins</th>
                <th className={th + " text-right"}>Poles</th><th className={th + " text-right"}>Titles</th>
                <th className={th + " text-right"}>Drivers</th>
              </tr></thead>
              <tbody>
                {t.eras.map((e, i) => (
                  <tr key={`${e.name}-${e.from}-${i}`} style={rowBorder}>
                    <td className={td} style={{ color: "var(--text)" }}>
                      {e.name}
                      {e.contested === 1 && (
                        <span className="ml-1.5 text-[9px] px-1 rounded uppercase tracking-wider" style={{ background: "rgba(234,179,8,0.16)", color: "var(--text-muted)" }} title="This link is a judgement call; see the note below">arguable</span>
                      )}
                    </td>
                    <td className={td + " tabular-nums"} style={{ color: "var(--text-dim)" }}>{e.from}&ndash;{e.to}</td>
                    <td className={td + " text-right"} style={{ color: "var(--text-muted)" }}>{e.races}</td>
                    <td className={td + " text-right font-semibold"} style={{ color: "var(--text)" }}>{e.wins}</td>
                    <td className={td + " text-right"} style={{ color: "var(--text-muted)" }}>{e.poles || "—"}</td>
                    <td className={td + " text-right"} style={{ color: "var(--text-muted)" }}>{e.titles || "—"}</td>
                    <td className={td + " text-right"} style={{ color: "var(--text-muted)" }}>{e.drivers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="eras"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={t.eras.map((e, i) => (
              <div key={`${e.name}-${e.from}-${i}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{e.name}</span>
                  <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-dim)" }}>{e.from}&ndash;{e.to}</span>
                </div>
                <div className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {e.races} races · {e.wins} wins · {e.titles || 0} titles
                </div>
              </div>
            ))}
            />
          </div>
        </>
      )}

      {notes.length > 0 && (
        <div className="mt-4 rounded-xl border p-4 max-w-3xl" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Why these are one team</h3>
          <ul className="space-y-2">
            {notes.map((e, i) => (
              <li key={`${e.name}-note-${i}`} className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text)" }}>{e.name}.</strong> {e.note}
              </li>
            ))}
          </ul>
        </div>
      )}


      {t.bases.length > 0 && (
        <>
          <Section id="bases">Where the cars were built</Section>
          <p className="text-sm mb-3 max-w-3xl" style={{ color: "var(--text-muted)" }}>
            The archive records a team&rsquo;s nationality, which is a racing licence rather than an address: Red Bull
            is Austrian and has never built a car outside Buckinghamshire. These are the actual sites, curated with a
            source for each, and each one placed in a metro where the workbook can rule on the town.
          </p>
          <div className="rounded-lg overflow-x-auto hidden sm:block" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full border-collapse">
              <thead><tr style={headStyle}>
                <th className={th}>Years</th><th className={th}>Town</th>
                <th className={th}>Metro</th><th className={th}>Role</th><th className={th}>Source</th>
              </tr></thead>
              <tbody>
                {t.bases.map((b, i) => (
                  <tr key={`${b.town}-${b.from}-${i}`} style={rowBorder}>
                    <td className={td + " tabular-nums whitespace-nowrap"} style={{ color: "var(--text-dim)" }}>
                      {b.to >= 9999 ? `${b.from}–` : `${b.from}–${b.to}`}
                    </td>
                    <td className={td} style={{ color: "var(--text)" }}>
                      {b.town}
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {b.region && b.region !== b.town ? `, ${b.region}` : ""}, {b.country}
                      </span>
                      {b.contested === 1 && (
                        <span className="ml-1.5 text-[9px] px-1 rounded uppercase tracking-wider" style={{ background: "rgba(234,179,8,0.16)", color: "var(--text-muted)" }} title="Sources disagree; see the note below">arguable</span>
                      )}
                    </td>
                    <td className={td}>
                      {b.metro && b.metroSlug
                        ? <Link href={`/rankings/${b.metroSlug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{b.metro}</Link>
                        : b.metro
                          ? <span style={{ color: "var(--text-muted)" }}>{b.metro}</span>
                          : <span style={{ color: "var(--text-dim)" }} title="MetroAreas.xlsx carries this town with no Metro Area">not in the workbook</span>}
                    </td>
                    <td className={td} style={{ color: "var(--text-muted)" }}>{BASE_ROLE[b.role]}</td>
                    <td className={td}>
                      <a href={b.source} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline" style={{ color: "var(--accent)" }}>source</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="rows"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={t.bases.map((b, i) => (
              <div key={`${b.town}-${b.from}-${i}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium min-w-0 truncate" style={{ color: "var(--text)" }}>{b.town}</span>
                  <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-dim)" }}>
                    {b.to >= 9999 ? `${b.from}–` : `${b.from}–${b.to}`}
                  </span>
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {BASE_ROLE[b.role]} ·{" "}
                  {b.metro && b.metroSlug
                    ? <Link href={`/rankings/${b.metroSlug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{b.metro}</Link>
                    : <span style={{ color: "var(--text-dim)" }}>{b.metro ?? "no metro yet"}</span>}
                </div>
              </div>
            ))}
            />
          </div>
          {baseNotes.length > 0 && (
            <ul className="mt-3 space-y-2 max-w-3xl">
              {baseNotes.map((b, i) => (
                <li key={`${b.town}-bn-${i}`} className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  <strong style={{ color: "var(--text)" }}>{b.town}.</strong> {b.note}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Section id="reliability">Getting to the finish</Section>
      <p className="text-sm mb-3 max-w-3xl" style={{ color: "var(--text-muted)" }}>
        The share of car entries classified as finishers, by decade. This is the statistic that separates the eras
        of the sport more sharply than lap times do: a 1960s team that finished a fifth of its entries was normal.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {t.reliability.map(([dec, n, pct]) => (
          <Stat key={dec} label={`${dec}s`} value={`${pct}%`} sub={`${n} entries`} />
        ))}
      </div>
      {t.statuses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {t.statuses.filter(([s]) => s !== "Finished").slice(0, 7).map(([s, n]) => (
            <span key={s} className="text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              {s} <span style={{ color: "var(--text-dim)" }}>{n}</span>
            </span>
          ))}
        </div>
      )}

      {t.teammates.length > 0 && (
        <>
          <Section id="teammates">Teammate against teammate</Section>
          <p className="text-sm mb-3 max-w-3xl" style={{ color: "var(--text-muted)" }}>
            The same car, the same weekend, the only comparison in the sport with nothing else in it. Qualifying
            counts the races where <em>both</em> cars set a grid time; the race counts the races where <em>both</em>{" "}
            were classified, because a car that broke on lap two did not lose to anybody. The two denominators are
            different for that reason, and both are shown.
          </p>
          <div className="rounded-lg overflow-x-auto hidden sm:block" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full border-collapse">
              <thead><tr style={headStyle}>
                <th className={th}>Pairing</th><th className={th}>Years</th>
                <th className={th + " text-right"}>Races</th>
                <th className={th + " text-center"}>Qualifying</th>
                <th className={th + " text-center"}>Race</th>
              </tr></thead>
              <tbody>
                {t.teammates.map(([a, b, races, from, to, qa, qb, ra, rb], i) => (
                  <tr key={`${a}-${b}-${i}`} style={rowBorder}>
                    <td className={td} style={{ color: "var(--text)" }}>{a} v {b}</td>
                    <td className={td + " tabular-nums"} style={{ color: "var(--text-dim)" }}>
                      {from === to ? from : `${from}–${to}`}
                    </td>
                    <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-muted)" }}>{races}</td>
                    <td className={td + " text-center tabular-nums"}>
                      <span style={{ color: qa > qb ? "var(--text)" : "var(--text-dim)", fontWeight: qa > qb ? 600 : 400 }}>{qa}</span>
                      <span style={{ color: "var(--text-dim)" }}> – </span>
                      <span style={{ color: qb > qa ? "var(--text)" : "var(--text-dim)", fontWeight: qb > qa ? 600 : 400 }}>{qb}</span>
                    </td>
                    <td className={td + " text-center tabular-nums"}>
                      <span style={{ color: ra > rb ? "var(--text)" : "var(--text-dim)", fontWeight: ra > rb ? 600 : 400 }}>{ra}</span>
                      <span style={{ color: "var(--text-dim)" }}> – </span>
                      <span style={{ color: rb > ra ? "var(--text)" : "var(--text-dim)", fontWeight: rb > ra ? 600 : 400 }}>{rb}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[60vh] overflow-y-auto overscroll-contain">
            <CappedList
              initial={12}
              noun="teammates"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={t.teammates.map(([a, b, races, from, to, qa, qb, ra, rb], i) => (
              <div key={`${a}-${b}-${i}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium min-w-0" style={{ color: "var(--text)" }}>{a} v {b}</span>
                  <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-dim)" }}>
                    {from === to ? from : `${from}–${to}`}
                  </span>
                </div>
                <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {races} races · qualifying {qa}–{qb} · race {ra}–{rb}
                </div>
              </div>
            ))}
            />
          </div>
        </>
      )}

      <Section id="seasons">Season by season</Section>
      <div className="rounded-lg overflow-x-auto hidden sm:block" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full border-collapse">
          <thead><tr style={headStyle}>
            <th className={th}>Season</th><th className={th + " text-right"}>Pos</th>
            <th className={th + " text-right"}>Races</th><th className={th + " text-right"}>Wins</th>
            <th className={th + " text-right"}>Podiums</th><th className={th + " text-right"}>Poles</th>
            <th className={th + " text-right"}>Points</th>
            <th className={th + " text-right"}>Avg grid</th><th className={th + " text-right"}>Avg finish</th>
            <th className={th}>Drivers</th>
          </tr></thead>
          <tbody>
            {seasonsDesc.map((s) => (
              <tr key={s[0]} style={rowBorder}>
                <td className={td + " tabular-nums"} style={{ color: "var(--text)" }}>{s[0]}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: s[6] === 1 ? "var(--accent)" : "var(--text-muted)" }}>{s[6] ?? "—"}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-muted)" }}>{s[1]}</td>
                <td className={td + " text-right tabular-nums font-semibold"} style={{ color: "var(--text)" }}>{s[2] || "—"}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-muted)" }}>{s[3] || "—"}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-muted)" }}>{s[4] || "—"}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-muted)" }}>{s[5] || "—"}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-dim)" }}>{s[7] ?? "—"}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-dim)" }}>{s[8] ?? "—"}</td>
                <td className={td + " text-xs"} style={{ color: "var(--text-muted)" }}>{s[9].join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.pointsNotes.length > 0 && (
        <ul className="mt-3 space-y-1.5 max-w-3xl">
          {t.pointsNotes.map(([y, , why]) => (
            <li key={`pn-${y}`} className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text)" }}>{y}.</strong> {why}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[70vh] overflow-y-auto overscroll-contain">
        <CappedList
          initial={12}
          noun="seasons"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={seasonsDesc.map((s) => (
          <div key={`${s[0]}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium tabular-nums" style={{ color: "var(--text)" }}>{s[0]}</span>
              <span className="text-xs tabular-nums flex-shrink-0" style={{ color: s[6] === 1 ? "var(--accent)" : "var(--text-dim)" }}>
                {s[6] ? `P${s[6]}` : "—"}
              </span>
            </div>
            <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              {s[1]} races · {s[2]} wins · {s[3]} podiums
            </div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>{s[9].join(", ")}</div>
          </div>
        ))}
        />
      </div>


      <Section id="drivers">Who drove for them</Section>
      <div className="rounded-lg overflow-x-auto hidden sm:block" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full border-collapse" data-sticky-col="2">
          <thead><tr style={headStyle}>
            <th className={th}>#</th><th className={th}>Driver</th>
            <th className={th + " text-right"}>Wins</th><th className={th + " text-right"}>Podiums</th>
            <th className={th + " text-right"}>Entries</th><th className={th}>Years</th>
          </tr></thead>
          <tbody>
            {t.drivers.slice(0, 40).map((d, i) => (
              <tr key={d[0]} style={rowBorder}>
                <td className={td} style={{ color: "var(--text-dim)" }}>{i + 1}</td>
                <td className={td} style={{ color: "var(--text)" }}>{d[0]}</td>
                <td className={td + " text-right font-semibold tabular-nums"} style={{ color: "var(--text)" }}>{d[2] || "—"}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-muted)" }}>{d[3] || "—"}</td>
                <td className={td + " text-right tabular-nums"} style={{ color: "var(--text-muted)" }}>{d[1]}</td>
                <td className={td + " tabular-nums"} style={{ color: "var(--text-dim)" }}>{d[5] === d[6] ? d[5] : `${d[5]}–${d[6]}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[60vh] overflow-y-auto overscroll-contain">
        <CappedList
          initial={12}
          noun="drivers"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={t.drivers.slice(0, 40).map((d, i) => (
          <div key={`${d[0]}-card`} className="rounded-lg p-3 flex items-center justify-between gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <span className="min-w-0">
              <span className="text-xs tabular-nums mr-1.5" style={{ color: "var(--text-dim)" }}>{i + 1}</span>
              <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{d[0]}</span>
              <span className="block text-[11px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                {d[5] === d[6] ? d[5] : `${d[5]}–${d[6]}`} · {d[1]} entries
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text)" }}>{d[2]} wins</span>
          </div>
        ))}
        />
      </div>
      {t.drivers.length > 40 && (
        <p className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
          Showing 40 of {t.drivers.length} drivers, most wins first.
        </p>
      )}

      {t.circuits.length > 0 && (
        <>
          <Section id="circuits">Where they won</Section>
          <p className="text-sm mb-3 max-w-3xl" style={{ color: "var(--text-muted)" }}>
            Their best circuits, and the metro each one sits in. This is a metro site before it is a motorsport
            one, so every venue links back to its city.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {t.circuits.map(([cid, cname, metro, metroSlug, races, wins]) => (
              <div key={cid} className="rounded-lg p-3 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/teams/f1/${cid}`} className="text-sm font-medium hover:underline truncate" style={{ color: "var(--text)" }}>
                    {cname ?? cid}
                  </Link>
                  <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text)" }}>{wins} / {races}</span>
                </div>
                <div className="mt-1 text-xs truncate">
                  {metro && metroSlug
                    ? <Link href={`/rankings/${metroSlug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{metro}</Link>
                    : <span style={{ color: "var(--text-dim)" }}>{metro ?? "—"}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <section className="mt-10 rounded-2xl border p-5 max-w-3xl" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text)" }}>Where these numbers come from</h2>
        <div className="text-[13.5px] leading-relaxed space-y-3" style={{ color: "var(--text-muted)" }}>
          <p>
            Results are the Ergast archive and its Jolpica successor, 1950 to the current season. That archive
            identifies a car by chassis and engine rather than by the company entering it, so the teams here are
            reassembled by hand; the rules and every judgement call are set out on the{" "}
            <Link href="/teams/f1/constructors" className="hover:underline" style={{ color: "var(--accent)" }}>teams board</Link>.
          </p>
          <p>
            Wins, podiums and poles count car entries, so a one-two counts as two podiums. Points are as awarded at
            the time and are not comparable across eras: a win was worth 8 points in 1960 and 25 today. Titles count
            finished seasons only, so leading the current championship does not yet count as one.
          </p>
          <p>
            Points are points <em>scored</em>, race and sprint together, and every season from 1991 onward is checked
            against the official constructors&rsquo; table at build time. Earlier seasons will not match it, and are
            not meant to: for much of the sport&rsquo;s history only a driver&rsquo;s best few results counted toward
            the championship. Sprint <em>wins</em> are counted separately from Grand Prix wins, because a Saturday
            result is not a victory in the record books.
          </p>
          {t.bases.length > 0 && (
            <p>
              Factory locations are curated separately, in <code>scripts/f1/bases.py</code>, with a source per site.
              The archive has no address field at all. Each town is then put to MetroAreas.xlsx, and a town the
              workbook cannot rule on is shown without a metro rather than assigned to the nearest one.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
