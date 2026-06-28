// Per-country "Conflicts since 1945" section. Server component.
import Link from "next/link";
import { warYears, fmtDeaths, type CountryWar, type Belligerent } from "@/lib/conflicts";

function Bel({ b }: { b: Belligerent }) {
  const inner = b.principal ? <strong>{b.name}</strong> : <>{b.name}</>;
  return b.slug ? (
    <Link href={`/countries/${b.slug}`} className="hover:text-[var(--accent)] hover:underline">
      {inner}
    </Link>
  ) : (
    <span className="text-[var(--text-muted)]">{inner}</span>
  );
}

function Opponents({ list }: { list: Belligerent[] }) {
  return (
    <span className="flex flex-wrap gap-x-1.5">
      {list.map((b, i) => (
        <span key={`${b.name}-${i}`} className="whitespace-nowrap">
          <Bel b={b} />
          {i < list.length - 1 ? <span className="text-[var(--text-dim)]">,</span> : null}
        </span>
      ))}
    </span>
  );
}

export default function ConflictsSection({ wars }: { wars: CountryWar[] }) {
  if (!wars.length) return null;
  return (
    <section className="mb-12" id="conflicts">
      <details>
        <summary className="cursor-pointer list-none flex items-center gap-2 group mb-4">
          <span className="text-xl font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
            Conflicts since 1945
          </span>
          <span className="text-xs text-[var(--text-dim)] ml-1">
            {wars.length} interstate {wars.length === 1 ? "war" : "wars"} · click to expand
          </span>
          <svg className="w-4 h-4 text-[var(--text-dim)] transition-transform details-chevron ml-auto"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-[var(--text-muted)]">
                <th className="pb-2 pr-4 font-semibold">Conflict</th>
                <th className="pb-2 pr-4 font-semibold">Years</th>
                <th className="pb-2 pr-4 font-semibold">Against</th>
                <th className="pb-2 font-semibold text-right whitespace-nowrap">Combat deaths</th>
              </tr>
            </thead>
            <tbody>
              {wars.map(({ war, opponents }) => (
                <tr key={war.name} className="border-b border-gray-100 dark:border-gray-800 last:border-0 align-top">
                  <td className="py-2 pr-4">
                    <a href={war.url} target="_blank" rel="noopener noreferrer"
                       className="font-medium text-[var(--text)] hover:text-[var(--accent)] hover:underline">
                      {war.name}
                    </a>
                    {war.major ? <span className="ml-1.5 text-[10px] text-red-500" title="10,000+ combat deaths">●</span> : null}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap tabular-nums text-[var(--text-muted)]">{warYears(war)}</td>
                  <td className="py-2 pr-4 text-[var(--text-muted)]"><Opponents list={opponents} /></td>
                  <td className="py-2 text-right tabular-nums text-[var(--text-dim)] whitespace-nowrap">{fmtDeaths(war)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-3">
          Bold = principal belligerent. Source: Wikipedia, “List of interstate wars since 1945.”
        </p>
      </details>
    </section>
  );
}
