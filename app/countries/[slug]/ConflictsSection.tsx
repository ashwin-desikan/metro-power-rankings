// Per-country "Conflicts since 1945" section. Server component.
import Link from "next/link";
import { warYears, fmtDeaths, type CountryWar, type Belligerent } from "@/lib/conflicts";
import Collapsible from "./Collapsible";
import { withIcon } from "./sectionIcons";
import { CappedList } from "@/app/_shared/Disclosure";

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
    <Collapsible
      id="conflicts"
      title={withIcon("conflicts", "Conflicts since 1945")}
      defaultOpen={false}
      right={
        <span className="text-xs text-[var(--text-dim)]">
          {wars.length} interstate {wars.length === 1 ? "war" : "wars"} · click to expand
        </span>
      }
    >
        {/* Mobile: stacked cards */}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={12}
            noun="wars"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={wars.map(({ war, opponents }) => (
            <div key={war.name} className="rounded-lg border p-3 border-gray-100 dark:border-gray-800" style={{ backgroundColor: "var(--bg-card)" }}>
              <div className="flex items-start justify-between gap-2">
                <a href={war.url} target="_blank" rel="noopener noreferrer"
                   className="font-medium text-sm text-[var(--text)] hover:text-[var(--accent)] hover:underline">
                  {war.name}
                  {war.major ? <span className="ml-1.5 text-[10px] text-red-500" title="10,000+ combat deaths">●</span> : null}
                </a>
                <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{warYears(war)}</span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]"><Opponents list={opponents} /></div>
              <div className="mt-1.5 text-xs text-[var(--text-dim)]">Combat deaths: {fmtDeaths(war)}</div>
            </div>
          ))}
          />
        </div>
        {/* Desktop: table */}
        <div className="hidden sm:block overflow-x-auto mt-2">
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
    </Collapsible>
  );
}
