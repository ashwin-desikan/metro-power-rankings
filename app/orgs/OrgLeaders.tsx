import { getOrgLeadership } from "@/lib/orgLeaders";

function yr(d: string | null): string {
  if (!d) return "—";
  const y = parseInt(d.slice(0, 4), 10);
  return isNaN(y) ? "—" : String(y);
}

export default function OrgLeaders({ orgKey }: { orgKey: string }) {
  const data = getOrgLeadership(orgKey);
  if (!data) return null;
  const history = [...data.history].reverse();
  const cur = data.current;

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
        {data.office}
      </p>
      <p className="text-sm font-medium text-[var(--text)]">
        {cur.name}
        {cur.country && (
          <span className="text-[var(--text-muted)] font-normal"> · {cur.country}</span>
        )}
        {cur.since && (
          <span className="text-[var(--text-muted)] font-normal"> · since {yr(cur.since)}</span>
        )}
      </p>

      {data.history.length > 0 && (
      <details className="mt-2 group">
        <summary className="cursor-pointer list-none text-xs text-[var(--accent)] hover:underline">
          Leadership history ({data.history.length}) · click to expand
        </summary>
        <div className="mt-2">
          {/* Mobile: stacked cards */}
          <div className="sm:hidden grid grid-cols-1 gap-1.5">
            {history.map((l, i) => (
              <div
                key={`${l.name}-${l.start ?? i}-card`}
                className="rounded-md border px-3 py-1.5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-[var(--text)]">
                    {l.name}
                    {l.current && (
                      <span className="ml-1.5 text-[10px] font-semibold text-green-600 dark:text-green-400">✦</span>
                    )}
                  </span>
                  <span className="flex-shrink-0 text-xs text-[var(--text-muted)] tabular-nums">
                    {yr(l.start)}–{l.current ? "Present" : yr(l.end)}
                  </span>
                </div>
                {l.party && <p className="text-xs text-[var(--text-muted)] mt-0.5">{l.party}</p>}
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] pr-3">Name</th>
                  <th className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] pr-3">Country</th>
                  <th className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Years</th>
                </tr>
              </thead>
              <tbody>
                {history.map((l, i) => (
                  <tr
                    key={`${l.name}-${l.start ?? i}`}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="py-1.5 pr-3 text-sm text-[var(--text)] whitespace-nowrap">
                      {l.name}
                      {l.current && (
                        <span className="ml-1.5 text-[10px] font-semibold text-green-600 dark:text-green-400">✦</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-sm text-[var(--text-muted)] whitespace-nowrap">
                      {l.party ?? "—"}
                    </td>
                    <td className="py-1.5 text-sm text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                      {yr(l.start)}–{l.current ? "Present" : yr(l.end)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.note && (
            <p className="mt-2 text-[11px] text-[var(--text-dim)] italic">{data.note}</p>
          )}
        </div>
      </details>
      )}
    </div>
  );
}
