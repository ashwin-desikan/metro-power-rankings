import Link from "next/link";
import { getHeartbreak, longingLine, woundText } from "@/lib/heartbreak";

// Server component. The per-club Heartbreak section: where the club sits on
// the world board and inside its own sport, what it is waiting for, the clocks
// that drive the score, and the named pangs the ledger prices for it. Returns
// null for any club the index does not score, so every league's team page can
// render it unconditionally.
//
// Deliberately shows the SHAPE of the score, not a full audit: the board and
// its methodology own the arithmetic, this answers "why is my club here".

const CARD = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function Stat({ v, k, hint }: { v: string; k: string; hint?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 min-w-0" style={CARD} title={hint}>
      <div className="text-[19px] font-extrabold leading-tight" style={MONO}>{v}</div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-muted)]">{k}</div>
    </div>
  );
}

export default function HeartbreakPanel({
  league,
  slug,
  className = "",
}: {
  league: string;
  slug: string;
  className?: string;
}) {
  const h = getHeartbreak(league, slug);
  if (!h) return null;

  const clocks = h.longing.slice(0, 3);
  const wounds = h.wounds.filter((w) => w.kind !== "agony_event").slice(0, 4);

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${className}`} style={CARD} id="heartbreak">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-xl font-bold">
          <Link href="/sports/heartbreak" className="hover:text-[var(--accent)] transition-colors">
            The Heartbreak Index
          </Link>
        </h2>
        <p className="text-[12px] text-[var(--text-muted)]">
          {h.quadrant ? `${h.quadrant} · ` : ""}
          {longingLine(h)}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <Stat v={h.total.toFixed(1)} k="Heartbreak" hint="Agony plus despair, on the published scale" />
        <Stat v={`#${h.rank}`} k={`of ${h.outOf.toLocaleString()} clubs`} />
        <Stat v={`#${h.sportRank}`} k={`in ${h.sport}`} />
        <Stat
          v={h.agony.toFixed(1)}
          k={h.despair > 0 ? `agony · ${h.despair.toFixed(1)} despair` : "agony"}
          hint="Agony is hope crushed; despair is hopelessness, the grind of exile from the top flight"
        />
      </div>

      {clocks.length > 0 && (
        <div className="mb-3">
          <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            The clocks
          </div>
          <ul className="text-[13.5px] space-y-1">
            {clocks.map((l) => (
              <li key={`${l.honour}-${l.since}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  {l.honour === "league" ? "League title" : l.honour[0].toUpperCase() + l.honour.slice(1)}
                  <span className="text-[var(--text-muted)]"> since {l.since}</span>
                </span>
                <span className="text-[var(--text-muted)] shrink-0" style={MONO}>
                  {l.points.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {h.pangs.length > 0 && (
        <div className="mb-3">
          <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Priced pangs
          </div>
          <ul className="text-[13.5px] space-y-1.5">
            {h.pangs.map((p) => (
              <li key={`${p.year}-${p.name}`}>
                <span className="font-semibold">{p.name}</span>
                <span className="text-[var(--text-muted)]"> · {p.year} · {p.pangs.toFixed(2)} pangs</span>
                {p.note && (
                  <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">{p.note}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {wounds.length > 0 && (
        <div className="mb-3">
          <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Heaviest wounds
          </div>
          <p className="text-[13.5px] text-[var(--text-muted)]">
            {wounds.map((w) => woundText(w)).join(" · ")}
          </p>
        </div>
      )}

      <p className="text-[12px] text-[var(--text-muted)]">
        One formula, every club the site covers.{" "}
        <Link href="/sports/heartbreak" className="hover:text-[var(--accent)] transition-colors underline">
          See the whole board →
        </Link>
      </p>
    </section>
  );
}
