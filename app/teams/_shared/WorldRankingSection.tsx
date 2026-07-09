import Link from "next/link";
import { flagCdnUrl } from "@/lib/international-display";
import type { WorldRanking } from "@/lib/worldRankings";

// Server component: renders an official federation world ranking as a compact,
// scrollable table. Static (already in rank order); nations link to their
// country page where one exists.

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function NationCell({ name, slug }: { name: string; slug: string | null }) {
  const flag = slug ? flagCdnUrl(slug) : null;
  const label = (
    <span className="inline-flex items-center gap-1.5">
      {flag ? <img src={flag} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" loading="lazy" decoding="async" /> : null}
      <span>{name}</span>
    </span>
  );
  return slug ? (
    <Link href={`/countries/${slug}`} className="hover:text-[var(--accent)]">{label}</Link>
  ) : (
    label
  );
}

export default function WorldRankingSection({
  id,
  heading,
  blurb,
  ranking,
}: {
  id: string;
  heading: string;
  blurb?: string;
  ranking: WorldRanking;
}) {
  const { rows, suspended, _meta } = ranking;
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-lg font-semibold mb-1">{heading}</h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        {blurb ? `${blurb} ` : ""}
        {_meta.source}, as of {_meta.asOf}.
      </p>
      <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={card}>
        <table className="w-full text-sm min-w-[420px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium text-right">#</th>
              <th className="py-2 px-3 font-medium">Nation</th>
              <th className="py-2 px-3 font-medium text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.rank}-${r.name}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank}</td>
                <td className="py-1.5 px-3 font-medium"><NationCell name={r.name} slug={r.slug} /></td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.points.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {suspended && suspended.length > 0 && (
        <p className="text-xs text-[var(--text-dim)] mt-2">
          Currently suspended from the program and unranked:{" "}
          {suspended.map((s, i) => (
            <span key={s.name}>
              {i > 0 ? ", " : ""}
              {s.name} ({s.points.toLocaleString()} pts)
            </span>
          ))}
          .
        </p>
      )}
    </section>
  );
}
