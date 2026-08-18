import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { f1ConstructorCrestName } from "@/lib/f1Crest";
import { getPagedF1Constructors, getF1ConstructorsMeta } from "@/lib/f1Constructors";

export const dynamicParams = false;

const PAGE_PATH = "/teams/f1/constructors";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Formula 1 Teams";
const PAGE_DESCRIPTION =
  "Every Formula 1 team since 1950, counted as a continuous organisation rather than a chassis name: Team Lotus's 79 wins in one place, and the Brackley team from Tyrrell through Brawn to Mercedes.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="text-[11px] px-2 py-0.5 rounded"
      style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
      {children}
    </span>
  );
}

export default function F1ConstructorsPage() {
  const meta = getF1ConstructorsMeta();
  const teams = getPagedF1Constructors();
  const chained = teams.filter((t) => t.chain.length > 1).length;

  const td = "px-3 py-1.5 text-sm";
  const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wider";
  const headStyle = { background: "var(--bg-card)", color: "var(--text-dim)" } as const;
  const rowBorder = { borderTop: "1px solid var(--border)" } as const;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
        <Link href="/teams/f1" className="hover:underline">Formula 1</Link> · Teams
      </nav>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-dim)" }}>Motorsport · Formula 1</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: "var(--text)" }}>Formula 1 Teams</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Every team to have entered a World Championship race, counted as a <em>continuous organisation</em>{" "}
          rather than as a chassis name. The archive everyone builds on files Team Lotus under four separate
          records and splits its 79 wins between them; it also files three unrelated Alfa Romeos as one. Here they
          are put back the way the paddock understood them, and where the call is arguable the page says so.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip title="Seasons covered">{meta.first_season}&ndash;{meta.last_season}</Chip>
          <Chip title="Teams with their own page: ten or more races, or at least one win">{teams.length} teams</Chip>
          <Chip title="Teams whose name changed while the organisation continued">{chained} changed name</Chip>
          <Chip title="Archive constructor records folded into those teams">{meta.constructor_records} source records</Chip>
        </div>
      </header>

      {/* Mobile: cards, capped so a 78-row list does not run to dozens of
          screens the way an uncapped fallback does (DESIGN-STANDARDS). */}
      <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[80vh] overflow-y-auto overscroll-contain">
        {teams.map((t, i) => (
          <div key={`${t.slug}-card`} className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-dim)" }}>{i + 1}</span>
                <CrestIcon name={f1ConstructorCrestName(t.name)} />
                <Link href={`/teams/f1/constructors/${t.slug}`} className="font-medium text-sm truncate hover:underline" style={{ color: "var(--text)" }}>{t.name}</Link>
              </span>
              <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text)" }}>{t.wins} wins</span>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs mt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Races</div>
                <div className="tabular-nums" style={{ color: "var(--text-muted)" }}>{t.races}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Titles</div>
                <div className="tabular-nums" style={{ color: "var(--text-muted)" }}>{t.titles}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Span</div>
                <div className="tabular-nums" style={{ color: "var(--text-dim)" }}>{t.first}&ndash;{t.last}</div>
              </div>
            </div>
            {t.chain.length > 1 && (
              <div className="mt-2 text-[11px] break-words" style={{ color: "var(--text-dim)" }}>
                {t.chain.join(" → ")}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg overflow-x-auto hidden sm:block" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full border-collapse" data-sticky-col="2">
          <thead><tr style={headStyle}>
            <th className={th}>#</th>
            <th className={th}>Team</th>
            <th className={th + " text-right"}>Wins</th>
            <th className={th + " text-right"}>Titles</th>
            <th className={th + " text-right"}>Races</th>
            <th className={th + " text-right"}>Poles</th>
            <th className={th}>Span</th>
            <th className={th}>Ran as</th>
          </tr></thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.slug} style={rowBorder}>
                <td className={td} style={{ color: "var(--text-dim)" }}>{i + 1}</td>
                <td className={td} style={{ color: "var(--text)" }}>
                  <span className="inline-flex items-center gap-1.5">
                    <CrestIcon name={f1ConstructorCrestName(t.name)} />
                    <Link href={`/teams/f1/constructors/${t.slug}`} className="hover:underline">{t.name}</Link>
                    {t.current && <span className="text-[9px] px-1 rounded uppercase tracking-wider" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>racing</span>}
                  </span>
                </td>
                <td className={td + " text-right font-semibold"} style={{ color: "var(--text)" }}>{t.wins}</td>
                <td className={td + " text-right"} style={{ color: "var(--text-muted)" }}>{t.titles || "—"}</td>
                <td className={td + " text-right"} style={{ color: "var(--text-muted)" }}>{t.races}</td>
                <td className={td + " text-right"} style={{ color: "var(--text-muted)" }}>{t.poles || "—"}</td>
                <td className={td + " tabular-nums"} style={{ color: "var(--text-dim)" }}>{t.first}&ndash;{t.last}</td>
                <td className={td + " text-xs"} style={{ color: "var(--text-dim)" }}>
                  {t.chain.length > 1 ? t.chain.join(" → ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-10 rounded-2xl border p-5 max-w-3xl" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text)" }}>How this board works</h2>
        <div className="text-[13.5px] leading-relaxed space-y-3" style={{ color: "var(--text-muted)" }}>
          <p>
            Results come from the Ergast archive and its Jolpica successor, which identify a car by chassis and
            engine rather than by the company that entered it. Four rules turn that into teams. Chassis-engine
            variants of one marque are merged, so Lotus-Climax and Lotus-Ford are Team Lotus. Records that weld
            unrelated organisations together are split, which is the two Alfa Romeos, the two Mercedes, the two
            Renaults, the two Hondas, the two Aston Martins and the two ATSs that share only an acronym.
          </p>
          <p>
            Where a team changed its name but the organisation carried on, the eras are chained: Tyrrell to BAR to
            Honda to Brawn to Mercedes at Brackley, Toleman to Benetton to Renault to Lotus to Alpine at Enstone,
            Stewart to Jaguar to Red Bull at Milton Keynes. A team page shows the chain and gives each era its own
            row, so nothing is hidden inside a total.
          </p>
          <p>
            Everything else is left alone and noted. Two calls on this board are genuinely arguable and are marked
            as such on the teams concerned: whether Racing Point continues Force India through the 2018
            administration, and whether the 1968-69 Matra-Ford wins belong to the chassis constructor or to Ken
            Tyrrell&apos;s team that entered them.
          </p>
          <p style={{ color: "var(--text-dim)" }}>
            A team earns a page with ten or more races or at least one win. Championship totals count finished
            seasons only, so a leader mid-season is not yet a champion. Constructors&rsquo; titles begin in 1958.
          </p>
        </div>
      </section>
    </main>
  );
}
