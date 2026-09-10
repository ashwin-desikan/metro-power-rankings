import type { Metadata } from "next";
import Link from "next/link";
import { ResponsiveTable } from "@/app/teams/_shared/ResponsiveTable";
import { SectionHead } from "@/app/_shared/SectionHead";
import { Disclosure } from "@/app/_shared/Disclosure";
import { DataBar, DivergingBar } from "@/app/_shared/DataBar";
import { getForecastScoreboard, nextToSettle, longDate, type PendingRace, type ResolvedRace } from "@/lib/forecastScoreboard";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { ElectionsCrumbs, ElectionsHeader, SiblingHubs, SourcesCard, MONO, CARD, TH, THR, TD, TDR } from "../_shared/ui";
import ElectionsNav from "../_shared/ElectionsNav";

// Track record: the election forecasts scored the way /predictions/scoreboard
// scores everything else, but honest about the current state of the world -
// as of this writing every tracked race is still in the future, so "Pending"
// is the whole page and the resolved boards below render only once the first
// count comes in. Nothing here is hardcoded to a particular race: the "next
// to settle" line is computed from the pending list the same way
// lib/forecastScoreboard.ts's own nextToSettle() does it.
export const revalidate = 21600;

const PATH = "/elections/track-record";
const TITLE = "Track Record";
const DESC =
  "Every election forecast this site has published, scored against the result once the count is final: Brier scores, picks called correctly, seat-range error and calibration.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: [ogImage(TITLE, PATH)], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

function daysLabel(n: number | null): string {
  if (n == null) return "unscheduled";
  if (n < 0) return "voted, awaiting result";
  if (n === 0) return "today";
  return `${n.toLocaleString("en-US")} days`;
}

function PendingRow({ p }: { p: PendingRace }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate">{p.country}</div>
        <div className="mt-0.5 text-[13px]" style={{ ...MONO, color: "var(--text-dim)" }}>
          {longDate(p.election)} · forecast from {longDate(p.forecastFrom)}
        </div>
      </div>
      <div className="flex-shrink-0 text-right text-[13px] tabular-nums" style={MONO}>
        {p.awaitingResult ? (
          <span className="font-semibold" style={{ color: "#D97706" }}>result due</span>
        ) : (
          daysLabel(p.daysAway)
        )}
      </div>
    </div>
  );
}

function ResolvedRow({ r }: { r: ResolvedRace }) {
  const skillPct = r.summary.skill != null ? `${r.summary.skill > 0 ? "+" : ""}${r.summary.skill.toFixed(1)}%` : "—";
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate">{r.country}</div>
        <div className="mt-0.5 text-[13px]" style={{ ...MONO, color: "var(--text-dim)" }}>
          {longDate(r.election)} · {r.summary.correct ?? 0}/{r.summary.picks ?? 0} picks
        </div>
      </div>
      <div className="flex-shrink-0 text-right text-[13px] tabular-nums" style={MONO}>
        {skillPct}
      </div>
    </div>
  );
}

export default async function TrackRecordPage() {
  const sb = await getForecastScoreboard();
  const pending = [...(sb?.pending ?? [])].sort((a, b) => {
    if (a.daysAway == null && b.daysAway == null) return 0;
    if (a.daysAway == null) return 1;
    if (b.daysAway == null) return -1;
    return a.daysAway - b.daysAway;
  });
  const resolved = sb?.resolved ?? [];
  const totals = sb?.totals;
  const calibration = sb?.calibration ?? [];
  const first = nextToSettle(sb);

  const n = pending.length;
  const stamp = sb
    ? `AS OF ${sb.built} · ${n} RACE${n === 1 ? "" : "S"} PENDING · ${resolved.length} RESOLVED · SITE FORECAST LEDGER`
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ElectionsCrumbs tab="Track record" />
      <ElectionsHeader
        emoji="📋"
        title={TITLE}
        sub="Every seat range and win probability this site has published, scored once the count is final."
        stamp={stamp}
      />
      <ElectionsNav />
      <SiblingHubs />

      {/* ---------- pending ---------- */}
      <section className="mb-10">
        <SectionHead
          title="Pending"
          sub={
            resolved.length === 0
              ? "Nothing has voted yet. Every forecast below is still open."
              : "Races still to come, alongside what has already resolved."
          }
          more="Sorted by days to the vote; a race that has voted but has no result filed yet shows as result due, the same overdue treatment as the next-to-vote board on the Elections hub."
        />
        {n === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No forecast is currently tracking a pending race.
          </p>
        ) : (
          <>
            <p className="text-sm text-[var(--text-muted)] mb-3 max-w-3xl">
              {first
                ? <>The first to resolve is <strong className="text-[var(--text)]">{first.country}</strong> on {longDate(first.election)}{first.daysAway != null ? `, ${first.daysAway} days away` : ""}.</>
                : "Every pending race has voted and is awaiting a filed result."}
            </p>
            <ResponsiveTable
              variant="list"
              mobileNoun="races"
              style={CARD}
              mobileRows={pending.map((p) => <PendingRow key={p.code} p={p} />)}
            >
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card-hover)" }}>
                    <th className={TH}>Country</th>
                    <th className={TH}>Election date</th>
                    <th className={THR}>Days away</th>
                    <th className={TH}>Forecast from</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.code} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>{p.country}</td>
                      <td className={TD} style={MONO}>{longDate(p.election)}</td>
                      <td className={TDR} style={MONO}>
                        {p.awaitingResult ? (
                          <span className="font-semibold" style={{ color: "#D97706" }}>result due</span>
                        ) : (
                          daysLabel(p.daysAway)
                        )}
                      </td>
                      <td className={TD} style={MONO}>{longDate(p.forecastFrom)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          </>
        )}
      </section>

      {/* ---------- resolved ---------- */}
      {resolved.length > 0 && totals ? (
        <section className="mb-10">
          <SectionHead
            title="Resolved"
            sub="Scored the day the count was final, against the forecast's own last snapshot."
            more="Brier is the mean squared error of every binary probability this site published against what actually happened, lower is better. Seat MAE is the mean absolute error of the median seat call against the certified result. Coverage is the share of 80% intervals that actually contained the result; a well-calibrated model lands near 80%."
          />
          <div className="grid gap-3 sm:grid-cols-4 mb-4">
            <div className="rounded-xl border p-4" style={CARD}>
              <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Brier score</div>
              <div className="text-xl font-bold" style={MONO}><DataBar v={totals.brier ?? null} dp={4} /></div>
            </div>
            <div className="rounded-xl border p-4" style={CARD}>
              <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Picks correct</div>
              <div className="text-xl font-bold" style={MONO}>{totals.correct ?? 0}/{totals.picks ?? 0}</div>
            </div>
            <div className="rounded-xl border p-4" style={CARD}>
              <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Seat MAE</div>
              <div className="text-xl font-bold" style={MONO}><DataBar v={totals.mae ?? null} dp={1} /></div>
            </div>
            <div className="rounded-xl border p-4" style={CARD}>
              <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>80% interval coverage</div>
              <div className="text-xl font-bold" style={MONO}><DataBar v={totals.coverage ?? null} dp={0} suffix="%" scale={100} /></div>
            </div>
          </div>
          <ResponsiveTable
            variant="list"
            mobileNoun="races"
            style={CARD}
            mobileRows={resolved.map((r) => <ResolvedRow key={r.code} r={r} />)}
          >
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card-hover)" }}>
                  <th className={TH}>Country</th>
                  <th className={TH}>Election</th>
                  <th className={THR}>Picks</th>
                  <th className={THR}>Brier</th>
                  <th className={THR}>Skill vs market</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((r) => (
                  <tr key={r.code} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>{r.country}</td>
                    <td className={TD} style={MONO}>{longDate(r.election)}</td>
                    <td className={TDR} style={MONO}>{r.summary.correct ?? 0}/{r.summary.picks ?? 0}</td>
                    <td className={TDR} style={MONO}>{r.summary.brier != null ? r.summary.brier.toFixed(4) : "—"}</td>
                    <td className={TDR}><DivergingBar v={r.summary.skill != null ? r.summary.skill / 100 : null} dp={1} suffix="%" scale={100} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>

          {calibration.length > 0 ? (
            <Disclosure
              id="calibration"
              title="When the model said 70%, did it happen 70% of the time?"
              meta={`${calibration.length} bins`}
              className="mt-6"
              bodyClassName="p-4 sm:p-5"
            >
              <p className="text-sm text-[var(--text-muted)] mb-3 max-w-3xl">A well-calibrated forecast lands on the diagonal.</p>
              <ResponsiveTable
                variant="list"
                mobileNoun="bins"
                style={CARD}
                mobileRows={calibration.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1 text-[13px] font-semibold" style={MONO}>{c.lo}%–{c.hi}%</div>
                    <div className="flex-shrink-0 text-right text-[13px] tabular-nums" style={MONO}>
                      {c.said != null ? `said ${c.said}%` : "—"} · {c.happened != null ? `happened ${c.happened}%` : "—"} · {c.n} n
                    </div>
                  </div>
                ))}
              >
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left" style={{ background: "var(--bg-card-hover)" }}>
                      <th className={TH}>Bin</th>
                      <th className={THR}>Said</th>
                      <th className={THR}>Happened</th>
                      <th className={THR}>n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibration.map((c, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className={TD} style={MONO}>{c.lo}%–{c.hi}%</td>
                        <td className={TDR} style={MONO}>{c.said != null ? `${c.said}%` : "—"}</td>
                        <td className={TDR} style={MONO}>{c.happened != null ? `${c.happened}%` : "—"}</td>
                        <td className={TDR} style={MONO}>{c.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </Disclosure>
          ) : null}
        </section>
      ) : null}

      <SourcesCard>
        <p>
          Scored by the same pipeline as{" "}
          <Link href="/predictions/scoreboard" className="text-[var(--accent)] hover:underline">The Ledger</Link>
          , the site&apos;s general forecast accountability page: every pre-election snapshot is frozen
          automatically before the vote, then graded against the certified result once it is filed.
          Method for each live forecast is on{" "}
          <Link href="/elections/forecast" className="text-[var(--accent)] hover:underline">Election Forecasts</Link>.
        </p>
      </SourcesCard>
    </main>
  );
}
