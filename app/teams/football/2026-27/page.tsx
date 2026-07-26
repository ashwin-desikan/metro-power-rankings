import type { Metadata } from "next";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import HubNav from "@/app/teams/HubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getFootballClubByName } from "@/lib/football";
import { getClubStandings, getClubCompetitions, type LiveRow, type LiveComp } from "@/lib/clubFootballLive";
import Hub2027Client, { type HubConf, type HubLeague, type HubGroup, type HubRow } from "./Hub2027Client";

export const revalidate = 300;

const PATH = "/teams/football/2026-27";
const TITLE = "2026-27 Club Football";
const DESC =
  "The 2026-27 club season in one place: live league tables for every domestic competition tracked, grouped by confederation and tier, plus the European club competitions and Copa Libertadores.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const CONF_ORDER = ["UEFA", "CONMEBOL", "CONCACAF", "AFC", "CAF"];
const COMP_ORDER = [2, 3, 848, 13, 531]; // CL, EL, ECL, Libertadores, Super Cup
const DASH = "—";

const num = (v: number | null | undefined): number | string => (v === null || v === undefined ? DASH : v);
const byPtsGd = (a: LiveRow, b: LiveRow) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0);

function resolveClub(r: { name: string | null; lookup: string | null }): { name: string; slug: string | null } {
  const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
  return { name: c?.cur_name ?? r.name ?? r.lookup ?? DASH, slug: c?.slug ?? null };
}

const isFinished = (s: string | null) => !!s && ["FT", "AET", "PEN"].includes(s);
const fmtDate = (d: string | null): string => {
  if (!d) return DASH;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? DASH : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

// ---- domestic: build confederation -> country -> leagues (resolved) -----
function buildConfs(standings: Awaited<ReturnType<typeof getClubStandings>>): HubConf[] {
  const confMap = new Map<string, Map<string, HubLeague[]>>();
  for (const lg of standings) {
    const groups: HubGroup[] = lg.groups
      .map((g): HubGroup => ({
        label: lg.groups.length > 1 ? g.group_label : null,
        rows: g.rows.slice().sort(byPtsGd).map((r): HubRow => {
          const c = resolveClub(r);
          return { rank: r.rank, name: c.name, slug: c.slug,
            cells: [num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gf), num(r.ga), num(r.gd), num(r.points)] };
        }),
      }))
      .filter((g) => g.rows.length > 0);
    if (groups.length === 0) continue;
    const conf = lg.confederation ?? "Other";
    const country = lg.country ?? DASH;
    if (!confMap.has(conf)) confMap.set(conf, new Map());
    const byCountry = confMap.get(conf)!;
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country)!.push({ id: lg.league_id, name: lg.name ?? DASH, level: lg.level, groups });
  }
  const order = (c: string) => { const i = CONF_ORDER.indexOf(c); return i === -1 ? CONF_ORDER.length : i; };
  return [...confMap.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([confederation, byCountry]) => ({
      confederation,
      countries: [...byCountry.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([country, leagues]) => ({ country, leagues: leagues.sort((x, y) => (x.level ?? 99) - (y.level ?? 99) || x.name.localeCompare(y.name)) })),
    }));
}

// ---- continental competitions band --------------------------------------
function CompGroupTable({ rows }: { rows: LiveRow[] }) {
  const cols = ["P", "W", "D", "L", "GD", "Pts"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[300px]">
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th className="py-1 px-1.5 font-medium text-right">#</th>
            <th className="py-1 px-1.5 font-medium">Club</th>
            {cols.map((c) => <th key={c} className="py-1 px-1.5 font-medium text-right tabular-nums">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice().sort(byPtsGd).map((r, i) => {
            const c = resolveClub(r);
            return (
              <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank ?? i + 1}</td>
                <td className="py-1 px-1.5 font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <CrestIcon name={c.name} size={14} className="flex-shrink-0" />
                    {c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link> : <span>{c.name}</span>}
                  </span>
                </td>
                {[num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gd), num(r.points)].map((v, j) => (
                  <td key={j} className="py-1 px-1.5 text-right tabular-nums" style={mono}>{v}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompCard({ comp }: { comp: LiveComp }) {
  const upcoming = comp.fixtures.filter((f) => !isFinished(f.status)).sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "")).slice(0, 5);
  const recent = comp.fixtures.filter((f) => isFinished(f.status)).sort((a, b) => (b.kickoff ?? "").localeCompare(a.kickoff ?? "")).slice(0, 5);
  const fxLine = (f: LiveComp["fixtures"][number]) => {
    const h = resolveClub(f.home).name, a = resolveClub(f.away).name;
    const res = isFinished(f.status) && f.home_goals !== null && f.away_goals !== null ? `${f.home_goals}–${f.away_goals}` : fmtDate(f.kickoff);
    return { key: f.fixture_id, text: `${h} v ${a}`, res };
  };
  const name = (comp.name ?? "").replace(/^UEFA |^CONMEBOL /, "");
  return (
    <details className="rounded-xl border overflow-hidden" style={cardStyle} open={comp.groups.length > 0}>
      <summary className="cursor-pointer select-none px-4 py-2.5 font-semibold text-sm">{name}</summary>
      <div className="border-t px-3 py-3 space-y-3" style={{ borderColor: "var(--border)" }}>
        {comp.groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {comp.groups.slice().sort((a, b) => a.group_label.localeCompare(b.group_label)).map((g) => (
              <div key={g.group_label}>
                <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.group_label}</div>
                <CompGroupTable rows={g.rows} />
              </div>
            ))}
          </div>
        )}
        {(upcoming.length > 0 || recent.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {recent.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Recent</div>
                {recent.map(fxLine).map((f) => (
                  <div key={f.key} className="flex justify-between gap-2 py-0.5"><span className="truncate">{f.text}</span><span className="tabular-nums text-[var(--text-dim)]" style={mono}>{f.res}</span></div>
                ))}
              </div>
            )}
            {upcoming.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Upcoming</div>
                {upcoming.map(fxLine).map((f) => (
                  <div key={f.key} className="flex justify-between gap-2 py-0.5"><span className="truncate">{f.text}</span><span className="tabular-nums text-[var(--text-dim)]" style={mono}>{f.res}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

export default async function ClubFootball2027Page() {
  const [standings, comps] = await Promise.all([getClubStandings(), getClubCompetitions()]);
  const confs = buildConfs(standings);
  const compById = new Map(comps.map((c) => [c.league_id, c]));
  const orderedComps = COMP_ORDER.map((id) => compById.get(id)).filter((c): c is LiveComp => !!c && (c.groups.length > 0 || c.fixtures.length > 0));
  const totalLeagues = confs.reduce((a, c) => a + c.countries.reduce((b, k) => b + k.leagues.length, 0), 0);

  const nav = [
    { label: "Competitions", href: "#competitions" },
    ...confs.map((c) => ({ label: c.confederation, href: "#domestic" })),
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/football" className="hover:underline">Football</Link>{" / "}
        <span>2026-27</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">2026-27 Club Football</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Every domestic league and level the site tracks, live, grouped by confederation and tier, alongside
          the European club competitions and Copa Libertadores. Tables refresh daily; leagues appear here once
          their season is under way.
        </p>
        <p className="mt-2 text-xs text-[var(--text-dim)] tabular-nums">
          {totalLeagues} live league{totalLeagues === 1 ? "" : "s"} · {orderedComps.length} continental competition{orderedComps.length === 1 ? "" : "s"}
        </p>
      </header>

      <HubNav items={nav} />

      {orderedComps.length > 0 && (
        <section id="competitions" className="scroll-mt-24 mb-10">
          <h2 className="text-lg font-semibold mb-3">Continental competitions</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {orderedComps.map((c) => <CompCard key={c.league_id} comp={c} />)}
          </div>
        </section>
      )}

      <section id="domestic" className="scroll-mt-24">
        <h2 className="text-lg font-semibold mb-3">Domestic leagues</h2>
        {confs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No live league tables right now. Most European seasons begin in August.</p>
        ) : (
          <Hub2027Client confs={confs} />
        )}
      </section>
    </main>
  );
}
