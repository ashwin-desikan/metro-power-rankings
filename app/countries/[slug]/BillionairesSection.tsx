// Per-country "Billionaires" section. Server component.
import { fmtWorth, forbesUrl, type Billionaire } from "@/lib/billionaires";

export default function BillionairesSection({ list }: { list: Billionaire[] }) {
  if (!list.length) return null;
  const total = list.reduce((s, b) => s + (b.networth ?? 0), 0);
  return (
    <section className="mb-12" id="billionaires">
      <details>
        <summary className="cursor-pointer list-none flex items-center gap-2 group mb-4">
          <span className="text-xl font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
            Billionaires
          </span>
          <span className="text-xs text-[var(--text-dim)] ml-1">
            {list.length} · {fmtWorth(total)} combined · click to expand
          </span>
          <svg className="w-4 h-4 text-[var(--text-dim)] transition-transform details-chevron ml-auto"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        {/* Mobile: stacked cards */}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:hidden">
          {list.map((b) => (
            <div key={b.uri} className="rounded-lg border p-3 border-gray-100 dark:border-gray-800" style={{ backgroundColor: "var(--bg-card)" }}>
              <div className="flex items-start justify-between gap-2">
                <a href={forbesUrl(b.uri)} target="_blank" rel="noopener noreferrer"
                   className="font-medium text-sm text-[var(--text)] hover:text-[var(--accent)] hover:underline">
                  {b.rank ? <span className="text-[var(--text-dim)] tabular-nums mr-1.5">#{b.rank}</span> : null}
                  {b.name}
                  {b.selfMade === false ? <span className="ml-1.5 text-[10px] text-[var(--text-dim)]" title="Inherited">(inherited)</span> : null}
                </a>
                <span className="flex-shrink-0 tabular-nums font-semibold text-sm text-[var(--text)]">{fmtWorth(b.networth)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-[var(--text-muted)]">
                <span>{b.industries.join(", ")}</span>
                {b.source.length > 0 && <span className="text-[var(--text-dim)]">{b.source.join(", ")}</span>}
              </div>
            </div>
          ))}
        </div>
        {/* Desktop: table */}
        <div className="hidden sm:block overflow-x-auto mt-2">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-[var(--text-muted)]">
                <th className="pb-2 pr-4 font-semibold text-right">#</th>
                <th className="pb-2 pr-4 font-semibold">Name</th>
                <th className="pb-2 pr-4 font-semibold text-right whitespace-nowrap">Net worth</th>
                <th className="pb-2 pr-4 font-semibold">Industry</th>
                <th className="pb-2 font-semibold hidden sm:table-cell">Source</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.uri} className="border-b border-gray-100 dark:border-gray-800 last:border-0 align-top">
                  <td className="py-2 pr-4 text-right tabular-nums text-[var(--text-dim)]">{b.rank ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <a href={forbesUrl(b.uri)} target="_blank" rel="noopener noreferrer"
                       className="font-medium text-[var(--text)] hover:text-[var(--accent)] hover:underline">{b.name}</a>
                    {b.selfMade === false ? <span className="ml-1.5 text-[10px] text-[var(--text-dim)]" title="Inherited">(inherited)</span> : null}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums font-semibold text-[var(--text)] whitespace-nowrap">{fmtWorth(b.networth)}</td>
                  <td className="py-2 pr-4 text-[var(--text-muted)]">{b.industries.join(", ")}</td>
                  <td className="py-2 text-[var(--text-dim)] hidden sm:table-cell">{b.source.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-3">
          Source: Forbes real-time billionaires (via the rtb-api project). Net worth as of the latest monthly snapshot.
        </p>
      </details>
    </section>
  );
}
