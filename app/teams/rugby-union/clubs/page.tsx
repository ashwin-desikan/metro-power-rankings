import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { getRugbyClubRolls } from "@/lib/rugbyClubs";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/rugby-union/clubs";
const TITLE = "Domestic Rugby";
const DESC =
  "Club rugby's winners, competition by competition: the Champions Cup, Top 14 back to 1892, the Premiership, Super Rugby, the Currie Cup, the URC lineage, and Japan's League One. Winners only, by design.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const ORDER = ["european", "top14", "premiership", "urc", "super", "currie", "japan"];

export default function DomesticRugbyPage() {
  const clubs = getRugbyClubRolls();
  if (!clubs) return null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/rugby-union"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Rugby Union
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/rugby-union" className="hover:underline">Rugby Union</Link>
        {" / "}
        <span>Domestic Rugby</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Domestic Rugby</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Club rugby&apos;s honours boards: every champion of the seven competitions we
          track, from the first French final in 1892 to last month&apos;s League One
          decider. Winners only, by design — tables and seasons live with the clubs.
          Champions link to their metro pages; title chips appear on each club&apos;s
          metro card.
        </p>
      </header>

      <HubNav
        items={ORDER.filter((k) => clubs.rolls[k]).map((k) => ({
          label: clubs.labels[k],
          href: `#${k}`,
        }))}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
        {ORDER.filter((k) => clubs.rolls[k]).map((k) => (
          <section key={k} className="rounded-xl border p-4" style={card}>
            <div className="flex items-baseline justify-between mb-2">
              <h2 id={k} className="font-semibold">{clubs.labels[k]}</h2>
              <span className="text-[10px] text-[var(--text-dim)] tabular-nums" style={mono}>
                {clubs.rolls[k].length} seasons
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mb-2">
              Most titled:{" "}
              {clubs.most_titled[k].slice(0, 3).map((m, i) => (
                <span key={m.winner}>
                  {i > 0 ? " · " : ""}
                  <CrestIcon name={m.team ?? m.winner} size={14} className="mr-1 align-middle" />
                  <span className="font-medium text-[var(--text)]">{m.winner}</span>
                  <span style={mono}> {m.titles}</span>
                </span>
              ))}
            </div>
            {/* Mobile: stacked cards, same rows as the desktop table below.
                Runner-up (hidden on the desktop table at narrow widths) is
                shown explicitly here so no column is silently dropped. */}
            <div className="sm:hidden overflow-y-auto" style={{ maxHeight: 300 }}>
              {clubs.rolls[k].map((r, i) => (
                <div
                  key={i}
                  className="border-b last:border-b-0 py-1.5 text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium min-w-0 truncate">
                      <CrestIcon name={r.team ?? r.winner} size={16} className="mr-1.5 align-middle" />
                      {r.metro_slug ? (
                        <Link href={`/rankings/${r.metro_slug}`} className="hover:text-[var(--accent)]">
                          {r.winner}
                        </Link>
                      ) : (
                        r.winner
                      )}
                      {r.shared ? <span className="text-[var(--text-dim)]"> (shared)</span> : null}
                    </span>
                    <span className="tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>
                      {r.season}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[var(--text-dim)]">Runner-up: {r.ru || "—"}</div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block overflow-y-auto" style={{ overflowX: "auto", maxHeight: 300 }}>
              <table className="w-full text-xs">
                <tbody>
                  {clubs.rolls[k].map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1 pr-2 tabular-nums whitespace-nowrap" style={mono}>{r.season}</td>
                      <td className="py-2 font-medium">
                        <CrestIcon name={r.team ?? r.winner} size={16} className="mr-1.5 align-middle" />
                        {r.metro_slug ? (
                          <Link href={`/rankings/${r.metro_slug}`} className="hover:text-[var(--accent)]">
                            {r.winner}
                          </Link>
                        ) : (
                          r.winner
                        )}
                        {r.shared ? <span className="text-[var(--text-dim)]"> (shared)</span> : null}
                      </td>
                      <td className="py-1 text-[var(--text-dim)]">{r.ru}</td>
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
          The Champions Cup roll includes the Heineken Cup era; the URC roll runs the
          Celtic League, Pro12 and Pro14 lineage; Japan&apos;s roll spans the Top League
          and League One. Champions link to the metro that hosts the club today.
          Historic champions whose clubs are gone from the top flight (Wasps, FC
          Lourdes, Stade Bordelais and others) appear in the rolls and, where their
          city is in the metro corpus, as defunct tiles on its metro page.
        </p>
      </section>
    </main>
  );
}
