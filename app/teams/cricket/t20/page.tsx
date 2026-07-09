import type { Metadata } from "next";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import HubNav from "@/app/teams/HubNav";
import { getT20Leagues } from "@/lib/cricketClubs";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/cricket/t20";
const TITLE = "Domestic T20";
const DESC =
  "Franchise T20 cricket's champions, league by league: the IPL, Big Bash, PSL, CPL, BPL, T20 Blast, Super Smash, The Hundred, SA20, ILT20 and the Lanka Premier League. Winners only, by design.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const ORDER = ["ipl", "bbl", "psl", "blast", "hundred", "cpl", "bpl", "sa20", "ilt20", "lpl", "smash"];

export default function DomesticT20Page() {
  const data = getT20Leagues();
  if (!data) return null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/cricket"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Cricket
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/cricket" className="hover:underline">Cricket</Link>
        {" / "}
        <span>Domestic T20</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Domestic T20</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The franchise game&apos;s honours boards: every champion of the eleven T20
          leagues we can source from ball-by-ball archives, winners only. The IPL has
          its own full portal with standings and season pages — this is the
          cross-league trophy view. Title chips appear on each franchise&apos;s metro
          card.
        </p>
        <div className="mt-3">
          <Link
            href="/teams/ipl"
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            IPL portal →
          </Link>
        </div>
      </header>

      <HubNav
        items={ORDER.filter((k) => data.rolls[k]).map((k) => ({
          label: data.labels[k],
          href: `#${k}`,
        }))}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
        {ORDER.filter((k) => data.rolls[k]).map((k) => (
          <section key={k} className="rounded-xl border p-4" style={card}>
            <div className="flex items-baseline justify-between mb-2">
              <h2 id={k} className="font-semibold">{data.labels[k]}</h2>
              <span className="text-[10px] text-[var(--text-dim)] tabular-nums" style={mono}>
                {data.rolls[k].length} seasons
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mb-2">
              Most titled:{" "}
              {data.most_titled[k].slice(0, 3).map((m, i) => (
                <span key={m.winner}>
                  {i > 0 ? " · " : ""}
                  <span className="font-medium text-[var(--text)]"><CrestIcon name={m.winner} size={14} className="mr-1 align-[-2px]" />{m.winner}</span>
                  <span style={mono}> {m.titles}</span>
                </span>
              ))}
            </div>
            {/* Mobile: stacked rows (season / winner / runner-up) instead of a
                table where the runner-up column used to be dropped below sm. */}
            <div className="grid grid-cols-1 gap-1 sm:hidden overflow-y-auto" style={{ maxHeight: 260 }}>
              {data.rolls[k].map((r, i) => (
                <div
                  key={i}
                  className="rounded-md border px-2.5 py-1.5 text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>{r.season}</span>
                    <span className="font-medium inline-flex items-center gap-1.5 min-w-0 truncate">
                      <CrestIcon name={r.winner} size={14} />{r.winner}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[var(--text-dim)]">
                    <span className="text-[10px] uppercase tracking-wide">RU</span>
                    <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                      <CrestIcon name={r.ru} size={14} />{r.ru}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-y-auto hidden sm:block" style={{ overflowX: "auto", maxHeight: 260 }}>
              <table className="w-full text-xs">
                <tbody>
                  {data.rolls[k].map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1 pr-2 tabular-nums whitespace-nowrap" style={mono}>{r.season}</td>
                      <td className="py-1 font-medium"><span className="inline-flex items-center gap-1.5"><CrestIcon name={r.winner} size={16} />{r.winner}</span></td>
                      <td className="py-1 text-[var(--text-dim)]"><span className="inline-flex items-center gap-1.5"><CrestIcon name={r.ru} size={16} />{r.ru}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Notes</h2>
        <p className="text-[var(--text-muted)]">
          Champions derived from final-match results in public ball-by-ball archives
          (Cricsheet). The T20 Blast roll spans its NatWest and Vitality eras; The
          Hundred&apos;s 2026 rebrands (MI London, Manchester Super Giants, Sunrisers
          Leeds) carry their predecessors&apos; titles. Defunct champions — Deccan
          Chargers, Comilla Victorians, Jamaica Tallawahs and others — stay in the
          rolls without franchise cards. Leagues we track but cannot yet source
          (Major League Cricket, Nepal T20, WPL, The Hundred Women, Zimbabwe T20,
          Afghanistan Premier League) will join as data lands.
        </p>
      </section>
    </main>
  );
}
