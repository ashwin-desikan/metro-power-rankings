import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import {
  getF1Meta, getF1Champions, getF1DriverTitles, getF1ConstructorTitles,
  getF1AllTimeDriverWins, getF1AllTimeConstructorWins, getF1HostMetros,
  fetchF1LiveSeason,
} from "@/lib/f1";
import { getLiveF1Standings } from "@/lib/f1Standings";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { f1ConstructorCrestName } from "@/lib/f1Crest";

// "2026-06-28" -> "28 Jun" for upcoming races (shown in place of a winner).
const F1_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtRaceDate(iso: string | null): string {
  if (!iso) return "TBC";
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d} ${F1_MONTHS[m - 1]}` : iso;
}

export const dynamicParams = false;
export const revalidate = 3600;

const PAGE_PATH = "/teams/f1";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Formula 1";
const PAGE_DESCRIPTION =
  "Live Formula 1 drivers' and constructors' standings, every World Champion since 1950, all-time win leaders, and the host metros that have staged a Grand Prix.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="text-[11px] px-2 py-0.5 rounded"
      style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
      {children}
    </span>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-xl font-bold mb-4 mt-12" style={{ color: "var(--text)" }}>{children}</h2>;
}

export default async function F1Page() {
  const meta = getF1Meta();
  const champions = getF1Champions();
  const driverTitles = getF1DriverTitles();
  const constructorTitles = getF1ConstructorTitles();
  const driverWins = getF1AllTimeDriverWins();
  const constructorWins = getF1AllTimeConstructorWins();
  const hostMetros = getF1HostMetros();
  const live = await fetchF1LiveSeason();
  const season = live.races;
  const standings = await getLiveF1Standings();
  // ESPN's live driver table omits the constructor; backfill it from the
  // fallback snapshot so the Team column (and its crest) renders in both modes.
  const fallbackDriverTeam = new Map(live.standings.drivers.map((d) => [d.driver, d.team]));
  const isLive = standings.source === "espn";
  const driverTeam = (d: (typeof standings.drivers)[number]) =>
    d.team ?? fallbackDriverTeam.get(d.driver) ?? null;
  const championsHistory = [...champions].reverse();

  const td = "px-3 py-1.5 text-sm";
  const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wider";
  const headStyle = { background: "var(--bg-card)", color: "var(--text-dim)" } as const;
  const rowBorder = { borderTop: "1px solid var(--border)" } as const;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-dim)" }}>Motorsport · Formula 1</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: "var(--text)" }}>Formula 1</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          The Drivers&rsquo; and Constructors&rsquo; World Championships since 1950, seen through the metros that host them.
          Live standings, the full roll of champions, all-time win leaders, and a host-metro league table linking every
          Grand Prix venue back to its city.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip title="Seasons covered">{meta.first_season}&ndash;{meta.latest_season}</Chip>
          <Chip title="World Championship races">{meta.races_total.toLocaleString()} races</Chip>
          <Chip title="Distinct host metros">{meta.host_metros} host metros</Chip>
          <Chip title="Distinct circuits">{meta.circuits} circuits</Chip>
        </div>
      </header>

      <HubNav items={[
        { label: "Standings", href: "#standings" },
        { label: "This Season", href: "#season" },
        { label: "Host Metros", href: "#host-metros" },
        { label: "Champions", href: "#champions" },
        { label: "All-Time Wins", href: "#all-time" },
        { label: "About", href: "#methodology" },
      ]} />

      {/* Standings */}
      <div className="flex items-center gap-3">
        <SectionHeading id="standings">{standings.season} Standings</SectionHeading>
        <span className="mt-6 text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={isLive
            ? { background: "rgba(74,222,128,0.15)", color: "#4ade80" }
            : { background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}>
          {isLive ? "● LIVE (ESPN)" : "Snapshot"}
        </span>
        {standings.round != null && (
          <span className="mt-6 text-xs" style={{ color: "var(--text-dim)" }}>after round {standings.round}</span>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          {/* Mobile: stacked cards instead of a 4-column table */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {standings.drivers.map((d, i) => {
              const team = driverTeam(d);
              return (
                <div key={`${d.driver}-${i}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>{d.pos ?? i + 1}</span>
                      <span className="font-medium text-sm truncate" style={{ color: "var(--text)" }}>{d.driver}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text)" }}>{d.points ?? 0} pts</span>
                  </div>
                  <div className="mt-1.5 text-xs flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    {team ? <><CrestIcon name={f1ConstructorCrestName(team)} />{team}</> : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg overflow-hidden hidden sm:block" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full border-collapse">
              <thead><tr style={headStyle}>
                <th className={th}>#</th><th className={th}>Driver</th><th className={th}>Team</th>
                <th className={th + " text-right"}>Pts</th>
              </tr></thead>
              <tbody>
                {standings.drivers.map((d, i) => (
                  <tr key={`${d.driver}-${i}`} style={rowBorder}>
                    <td className={td} style={{ color: "var(--text-dim)" }}>{d.pos ?? i + 1}</td>
                    <td className={td} style={{ color: "var(--text)" }}>{d.driver}</td>
                    <td className={td} style={{ color: "var(--text-muted)" }}>{(() => {
                      const team = driverTeam(d);
                      return team ? <span className="inline-flex items-center gap-1.5"><CrestIcon name={f1ConstructorCrestName(team)} />{team}</span> : "—";
                    })()}</td>
                    <td className={td + " text-right font-semibold"} style={{ color: "var(--text)" }}>{d.points ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          {/* Mobile: stacked cards instead of a 3-column table */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {standings.constructors.map((c, i) => (
              <div key={`${c.constructor}-${i}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>{c.pos ?? i + 1}</span>
                    <CrestIcon name={f1ConstructorCrestName(c.constructor)} />
                    <span className="font-medium text-sm truncate" style={{ color: "var(--text)" }}>{c.constructor}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text)" }}>{c.points ?? 0} pts</span>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg overflow-hidden self-start hidden sm:block" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full border-collapse">
              <thead><tr style={headStyle}>
                <th className={th}>#</th><th className={th}>Constructor</th><th className={th + " text-right"}>Pts</th>
              </tr></thead>
              <tbody>
                {standings.constructors.map((c, i) => (
                  <tr key={`${c.constructor}-${i}`} style={rowBorder}>
                    <td className={td} style={{ color: "var(--text-dim)" }}>{c.pos ?? i + 1}</td>
                    <td className={td} style={{ color: "var(--text)" }}><span className="inline-flex items-center gap-1.5"><CrestIcon name={f1ConstructorCrestName(c.constructor)} />{c.constructor}</span></td>
                    <td className={td + " text-right font-semibold"} style={{ color: "var(--text)" }}>{c.points ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* This Season */}
      <SectionHeading id="season">This Season ({meta.latest_season})</SectionHeading>
      {/* Mobile: stacked cards instead of a 6-column table */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {season.map((r) => (
          <div key={`${r.round}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>Rd {r.round}</div>
            <div className="text-sm font-medium mt-0.5">
              <Link href={`/teams/f1/${r.circuit_id}`} className="hover:underline" style={{ color: "var(--text)" }}>{r.race_name}</Link>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Circuit</div>
                <div style={{ color: "var(--text-muted)" }}>{r.circuit}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Metro</div>
                <div>
                  {r.metro_resolved
                    ? <Link href={`/rankings/${r.metro_slug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{r.metro}</Link>
                    : <span style={{ color: "var(--text-muted)" }}>{r.metro}</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Winner</div>
                <div style={{ color: r.winner ? "var(--text)" : "var(--text-dim)" }}>{r.winner ?? fmtRaceDate(r.date)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Team</div>
                <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  {r.winner_constructor ? <><CrestIcon name={f1ConstructorCrestName(r.winner_constructor)} />{r.winner_constructor}</> : "—"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg overflow-hidden hidden sm:block" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full border-collapse">
          <thead><tr style={headStyle}>
            <th className={th}>Rd</th><th className={th}>Grand Prix</th><th className={th}>Circuit</th>
            <th className={th}>Metro</th><th className={th}>Winner</th><th className={th}>Team</th>
          </tr></thead>
          <tbody>
            {season.map((r) => (
              <tr key={r.round} style={rowBorder}>
                <td className={td} style={{ color: "var(--text-dim)" }}>{r.round}</td>
                <td className={td} style={{ color: "var(--text)" }}>
                  <Link href={`/teams/f1/${r.circuit_id}`} className="hover:underline">{r.race_name}</Link>
                </td>
                <td className={td} style={{ color: "var(--text-muted)" }}>{r.circuit}</td>
                <td className={td}>
                  {r.metro_resolved
                    ? <Link href={`/rankings/${r.metro_slug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{r.metro}</Link>
                    : <span style={{ color: "var(--text-muted)" }}>{r.metro}</span>}
                </td>
                <td className={td} style={{ color: r.winner ? "var(--text)" : "var(--text-dim)" }}>{r.winner ?? fmtRaceDate(r.date)}</td>
                <td className={td} style={{ color: "var(--text-muted)" }}>{r.winner_constructor ? <span className="inline-flex items-center gap-1.5"><CrestIcon name={f1ConstructorCrestName(r.winner_constructor)} />{r.winner_constructor}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Host Metros */}
      <SectionHeading id="host-metros">Host Metros</SectionHeading>
      <p className="text-sm mb-4 max-w-3xl" style={{ color: "var(--text-muted)" }}>
        Every metro that has staged a World Championship Grand Prix, ranked by races held. The view F1 rarely takes:
        the sport as a map of cities.
      </p>
      {/* Mobile: stacked cards instead of a 6-column table */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {hostMetros.map((h) => (
          <div key={`${h.metro_slug}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-medium">
                {h.metro_resolved
                  ? <Link href={`/rankings/${h.metro_slug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{h.metro}</Link>
                  : <span style={{ color: "var(--text)" }}>{h.metro}</span>}
              </div>
              <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text)" }}>{h.races} races</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Country</div>
                <div style={{ color: "var(--text-muted)" }}>{h.country}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Circuits</div>
                <div style={{ color: "var(--text-muted)" }}>{h.circuit_count}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Span</div>
                <div className="tabular-nums" style={{ color: "var(--text-dim)" }}>{h.first_year}&ndash;{h.last_year}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Latest winner</div>
                <div style={{ color: "var(--text-muted)" }}>
                  {h.last_gp.winner ? `${h.last_gp.winner} (${h.last_gp.season})` : "—"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg overflow-hidden hidden sm:block" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full border-collapse">
          <thead><tr style={headStyle}>
            <th className={th}>Metro</th><th className={th}>Country</th><th className={th + " text-right"}>Races</th>
            <th className={th + " text-right"}>Circuits</th><th className={th}>Span</th><th className={th}>Latest winner</th>
          </tr></thead>
          <tbody>
            {hostMetros.map((h) => (
              <tr key={h.metro_slug} style={rowBorder}>
                <td className={td} style={{ color: "var(--text)" }}>
                  {h.metro_resolved
                    ? <Link href={`/rankings/${h.metro_slug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{h.metro}</Link>
                    : h.metro}
                </td>
                <td className={td} style={{ color: "var(--text-muted)" }}>{h.country}</td>
                <td className={td + " text-right font-semibold"} style={{ color: "var(--text)" }}>{h.races}</td>
                <td className={td + " text-right"} style={{ color: "var(--text-muted)" }}>{h.circuit_count}</td>
                <td className={td} style={{ color: "var(--text-dim)" }}>{h.first_year}&ndash;{h.last_year}</td>
                <td className={td} style={{ color: "var(--text-muted)" }}>
                  {h.last_gp.winner ? `${h.last_gp.winner} (${h.last_gp.season})` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Champions */}
      <SectionHeading id="champions">World Champions</SectionHeading>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Mobile: stacked cards instead of a 3-column table */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {championsHistory.map((c) => (
              <div key={`${c.season}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>{c.season}</div>
                <div className="text-sm font-medium mt-0.5" style={{ color: "var(--text)" }}>
                  {c.driver ?? "—"}{c.driver_nat ? <span style={{ color: "var(--text-dim)" }}> · {c.driver_nat}</span> : null}
                </div>
                <div className="mt-1.5 text-xs flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <CrestIcon name={f1ConstructorCrestName(c.constructor)} />{c.constructor ?? "—"}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg overflow-hidden hidden sm:block" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full border-collapse">
              <thead><tr style={headStyle}>
                <th className={th}>Season</th><th className={th}>Drivers&rsquo; Champion</th><th className={th}>Constructors&rsquo; Champion</th>
              </tr></thead>
              <tbody>
                {championsHistory.map((c) => (
                  <tr key={c.season} style={rowBorder}>
                    <td className={td} style={{ color: "var(--text-dim)" }}>{c.season}</td>
                    <td className={td} style={{ color: "var(--text)" }}>
                      {c.driver ?? "—"}{c.driver_nat ? <span style={{ color: "var(--text-dim)" }}> · {c.driver_nat}</span> : null}
                    </td>
                    <td className={td} style={{ color: "var(--text-muted)" }}><span className="inline-flex items-center gap-1.5"><CrestIcon name={f1ConstructorCrestName(c.constructor)} />{c.constructor ?? "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Most Drivers&rsquo; Titles</h3>
            <ul className="space-y-1">
              {driverTitles.slice(0, 8).map((t) => (
                <li key={t.name} className="flex justify-between text-sm" style={{ color: "var(--text-muted)" }}>
                  <span>{t.name}</span><span style={{ color: "var(--text)" }}>{t.titles}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Most Constructors&rsquo; Titles</h3>
            <ul className="space-y-1">
              {constructorTitles.slice(0, 8).map((t) => (
                <li key={t.name} className="flex justify-between text-sm" style={{ color: "var(--text-muted)" }}>
                  <span>{t.name}</span><span style={{ color: "var(--text)" }}>{t.titles}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* All-Time Wins */}
      <SectionHeading id="all-time">All-Time Wins</SectionHeading>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          {/* Mobile: stacked cards instead of a 3-column table */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {driverWins.slice(0, 20).map((d, i) => (
              <div key={`${d.driver}-card`} className="rounded-lg p-3 flex items-center justify-between gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>{i + 1}</span>
                  <span className="font-medium text-sm truncate" style={{ color: "var(--text)" }}>{d.driver}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text)" }}>{d.wins} wins</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg overflow-hidden hidden sm:block" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full border-collapse">
              <thead><tr style={headStyle}><th className={th}>#</th><th className={th}>Driver</th><th className={th + " text-right"}>Wins</th></tr></thead>
              <tbody>
                {driverWins.slice(0, 20).map((d, i) => (
                  <tr key={d.driver} style={rowBorder}>
                    <td className={td} style={{ color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={td} style={{ color: "var(--text)" }}>{d.driver}</td>
                    <td className={td + " text-right font-semibold"} style={{ color: "var(--text)" }}>{d.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          {/* Mobile: stacked cards instead of a 3-column table */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {constructorWins.slice(0, 15).map((c, i) => (
              <div key={`${c.constructor}-card`} className="rounded-lg p-3 flex items-center justify-between gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>{i + 1}</span>
                  <CrestIcon name={f1ConstructorCrestName(c.constructor)} />
                  <span className="font-medium text-sm truncate" style={{ color: "var(--text)" }}>{c.constructor}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text)" }}>{c.wins} wins</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg overflow-hidden self-start hidden sm:block" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full border-collapse">
              <thead><tr style={headStyle}><th className={th}>#</th><th className={th}>Constructor</th><th className={th + " text-right"}>Wins</th></tr></thead>
              <tbody>
                {constructorWins.slice(0, 15).map((c, i) => (
                  <tr key={c.constructor} style={rowBorder}>
                    <td className={td} style={{ color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={td} style={{ color: "var(--text)" }}><span className="inline-flex items-center gap-1.5"><CrestIcon name={f1ConstructorCrestName(c.constructor)} />{c.constructor}</span></td>
                    <td className={td + " text-right font-semibold"} style={{ color: "var(--text)" }}>{c.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* About */}
      <SectionHeading id="methodology">About this hub</SectionHeading>
      <p className="text-sm max-w-3xl leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Results and championships run from 1950 to the current season. Historical data derives from the Ergast archive;
        the current season refreshes from the Jolpica-F1 API the day after each Grand Prix, with live standings pulled
        from ESPN. Every race is mapped to its host metro, so circuits link through to their city pages. Race wins are
        counted from official classifications; constructors&rsquo; titles begin in 1958.
      </p>
    </main>
  );
}
