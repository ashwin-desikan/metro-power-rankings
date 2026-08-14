import type { Metadata } from "next";
import Link from "next/link";

import HubNav from "@/app/teams/HubNav";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getCrest } from "@/lib/teamCrest";
import {
  TIME_MACHINES, DOMAIN_ORDER, spanLabel, covers, EARLIEST_AD,
  GRAIN_ORDER, GRAIN_META,
  type TimeMachine, type TimeGrain,
} from "@/lib/timeMachines";
import { getYearCrossSection, type YearStrand } from "@/lib/timeMachineYear";
import { NOTABLE_YEARS, randomNotableYear, whyThisYear } from "@/lib/timeMachineYears";
import YearPicker from "./YearPicker";

// 🔴 DYNAMIC ON PURPOSE. A cold arrival lands on a RANDOM notable year
// (Ashwin, 2026-08-14: it should be fun to come to), which a cached page
// cannot do — everyone would get whichever year the cache happened to freeze.
export const dynamic = "force-dynamic";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const BORD = { borderColor: "var(--border)" } as const;

const PATH = "/time-machine";
const TITLE = "The Time Machine";
const DESC =
  "Pick a year and see the world as it stood: who held every territory, who ruled, who was champion, what was on at the cinema. Sixteen boards, one year at a time.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website",
  },
  twitter: {
    images: ["/og-default.png"], card: "summary_large_image",
    title: `${TITLE} | ${SITE_NAME}`, description: DESC,
  },
};

const DOMAIN_ID: Record<string, string> = {
  "The world": "world", "Sport": "sport", "Culture": "culture", "Money": "money", "Play": "play",
};

/** Flag, crest, or the strand's own glyph. One slot, so the cards line up. */
function StrandIcon({ s }: { s: YearStrand }) {
  const flag = s.flag ? flagCdnUrl(s.flag, "40x30") : null;
  const crest = s.crest ? getCrest(s.crest) : null;
  if (flag) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={flag} alt="" aria-hidden width={28} height={21} className="rounded-sm object-contain flex-shrink-0" />;
  }
  if (crest) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={crest.src} alt="" aria-hidden width={26} height={26} className="rounded-full object-contain flex-shrink-0" />;
  }
  return <span className="text-xl leading-none flex-shrink-0" aria-hidden>{s.emoji ?? "🕰️"}</span>;
}

/**
 * How fine a moment this board lets you ask for.
 *
 * Ashwin, 2026-08-14: "mark the hubs that show yearly data vs the ones that
 * show month/year or any other time slicing." The hub had been flattening this
 * — every card said "1800–2025" and nothing said whether asking for March was
 * an option. Half these boards are finer than a year and one is coarser in
 * practice, and a reader deciding where to click deserves to know before they
 * click. `title` carries the long form so the pill can stay two words.
 */
function GrainPill({ grain }: { grain: TimeGrain }) {
  const g = GRAIN_META[grain];
  return (
    <span
      title={g.note}
      className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ ...MONO, color: "var(--text-dim)", background: "var(--bg-card-hover, var(--bg-card))", border: "1px solid var(--border)" }}
    >
      <span aria-hidden>{g.glyph}</span>{g.label}
    </span>
  );
}

/**
 * The card's icon slot. A machine about one country carries `flag` (a country
 * slug) and gets a real flag image; everything else gets its pictograph. The
 * registry may NOT use flag emoji — Windows renders 🇬🇧 as the letters "GB" in
 * a box, which is the bug this exists to close. See lib/timeMachines.ts.
 */
function MachineIcon({ m }: { m: TimeMachine }) {
  const flag = m.flag ? flagCdnUrl(m.flag, "40x30") : null;
  if (flag) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={flag} alt="" aria-hidden width={30} height={22} className="rounded-sm object-contain flex-shrink-0 mt-0.5" />;
  }
  return <span className="text-2xl leading-none flex-shrink-0" aria-hidden>{m.emoji}</span>;
}

function MachineCard({ m, year }: { m: TimeMachine; year: number }) {
  const inRange = covers(m, year);
  const deep = inRange ? m.deepLink?.(year) : undefined;
  const href = deep ?? m.href;
  return (
    <Link
      href={href}
      className="flex flex-col min-w-0 p-4 rounded-xl border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
      style={CARD}
    >
      <div className="flex items-start gap-2.5 mb-1.5">
        <MachineIcon m={m} />
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-tight">{m.name}</h3>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <span className="text-[10px] tabular-nums" style={{ ...MONO, color: "var(--text-dim)" }}>
              {spanLabel(m)}
            </span>
            <GrainPill grain={m.grain} />
          </div>
        </div>
      </div>
      <p className="text-[12.5px] text-[var(--text-muted)] leading-snug">{m.blurb}</p>
      <div className="mt-auto pt-2.5 text-[11px] font-semibold" style={{ ...MONO, color: deep ? "var(--accent)" : "var(--text-dim)" }}>
        {deep ? `Open at ${year} →` : inRange ? "Open →" : `Starts ${m.from < 0 ? "9999 BC" : m.from} →`}
      </div>
    </Link>
  );
}

export default async function TimeMachineHub({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date().getUTCFullYear();
  const raw = parseInt(sp.year ?? "", 10);
  const year = Number.isFinite(raw)
    ? Math.min(now, Math.max(EARLIEST_AD, raw))
    : randomNotableYear().year;

  const cross = getYearCrossSection(year);
  const live = TIME_MACHINES.filter((m) => covers(m, year));
  const why = whyThisYear(year);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <span>The Time Machine</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2 flex items-center gap-2.5">
          <span aria-hidden>🕰️</span> The Time Machine
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-2xl">
          Pick a year. See who ran the world, who won, and what everyone was watching.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Pick a year", href: "#pick" },
          { label: "The world", href: "#world" },
          { label: "Sport", href: "#sport" },
          { label: "Culture", href: "#culture" },
          { label: "Money", href: "#money" },
          { label: "Play", href: "#play" },
          { label: "Banter", href: "#banter" },
        ]}
      />

      {/* ---- the year, and what it looked like ---- */}
      <section className="mb-10 rounded-2xl border p-4 sm:p-6" style={BORD} id="pick">
        <YearPicker year={year} min={EARLIEST_AD} max={now} notable={NOTABLE_YEARS} />

        <div className="mt-6 mb-3 flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-2xl font-bold tabular-nums" style={MONO}>{year}</h2>
          {why ? <span className="text-[14px] text-[var(--text-muted)]">{why}</span> : null}
          <span className="text-[11px] ml-auto" style={{ ...MONO, color: "var(--text-dim)" }}>
            {live.length}/{TIME_MACHINES.length} boards reach this year
          </span>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))" }}>
          {cross.strands.map((s) => (
            <div key={s.key} className="rounded-xl border p-3.5 min-w-0" style={CARD}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--text-dim)" }}>
                {s.label}
              </div>
              {s.absent ? (
                <>
                  <div className="text-[14px] font-semibold text-[var(--text-dim)]">Nothing here yet</div>
                  <div className="text-[11.5px] text-[var(--text-muted)] mt-1 leading-snug">{s.absent}</div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StrandIcon s={s} />
                    <div className="text-[16px] font-bold leading-tight min-w-0">{s.value}</div>
                  </div>
                  {s.detail ? (
                    <div className="text-[11.5px] text-[var(--text-muted)] mt-1.5 leading-snug">{s.detail}</div>
                  ) : null}
                  <Link href={s.href} className="inline-block text-[11px] mt-2 font-semibold" style={{ ...MONO, color: "var(--accent)" }}>
                    See more →
                  </Link>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---- what each board lets you ask for ---- */}
      <div className="mb-6 flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span className="uppercase tracking-widest text-[10px]" style={{ ...MONO, color: "var(--text-dim)" }}>
          Time slice
        </span>
        {GRAIN_ORDER.filter((g) => TIME_MACHINES.some((m) => m.grain === g)).map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5">
            <GrainPill grain={g} />
            <span className="text-[11px]">
              {GRAIN_META[g].note}
              <span className="tabular-nums" style={{ ...MONO, color: "var(--text-dim)" }}>
                {" "}({TIME_MACHINES.filter((m) => m.grain === g).length})
              </span>
            </span>
          </span>
        ))}
      </div>

      {/* ---- the boards ---- */}
      {DOMAIN_ORDER.map((domain) => {
        const items = TIME_MACHINES.filter((m) => m.domain === domain);
        if (!items.length) return null;
        return (
          <section key={domain} className="mb-9" id={DOMAIN_ID[domain]}>
            <h2 className="text-xl font-bold mb-3">{domain}</h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
              {items.map((m) => <MachineCard key={m.key} m={m} year={year} />)}
            </div>
          </section>
        );
      })}

      {/* ---- the banter engine ---- */}
      <section className="mb-9 rounded-2xl border p-5" style={BORD} id="banter">
        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
          <h2 className="text-xl font-bold flex items-center gap-2"><span aria-hidden>🍻</span> The Banter Engine</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ ...MONO, color: "var(--text-dim)", background: "var(--bg-card)" }}>
            PRIVATE BETA
          </span>
        </div>
        <p className="text-[14px] text-[var(--text-muted)] max-w-2xl mb-3">
          The time machine with a person in it. Pick a moment and talk to a local who only knows what was
          known then. Invented characters, real dated facts, and a tester key required for now.
        </p>
        <Link href="/banter" className="inline-flex items-center gap-1.5 rounded-lg border font-semibold text-sm px-4 py-2 hover:border-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
          Take a look <span aria-hidden>→</span>
        </Link>
      </section>

      {/* ---- how this works ---- */}
      <section className="rounded-2xl border p-5" style={BORD} id="how-it-works">
        <h2 className="text-lg font-bold mb-2">Where these come from</h2>
        <p className="text-[13px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
          The four panels are read live from the same files their own boards read, so this page cannot
          disagree with what it points at. The boards start in different centuries — power in 1500,
          population in 1800, champions in 1860, film in 1920 — and a panel outside its range says so
          rather than going blank. Four boards open directly on your chosen year; the rest open at their
          own default until they learn to read a year from the address bar.
        </p>
      </section>
    </main>
  );
}
