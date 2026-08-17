import type { Metadata } from 'next';
import BusinessNav from '../BusinessNav';
import { Crumbs, TabHeader, TableBox, TH, THR, TD, TDR, MONO } from '../ui';
import { getRankings, getRankingMetros } from '@/lib/business';
import YearBoard from './YearBoard';
import MetroBoard from './MetroBoard';

export const metadata: Metadata = {
  title: 'Corporate rankings through time | Business of the Metros',
  description:
    'The largest companies of every year from 1955 to 2026, as published at the time, '
    + 'including the ones that later merged, delisted or failed.',
};

function fmtT(musd: number): string {
  return '$' + (musd / 1e6).toFixed(1) + 'T';
}

export default async function RankingsPage() {
  const [data, metros] = await Promise.all([getRankings(), getRankingMetros()]);

  if (!data) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Crumbs tab="Rankings" />
        <BusinessNav />
        <p className="text-sm text-[var(--text-muted)]">
          The rankings data has not been built yet. Run
          <code className="mx-1">scripts/rankings/emit_rankings.py</code>.
        </p>
      </main>
    );
  }

  const { meta, stats, longest } = data;
  const first = stats[String(meta.first_year)];
  const last = stats[String(meta.last_year)];
  const hqYears = Object.values(stats).filter((s) => s.hq > 0).length;

  // 🔴 The legend must describe the marks the board is ACTUALLY showing. Curating
  // the last provably-wrong label away and leaving "† marks one we can prove
  // wrong" in the copy sends the reader hunting for a symbol that is not there.
  // Counting from the data means the page can never drift from the board again.
  const nameStates = Object.values(data.years).reduce(
    (acc, rows) => {
      for (const r of rows) acc[r[8]] = (acc[r[8]] ?? 0) + 1;
      return acc;
    },
    {} as Record<number, number>,
  );
  const checkedNames = (nameStates[0] ?? 0) + (nameStates[1] ?? 0);
  const wrongNames = nameStates[2] ?? 0;
  const undatedNames = nameStates[3] ?? 0;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <Crumbs tab="Rankings" />
      <BusinessNav />

      <TabHeader
        emoji="🏛️"
        title="Corporate rankings through time"
        sub={
          'The largest companies of every year since 1955, as the list was published at '
          + 'the time. Bethlehem Steel, Pan Am and Enron are here because they were alive '
          + 'then. This is the opposite of a chart built from today’s survivors.'
        }
        stamp={`${meta.years} years · ${meta.total_rows.toLocaleString()} listings · ${meta.companies.toLocaleString()} companies`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          ['Span', `${meta.first_year}–${meta.last_year}`],
          ['Companies ever listed', meta.companies.toLocaleString()],
          [`Combined revenue, ${meta.first_year}`, first ? fmtT(first.rev) : '—'],
          [`Combined revenue, ${meta.last_year}`, last ? fmtT(last.rev) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]" style={MONO}>
              {label}
            </div>
            <div className="text-xl font-bold mt-1">{value}</div>
          </div>
        ))}
      </div>

      <YearBoard data={data} />

      {metros && <MetroBoard data={metros} />}

      <section className="mt-10">
        <h2 className="text-2xl font-bold mb-1">The persistent</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
          Companies by the number of separate years they appear. Longevity on this list
          is a different achievement from being briefly enormous, and the two orders
          barely resemble each other.
        </p>
        <TableBox stickyCol={2}>
          <thead>
            <tr className="text-left border-b" style={{ borderColor: 'var(--border)' }}>
              <th className={TH}>#</th>
              <th className={TH}>Company</th>
              <th className={THR}>Years listed</th>
              <th className={THR}>Best rank</th>
            </tr>
          </thead>
          <tbody>
            {longest.map(([name, yrs, best], i) => (
              <tr key={name} className="border-b" style={{ borderColor: 'var(--border)' }}>
                <td className={TD} style={MONO}>{i + 1}</td>
                <td className={TD}>{name}</td>
                <td className={TDR} style={MONO}>{yrs}</td>
                <td className={TDR} style={MONO}>{best}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </section>

      <section className="mt-10 rounded-xl border p-4 text-sm text-[var(--text-muted)] max-w-3xl"
               style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[var(--text)] mb-2">How to read this</h2>
        <p className="mb-2">
          Ranked by revenue, which is the only measure with an unbroken record back to
          1955. Market value is shown where the source carries it, from 2013.
        </p>
        <p className="mb-2">
          Companies are not merged across mergers. Exxon and Mobil each end in 1999 and
          ExxonMobil begins in 2000, because folding them together would erase four
          decades in which Mobil was independently one of the largest companies on earth.
          A rename is treated as the same company; a merger is not.
        </p>
        <p className="mb-2">
          <strong className="text-[var(--text)]">Neither source dates company names.</strong>{' '}
          Both Fortune feeds keep one record per company and stamp its present-day name
          on every year of that record. Left alone the 1955 list claims Exxon Mobil
          existed 44 years before the merger that created it, and the 1996 list reads
          GE Aerospace, RTX and Truist, names dating from 2024, 2023 and 2019. Of 2,995
          modern company records, 2,875 show exactly one name across their whole span.
        </p>
        <p className="mb-2">
          So the table says which names it has checked. A name with no mark has been{' '}
          <strong className="text-[var(--text)]">checked against that year</strong>{' '}
          &mdash; either corrected to what the company was actually called, or
          confirmed unchanged; {checkedNames.toLocaleString()} of{' '}
          {meta.total_rows.toLocaleString()} rows are in that state. A{' '}
          <span style={{ color: 'var(--text-dim)' }}>°</span> marks a name the source
          recorded but never dated, so it may be the company&rsquo;s present-day name
          rather than that year&rsquo;s, and {undatedNames.toLocaleString()} rows still
          carry one.
          {wrongNames > 0 && (
            <>
              {' '}A <span style={{ color: 'var(--accent, #4f9dff)' }}>†</span> marks one
              we can prove wrong for that year and have not corrected yet;{' '}
              {wrongNames.toLocaleString()} remain.
            </>
          )}
        </p>
        <p className="mb-2">
          Corrections so far include Standard Oil of Indiana for Amoco before 1985,
          Swift &amp; Company for Esmark before 1973, Western Electric for AT&amp;T
          Technologies before 1984, Aluminum Company of America for Alcoa before 1999,
          and Allied Chemical for the record the sources label Honeywell International
          &mdash; which is the Allied lineage, not the Minneapolis company of the
          same name.
        </p>
        <p className="mb-2">
          Headquarters is published by the source from 2007 and carried to a company&rsquo;s
          other years where it can be; {hqYears} of {meta.years} years carry it.
        </p>
        {metros && (
          <p className="mb-2">
            The metro view places a company by the headquarters era containing that
            year, so a company that moved counts for each metro it actually occupied.
            The 213 companies that reach a top 100 and had no published address were
            researched by hand into {' '}
            {metros.meta.placedByDatedEra.toLocaleString()} dated placements; the rest
            carry a single address across their run and are marked{' '}
            <span style={{ color: 'var(--text-dim)' }}>°</span>. Cities are mapped to
            metros from the project&rsquo;s own municipality table, and where a city
            could not be resolved it is left out rather than guessed &mdash;{' '}
            {metros.meta.unplaced} of {metros.meta.rows.toLocaleString()} rows.
          </p>
        )}
        <p className="text-xs text-[var(--text-dim)]" style={MONO}>
          {meta.source} · generated {meta.generated_at.slice(0, 10)}
        </p>
      </section>
    </main>
  );
}
